/**
 * B0-01 — Adapter Soniox (nhận dạng giọng nói bất đồng bộ, có tách người nói và
 * tự nhận ngôn ngữ chuyển giữa câu — lý do đưa vào thử, xem docs/10-b0-thu-rui-ro.md phần A).
 *
 * CẦN KHÓA: SONIOX_API_KEY. Chưa chạy được trên máy agent (thiếu khóa) — viết theo
 * tài liệu công khai https://soniox.com/docs, KHI CÓ KHÓA cần kiểm lại tên mô hình
 * và cấu trúc trả về trước khi tin số liệu.
 *
 * Dòng chảy theo tài liệu:
 * 1. POST https://api.soniox.com/v1/transcriptions (multipart: file, model) → { id }
 * 2. GET  https://api.soniox.com/v1/transcriptions/{id} cho tới status "completed"
 * 3. GET  https://api.soniox.com/v1/transcriptions/{id}/transcript → tokens
 *    (mỗi token: text, start_ms, duration_ms, speaker, language)
 * Token được ghép thành đoạn khi đổi người nói, đổi ngôn ngữ hoặc nghỉ quá 0,8 giây.
 */
import { readFileSync } from "node:fs";
import { apiFetch, sleep, groupTokensToSegments } from "../common.mjs";

export const provider = {
  code: "soniox",
  name: "Soniox",
  env: ["SONIOX_API_KEY"],
  // Tài liệu có badge "stt-v6" (mô hình STT mới nhất); trang giá nêu "stt-rt-v6" cho streaming.
  // Tên model async chính xác cần kiểm khi có khóa (đổi bằng biến môi trường SONIOX_MODEL).
  modelDefault: "stt-v6",
  docs: "https://soniox.com/docs",
};

const BASE = "https://api.soniox.com/v1";
const POLL_MS = 1000;
const POLL_MAX_MS = 15 * 60 * 1000; // file 62 phút xử lý có thể mất nhiều phút

export async function transcribe({ filePath, apiKey, model = provider.modelDefault }) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  const form = new FormData();
  const bytes = readFileSync(filePath);
  form.append("file", new Blob([bytes]), filePath.split("/").pop());
  form.append("model", model);
  const created = await apiFetch(`${BASE}/transcriptions`, { method: "POST", headers, body: form }, "Soniox tạo việc nhận dạng");
  const id = created.id;
  if (!id) throw new Error(`Soniox: không trả id việc nhận dạng: ${JSON.stringify(created).slice(0, 300)}`);

  const t0 = Date.now();
  let job = created;
  while (job.status !== "completed") {
    if (job.status === "failed" || job.status === "error") {
      throw new Error(`Soniox: việc nhận dạng lỗi: ${JSON.stringify(job).slice(0, 500)}`);
    }
    if (Date.now() - t0 > POLL_MAX_MS) throw new Error("Soniox: quá 15 phút chưa xong, dừng chờ");
    await sleep(POLL_MS);
    job = await apiFetch(`${BASE}/transcriptions/${id}`, { headers }, "Soniox hỏi trạng thái");
  }

  const transcript = await apiFetch(`${BASE}/transcriptions/${id}/transcript`, { headers }, "Soniox lấy chữ");
  const tokens = Array.isArray(transcript.tokens) ? transcript.tokens : [];
  if (!tokens.length && transcript.final_ui_text) {
    // phòng khi API chỉ trả chữ nguyên khối: một đoạn duy nhất, không người nói, không mốc chữ
    return {
      raw: { created, job, transcript },
      normalized: {
        segments: [
          {
            speaker: null,
            lang: null,
            start_sec: 0,
            end_sec: null,
            text: String(transcript.final_ui_text),
            words: [],
          },
        ],
        language: null,
      },
    };
  }
  const toks = tokens.map((t) => ({
    text: t.text,
    start_sec: t.start_ms === null || t.start_ms === undefined ? null : t.start_ms / 1000,
    end_sec: t.duration_ms === null || t.duration_ms === undefined ? null : (t.start_ms + t.duration_ms) / 1000,
    speaker: t.speaker === undefined ? null : t.speaker,
    lang: t.language,
  }));
  return {
    raw: { created, job, transcript },
    normalized: { segments: groupTokensToSegments(toks), language: null },
  };
}
