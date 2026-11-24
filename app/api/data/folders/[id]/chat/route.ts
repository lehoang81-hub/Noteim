/**
 * Nhóm (c) — Hỏi AI của thư mục (GY1, C1-03b). GET lịch sử; POST hỏi — máy
 * chủ ghép câu trả lời từ các buổi trong thư mục (lọc theo PHIÊN, gói Free
 * trả 429 quota_exceeded), lưu lịch sử bảng folder_chat_messages.
 */
import { z } from "zod";

import { routeHandler, requireContext } from "@/lib/data/server/context";
import { folderAsk, folderHistory } from "@/lib/data/server/folders";

export const runtime = "nodejs";
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
