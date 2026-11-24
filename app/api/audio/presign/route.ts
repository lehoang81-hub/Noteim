/**
 * C1-04 yêu cầu 2b — Presigned Upload URL cho băng ghi âm.
 *
 * Trình duyệt PUT thẳng lên R2 (không đi qua API Route — trần thân yêu cầu
 * ~4,5 MB của Vercel). Máy chủ kiểm:
 * - phiên đăng nhập (401) và quyền CHỦ buổi (403 — người B không xin được URL
 *   tải lên của người A; thành viên nhóm cũng không ghi hộ được băng);
 * - loại file trong danh sách cho phép (400) — audio/mp4, audio/webm,
 *   audio/ogg, audio/mpeg, audio/wav;
 * - trần dung lượng theo gói (413) — Free 90 phút/buổi;
 * - buổi mẫu không nhận tải lên (403) — băng của buổi mẫu là file tĩnh.
 *
 * Khóa đối tượng do máy chủ đặt: u/{userId}/{sessionId}/original.{ext};
 * URL PUT sống 10 phút. Không log khóa có ký hay nội dung buổi.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { routeHandler, requireContext } from "@/lib/data/server/context";
import {
  audioKeyFor,
  byteCeilingForPlan,
  isR2Available,
  minuteCapForPlan,
  normalizeAudioMime,
  presignPutUrl,
} from "@/lib/data/server/r2";
import { getOwnedSessionRow } from "@/lib/data/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    session_id: z.string().min(1).max(200),
    content_type: z.string().min(1).max(120),
    size: z.number().int().min(0),
  })
  .strict();

export const POST = routeHandler(async (request: Request) => {
  const ctx = await requireContext();
  const db = getDb();
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

  const planRow = (await db.select({ plan: users.plan }).from(users).where(eq(users.id, ctx.userId)).limit(1))[0];
  const plan = planRow?.plan ?? "free";

  if (body.size > byteCeilingForPlan(plan)) {
    return Response.json({ error: "too_large", message: "File vượt trần dung lượng của gói" }, { status: 413 });
  }
  if (session.durationSec > minuteCapForPlan(plan) * 60) {
    return Response.json({ error: "too_long", message: "Buổi vượt trần thời lượng của gói" }, { status: 413 });
  }

  const key = audioKeyFor(ctx.userId, body.session_id, mime);
  const uploadUrl = await presignPutUrl(key, mime);
  return Response.json({ upload_url: uploadUrl, key, method: "PUT", expires_in: 600 });
});
