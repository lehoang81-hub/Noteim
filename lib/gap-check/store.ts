// GC-02 (b4/gc-02-api) — "Bảng" SessionGapCheck, C1-03b (e): chuyển lịch sử
// rà thiếu của người ĐÃ đăng nhập từ Map bộ nhớ sang bảng `session_gap_checks`
// (bắt buộc trên serverless nhiều instance — dữ liệu sống theo từng instance
// thì lịch sử tụt mất khi request rơi vào instance khác).
//
// Quy tắc chọn kho:
// - Người ĐÃ đăng nhập chạy chế độ remote (NEXT_PUBLIC_DATA_SOURCE=server
//   env) và buổi thuộc người dùng của PHIÊN → bảng session_gap_checks (giữ
//   đúng 10 dòng/buổi bằng trigger `noteim_gap_check_max10` của migration).
// - Buổi tồn tại trong DB nhưng KHÔNG thuộc người dùng hiện tại → ném
//   DataError "forbidden" (403) — không đọc, không ghi.
// - Người ẩn danh và mọi buổi không có trong DB (buổi mock trên máy, buổi
//   mẫu chưa nhập) → giữ Map bộ nhớ như cũ: hạn mức ẩn danh theo mã khách,
//   lịch sử theo tiến trình, đủ cho kịch bản hiện có (gc-*).
//
// Không log nội dung transcript/kết quả rà (dữ liệu nhạy cảm, §5).

import { and, asc, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/nextauth-options";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { sessionGapChecks, sessions } from "@/lib/db/schema";
import { DataError } from "@/lib/data/errors";

import type { GapCheckResult, SessionGapCheckRow } from "./types";

/** Đặc tả §3: history giữ tối đa 10 lần rà/buổi (Map dùng slice, DB dùng trigger). */
export const MAX_HISTORY_PER_SESSION = 10;

/** Kiểm quyền đọc/ghi lịch sử rà của buổi TRƯỚC khi làm việc tốn lượt hay
 * tốn tiền AI — ném DataError "forbidden" nếu buổi tồn tại trong DB nhưng
 * là của người khác; ẩn danh và buổi mock không ném (kho Map như cũ). */
export async function assertSessionAccess(sessionId: string): Promise<void> {
  await storeKind(sessionId);
}

const table = new Map<string, SessionGapCheckRow[]>();

type StoreKind = "db" | "memory" | "forbidden";

/** Chọn kho cho sessionId theo PHIÊN; không bao giờ tin id do client gửi ngoài việc tra quyền. */
async function storeKind(sessionId: string): Promise<Exclude<StoreKind, "forbidden">> {
  if (process.env.NEXT_PUBLIC_DATA_SOURCE !== "remote" || !isDatabaseConfigured()) return "memory";
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return "memory"; // ẩn danh: luôn Map, kể cả khi id trùng buổi seed
  const row = (await getDb().select().from(sessions).where(eq(sessions.id, sessionId)).limit(1))[0];
  if (!row) return "memory"; // buổi mock trên máy / buổi mẫu chưa nhập vào tài khoản
  if (row.userId !== userId) throw new DataError("forbidden", "Không có quyền với buổi ghi này");
  return "db";
}

function rowToSessionGapCheck(row: typeof sessionGapChecks.$inferSelect): SessionGapCheckRow {
  return {
    id: row.id,
    sessionId: row.sessionId,
    templateId: row.templateId,
    checkedAt: row.checkedAt.toISOString(),
    transcriptUntilMs: row.transcriptUntilMs,
    resultJson: typeof row.resultJson === "string" ? row.resultJson : JSON.stringify(row.resultJson),
  };
}

export async function addSessionGapCheck(input: {
  sessionId: string;
  templateId: string;
  transcriptUntilMs: number;
  result: GapCheckResult;
}): Promise<SessionGapCheckRow> {
  const kind = await storeKind(input.sessionId);
  if (kind === "db") {
    const db = getDb();
    const [row] = await db
      .insert(sessionGapChecks)
      .values({
        sessionId: input.sessionId,
        templateId: input.templateId,
        transcriptUntilMs: input.transcriptUntilMs,
        resultJson: JSON.stringify(input.result),
      })
      .returning();
    return rowToSessionGapCheck(row);
  }
  const row: SessionGapCheckRow = {
    id: crypto.randomUUID(),
    sessionId: input.sessionId,
    templateId: input.templateId,
    checkedAt: new Date().toISOString(),
    transcriptUntilMs: input.transcriptUntilMs,
    resultJson: JSON.stringify(input.result),
  };
  const rows = table.get(input.sessionId) ?? [];
  rows.push(row);
  table.set(input.sessionId, rows.slice(-MAX_HISTORY_PER_SESSION));
  return row;
}

export async function listSessionGapChecks(sessionId: string): Promise<SessionGapCheckRow[]> {
  const kind = await storeKind(sessionId);
  if (kind === "db") {
    const rows = await getDb()
      .select()
      .from(sessionGapChecks)
      .where(eq(sessionGapChecks.sessionId, sessionId))
      .orderBy(asc(sessionGapChecks.checkedAt));
    return rows.map(rowToSessionGapCheck);
  }
  return [...(table.get(sessionId) ?? [])];
}

function safeParseResult(row: SessionGapCheckRow): GapCheckResult | null {
  try {
    return JSON.parse(row.resultJson) as GapCheckResult;
  } catch {
    return null;
  }
}

/** Kết quả gần nhất (nguồn cho checklist "Cần bổ sung sau buổi" — đặc tả §3). */
export async function getLatestSessionGapCheck(sessionId: string): Promise<SessionGapCheckRow | null> {
  const rows = await listSessionGapChecks(sessionId);
  return rows.at(-1) ?? null;
}

export async function getLatestGapCheckResult(sessionId: string): Promise<GapCheckResult | null> {
  const latest = await getLatestSessionGapCheck(sessionId);
  return latest ? safeParseResult(latest) : null;
}

// Ràng buộc dùng lại ở nơi khác (ví dụ kiểm thủ công DB): đếm lịch sử của một buổi
export async function countSessionGapChecks(sessionId: string): Promise<number> {
  if (process.env.NEXT_PUBLIC_DATA_SOURCE !== "remote" || !isDatabaseConfigured()) {
    return (table.get(sessionId) ?? []).length;
  }
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return 0;
  const rows = await getDb()
    .select({ id: sessionGapChecks.id })
    .from(sessionGapChecks)
    .innerJoin(sessions, eq(sessions.id, sessionGapChecks.sessionId))
    .where(and(eq(sessionGapChecks.sessionId, sessionId), eq(sessions.userId, userId)));
  return rows.length;
}
