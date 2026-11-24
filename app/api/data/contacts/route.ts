/** Nhóm (d) — danh bạ (C1-03b): danh sách và tạo liên hệ, lọc theo PHIÊN. */
import { z } from "zod";

import { routeHandler, requireContext } from "@/lib/data/server/context";
import { addContact, listContacts } from "@/lib/data/server/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = routeHandler(async () => {
  const ctx = await requireContext();
  const contacts = await listContacts(ctx);
  return Response.json({ contacts });
});

const postSchema = z
  .object({ name: z.string().min(1).max(300), email: z.string().max(300).optional() })
  .strict();

export const POST = routeHandler(async (request: Request) => {
  const ctx = await requireContext();
  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "bad_request", message: "Cần tên liên hệ" }, { status: 400 });
  }
  const contact = await addContact(ctx, body);
  return Response.json({ contact });
});
