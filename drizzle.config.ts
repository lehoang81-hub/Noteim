import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit — sinh và chạy migration cho Postgres (Supabase, §1.3).
 * `DATABASE_URL` chỉ đọc từ biến môi trường, không ghi khóa vào file.
 *
 * Project Supabase dùng chung với app khác: mọi bảng của Noteim nằm trong
 * schema `noteim` (role `noteim_app` trên DATABASE_URL) — không đụng `public`.
 * - `schemaFilter` giới hạn schema drizzle-kit đọc/ghi.
 * - `migrations.schema` đặt bảng sổ migration (`__drizzle_migrations`) trong
 *   schema `noteim` thay vì schema mặc định `drizzle`.
 *
 * Lệnh:
 * - `pnpm db:generate` — sinh SQL migration từ `lib/db/schema.ts` rồi gỡ
 *   `CREATE SCHEMA` (scripts/db-generate-clean.mjs): schema `noteim` do
 *   DBA tạo sẵn trên Supabase, role `noteim_app` không có quyền CREATE
 *   trên database nên migration không được phát sinh CREATE SCHEMA.
 * - `pnpm db:migrate`  — scripts/db-migrate.mjs: đọc journal, chạy từng
 *   file SQL trong 1 giao dịch, bảng sổ `noteim.__drizzle_migrations`,
 *   không tạo schema. KHÔNG dùng `drizzle-kit migrate` vì nó tự chạy
 *   CREATE SCHEMA → lỗi 42501 với role `noteim_app`.
 * - `pnpm db:test`     — migration (bằng script trên) + seed hai lần trên
 *   PGlite với role giới hạn, kiểm idempotent
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["noteim"],
  migrations: {
    table: "__drizzle_migrations",
    schema: "noteim",
  },
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  verbose: true,
  strict: true,
});
