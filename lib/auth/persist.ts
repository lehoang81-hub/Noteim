/**
 * Ghi người dùng vào DB khi đăng nhập — PR 01 (đặc tả C1 §1.1, §1.4).
 *
 * Chiến lược: chiến lược phiên là JWT nên không cần adapter next-auth;
 * chỉ ở lần đăng nhập (jwt callback gọi khi có `user` + `account`) thì
 * upsert `users` theo email và nối `accounts`, trả về `users.id` để
 * đưa vào `token.sub`. Mọi request sau không chạm DB (đúng §1.1 —
 * "ít truy vấn mỗi request").
 *
 * Chế độ thử nghiệm `AUTH_FAKE=1` (như `GAP_CHECK_FAKE=1`): nhà cung
 * cấp credentials cố định trả người dùng demo — e2e đăng nhập/đăng
 * xuất chạy không cần khóa Google và không cần DB.
 */
import { eq, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/lib/db";
import { accounts, users } from "@/lib/db/schema";

/** Người dùng demo của chế độ AUTH_FAKE (chỉ dùng cho e2e). */
export const FAKE_USER_ID = "11111111-1111-4111-8111-111111111111";
export const FAKE_USER_EMAIL = "demo@noteim.app";

type SignInUser = { id?: string | null; name?: string | null; email?: string | null };
type SignInAccount = { provider: string; providerAccountId: string; type?: string };

/**
 * Trả về `users.id` cho phiên. Ném lỗi khi DB bắt buộc nhưng không ghi
 * được (đăng nhập thật phải có dòng users — nếu không mọi dữ liệu về
 * sau mất chủ; người dùng thấy trang lỗi đăng nhập, chế độ ẩn danh
 * không bị ảnh hưởng).
 */
export async function ensureUserAndAccount(
  user: SignInUser,
  account: SignInAccount,
): Promise<string | null> {
  // Chế độ giả: không đụng DB, trả id cố định cho e2e.
  // (credentials provider có type "credentials"; id provider là "demo".)
  if (
    process.env.AUTH_FAKE === "1" &&
    process.env.VERCEL_ENV !== "production" &&
    account.type === "credentials"
  ) {
    return FAKE_USER_ID;
  }

  const email = user.email?.toLowerCase();
  if (!email) return null; // Google luôn trả email; thiếu coi như từ chối đăng nhập

  const displayName =
    typeof user.name === "string" && user.name.length > 0 ? user.name : null;

  const db = getDb();

  // Ghép thêm theo email (điểm chốt số 7 áp dụng cho di trú; ở đây
  // người dùng trùng email là một người — upsert giữ bản hiện có).
  const [row] = await db
    .insert(users)
    .values({
      email,
      displayName,
      plan: "free",
      uiLanguage: "vi",
      theme: "system",
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        // Giữ tên người dùng đã tự đặt trong app; chỉ lấy tên Google khi còn trống.
        displayName: sql`coalesce(${users.displayName}, excluded.display_name)`,
        updatedAt: new Date(),
      },
    })
    .returning({ id: users.id });

  await db
    .insert(accounts)
    .values({
      userId: row.id,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      type: account.type ?? "oauth",
    })
    .onConflictDoNothing({
      target: [accounts.provider, accounts.providerAccountId],
    });

  return row.id;
}

/** Đọc người dùng theo id — dùng cho hook phiên phía máy chủ. */
export async function getUserById(id: string) {
  if (!isDatabaseConfigured()) return null;
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}


