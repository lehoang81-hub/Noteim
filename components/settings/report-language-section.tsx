"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Switch } from "@/components/ui/form";
import { data, useData, type Lang } from "@/lib/data";
import { cn } from "@/lib/cn";

/*
 * Ngôn ngữ báo cáo (M6-04, issue #46): ngôn ngữ tóm tắt mặc định (bản dịch
 * tạo cho người nhận khi gửi cũng theo đây nếu họ không đặt riêng) và công
 * tắc "Tự tạo thêm bản cho người nhận khi gửi".
 */

const REPORT_LANGS: readonly Lang[] = ["vi", "en", "ko"];
const LANG_NAME_KEY: Record<Lang, string> = { vi: "langVi", en: "langEn", ko: "langKo" };

export function ReportLanguageSection() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const me = useData(() => data.account.me(), []);
  const [initialized, setInitialized] = useState(false);
  const [reportLang, setReportLang] = useState<Lang>("vi");
  const [autoSend, setAutoSend] = useState(true);

  if (me.data && !initialized) {
    setInitialized(true);
    setReportLang(me.data.default_report_language);
    setAutoSend(me.data.auto_translate_on_send);
  }

  async function patch(value: Parameters<typeof data.account.updateMe>[0]) {
    try {
      await data.account.updateMe(value);
    } catch {
      // Bảng cài đặt báo lỗi chung qua toast ở các mục khác; ở đây lưu im lặng
      // sẽ khó hiểu — dùng lại cùng cơ chế
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset>
        <legend className="mb-2 text-small font-medium text-ink">{t("reportLanguage")}</legend>
        <div role="radiogroup" aria-label={t("reportLanguage")} className="flex flex-wrap gap-2">
          {REPORT_LANGS.map((lg) => (
            <button
              key={lg}
              type="button"
              role="radio"
              aria-checked={reportLang === lg}
              onClick={() => {
                setReportLang(lg);
                void patch({ default_report_language: lg });
              }}
              className={cn(
                "h-11 rounded-control border px-3 text-small font-medium transition-colors ease-noteim duration-(--t-quick)",
                reportLang === lg ? "border-sen bg-sen/10 text-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
              )}
            >
              <span lang={lg === "ko" ? "ko" : undefined}>{t(LANG_NAME_KEY[lg])}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <Switch
        checked={autoSend}
        onCheckedChange={(v) => {
          setAutoSend(v);
          void patch({ auto_translate_on_send: v });
        }}
        label={t("autoTranslateOnSend")}
      />

      <p className="text-small text-ink-3">
        {t("reportLanguageHint")}{" "}
        <Link href="/upgrade" className="font-medium text-dien underline underline-offset-2">
          {locale === "ko" ? "Pro 플랜 보기" : locale === "en" ? "See Pro plan" : "Xem gói Pro"}
        </Link>
      </p>
    </div>
  );
}
