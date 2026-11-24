/** Nhóm (d) — các buổi đang dùng liên hệ làm người nói (M4-03, cảnh báo khi xóa). */
import { routeHandler, requireContext } from "@/lib/data/server/context";
import { contactUsage } from "@/lib/data/server/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = routeHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireContext();
  const { id } = await params;
  const titles = await contactUsage(ctx, id);
  return Response.json({ sessions: titles });
});
