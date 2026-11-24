/** Nhóm (b) — tìm kiếm xuyên buổi (M4-02, C1-03b): chỉ trong dữ liệu của PHIÊN. */
import { routeHandler, requireContext } from "@/lib/data/server/context";
import { searchAll } from "@/lib/data/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = routeHandler(async (request: Request) => {
  const ctx = await requireContext();
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const result = await searchAll(ctx, q);
  return Response.json(result);
});
