/**
 * Nhóm (b) — chi tiết buổi (C1-03b). GET trả chi tiết theo PHIÊN (buổi người
 * khác → 403; buổi mẫu chưa nhập → nội dung demo tĩnh chỉ xem). PATCH sửa
 * tiêu đề/mẫu/người tham gia/hạn băng. DELETE là xóa mềm còn "Hoàn tác".
 */
import { z } from "zod";

import { routeHandler, requireContext } from "@/lib/data/server/context";
import { getSessionDetail, removeSession, updateSession } from "@/lib/data/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    title: z.string().max(300).optional(),
    template_id: z.string().optional(),
    participant_contact_ids: z.array(z.string()).max(50).optional(),
    audio_expires_at: z.string().nullable().optional(),
  })
  .strict();

type Params = { params: Promise<{ id: string }> };

export const GET = routeHandler(async (_request: Request, { params }: Params) => {
  const ctx = await requireContext();
  const { id } = await params;
  const detail = await getSessionDetail(ctx, id);
  return Response.json({ detail });
});

export const PATCH = routeHandler(async (request: Request, { params }: Params) => {
  const ctx = await requireContext();
  const { id } = await params;
  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "bad_request", message: "Thân yêu cầu không đúng cấu trúc" }, { status: 400 });
  }
  await updateSession(ctx, id, body);
  return Response.json({ ok: true });
});

export const DELETE = routeHandler(async (_request: Request, { params }: Params) => {
  const ctx = await requireContext();
  const { id } = await params;
  await removeSession(ctx, id);
  return Response.json({ ok: true });
});
