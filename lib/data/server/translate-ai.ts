/**
 * C1-08 — dịch thật bằng Gemini phía máy chủ: tóm tắt theo ngôn ngữ
 * (summary_versions) và từng đoạn bản chữ (translations của đoạn).
 *
 * Cơ chế chung: mỗi văn bản là một mục {id, text}; chia đợt theo trần ký tự
 * (không cắt giữa mục), gọi Gemini JSON mode trả lại ĐỦ đúng id đã cấp —
 * thiếu/thừa id là lỗi, không bỏ mục nào. Quy tắc đặc tả:
 * - Số liệu, tên riêng, ngày giờ, mã giữ nguyên văn; không thêm/bớt mục.
 * - Nguồn là tiếng Việt (bản gốc); đích là lang (en/ko).
 * - GEMINI_FAKE=1 (chỉ ngoài production — geminiFakeActive của summarize):
 *   dịch giả cố định "[ko] " + câu gốc để e2e đối chiếu; nguồn chứa
 *   "[dich-loi]" ép lỗi.
 * - Nhật ký: chỉ id buổi, ngôn ngữ, độ trễ, mã lỗi — không ghi nội dung.
 */
import { z } from "zod";

import type { Lang, SessionDetail, VersionTopic } from "../types";
import { geminiFakeActive, GeminiError } from "./summarize";
import { geminiJsonCall } from "./gemini";

const ResultSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })),
});

/** Trần ký tự nguồn cho MỘT lần gọi dịch — vượt thì chia đợt, không cắt mục. */
const CHUNK_CHARS = 6_000;

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Trả lại ĐÚNG id đã cấp, không đổi" },
          text: { type: "string", description: "Bản dịch của mục đó" },
        },
        required: ["id", "text"],
      },
    },
  },
  required: ["items"],
} as const;

const LANG_NAME: Record<Lang, string> = { vi: "tiếng Việt", en: "tiếng Anh", ko: "tiếng Hàn" };

function systemPrompt(targetLang: Lang): string {
  return [
    `Bạn là bộ dịch của Noteim. Dịch tiếng Việt sang tiếng ${LANG_NAME[targetLang]}.`,
    "Dịch đủ ĐÚNG số mục đã cấp, trả lại ĐÚNG id của từng mục; không thêm, không bớt, không gộp mục.",
    "Số liệu, tên riêng, ngày giờ và mã (ví dụ 18.06, Imperia, 15/11, 4,2 tỷ) giữ nguyên văn, không dịch lại số, không đổi đơn vị.",
    "Mỗi mục dịch là một câu hoàn chỉnh có nghĩa; không chép lại câu gốc vào bản dịch.",
    "Trả về đúng JSON theo schema, không thêm chữ ngoài JSON.",
  ].join(" ");
}

/** Chia mục thành các đợt theo trần ký tự — không cắt giữa mục. */
function chunkItems(items: Array<{ id: string; text: string }>): Array<Array<{ id: string; text: string }>> {
  const chunks: Array<Array<{ id: string; text: string }>> = [];
  let buf: Array<{ id: string; text: string }> = [];
  let size = 0;
  for (const item of items) {
    if (size + item.text.length > CHUNK_CHARS && buf.length > 0) {
      chunks.push(buf);
      buf = [];
      size = 0;
    }
    buf.push(item);
    size += item.text.length;
  }
  if (buf.length) chunks.push(buf);
  return chunks;
}

async function callChunk(
  chunk: Array<{ id: string; text: string }>,
  targetLang: Lang,
): Promise<Map<string, string>> {
  const raw = await geminiJsonCall({
    system: systemPrompt(targetLang),
    user: JSON.stringify(chunk),
    responseSchema: RESULT_SCHEMA,
    maxOutputTokens: 8192,
    logTag: "translate",
  });
  let parsed: z.infer<typeof ResultSchema>;
  try {
    const json = JSON.parse(raw) as unknown;
    const ok = ResultSchema.safeParse(json);
    if (!ok.success) throw new GeminiError("parse", undefined, "JSON không đúng luật");
    parsed = ok.data;
  } catch (error) {
    if (error instanceof GeminiError) throw error;
    throw new GeminiError("parse", undefined, "JSON không đọc được");
  }
  const map = new Map<string, string>();
  for (const item of parsed.items) map.set(item.id, item.text);
  const missing = chunk.filter((c) => !map.has(c.id)).map((c) => c.id);
  if (missing.length) throw new GeminiError("parse", undefined, `thiếu ${missing.length} mục trả về`);
  return map;
}

/** Dịch một loạt mục {id, text} → bản đồ id → bản dịch. Thất bại ném lỗi. */
export async function translateTexts(opts: {
  items: Array<{ id: string; text: string }>;
  targetLang: Lang;
}): Promise<Map<string, string>> {
  if (geminiFakeActive()) {
    const map = new Map<string, string>();
    for (const item of opts.items) {
      if (item.text.includes("[dich-loi]")) {
        throw new GeminiError("call", 500, "fake failure theo yêu cầu kiểm thử");
      }
      map.set(item.id, `[${opts.targetLang}] ${item.text}`);
    }
    return map;
  }
  const map = new Map<string, string>();
  for (const chunk of chunkItems(opts.items)) {
    const part = await callChunk(chunk, opts.targetLang);
    for (const [k, v] of part) map.set(k, v);
  }
  return map;
}

/**
 * Dịch cả bản tóm tắt của buổi (tóm tắt chung + tiêu đề/ý chủ đề + tên việc
 * cần làm). Giữ nguyên mọi mốc/tag/người nói; từng ý gắn "Câu gốc" để màn
 * chi tiết đối chiếu (giữ nguyên cách bản mẫu đã làm).
 */
export async function translateSummaryVersion(
  detail: SessionDetail,
  lang: Lang,
): Promise<{ executiveSummary: string; topics: VersionTopic[]; taskTexts: Record<string, string> }> {
  const items: Array<{ id: string; text: string }> = [];
  if (detail.executive_summary.trim()) items.push({ id: "exec", text: detail.executive_summary });
  for (const topic of detail.topics) {
    if (topic.title.trim()) items.push({ id: `topic:${topic.id}:title`, text: topic.title });
    for (const b of topic.bullets) {
      if (b.text.trim()) items.push({ id: `bullet:${b.id}`, text: b.text });
    }
  }
  for (const a of detail.action_items) {
    if (a.task.trim()) items.push({ id: `task:${a.id}`, text: a.task });
  }
  const map = await translateTexts({ items, targetLang: lang });
  const topics: VersionTopic[] = detail.topics.map((t) => ({
    ...t,
    title: map.get(`topic:${t.id}:title`) ?? t.title,
    bullets: t.bullets.map((b) => ({
      ...b,
      text: map.get(`bullet:${b.id}`) ?? b.text,
      original_text: b.text,
      original_lang: detail.original_report_language,
    })),
  }));
  return {
    executiveSummary: map.get("exec") ?? detail.executive_summary,
    topics,
    taskTexts: Object.fromEntries(detail.action_items.map((a) => [a.id, map.get(`task:${a.id}`) ?? a.task])),
  };
}
