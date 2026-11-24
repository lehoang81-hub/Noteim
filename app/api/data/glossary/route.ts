/** Nhóm (d) — từ điển tên riêng (C1-03b): danh sách và thêm từ (trùng trả từ cũ). */
import { z } from "zod";

import { routeHandler, requireContext } from "@/lib/data/server/context";
import { addTerm, listTerms } from "@/lib/data/server/glossary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = routeHandler(async () => {
  const ctx = await requireContext();
  const terms = await listTerms(ctx);
  return Response.json({ terms });
});

const postSchema = z.object({ term: z.string().min(1).max(300) }).strict();

export const POST = routeHandler(async (request: Request) => {
  const ctx = await requireContext();
  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "bad_request", message: "Cần từ cần thêm" }, { status: 400 });
  }
  const term = await addTerm(ctx, body.term);
  return Response.json({ term });
});
