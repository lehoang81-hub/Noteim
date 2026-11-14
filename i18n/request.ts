import {getRequestConfig} from "next-intl/server";

/*
 * M0: chưa có máy đổi ngôn ngữ, mặc định tiếng Việt.
 * Bản dịch nằm trong messages/vi.json và messages/en.json.
 */
export const locales = ["vi", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "vi";

export default getRequestConfig(async () => {
  const locale: Locale = defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
