/*
 * Proxy kiểm phiên API (trước gọi là middleware, quy ước Next 16) —
 * đặc tả C1 §1.1.
 *
 * Luật: mọi yêu cầu GHI (không phải GET/HEAD) vào "api/**" phải có
 * phiên hợp lệ. Ngoại lệ giữ nguyên hành vi hiện có:
 * - "api/auth/**": next-auth tự xử lý phiên (đăng nhập, đăng xuất).
 * - POST gap-check của buổi (api/sessions/{id}/gap-check): người ẩn
 *   danh được gọi Gap Check với mã khách như hiện tại (đặc tả GC,
 *   GAP_CHECK_FREE_DAILY).
 *
 * Yêu cầu ĐỌC (GET/HEAD) không chặn — dữ liệu mockup đọc phía máy
 * khách; khi chuyển nguồn remote (PR 03) đường đọc có chủ sẽ tự kiểm
 * quyền ở lớp repository phía máy chủ.
 *
 * Chỉ đọc token từ cookie, không truy vấn DB trong middleware (đúng
 * §1.1: ít truy vấn mỗi request; JWT tự chứng thực bằng chữ ký).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { getSessionCookieName } from "@/lib/auth/session-cookie";

/** Đường ghi mở cho người ẩn danh: Gap Check với mã khách như hiện tại. */
function isAnonymousWriteAllowed(pathname: string): boolean {
  return /^\/api\/sessions\/[^/]+\/gap-check\/?$/.test(pathname);
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (request.method === "GET" || request.method === "HEAD") {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }
  if (isAnonymousWriteAllowed(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    cookieName: getSessionCookieName(),
  });

  if (token) {
    return NextResponse.next();
  }

  return NextResponse.json(
    { error: "unauthorized", message: "Yêu cầu đăng nhập để ghi dữ liệu." },
    { status: 401 },
  );
}

export const config = {
  matcher: ["/api/:path*"],
};
