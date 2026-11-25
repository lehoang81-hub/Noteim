/**
 * C1-05 — tóm tắt buổi họp bằng Gemini phía máy chủ: JSON mode
 * (responseMimeType + responseSchema) và kiểm kết quả bằng Zod trước khi
 * lưu. Bản chữ dài tóm tắt theo đoạn rồi gộp (map-reduce) với trần ký tự
 * mỗi lần gọi — không cắt âm thầm, thiếu dữ liệu thì để trống.
 *
 * Model: GEMINI_MODEL nếu đặt, mặc định `gemini-3.5-flash-lite` — tên đối
 * chiếu trang chính thức aistudio.google.com/docs/models (ngày xem
 * 25/11/2026; mặc định cũ gemini-2.5-flash-lite đã gỡ, gọi trả 404).
 * Điểm cuối REST giống lib/gap-check/provider.ts (x-goog-api-key).
 *
 * Chế độ GEMINI_FAKE=1 (chỉ máy kiểm thử/e2e): trả tóm tắt giả cố định khớp
 * giọng giả của soniox.ts — KHÔNG gọi API; bị chặn tuyệt đối khi
 * VERCEL_ENV=production.
 *
 * Quy tắc nhật ký: không ghi transcript hay tóm tắt; chỉ ghi bước, độ trễ,
 * mã lỗi.
 */
import { z } from "zod";

import type { Template } from "@/lib/data/types";

import { ApiError } from "./context";
import type { SonioxSegment } from "./soniox";

/* ---------- Hình dạng kết quả tóm tắt (kiểm bằng Zod) ---------- */

const TAGS = ["decided", "pending", "risk", "idea", "figure"] as const;
const PRIORITIES = ["high", "medium", "low"] as const;

const SummaryPlan = z.object({
  executive_summary: z.string().catch(""),
  topics: z
    .array(
      z.object({
        section_id: z.string().min(1),
        title: z.string().min(1),
        tag: z.enum(TAGS).catch("pending"),
        bullets: z.array(
          z.object({
            text: z.string().min(1),
            timestamp_sec: z.number().catch(0),
            speaker_index: z.number().int().min(0).catch(0),
            is_quote: z.boolean().catch(false),
          }),
        ),
      }),
    ),
  action_items: z.array(
    z.object({
      task: z.string().min(1),
      priority: z.enum(PRIORITIES).catch("medium"),
      due_date: z.string().nullable().catch(null),
      speaker_index: z.number().int().min(0).nullable().catch(null),
      timestamp_sec: z.number().nullable().catch(null),
      source_quote: z.string().nullable().catch(null),
    }),
  ),
});
export type SummaryPlan = z.infer<typeof SummaryPlan>;

export class GeminiError extends Error {
  constructor(
    public step: "call" | "parse",
    public status: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

/** GEMINI_FAKE chỉ có hiệu lực ngoài production — sai quy định thì bỏ qua. */
export function geminiFakeActive(): boolean {
  if (process.env.GEMINI_FAKE !== "1") return false;
  if (process.env.VERCEL_ENV === "production") {
    console.warn("[asr] GEMINI_FAKE bị bỏ qua trên production");
    return false;
  }
  return true;
}

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function geminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
}

/** Trần ký tự bản chữ cho MỘT lần gọi (map-reduce khi vượt). */
const CHUNK_CHARS = 12_000;
/** Trần chủ đề và ý cho một buổi — giữ biên bản gọn, đúng hình dạng màn chi tiết. */
const MAX_TOPICS = 6;
const MAX_BULLETS_PER_TOPIC = 8;
const MAX_TASKS = 8;

async function geminiGenerate(opts: { system: string; user: string; responseSchema: Record<string, unknown>; maxOutputTokens: number }): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ApiError(503, "summarizer_not_configured", "Máy chủ chưa cấu hình khóa tóm tắt");
  const base = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(`${base}/v1beta/models/${encodeURIComponent(geminiModel())}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: opts.system }] },
        contents: [{ role: "user", parts: [{ text: opts.user }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: opts.maxOutputTokens,
          responseMimeType: "application/json",
          responseSchema: opts.responseSchema,
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw new GeminiError("call", undefined, error instanceof Error ? error.message.slice(0, 120) : "lỗi mạng");
  }
  if (!res.ok) throw new GeminiError("call", res.status, `HTTP ${res.status}`);
  const json = (await res.json().catch(() => null)) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> } | null;
  const text = (json?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new GeminiError("call", res.status, "phản hồi trống");
  console.log(`[asr] gemini ok ${JSON.stringify({ ms: Date.now() - started, chars: text.length, ts: new Date().toISOString() })}`);
  return text;
}

/* ---------- responseSchema (mục con của OpenAPI schema subset của Gemini) ---------- */

const bulletSchema = {
  type: "object",
  properties: {
    text: { type: "string", description: "Một ý ngắn, dẫn đúng số liệu/tên/ngày NGUYÊN VĂN trong bản chữ" },
    timestamp_sec: { type: "number", description: "Mốc giây gần nhất trong bản chữ để bấm nghe lại" },
    speaker_index: { type: "integer", description: "Số thứ tự người nói (bắt đầu từ 0) theo danh sách đã ghi" },
    is_quote: { type: "boolean", description: "true nếu giữ nguyên câu nói trích dẫn" },
  },
  required: ["text", "timestamp_sec", "speaker_index", "is_quote"],
} as const;

const taskSchema = {
  type: "object",
  properties: {
    task: { type: "string" },
    priority: { type: "string", enum: [...PRIORITIES] },
    due_date: { type: "string", nullable: true, description: "Ngày hẹn NGUYÊN VĂN trong bản chữ, ISO yyyy-mm-dd; không nêu thì null" },
    speaker_index: { type: "integer", nullable: true },
    timestamp_sec: { type: "number", nullable: true },
    source_quote: { type: "string", nullable: true, description: "Câu gốc trong bản chữ; không có thì null" },
  },
  required: ["task", "priority", "due_date", "speaker_index", "timestamp_sec", "source_quote"],
} as const;

function planSchema(sectionIds: string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      executive_summary: { type: "string", description: "3–5 câu, chỉ dùng thông tin có trong bản chữ" },
      topics: {
        type: "array",
        items: {
          type: "object",
          properties: {
            section_id: { type: "string", enum: sectionIds, description: "Chọn đúng một phần của mẫu được cấp" },
            title: { type: "string" },
            tag: { type: "string", enum: [...TAGS] },
            bullets: { type: "array", items: bulletSchema },
          },
          required: ["section_id", "title", "tag", "bullets"],
        },
      },
      action_items: { type: "array", items: taskSchema },
    },
    required: ["executive_summary", "topics", "action_items"],
  };
}

/* ---------- Dựng lời nhắc từ bản chữ ---------- */

function secToLabel(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function transcriptText(segments: Array<{ speaker_index: number; start_sec: number; text: string }>): string {
  return segments
    .map((s) => `[${secToLabel(s.start_sec)}] Người nói ${s.speaker_index + 1}: ${s.text}`)
    .join("\n");
}

function systemPrompt(template: Template | undefined, reportLang: string): string {
  const names = (template?.sections ?? [])
    .filter((s) => s.enabled)
    .map((s) => `${s.id} = ${s.title.vi}`)
    .join("; ");
  return [
    `Bạn là trợ lý lập biên bản buổi họp/gặp gỡ cho ứng dụng Noteim. Viết bằng tiếng ${reportLang.toUpperCase()}.`,
    "TUYỆT ĐỐI KHÔNG BỊA: chỉ dùng thông tin có trong bản chữ. Số liệu, tên riêng, ngày giờ phải đúng nguyên văn bản chữ; không nêu được thì để mảng rỗng hoặc null.",
    "Mỗi ý phải có timestamp_sec là mốc giây của đoạn bản chữ nói về ý đó (để bấm nghe lại).",
    template && names
      ? `Phân ý vào đúng các phần của mẫu: ${names}. Chỉ dùng section_id nằm trong danh sách.`
      : "Chia ý theo chủ đề tự nhiên.",
    "Trả về đúng JSON theo schema, không thêm chữ ngoài JSON.",
  ].join(" ");
}

function userPrompt(transcript: string, durationSec: number): string {
  return [
    `Thời lượng buổi: ${Math.round(durationSec)} giây. Bản chữ (mốc [phút:giây] — Người nói N):`,
    transcript,
  ].join("\n\n");
}

/** Chuẩn hóa kết quả: cắt trần, kẹp mốc, bỏ phần không thuộc mẫu. */
function normalizePlan(plan: SummaryPlan, opts: { template?: Template; durationSec: number; speakerCount: number }): SummaryPlan {
  const enabled = new Set((opts.template?.sections ?? []).filter((s) => s.enabled).map((s) => s.id));
  const clampSec = (n: number) => Math.max(0, Math.min(opts.durationSec, Math.round(n)));
  const clampSpeaker = (n: number) => Math.max(0, Math.min(Math.max(0, opts.speakerCount - 1), n));
  const topics = plan.topics
    .filter((t) => enabled.size === 0 || enabled.has(t.section_id))
    .slice(0, MAX_TOPICS)
    .map((t) => ({
      ...t,
      bullets: t.bullets.slice(0, MAX_BULLETS_PER_TOPIC).map((b) => ({
        ...b,
        timestamp_sec: clampSec(b.timestamp_sec),
        speaker_index: clampSpeaker(b.speaker_index),
        is_quote: Boolean(b.is_quote),
      })),
    }));
  const tasks = plan.action_items.slice(0, MAX_TASKS).map((a) => ({
    ...a,
    due_date: a.due_date && /^\d{4}-\d{2}-\d{2}$/.test(a.due_date) ? a.due_date : null,
    timestamp_sec: a.timestamp_sec === null ? null : clampSec(a.timestamp_sec),
    speaker_index: a.speaker_index === null ? null : clampSpeaker(a.speaker_index),
    source_quote: a.source_quote ? a.source_quote.slice(0, 300) : null,
  }));
  return {
    executive_summary: plan.executive_summary.slice(0, 2000),
    topics,
    action_items: tasks,
  };
}

function parsePlan(raw: string, opts: { template?: Template; durationSec: number; speakerCount: number }): SummaryPlan {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new GeminiError("parse", undefined, "JSON không đọc được");
  }
  const parsed = SummaryPlan.safeParse(json);
  if (!parsed.success) throw new GeminiError("parse", undefined, "JSON không đúng luật");
  return normalizePlan(parsed.data, opts);
}

/** Tóm tắt bản chữ: ngắn thì một lần gọi, dài thì map từng đoạn rồi gộp. */
export async function summarizeTranscript(opts: {
  segments: SonioxSegment[];
  speakerCount: number;
  template?: Template;
  reportLang: string;
  durationSec: number;
}): Promise<SummaryPlan> {
  const order = speakerOrder(opts.segments);
  const normalized = opts.segments
    .slice()
    .sort((a, b) => a.start_sec - b.start_sec)
    .map((s) => ({
      speaker_index: Math.max(0, order.indexOf(s.speaker ?? "?")),
      start_sec: s.start_sec,
      text: s.text,
    }));
  const full = transcriptText(normalized);

  if (full.length <= CHUNK_CHARS) {
    const raw = await geminiGenerate({
      system: systemPrompt(opts.template, opts.reportLang),
      user: userPrompt(full, opts.durationSec),
      responseSchema: planSchema((opts.template?.sections ?? []).filter((s) => s.enabled).map((s) => s.id)),
      maxOutputTokens: 4000,
    });
    return parsePlan(raw, opts);
  }

  // Map-reduce: tách theo đoạn lời (không cắt giữa câu), tóm tắt từng phần,
  // rồi gộp các phần thành một kế hoạch duy nhất. Không bỏ đoạn nào.
  const chunks: string[] = [];
  let buf = "";
  for (const s of normalized) {
    const line = `[${secToLabel(s.start_sec)}] Người nói ${s.speaker_index + 1}: ${s.text}\n`;
    if (buf.length + line.length > CHUNK_CHARS && buf.length > 0) {
      chunks.push(buf);
      buf = "";
    }
    buf += line;
  }
  if (buf) chunks.push(buf);

  const partialSchema = planSchema((opts.template?.sections ?? []).filter((s) => s.enabled).map((s) => s.id));
  const partials: SummaryPlan[] = [];
  for (const chunk of chunks) {
    const raw = await geminiGenerate({
      system: systemPrompt(opts.template, opts.reportLang),
      user: userPrompt(chunk, opts.durationSec),
      responseSchema: partialSchema,
      maxOutputTokens: 3000,
    });
    partials.push(parsePlan(raw, opts));
  }

  const reduceInput = partials
    .map(
      (p, i) =>
        `PHẦN ${i + 1}/${partials.length}:\nTóm tắt: ${p.executive_summary}\nChủ đề: ${JSON.stringify(
          p.topics.map((t) => ({ section_id: t.section_id, title: t.title, tag: t.tag, bullets: t.bullets })),
        )}\nViệc: ${JSON.stringify(p.action_items)}`,
    )
    .join("\n\n");
  const raw = await geminiGenerate({
    system: systemPrompt(opts.template, opts.reportLang),
    user: [
      "Gộp các phần tóm tắt dưới đây (cùng một buổi họp) thành MỘT kế hoạch duy nhất: gộp ý trùng, giữ mốc thời gian và số liệu nguyên văn, giữ đúng schema.",
      reduceInput,
    ].join("\n\n"),
    responseSchema: planSchema((opts.template?.sections ?? []).filter((s) => s.enabled).map((s) => s.id)),
    maxOutputTokens: 4000,
  });
  return parsePlan(raw, opts);
}

/** Danh sách người nói theo thứ tự xuất hiện lần đầu. */
export function speakerOrder(segments: SonioxSegment[]): string[] {
  const seen: string[] = [];
  for (const s of segments.slice().sort((a, b) => a.start_sec - b.start_sec)) {
    const key = s.speaker ?? "?";
    if (!seen.includes(key)) seen.push(key);
  }
  return seen.length ? seen : ["0"];
}

/* ---------- Chế độ giả (e2e): khớp giọng giả của soniox.ts ---------- */

/** Tóm tắt giả cố định, khớp số liệu trong FAKE_LINES — e2e đối chiếu không bịa. */
export function fakeSummaryPlan(durationSec: number, sectionIds: string[]): SummaryPlan {
  const section = (i: number) => sectionIds[i % Math.max(1, sectionIds.length)] ?? "tpl-realestate-s1";
  const cl = (n: number) => Math.max(0, Math.min(Math.max(1, durationSec), n));
  return {
    executive_summary:
      "Khách cần vay 50% giá trị căn hộ nhưng thấy lãi suất 8 phần trăm năm cao quá, ngân sách tối đa 4,2 tỷ. Người bán đồng ý đàm phán lại lãi suất còn 7 phần trăm và gửi bảng so sánh hai căn trong tuần này. Hai bên chốt đặt cọc trước ngày 15/11 và hẹn sáng thứ Bảy đi xem nhà.",
    topics: [
      {
        section_id: section(0),
        title: "Nhu cầu vay và ngân sách của khách",
        tag: "pending",
        bullets: [
          { text: "Khách muốn vay 50% giá trị căn hộ", timestamp_sec: cl(2), speaker_index: 1, is_quote: false },
          { text: "Lãi suất 8 phần trăm năm còn cao quá, ngân sách tối đa 4,2 tỷ", timestamp_sec: cl(8), speaker_index: 1, is_quote: true },
        ],
      },
      {
        section_id: section(1),
        title: "Đàm phán lãi suất và so sánh căn hộ",
        tag: "idea",
        bullets: [
          { text: "Đàm phán lại lãi suất còn 7 phần trăm, gửi bảng so sánh hai căn 18.06 và Imperia", timestamp_sec: cl(16), speaker_index: 0, is_quote: false },
        ],
      },
      {
        section_id: section(2),
        title: "Lịch hẹn xem nhà và đặt cọc",
        tag: "decided",
        bullets: [
          { text: "Đặt cọc trước ngày 15/11, hẹn sáng thứ Bảy xem nhà", timestamp_sec: cl(24), speaker_index: 1, is_quote: true },
          { text: "Phí quản lý 1,2 triệu một tháng đã gồm phần của xe", timestamp_sec: cl(30), speaker_index: 0, is_quote: false },
        ],
      },
    ],
    action_items: [
      {
        task: "Gửi bảng so sánh hai căn 18.06 và Imperia trong tuần này",
        priority: "high",
        due_date: null,
        speaker_index: 0,
        timestamp_sec: cl(16),
        source_quote: "tuần này em gửi anh bảng so sánh hai căn 18.06 và Imperia",
      },
      {
        task: "Đàm phán lại lãi suất còn 7 phần trăm",
        priority: "medium",
        due_date: null,
        speaker_index: 0,
        timestamp_sec: cl(16),
        source_quote: null,
      },
    ],
  } satisfies SummaryPlan;
}
