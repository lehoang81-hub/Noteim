/**
 * B0-01 — Tiện ích chung cho các adapter nhà cung cấp nhận dạng giọng nói.
 * Mọi adapter chuyển kết quả thô của hãng về ĐỊNH DẠNG CHUẨN HÓA khai báo ở đầu
 * scripts/b0-asr/score.mjs (mảng segments: speaker, lang, start_sec, end_sec, text, words).
 */

/** Chuẩn hóa mã ngôn ngữ của hãng ("vi-VN", "ko", "en-US") về 2 chữ cái ("vi","ko","en"). */
export function normLang(code) {
  if (!code) return null;
  return String(code).toLowerCase().slice(0, 2);
}

/**
 * Ghép các token mốc từng chữ thành đoạn: tách đoạn khi đổi người nói, đổi ngôn ngữ
 * hoặc nghỉ quá `gapSec` giây. Token: {text, start_sec, end_sec, speaker?, lang?}.
 * Trả mảng segment theo định dạng chuẩn hóa (speaker null nếu không có tách người nói).
 */
export function groupTokensToSegments(tokens, { gapSec = 0.8 } = {}) {
  const segs = [];
  let cur = null;
  for (const t of tokens) {
    if (!t || !t.text || t.start_sec === null || t.start_sec === undefined) continue;
    const speaker = t.speaker === undefined || t.speaker === null ? null : String(t.speaker);
    const lang = normLang(t.lang);
    const same =
      cur &&
      cur.speaker === speaker &&
      cur.lang === lang &&
      t.start_sec - cur.end_sec <= gapSec;
    if (same) {
      cur.text += (cur.text ? " " : "") + t.text;
      cur.end_sec = t.end_sec ?? t.start_sec;
      cur.words.push({ text: t.text, start_sec: t.start_sec, end_sec: t.end_sec ?? t.start_sec });
    } else {
      cur = {
        speaker,
        lang,
        start_sec: t.start_sec,
        end_sec: t.end_sec ?? t.start_sec,
        text: t.text,
        words: [{ text: t.text, start_sec: t.start_sec, end_sec: t.end_sec ?? t.start_sec }],
      };
      segs.push(cur);
    }
  }
  return segs;
}

/** Hoàn thiện kết quả chuẩn hóa: điền các trường mặc định còn thiếu. */
export function normalizeResult({ provider, file, model = null, processing_ms = null, language = null, segments = [], raw_meta = {} }) {
  return {
    provider,
    file,
    model,
    processing_ms,
    audio_duration_sec: raw_meta.audio_duration_sec ?? null,
    language,
    segments,
  };
}

/** Gọi fetch kèm thông báo lỗi rõ khi mã trạng thái không phải 2xx. */
export async function apiFetch(url, options = {}, label = "API") {
  let res;
  try {
    res = await fetch(url, options);
  } catch (e) {
    throw new Error(`${label}: lỗi mạng ${e.message}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${label}: HTTP ${res.status} ${text.slice(0, 500)}`);
  }
  return res.json();
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
