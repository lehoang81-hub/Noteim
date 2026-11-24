/**
 * C1-05 — khói API thật: Soniox nhận dạng + Gemini tóm tắt trên MỘT file ngắn.
 *
 * Chạy khi máy có khóa trong môi trường:
 *   SONIOX_API_KEY=... GEMINI_API_KEY=... node scripts/asr-smoke.mjs
 * (GEMINI_MODEL tùy chọn — mặc định gemini-3-5-flash-lite theo trang chính thức.)
 *
 * Thiếu khóa thì in rõ "chưa kiểm chứng" và thoát mã 0 — không tự bịa kết quả.
 *
 * Flow Soniox (theo đặc tả docs.soniox.com/openapi.yaml + adapter B0 đã gọi
 * thật ngày 19/11 — scripts/b0-asr/providers/soniox.mjs): file ngắn không có
 * URL công khai nên đi qua Files API (multipart) rồi tạo việc với file_id;
 * poll tới completed; lấy transcript tokens; DELETE cả việc lẫn file.
 *
 * Gemini: REST generateContent, responseMimeType application/json +
 * responseSchema rút gọn (đủ kiểm hình dạng), model GEMINI_MODEL hoặc
 * gemini-3.5-flash-lite (aistudio.google.com/docs/models, xem 25/11/2026).
 *
 * Kết quả chi tiết ghi vào test-data/asr-smoke-result.json; màn hình chỉ in
 * số đếm + thời gian (không in bản chữ/tóm tắt — quy tắc riêng tư như app).
 */
import { readFileSync, writeFileSync } from "node:fs";

const SONIOX_BASE = "https://api.soniox.com/v1";
const GEMINI_BASE = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const LANG_HINTS = ["vi", "ko", "en"];
const POLL_MAX_MS = 10 * 60_000;

const fileArg = process.argv[2] || "test-data/audio/03-bac-si-kham.m4a";
const result = { file: fileArg, soniox: null, gemini: null, cost_estimate_usd: null };

function say(msg) {
  console.log(msg);
}

function fail(msg) {
  say(`[asr-smoke] LỖI: ${msg}`);
  writeFileSync("test-data/asr-smoke-result.json", JSON.stringify(result, null, 2));
  process.exit(1);
}

let audio;
try {
  audio = readFileSync(fileArg);
} catch {
  fail(`không đọc được file ${fileArg} — thử truyền đường dẫn khác (ví dụ test-data/audio/02-hop-doi-tac-han.m4a)`);
}

const sonioxKey = process.env.SONIOX_API_KEY;
const geminiKey = process.env.GEMINI_API_KEY;
if (!sonioxKey || !geminiKey) {
  say("chưa kiểm chứng — thiếu khóa:");
  if (!sonioxKey) say("  - SONIOX_API_KEY (Soniox async, stt-async-v6)");
  if (!geminiKey) say("  - GEMINI_API_KEY (Gemini tóm tắt)");
  say("Đặt hai khóa vào môi trường rồi chạy lại: SONIOX_API_KEY=... GEMINI_API_KEY=... node scripts/asr-smoke.mjs");
  process.exit(0);
}

/* ---------- 1. Soniox ---------- */

const t0 = Date.now();
say(`[asr-smoke] 1) Soniox: upload ${fileArg} (${(audio.byteLength / 1e6).toFixed(2)} MB)…`);
const form = new FormData();
form.append("file", new Blob([audio]), fileArg.split("/").pop());
const upRes = await fetch(`${SONIOX_BASE}/files`, {
  method: "POST",
  headers: { Authorization: `Bearer ${sonioxKey}` },
  body: form,
});
if (!upRes.ok) fail(`upload file HTTP ${upRes.status}`);
const uploaded = await upRes.json();
if (!uploaded.id) fail("upload không trả id file");

say("[asr-smoke] 2) tạo việc nhận dạng (stt-async-v6, hints vi/ko/en, tách người nói)…");
const jobRes = await fetch(`${SONIOX_BASE}/transcriptions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${sonioxKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: process.env.SONIOX_MODEL || "stt-async-v6",
    file_id: uploaded.id,
    language_hints: LANG_HINTS,
    enable_language_identification: true,
    enable_speaker_diarization: true,
  }),
});
if (!jobRes.ok) fail(`tạo việc HTTP ${jobRes.status}`);
const job = await jobRes.json();
if (!job.id) fail("không trả id việc nhận dạng");

say("[asr-smoke] 3) poll trạng thái…");
let final = job;
const pollStart = Date.now();
while (final.status !== "completed") {
  if (final.status === "error") fail(`việc nhận dạng lỗi: ${final.error_type || ""} ${final.error_message || ""}`);
  if (Date.now() - pollStart > POLL_MAX_MS) fail("quá 10 phút chưa xong");
  await new Promise((r) => setTimeout(r, 1500));
  const r = await fetch(`${SONIOX_BASE}/transcriptions/${job.id}`, { headers: { Authorization: `Bearer ${sonioxKey}` } });
  if (!r.ok) fail(`poll HTTP ${r.status}`);
  final = await r.json();
}
const trRes = await fetch(`${SONIOX_BASE}/transcriptions/${job.id}/transcript`, { headers: { Authorization: `Bearer ${sonioxKey}` } });
if (!trRes.ok) fail(`lấy chữ HTTP ${trRes.status}`);
const transcript = await trRes.json();
const tokens = Array.isArray(transcript.tokens) ? transcript.tokens : [];
await fetch(`${SONIOX_BASE}/transcriptions/${job.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${sonioxKey}` } }).catch(() => {});
await fetch(`${SONIOX_BASE}/files/${uploaded.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${sonioxKey}` } }).catch(() => {});

// Ghép đoạn (như adapter B0: đổi người nói/nghỉ > 0.8s thì tách)
const segments = [];
let cur = null;
for (const t of tokens) {
  if (!t.text) continue;
  const start = t.start_ms == null ? cur?.end_sec ?? 0 : t.start_ms / 1000;
  const end = t.end_ms == null ? start : t.end_ms / 1000;
  const lang = t.language ?? null;
  const same = cur && cur.speaker === t.speaker && cur.lang === lang && end - cur.end_sec <= 0.8;
  if (same) {
    cur.text += t.text;
    cur.end_sec = end;
  } else {
    cur = { speaker: t.speaker ?? null, lang, start_sec: start, end_sec: end, text: t.text };
    segments.push(cur);
  }
}
for (const s of segments) s.text = s.text.trim();
const durationSec = tokens.length ? Math.max(...tokens.map((t) => (t.end_ms ?? 0) / 1000)) : 0;
result.soniox = {
  model: process.env.SONIOX_MODEL || "stt-async-v6",
  tokens: tokens.length,
  segments: segments.length,
  speakers: new Set(tokens.map((t) => t.speaker).filter((s) => s !== undefined && s !== null)).size,
  duration_sec: Math.round(durationSec),
  poll_ms: Date.now() - pollStart,
  total_ms: Date.now() - t0,
  languages: [...new Set(tokens.map((t) => t.language).filter(Boolean))],
  segments_full: segments,
};
say(`[asr-smoke]    → ${tokens.length} token, ${segments.length} đoạn, ${result.soniox.speakers} người nói, ${Math.round(durationSec)}s audio, xử lý ${result.soniox.poll_ms} ms`);

/* ---------- 2. Gemini ---------- */

const g0 = Date.now();
say(`[asr-smoke] 4) Gemini tóm tắt (model ${GEMINI_MODEL})…`);
const transcriptText = segments
  .map((s, i) => {
    const order = [...new Set(segments.map((x) => x.speaker ?? "?"))];
    return `[${String(Math.floor(s.start_sec / 60)).padStart(2, "0")}:${String(Math.floor(s.start_sec % 60)).padStart(2, "0")}] Người nói ${(order.indexOf(s.speaker ?? "?") ?? 0) + 1}: ${s.text}`;
  })
  .join("\n");

const schema = {
  type: "object",
  properties: {
    executive_summary: { type: "string" },
    topics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          section_id: { type: "string", enum: ["tpl-realestate-s1", "tpl-realestate-s2", "tpl-realestate-s3", "tpl-realestate-s4", "tpl-realestate-s5", "tpl-realestate-s6"] },
          title: { type: "string" },
          tag: { type: "string", enum: ["decided", "pending", "risk", "idea", "figure"] },
          bullets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                timestamp_sec: { type: "number" },
                speaker_index: { type: "integer" },
                is_quote: { type: "boolean" },
              },
              required: ["text", "timestamp_sec", "speaker_index", "is_quote"],
            },
          },
        },
        required: ["section_id", "title", "tag", "bullets"],
      },
    },
    action_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          task: { type: "string" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          due_date: { type: "string", nullable: true },
          timestamp_sec: { type: "number", nullable: true },
          source_quote: { type: "string", nullable: true },
        },
        required: ["task", "priority", "due_date", "timestamp_sec", "source_quote"],
      },
    },
  },
  required: ["executive_summary", "topics", "action_items"],
};

const gRes = await fetch(`${GEMINI_BASE}/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
  body: JSON.stringify({
    system_instruction: {
      parts: [
        {
          text: "Bạn là trợ lý lập biên bản buổi họp cho Noteim, viết tiếng Việt. CHỈ dùng thông tin trong bản chữ; số liệu/tên/ngày phải đúng nguyên văn; không nêu được thì để rỗng. Mỗi ý có timestamp_sec khớp mốc trong bản chữ. Trả JSON đúng schema.",
        },
      ],
    },
    contents: [{ role: "user", parts: [{ text: `Thời lượng: ${Math.round(durationSec)} giây.\n\nBản chữ:\n${transcriptText}` }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 4000, responseMimeType: "application/json", responseSchema: schema },
  }),
  signal: AbortSignal.timeout(90_000),
});
if (!gRes.ok) fail(`Gemini HTTP ${gRes.status}: ${(await gRes.text()).slice(0, 200)}`);
const gJson = await gRes.json();
const gText = (gJson.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
if (!gText) fail("Gemini trả phản hồi trống");
let plan;
try {
  plan = JSON.parse(gText);
} catch {
  fail("Gemini trả JSON không đọc được");
}
result.gemini = {
  model: GEMINI_MODEL,
  executive_summary_chars: (plan.executive_summary || "").length,
  topics: (plan.topics || []).length,
  bullets: (plan.topics || []).reduce((n, t) => n + (t.bullets?.length ?? 0), 0),
  action_items: (plan.action_items || []).length,
  ms: Date.now() - g0,
  plan,
};
say(`[asr-smoke]    → ${result.gemini.topics} chủ đề, ${result.gemini.bullets} ý, ${result.gemini.action_items} việc, ${result.gemini.ms} ms`);

/* ---------- 3. Chi phí ước tính ---------- */

const hours = durationSec / 3600;
result.cost_estimate_usd = {
  soniox_usd: Math.round(hours * 0.106 * 10000) / 10000,
  note: "Soniox ≈ 0,106 USD/giờ đo thật B0 (docs/11); Gemini flash-lite tính riêng theo bill",
};
say(`[asr-smoke] 5) Chi phí ước tính lần gọi này: Soniox ≈ ${result.cost_estimate_usd.soniox_usd} USD (${Math.round(durationSec)}s audio)`);
say(`[asr-smoke] XONG — kết quả đầy đủ (kèm bản chữ/tóm tắt) ở test-data/asr-smoke-result.json`);
writeFileSync("test-data/asr-smoke-result.json", JSON.stringify(result, null, 2));
