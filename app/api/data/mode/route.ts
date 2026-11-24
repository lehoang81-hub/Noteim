/**
 * Đường dò chế độ cho e2e (C1-03b): e2e đọc cấu hình máy chủ để tự bỏ qua
 * bài cần nguồn remote khi server không bật NEXT_PUBLIC_DATA_SOURCE=remote
 * hoặc chưa có DATABASE_URL. Không trả bí mật, không trả dữ liệu người dùng.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    dataSource: process.env.NEXT_PUBLIC_DATA_SOURCE === "remote" ? "remote" : "mock",
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    authFake: process.env.AUTH_FAKE === "1" && process.env.VERCEL_ENV !== "production",
    authFakeBuild: process.env.NEXT_PUBLIC_AUTH_FAKE === "1",
  });
}
