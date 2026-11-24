/** Nhóm (c) — một thư mục (C1-03b): đọc, sửa (đổi tên/mẫu/gắn buổi), xóa. */
import { z } from "zod";

import { routeHandler, requireContext } from "@/lib/data/server/context";
import { getFolder, removeFolder, updateFolder } from "@/lib/data/server/folders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = routeHandler(async (_request: Request, { params }: Params) => {
  const ctx = await requireContext();
  const { id } = await params;
  const folder = await getFolder(ctx, id);
  return Response.json({ folder });
});

const patchSchema = z
  .object({
    name: z.string().max(300).optional(),
    ref: z.string().max(200).nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
    template_id: z.string().nullable().optional(),
    session_ids: z.array(z.string().min(1)).max(200).optional(),
  })
  .strict();

export const PATCH = routeHandler(async (request: Request, { params }: Params) => {
  const ctx = await requireContext();
  const { id } = await params;
  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "bad_request", message: "Thân yêu cầu không đúng cấu trúc" }, { status: 400 });
  }
  await updateFolder(ctx, id, {
    name: body.name,
    ref: body.ref ?? undefined,
    note: body.note ?? undefined,
    template_id: body.template_id ?? undefined,
    session_ids: body.session_ids,
  });
  return Response.json({ ok: true });
});

export const DELETE = routeHandler(async (_request: Request, { params }: Params) => {
  const ctx = await requireContext();
  const { id } = await params;
  await removeFolder(ctx, id);
  return Response.json({ ok: true });
});
