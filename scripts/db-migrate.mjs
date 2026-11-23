/**
 * db:migrate — chạy migration SQL trong drizzle/ vào DATABASE_URL mà
 * KHÔNG tạo schema (sửa lỗi chặn test trên Supabase 22/11):
 *
 * - `drizzle-kit migrate` tự chạy `CREATE SCHEMA IF NOT EXISTS "noteim"`
 *   để tạo bảng sổ `__drizzle_migrations` (dialect.js), nhưng role
 *   `noteim_app` trên Supabase KHÔNG có quyền CREATE trên database
 *   (project dùng chung với app khác) → lỗi 42501. Script này thay thế.
 *
 * Cách chạy:
 * - Đọc `drizzle/meta/_journal.json`, chạy từng file SQL theo thứ tự
 *   `idx`, toàn bộ trong MỘT giao dịch (file sau lỗi thì cuộn tất cả).
 * - Tạo bảng sổ `noteim.__drizzle_migrations` (IF NOT EXISTS) rồi ghi
 *   hash SHA-256 của từng file đã áp dụng — chạy lại thì bỏ qua hết.
 * - Không dùng CREATE SCHEMA ở bất kỳ đâu; schema `noteim` phải có sẵn
 *   (DBA tạo sẵn trên Supabase — đã có trước khi chạy script này).
 *
 * Bảng sổ (định dạng tương thích drizzle-kit: created_at là millis):
 *   CREATE TABLE IF NOT EXISTS "noteim"."__drizzle_migrations" (
 *     "id" serial PRIMARY KEY,
 *     "hash" text NOT NULL,
 *     "created_at" bigint NOT NULL
 *   );
 *
 * Dùng: `node scripts/db-migrate.mjs` (hoặc `pnpm db:migrate`).
 * `scripts/db-test.mjs` nhập migrateWith() để test trên PGlite với role
 * không có quyền tạo schema.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(import.meta.dirname, "..");
const DRIZZLE_DIR = join(ROOT, "drizzle");

/** Đọc journal + nội dung file SQL — trả về danh sách migration theo thứ tự. */
export function loadMigrations() {
  const journal = JSON.parse(
    readFileSync(join(DRIZZLE_DIR, "meta", "_journal.json"), "utf8"),
  );
  return [...journal.entries]
    .sort((a, b) => a.idx - b.idx)
    .map((entry) => {
      const sqlText = readFileSync(
        join(DRIZZLE_DIR, `${entry.tag}.sql`),
        "utf8",
      );
      return {
        tag: entry.tag,
        sqlText,
        hash: createHash("sha256").update(sqlText).digest("hex"),
      };
    });
}

/** Chia file SQL thành các statement theo mốc của drizzle-kit. */
function chunksOf(sqlText) {
  return sqlText
    .split("--> statement-breakpoint")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

/**
 * Chạy migration qua runtime cung cấp giao dịch:
 *   begin(fn) — mở giao dịch; fn nhận { q, exec }:
 *     - q(text, params?) — 1 statement (chấp nhận $1...), trả mảng rows
 *     - exec(text)       — 1 hoặc nhiều statement, không tham số
 * Không tạo schema ở bất kỳ đâu — schema `noteim` phải có sẵn từ trước.
 */
export async function migrateWith(runtime, { log = () => {} } = {}) {
  const migrations = loadMigrations();
  return runtime.begin(async ({ q, exec }) => {
    // Khóa giữ trong suốt giao dịch: tránh hai process migrate cùng lúc
    // (deploy Vercel nhiều instance cùng bật).
    await exec(
      `SELECT pg_advisory_xact_lock(hashtext('noteim_drizzle_migrations'))`,
    );

    // Bảng sổ — tạo trong schema `noteim` đã có sẵn, không tạo schema.
    await exec(`CREATE TABLE IF NOT EXISTS "noteim"."__drizzle_migrations" (
  "id" serial PRIMARY KEY,
  "hash" text NOT NULL,
  "created_at" bigint NOT NULL
)`);

    const appliedRows = await q(
      `SELECT "hash" FROM "noteim"."__drizzle_migrations"`,
    );
    const applied = new Set(appliedRows.map((row) => String(row.hash)));

    let appliedCount = 0;
    let skippedCount = 0;
    for (const migration of migrations) {
      if (applied.has(migration.hash)) {
        skippedCount++;
        log(`bỏ qua ${migration.tag}.sql (hash đã có trong sổ)`);
        continue;
      }
      log(`chạy ${migration.tag}.sql ...`);
      for (const chunk of chunksOf(migration.sqlText)) {
        await exec(chunk);
      }
      await q(
        `INSERT INTO "noteim"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)`,
        [migration.hash, Date.now()],
      );
      appliedCount++;
    }
    return {
      applied: appliedCount,
      skipped: skippedCount,
      total: migrations.length,
    };
  });
}

/** Runtime cho postgres.js (DATABASE_URL thật — pooler transaction Supabase). */
function postgresRuntime(sql) {
  return {
    begin: (fn) =>
      sql.begin(async (tx) =>
        fn({
          q: (text, params = []) => tx.unsafe(text, params),
          exec: (text) => tx.unsafe(text),
        }),
      ),
  };
}

/* ---------- CLI ---------- */

const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "db:migrate: chưa đặt DATABASE_URL — đặt qua biến môi trường (không ghi khóa vào file).",
    );
    process.exit(1);
  }
  const postgres = (await import("postgres")).default;
  // Pooler transaction của Supabase: phải tắt prepare (như lib/db/index.ts).
  const client = postgres(url, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  try {
    const result = await migrateWith(postgresRuntime(client), {
      log: (message) => console.log(`  ${message}`),
    });
    console.log(
      `db:migrate xong: áp dụng ${result.applied}/${result.total} file, bỏ qua ${result.skipped} (đã có trong sổ). Không tạo schema — noteim phải có sẵn.`,
    );
  } catch (error) {
    console.error(
      "db:migrate THẤT BẠI (giao dịch đã cuộn):",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  } finally {
    await client.end({ timeout: 5 });
  }
}
