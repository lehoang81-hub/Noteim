import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

/*
 * Ngôn ngữ giao diện: đọc từ cookie "noteim-locale" (M4-03, mục Cài đặt,
 * Giao diện). Chưa chọn thì mặc định theo ngôn ngữ trình duyệt (M6-04: trang
 * công khai mở ở trình duyệt ko-KR hiện tiếng Hàn), cuối cùng là tiếng Việt.
 * Bản dịch nằm trong messages/vi.json, messages/en.json và messages/ko.json
 * (M6-01, issue #43). Thêm ngôn ngữ mới = thêm một giá trị ở đây và một file.
 */
export const locales = ["vi", "en", "ko"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "vi";
export const LOCALE_COOKIE = "noteim-locale";

/** Chọn ngôn ngữ từ header Accept-Language: "ko-KR,ko;q=0.9,en;q=0.8". */
function negotiate(acceptLanguage: string | null): Locale | null {
  if (!acceptLanguage) return null;
  const parsed = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.split("=")[1]) || 0 : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of parsed) {
    const base = tag.split("-")[0];
    if (base === "vi") return "vi";
    if (base === "en") return "en";
    if (base === "ko") return "ko";
  }
  return null;
}

export default getRequestConfig(async () => {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  let locale: Locale = locales.includes(fromCookie as Locale) ? (fromCookie as Locale) : defaultLocale;
  if (!fromCookie) {
    // Chưa từng chọn ngôn ngữ: theo ngôn ngữ trình duyệt (M6-04)
    const header = await headers();
    locale = negotiate(header.get("accept-language")) ?? defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
