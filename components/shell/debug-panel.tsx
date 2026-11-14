"use client";

import { FlaskConical, RotateCcw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { resetData, type Profession } from "@/lib/data";
import { resetFlags, setFlags, useDebugFlags, type DebugFlags } from "@/lib/debug/flags";

/*
 * Bảng thử nghiệm (docs/03-screens.md, "Bảng điều khiển thử nghiệm").
 * Bật bằng ?debug=1 trên bất kỳ đường dẫn nào, tắt bằng nút "Tắt bảng" hoặc ?debug=0.
 * Chỉ để người duyệt ép trạng thái, không có trong bản thật.
 */

const PROFESSIONS: Profession[] = ["business_owner", "doctor", "lawyer", "realestate_sales", "architect", "notary"];
const TOGGLES: Array<
  keyof Pick<DebugFlags, "offline" | "slow" | "failLoad" | "quotaOut" | "emptyLibrary" | "recordSpeed30" | "micDenied" | "micTaken">
> = ["offline", "slow", "failLoad", "quotaOut", "emptyLibrary", "recordSpeed30", "micDenied", "micTaken"];

export function DebugPanel() {
  const t = useTranslations("debug");
  const flags = useDebugFlags();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  if (!flags.panel) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("open")}
        className="fixed bottom-24 left-3 z-[55] flex size-11 items-center justify-center rounded-pill border border-line bg-surface text-dien shadow-float lg:bottom-4 lg:left-4"
      >
        <FlaskConical aria-hidden={true} className="size-5" strokeWidth={1.75} />
      </button>
    );
  }

  const select = "h-11 w-full rounded-control border border-line bg-surface px-2 text-small text-ink";

  return (
    <section
      aria-label={t("title")}
      className="fixed inset-x-3 bottom-24 z-[55] max-h-[70dvh] overflow-y-auto rounded-block border border-line bg-surface p-4 text-ink shadow-float sm:inset-x-auto sm:left-3 sm:w-80 lg:bottom-4 lg:left-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-small font-semibold">
          <FlaskConical aria-hidden={true} className="size-4 text-dien" strokeWidth={2} />
          {t("title")}
        </h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t("close")}
          className="-mr-2 flex size-11 items-center justify-center rounded-control text-ink-2 hover:bg-surface-2"
        >
          <X aria-hidden={true} className="size-5" strokeWidth={1.75} />
        </button>
      </div>

      <div className="mt-1 divide-y divide-line">
        {TOGGLES.map((key) => (
          <Switch key={key} checked={flags[key]} onCheckedChange={(v) => setFlags({ [key]: v })} label={t(key)} />
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-caption font-medium text-ink-2">
          {t("profession")}
          <select
            className={`${select} mt-1`}
            value={flags.profession ?? ""}
            onChange={(e) => setFlags({ profession: (e.target.value || null) as Profession | null })}
          >
            <option value="">{t("default")}</option>
            {PROFESSIONS.map((p) => (
              <option key={p} value={p}>
                {t(`prof.${p}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-caption font-medium text-ink-2">
          {t("plan")}
          <select
            className={`${select} mt-1`}
            value={flags.plan ?? ""}
            onChange={(e) => setFlags({ plan: (e.target.value || null) as "free" | "pro" | null })}
          >
            <option value="">{t("default")}</option>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          icon={RotateCcw}
          onClick={() => {
            resetFlags();
            resetData();
            toast.show({ tone: "success", message: t("resetDone") });
          }}
        >
          {t("reset")}
        </Button>
        <Button variant="ghost" onClick={() => setFlags({ panel: false })}>
          {t("hide")}
        </Button>
      </div>
    </section>
  );
}
