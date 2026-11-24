/** Nhóm (d) — một từ trong từ điển (C1-03b): sửa, xóa. */
import { z } from "zod";

import { routeHandler, requireContext } from "@/lib/data/server/context";
import { removeTerm, updateTerm } from "@/lib/data/server/glossary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({ term: z.string().min(1).max(300) }).strict();

export const PATCH = routeHandler(async (request: Request, { params }: Params) => {
  const ctx = await requireContext();
  const { id } = await params;
  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "bad_request", message: "Cần từ đã sửa" }, { status: 400 });
  }
  await updateTerm(ctx, id, body.term);
  return Response.json({ ok: true });
});

export const DELETE = routeHandler(async (_request: Request, { params }: Params) => {
  const ctx = await requireContext();
  const { id } = await params;
  await removeTerm(ctx, id);
  return Response.json({ ok: true });
});
