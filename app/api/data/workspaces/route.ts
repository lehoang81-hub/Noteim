/**
 * Nhóm (a) — không gian làm việc (C1-03b): danh sách không gian của người
 * dùng theo phiên và thành viên của một không gian.
 */
import { routeHandler, requireContext } from "@/lib/data/server/context";
import { listMembers, listWorkspaces } from "@/lib/data/server/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = routeHandler(async (request: Request) => {
  const ctx = await requireContext();
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("member_of");
  if (workspaceId) {
    const members = await listMembers(ctx, workspaceId);
    return Response.json({ members });
  }
  const workspaces = await listWorkspaces(ctx);
  return Response.json({ workspaces });
});
