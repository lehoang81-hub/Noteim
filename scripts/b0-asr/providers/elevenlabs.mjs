/**
 * B0-01 — Adapter ElevenLabs Scribe (bản batch, có tách người nói).
 * CẦN KHÓA: ELEVENLABS_API_KEY. Chưa chạy được trên máy agent (thiếu khóa) — viết theo
 * tài liệu công khai https://elevenlabs.io/docs/capabilities/speech-to-text, KHI CÓ KHÓA
 * cần kiểm lại tên mô hình và cấu trúc trả về trước khi tin số liệu.
 *
 * Dòng chảy:
 * 1. POST https://api.elevenlabs.io/v1/speech-to-text (multipart: file, model_id, diarize)
 *    header xi-api-key. Trả { language_code, language_probability, text, words: [...] }
 *    với words: { text, start, end (giây), speaker_id ("A","B",...), type: "word"|"spacing" }.
 * 2. Bỏ token "spacing", ghép thành đoạn khi đổi người nói hoặc nghỉ quá 0,8 giây
 *    (dùng chung groupTokensToSegments ở common.mjs).
 *
 * Ghi chú: Scribe tự nhận ngôn ngữ (để trống language_code cho file đa ngôn ngữ 02);
 * thời gian trả về theo giây. Giới hạn file dài cần kiểm lại khi có khóa.
 */
import { readFileSync } from "node:fs";
import { apiFetch, groupTokensToSegments } from "../common.mjs";

export const provider = {
  code: "elevenlabs",
  name: "ElevenLabs Scribe",
  env: ["ELEVENLABS_API_KEY"],
  // Tài liệu (2026-11-18): "Use Scribe v3 for recorded audio" — tách người nói tới 32 người,
  // mốc từng chữ, hỗ trợ âm thanh đa ngôn ngữ. Tên model_id chính xác cần kiểm khi có khóa
  // (id đời trước đã biết: scribe_v1); đổi bằng biến môi trường ELEVENLABS_MODEL.
  modelDefault: "scribe_v3",
  docs: "https://elevenlabs.io/docs/capabilities/speech-to-text",
};

const BASE = "https://api.elevenlabs.io/v1";

export async function transcribe({ filePath, apiKey, model = provider.modelDefault }) {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(filePath)]), filePath.split("/").pop());
  form.append("model_id", model);
  form.append("diarize", "true");
  // không đặt language_code — để Scribe tự nhận (file 02 nói lẫn Việt, Hàn, Anh)
  const res = await apiFetch(`${BASE}/speech-to-text`, { method: "POST", headers: { "xi-api-key": apiKey }, body: form }, "ElevenLabs speech-to-text");

  const words = Array.isArray(res.words) ? res.words : [];
  const toks = words
    .filter((w) => w.type !== "spacing" && w.text)
    .map((w) => ({
      text: w.text,
      start_sec: w.start,
      end_sec: w.end,
      speaker: w.speaker_id === undefined ? null : String(w.speaker_id),
      lang: w.language ?? res.language_code,
    }));
  return {
    raw: res,
    normalized: { segments: groupTokensToSegments(toks), language: res.language_code ?? null },
  };
}
