import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit — sinh và chạy migration cho Postgres (Supabase, §1.3).
 * `DATABASE_URL` chỉ đọc từ biến môi trường, không ghi khóa vào file.
 *
 * Lệnh:
 * - `pnpm db:generate` — sinh SQL migration từ `lib/db/schema.ts` (không cần DB)
 * - `pnpm db:migrate`  — chạy migration vào DATABASE_URL (bước triển khai)
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  verbose: true,
  strict: true,
});
