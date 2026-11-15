"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { data, useData } from "@/lib/data";

/*
 * Gói dịch vụ (M4-03): gói hiện tại, hạn mức đã dùng (thanh), nút xem gói Pro.
 * Bảng so sánh Free và Pro nằm ở /upgrade (docs/03-screens.md mục 13).
 */

export function PlanSection() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const me = useData(() => data.account.me(), []);
  const quota = useData(() => data.account.quota(), []);

  const q = quota.data;
  const used = q ? q.minutes_used : 0;
  const limit = q ? q.minutes_limit : 1;
  const percent = Math.min(100, Math.round((used / limit) * 100));
  const plan = me.data?.plan ?? "free";

  return (
    <div className="flex flex-col gap-6">
      <p className="text-body text-ink">
        {plan === "pro" ? t("planCurrentPro") : t("planCurrentFree")}
      </p>

      <div>
        <div className="flex items-baseline justify-between">
          <h2 className="text-small font-semibold text-ink-2">{t("planQuota")}</h2>
          <span className="text-small tabular-nums text-ink">
            {used} / {limit} {t("planMinutes")}
          </span>
        </div>
        <div className="mt-2 h-2.5 rounded-pill bg-surface-2" role="img" aria-label={`${used}/${limit}`}>
          <div className={percent >= 100 ? "h-2.5 rounded-pill bg-tag-risk" : "h-2.5 rounded-pill bg-sen"} style={{ width: `${Math.max(2, percent)}%` }} />
        </div>
        {q ? <p className="mt-2 text-caption text-ink-3">{t("planReset", { date: new Date(q.period_end).toLocaleDateString(locale === "en" ? "en-US" : "vi-VN") })}</p> : null}
      </div>

      {plan === "free" ? (
        <Link
          href="/upgrade"
          className="inline-flex h-11 items-center justify-center rounded-control bg-sen px-4 text-small font-semibold text-on-sen hover:bg-sen/90 sm:self-start"
        >
          {t("planSeePro")}
        </Link>
      ) : null}
    </div>
  );
}
