/**
 * B0-01 — Adapter Google Speech-to-Text V2, mô hình chirp_3, vi-VN.
 * CẦN KHÓA: GOOGLE_APPLICATION_CREDENTIALS (file JSON tài khoản dịch vụ Google Cloud
 * có bật Speech-to-Text). Chưa chạy được trên máy agent (thiếu khóa) — viết theo tài liệu
 * công khai https://cloud.google.com/speech-to-text/v2/docs, KHI CÓ KHÓA cần kiểm lại
 * tên trường trước khi tin số liệu.
 *
 * CÂU HỎI CỦA ISSUE: "tách người nói có chạy với tiếng Việt không" — tra tài liệu công
 * khai ngày 2026-11-18 CHƯA xác nhận được chirp_3 có tách người nói cho vi-VN hay không
 * (trang tài liệu không liệt kê ngôn ngữ cho diarization). Đã ghi trong docs/11-b0-ket-qua.md:
 * cần thử thật khi có khóa. Adapter luôn gửi diarization_config để kiểm được ngay.
 *
 * Dòng chảy:
 * 1. Đọc file JSON tài khoản dịch vụ → ký JWT RS256 (node:crypto) đổi access token
 *    (scope cloud-platform) tại https://oauth2.googleapis.com/token.
 * 2. POST https://speech.googleapis.com/v2/projects/{project}/locations/global/recognizers/_:recognize
 *    body: { config: { model: "chirp_3", languageCodes: ["vi-VN"], diarizationConfig:
 *    { minSpeakerCount: 1, maxSpeakerCount: 4 } }, audio: { content: <base64> } }.
 * 3. Đọc results[].alternatives[].words (word, startOffset/endOffset theo giây, speakerLabel)
 *    ghép thành đoạn khi đổi người nói hoặc nghỉ quá 0,8 giây.
 *
 * GIỚI HẠN CẦN KIỂM KHI CÓ KHÓA: recognize (đồng bộ, gửi base64 inline) dùng cho 3 file
 * ngắn 01–03; file dài 04 (62 phút) vượt mức gửi inline, phải dùng batchRecognize
 * kèm file trên Cloud Storage (URI gs://) — adapter này CHƯA làm batchRecognize.
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
      // luôn gửi để trả lời câu hỏi "tách người nói có chạy với tiếng Việt không"
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
  for (const r of res.results || []) {
    const alt = (r.alternatives || [])[0];
    if (!alt) continue;
    for (const w of alt.words || []) {
      toks.push({
        text: w.word,
        start_sec: offsetToSec(w.startOffset),
        end_sec: offsetToSec(w.endOffset),
        speaker: w.speakerLabel === undefined ? null : String(w.speakerLabel),
        lang: w.languageCode || r.languageCode,
      });
    }
    if (!fileLang && r.languageCode) fileLang = r.languageCode;
  }
  return {
    raw: res,
    normalized: { segments: groupTokensToSegments(toks), language: fileLang },
  };
}
