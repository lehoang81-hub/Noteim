/**
 * Nhóm (b) — danh sách buổi và tạo buổi (C1-03b). Mọi truy vấn lọc theo
 * user_id của PHIÊN. POST tạo buổi từ màn ghi âm (bản ghi thử — chưa lưu
 * âm thanh, PR 04 mới nối R2) hoặc từ file nhập.
 */
import { z } from "zod";

import { routeHandler, requireContext } from "@/lib/data/server/context";
import { createSession, listSessions } from "@/lib/data/server/sessions";
import { Lang } from "@/lib/data/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const consentSchema = z.object({
  confirmed: z.boolean(),
  announced: z.boolean(),
  receipts: z
    .array(
      z.object({
        id: z.string(),
        who: z.array(z.string()).catch([]),
        at: z.string(),
        method: z.enum(["button", "auto"]),
        announcement_text: z.string().optional(),
      }),
    )
    .optional(),
});

const gapCheckSchema = z.object({
  template_id: z.string(),
  checked_at: z.string(),
  result: z.object({
    ready_to_close: z.boolean(),
    slots_status: z.array(z.object({ key: z.string(), filled: z.boolean(), confidence: z.enum(["high", "medium", "low"]), evidence: z.string() })),
    missing_priorities: z.array(z.object({ key: z.string(), why_missing: z.string(), question: z.string() })),
    one_line_bridge: z.string(),
  }),
});

const draftSchema = z.object({
  title: z.string().max(300).optional(),
  template_id: z.string().min(1),
  primary_language: Lang,
  auto_detect_languages: z.boolean().optional(),
  duration_sec: z.number().min(0).max(24 * 3600),
  notes: z.array(z.object({ timestamp_sec: z.number(), text: z.string().max(2000) })).max(500),
  bookmarks: z.array(z.object({ timestamp_sec: z.number(), tag: z.string().nullable(), note: z.string().max(2000).optional() })).max(500),
  photos: z.array(z.object({ id: z.string(), timestamp_sec: z.number(), url: z.string().default("") })).max(50),
  levels: z.array(z.number()).max(24 * 3600),
  consent: z.object({ confirmed: z.boolean(), announced: z.boolean(), receipts: consentSchema.shape.receipts }).optional(),
  folder_id: z.string().optional(),
  gap_check: gapCheckSchema.nullable().optional(),
  pending_ai_questions: z.array(z.string().max(1000)).max(50).optional(),
});

const postSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("recording"), draft: draftSchema }),
  z.object({
    kind: z.literal("import"),
    input: z.object({
      file_name: z.string().min(1).max(300),
      duration_sec: z.number().min(0).max(24 * 3600),
      template_id: z.string().min(1),
      language: Lang,
      auto_detect_languages: z.boolean().optional(),
    }),
  }),
]);

export const GET = routeHandler(async (request: Request) => {
  const ctx = await requireContext();
  const url = new URL(request.url);
  const sessions = await listSessions(ctx, {
    query: url.searchParams.get("query") ?? undefined,
    template_id: url.searchParams.get("template_id") ?? undefined,
    range: url.searchParams.get("range") === "week" ? "week" : "all",
    has_open_tasks: url.searchParams.get("has_open_tasks") === "1",
  });
  return Response.json({ sessions });
});

export const POST = routeHandler(async (request: Request) => {
  const ctx = await requireContext();
  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "bad_request", message: "Thân yêu cầu không đúng cấu trúc" }, { status: 400 });
  }
  const result =
    body.kind === "recording"
      ? await createSession(ctx, { kind: "recording", draft: body.draft })
      : await createSession(ctx, { kind: "import", input: body.input });
  return Response.json(result);
});
