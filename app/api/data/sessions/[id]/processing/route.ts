/**
 * Nhóm (b) — trạng thái xử lý buổi ghi mới (C1-03b). GET trả bước hiện tại
 * và tự hoàn tất khi đến hạn (máy serverless không có bộ đếm chạy nền —
 * hoàn tất lười khi có người hỏi, giống tiến trình của bản giả). POST chạy
 * lại khi xử lý lỗi.
 */
import { z } from "zod";

import { routeHandler, requireContext } from "@/lib/data/server/context";
import { getProcessingState, retryProcessing } from "@/lib/data/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = routeHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireContext();
  const { id } = await params;
  const state = await getProcessingState(ctx, id);
  return Response.json(state);
});

const postSchema = z.object({ action: z.literal("retry") }).strict();

export const POST = routeHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireContext();
  const { id } = await params;
  try {
    postSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "bad_request", message: "Cần action: retry" }, { status: 400 });
  }
  await retryProcessing(ctx, id);
  return Response.json({ ok: true });
});
