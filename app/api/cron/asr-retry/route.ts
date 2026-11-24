/**
 * C1-05 yêu cầu 3 — cron đẩy tiếp buổi xử lý nội dung thật bị KẸT.
 *
 * Máy chủless không có bộ đếm nền: nếu người dùng đóng tab sau khi chốt băng
 * và không ai gọi process nữa thì buổi kẹt ở stage đang dở (queued/
 * transcribing/summarizing). Cron hằng 10 phút quét các buổi có
 * `asr_updated_at` cũ quá 10 phút, với mỗi buổi đẩy ĐỘNG MỘT bước
 * (driveProcess — có nhường quyền, an toàn khi cron và người dùng gọi trùng).
 *
 * Bảo vệ: header `Authorization: Bearer ${CRON_SECRET}` bắt buộc khi đặt
 * CRON_SECRET; production thiếu CRON_SECRET thì từ chối luôn (giống cron
 * dọn băng của PR 04).
 *
 * Nhật ký: chỉ ghi số buổi quét/đẩy, không ghi nội dung.
 */
import { and, inArray, isNotNull, lt, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { driveProcess, MAX_ATTEMPTS, STUCK_AFTER_MS } from "@/lib/data/server/asr-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Trần số buổi mỗi lượt cron — giữ thời gian hàm ngắn. */
const BATCH_LIMIT = 20;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authorized = secret
    ? (request.headers.get("authorization") ?? "") === `Bearer ${secret}`
    : process.env.VERCEL_ENV !== "production";
  if (!authorized) {
    return Response.json({ error: "unauthorized", message: "Thiếu hoặc sai CRON_SECRET" }, { status: 401 });
  }

  const db = getDb();
  const stuck = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        inArray(sessions.asrStage, ["queued", "transcribing", "summarizing"]),
        isNotNull(sessions.audioPath),
        sql`${sessions.audioPath} LIKE 'u/%'`,
        isNotNull(sessions.asrUpdatedAt),
        lt(sessions.asrUpdatedAt, new Date(Date.now() - STUCK_AFTER_MS)),
        sql`${sessions.asrAttempts} < ${MAX_ATTEMPTS}`,
        sql`${sessions.deletedAt} IS NULL`,
      ),
    )
    .limit(BATCH_LIMIT);

  let pushed = 0;
  let done = 0;
  let failed = 0;
  for (const row of stuck) {
    const state = await driveProcess(row.id);
    if (!state) continue;
    pushed += 1;
    if (state.status === "ready") done += 1;
    if (state.status === "failed") failed += 1;
  }

  return Response.json({ checked: stuck.length, pushed, done, failed });
}
