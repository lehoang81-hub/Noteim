/**
 * B0-01 — Adapter Google Speech-to-Text V2, mô hình chirp_3, vi-VN.
 * CẦN KHÓA: GOOGLE_APPLICATION_CREDENTIALS (file JSON tài khoản dịch vụ Google Cloud
 * có bật Speech-to-Text). Chưa chạy được trên máy agent (thiếu khóa) — viết theo tài liệu
 * công khai https://cloud.google.com/speech-to-text/v2/docs, KHI CÓ KHÓA cần kiểm lại
 * tên trường trước khi tin số liệu.
 *
 * CÂU HỎI CỦA ISSUE: "tách người nói có chạy với tiếng Việt không" — TRẢ LỜI TỪ TÀI LIỆU
 * CÔNG KHAI (https://cloud.google.com/speech-to-text/v2/docs/chirp_3, ngày xem 2026-11-18):
 * "Language availability for diarization — Chirp 3 supports transcription and diarization only
 * in BatchRecognize and Recognize in the following languages" — danh sách gồm cmn-Hans-CN,
 * de-DE, en-GB, en-IN, en-US, es-ES, es-US, fr-CA, fr-FR, hi-IN, it-IT, ja-JP, ko-KR, pt-BR:
 * KHÔNG có vi-VN (tiếng Hàn ko-KR thì CÓ). Tức là theo tài liệu, chirp_3 TÁCH NGƯỜI NÓI KHÔNG
 * CHẠY VỚI TIẾNG VIỆT (vi-VN chỉ hỗ trợ nhận chữ, bảng ngôn ngữ tổng vi-VN mức GA); bảng tính
 * năng lại ghi "Speaker Diarization … Available only in Speech.BatchRecognize" — hai chỗ lệch
 * nhau, cần thử thật khi có khóa để chốt.
 *
 * GIỚI HẠN (cùng trang, 2026-11-18): Speech.Recognize cho âm thanh dưới 1 phút;
 * Speech.BatchRecognize cho 1 phút đến 1 giờ (bật mốc từng chữ thì tối đa 20 phút);
 * chirp_3 KHÔNG hỗ trợ mốc từng chữ (word-level timestamps) → adapter có nhánh dự phòng
 * dựng đoạn từ transcript của từng result với mốc resultEndOffset.
 * 3 file 01–03 (2,7 đến 8,5 phút) quá 1 phút → phải dùng BatchRecognize (file trên Cloud
 * Storage, URI gs://) — adapter này chỉ cài Recognize (thử với file < 1 phút khi có khóa);
 * file 04 (62 phút) VƯỢT giới hạn 1 giờ của BatchRecognize → phải cắt khúc, chưa cài.
 */
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import { apiFetch, groupTokensToSegments } from "../common.mjs";

export const provider = {
  code: "google",
  name: "Google Speech-to-Text V2 (chirp_3)",
  env: ["GOOGLE_APPLICATION_CREDENTIALS"],
  modelDefault: "chirp_3",
  languageCode: "vi-VN",
  docs: "https://cloud.google.com/speech-to-text/v2/docs",
};

function serviceAccountJson() {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!path) throw new Error("Thiếu GOOGLE_APPLICATION_CREDENTIALS (đường dẫn file JSON tài khoản dịch vụ)");
  return JSON.parse(readFileSync(path, "utf8"));
}

function base64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** Đổi tài khoản dịch vụ thành access token bằng JWT RS256 ký bằng node:crypto (không cần thư viện ngoài). */
async function accessToken(acc) {
  const iat = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: acc.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      exp: iat + 3600,
      iat,
    }),
  );
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = base64url(signer.sign(acc.private_key));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  if (!res.ok) throw new Error(`Google token: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  if (!j.access_token) throw new Error("Google token: không trả access_token");
  return j.access_token;
}

function offsetToSec(offset) {
  if (!offset) return null;
  return (Number(offset.s || 0) + Number(offset.nanos || 0) / 1e9) || null;
}

export async function transcribe({ filePath, model = provider.modelDefault }) {
  const acc = serviceAccountJson();
  const token = await accessToken(acc);
  const base = `https://speech.googleapis.com/v2/projects/${acc.project_id}/locations/global/recognizers/_:recognize`;
  const audio = readFileSync(filePath).toString("base64");
  const body = {
    config: {
      model,
      languageCodes: [provider.languageCode],
      // luôn gửi để kiểm "tách người nói có chạy với tiếng Việt không" (theo tài liệu: vi-VN không nằm trong danh sách diarization)
      diarizationConfig: { minSpeakerCount: 1, maxSpeakerCount: 4 },
    },
    audio: { content: audio },
  };
  const res = await apiFetch(base, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, "Google Speech-to-Text V2 recognize");

  const toks = [];
  let fileLang = null;
  let cursor = 0;
  for (const r of res.results || []) {
    const alt = (r.alternatives || [])[0];
    if (!alt) continue;
    const end = offsetToSec(r.resultEndOffset);
    if (Array.isArray(alt.words) && alt.words.length) {
      for (const w of alt.words) {
        toks.push({
          text: w.word,
          start_sec: offsetToSec(w.startOffset),
          end_sec: offsetToSec(w.endOffset),
          speaker: w.speakerLabel === undefined ? null : String(w.speakerLabel),
          lang: w.languageCode || r.languageCode,
        });
      }
    } else if (alt.transcript) {
      // chirp_3 không trả mốc từng chữ: dựng một đoạn cho từng result, mốc theo resultEndOffset
      toks.push({
        text: alt.transcript,
        start_sec: cursor,
        end_sec: end,
        speaker: alt.speakerLabel === undefined ? null : String(alt.speakerLabel),
        lang: r.languageCode,
      });
    }
    if (end) cursor = end;
    if (!fileLang && r.languageCode) fileLang = r.languageCode;
  }
  return {
    raw: res,
    normalized: { segments: groupTokensToSegments(toks), language: fileLang },
  };
}
