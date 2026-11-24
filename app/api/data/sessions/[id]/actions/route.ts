/**
 * Nhóm (b) — các thao tác nhỏ trên buổi (C1-03b): sửa ý tóm tắt, sửa bản ghi
 * lời, đổi người nói, ghi chú nhanh, checklist bổ sung, câu hỏi chờ, dịch,
 * đặt tên/gộp người nói, nhật ký xuất. Một điểm gom để quyền kiểm một nơi:
 * mọi hành động đều qua getOwnedSessionRow (PHIÊN, không tin client).
 */
import { z } from "zod";

import { routeHandler, requireContext } from "@/lib/data/server/context";
import { applySessionAction } from "@/lib/data/server/sessions";
import { sessionActionSchema } from "@/lib/data/session-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = routeHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireContext();
  const { id } = await params;
  let body: z.infer<typeof sessionActionSchema>;
  try {
    body = sessionActionSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "bad_request", message: "Thân yêu cầu không đúng cấu trúc" }, { status: 400 });
  }
  const result = await applySessionAction(ctx, id, body);
  return Response.json(result ?? { ok: true });
});
