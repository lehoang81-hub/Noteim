/**
 * Kiểm nối DATABASE_URL — PR 02 (đặc tả C1 §1.3). Chạy trước `pnpm db:migrate`.
 *
 * Dùng: `node scripts/db-check.mjs` (hoặc `pnpm db:check`)
 * - Mã 0: nối được — in phiên bản Postgres, múi giờ máy chủ và các bảng đã có
 *   trong schema public.
 * - Mã 2: thiếu DATABASE_URL hoặc giá trị không phải chuỗi Postgres — trạng thái
 *   "đang chờ", không phải lỗi phần mềm.
 * - Mã 3: có biến nhưng nối thất bại (mạng, khóa sai, hết hạn…).
 *
 * Không bao giờ in URL hay mật khẩu: thông báo chỉ nêu tên biến và mô tả lỗi,
 * đúng quy tắc "khóa chỉ đọc từ biến môi trường, không log" (§5).
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "";

function exitWith(code, message) {
  console.log(message);
  process.exit(code);
}

if (!url) {
  exitWith(
    2,
    "Thiếu DATABASE_URL (Supabase Postgres vùng ap-southeast-1) — đang chờ. Đặt biến môi trường rồi chạy lại; không commit khóa.",
  );
}
if (!url.startsWith("postgres://") && !url.startsWith("postgresql://")) {
  exitWith(
    2,
    "DATABASE_URL hiện có nhưng không phải chuỗi Postgres (postgres://…) — đang chờ giá trị Supabase đúng (dạng pooler, không phải SQLite/URL khác). Không commit khóa.",
  );
}

const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 10, idle_timeout: 5 });
try {
  const versionRows = await sql`select version() as v`;
  const tzRows = await sql`show timezone`;
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name`;
  console.log("NỐI ĐƯỢC DATABASE_URL");
  console.log("Postgres:", String(versionRows[0]?.v ?? "").split(",")[0]);
  const tzRow = tzRows[0] ?? {};
  console.log("Múi giờ máy chủ:", String(tzRow.timezone ?? tzRow.TimeZone ?? tzRow.time_zone ?? "?"));
  console.log(
    "Bảng đã có (schema public):",
    tables.length ? tables.map((t) => t.table_name).join(", ") : "(trống — chưa chạy migration)",
  );
} catch (error) {
  exitWith(3, `Nối DATABASE_URL thất bại: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await sql.end({ timeout: 5 });
}
