/** Nhóm (d) — một liên hệ (C1-03b): sửa, xóa (gỡ khỏi người nói ở mọi buổi của mình). */
import { z } from "zod";

import { routeHandler, requireContext } from "@/lib/data/server/context";
import { removeContact, updateContact } from "@/lib/data/server/contacts";
import { Lang } from "@/lib/data/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    name: z.string().max(300).optional(),
    role: z.string().max(300).optional(),
    email: z.string().max(300).optional(),
    preferred_language: Lang.nullable().optional(),
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
  await updateContact(ctx, id, body);
  return Response.json({ ok: true });
});

export const DELETE = routeHandler(async (_request: Request, { params }: Params) => {
  const ctx = await requireContext();
  const { id } = await params;
  await removeContact(ctx, id);
  return Response.json({ ok: true });
});
