/**
 * Nhóm (b) — bản tóm tắt theo ngôn ngữ (M6-03, C1-03b). GET đọc bản gốc
 * hoặc bản đã có; POST tạo (hoặc dịch lại) bản theo ngôn ngữ — gói Free chỉ
 * 1 bản thêm mỗi buổi, vượt hạn mức trả 429 quota_exceeded.
 */
import { z } from "zod";

import { routeHandler, requireContext } from "@/lib/data/server/context";
import { createSummaryVersion, getSummary } from "@/lib/data/server/sessions";
import { Lang } from "@/lib/data/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = routeHandler(async (request: Request, { params }: Params) => {
  const ctx = await requireContext();
  const { id } = await params;
  const lang = new URL(request.url).searchParams.get("lang");
  if (!lang || !["vi", "en", "ko"].includes(lang)) {
    return Response.json({ error: "bad_request", message: "Cần lang=vi|en|ko" }, { status: 400 });
  }
  const version = await getSummary(ctx, id, lang as Lang);
  return Response.json({ version });
});

const postSchema = z.object({ lang: Lang }).strict();

export const POST = routeHandler(async (request: Request, { params }: Params) => {
  const ctx = await requireContext();
  const { id } = await params;
  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "bad_request", message: "Cần lang" }, { status: 400 });
  }
  const version = await createSummaryVersion(ctx, id, body.lang);
  return Response.json({ version });
});
