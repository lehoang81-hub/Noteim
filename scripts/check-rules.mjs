#!/usr/bin/env node
/**
 * Kiểm "Bốn điều cấm" có thể tự động (docs/02-design-system.md), chạy cùng `pnpm lint`.
 * Lỗi đã lặp lại ở M3, M4, M6, M7: dấu chấm giữa và gạch dài trong chữ giao diện.
 * - Dấu "·" trong JSX hoặc chuỗi của components/, app/ (bỏ qua dòng chú thích).
 * - Dấu "·" hoặc "—" trong messages/*.json.
 * - Lớp `dark:` trong components/ (trừ theme-toggle), `uppercase` cho nhãn.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const problems = [];
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(p);
  }
  return out;
};
const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);

for (const file of [
  ...walk(path.join(root, "components")),
  ...walk(path.join(root, "app")),
]) {
  const rel = path.relative(root, file);
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (isComment(line)) return;
      if (line.includes("·"))
        problems.push(`${rel}:${i + 1} dấu chấm giữa "·" (dùng dấu phẩy)`);
      if (/\bdark:/.test(line) && !rel.includes("theme-toggle"))
        problems.push(`${rel}:${i + 1} lớp dark: (dùng token)`);
      if (/className=.*\buppercase\b/.test(line))
        problems.push(`${rel}:${i + 1} chữ in hoa toàn bộ cho nhãn`);
    });
}
for (const name of readdirSync(path.join(root, "messages"))) {
  if (!name.endsWith(".json")) continue;
  readFileSync(path.join(root, "messages", name), "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (line.includes("·"))
        problems.push(`messages/${name}:${i + 1} dấu chấm giữa "·"`);
      if (line.includes("—"))
        problems.push(`messages/${name}:${i + 1} gạch dài "—"`);
    });
}

if (problems.length) {
  console.error(
    `Vi phạm Bốn điều cấm (${problems.length}):\n` +
      problems.map((p) => `  ${p}`).join("\n"),
  );
  process.exit(1);
}
console.log("Bốn điều cấm: sạch");
