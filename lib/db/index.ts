/**
 * Kết nối Postgres (Supabase) — đặc tả C1 §1.3.
 *
 * Nguyên tắc bắt buộc (yêu cầu bổ sung nhịp 2, §1.3):
 * - `DATABASE_URL` chỉ đọc trên máy chủ, không bao giờ ra trình duyệt.
 *   Không đặt `NEXT_PUBLIC_*` cho khóa nào; client chỉ nói chuyện với
 *   API Route của app.
 * - Supabase chỉ dùng như một Postgres: không Auth, không RLS của
 *   Supabase. Quyền kiểm ở lớp repository phía máy chủ.
 * - Vùng Singapore (ap-southeast-1) chọn lúc tạo project Supabase.
 *
 * Kết nối là singleton lười: chỉ tạo lần đầu có người dùng cần DB
 * (đăng nhập hoặc API gọi DB). Thiếu `DATABASE_URL` thì lỗi khi gọi
 * mới nổ — không nổ lúc import, để chế độ ẩn danh/mock vẫn chạy
 * (nguyên tắc rollback §5: lỗi auth không chặn người dùng cũ).
 */
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

type Database = PostgresJsDatabase<typeof schema>;

let cached: { client: postgres.Sql; db: Database } | null = null;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb(): Database {
  if (cached) return cached.db;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL chưa đặt — đặt qua biến môi trường (Supabase Postgres vùng ap-southeast-1), không commit khóa.",
    );
  }

  // Pooler của Supabase chạy chế độ transaction: phải tắt prepare
  // (chuẩn nối serverless theo §1.3). Số kết nối nhỏ, vừa máy thử.
  const client = postgres(url, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  cached = { client, db: drizzle(client, { schema }) };
  return cached.db;
}
