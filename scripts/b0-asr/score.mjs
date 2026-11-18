#!/usr/bin/env node
/**
 * B0-01 — Bộ chấm điểm kết quả AI nhận dạng giọng nói (chỉ số xem docs/10-b0-thu-rui-ro.md phần A).
 *
 * ĐỊNH DẠNG KẾT QUẢ CHUẨN HÓA (run.mjs lưu vào test-data/asr-results/<mã>/<tên bộ>.json,
 * score.mjs đọc lại file đã lưu để chấm, không cần gọi API):
 * {
 *   "provider": "soniox",            // mã nhà cung cấp
 *   "file": "01-bds-gap-chi-lan",    // tên bộ âm thanh, không phần mở rộng
 *   "model": "stt-async-v3",         // mô hình đã dùng (nếu biết)
 *   "processing_ms": 43210,          // thời gian xử lý của lần gọi API
 *   "audio_duration_sec": 383.5,     // độ dài âm thanh (ffprobe đo)
 *   "language": null,                // ngôn ngữ toàn file nếu API chỉ báo một ngôn ngữ, không thì null
 *   "segments": [                    // các đoạn lời, theo thứ tự thời gian
 *     {
 *       "speaker": "1",              // nhãn người nói của máy (chuỗi), null nếu không tách người nói
 *       "lang": "vi",                // "vi"|"ko"|"en"|null (đã chuẩn hóa 2 chữ cái)
 *       "start_sec": 1.39,
 *       "end_sec": 9.3,
 *       "text": "Dạ em chào chị Lan, ...",
 *       "words": [                   // mốc từng chữ nếu API có, không có thì mảng rỗng
 *         {"text": "Dạ", "start_sec": 1.39, "end_sec": 1.55}
 *       ]
 *     }
 *   ]
 * }
 * Đáp án test-data/audio/<tên bộ>.truth.json có cấu trúc tương tự (speaker_id, lang,
 * start_sec, end_sec, text) — truthToNormalized() chuyển về đúng định dạng trên.
 *
 * Chỉ số:
 * - Tiếng Việt: WER theo âm tiết (tách theo khoảng trắng, GIỮ DẤU THANH, bỏ dấu câu, chữ thường).
 * - Tiếng Hàn: CER theo ký tự (bỏ khoảng trắng và dấu câu).
 * - Tiếng Anh: WER theo từ.
 * - Sai số liệu: số, số tiền, ngày (dd/mm), tên riêng trong đáp án mà không có trong kết quả (regex).
 * - Tách người nói: tỷ lệ chữ gán đúng người nói sau khi thử mọi hoán vị ghép nhãn máy ↔ đáp án
 *   (≤ 6 người nói thì thử vét cạn, nhiều hơn thì ghép tham lam); kèm số người nói máy đếm được.
 * - Nhận ngôn ngữ: tỷ lệ đoạn đáp án được đoạn khớp tốt nhất gán đúng ngôn ngữ.
 * - Lệch mốc: trung bình |đầu đoạn kết quả − đầu đoạn đáp án| của cặp đoạn khớp theo chồng lấp.
 * - Tiếng đệm ("à, ừ, ờ"): số tiếng đệm trong đáp án so với số trong kết quả.
 * - Tốc độ: thời gian xử lý / độ dài âm thanh (hệ số so thời gian thực, nhỏ hơn 1 là nhanh hơn realtime).
 *
 * Cách dùng:
 *   node scripts/b0-asr/score.mjs --hyp test-data/asr-results/soniox/01-bds-gap-chi-lan.json
 *   node scripts/b0-asr/score.mjs --all --md   # chấm mọi kết quả đã lưu, in dòng bảng Markdown
 *   node scripts/b0-asr/score.mjs --selftest   # tự kiểm (đạt thì thoát mã 0)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const AUDIO_DIR = path.join(ROOT, "test-data", "audio");
const HUMAN_DIR = path.join(ROOT, "test-data", "human");
const RESULTS_DIR = path.join(ROOT, "test-data", "asr-results");

// ---------------------------------------------------------------- tiện ích chữ

/** Tách chữ: bỏ dấu câu, chữ thường, GIỮ dấu thanh tiếng Việt (dấu thanh nằm trong ký tự chữ). */
function tokenize(text) {
  const out = [];
  for (const raw of String(text || "").split(/\s+/)) {
    const t = raw.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (t) out.push(t);
  }
  return out;
}

/** Khoảng cách Levenshtein kèm đường đi (các cặp khớp) và đếm thay/thêm/thiếu. */
function align(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    const ai = a[i - 1];
    for (let j = 1; j <= m; j++) {
      const sub = dp[i - 1][j - 1] + (ai === b[j - 1] ? 0 : 1);
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, sub);
    }
  }
  const pairs = [];
  let i = n;
  let j = m;
  let sub = 0;
  let del = 0;
  let ins = 0;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      if (a[i - 1] === b[j - 1]) pairs.push([i - 1, j - 1]);
      else sub++;
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      del++;
      i--;
    } else {
      ins++;
      j--;
    }
  }
  pairs.reverse();
  return { distance: dp[n][m], pairs, matches: pairs.length, sub, del, ins };
}

function overlapSec(a, b) {
  return Math.max(0, Math.min(a.end_sec ?? 0, b.end_sec ?? 0) - Math.max(a.start_sec ?? 0, b.start_sec ?? 0));
}

/** Đoạn kết quả khớp tốt nhất với một đoạn đáp án, theo thời gian chồng lấp. */
function bestMatch(truthSeg, hypSegs) {
  let best = -1;
  let bestOv = 0;
  for (let k = 0; k < hypSegs.length; k++) {
    const ov = overlapSec(truthSeg, hypSegs[k]);
    if (ov > bestOv) {
      bestOv = ov;
      best = k;
    }
  }
  return best;
}

/** Chuẩn hóa mã ngôn ngữ của hãng ("vi-VN", "ko", "en-US") về 2 chữ cái. */
function normLang(code) {
  if (!code) return null;
  return String(code).toLowerCase().slice(0, 2);
}

// ------------------------------------ thực thể (số, tiền, ngày, tên riêng)

const NUM_RE = /\d+(?:[.,]\d+)*/g;
const MONEY_RE = /(\d+(?:[.,]\d+)*)\s*(tỷ|tỉ|triệu|nghìn|ngàn|vnđ|vnd|₫|đồng)/gi;
const DATE_RE = /\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g;
const UNIT_WORDS = new Set(["tỷ", "tỉ", "triệu", "nghìn", "ngàn", "vnđ", "vnd", "đồng", "tr", "k"]);
const NAME_STOP = new Set([
  "tôi", "anh", "em", "chị", "bà", "ông", "bác", "cô", "chú", "hôm", "bây", "đây", "đó", "chúng",
  "khi", "nhưng", "vì", "và", "nếu", "sau", "trước", "văn", "phòng", "bệnh", "căn", "chung", "xin",
  "cảm", "vậy", "thế", "cả", "ok", "yes", "no",
]);

/** "1.200.000" → "120000", "3,2" → "3.2", "48,000" → "48000" (để so khớp số giữa hai bản). */
function canonicalNum(s) {
  const t = String(s).replace(/\s+/g, "");
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) return t.replace(/[.,]/g, "");
  return t.replace(/,/g, ".");
}

/** Tên riêng: chữ viết hoa GIỮA câu (không phải đầu câu/đoạn), bỏ từ hay viết hoa thông thường. */
function extractNames(text) {
  const out = [];
  const tokens = String(text || "").split(/\s+/);
  let sentenceStart = true;
  for (const raw of tokens) {
    const core = raw.replace(/[^\p{L}\p{N}-]/gu, "");
    const endsSentence = /[.!?…]$/.test(raw);
    if (core && !sentenceStart && /^\p{Lu}/u.test(core) && core.length >= 2 && !NAME_STOP.has(core.toLowerCase())) {
      out.push(core);
    }
    sentenceStart = endsSentence;
  }
  return out;
}

function entityMetrics(truthSegs, hypSegs) {
  const truthText = truthSegs.map((s) => s.text || "").join(" ");
  const hypText = hypSegs.map((s) => s.text || "").join(" ");
  const hypNorm = hypText.toLowerCase().replace(/\s+/g, " ");
  const hypNoSpace = hypNorm.replace(/\s+/g, "");
  const hypNums = new Set([...hypText.matchAll(NUM_RE)].map((m) => canonicalNum(m[0])));

  const count = (total, missingList) => ({
    total,
    missing: missingList.length,
    missing_list: [...new Set(missingList)],
  });

  // số: mỗi số trong đáp án phải tìm được trong kết quả (so dạng chuẩn hóa)
  const numMissing = [...truthText.matchAll(NUM_RE)]
    .map((m) => canonicalNum(m[0]))
    .filter((c) => !hypNums.has(c));

  // tiền: đủ số và đơn vị (tỷ/triệu/đồng/VND...)
  const moneyMatches = [...truthText.matchAll(MONEY_RE)];
  const moneyMissing = moneyMatches
    .filter((m) => {
      const unit = m[2].toLowerCase().replace("tỉ", "tỷ");
      return !hypNums.has(canonicalNum(m[1])) || !hypNoSpace.includes(unit);
    })
    .map((m) => `${m[1]} ${m[2]}`);

  // ngày dd/mm(/yyyy): chuỗi ngày phải xuất hiện nguyên vẹn trong kết quả
  const dateMatches = [...truthText.matchAll(DATE_RE)];
  const dateMissing = dateMatches.map((m) => m[0]).filter((d) => !hypNorm.includes(d));

  // tên riêng: đếm theo số lần nhắc — mỗi tên trong đáp án phải xuất hiện đủ số lần trong kết quả
  // (so trên chữ đã tách bỏ dấu câu, không phân biệt chữ hoa/thường, ví dụ "T.T" ↔ "TT")
  const truthNameCounts = new Map();
  for (const s of truthSegs) {
    for (const name of extractNames(s.text || "")) {
      const key = name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      truthNameCounts.set(key, (truthNameCounts.get(key) || 0) + 1);
    }
  }
  const hypTokenCounts = new Map();
  for (const s of hypSegs) {
    for (const t of tokenize(s.text || "")) hypTokenCounts.set(t, (hypTokenCounts.get(t) || 0) + 1);
  }
  const nameMissing = [];
  let nameMissingCount = 0;
  let nameTotal = 0;
  for (const [key, n] of truthNameCounts) {
    nameTotal += n;
    const have = hypTokenCounts.get(key) || 0;
    if (have < n) {
      nameMissingCount += n - have;
      nameMissing.push(`${key} (thiếu ${n - have}/${n})`);
    }
  }

  const number = count([...truthText.matchAll(NUM_RE)].length, numMissing);
  const money = count(moneyMatches.length, moneyMissing);
  const date = count(dateMatches.length, dateMissing);
  const name = { total: nameTotal, missing: nameMissingCount, missing_list: nameMissing };
  return {
    number,
    money,
    date,
    name,
    total_missing: number.missing + money.missing + date.missing + name.missing,
  };
}

// ---------------------------------------------------------------- ghép nhãn người nói

function* permutations(arr) {
  if (arr.length <= 1) {
    yield arr;
    return;
  }
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) yield [arr[i], ...p];
  }
}

/**
 * Ghép nhãn người nói của máy với nhãn đáp án theo cách khớp tốt nhất:
 * ≤ 6 người nói thì thử mọi hoán vị (vét cạn), nhiều hơn thì ghép tham lam theo số chữ trùng.
 */
function speakerAttribution(truthSegs, hypSegs, matchIdx) {
  const truthToks = [];
  for (const s of truthSegs) {
    for (const t of tokenize(s.text || "")) truthToks.push({ t, spk: s.speaker ?? null });
  }
  const used = [...new Set(matchIdx.filter((i) => i >= 0))].sort(
    (a, b) => (hypSegs[a].start_sec ?? 0) - (hypSegs[b].start_sec ?? 0),
  );
  const hypToks = [];
  for (const k of used) {
    for (const t of tokenize(hypSegs[k].text || "")) hypToks.push({ t, spk: hypSegs[k].speaker ?? null });
  }
  const { pairs } = align(truthToks.map((x) => x.t), hypToks.map((x) => x.t));
  const truthSpeakers = [...new Set(truthToks.map((x) => x.spk))];
  const hypSpeakers = [...new Set(hypToks.map((x) => x.spk))];
  const hypCount = hypSpeakers.filter((s) => s !== null).length;
  const truthCount = truthSpeakers.filter((s) => s !== null).length;

  if (!pairs.length) {
    return { accuracy: 0, aligned: 0, correct: 0, mapping: {}, truth_count: truthCount, hyp_count: hypCount };
  }

  const scoreMapping = (hypToTruth) => {
    let correct = 0;
    for (const [i, j] of pairs) {
      if (hypToTruth.get(hypToks[j].spk) === truthToks[i].spk) correct++;
    }
    return correct;
  };

  const fact = (n) => (n <= 1 ? 1 : n * fact(n - 1));
  const combos = fact(Math.max(hypSpeakers.length, truthSpeakers.length));
  let best = { correct: -1, map: new Map() };
  if (hypSpeakers.length <= 6 && truthSpeakers.length <= 6 && combos <= 720) {
    if (hypSpeakers.length >= truthSpeakers.length) {
      // mỗi nhãn đáp án gán một nhãn máy khác nhau, thử mọi cách
      for (const p of permutations(hypSpeakers)) {
        const h2t = new Map(p.map((hs, i) => [hs, truthSpeakers[i]]));
        const correct = scoreMapping(h2t);
        if (correct > best.correct) best = { correct, map: h2t };
      }
    } else {
      for (const p of permutations(truthSpeakers)) {
        const h2t = new Map(hypSpeakers.map((hs, i) => [hs, p[i]]));
        const correct = scoreMapping(h2t);
        if (correct > best.correct) best = { correct, map: h2t };
      }
    }
  } else {
    // ghép tham lam: cặp (máy, đáp án) trùng chữ nhiều nhất được ghép trước
    const co = new Map();
    for (const [i, j] of pairs) {
      const key = `${hypToks[j].spk} → ${truthToks[i].spk}`;
      co.set(key, (co.get(key) || 0) + 1);
    }
    const h2t = new Map();
    const usedT = new Set();
    const usedH = new Set();
    for (const [key] of [...co.entries()].sort((a, b) => b[1] - a[1])) {
      const [hs, ts] = key.split(" → ");
      if (!usedH.has(hs) && !usedT.has(ts)) {
        h2t.set(hs, ts);
        usedH.add(hs);
        usedT.add(ts);
      }
    }
    best = { correct: scoreMapping(h2t), map: h2t };
  }

  const mapping = {};
  for (const [hs, ts] of best.map) mapping[String(hs)] = String(ts);
  return {
    accuracy: best.correct / pairs.length,
    aligned: pairs.length,
    correct: best.correct,
    mapping,
    truth_count: truthCount,
    hyp_count: hypCount,
  };
}

// ---------------------------------------------------------------- chấm một cặp đáp án / kết quả

const FILLERS = new Set(["à", "ừ", "ờ", "ừm", "hừ", "uh", "um", "uhm"]);

/**
 * Chấm một kết quả chuẩn hóa so với đáp án. truthNorm/hypNorm theo định dạng
 * khai báo ở đầu file. Trả object chỉ số đầy đủ.
 */
export function scoreOne(truthNorm, hypNorm) {
  const truthSegs = truthNorm.segments || [];
  const hypSegs = hypNorm.segments || [];
  const matchIdx = truthSegs.map((s) => bestMatch(s, hypSegs));

  // ---- chỉ số chữ theo từng ngôn ngữ của đáp án
  const languages = {};
  const truthLangs = [...new Set(truthSegs.map((s) => s.lang || "vi"))];
  for (const lang of truthLangs) {
    const truthToks = [];
    const usedHyp = new Set();
    truthSegs.forEach((s, i) => {
      if ((s.lang || "vi") !== lang) return;
      for (const t of tokenize(s.text)) truthToks.push(t);
      const mi = matchIdx[i];
      if (mi >= 0) usedHyp.add(mi);
    });
    const hypOrdered = [...usedHyp].sort((a, b) => (hypSegs[a].start_sec ?? 0) - (hypSegs[b].start_sec ?? 0));
    const hypToks = hypOrdered.flatMap((k) => tokenize(hypSegs[k].text));
    if (lang === "ko") {
      // tiếng Hàn: CER theo ký tự, bỏ khoảng trắng và dấu câu
      const tc = truthToks.join("");
      const hc = hypToks.join("");
      const d = align([...tc], [...hc]).distance;
      languages[lang] = {
        metric: "cer",
        error_rate: tc.length ? d / tc.length : 0,
        truth_chars: tc.length,
        hyp_chars: hc.length,
        distance: d,
      };
    } else {
      const a = align(truthToks, hypToks);
      languages[lang] = {
        metric: lang === "en" ? "wer_words" : "wer_syllables",
        error_rate: truthToks.length ? a.distance / truthToks.length : 0,
        truth_tokens: truthToks.length,
        hyp_tokens: hypToks.length,
        sub: a.sub,
        del: a.del,
        ins: a.ins,
      };
    }
  }

  // ---- nhận ngôn ngữ
  const perLang = {};
  let langTotal = 0;
  let langCorrect = 0;
  for (let i = 0; i < truthSegs.length; i++) {
    const lang = truthSegs[i].lang || "vi";
    if (!perLang[lang]) perLang[lang] = { total: 0, correct: 0 };
    perLang[lang].total++;
    langTotal++;
    const mi = matchIdx[i];
    if (mi >= 0) {
      const hypLang = normLang(hypSegs[mi].lang) || normLang(hypNorm.language);
      if (hypLang === lang) {
        perLang[lang].correct++;
        langCorrect++;
      }
    }
  }
  const language = {
    accuracy: langTotal ? langCorrect / langTotal : 0,
    total: langTotal,
    correct: langCorrect,
    per_lang: perLang,
  };

  // ---- lệch mốc đầu đoạn
  const devs = [];
  for (let i = 0; i < truthSegs.length; i++) {
    const mi = matchIdx[i];
    if (mi >= 0) devs.push(Math.abs((hypSegs[mi].start_sec ?? 0) - (truthSegs[i].start_sec ?? 0)));
  }
  const wordTimingSegs = hypSegs.filter((s) => Array.isArray(s.words) && s.words.length > 0).length;
  const timing = {
    start_dev_mean_sec: devs.length ? devs.reduce((a, b) => a + b, 0) / devs.length : null,
    start_dev_max_sec: devs.length ? Math.max(...devs) : null,
    matched_segments: devs.length,
    truth_segments: truthSegs.length,
    word_timing_ratio: hypSegs.length ? wordTimingSegs / hypSegs.length : 0,
  };

  // ---- tách người nói, thực thể, tiếng đệm, tốc độ
  const speakers = speakerAttribution(truthSegs, hypSegs, matchIdx);
  const entities = entityMetrics(truthSegs, hypSegs);
  const truthFillers = truthSegs.reduce((n, s) => n + tokenize(s.text).filter((t) => FILLERS.has(t)).length, 0);
  const hypFillers = hypSegs.reduce((n, s) => n + tokenize(s.text).filter((t) => FILLERS.has(t)).length, 0);

  const notes = [];
  if (hypSegs.length && !wordTimingSegs) notes.push("không có mốc từng chữ");
  if (!hypSegs.some((s) => s.speaker !== null && s.speaker !== undefined)) notes.push("không có tách người nói");
  const dur = hypNorm.audio_duration_sec;
  const speed =
    hypNorm.processing_ms && dur
      ? { processing_sec: Math.round(hypNorm.processing_ms) / 1000, realtime_factor: hypNorm.processing_ms / 1000 / dur }
      : { processing_sec: null, realtime_factor: null };
  if (!speed.realtime_factor) notes.push("chưa ghi thời gian xử lý hoặc độ dài âm thanh");

  return {
    file: hypNorm.file || truthNorm.audio || null,
    provider: hypNorm.provider || null,
    languages,
    language,
    entities,
    speakers,
    timing,
    fillers: { truth: truthFillers, hyp: hypFillers },
    speed,
    notes,
  };
}

// ---------------------------------------------------------------- nạp dữ liệu

/** Đáp án .truth.json → định dạng chuẩn hóa dùng chung. */
export function truthToNormalized(truth) {
  return {
    provider: "truth",
    file: truth.audio || null,
    model: truth.engine || null,
    processing_ms: null,
    audio_duration_sec: truth.duration_sec ?? null,
    language: null,
    segments: (truth.segments || []).map((s) => ({
      speaker: s.speaker_id ?? null,
      lang: s.lang ?? null,
      start_sec: s.start_sec,
      end_sec: s.end_sec,
      text: s.text || "",
      words: [],
    })),
  };
}

function loadNormalized(p) {
  const d = JSON.parse(readFileSync(p, "utf8"));
  if (!Array.isArray(d.segments)) throw new Error(`${p}: thiếu mảng segments — không phải kết quả đã chuẩn hóa`);
  return d;
}

function loadTruthForFile(base) {
  for (const dir of [AUDIO_DIR, HUMAN_DIR]) {
    const p = path.join(dir, `${base}.truth.json`);
    if (existsSync(p)) return truthToNormalized(JSON.parse(readFileSync(p, "utf8")));
  }
  throw new Error(`Không tìm thấy đáp án ${base}.truth.json trong test-data/audio/ hay test-data/human/`);
}

// ---------------------------------------------------------------- in kết quả

function fmtRate(x) {
  return `${(100 * x).toFixed(2)}%`;
}

const MD_HEADER =
  "Nhà cung cấp | Bộ | WER vi | CER ko | WER en | Sai số liệu (thiếu/tổng) | Tách người nói (máy/thật) | Ngôn ngữ đúng | Lệch mốc (s) | Tiếng đệm (máy/truth) | Tốc độ";

function mdRow(m) {
  const vi = m.languages.vi;
  const ko = m.languages.ko;
  const en = m.languages.en;
  const dev = m.timing.start_dev_mean_sec;
  const entityTotal =
    m.entities.number.total + m.entities.money.total + m.entities.date.total + m.entities.name.total;
  return [
    m.provider || "—",
    m.file || "—",
    vi ? fmtRate(vi.error_rate) : "—",
    ko ? fmtRate(ko.error_rate) : "—",
    en ? fmtRate(en.error_rate) : "—",
    `${m.entities.total_missing}/${entityTotal}`,
    m.speakers.aligned ? `${fmtRate(m.speakers.accuracy)} (${m.speakers.hyp_count}/${m.speakers.truth_count})` : "—",
    fmtRate(m.language.accuracy),
    dev === null ? "—" : dev.toFixed(2),
    `${m.fillers.hyp}/${m.fillers.truth}`,
    m.speed.realtime_factor === null ? "—" : `${m.speed.realtime_factor.toFixed(2)}x`,
  ].join(" | ");
}

function scoreOneFile(hypPath, truthPath) {
  const hyp = loadNormalized(hypPath);
  const truth = truthPath
    ? truthToNormalized(JSON.parse(readFileSync(truthPath, "utf8")))
    : loadTruthForFile(hyp.file || path.basename(hypPath).replace(/\.json$/, ""));
  return scoreOne(truth, hyp);
}

// ---------------------------------------------------------------- tự kiểm

function check(results, label, ok, detail = "") {
  results.push({ label, ok });
  console.log(`  [${ok ? "ĐẠT" : "SAI"}] ${label}${detail ? ` — ${detail}` : ""}`);
}

function replaceWordAt(text, wordIdx, suffix) {
  const parts = String(text).split(/\s+/);
  const core = parts[wordIdx].replace(/[^\p{L}\p{N}]/gu, "");
  parts[wordIdx] = parts[wordIdx].replace(core, core + suffix);
  return parts.join(" ");
}

function pickPlainWordPositions(segs, lang, k) {
  // chọn k vị trí chữ "thường": không số, không tên riêng, không tiếng đệm, không đơn vị tiền, ≥ 2 ký tự
  const cands = [];
  segs.forEach((s, si) => {
    if ((s.lang || "vi") !== lang) return;
    const words = String(s.text || "").split(/\s+/);
    let sentenceStart = true;
    words.forEach((raw, wi) => {
      const core = raw.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
      const endsSentence = /[.!?…]$/.test(raw);
      const plain =
        core.length >= 2 &&
        !/\d/.test(core) &&
        !FILLERS.has(core) &&
        !UNIT_WORDS.has(core) &&
        !NAME_STOP.has(core) &&
        !/^\p{Lu}/u.test(core);
      if (plain && !sentenceStart) cands.push([si, wi]);
      sentenceStart = endsSentence;
    });
  });
  if (cands.length < k) throw new Error(`Không đủ ${k} chữ thường để sửa (chỉ có ${cands.length})`);
  const out = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(((i + 0.5) * cands.length) / k);
    out.push(cands[idx]);
  }
  return out;
}

function modifyWords(norm, lang, k) {
  const n = JSON.parse(JSON.stringify(norm));
  for (const [si, wi] of pickPlainWordPositions(n.segments, lang, k)) {
    n.segments[si].text = replaceWordAt(n.segments[si].text, wi, "x");
  }
  return n;
}

function modifyKoChars(norm, k) {
  const n = JSON.parse(JSON.stringify(norm));
  let left = k;
  for (const s of n.segments) {
    if ((s.lang || "vi") !== "ko" || left <= 0) continue;
    const chars = [...s.text];
    for (let i = 0; i < chars.length && left > 0; i++) {
      if (/[\uAC00-\uD7A3]/.test(chars[i])) {
        chars[i] = chars[i] === "가" ? "나" : "가";
        left--;
      }
    }
    s.text = chars.join("");
  }
  if (left > 0) throw new Error("Không đủ ký tự Hangul để sửa");
  return n;
}

function modifyNumbers(norm) {
  const n = JSON.parse(JSON.stringify(norm));
  for (const s of n.segments) {
    s.text = s.text.replace(NUM_RE, (m) => m + "9"); // mọi số (kèm số trong tiền, ngày) đều sai
  }
  return n;
}

function modifyNames(norm) {
  const n = JSON.parse(JSON.stringify(norm));
  const keys = new Set();
  for (const s of n.segments) {
    for (const name of extractNames(s.text || "")) {
      keys.add(name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""));
    }
  }
  for (const s of n.segments) {
    s.text = String(s.text || "")
      .split(/\s+/)
      .map((w) => {
        const tok = w.replace(/[^\p{L}\p{N}-]/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
        return tok && keys.has(tok) ? w.replace(/[\p{L}\p{N}]+/u, (m) => m + "x") : w;
      })
      .join(" ");
  }
  return n;
}

function countTokens(norm, lang) {
  return norm.segments.reduce((n, s) => ((s.lang || "vi") === lang ? n + tokenize(s.text).length : n), 0);
}

function countKoChars(norm) {
  return norm.segments.reduce(
    (n, s) => ((s.lang || "vi") === "ko" ? n + [...tokenize(s.text).join("")].length : n),
    0,
  );
}

function runSelftest() {
  console.log("Tự kiểm score.mjs");
  const results = [];
  const t01 = JSON.parse(readFileSync(path.join(AUDIO_DIR, "01-bds-gap-chi-lan.truth.json"), "utf8"));
  const t02 = JSON.parse(readFileSync(path.join(AUDIO_DIR, "02-hop-doi-tac-han.truth.json"), "utf8"));
  const n01 = truthToNormalized(t01);
  const n02 = truthToNormalized(t02);

  const zero = (m) =>
    Object.values(m.languages).every((l) => l.error_rate === 0) &&
    m.entities.total_missing === 0 &&
    m.speakers.accuracy === 1 &&
    m.language.accuracy === 1 &&
    m.timing.start_dev_mean_sec === 0 &&
    m.fillers.hyp === m.fillers.truth &&
    m.speakers.hyp_count === m.speakers.truth_count;

  // (a) đáp án chấm chính nó → 0% sai mọi chỉ số
  const s1 = scoreOne(n01, n01);
  check(
    results,
    "bộ 01 chấm chính nó: mọi chỉ số 0",
    zero(s1),
    `WER vi ${fmtRate(s1.languages.vi.error_rate)} trên ${s1.languages.vi.truth_tokens} âm tiết, ${s1.speakers.truth_count} người nói`,
  );
  const s2 = scoreOne(n02, n02);
  check(
    results,
    "bộ 02 chấm chính nó: mọi chỉ số 0 (vi/ko/en, 4 người nói)",
    zero(s2),
    `WER vi ${fmtRate(s2.languages.vi.error_rate)}, CER ko ${fmtRate(s2.languages.ko.error_rate)}, WER en ${fmtRate(s2.languages.en.error_rate)}`,
  );

  // (b) đổi 5 âm tiết tiếng Việt → WER đúng bằng 5/N; chấm lại từ FILE ĐÃ LƯU (không gọi API)
  const n01vi = countTokens(n01, "vi");
  const mod5 = modifyWords(n01, "vi", 5);
  const tmpPath = path.join(os.tmpdir(), "b0-selftest-01-bds-gap-chi-lan.json");
  writeFileSync(
    tmpPath,
    JSON.stringify({ provider: "selftest", file: "01-bds-gap-chi-lan", segments: mod5.segments }, null, 2),
  );
  const s3 = scoreOne(n01, loadNormalized(tmpPath));
  check(
    results,
    "đổi 5 âm tiết: WER vi đúng bằng 5/N",
    Math.abs(s3.languages.vi.error_rate - 5 / n01vi) < 1e-12 && s3.languages.vi.sub === 5,
    `5/${n01vi} = ${fmtRate(5 / n01vi)}, đo được ${fmtRate(s3.languages.vi.error_rate)} (thay ${s3.languages.vi.sub}, thiếu ${s3.languages.vi.del}, thừa ${s3.languages.vi.ins})`,
  );
  check(
    results,
    "đổi 5 âm tiết: không sai thực thể nào (chỉ đổi chữ thường, không đụng số/tên)",
    s3.entities.total_missing === 0,
    `thiếu ${s3.entities.total_missing}`,
  );
  check(
    results,
    "đổi 5 âm tiết: tách người nói vẫn 100% trên các cặp chữ còn khớp",
    s3.speakers.accuracy === 1,
    fmtRate(s3.speakers.accuracy),
  );

  // (c) tiếng Hàn sửa 2 ký tự → CER đúng bằng 2/N; tiếng Anh sửa 2 từ → WER đúng bằng 2/N
  const n02mix = modifyWords(modifyKoChars(n02, 2), "en", 2);
  const n02ko = countKoChars(n02);
  const n02en = countTokens(n02, "en");
  const s4 = scoreOne(n02, n02mix);
  check(
    results,
    "sửa 2 ký tự Hàn: CER đúng bằng 2/N",
    Math.abs(s4.languages.ko.error_rate - 2 / n02ko) < 1e-12,
    `2/${n02ko} = ${fmtRate(2 / n02ko)}, đo được ${fmtRate(s4.languages.ko.error_rate)}`,
  );
  check(
    results,
    "sửa 2 từ tiếng Anh: WER en đúng bằng 2/N",
    Math.abs(s4.languages.en.error_rate - 2 / n02en) < 1e-12,
    `2/${n02en} = ${fmtRate(2 / n02en)}, đo được ${fmtRate(s4.languages.en.error_rate)}`,
  );

  // (d) gán nhầm ngôn ngữ một đoạn → tỷ lệ nhận ngôn ngữ giảm đúng 1 đoạn
  const n01lang = JSON.parse(JSON.stringify(n01));
  n01lang.segments[0].lang = "ko";
  const s5 = scoreOne(n01, n01lang);
  check(
    results,
    "gán nhầm ngôn ngữ 1/60 đoạn: tỷ lệ đúng giảm đúng 1 đoạn, WER không đổi",
    Math.abs(s5.language.accuracy - 59 / 60) < 1e-12 &&
      s5.language.per_lang.vi.correct === 59 &&
      s5.languages.vi.error_rate === 0,
    `${fmtRate(s5.language.accuracy)} (59/60)`,
  );

  // (e) sai số liệu: sửa mọi số (kèm số trong tiền, ngày) → thiếu đủ lượng regex đếm được
  const s6 = scoreOne(n01, modifyNumbers(n01));
  check(
    results,
    "sửa mọi số/tiền/ngày: thiếu đủ lượng regex đếm được, tên riêng không bị đếm sai",
    s6.entities.number.missing === s6.entities.number.total &&
      s6.entities.money.missing === s6.entities.money.total &&
      s6.entities.date.missing === s6.entities.date.total &&
      s6.entities.name.missing === 0,
    `số ${s6.entities.number.missing}/${s6.entities.number.total}, tiền ${s6.entities.money.missing}/${s6.entities.money.total}, ngày ${s6.entities.date.missing}/${s6.entities.date.total}, tên ${s6.entities.name.missing}/${s6.entities.name.total}`,
  );
  // (f) sửa mọi tên riêng → thiếu đủ tên, không ảnh hưởng số/tiền/ngày
  const s7 = scoreOne(n01, modifyNames(n01));
  check(
    results,
    "sửa mọi tên riêng: thiếu đủ lượng đếm được, không ảnh hưởng số/tiền/ngày",
    s7.entities.name.missing === s7.entities.name.total &&
      s7.entities.number.missing === 0 &&
      s7.entities.money.missing === 0 &&
      s7.entities.date.missing === 0,
    `tên riêng thiếu ${s7.entities.name.missing}/${s7.entities.name.total}`,
  );

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log(`TỰ KIỂM THẤT BẠI: ${failed.length}/${results.length} bài`);
    process.exit(1);
  }
  console.log(`Tự kiểm đạt: ${results.length}/${results.length} bài`);
}

// ---------------------------------------------------------------- lệnh chính

function parseArgs(argv) {
  const args = { selftest: false, all: false, md: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--selftest") args.selftest = true;
    else if (a === "--all") args.all = true;
    else if (a === "--md") args.md = true;
    else if (a === "--hyp") args.hyp = argv[++i];
    else if (a === "--truth") args.truth = argv[++i];
    else {
      console.error(`Không hiểu đối số: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selftest) {
    runSelftest();
    return;
  }
  if (args.all) {
    const rows = [];
    if (existsSync(RESULTS_DIR)) {
      for (const provider of readdirSync(RESULTS_DIR).sort()) {
        const dir = path.join(RESULTS_DIR, provider);
        if (!statSync(dir).isDirectory()) continue;
        for (const name of readdirSync(dir).sort()) {
          if (!name.endsWith(".json") || name.endsWith(".raw.json")) continue;
          rows.push(scoreOneFile(path.join(dir, name)));
        }
      }
    } else {
      console.log("Chưa có thư mục test-data/asr-results — chưa có kết quả nào đã lưu.");
    }
    if (args.md) {
      console.log(MD_HEADER);
      for (const m of rows) console.log(mdRow(m));
    } else {
      console.log(JSON.stringify(rows, null, 2));
    }
    return;
  }
  if (!args.hyp) {
    console.error(
      "Dùng: node scripts/b0-asr/score.mjs --hyp <kết quả đã chuẩn hóa> [--truth <đáp án>] [--md]\n" +
        "      node scripts/b0-asr/score.mjs --all [--md]\n" +
        "      node scripts/b0-asr/score.mjs --selftest",
    );
    process.exit(2);
  }
  const m = scoreOneFile(path.resolve(args.hyp), args.truth ? path.resolve(args.truth) : null);
  if (args.md) {
    console.log(MD_HEADER);
    console.log(mdRow(m));
  } else {
    console.log(JSON.stringify(m, null, 2));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
