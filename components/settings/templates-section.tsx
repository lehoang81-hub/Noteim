"use client";

import { ArrowDown, ArrowUp, Lock } from "lucide-react";
import Link from "next/link";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { templateName, sectionTitle } from "@/lib/data/localize";
import { data, useData, type Template } from "@/lib/data";

/*
 * Mẫu tóm tắt (M4-03): xem 6 mẫu, bật tắt từng phần, đổi thứ tự (lên/xuống).
 * Tạo mẫu riêng là Pro: gói Free thấy dòng khóa.
 */

export function TemplatesSection() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const toast = useToast();
  const me = useData(() => data.account.me(), []);
  const templates = useData(() => data.account.templates(), []);
  const [openId, setOpenId] = useState<string | null>(null);
  const plan = me.data?.plan ?? "free";

  async function saveSections(tpl: Template, sections: Template["sections"]) {
    try {
      await data.account.updateTemplate(tpl.id, { sections });
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
    }
  }

  function move(tpl: Template, index: number, delta: -1 | 1) {
    const next = [...tpl.sections];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    void saveSections(tpl, next);
  }

  return (
    <div className="flex flex-col gap-3">
      {(templates.data ?? []).map((tpl) => {
        const open = openId === tpl.id;
        return (
          <section key={tpl.id} className="rounded-block border border-line bg-surface">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : tpl.id)}
              className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-body font-semibold text-ink">{templateName(tpl, locale)}</span>
                <span className="block text-caption text-ink-3">
                  {t("sectionsCount", { count: tpl.sections.filter((s) => s.enabled).length, total: tpl.sections.length })}
                </span>
              </span>
            </button>
            {open ? (
              <ul className="border-t border-line px-4 py-2">
                {tpl.sections.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-2 border-b border-line py-1 last:border-b-0">
                    <span className="min-w-0 flex-1 text-small text-ink">{sectionTitle(s, locale)}</span>
                    <Button
                      variant="ghost"
                      icon={ArrowUp}
                      iconOnly
                      aria-label={t("moveUp", { title: sectionTitle(s, locale) })}
                      disabled={i === 0}
                      onClick={() => move(tpl, i, -1)}
                      className="size-11"
                    />
                    <Button
                      variant="ghost"
                      icon={ArrowDown}
                      iconOnly
                      aria-label={t("moveDown", { title: sectionTitle(s, locale) })}
                      disabled={i === tpl.sections.length - 1}
                      onClick={() => move(tpl, i, 1)}
                      className="size-11"
                    />
                    <SwitchPrimitive.Root
                      checked={s.enabled}
                      onCheckedChange={(v) =>
                        void saveSections(tpl, tpl.sections.map((x) => (x.id === s.id ? { ...x, enabled: v } : x)))
                      }
                      aria-label={t("sectionEnabled", { title: sectionTitle(s, locale) })}
                      className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill bg-ink-3 transition-colors ease-noteim duration-(--t-quick) after:absolute after:-inset-2.5 after:content-[''] data-[state=checked]:bg-sen"
                    >
                      <SwitchPrimitive.Thumb className="block size-5 translate-x-1 rounded-pill bg-surface transition-transform ease-noteim duration-(--t-quick) data-[state=checked]:translate-x-6" />
                    </SwitchPrimitive.Root>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}

      {/* Tạo mẫu riêng là Pro */}
      <div className="flex items-center gap-3 rounded-block border border-dashed border-line p-4">
        <Lock aria-hidden={true} className="size-5 shrink-0 text-ink-3" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 text-small text-ink-2">{plan === "free" ? t("customTemplatePro") : t("customTemplateSoon")}</span>
        {plan === "free" ? (
          <Link href="/upgrade" className="inline-flex min-h-11 items-center rounded-control border border-line bg-surface px-3 text-small font-semibold text-ink hover:bg-surface-2">
            {t("seePro")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
