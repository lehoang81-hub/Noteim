/**
 * Ngữ cảnh máy chủ cho nguồn dữ liệu remote (C1-03b, docs/04 mục "Bổ sung C1").
 *
 * Nguyên tắc bắt buộc (yêu cầu của Hoang cho PR 03b):
 * - Mọi truy vấn lọc theo user_id/workspace_id lấy từ PHIÊN
 *   (`getServerSession`), không bao giờ tin id do client gửi.
 * - Quyền kiểm ở máy chủ: thiếu phiên → 401, có phiên nhưng không phải chủ
 *   dữ liệu → 403, không thấy dữ liệu → 404.
 * - Không ghi log chứa nội dung buổi họp hay email (chỉ ghi mã lỗi sự kiện).
 */
import { and, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/nextauth-options";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { users, workspaceMembers, workspaces } from "@/lib/db/schema";

import { DataError } from "../errors";

type SessionUser = { id?: string | null; email?: string | null; name?: string | null };

export type ServerContext = {
  userId: string;
  email: string;
  /** Không gian Cá nhân của người dùng — nơi buổi/thư mục/liên hệ gắn vào. */
  workspaceId: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lỗi API có mã máy + thông điệp ngắn, không mang nội dung người dùng. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ApiError";
  }
}

/** DataErrorCode → mã HTTP đúng luật 401/403/404/429. */
export function statusOfDataError(error: DataError): number {
  switch (error.code) {
    case "not_found":
      return 404;
    case "forbidden":
      return 403;
    case "quota_exceeded":
      return 429;
    default:
      return 500;
  }
}

/**
 * Yêu cầu phiên đăng nhập hợp lệ và người dùng đã có trong DB.
 * Ném ApiError 401 khi không có phiên, 503 khi chưa cấu hình DATABASE_URL
 * (nguồn remote không chạy được; người ẩn danh vẫn dùng mock không bị ảnh hưởng).
 */
export async function requireContext(): Promise<ServerContext> {
  const session = await getServerSession(authOptions);
  const sessionUser: SessionUser | null = session?.user ?? null;
  const userId = sessionUser?.id ?? null;
  if (!userId || !UUID_RE.test(userId)) {
    throw new ApiError(401, "unauthorized", "Cần đăng nhập để dùng dữ liệu tài khoản");
  }
  if (!isDatabaseConfigured()) {
    throw new ApiError(503, "db_not_configured", "Máy chủ chưa cấu hình DATABASE_URL");
  }
  return ensureUserWorkspace(userId, sessionUser?.email ?? "");
}

/**
 * Bảo đảm người dùng có dòng `users`, một không gian Cá nhân (kind
 * "personal") và dòng thành viên Chủ — tự tạo đúng một lần khi lần đầu gọi
 * API dữ liệu sau đăng nhập (yêu cầu nhóm (a) của PR 03b).
 *
 * Đăng nhập Google đã ghi `users` + `accounts` ở jwt callback
 * (lib/auth/persist.ts); người dùng thử của e2e (AUTH_FAKE) chỉ có id cố
 * định trong phiên nên ở đây chèn dòng users với id đó. Chạy lại an toàn
 * (ON CONFLICT DO NOTHING rồi đọc lại).
 */
export async function ensureUserWorkspace(userId: string, email: string): Promise<ServerContext> {
  const db = getDb();

  let user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user) {
    const cleanEmail = (email || `user-${userId.slice(0, 8)}@noteim.local`).toLowerCase();
    await db
      .insert(users)
      .values({ id: userId, email: cleanEmail, plan: "free", uiLanguage: "vi", theme: "system" })
      .onConflictDoNothing({ target: users.email });
    user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!user) {
      // Email trùng với người dùng khác: không tự ghép tài khoản — từ chối rõ ràng
      throw new ApiError(403, "email_taken", "Email này đã dùng cho tài khoản khác");
    }
  }

  let ws = (
    await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.ownerUserId, userId), eq(workspaces.kind, "personal")))
      .limit(1)
  )[0];
  if (!ws) {
    const id = `w-${userId.slice(0, 8)}`;
    await db
      .insert(workspaces)
      .values({ id, kind: "personal", name: "", ownerUserId: userId, plan: user.plan })
      .onConflictDoNothing({ target: workspaces.id });
    ws = (await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1))[0];
    if (!ws) {
      // Trượt id (hiếm): tìm lại theo chủ
      ws = (
        await db
          .select()
          .from(workspaces)
          .where(and(eq(workspaces.ownerUserId, userId), eq(workspaces.kind, "personal")))
          .limit(1)
      )[0];
    }
    if (!ws) throw new ApiError(500, "workspace_create_failed", "Chưa tạo được không gian Cá nhân");
    await db
      .insert(workspaceMembers)
      .values({
        workspaceId: ws.id,
        userId,
        email: user.email,
        displayName: user.displayName ?? "",
        role: "owner",
        status: "active",
      })
      .onConflictDoNothing();
  }

  if (user.currentWorkspaceId !== ws.id) {
    await db.update(users).set({ currentWorkspaceId: ws.id, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  return { userId, email: user.email, workspaceId: ws.id };
}

/** Bọc handler route: ApiError/DataError → JSON { error, message } đúng mã; lỗi lạ → 500. */
export function routeHandler<A extends unknown[]>(fn: (...args: A) => Promise<Response>): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return Response.json({ error: error.code, message: error.message }, { status: error.status });
      }
      if (error instanceof DataError) {
        return Response.json({ error: error.code, message: error.message }, { status: statusOfDataError(error) });
      }
      // Không ghi nội dung lỗi có thể chứa dữ liệu người dùng; chỉ ghi thông điệp ngắn
      const brief = error instanceof Error ? error.message : "unknown";
      console.error("[data-api] lỗi không phân loại:", brief.slice(0, 160));
      return Response.json({ error: "server", message: "Lỗi máy chủ, thử lại" }, { status: 500 });
    }
  };
}
