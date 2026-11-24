/** Nhóm (b) — bản đồ nghe của buổi (M8-01), lọc theo PHIÊN; null là chưa có. */
import { routeHandler, requireContext } from "@/lib/data/server/context";
import { getListeningMap } from "@/lib/data/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = routeHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireContext();
  const { id } = await params;
  const map = await getListeningMap(ctx, id);
  return Response.json({ map });
});
