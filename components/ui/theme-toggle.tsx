"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

const THEME_KEY = "noteim-theme";
const THEME_CHANGE_EVENT = "noteim-theme-change";

/*
 * Một nút duy nhất đổi giao diện sáng và tối.
 * - Áp dụng bằng cách thêm/bỏ class .dark trên <html>.
 * - Lưu lựa chọn vào localStorage để còn nguyên khi tải lại trang.
 * - Biểu tượng và chữ cho biết giao diện SẼ chuyển sang (đang sáng thì hiện
 *   mặt trăng). Vẽ hai bản, hiện/ẩn bằng CSS nên không lệch khi hydrate.
 * - Máy tính (từ 1024px) có thêm chữ cạnh biểu tượng.
 * - Trạng thái đọc trực tiếp từ DOM qua useSyncExternalStore, sự kiện
 *   báo cho React biết khi nào cần vẽ lại.
 */
function subscribe(onChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
}

function getSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function getServerSnapshot() {
  return false;
}

export function ThemeToggle() {
  const t = useTranslations("theme");
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const isDark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
    } catch {
      // Không lưu được thì chỉ mất lựa chọn khi tải lại, chức năng vẫn chạy.
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? t("switchToLight") : t("switchToDark")}
      title={dark ? t("switchToLight") : t("switchToDark")}
      className="flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-control border border-line bg-surface text-small font-medium text-ink transition-colors ease-noteim hover:bg-surface-2 lg:px-3.5"
      style={{ transitionDuration: "var(--t-quick)" }}
    >
      <Moon aria-hidden={true} className="size-5 dark:hidden" strokeWidth={1.75} />
      <Sun aria-hidden={true} className="hidden size-5 dark:block" strokeWidth={1.75} />
      <span aria-hidden={true} className="hidden lg:inline dark:lg:hidden">
        {t("toDarkShort")}
      </span>
      <span aria-hidden={true} className="hidden dark:lg:inline">
        {t("toLightShort")}
      </span>
    </button>
  );
}
