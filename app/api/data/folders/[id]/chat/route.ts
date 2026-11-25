/**
 * Nhóm (c) — Hỏi AI của thư mục (GY1, C1-03b; C1-08 nối AI thật). GET lịch
 * sử; POST hỏi — máy chủ gọi Gemini với ngữ cảnh các buổi trong thư mục
 * (gói Free trả 429 quota_exceeded như cũ), trả lời theo ngôn ngữ giao diện
 * kèm dẫn nguồn mốc giây; lưu lịch sử bảng folder_chat_messages.
 * maxDuration 60 cho lần gọi AI dài.
 */
import { z } from "zod";

import { routeHandler, requireContext } from "@/lib/data/server/context";
import { folderAsk, folderHistory } from "@/lib/data/server/folders";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = routeHandler(async (_request: Request, { params }: Params) => {
  const ctx = await requireContext();
  const { id } = await params;
  const messages = await folderHistory(ctx, id);
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
  const message = await folderAsk(ctx, id, body.question);
  return Response.json({ message });
});
