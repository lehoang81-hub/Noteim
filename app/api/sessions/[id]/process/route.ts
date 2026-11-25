/**
 * C1-05 yêu cầu 2 — đẩy luồng nội dung thật tiến MỘT bước mỗi lần gọi.
 *
 * Chỉ chủ buổi gọi được (requireContext + getOwnedSessionRow): 401 chưa
 * đăng nhập, 403 người khác, 404 không thấy. Idempotent: gọi khi done thì
 * trả trạng thái hiện tại; buổi không có băng (bản ghi thử/nhập file) thì
 * không làm gì — luồng mockup cũ giữ nguyên.
 *
 * Phản hồi trả { status, step, asr_stage, asr_error } để màn processing
 * cập nhật tiến độ thật ngay trong cùng lời gọi (mỗi 3–5 giây tự gọi lại).
 */
import { routeHandler, requireContext } from "@/lib/data/server/context";
import { getOwnedSessionRow } from "@/lib/data/server/sessions";
import { driveProcess } from "@/lib/data/server/asr-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = routeHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireContext();
  const { id } = await params;
  await getOwnedSessionRow(ctx, id); // 401/403/404 trước khi đụng luồng
  const state = await driveProcess(id);
  return Response.json(state ?? { status: "processing", step: 1, asr_stage: null, asr_error: null });
});
