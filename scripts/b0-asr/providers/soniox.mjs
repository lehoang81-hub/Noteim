/**
 * B0-01 — Adapter Soniox (bất đồng bộ: Files API + Transcriptions API).
 * CẦN KHÓA: SONIOX_API_KEY.
 *
 * Đã kiểm với API thật ngày 2025-12-17 (tài liệu docs.soniox.com/stt/async/async-transcription
 * và openapi.yaml tại docs.soniox.com/openapi.yaml):
 * 1. POST https://api.soniox.com/v1/files (multipart: file) → { id }
 * 2. POST https://api.soniox.com/v1/transcriptions (JSON: model, file_id, language_hints,
 *    enable_language_identification, enable_speaker_diarization) → { id, status }
 *    (model async hiện hành: "stt-async-v6"; status enum: queued|processing|completed|error)
 * 3. GET /v1/transcriptions/{id} cho tới status "completed" (lỗi thì error_message)
 * 4. GET /v1/transcriptions/{id}/transcript → { text, tokens }
 *    (token: text, start_ms, end_ms, confidence, speaker?, language?)
 * 5. DELETE việc nhận dạng và file đã upload (dọn dẹp, lỗi bỏ qua).
 *
 * Token text TỰ MANG dấu cách (theo ví dụ renderTokens chính thức ghép trực tiếp),
 * nên đoạn được ghép bằng nối chuỗi trực tiếp, KHÔNG thêm khoảng trắng.
 * Đoạn tách khi đổi người nói, đổi ngôn ngữ hoặc nghỉ quá 0,8 giây.
 */
import { readFileSync } from "node:fs";
import { apiFetch, sleep, normLang } from "../common.mjs";

export const provider = {
  code: "soniox",
  name: "Soniox",
  env: ["SONIOX_API_KEY"],
  // Mô hình async hiện hành theo /v1/models (kiểm 2025-12-17): stt-async-v6.
  // Đổi bằng biến môi trường SONIOX_MODEL.
  modelDefault: "stt-async-v6",
  docs: "https://docs.soniox.com/stt/async/async-transcription",
};

const BASE = "https://api.soniox.com/v1";
const POLL_MS = 1000;
const POLL_MAX_MS = 15 * 60 * 1000; // file 62 phút xử lý có thể mất nhiều phút
const GAP_SEC = 0.8; // nghỉ quá ngưỡng thì tách đoạn
// Ngôn ngữ trong bộ test: Việt, Hàn, Anh — docs khuyến nghị đặt hints để tăng độ chính xác.
const LANG_HINTS = ["vi", "ko", "en"];

/** Ghép token Soniox thành đoạn: nối chuỗi trực tiếp (token tự mang dấu cách). */
function groupSonioxTokens(tokens) {
  const segs = [];
  let cur = null;
  for (const t of tokens) {
    if (!t || !t.text) continue;
    const lang = normLang(t.lang);
    const same =
      cur &&
      cur.speaker === t.speaker &&
      cur.lang === lang &&
      t.start_sec !== null &&
      cur.end_sec !== null &&
      t.start_sec - cur.end_sec <= GAP_SEC;
    if (same) {
      cur.text += t.text;
      cur.end_sec = t.end_sec ?? t.start_sec;
      const word = t.text.trim();
      if (word) cur.words.push({ text: word, start_sec: t.start_sec, end_sec: t.end_sec ?? t.start_sec });
    } else {
      cur = {
        speaker: t.speaker === undefined ? null : String(t.speaker),
        lang,
        start_sec: t.start_sec,
        end_sec: t.end_sec ?? t.start_sec,
        text: t.text,
        words: [{ text: t.text.trim(), start_sec: t.start_sec, end_sec: t.end_sec ?? t.start_sec }],
      };
      segs.push(cur);
    }
  }
  // bỏ từ rỗng ở đầu/cuối mỗi đoạn và lượt words rỗng
  for (const s of segs) {
    s.text = s.text.trim();
    s.words = s.words.filter((w) => w.text);
  }
  return segs;
}

export async function transcribe({ filePath, apiKey, model = provider.modelDefault }) {
  const headers = { Authorization: `Bearer ${apiKey}` };

  // 1. Đưa file lên Files API
  const form = new FormData();
  form.append("file", new Blob([readFileSync(filePath)]), filePath.split("/").pop());
  const file = await apiFetch(`${BASE}/files`, { method: "POST", headers, body: form }, "Soniox upload file");
  if (!file.id) throw new Error(`Soniox: upload không trả id file: ${JSON.stringify(file).slice(0, 300)}`);

  // 2. Tạo việc nhận dạng
  const created = await apiFetch(
    `${BASE}/transcriptions`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        file_id: file.id,
        language_hints: LANG_HINTS,
        enable_language_identification: true,
        enable_speaker_diarization: true,
      }),
    },
    "Soniox tạo việc nhận dạng",
  );
  const id = created.id;
  if (!id) throw new Error(`Soniox: không trả id việc nhận dạng: ${JSON.stringify(created).slice(0, 300)}`);

  // 3. Chờ tới completed (status: queued | processing | completed | error)
  const t0 = Date.now();
  let job = created;
  while (job.status !== "completed") {
    if (job.status === "error") {
      throw new Error(`Soniox: việc nhận dạng lỗi: ${job.error_type || ""} ${job.error_message || ""}`.trim());
    }
    if (Date.now() - t0 > POLL_MAX_MS) throw new Error("Soniox: quá 15 phút chưa xong, dừng chờ");
    await sleep(POLL_MS);
    job = await apiFetch(`${BASE}/transcriptions/${id}`, { headers }, "Soniox hỏi trạng thái");
  }

  // 4. Lấy chữ
  const transcript = await apiFetch(`${BASE}/transcriptions/${id}/transcript`, { headers }, "Soniox lấy chữ");

  // 5. Dọn dẹp trên server (lỗi bỏ qua — DELETE trả 204, không đọc JSON)
  await apiFetch(`${BASE}/transcriptions/${id}`, { method: "DELETE", headers }, "Soniox xóa việc nhận dạng").catch(() => {});
  await apiFetch(`${BASE}/files/${file.id}`, { method: "DELETE", headers }, "Soniox xóa file").catch(() => {});

  const tokens = Array.isArray(transcript.tokens) ? transcript.tokens : [];
  if (!tokens.length && transcript.text) {
    // phòng khi API không trả tokens: một đoạn duy nhất, không người nói, không mốc chữ
    return {
      raw: { file, transcription: job, transcript },
      normalized: {
        segments: [
          { speaker: null, lang: null, start_sec: 0, end_sec: null, text: String(transcript.text), words: [] },
        ],
        language: null,
      },
    };
  }
  const toks = tokens.map((t) => ({
    text: t.text,
    start_sec: t.start_ms === null || t.start_ms === undefined ? null : t.start_ms / 1000,
    end_sec: t.end_ms === null || t.end_ms === undefined ? null : t.end_ms / 1000,
    speaker: t.speaker === undefined || t.speaker === null ? null : String(t.speaker),
    lang: t.language,
  }));
  return {
    raw: { file, transcription: job, transcript },
    normalized: { segments: groupSonioxTokens(toks), language: null },
  };
}
