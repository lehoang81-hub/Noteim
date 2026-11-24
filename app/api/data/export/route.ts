/** Nhóm (d) — xuất toàn bộ dữ liệu của người dùng (M4-03) — chỉ dữ liệu của PHIÊN. */
import { routeHandler, requireContext } from "@/lib/data/server/context";
import { exportAll } from "@/lib/data/server/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = routeHandler(async () => {
  const ctx = await requireContext();
  const data = await exportAll(ctx);
  return Response.json(data);
});
