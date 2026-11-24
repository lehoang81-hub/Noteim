/**
 * C1-04 yêu cầu 5 — cron xóa băng hết hạn (chạy hằng ngày qua Vercel Crons,
 * khai báo trong vercel.json).
 *
 * Quét các buổi `storage_status = 'full'` có băng trên R2 (audio_path dạng
 * u/…) mà `audio_expires_at` đã quá hạn: DeleteObject trên R2 rồi đặt
 * `storage_status = 'essence_only'` — GIỮ NGUYÊN bản chữ (transcript, tóm
 * tắt, biên bản, việc cần làm). R2 Lifecycle là lưới an toàn thêm một lớp.
 *
 * Bảo vệ: header `Authorization: Bearer ${CRON_SECRET}` bắt buộc khi đặt
 * CRON_SECRET; production thiếu CRON_SECRET thì từ chối luôn (không chạy
 * máy dọn đập trộm).
 */
import { and, isNotNull, like, lt, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { deleteObjectSafe, isAudioObjectKey, r2Mode } from "@/lib/data/server/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authorized = secret
    ? (request.headers.get("authorization") ?? "") === `Bearer ${secret}`
    : process.env.VERCEL_ENV !== "production";
  if (!authorized) {
    return Response.json({ error: "unauthorized", message: "Thiếu hoặc sai CRON_SECRET" }, { status: 401 });
  }
  if (r2Mode() === null) {
    return Response.json({ error: "storage_not_configured", message: "Chưa cấu hình kho R2" }, { status: 503 });
  }

  const db = getDb();
  const due = await db
    .select({ id: sessions.id, audioPath: sessions.audioPath })
    .from(sessions)
    .where(
      and(
        eq(sessions.storageStatus, "full"),
        isNotNull(sessions.audioExpiresAt),
        lt(sessions.audioExpiresAt, new Date()),
        like(sessions.audioPath, "u/%"),
      ),
    );

  let swept = 0;
  let failed = 0;
  for (const row of due) {
    try {
      if (row.audioPath !== null && isAudioObjectKey(row.audioPath)) {
        await deleteObjectSafe(row.audioPath);
      }
      await db
        .update(sessions)
        .set({ storageStatus: "essence_only", audioPath: null, audioExpiresAt: null, sizeBytes: 0 })
        .where(eq(sessions.id, row.id));
      swept += 1;
    } catch {
      failed += 1; // không ghi chi tiết — tránh lộ dữ liệu
    }
  }

  return Response.json({ swept, failed, checked: due.length });
}
