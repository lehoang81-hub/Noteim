/**
 * C1-04 yêu cầu 2d — chốt băng đã tải lên.
 *
 * Client PUT thẳng lên R2 xong gọi đây để máy chủ:
 * 1. HEAD đối tượng theo khóa máy chủ đặt (client không gửi khóa);
 * 2. so kích thước với số client báo nếu có — lệch là từ chối (409);
 * 3. ghi audio_path + size_bytes + storage_status + audio_expires_at theo gói
 *    (Free 90 ngày, Pro 12 tháng — §1.5) và gỡ nhãn "Bản ghi thử".
 *
 * Chỉ khi route này thành công buổi mới có băng nghe lại; băng chưa chốt thì
 * buổi vẫn là "Bản ghi thử: chưa lưu âm thanh".
 */
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { routeHandler, requireContext } from "@/lib/data/server/context";
import {
  audioExpiryDaysForPlan,
  audioKeyFor,
  headObjectSize,
  isR2Available,
  normalizeAudioMime,
} from "@/lib/data/server/r2";
import { getOwnedSessionRow } from "@/lib/data/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    session_id: z.string().min(1).max(200),
    content_type: z.string().min(1).max(120),
    size: z.number().int().min(0).optional(),
  })
  .strict();

export const POST = routeHandler(async (request: Request) => {
  const ctx = await requireContext();
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "bad_request", message: "Thân yêu cầu không đúng cấu trúc" }, { status: 400 });
  }

  if (!isR2Available()) {
    return Response.json(
      { error: "storage_not_configured", message: "Máy chủ chưa cấu hình kho R2 cho băng ghi âm" },
      { status: 503 },
    );
  }

  const session = await getOwnedSessionRow(ctx, body.session_id);
  if (session.isSample) {
    return Response.json({ error: "forbidden", message: "Buổi mẫu không nhận băng tải lên" }, { status: 403 });
  }

  const mime = normalizeAudioMime(body.content_type);
  if (!mime) {
    return Response.json(
      { error: "unsupported_media_type", message: "Loại file không nằm trong danh sách cho phép" },
      { status: 400 },
    );
  }

  const db = getDb();
  const key = audioKeyFor(ctx.userId, body.session_id, mime);
  const stored = await headObjectSize(key);
  if (stored === null) {
    return Response.json(
      { error: "upload_missing", message: "Chưa thấy băng trên kho — hãy tải lên trước" },
      { status: 409 },
    );
  }
  if (body.size !== undefined && body.size !== stored) {
    return Response.json(
      { error: "size_mismatch", message: "Kích thước băng trên kho không khớp" },
      { status: 409 },
    );
  }

  const planRow = (await db.select({ plan: users.plan }).from(users).where(eq(users.id, ctx.userId)).limit(1))[0];
  const expiry = new Date(Date.now() + audioExpiryDaysForPlan(planRow?.plan ?? "free") * 86_400_000);

  await db
    .update(sessions)
    .set({
      audioPath: key,
      sizeBytes: stored,
      storageStatus: "full",
      trialRecording: false,
      audioExpiresAt: expiry,
    })
    .where(eq(sessions.id, body.session_id));

  return Response.json({ ok: true, key, size_bytes: stored, audio_expires_at: expiry.toISOString() });
});
