import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/nextauth-options";

/**
 * Đường thử bước 1: gọi `getServerSession` trong App Router của Next 16 —
 * đường dễ gãy nhất vì next-auth v4 đọc `cookies()`/`headers()` mà từ
 * Next 15 trở đi chỉ dùng được theo kiểu bất đồng bộ.
 * Bài thử ở bước 1 gọi route này để kết luận next-auth v4 chạy được hay không.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  return Response.json({
    ok: true,
    hasSession: Boolean(session),
    userId: session?.user?.id ?? null,
  });
}
