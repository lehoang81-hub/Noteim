/**
 * C1-08 — Hỏi AI thật phía máy chủ cho buổi và thư mục (chế độ tài khoản):
 * câu hỏi → Gemini với ngữ cảnh là bản chữ + tóm tắt của buổi (thư mục: các
 * buổi trong thư mục, trần ký tự, chia đoạn).
 *
 * Quy tắc đặc tả:
 * - KHÔNG BỊA: không có trong bản chữ thì trả đúng câu "không nhắc tới"
 *   (chuỗi nằm trong messages/*.json, đủ vi/en/ko — máy chủ đọc theo ngôn
 *   ngữ giao diện từ cookie noteim-locale).
 * - Số liệu, tên riêng, ngày giờ phải đúng nguyên văn bản chữ.
 * - Trả lời bằng ngôn ngữ giao diện; citations là mốc giây trong bản chữ để
 *   bấm nghe lại; chỉ nhận mốc hợp lệ (kẹp biên, gắn mốc đoạn gần nhất).
 * - GEMINI_FAKE=1 (chỉ ngoài production — chỗ gọi kiểm tra lại): câu trả
 *   lời giả cố định khớp giọng giả soniox để e2e đối chiếu; câu chứa
 *   "[that-bai]" ép lỗi AI, "[khong]" ép đường "không nhắc tới".
 * - Nhật ký: chỉ ghi sessionId, độ trễ, số dẫn chứng, mã lỗi — không ghi
 *   câu hỏi, câu trả lời, bản chữ.
 */
import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";

import type { Lang, Topic } from "../types";
import { GeminiError } from "./summarize";
import { geminiJsonCall } from "./gemini";

export type ChatCitations = Array<{ timestamp_sec: number }>;
export type FolderChatCitations = Array<{ session_id: string; timestamp_sec: number }>;

const ChatAnswer = z.object({
  answer: z.string().min(1),
  citations: z.array(z.number()).catch([]),
});

const FolderAnswer = z.object({
  answer: z.string().min(1),
  citations: z
    .array(z.object({ session: z.number().int().min(1), timestamp_sec: z.number() }))
    .catch([]),
});

/** Trần ký tự ngữ cảnh cho hỏi đáp MỘT buổi (bản chữ + tóm tắt). */
const CHAT_CONTEXT_MAX_CHARS = 120_000;
/** Trần ký tự TOÀN ngữ cảnh cho hỏi đáp thư mục. */
export const FOLDER_CONTEXT_MAX_CHARS = 48_000;
/** Trần ký tự bản chữ trích cho MỘT buổi trong thư mục. */
export const FOLDER_EXCERPT_MAX_CHARS = 1800;
/** Trần số buổi đưa vào ngữ cảnh thư mục. */
export const FOLDER_MAX_SESSIONS = 12;

const LANG_NAME: Record<Lang, string> = { vi: "tiếng Việt", en: "tiếng Anh", ko: "tiếng Hàn" };

/** Ngôn ngữ giao diện của người dùng (cookie noteim-locale; thiếu thì vi). */
export async function readUiLocale(): Promise<Lang> {
  try {
    const locale = await getLocale();
    return (["vi", "en", "ko"] as const).includes(locale as Lang) ? (locale as Lang) : "vi";
  } catch {
    return "vi";
  }
}

/** Câu "không nhắc tới" theo ngôn ngữ giao diện, đọc từ messages/*.json. */
export async function notFoundText(kind: "session" | "folder"): Promise<string> {
  const locale = await readUiLocale();
  const t = await getTranslations({ locale, namespace: kind === "session" ? "ai" : "folders" });
  return kind === "session" ? t("notMentioned") : t("aiNotFound");
}

function secToLabel(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ---------- Hỏi đáp của buổi ---------- */

export type SessionChatContext = {
  question: string;
  locale: Lang;
  executiveSummary: string;
  topics: Topic[];
  segments: Array<{ speaker_index: number; start_sec: number; text: string }>;
  speakerCount: number;
  durationSec: number;
};

const SESSION_ANSWER_SCHEMA = {
  type: "object",
  properties: {
    answer: {
      type: "string",
      description: "Câu trả lời bằng ngôn ngữ được yêu cầu; chỉ dùng thông tin trong ngữ cảnh",
    },
    citations: {
      type: "array",
      items: { type: "integer", description: "Mốc giây của đoạn bản chữ liên quan tới câu trả lời, tối đa 4 mốc" },
    },
  },
  required: ["answer", "citations"],
} as const;

function sessionSystemPrompt(locale: Lang, notFound: string): string {
  return [
    `Bạn là trợ lý hỏi đáp buổi ghi của Noteim. Viết câu trả lời bằng tiếng ${LANG_NAME[locale]}.`,
    `TUYỆT ĐỐI KHÔNG BỊA: chỉ dùng thông tin có trong BẢN CHỮ và TÓM TẮT dưới đây. Bản chữ không nhắc tới câu hỏi thì trả về đúng câu "${notFound}" và citations là mảng rỗng.`,
    "Số liệu, tên riêng, ngày giờ phải đúng nguyên văn trong bản chữ; không suy diễn, không đổi đơn vị, không dịch lại số.",
    "citations: tối đa 4 mốc giây (số nguyên) của các đoạn bản chữ liên quan tới câu trả lời, để người dùng bấm nghe lại.",
    "Trả về đúng JSON theo schema, không thêm chữ ngoài JSON.",
  ].join(" ");
}

function sessionUserPrompt(ctx: SessionChatContext, transcript: string): string {
  const summaryLines = [
    ctx.executiveSummary ? `Tóm tắt chung: ${ctx.executiveSummary}` : "",
    ...ctx.topics
      .slice(0, 6)
      .flatMap((topic) => topic.bullets.slice(0, 6).map((b) => `[${secToLabel(b.timestamp_sec)}] ${b.text}`)),
  ].filter(Boolean);
  return [
    `Câu hỏi: ${ctx.question}`,
    "",
    "TÓM TẮT BUỔI (nguyên văn tiếng Việt):",
    summaryLines.join("\n") || "(không có)",
    "",
    `BẢN CHỮ (mốc [phút:giây] — Người nói N; buổi dài ${Math.round(ctx.durationSec)} giây, ${ctx.speakerCount} người nói):`,
    transcript || "(không có bản chữ)",
  ].join("\n");
}

/** Kẹp mốc vào buổi và gắn về mốc đoạn gần nhất (chỉ nhận chênh ≤ 2 giây). */
function clampCitations(raw: number[], segments: Array<{ start_sec: number }>, durationSec: number): ChatCitations {
  const starts = segments.map((s) => s.start_sec);
  const out: number[] = [];
  for (const n of raw) {
    if (!Number.isFinite(n)) continue;
    const sec = Math.max(0, Math.min(Math.max(0, durationSec), Math.round(n)));
    const nearest = starts.length
      ? starts.reduce((best, s) => (Math.abs(s - sec) < Math.abs(best - sec) ? s : best), starts[0])
      : sec;
    const snapped = Math.abs(nearest - sec) <= 2 ? nearest : sec;
    if (!out.includes(snapped)) out.push(snapped);
  }
  return out.slice(0, 4).map((timestamp_sec) => ({ timestamp_sec }));
}

/** Hỏi AI của buổi: trả câu trả lời + dẫn chứng mốc giây. */
export async function answerSessionChat(
  ctx: SessionChatContext,
  notFound: string,
): Promise<{ answer: string; citations: ChatCitations }> {
  if (process.env.GEMINI_FAKE === "1" && process.env.VERCEL_ENV !== "production") {
    return fakeSessionChatAnswer(ctx, notFound);
  }
  const full = ctx.segments
    .map((s) => `[${secToLabel(s.start_sec)}] Người nói ${s.speaker_index + 1}: ${s.text}`)
    .join("\n");
  const transcript =
    full.length > CHAT_CONTEXT_MAX_CHARS
      ? `${full.slice(0, CHAT_CONTEXT_MAX_CHARS)}\n…(bản chữ quá dài, phần còn lại bị lược khi hỏi)`
      : full;
  const raw = await geminiJsonCall({
    system: sessionSystemPrompt(ctx.locale, notFound),
    user: sessionUserPrompt(ctx, transcript),
    responseSchema: SESSION_ANSWER_SCHEMA,
    maxOutputTokens: 2000,
    logTag: "chat",
  });
  let parsed: z.infer<typeof ChatAnswer>;
  try {
    const json = JSON.parse(raw) as unknown;
    const ok = ChatAnswer.safeParse(json);
    if (!ok.success) throw new GeminiError("parse", undefined, "JSON không đúng luật");
    parsed = ok.data;
  } catch (error) {
    if (error instanceof GeminiError) throw error;
    throw new GeminiError("parse", undefined, "JSON không đọc được");
  }
  return { answer: parsed.answer.trim(), citations: clampCitations(parsed.citations, ctx.segments, ctx.durationSec) };
}

/** Câu trả lời giả cho e2e (GEMINI_FAKE=1; production bị chặn nơi gọi). */
export function fakeSessionChatAnswer(
  ctx: SessionChatContext,
  notFound: string,
): { answer: string; citations: ChatCitations } {
  const q = ctx.question;
  if (q.includes("[that-bai]") || q.toLowerCase().includes("[fail]")) {
    throw new GeminiError("call", 500, "fake failure theo yêu cầu kiểm thử");
  }
  if (q.includes("[khong]")) return { answer: notFound, citations: [] };
  const starts = ctx.segments.map((s) => s.start_sec);
  const cite = starts.length ? [starts[0]] : [];
  const answer: Record<Lang, string> = {
    vi: "Buổi này nhắc tới: khách muốn vay 50% giá trị căn hộ, ngân sách tối đa 4,2 tỷ; lãi suất đàm phán lại còn 7 phần trăm; hai bên chốt đặt cọc trước ngày 15/11 và hẹn sáng thứ Bảy xem nhà.",
    en: "This session mentions: the client wants a 50% LTV loan with a budget cap of 4.2 billion VND; the interest rate is renegotiated to 7 percent; both sides agree a deposit before 15/11 and a viewing on Saturday morning.",
    ko: "이 녹음에서는: 고객이 아파트 가치의 50% 대출을 원하고 예산 상한은 42억이며, 금리는 7퍼센트로 재협상하기로 하고 11월 15일 전에 계약금을 하기로 했다는 내용이 있습니다.",
  };
  return { answer: answer[ctx.locale], citations: clampCitations(cite, ctx.segments, ctx.durationSec) };
}

/* ---------- Hỏi đáp của thư mục ---------- */

export type FolderSessionBlock = {
  session_id: string;
  title: string;
  durationSec: number;
  executiveSummary: string;
  bullets: Array<{ text: string; timestamp_sec: number }>;
  /** Bản chữ trích đã gắn mốc [mm:ss]; rỗng khi vượt trần ngữ cảnh tổng */
  excerpt: string;
};

export type FolderChatContext = {
  question: string;
  locale: Lang;
  folderName: string;
  blocks: FolderSessionBlock[];
};

const FOLDER_ANSWER_SCHEMA = {
  type: "object",
  properties: {
    answer: {
      type: "string",
      description: "Câu trả lời bằng ngôn ngữ được yêu cầu; chỉ dùng thông tin trong ngữ cảnh",
    },
    citations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          session: { type: "integer", description: "Số thứ tự buổi trong danh sách đã cấp, bắt đầu từ 1" },
          timestamp_sec: { type: "number", description: "Mốc giây trong buổi đó, để bấm nghe lại" },
        },
        required: ["session", "timestamp_sec"],
      },
    },
  },
  required: ["answer", "citations"],
} as const;

function folderSystemPrompt(locale: Lang, notFound: string): string {
  return [
    `Bạn là trợ lý hỏi đáp hồ sơ (thư mục các buổi ghi) của Noteim. Viết câu trả lời bằng tiếng ${LANG_NAME[locale]}, trộn thông tin từ nhiều buổi khi liên quan.`,
    `TUYỆT ĐỐI KHÔNG BỊA: chỉ dùng thông tin trong các buổi dưới đây. Không buổi nào nhắc tới câu hỏi thì trả về đúng câu "${notFound}" và citations là mảng rỗng.`,
    "Số liệu, tên riêng, ngày giờ phải đúng nguyên văn; không suy diễn, không đổi đơn vị, không dịch lại số.",
    "citations: tối đa 4 dẫn chứng, mỗi dẫn chứng là buổi (số thứ tự trong danh sách đã cấp) + mốc giây, để người dùng bấm nghe lại.",
    "Trả về đúng JSON theo schema, không thêm chữ ngoài JSON.",
  ].join(" ");
}

function folderUserPrompt(ctx: FolderChatContext): string {
  const parts = ctx.blocks.map((b) => {
    const lines = [
      `Buổi "${b.title}" (dài ${Math.round(b.durationSec)} giây):`,
      b.executiveSummary ? `Tóm tắt: ${b.executiveSummary}` : "",
      ...b.bullets.slice(0, 6).map((x) => `[${secToLabel(x.timestamp_sec)}] ${x.text}`),
      b.excerpt ? `Bản chữ trích:\n${b.excerpt}` : "",
    ].filter(Boolean);
    return lines.join("\n");
  });
  return [
    `Câu hỏi: ${ctx.question}`,
    "",
    `Hồ sơ "${ctx.folderName}" gồm ${ctx.blocks.length} buổi (đánh số từ 1):`,
    parts.join("\n\n"),
  ].join("\n");
}

function clampSec(n: number, durationSec: number): number {
  return Math.max(0, Math.min(Math.max(0, durationSec), Math.round(n)));
}

/** Hỏi AI của thư mục: trả câu trả lời + dẫn chứng {buổi, mốc giây}. */
export async function answerFolderChat(
  ctx: FolderChatContext,
  notFound: string,
): Promise<{ answer: string; citations: FolderChatCitations }> {
  if (process.env.GEMINI_FAKE === "1" && process.env.VERCEL_ENV !== "production") {
    return fakeFolderChatAnswer(ctx, notFound);
  }
  const raw = await geminiJsonCall({
    system: folderSystemPrompt(ctx.locale, notFound),
    user: folderUserPrompt(ctx),
    responseSchema: FOLDER_ANSWER_SCHEMA,
    maxOutputTokens: 2000,
    logTag: "chat",
  });
  let parsed: z.infer<typeof FolderAnswer>;
  try {
    const json = JSON.parse(raw) as unknown;
    const ok = FolderAnswer.safeParse(json);
    if (!ok.success) throw new GeminiError("parse", undefined, "JSON không đúng luật");
    parsed = ok.data;
  } catch (error) {
    if (error instanceof GeminiError) throw error;
    throw new GeminiError("parse", undefined, "JSON không đọc được");
  }
  const citations: FolderChatCitations = [];
  for (const c of parsed.citations) {
    const block = ctx.blocks[c.session - 1];
    if (!block) continue;
    const sec = clampSec(c.timestamp_sec, block.durationSec);
    if (citations.some((x) => x.session_id === block.session_id && x.timestamp_sec === sec)) continue;
    citations.push({ session_id: block.session_id, timestamp_sec: sec });
    if (citations.length >= 4) break;
  }
  return { answer: parsed.answer.trim(), citations };
}

/** Câu trả lời giả cho e2e (GEMINI_FAKE=1; production bị chặn nơi gọi). */
export function fakeFolderChatAnswer(
  ctx: FolderChatContext,
  notFound: string,
): { answer: string; citations: FolderChatCitations } {
  const q = ctx.question;
  if (q.includes("[that-bai]") || q.toLowerCase().includes("[fail]")) {
    throw new GeminiError("call", 500, "fake failure theo yêu cầu kiểm thử");
  }
  if (q.includes("[khong]")) return { answer: notFound, citations: [] };
  const first = ctx.blocks[0];
  const cite: FolderChatCitations = first ? [{ session_id: first.session_id, timestamp_sec: clampSec(16, first.durationSec) }] : [];
  const answer: Record<Lang, string> = {
    vi: `Trên ${ctx.blocks.length} buổi của hồ sơ "${ctx.folderName}": khách muốn vay 50% giá trị căn hộ, ngân sách tối đa 4,2 tỷ; lãi suất đàm phán lại còn 7 phần trăm; chốt đặt cọc trước ngày 15/11 và gửi bảng so sánh hai căn 18.06 và Imperia.`,
    en: `Across the ${ctx.blocks.length} session(s) in "${ctx.folderName}": the client wants a 50% LTV loan, budget cap 4.2 billion VND; the rate is renegotiated to 7 percent; a deposit is agreed before 15/11 and a comparison of units 18.06 and Imperia will be sent.`,
    ko: `"${ctx.folderName}" 폴더의 ${ctx.blocks.length}개 녹음 전반에서: 고객은 아파트 가치의 50% 대출을 원하고 예산 상한은 42억이며, 금리는 7퍼센트로 재협상하고 11월 15일 전에 계약금을 하기로 했습니다.`,
  };
  return { answer: answer[ctx.locale], citations: cite };
}
