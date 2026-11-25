/**
 * Đường dò chế độ cho e2e (C1-03b): e2e đọc cấu hình máy chủ để tự bỏ qua
 * bài cần nguồn remote khi server không bật NEXT_PUBLIC_DATA_SOURCE=remote
 * hoặc chưa có DATABASE_URL. Không trả bí mật, không trả dữ liệu người dùng.
 * C1-04 thêm `r2`: đã cấu hình kho băng (thật hay R2_FAKE) hay chưa — bài
 * e2e âm thanh tự bỏ qua khi máy chủ chưa có kho.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { r2Mode } = await import("@/lib/data/server/r2");
  const { sonioxFakeActive } = await import("@/lib/data/server/soniox");
  const { geminiFakeActive } = await import("@/lib/data/server/summarize");
  return Response.json({
    dataSource: process.env.NEXT_PUBLIC_DATA_SOURCE === "remote" ? "remote" : "mock",
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    authFake: process.env.AUTH_FAKE === "1" && process.env.VERCEL_ENV !== "production",
    authFakeBuild: process.env.NEXT_PUBLIC_AUTH_FAKE === "1",
    r2: r2Mode() !== null,
    r2Fake: r2Mode() === "fake",
    // C1-05: bài e2e nội dung thật tự bỏ qua khi máy chủ không bật kho giả
    sonioxFake: sonioxFakeActive(),
    geminiFake: geminiFakeActive(),
  });
}
