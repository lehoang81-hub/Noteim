"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Mic } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { MicDrawing } from "@/components/ui/feedback";
import { Switch } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { data, useData } from "@/lib/data";
import { templateName } from "@/lib/data/localize";

/*
 * Các bảng trượt của màn hình ghi (docs/03-screens.md mục 2):
 * - Xin quyền micro: lần đầu tiên trong đời, một câu giải thích + hình minh họa.
 * - Hỏi đồng ý ghi âm: bảng nhỏ tự đóng sau 3 giây, đóng là coi như đồng ý,
 *   có ô "Phát câu thông báo ghi âm".
 * - Đổi mẫu: chạm tên mẫu ở giữa trên để đổi ngay trong lúc ghi.
 */

/** Bảng xin quyền micro (lần đầu tiên). Đóng bằng Esc hoặc nền mờ là hủy. */
export function MicPermissionSheet({
  open,
  onCancel,
  onAllowed,
  micStatus,
}: {
  open: boolean;
  onCancel: () => void;
  /** Gọi khi đã đọc được micro (bấm "Cho phép micro" và được cấp quyền). */
  onAllowed: () => void;
  micStatus: string;
}) {
  const t = useTranslations("record");
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onCancel()} title={t("permissionTitle")} size="half">
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <MicDrawing className="size-20 text-ink-3" />
        <p className="max-w-[36ch] text-body text-ink-2">{t("permissionBody")}</p>
        {micStatus === "denied" ? <p className="text-small font-medium text-tag-risk">{t("micDeniedHint")}</p> : null}
        {micStatus === "unsupported" ? <p className="text-small font-medium text-tag-risk">{t("micUnsupportedHint")}</p> : null}
      </div>
      <Button
        variant="primary"
        block
        loading={micStatus === "asking"}
        onClick={onAllowed}
        className="mt-4"
      >
        <Mic aria-hidden={true} className="size-5" strokeWidth={1.75} />
        {t("allowMic")}
      </Button>
    </Sheet>
  );
}

/** Bảng hỏi đồng ý ghi âm: tự đóng sau 3 giây, đóng là coi như đồng ý. */
export function ConsentSheet({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  /** announced: có phát câu thông báo ghi âm hay không */
  onConfirm: (announced: boolean) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("record");
  const [announce, setAnnounce] = useState(false);
  const announceRef = useRef(announce);
  useEffect(() => {
    announceRef.current = announce;
  }, [announce]);

  // Tự đóng sau 3 giây: đóng là coi như đồng ý (docs/03-screens.md mục 2)
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => onConfirm(announceRef.current), 3000);
    return () => window.clearTimeout(id);
    // Bảng mở lại từ đầu mỗi lần; onConfirm đọc qua ref nên không cần vào deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onConfirm(announceRef.current)} title={t("consentTitle")} size="half">
      <div className="flex flex-col gap-1 py-1">
        <Switch checked={announce} onCheckedChange={setAnnounce} label={t("announce")} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t("consentCancel")}
        </Button>
        <Button variant="primary" onClick={() => onConfirm(announceRef.current)}>
          {t("consentConfirm")}
        </Button>
      </div>
    </Sheet>
  );
}

/** Bảng chọn mẫu: chạm tên mẫu ở giữa trên màn hình ghi để mở. */
export function TemplateSheet({
  open,
  onOpenChange,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedId: string | null;
  onSelect: (templateId: string) => void;
}) {
  const t = useTranslations("record");
  const locale = useLocale();
  const templates = useData(() => data.account.templates(), []);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t("pickTemplate")} size="half">
      <ul className="flex flex-col">
        {(templates.data ?? []).map((tp) => {
          const active = tp.id === selectedId;
          return (
            <li key={tp.id}>
              <button
                type="button"
                onClick={() => onSelect(tp.id)}
                aria-current={active || undefined}
                className={cn(
                  "flex min-h-11 w-full items-center justify-between gap-3 rounded-control px-3 py-2.5 text-left text-body",
                  "transition-colors ease-noteim duration-(--t-quick) hover:bg-surface-2",
                  active && "bg-surface-2 font-semibold text-ink",
                )}
              >
                <span className="min-w-0 truncate">{templateName(tp, locale)}</span>
                {active ? <ChevronDown aria-hidden={true} className="size-4 shrink-0 text-ink-3" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
