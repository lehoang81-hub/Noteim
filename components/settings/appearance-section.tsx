"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Monitor, Moon, Sun } from "lucide-react";
import { data, useData } from "@/lib/data";
import { setLocaleCookie } from "@/lib/locale";
import { cn } from "@/lib/cn";

/*
 * Giao diện (M4-03): Sáng, Tối, Theo máy (dùng chung cơ chế với nút đổi giao
 * diện: class .dark trên <html> + localStorage "noteim-theme").
 * Ngôn ngữ: Tiếng Việt, English — đổi là cả ứng dụng đổi ngay qua cookie
 * "noteim-locale" (next-intl đọc ở máy chủ) rồi làm mới trang.
 */

const THEME_KEY = "noteim-theme";

function applyTheme(theme: "light" | "dark" | "system") {
  const dark =
    theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Không lưu được thì chỉ mất lựa chọn khi tải lại
  }
  window.dispatchEvent(new Event("noteim-theme-change"));
}

export function AppearanceSection() {
  const t = useTranslations("settings");
  const router = useRouter();
  const me = useData(() => data.account.me(), []);

  function setLanguage(locale: "vi" | "en") {
    setLocaleCookie(locale);
    void data.account.updateMe({ ui_language: locale }).catch(() => undefined);
    router.refresh();
  }

  const themes = [
    { id: "light" as const, label: t("themeLight"), icon: Sun },
    { id: "dark" as const, label: t("themeDark"), icon: Moon },
    { id: "system" as const, label: t("themeSystem"), icon: Monitor },
  ];

  return (
    <div className="flex flex-col gap-8">
      <fieldset>
        <legend className="mb-2 text-small font-medium text-ink">{t("themeLabel")}</legend>
        <div className="flex flex-col gap-1">
          {themes.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={me.data?.theme === id}
              onClick={() => {
                applyTheme(id);
                void data.account.updateMe({ theme: id }).catch(() => undefined);
              }}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-control px-3 text-left text-body transition-colors ease-noteim duration-(--t-quick)",
                me.data?.theme === id ? "bg-sen/10 font-semibold text-ink" : "text-ink-2 hover:bg-surface-2",
              )}
            >
              <Icon aria-hidden={true} className="size-5 shrink-0" strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-small font-medium text-ink">{t("languageLabel")}</legend>
        <div className="flex flex-col gap-1">
          {(["vi", "en"] as const).map((locale) => (
            <button
              key={locale}
              type="button"
              aria-pressed={me.data?.ui_language === locale}
              onClick={() => setLanguage(locale)}
              className={cn(
                "flex min-h-11 items-center rounded-control px-3 text-left text-body transition-colors ease-noteim duration-(--t-quick)",
                me.data?.ui_language === locale ? "bg-sen/10 font-semibold text-ink" : "text-ink-2 hover:bg-surface-2",
              )}
            >
              {locale === "vi" ? t("langVi") : t("langEn")}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
