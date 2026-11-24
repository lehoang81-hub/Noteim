/**
 * Nhóm (b) — Hỏi AI của buổi (M3-03, C1-03b). GET lịch sử; POST hỏi — máy
 * chủ trả câu trả lời (chưa nối AI thật, trả lời cố định không bịa nội dung),
 * client tự chạy chữ dần. Lịch sử lưu bảng chat_messages.
 */
import { z } from "zod";

import { routeHandler, requireContext } from "@/lib/data/server/context";
import { chatAsk, chatHistory } from "@/lib/data/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = routeHandler(async (_request: Request, { params }: Params) => {
  const ctx = await requireContext();
  const { id } = await params;
  const messages = await chatHistory(ctx, id);
  return Response.json({ messages });
});

const postSchema = z.object({ question: z.string().min(1).max(1000) }).strict();

export const POST = routeHandler(async (request: Request, { params }: Params) => {
  const ctx = await requireContext();
  const { id } = await params;
  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "bad_request", message: "Cần câu hỏi" }, { status: 400 });
  }
  const message = await chatAsk(ctx, id, body.question);
  return Response.json({ message });
});
