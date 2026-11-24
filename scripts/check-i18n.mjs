#!/usr/bin/env node
/**
 * Kiểm ba file ngôn ngữ có cùng tập khóa (review #88, M9-02): messages/vi.json
 * là nguồn sự thật, en và ko phải có đủ khóa của vi và không có khóa thừa.
 * Chạy: node scripts/check-i18n.mjs (hoặc `pnpm i18n:check`).
 * Khóa so theo đường dẫn chấm (ví dụ ui.player.retry); mảng chỉ cần bằng nhau
 * về số phần tử ở cùng vị trí. Lỗi thì in khóa thiếu/thừa và thoát mã 1.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function flatten(obj, prefix = "", out = new Map()) {
  if (obj === null || typeof obj !== "object") {
    out.set(prefix, obj);
    return out;
  }
  const isArray = Array.isArray(obj);
  Object.entries(obj).forEach(([key, value], index) => {
    const k = isArray ? String(index) : key;
    flatten(value, prefix ? `${prefix}.${k}` : k, out);
  });
  return out;
}

const lang = (name) => flatten(JSON.parse(readFileSync(path.join(root, "messages", `${name}.json`), "utf8")));
const vi = lang("vi");
const problems = [];

for (const name of ["en", "ko"]) {
  const other = lang(name);
  const missing = [...vi.keys()].filter((k) => !other.has(k));
  const extra = [...other.keys()].filter((k) => !vi.has(k));
  if (missing.length) problems.push(`${name}.json thiếu ${missing.length} khóa so với vi: ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? "…" : ""}`);
  if (extra.length) problems.push(`${name}.json thừa ${extra.length} khóa không có trong vi: ${extra.slice(0, 20).join(", ")}${extra.length > 20 ? "…" : ""}`);
}

if (problems.length) {
  console.error(`i18n:check thất bại — vi/en/ko phải cùng tập khóa:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`i18n:check đạt — vi/en/ko cùng ${vi.size} khóa.`);
