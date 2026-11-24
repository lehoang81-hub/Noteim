/** Nhóm (a) — đổi không gian đang dùng (C1-03b). Chỉ không gian mình là thành viên. */
import { z } from "zod";

import { routeHandler, requireContext } from "@/lib/data/server/context";
import { switchWorkspace } from "@/lib/data/server/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ id: z.string().min(1) }).strict();

export const POST = routeHandler(async (request: Request) => {
  const ctx = await requireContext();
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "bad_request", message: "Cần id không gian" }, { status: 400 });
  }
  await switchWorkspace(ctx, body.id);
  return Response.json({ ok: true });
});
