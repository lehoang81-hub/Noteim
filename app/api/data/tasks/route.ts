/**
 * Nhóm (c) — việc cần làm (C1-03b). GET liệt kê việc của các buổi thuộc
 * PHIÊN (lọc "Giao cho tôi" theo liên hệ của mình); PUT thêm/sửa một việc
 * (buổi phải là của mình); POST tick xong (đổi trạng thái done).
 */
import { z } from "zod";

import { routeHandler, requireContext } from "@/lib/data/server/context";
import { listTasks, toggleTaskDone, upsertTask } from "@/lib/data/server/tasks";
import { ActionItem, Lang } from "@/lib/data/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = routeHandler(async (request: Request) => {
  const ctx = await requireContext();
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang");
  const items = await listTasks(ctx, {
    mine: url.searchParams.get("mine") === "1",
    lang: lang && ["vi", "en", "ko"].includes(lang) ? (lang as Lang) : undefined,
  });
  return Response.json({ items });
});

const putSchema = ActionItem;

export const PUT = routeHandler(async (request: Request) => {
  const ctx = await requireContext();
  let item: ActionItem;
  try {
    item = putSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "bad_request", message: "Thân yêu cầu không đúng cấu trúc" }, { status: 400 });
  }
  await upsertTask(ctx, item);
  return Response.json({ ok: true });
});

const postSchema = z.object({ id: z.string().min(1) }).strict();

export const POST = routeHandler(async (request: Request) => {
  const ctx = await requireContext();
  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "bad_request", message: "Cần id việc" }, { status: 400 });
  }
  const item = await toggleTaskDone(ctx, body.id);
  return Response.json({ item });
});
