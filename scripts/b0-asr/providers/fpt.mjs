/**
 * B0-01 — Adapter FPT.AI Speech to Text (tùy chọn, nhà cung cấp trong nước).
 * CẦN KHÓA: FPT_STT_KEY. Chưa chạy được trên máy agent (thiếu khóa) — viết theo tài liệu
 * công khai https://fpt.ai/vi/speech-to-text/, KHI CÓ KHÓA cần kiểm lại tên trường.
 *
 * Dòng chảy:
 * 1. POST https://api.fpt.ai/hmi/asr/v15 (multipart: file) với header "api-key".
 *    Trả khoảng { code: 200, message, result: { hypotheses: [{ utterance, confidence }] } }.
 * 2. FPT trả chữ cả file trong MỘT utterance: không có mốc từng chữ, không có tách người
 *    nói, chỉ nhận tiếng Việt (file 02 có đoạn Hàn/Anh sẽ chỉ nhận phần Việt — khi có khóa
 *    ghi rõ vào bảng chỉ số). Ghép thành MỘT đoạn duy nhất, speaker null, lang "vi".
 *
 * GIỚI HẠN CẦN KIỂM KHI CÓ KHÓA: tài liệu công bố file ≤ 1 phút cho API asr/v15 (file dài
 * cần dịch vụ riêng của FPT) — 3 file ngắn 01–03 đều dài hơn 1 phút (6,7 / 8,5 / 2,7 phút),
 * nếu bị chặn thì báo lỗi từ API và ghi vào báo cáo.
 */
import { readFileSync } from "node:fs";
import { apiFetch } from "../common.mjs";

export const provider = {
  code: "fpt",
  name: "FPT.AI Speech to Text",
  env: ["FPT_STT_KEY"],
  modelDefault: null,
  docs: "https://fpt.ai/vi/speech-to-text/",
};

const BASE = "https://api.fpt.ai/hmi/asr/v15";

export async function transcribe({ filePath, apiKey }) {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(filePath)]), filePath.split("/").pop());
  const res = await apiFetch(BASE, { method: "POST", headers: { "api-key": apiKey }, body: form }, "FPT.AI asr");

  const hyps = res?.result?.hypotheses || [];
  const text = hyps.map((h) => h.utterance || "").join(" ").trim();
  const segments = text
    ? [{ speaker: null, lang: "vi", start_sec: null, end_sec: null, text, words: [] }]
    : [];
  return { raw: res, normalized: { segments, language: "vi" } };
}
