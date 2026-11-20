"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, FolderOpen, Mic, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { MicDrawing } from "@/components/ui/feedback";
import { Switch } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { data, useData, type Folder } from "@/lib/data";
import { templateName } from "@/lib/data/localize";
import { professionRequiresConsent } from "@/lib/intake-templates";
import type { ConsentReceipt, Lang } from "@/lib/data/types";

/*
 * Các bảng trượt của màn hình ghi (docs/03-screens.md mục 2):
 * - Xin quyền micro: lần đầu tiên trong đời, một câu giải thích + hình minh họa.
 * - Hỏi đồng ý ghi âm: bảng nhỏ tự đóng sau 3 giây, đóng là coi như đồng ý,
 *   có ô "Phát câu thông báo ghi âm". M6-02 (issue #44): thêm dòng Ngôn ngữ —
 *   chip ngôn ngữ chính (mặc định theo Cài đặt) và công tắc "Có thể có tiếng
 *   khác" (mặc định bật); bấm vào dòng ngôn ngữ thì hẹn giờ tự đóng chạy lại
 *   để người dùng kịp chọn, không thêm lần chạm nào cho người không cần đổi.
 * - Đổi mẫu: chạm tên mẫu ở giữa trên để đổi ngay trong lúc ghi.
 */

const SPEECH_LANGS: Array<{ id: Lang; labelKey: string }> = [
  // Tên ngôn ngữ theo NGÔN NGỮ GIAO DIỆN (summary.lang*) — thống nhất với các
  // chip khác (review PR #52 mục 6); giao diện vi/en không còn chữ Hàn trên chip
  { id: "vi", labelKey: "summary.langVi" },
  { id: "en", labelKey: "summary.langEn" },
  { id: "ko", labelKey: "summary.langKo" },
];

export type SpeechChoice = { primary_language: Lang; auto_detect: boolean };

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

/** Bảng hỏi đồng ý ghi âm: tự đóng sau 3 giây, đóng là coi như đồng ý.
 * GC-05 (đặc tả v1.1 §4.7): thêm dòng Thư mục — chọn thư mục để buổi mới
 * kế thừa mẫu của thư mục; không chọn thì dùng mẫu mặc định.
 * GC-05 (đặc tả v1.1 §4.6): mẫu nhạy cảm (requires_consent) thì bắt buộc biên
 * nhận: nhập ai đồng ý, TẮT tự đóng (tự đóng là đồng ý mà không có biên nhận
 * — sai luật), nút xác nhận khóa cho đến khi có tên. */
export function ConsentSheet({
  open,
  defaultLanguage,
  defaultAutoDetect,
  defaultTemplateId,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  /** Ngôn ngữ chính mặc định theo Cài đặt (M6-02) */
  defaultLanguage: Lang;
  /** Công tắc "Có thể có tiếng khác" mặc định theo Cài đặt */
  defaultAutoDetect: boolean;
  /** Mẫu sẽ dùng khi không chọn thư mục (GC-05): quyết định có cần biên nhận không */
  defaultTemplateId: string | null;
  /** announced: có phát câu thông báo ghi âm hay không; folderId: thư mục
   * chọn cho buổi mới (null là không thuộc thư mục nào); receipts: biên nhận
   * khi mẫu nhạy cảm (không có khi mẫu thường) */
  onConfirm: (announced: boolean, speech: SpeechChoice, folderId: string | null, receipts?: ConsentReceipt[]) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("record");
  const tr = useTranslations(); // tên ngôn ngữ ở namespace settings (M6-02)
  const folders = useData(() => data.folders.list(), []);
  const templates = useData(() => data.account.templates(), []);
  const [announce, setAnnounce] = useState(false);
  const [language, setLanguage] = useState<Lang>(defaultLanguage);
  const [autoDetect, setAutoDetect] = useState(defaultAutoDetect);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [who, setWho] = useState("");
  const latest = useRef({ announce, language, autoDetect, folderId, who });
  useEffect(() => {
    latest.current = { announce, language, autoDetect, folderId, who };
  }, [announce, language, autoDetect, folderId, who]);

  // Mẫu sẽ dùng theo thư mục chọn (kế thừa, đặc tả §4.7); mẫu nhạy cảm cần
  // biên nhận trước khi ghi (đặc tả §4.6)
  const folder = folderId ? (folders.data ?? []).find((f) => f.id === folderId) : null;
  const resolvedTemplateId = folder?.template_id ?? defaultTemplateId ?? (templates.data?.[0]?.id ?? null);
  const resolvedProfession = templates.data?.find((tp) => tp.id === resolvedTemplateId)?.profession;
  const needsReceipt = professionRequiresConsent(resolvedProfession);
  const receiptReady = !needsReceipt || who.trim().length > 0;

  // Tự đóng sau 3 giây: đóng là coi như đồng ý (docs/03-screens.md mục 2).
  // Bấm chip ngôn ngữ hay công tắc thì hẹn giờ chạy lại — người dùng đang
  // tương tác thì không tự đóng giữa chừng. Mẫu nhạy cảm thì KHÔNG tự đóng.
  const [interactedAt, setInteractedAt] = useState(0);
  useEffect(() => {
    if (!open || needsReceipt) return;
    const id = window.setTimeout(
      () =>
        onConfirm(
          latest.current.announce,
          { primary_language: latest.current.language, auto_detect: latest.current.autoDetect },
          latest.current.folderId,
        ),
      3000,
    );
    return () => window.clearTimeout(id);
    // onConfirm đọc qua ref nên không cần vào deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, interactedAt, needsReceipt]);

  /** Biên nhận khi mẫu nhạy cảm: ai đồng ý, lúc nào, bằng cách nào (đặc tả §4.6). */
  function receipt(): ConsentReceipt[] | undefined {
    if (!needsReceipt) return undefined;
    return [
      {
        id: `cr-${Date.now().toString(36)}`,
        who: latest.current.who.split(",").map((s) => s.trim()).filter(Boolean),
        at: new Date().toISOString(),
        method: "button",
        announcement_text: latest.current.announce ? t("announceSentence") : undefined,
      },
    ];
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) =>
        !next &&
        receiptReady &&
        onConfirm(
          latest.current.announce,
          { primary_language: latest.current.language, auto_detect: latest.current.autoDetect },
          latest.current.folderId,
          receipt(),
        )
      }
      title={t("consentTitle")}
      size="half"
    >
      <div className="flex flex-col gap-3 py-1">
        {/* Dòng Ngôn ngữ (M6-02): chip ngôn ngữ chính + công tắc tiếng khác */}
        <fieldset>
          <legend className="mb-1.5 text-small font-medium text-ink">{t("languageLabel")}</legend>
          <div role="radiogroup" aria-label={t("languageLabel")} className="flex flex-wrap gap-2">
            {SPEECH_LANGS.map(({ id, labelKey }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={language === id}
                onClick={() => (setLanguage(id), setInteractedAt((n) => n + 1))}
                className={cn(
                  "h-11 rounded-control border px-3 text-small font-medium transition-colors ease-noteim duration-(--t-quick)",
                  language === id ? "border-sen bg-sen/10 text-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
                )}
              >
                <span>{tr(labelKey)}</span>
              </button>
            ))}
          </div>
          <div className="mt-2">
            <Switch
              checked={autoDetect}
              onCheckedChange={(v) => (setAutoDetect(v), setInteractedAt((n) => n + 1))}
              label={t("autoDetect")}
            />
          </div>
        </fieldset>
        <Switch checked={announce} onCheckedChange={setAnnounce} label={t("announce")} />
        {/* Biên nhận đồng ý bắt buộc khi mẫu nhạy cảm (GC-05, đặc tả §4.6):
            ai đồng ý — không có tên thì không ghi được */}
        {needsReceipt ? (
          <fieldset>
            <legend className="mb-1.5 flex items-center gap-1.5 text-small font-medium text-ink">
              <TriangleAlert aria-hidden={true} className="size-4 shrink-0 text-tag-pending" strokeWidth={2} />
              {t("receiptWhoLabel")}
            </legend>
            <p className="mb-2 text-caption text-ink-3">{t("receiptRequiredHint")}</p>
            <input
              value={who}
              onChange={(e) => setWho(e.target.value)}
              aria-label={t("receiptWhoLabel")}
              placeholder={t("receiptWhoPlaceholder")}
              className="h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink placeholder:text-ink-3 focus:border-dien focus-visible:outline-none"
            />
          </fieldset>
        ) : null}
        {/* Dòng Thư mục (GC-05): buổi mới kế thừa mẫu của thư mục chọn */}
        <fieldset>
          <legend className="mb-1.5 text-small font-medium text-ink">{t("folderLabel")}</legend>
          <div role="radiogroup" aria-label={t("folderLabel")} className="flex flex-wrap gap-2">
            <button
              type="button"
              role="radio"
              aria-checked={folderId === null}
              onClick={() => (setFolderId(null), setInteractedAt((n) => n + 1))}
              className={cn(
                "h-11 rounded-control border px-3 text-small font-medium transition-colors ease-noteim duration-(--t-quick)",
                folderId === null ? "border-sen bg-sen/10 text-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
              )}
            >
              {t("folderNone")}
            </button>
            {(folders.data ?? []).map((f: Folder) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={folderId === f.id}
                onClick={() => (setFolderId(f.id), setInteractedAt((n) => n + 1))}
                className={cn(
                  "inline-flex h-11 max-w-full items-center gap-1.5 rounded-control border px-3 text-small font-medium transition-colors ease-noteim duration-(--t-quick)",
                  folderId === f.id ? "border-sen bg-sen/10 text-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
                )}
              >
                <FolderOpen aria-hidden={true} className="size-3.5 shrink-0" strokeWidth={2} />
                <span className="min-w-0 truncate">{f.name}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t("consentCancel")}
        </Button>
        <Button
          variant="primary"
          disabled={!receiptReady}
          onClick={() =>
            onConfirm(
              latest.current.announce,
              { primary_language: latest.current.language, auto_detect: latest.current.autoDetect },
              latest.current.folderId,
              receipt(),
            )
          }
        >
          {t("consentConfirm")}
        </Button>
      </div>
    </Sheet>
  );
}

/** Bảng biên nhận khi đang ghi đổi sang mẫu nhạy cảm (GC-05, đặc tả v1.1
 * §4.6): phải ghi ai đồng ý rồi mới được dùng mẫu này; Bỏ là giữ mẫu cũ. */
export function ConsentReceiptSheet({
  open,
  templateName: switchingTo,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  /** Tên mẫu nhạy cảm đang chuyển sang */
  templateName: string;
  /** who: tên những người đồng ý; announced: có phát câu thông báo */
  onConfirm: (who: string[], announced: boolean) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("record");
  const [who, setWho] = useState("");
  const [announce, setAnnounce] = useState(false);
  const latest = useRef({ who, announce });
  useEffect(() => {
    latest.current = { who, announce };
  }, [who, announce]);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onCancel()}
      title={t("consentReceiptTitle")}
      size="half"
    >
      <div className="flex flex-col gap-3 py-1">
        <p className="text-body text-ink-2">{t("receiptSwitchHint", { template: switchingTo })}</p>
        <fieldset>
          <legend className="mb-1.5 text-small font-medium text-ink">{t("receiptWhoLabel")}</legend>
          <input
            value={who}
            onChange={(e) => setWho(e.target.value)}
            aria-label={t("receiptWhoLabel")}
            placeholder={t("receiptWhoPlaceholder")}
            className="h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink placeholder:text-ink-3 focus:border-dien focus-visible:outline-none"
          />
        </fieldset>
        <Switch checked={announce} onCheckedChange={setAnnounce} label={t("announce")} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t("receiptCancel")}
        </Button>
        <Button
          variant="primary"
          disabled={!who.trim()}
          onClick={() =>
            onConfirm(
              latest.current.who.split(",").map((s) => s.trim()).filter(Boolean),
              latest.current.announce,
            )
          }
        >
          {t("receiptMidConfirm")}
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
