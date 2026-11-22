/**
 * Tên cookie phiên dùng chung — đặc tả C1 §1.1 (`noteim.session`).
 *
 * next-auth đặt cookie Secure khi URL gốc là https (tiền tố `__Secure-`
 * bắt buộc của trình duyệt). Middleware và cấu hình next-auth phải lấy
 * tên từ một nguồn duy nhất để kiểm phiên không bao giờ lệch nhau.
 */
export const SESSION_COOKIE_NAME = "noteim.session";

export function getSessionCookieName(): string {
  const baseUrl = process.env.NEXTAUTH_URL ?? "";
  const isProd = process.env.NODE_ENV === "production";
  const useSecureCookies = baseUrl
    ? baseUrl.startsWith("https://")
    : isProd;
  return useSecureCookies
    ? `__Secure-${SESSION_COOKIE_NAME}`
    : SESSION_COOKIE_NAME;
}
