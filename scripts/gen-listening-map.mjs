#!/usr/bin/env node
/*
 * Sinh "bản đồ nghe" (ListeningMap) và `text_clean` cho mọi buổi mẫu (M8-01,
 * docs/09-nghe-sach.md). Chạy: node scripts/gen-listening-map.mjs
 *
 * - Khoảng lặng: khoảng trống giữa hai đoạn bản ghi lời (kể cả phần cuối tới
 *   hết buổi) dài hơn 1,5 giây — trùng chỗ peaks thấp giữa các lượt nói.
 * - Tiếng đệm: token "à", "ừ", "ờ", "ừm", "ừhm" đứng một mình (dò tự động) và
 *   tiếng đệm đặc thù ghi tay theo đoạn ("thì là", "kiểu") — mốc giờ chia đều
 *   theo số ký tự trong đoạn (mockup chưa có mốc từng chữ).
 * - Cân âm lượng: mức to nhỏ trung bình của từng người nói theo peaks trong
 *   lượt nói của họ; người nhỏ được tăng (+), người to được giảm (-), giữ
 *   trong khoảng -6 đến +9 dB.
 * - Mức ồn: peaks trung bình trong khoảng lặng.
 * - text_clean: câu bản gọn do người viết tay cho các đoạn có tiếng đệm, từ
 *   lặp, nói vấp (CLEAN_BY_SEG); đoạn còn lại giữ nguyên câu gốc — máy không
 *   tự cắt câu để không phá số thập phân ("3,8") và từ láy thật ("song song").
 * Ghi đè chỉ thêm trường mới, giữ nguyên định dạng thụt lề của từng file.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SAFE_FILLERS = new Set(["à", "ừ", "ờ", "ừm", "ừhm"]);

/**
 * Câu bản gọn viết tay, khóa theo id buổi (detail.id) rồi id đoạn.
 * Chỉ đặt cho đoạn thật sự có tiếng đệm, nói lặp hoặc vấp tự sửa.
 */
const CLEAN_BY_SEG = {
  "s-bds-lan": {
    g2: "Nhà chị là bốn người, hai bé đang học cấp 1. Chị cần hai phòng ngủ là đủ, quan trọng là gần trường Lê Văn Tám cho bọn trẻ đi bộ được.",
    g18: "Nhà chị giờ ở Lê Chân, sáng đưa đón hai bé sang Lê Văn Tám, chạy xe máy gần hai mươi phút.",
    g21: "Cuối tuần chị cũng muốn có chỗ cho hai bé chạy nhảy, có công viên nước, có chợ đi bộ mười phút tới nơi.",
    g3: "Chị thích tầng trung thôi, khoảng tầng 12 đến 20, ban công hướng Đông Nam cho mát.",
    g4: "Ngân sách thì tối đa 4,2 tỷ em ạ. Chị có sẵn khoảng 2,1 tỷ.",
    g24: "Hai phẩy một tỷ đó là chị để dành ba năm nay đấy em, phần còn lại là đất vay, nên chị tính rất kỹ.",
    g5: "Còn lại chị định vay một nửa, nhưng cần ân hạn nợ gốc ít nhất 12 tháng.",
    g7: "Em nghe bên đồng nghiệp nói phí quản lý chỗ này hơi cao so với mặt bằng chung.",
  },
  // Bản mẫu nghề bán bất động sản trùng nội dung buổi chị Lan — dùng chung câu bản gọn
  "s-sample-realestate_sales": null, // điền ở dưới trùng với s-bds-lan
};
CLEAN_BY_SEG["s-sample-realestate_sales"] = CLEAN_BY_SEG["s-bds-lan"];

const EXTRA_FILLERS = {
  "s-bds-lan": { g18: ["thì là"], g21: ["kiểu"], g4: ["thì là"] },
};
EXTRA_FILLERS["s-sample-realestate_sales"] = EXTRA_FILLERS["s-bds-lan"];

/** Tách câu thành token kèm vị trí ký tự (token giữ dấu câu). */
function tokenize(text) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(text))) out.push({ w: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

const stripPunct = (w) => w.toLocaleLowerCase("vi").replace(/[.,!?…;:()"'“”–—-]/g, "");

/** Vị trí ký tự -> mốc giây, chia đều theo số ký tự trong đoạn. */
function charToSec(text, charIndex, startSec, endSec) {
  const len = Math.max(1, text.length);
  return startSec + ((endSec - startSec) * charIndex) / len;
}

function processFile(file) {
  const fx = JSON.parse(readFileSync(file, "utf8"));
  const det = fx.detail ?? {};
  const tr = fx.transcript ?? [];
  const peaks = det.peaks ?? [];
  const duration = det.duration_sec ?? 0;
  const spans = det.speaker_spans ?? [];
  if (!tr.length || !peaks.length || !duration) return false;

  const cleanMap = CLEAN_BY_SEG[det.id] ?? {};
  const extraMap = EXTRA_FILLERS[det.id] ?? {};

  // Khoảng lặng: trống giữa hai đoạn >= 1,5 giây. Phần cuối tới hết buổi không
  // tính (một số buổi mẫu có duration_sec vượt xa đoạn lời cuối — bỏ qua khoảng
  // lặng đuôi chỉ nhảy tới hết buổi, vô nghĩa và tô dải giọng quá lớn).
  const silences = [];
  let lastEnd = 0;
  for (const s of tr) {
    if (s.start_sec - lastEnd >= 1.5) silences.push({ start_sec: lastEnd, end_sec: s.start_sec });
    lastEnd = Math.max(lastEnd, s.end_sec);
  }

  // Tiếng đệm: dò token an toàn + cụm ghi tay; mốc chia đều theo ký tự
  const fillers = [];
  for (const s of tr) {
    const toks = tokenize(s.text);
    for (let i = 0; i < toks.length; i++) {
      const w = stripPunct(toks[i].w);
      if (!SAFE_FILLERS.has(w)) continue;
      fillers.push({
        start_sec: Math.round(charToSec(s.text, toks[i].start, s.start_sec, s.end_sec) * 10) / 10,
        end_sec: Math.round(charToSec(s.text, toks[i].end, s.start_sec, s.end_sec) * 10) / 10,
        text: toks[i].w,
      });
    }
    for (const phrase of extraMap[s.id] ?? []) {
      const idx = s.text.indexOf(phrase);
      if (idx < 0) {
        console.error(`  ! không tìm thấy "${phrase}" trong ${det.id}/${s.id}`);
        continue;
      }
      fillers.push({
        start_sec: Math.round(charToSec(s.text, idx, s.start_sec, s.end_sec) * 10) / 10,
        end_sec: Math.round(charToSec(s.text, idx + phrase.length, s.start_sec, s.end_sec) * 10) / 10,
        text: phrase,
      });
    }
  }
  fillers.sort((a, b) => a.start_sec - b.start_sec);

  // Cân âm lượng theo người nói: peaks trung bình trong từng lượt nói
  const perSec = peaks.length / duration;
  const levelAt = (t) => peaks[Math.min(peaks.length - 1, Math.max(0, Math.floor(t * perSec)))] ?? 0;
  const levels = {};
  for (const sp of spans) {
    let sum = 0;
    let n = 0;
    for (let t = sp.start_sec; t < sp.end_sec; t += 2) {
      sum += levelAt(t);
      n++;
    }
    levels[sp.speaker_id] = n ? sum / n : 0;
  }
  const ids = Object.keys(levels);
  const avg = ids.reduce((s, k) => s + levels[k], 0) / Math.max(1, ids.length);
  const gain = {};
  for (const k of ids) {
    const g = Math.round((avg - levels[k]) * 40);
    gain[k] = Math.max(-6, Math.min(9, g));
  }

  // Mức ồn: peaks trung bình trong khoảng lặng. Peaks trong khoảng lặng
  // vẽ lại thấp (trước đây chỉ thấp ở chỗ đổi người nói) — đúng tiền đề
  // "khoảng lặng là chỗ peaks thấp giữa các lượt nói" của docs/09.
  let seed = (det.id ?? "").split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const floor = 0.03 + rand() * 0.09; // nền ồn của buổi: 0,03 đến 0,12
  const perSec2 = peaks.length / duration;
  for (const sil of silences) {
    // Chỉ vẽ các mẫu nằm TRONG khoảng lặng: peaks rất thưa (một mẫu phủ vài
    // giây), nới lề tràn sang vùng người nói là làm cạn dải giọng.
    const i0 = Math.ceil(sil.start_sec * perSec2);
    const i1 = Math.floor(sil.end_sec * perSec2);
    for (let i = i0; i <= i1; i++) peaks[i] = Math.round((floor + rand() * 0.04) * 100) / 100;
  }

  let noiseSum = 0;
  let noiseN = 0;
  for (const sil of silences) {
    for (let t = sil.start_sec; t < sil.end_sec; t += 2) {
      noiseSum += levelAt(t);
      noiseN++;
    }
  }
  const noise = noiseN ? noiseSum / noiseN : 0;
  const noise_level = noise > 0.18 ? "high" : noise > 0.08 ? "medium" : "low";

  const cleanDuration = duration - silences.reduce((s, x) => s + (x.end_sec - x.start_sec), 0);

  // text_clean: đoạn có trong bảng viết tay thì dùng câu đó, còn lại giữ gốc
  let cleaned = 0;
  for (const s of tr) {
    const patch = cleanMap[s.id];
    if (patch !== undefined) {
      s.text_clean = patch;
      if (patch !== s.text) cleaned++;
    } else {
      s.text_clean = s.text;
    }
  }

  fx.listening_map = {
    session_id: det.id,
    silences,
    fillers,
    speaker_gain_db: gain,
    noise_level,
    clean_duration_sec: Math.round(cleanDuration),
  };

  const raw = readFileSync(file, "utf8");
  const secondLine = raw.split("\n")[1] ?? "";
  const indent = Math.max(1, (secondLine.match(/^ +/)?.[0] ?? " ").length);
  writeFileSync(file, JSON.stringify(fx, null, indent) + "\n");
  console.log(
    `${path.basename(file)}: ${silences.length} khoảng lặng, ${fillers.length} tiếng đệm, gain ${JSON.stringify(gain)}, ồn ${noise_level} (${noise.toFixed(2)}), sạch còn ${Math.round(cleanDuration)}s, bản gọn khác ${cleaned}/${tr.length}`,
  );
  return true;
}

const dirs = ["fixtures/sessions", "fixtures/samples"];
for (const dir of dirs) {
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    processFile(path.join(dir, name));
  }
}
