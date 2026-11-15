"use client";

/*
 * Đổi ngôn ngữ giao diện (M4-03, mục Giao diện): ghi cookie "noteim-locale"
 * để next-intl đọc ở máy chủ (i18n/request.ts), rồi làm mới trang.
 * Tên cookie lặp ở đây vì i18n/request.ts chỉ được dùng phía máy chủ.
 */
export const LOCALE_COOKIE = "noteim-locale";

export function setLocaleCookie(locale: "vi" | "en") {
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=31536000;samesite=lax`;
}
