/** Nhóm (b) — bản ghi lời của buổi (C1-03b), lọc theo PHIÊN. */
import { routeHandler, requireContext } from "@/lib/data/server/context";
import { getTranscript } from "@/lib/data/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = routeHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireContext();
  const { id } = await params;
  const transcript = await getTranscript(ctx, id);
  return Response.json({ transcript });
});
