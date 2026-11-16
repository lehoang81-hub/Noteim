import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

/*
 * Ngôn ngữ giao diện: đọc từ cookie "noteim-locale" (M4-03, mục Cài đặt,
 * Giao diện). Chưa chọn thì mặc định tiếng Việt.
 * Bản dịch nằm trong messages/vi.json, messages/en.json và messages/ko.json
 * (M6-01, issue #43). Thêm ngôn ngữ mới = thêm một giá trị ở đây và một file.
 */
export const locales = ["vi", "en", "ko"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "vi";
export const LOCALE_COOKIE = "noteim-locale";

export default getRequestConfig(async () => {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  const locale: Locale = locales.includes(fromCookie as Locale) ? (fromCookie as Locale) : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
