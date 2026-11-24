/**
 * Nhóm (c) — thư mục theo hồ sơ (C1-03b): danh sách và tạo thư mục. Thư mục
 * và buổi gắn vào đều phải thuộc người dùng của PHIÊN.
 */
import { z } from "zod";

import { routeHandler, requireContext } from "@/lib/data/server/context";
import { createFolder, listFolders } from "@/lib/data/server/folders";
import { Folder, FolderKind } from "@/lib/data/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = routeHandler(async () => {
  const ctx = await requireContext();
  const folders = await listFolders(ctx);
  return Response.json({ folders });
});

const postSchema = z.object({
  kind: FolderKind,
  name: z.string().min(1).max(300),
  ref: z.string().max(200).optional(),
  note: z.string().max(2000).optional(),
  template_id: z.string().nullable().optional(),
  session_ids: z.array(z.string().min(1)).max(200).optional(),
});

export const POST = routeHandler(async (request: Request) => {
  const ctx = await requireContext();
  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "bad_request", message: "Thân yêu cầu không đúng cấu trúc" }, { status: 400 });
  }
  const folder = await createFolder(ctx, body);
  return Response.json({ folder });
});
