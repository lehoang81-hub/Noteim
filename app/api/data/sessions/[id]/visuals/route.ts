/** Nhóm (b) — dữ liệu Hình ảnh hóa của buổi (C1-03b): timeline, tỉ lệ nói, sơ đồ. */
import { routeHandler, requireContext } from "@/lib/data/server/context";
import { getVisuals } from "@/lib/data/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = routeHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireContext();
  const { id } = await params;
  const visuals = await getVisuals(ctx, id);
  return Response.json({ visuals });
});
