/**
 * C1-04 yêu cầu 3 — nghe lại băng ghi.
 *
 * GET /api/audio/{sessionId}: kiểm quyền THEO PHIÊN (chủ buổi, hoặc thành viên
 * của không gian nhóm khi buổi đã chia sẻ cho nhóm) rồi 302 tới signed GET URL
 * sống 15 phút — trình phát nghe bằng src này, Range để tua vẫn hoạt động vì
 * chữ ký nằm trên URL chứ không nằm trên tiêu đề Range.
 *
 * Buổi mẫu giữ băng tĩnh /audio/…, buổi Bản ghi thử chưa có băng → 404.
 * Không log khóa có ký hay bất kỳ dữ liệu nào của buổi.
 */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { sessions, workspaceMembers } from "@/lib/db/schema";
import { ApiError, routeHandler, requireContext } from "@/lib/data/server/context";
import { isAudioObjectKey, presignGetUrl } from "@/lib/data/server/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ sessionId: string }> };

export const GET = routeHandler(async (_request: Request, { params }: Params) => {
  const ctx = await requireContext();
  const { sessionId } = await params;
  const db = getDb();

  const row = (await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1))[0];
  if (!row) throw new ApiError(404, "not_found", "Không thấy buổi ghi");

  // Quyền đọc: chủ buổi, hoặc thành viên đang hoạt động của không gian nhóm
  // khi buổi được chia sẻ cho nhóm (M7-01). Buổi riêng tư của người khác → 403.
  if (row.ownerUserId !== ctx.userId) {
    const canThroughWorkspace =
      row.workspaceId !== null &&
      row.visibility === "workspace" &&
      (
        await db
          .select({ userId: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(and(eq(workspaceMembers.workspaceId, row.workspaceId), eq(workspaceMembers.userId, ctx.userId)))
          .limit(1)
      ).length > 0;
    if (!canThroughWorkspace) throw new ApiError(403, "forbidden", "Không có quyền nghe băng của buổi này");
  }

  // Chỉ phục vụ băng trên R2 (khóa u/…); buổi mẫu/bản ghi thử/hết hạn → 404
  if (row.storageStatus !== "full" || !isAudioObjectKey(row.audioPath) || row.audioPath === null) {
    throw new ApiError(404, "not_found", "Buổi không có băng nghe lại trên kho");
  }

  const url = await presignGetUrl(row.audioPath);
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      "Cache-Control": "no-store",
    },
  });
});
