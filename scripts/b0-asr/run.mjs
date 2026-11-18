#!/usr/bin/env node
/**
 * B0-01 — Chạy một nhà cung cấp nhận dạng giọng nói trên một file âm thanh, lưu kết quả
 * thô và đã chuẩn hóa (định dạng khai báo ở đầu scripts/b0-asr/score.mjs).
 *
 * Cách dùng:
 *   node scripts/b0-asr/run.mjs --provider soniox --file test-data/audio/01-bds-gap-chi-lan.m4a [--force]
 *
 * - Kết quả thô:    test-data/asr-results/<mã>/<tên bộ>.raw.json   (commit, để không gọi lại tốn tiền)
 * - Đã chuẩn hóa:   test-data/asr-results/<mã>/<tên bộ>.json
 * - Đã có kết quả thì KHÔNG gọi lại; thêm --force để gọi lại.
 * - Thiếu khóa trong biến môi trường: in thông báo rõ và thoát mã 2, không gọi API.
 * - Thời gian xử lý đo thật, ghi vào trường processing_ms (chấm tốc độ so thời gian thực).
 *
 * Mã thoát: 0 xong hoặc đã có kết quả; 1 lỗi gọi API; 2 bỏ qua (thiếu khóa, sai đối số).
 */
import { existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { normalizeResult } from "./common.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RESULTS_DIR = path.join(ROOT, "test-data", "asr-results");

function die(msg, code) {
  console.error(msg);
  process.exit(code);
}

function ffprobeDurationSec(filePath) {
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
      { encoding: "utf8" },
    ).trim();
    return out ? Number(out) : null;
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const args = { force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") args.force = true;
    else if (a === "--provider") args.provider = argv[++i];
    else if (a === "--file") args.file = argv[++i];
    else die(`Không hiểu đối số: ${a}\nDùng: node scripts/b0-asr/run.mjs --provider <mã> --file <âm thanh> [--force]`, 2);
  }
  if (!args.provider || !args.file) {
    die("Dùng: node scripts/b0-asr/run.mjs --provider <mã> --file <âm thanh> [--force]", 2);
  }
  return args;
}

function loadAdapter(code) {
  const dir = path.join(HERE, "providers");
  const available = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".mjs")).map((n) => n.replace(/\.mjs$/, "")) : [];
  if (!available.includes(code)) {
    die(`Không biết nhà cung cấp "${code}". Có sẵn: ${available.join(", ") || "(không có)"}`, 2);
  }
  return import(path.join(dir, `${code}.mjs`));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filePath = path.resolve(args.file);
  if (!existsSync(filePath)) die(`Không thấy file âm thanh: ${filePath}`, 2);

  const mod = await loadAdapter(args.provider);
  const { provider, transcribe } = mod;
  const model = process.env[`${provider.code.toUpperCase()}_MODEL`] || provider.modelDefault || null;

  const baseName = path.basename(filePath).replace(/\.[^.]+$/, "");
  const outDir = path.join(RESULTS_DIR, provider.code);
  const rawPath = path.join(outDir, `${baseName}.raw.json`);
  const normPath = path.join(outDir, `${baseName}.json`);

  if (!args.force && existsSync(normPath) && existsSync(rawPath)) {
    console.log(`Đã có kết quả ${path.relative(ROOT, normPath)} — không gọi lại (dùng --force để gọi lại).`);
    return;
  }

  const missingKeys = provider.env.filter((k) => !process.env[k]);
  if (missingKeys.length) {
    console.log(`Thiếu ${missingKeys.join(", ")} — bỏ qua nhà cung cấp ${provider.code} (không gọi API)`);
    process.exit(2);
  }

  const apiKey = process.env[provider.env[0]];
  console.log(`Gọi ${provider.name} (${model || "mô hình mặc định"}) cho ${path.relative(ROOT, filePath)} ...`);
  let result;
  const t0 = performance.now();
  try {
    result = await transcribe({ filePath, apiKey, model });
  } catch (e) {
    die(`${provider.code}: gọi API lỗi: ${e.message}`, 1);
  }
  const processingMs = Math.round(performance.now() - t0); // gồm cả thời gian chờ việc hoàn thành

  mkdirSync(outDir, { recursive: true });
  writeFileSync(rawPath, JSON.stringify(result.raw, null, 2) + "\n");

  const audioDurationSec = ffprobeDurationSec(filePath);
  const normalized = normalizeResult({
    provider: provider.code,
    file: baseName,
    model,
    processing_ms: processingMs,
    language: result.normalized?.language ?? null,
    segments: result.normalized?.segments ?? [],
    raw_meta: { audio_duration_sec: audioDurationSec },
  });
  writeFileSync(normPath, JSON.stringify(normalized, null, 2) + "\n");

  const dur = audioDurationSec ? `${audioDurationSec.toFixed(1)}s âm thanh` : "không đo được độ dài";
  console.log(
    `Xong ${provider.code} — ${normalized.segments.length} đoạn, ${dur}, ` +
      `xử lý ${normalized.processing_ms ? (normalized.processing_ms / 1000).toFixed(1) + "s" : "không ghi được"}. ` +
      `Lưu: ${path.relative(ROOT, rawPath)}, ${path.relative(ROOT, normPath)}`,
  );
}

main();
