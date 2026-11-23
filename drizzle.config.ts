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
 * - `pnpm db:generate` — sinh SQL migration từ `lib/db/schema.ts` (không cần DB)
 * - `pnpm db:migrate`  — chạy migration vào DATABASE_URL (bước triển khai)
 * - `pnpm db:test`     — migration + seed hai lần trên PGlite, kiểm idempotent
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
