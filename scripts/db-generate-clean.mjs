/**
 * Chạy ngay sau `drizzle-kit generate`: gỡ dòng `CREATE SCHEMA "noteim";`
 * (kèm mốc `--> statement-breakpoint` ngay sau nó) khỏi mọi file SQL
 * đang có trong `drizzle/meta/_journal.json`.
 *
 * Lý do: role `noteim_app` trên Supabase không có quyền CREATE trên
 * database (project Supabase dùng chung với app khác) — schema `noteim`
 * do DBA tạo sẵn, migration không được phát sinh CREATE SCHEMA, nếu có
 * sẽ lỗi 42501 permission denied for database (đã gặp khi test 22/11).
 * drizzle-kit luôn thêm CREATE SCHEMA khi snapshot có schema riêng, nên
 * `pnpm db:generate` tự động gỡ sau mỗi lần sinh để lỗi không tái diễn.
 *
 * Dùng: `pnpm db:generate` (= drizzle-kit generate && script này).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const journal = JSON.parse(
  readFileSync(join(ROOT, "drizzle", "meta", "_journal.json"), "utf8"),
);

let cleaned = 0;
for (const entry of [...journal.entries].sort((a, b) => a.idx - b.idx)) {
  const file = join(ROOT, "drizzle", `${entry.tag}.sql`);
  const text = readFileSync(file, "utf8");
  const next = text.replace(
    /^CREATE SCHEMA (?:IF NOT EXISTS )?"noteim";\r?\n(?:--> statement-breakpoint\r?\n)?/,
    "",
  );
  if (next !== text) {
    writeFileSync(file, next);
    cleaned++;
    console.log(`  đã gỡ CREATE SCHEMA khỏi ${entry.tag}.sql`);
  }
}
console.log(
  cleaned === 0
    ? 'db:generate sạch — không có file migration nào chứa CREATE SCHEMA "noteim".'
    : `db:generate: đã sửa ${cleaned} file migration (gỡ CREATE SCHEMA).`,
);
