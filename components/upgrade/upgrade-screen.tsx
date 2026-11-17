"use client";

import { ArrowLeft, Check, CreditCard, Landmark, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/*
 * Gói dịch vụ /upgrade (docs/03-screens.md mục 13, issue M4-03; M7-03 thêm
 * gói Nhóm theo docs/08 phần B: giá theo người mỗi tháng, để "…" như các
 * gói khác, số chờ Hoang chốt).
 * Bảng so sánh Free, Pro và Nhóm.
 * Hai nút thanh toán dẫn tới màn "Bản mockup chưa nối thanh toán".
 * Điện thoại: ba thẻ xếp dọc, Pro ở trên; máy tính: ba cột.
 */

const ROWS = [
  "recordTime",
  "originalAudio",
  "summaryTasks",
  "templates",
  "visuals",
  "askAi",
  "search",
  "email",
  "share",
] as const;

const TEAM_ROWS = ["workspace", "quota", "templates", "audit", "seats"] as const;

export function UpgradeScreen() {
  const t = useTranslations("upgrade");
  const ts = useTranslations("session");
  const [paying, setPaying] = useState<"vietqr" | "card" | null>(null);

  if (paying) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-page pb-24 lg:px-8">
        <div className="rounded-block border border-line bg-surface p-6 text-center">
          <Sparkles aria-hidden={true} className="mx-auto size-8 text-dien" strokeWidth={1.5} />
          <h1 className="mt-3 text-h2 font-semibold text-ink">{t("notConnectedTitle")}</h1>
          <p className="mt-2 text-small text-ink-2">{t("notConnectedBody")}</p>
          <Button className="mt-5" icon={ArrowLeft} onClick={() => setPaying(null)}>
            {ts("back")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="px-page pt-2 lg:px-8 lg:pt-6">
        <h1 className="font-display text-h1 font-semibold text-ink">{t("title")}</h1>
        <p className="mt-1 max-w-[60ch] text-small text-ink-2">{t("intro")}</p>
      </header>

      <div className="px-page pb-40 pt-5 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Pro ở trước (điện thoại), Nhóm ở giữa, Free ở cuối */}
          <PlanCard highlight={true} name={t("proName")} price={t("pricePerMonth")} rows={ROWS.map((id) => ({ key: `pro-${id}`, text: t(`pro.${id}`) }))} />
          <PlanCard
            name={t("teamName")}
            price={t("teamPrice")}
            rows={TEAM_ROWS.map((id) => ({ key: `team-${id}`, text: t(`team.${id}`) }))}
          />
          <PlanCard name={t("freeName")} price={t("freePrice")} rows={ROWS.map((id) => ({ key: `free-${id}`, text: t(`free.${id}`) }))} />
        </div>

        <section aria-label={t("payTitle")} className="mt-8 rounded-block border border-line bg-surface p-5">
          <h2 className="text-body font-semibold text-ink">{t("payTitle")}</h2>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button variant="primary" icon={Landmark} onClick={() => setPaying("vietqr")}>
              {t("payVietqr")}
            </Button>
            <Button variant="secondary" icon={CreditCard} onClick={() => setPaying("card")}>
              {t("payCard")}
            </Button>
          </div>
          <p className="mt-3 text-caption text-ink-3">{t("payNote")}</p>
        </section>
      </div>
    </div>
  );
}

function PlanCard({
  name,
  price,
  rows,
  highlight,
}: {
  name: string;
  price: string;
  rows: Array<{ key: string; text: string }>;
  highlight?: boolean;
}) {
  const t = useTranslations("upgrade");
  return (
    <section aria-label={name} className={cn("rounded-block border p-5", highlight ? "border-sen bg-sen/5" : "border-line bg-surface")}>
      <div className="flex items-center gap-2">
        <h2 className={cn("text-h2 font-semibold", highlight ? "text-sen-text" : "text-ink")}>{name}</h2>
        {highlight ? (
          <span className="rounded-pill bg-sen px-2 py-0.5 text-caption font-semibold text-on-sen">{t("proBadge")}</span>
        ) : null}
      </div>
      <p className="mt-1 text-h2 font-semibold tabular-nums text-ink">{price}</p>
      <ul className="mt-4 flex flex-col divide-y divide-line">
        {rows.map((row) => (
          <li key={row.key} className="flex min-h-11 items-start gap-2.5 py-2">
            <Check aria-hidden={true} className={cn("mt-1 size-4 shrink-0", highlight ? "text-sen" : "text-ink-3")} strokeWidth={2} />
            <span className="min-w-0 flex-1 text-small text-ink">{row.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
