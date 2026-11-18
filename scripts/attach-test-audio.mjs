#!/usr/bin/env node
/*
 * Gắn âm thanh thật (M9-01, issue #65) vào 3 buổi mẫu — đọc thời lượng và năng
 * lượng từ chính file .m4a trong test-data/audio (PR #64), đổi mốc mọi dữ liệu
 * của fixture theo đáp án .truth.json rồi ghi lại:
 *
 * - `duration_sec` = độ dài file, `size_bytes` = dung lượng file, thêm
 *   `audio_url` ("/audio/<tên>.m4a"); chép .m4a vào public/audio/.
 * - Đoạn bản ghi lời: start_sec/end_sec lấy từ truth.json (khớp theo id).
 * - Ánh xạ thời gian cũ -> mới bằng keyframes gấp khúc (mốc đầu/cuối từng
 *   đoạn + biên buổi): mọi `source_ref` (ý tóm tắt, việc, trích dẫn, biểu đồ,
 *   ghi chú, dấu trang, ảnh, trích dẫn Hỏi AI, bản tóm tắt dịch, lượt nói,
 *   nghe thử người nói) đổi theo mốc mới. Khoảng trống giữa hai đoạn và phần
 *   đuôi buổi (ngoài đoạn lời) nén theo tỉ lệ tuyến tính — thứ tự không đổi.
 * - `peaks`, `peaks_thumb` sinh lại từ RMS thật của file (quy về 0..1 theo
 *   tầng ồn và mức nói của chính buổi để dải giọng trông như trước), màu
 *   `speaker_colors_thumb` theo lượt nói mới.
 * - `ListeningMap` tính lại từ âm thanh: khoảng lặng là chỗ năng lượng dưới
 *   ngưỡng liền nhau hơn 1,5 giây; `speaker_gain_db` là mức cần tăng/giảm để
 *   đưa từng người về mức trung bình (đo RMS thật trong lượt nói, giữ -6
 *   đến +9 dB); `noise_level` theo độ chênh giữa mức nói và mức nền;
 *   `clean_duration_sec` = thời lượng trừ các khoảng lặng. Tiếng đệm dò lại
 *   từ chữ trong câu (cùng luật với scripts/gen-listening-map.mjs), mốc theo
 *   thời gian mới.
 * - Ghi `fixtures/audio-attach.json`: dữ liệu ánh xạ và bản đồ nghe cho migrate
 *   chuyển kho localStorage cũ (lib/data/mock/audio-attach.ts).
 *
 * Chạy: node scripts/attach-test-audio.mjs   (cần ffmpeg + ffprobe trong PATH)
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const AUDIO_DIR = path.join(ROOT, "test-data", "audio");
const PUB_DIR = path.join(ROOT, "public", "audio");

const FIXTURES = [
  { fixture: "fixtures/sessions/bds-gap-chi-lan.json", base: "01-bds-gap-chi-lan" },
  { fixture: "fixtures/sessions/hop-doi-tac-han.json", base: "02-hop-doi-tac-han" },
  { fixture: "fixtures/samples/doctor.json", base: "03-bac-si-kham" },
];

/** Luật tiếng đệm trùng với scripts/gen-listening-map.mjs (M8-01). */
const SAFE_FILLERS = new Set(["à", "ừ", "ờ", "ừm", "ừhm"]);
const EXTRA_FILLERS = { "s-bds-lan": { g18: ["thì là"], g21: ["kiểu"], g4: ["thì là"] } };

const SAMPLE_RATE = 16000;   // giải mã về mono 16 kHz để đo năng lượng
const FRAME_SEC = 0.05;      // khung đo RMS 50 ms
const SILENCE_MIN = 1.5;     // khoảng lặng tính từ 1,5 giây (docs/09)
const MERGE_GAP = 2.0;       // gộp lượt nói cùng người khi cách nhau dưới 2 giây
const PEAKS_N = 600;
const THUMB_N = 40;
const GAIN_MIN = -6;         // schema ListeningMap.speaker_gain_db
const GAIN_MAX = 9;

const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function ffprobeDuration(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], {
    encoding: "utf8",
  });
  return Number(out.trim());
}

/** Giải mã về PCM mono 16 kHz, trả mảng mẫu -1..1 (đọc file s16le tạm). */
function decodePcm(file) {
  const tmp = path.join(tmpdir(), `noteim-attach-${path.basename(file, ".m4a")}.s16le`);
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", file, "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "s16le", tmp]);
  const buf = readFileSync(tmp);
  unlinkSync(tmp);
  const n = buf.length >> 1;
  const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) pcm[i] = buf.readInt16LE(i * 2) / 32768;
  return pcm;
}

/** RMS dBFS của từng khung 50 ms. */
function frameDb(pcm) {
  const size = Math.round(FRAME_SEC * SAMPLE_RATE);
  const n = Math.floor(pcm.length / size);
  const db = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let sum = 0;
    for (let i = f * size; i < (f + 1) * size; i++) sum += pcm[i] * pcm[i];
    db[f] = 20 * Math.log10(Math.sqrt(sum / size) + 1e-9);
  }
  return db;
}

function percentile(arr, p) {
  const sorted = Float32Array.from(arr).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/**
 * Khoảng lặng: khoảng trống giữa hai đoạn lời (theo mốc của đáp án) dài hơn
 * 1,5 giây VÀ phần lớn khung trong đó im (dưới tầng ồn + 8 dB). Xác năng
 * lượng trong lịch phát đã biết — ồn phòng biến động (điều hòa, gọi số) không
 * bị đếm nhầm thành khoảng lặng giữa lời.
 */
function findSilences(db, floorDb, segments, frameAt) {
  const thr = floorDb + 8;
  const out = [];
  let prevEnd = 0;
  for (const s of segments) {
    const gapStart = prevEnd;
    const gapEnd = s.start_sec;
    if (gapEnd - gapStart >= SILENCE_MIN) {
      let quiet = 0;
      for (let t = gapStart; t < gapEnd; t += FRAME_SEC) if (frameAt(t) < thr) quiet += FRAME_SEC;
      if (quiet >= SILENCE_MIN) out.push({ start_sec: r1(gapStart), end_sec: r1(gapEnd) });
    }
    prevEnd = Math.max(prevEnd, s.end_sec);
  }
  return out;
}

/** dò token tiếng đệm + cụm ghi tay; mốc chia đều theo số ký tự trong đoạn (M8-01). */
function findFillers(transcript, extraBySeg) {
  const stripPunct = (w) => w.toLocaleLowerCase("vi").replace(/[.,!?…;:()"'“”–—-]/g, "");
  const out = [];
  for (const s of transcript) {
    const re = /\S+/g;
    let m;
    while ((m = re.exec(s.text))) {
      const w = stripPunct(m[0]);
      if (!SAFE_FILLERS.has(w)) continue;
      const len = Math.max(1, s.text.length);
      out.push({
        start_sec: r1(s.start_sec + ((s.end_sec - s.start_sec) * m.index) / len),
        end_sec: r1(s.start_sec + ((s.end_sec - s.start_sec) * (m.index + m[0].length)) / len),
        text: m[0],
      });
    }
    for (const phrase of extraBySeg[s.id] ?? []) {
      const idx = s.text.indexOf(phrase);
      if (idx < 0) throw new Error(`Không tìm thấy "${phrase}" trong ${s.id}`);
      const len = Math.max(1, s.text.length);
      out.push({
        start_sec: r1(s.start_sec + ((s.end_sec - s.start_sec) * idx) / len),
        end_sec: r1(s.start_sec + ((s.end_sec - s.start_sec) * (idx + phrase.length)) / len),
        text: phrase,
      });
    }
  }
  return out.sort((a, b) => a.start_sec - b.start_sec);
}

function processOne({ fixture, base }) {
  const filePath = path.join(ROOT, fixture);
  const m4a = path.join(AUDIO_DIR, `${base}.m4a`);
  const truth = JSON.parse(readFileSync(path.join(AUDIO_DIR, `${base}.truth.json`), "utf8"));
  const fx = JSON.parse(readFileSync(filePath, "utf8"));
  const det = fx.detail;
  const oldDuration = det.duration_sec;
  const oldTranscript = fx.transcript;

  // ---- thời gian và năng lượng từ chính file âm thanh ----
  const duration = r1(ffprobeDuration(m4a));
  const sizeBytes = statSync(m4a).size;
  const db = frameDb(decodePcm(m4a));
  const totalSec = db.length * FRAME_SEC;
  if (Math.abs(totalSec - duration) > 1) throw new Error(`${base}: giải mã ra ${totalSec}s nhưng ffprobe nói ${duration}s`);
  const floorDb = percentile(db, 0.1);
  const speechDb = percentile(db, 0.75);

  // ---- đáp án: đoạn lời theo id ----
  const byId = new Map(truth.segments.map((s) => [s.id, s]));
  for (const s of oldTranscript) {
    if (!byId.has(s.id)) throw new Error(`${base}: truth thiếu đoạn ${s.id}`);
  }
  const segsNew = new Map(truth.segments.map((s) => [s.id, [s.start_sec, s.end_sec]]));

  // ---- keyframes ánh xạ thời gian cũ -> mới (gấp khúc tuyến tính) ----
  const keyframes = [];
  const firstOld = oldTranscript[0].start_sec;
  if (firstOld > 0) keyframes.push([0, 0]); // buổi cũ có phần đầu trước khi nói
  for (const s of oldTranscript) {
    const t = byId.get(s.id);
    keyframes.push([s.start_sec, t.start_sec], [s.end_sec, t.end_sec]);
  }
  const lastOld = oldTranscript[oldTranscript.length - 1].end_sec;
  if (oldDuration > lastOld) keyframes.push([oldDuration, duration]);
  for (let i = 1; i < keyframes.length; i++) {
    // Hai đoạn liền nhau (không khoảng trống) cho hai keyframe trùng mốc cũ — chỉ cấm lùi
    if (keyframes[i][0] < keyframes[i - 1][0]) throw new Error(`${base}: keyframes lùi tại ${i}`);
  }

  const mapTime = (t) => {
    if (t <= keyframes[0][0]) return keyframes[0][1]; // trước đoạn đầu: trúng đầu file
    if (t >= keyframes[keyframes.length - 1][0]) return keyframes[keyframes.length - 1][1]; // quá cuối: hết file
    for (let i = 1; i < keyframes.length; i++) {
      const [x0, y0] = keyframes[i - 1];
      const [x1, y1] = keyframes[i];
      if (t <= x1) return y0 + ((t - x0) / (x1 - x0)) * (y1 - y0);
    }
    return duration;
  };
  // tự kiểm: điểm giữa từng đoạn ánh xạ vào đúng đoạn đó (biên hai đoạn liền
  // nhau trúng cuối đoạn trước là đúng — mốc chung của hai câu)
  for (const s of oldTranscript) {
    const t = byId.get(s.id);
    const mid = mapTime((s.start_sec + s.end_sec) / 2);
    if (mid < t.start_sec - 0.01 || mid > t.end_sec + 0.01) throw new Error(`${base}: ánh xạ sai cho đoạn ${s.id}`);
  }

  // ---- lượt nói mới: gộp đoạn liền nhau cùng người (cách nhau dưới 2 giây) ----
  const spans = [];
  for (const s of truth.segments) {
    const last = spans[spans.length - 1];
    if (last && last.speaker_id === s.speaker_id && s.start_sec - last.end_sec <= MERGE_GAP) last.end_sec = s.end_sec;
    else spans.push({ speaker_id: s.speaker_id, start_sec: s.start_sec, end_sec: s.end_sec });
  }
  const talkTotal = spans.reduce((sum, sp) => sum + (sp.end_sec - sp.start_sec), 0);
  const talkRatio = {};
  for (const sp of det.speakers) {
    const mine = spans.filter((x) => x.speaker_id === sp.id).reduce((sum, x) => sum + (x.end_sec - x.start_sec), 0);
    talkRatio[sp.id] = Math.round((mine / talkTotal) * 100);
  }

  // ---- cân âm lượng: RMS thật của từng người trong lượt nói (trung bình năng lượng) ----
  const frameAt = (t) => db[clamp(Math.floor(t / FRAME_SEC), 0, db.length - 1)];
  const powerDb = (frames) => 10 * Math.log10(frames.reduce((s, x) => s + 10 ** (x / 10), 0) / Math.max(1, frames.length) + 1e-9);
  const levels = {};
  for (const sp of det.speakers) {
    const frames = [];
    for (const x of spans.filter((v) => v.speaker_id === sp.id)) {
      for (let t = x.start_sec; t < x.end_sec; t += FRAME_SEC) frames.push(frameAt(t));
    }
    if (!frames.length) throw new Error(`${base}: người nói ${sp.id} không còn lượt nói nào`);
    levels[sp.id] = powerDb(frames);
  }
  const avgLevel = det.speakers.reduce((s, sp) => s + levels[sp.id], 0) / det.speakers.length;
  const gain = {};
  for (const sp of det.speakers) gain[sp.id] = clamp(Math.round(avgLevel - levels[sp.id]), GAIN_MIN, GAIN_MAX);

  // ---- khoảng lặng, mức ồn, thời lượng nghe sạch ----
  const silences = findSilences(db, floorDb, truth.segments, frameAt);
  const noiseFrames = [];
  for (const sil of silences) for (let t = sil.start_sec; t < sil.end_sec; t += FRAME_SEC) noiseFrames.push(frameAt(t));
  const noiseDb = noiseFrames.length ? powerDb(noiseFrames) : floorDb;
  const gapDb = speechDb - noiseDb;
  const noiseLevel = gapDb >= 28 ? "low" : gapDb >= 20 ? "medium" : "high";
  const cleanDuration = Math.round(duration - silences.reduce((s, x) => s + (x.end_sec - x.start_sec), 0));

  // ---- peaks từ RMS thật, quy về 0..1 theo tầng ồn và mức nói của buổi ----
  const lo = floorDb + 4;
  const hi = Math.max(lo + 1, speechDb - 2);
  const perSec = db.length / duration;
  const peaks = Array.from({ length: PEAKS_N }, (_, i) => {
    const f0 = Math.floor((i / PEAKS_N) * db.length);
    const f1 = Math.max(f0 + 1, Math.floor(((i + 1) / PEAKS_N) * db.length));
    let sum = 0;
    for (let f = f0; f < f1; f++) sum += 10 ** (db[f] / 10);
    const v = 10 * Math.log10(sum / (f1 - f0) + 1e-9); // dB trung bình của ô
    return r2(clamp((v - lo) / (hi - lo), 0, 1));
  });
  const peaksThumb = Array.from({ length: THUMB_N }, (_, i) =>
    Math.max(...peaks.slice(Math.floor((i * PEAKS_N) / THUMB_N), Math.floor(((i + 1) * PEAKS_N) / THUMB_N))),
  );
  const colorOf = Object.fromEntries(det.speakers.map((s) => [s.id, s.color_index]));
  const spanAt = (t) => {
    let color = 0;
    for (const sp of spans) {
      if (t >= sp.start_sec && t < sp.end_sec) return colorOf[sp.speaker_id] ?? 0;
      if (sp.end_sec <= t) color = colorOf[sp.speaker_id] ?? color;
    }
    return color;
  };
  const speakerColorsThumb = Array.from({ length: THUMB_N }, (_, i) => spanAt(((i + 0.5) / THUMB_N) * duration));

  // ---- bản đồ nghe mới ----
  const listeningMap = {
    session_id: det.id,
    silences,
    fillers: findFillers(fx.transcript.map((s) => ({ ...s, start_sec: segsNew.get(s.id)[0], end_sec: segsNew.get(s.id)[1] })), EXTRA_FILLERS[det.id] ?? {}),
    speaker_gain_db: gain,
    noise_level: noiseLevel,
    clean_duration_sec: cleanDuration,
  };

  // ---- ghi đè fixture ----
  det.audio_url = `/audio/${base}.m4a`;
  det.duration_sec = duration;
  det.size_bytes = sizeBytes;
  for (const s of fx.transcript) {
    const [ns, ne] = segsNew.get(s.id);
    s.start_sec = ns;
    s.end_sec = ne;
  }
  det.speaker_spans = spans;
  for (const sp of det.speakers) {
    sp.talk_ratio_percent = talkRatio[sp.id];
    sp.sample_start_sec = r1(mapTime(sp.sample_start_sec));
  }
  const mapBulletTs = (list) => list.map((b) => ({ ...b, timestamp_sec: r1(mapTime(b.timestamp_sec)) }));
  for (const tp of det.topics) {
    tp.start_sec = r1(mapTime(tp.start_sec));
    tp.end_sec = r1(mapTime(tp.end_sec));
    tp.bullets = mapBulletTs(tp.bullets);
    if (tp.figure) tp.figure = { ...tp.figure, source_timestamp_sec: r1(mapTime(tp.figure.source_timestamp_sec)) };
  }
  det.action_items = det.action_items.map((a) => ({ ...a, timestamp_sec: a.timestamp_sec == null ? null : r1(mapTime(a.timestamp_sec)) }));
  det.notes = det.notes.map((n) => ({ ...n, timestamp_sec: r1(mapTime(n.timestamp_sec)) }));
  det.bookmarks = det.bookmarks.map((b) => ({ ...b, timestamp_sec: r1(mapTime(b.timestamp_sec)) }));
  det.photos = det.photos.map((p) => ({ ...p, timestamp_sec: r1(mapTime(p.timestamp_sec)) }));
  for (const ch of fx.chat ?? []) ch.citations = ch.citations.map((c) => r1(mapTime(c)));
  for (const v of fx.summary_versions ?? []) {
    for (const tp of v.topics) {
      tp.start_sec = r1(mapTime(tp.start_sec));
      tp.end_sec = r1(mapTime(tp.end_sec));
      tp.bullets = mapBulletTs(tp.bullets);
    }
  }
  fx.listening_map = listeningMap;

  const raw = readFileSync(filePath, "utf8");
  const indent = Math.max(1, (raw.split("\n")[1].match(/^ +/)?.[0] ?? " ").length);
  writeFileSync(filePath, JSON.stringify(fx, null, indent) + "\n");

  // ---- dữ liệu cho migrate kho cũ ----
  const attach = {
    audio_url: det.audio_url,
    duration_sec: duration,
    size_bytes: sizeBytes,
    old_duration: oldDuration,
    keyframes: keyframes.map(([o, n]) => [r2(o), r2(n)]),
    segments: Object.fromEntries([...segsNew].map(([id, [s, e]]) => [id, [r2(s), r2(e)]])),
    speaker_spans: spans,
    talk_ratio: talkRatio,
    sample_start: Object.fromEntries(det.speakers.map((sp) => [sp.id, sp.sample_start_sec])),
    peaks,
    peaks_thumb: peaksThumb,
    speaker_colors_thumb: speakerColorsThumb,
    listening_map: listeningMap,
  };

  console.log(
    `${path.basename(fixture)} (${det.id}): ${duration}s / ${(sizeBytes / 1e6).toFixed(1)}MB, ${silences.length} khoảng lặng (${silences
      .slice(0, 4)
      .map((s) => `${s.start_sec}→${s.end_sec}`)
      .join(", ")}…), gain ${JSON.stringify(gain)}, ồn ${noiseLevel} (chênh ${gapDb.toFixed(1)} dB), sạch còn ${cleanDuration}s, tỉ lệ nói ${JSON.stringify(talkRatio)}, ${listeningMap.fillers.length} tiếng đệm`,
  );
  return [det.id, attach];
}

mkdirSync(PUB_DIR, { recursive: true });
const attachOut = {};
for (const job of FIXTURES) {
  const [id, attach] = processOne(job);
  attachOut[id] = attach;
  copyFileSync(path.join(AUDIO_DIR, `${job.base}.m4a`), path.join(PUB_DIR, `${job.base}.m4a`));
}
const attachPath = path.join(ROOT, "fixtures", "audio-attach.json");
writeFileSync(attachPath, JSON.stringify(attachOut, null, 2) + "\n");
console.log(`Đã ghi ${path.relative(ROOT, attachPath)} và chép ${FIXTURES.length} file .m4a vào public/audio/`);
