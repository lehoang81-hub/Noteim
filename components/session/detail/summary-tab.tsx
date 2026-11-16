"use client";

import { Check, ClipboardCopy, Ellipsis, Languages, Link2, Pencil, Quote, Scissors, ListPlus, Loader2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { SummaryBullet, UserNote } from "@/components/session/summary-bullet";
import { Button } from "@/components/ui/button";
import { TagChip } from "@/components/ui/chips";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { formatClock } from "@/components/ribbon/draw";
import { data, DataError, type Lang, type SessionDetail, type SummaryVersion, type Template } from "@/lib/data";
import { footerNote, sectionTitle, speakerLabel } from "@/lib/data/localize";
import { decimal } from "@/lib/format";
import type { ShareIntent } from "./share-sheet";
import { cn } from "@/lib/cn";

/*
 * Tab Tóm tắt (docs/03-screens.md mục 5a; M6-03, issue #45).
 * M6-03: đầu tab có ô "Tóm tắt bằng" — chọn bản theo ngôn ngữ (bản gốc hoặc
 * bản đã dịch), tạo bản mới qua xác nhận và tiến trình 2 bước. Bản dịch ghi
 * rõ "Dịch từ ..."; bản gốc sửa sau khi dịch thì bản dịch hiện "Dịch lại".
 * Câu trích dẫn giữ nguyên câu gốc trong ngoặc kép, bản dịch đặt dưới.
 * Chạm một ý để phát từ mốc đó. M4-01: nhấn giữ một ý: sao chép, sửa, tạo
 * thẻ trích dẫn, thêm vào đoạn tinh túy, chuyển thành việc cần làm.
 */

/** Tên ngôn ngữ theo NGÔN NGỮ GIAO DIỆN ("tiếng Hàn"/"Korean"/"한국어").
 * Khác với settings.lang* (tên gốc tiếng Hàn "한국어") — chip và nút tạo bản
 * dùng tên theo giao diện để giao diện vi/en không có chữ Hàn, không phải
 * tải phông Hàn chỉ cho một nhãn (M6-04). */
const LANG_UI_NAME_KEY: Record<Lang, string> = { vi: "summary.langVi", en: "summary.langEn", ko: "summary.langKo" };

function FigureBars({ figure, lang }: { figure: NonNullable<SummaryVersion["topics"][number]["figure"]>; lang: Lang }) {
  const t = useTranslations("session");
  const max = Math.max(...figure.values);
  // Số giữ nguyên, định dạng theo ngôn ngữ của bản đang xem (M6-03)
  const fmt = (v: number) => decimal(v, lang, 2);
  return (
    <figure className="ml-5 mt-2 rounded-block border border-line p-3">
      {/* Tiêu đề và nhãn biểu đồ theo ngôn ngữ của bản đang xem (Mục 2 review #52) */}
      <figcaption lang={lang} className="text-small font-medium text-ink">{figure.title}</figcaption>
      <ul lang={lang} className="mt-2 flex flex-col gap-2">
        {figure.labels.map((label, i) => (
          <li key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
            <span className="truncate text-caption text-ink-2">{label}</span>
            <span className="text-caption font-semibold tabular-nums text-ink">
              {fmt(figure.values[i])} {figure.unit}
            </span>
            <span className="col-span-2 h-2 rounded-pill bg-surface-2">
              <span className="block h-2 rounded-pill bg-tag-figure" style={{ width: `${Math.max(4, (figure.values[i] / max) * 100)}%` }} />
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-caption text-ink-3">{t("figureSource", { time: formatClock(figure.source_timestamp_sec) })}</p>
    </figure>
  );
}

export function SummaryTab({
  detail,
  template,
  tagLabels,
  playingBulletId,
  canSeek,
  onSeek,
  onAskAi,
  onSendMinutes,
  onShareIntent,
  version,
  verLang,
  onVerLang,
  versions,
  originalLang,
  plan,
}: {
  detail: SessionDetail;
  template?: Template;
  tagLabels: Record<string, string>;
  playingBulletId: string | null;
  canSeek: boolean;
  onSeek: (time: number) => void;
  onAskAi: () => void;
  onSendMinutes: () => void;
  /** Mở bảng chia sẻ với lựa chọn chỉ định: thẻ trích dẫn, đoạn tinh túy (M4-01) */
  onShareIntent?: (intent: ShareIntent) => void;
  /** Bản tóm tắt đang xem (M6-03): bản gốc hoặc bản dịch */
  version: SummaryVersion;
  verLang: Lang;
  onVerLang: (lang: Lang) => void;
  /** Các bản đã có của buổi (detail.report_languages) */
  versions: Lang[];
  originalLang: Lang;
  plan: "free" | "pro";
}) {
  const t = useTranslations("session");
  const ts = useTranslations("summary");
  const tl = useTranslations(); // nhãn hệ thống + tên ngôn ngữ ở cấp gốc
  const locale = useLocale(); // tên phần template theo ngôn ngữ giao diện
  const toast = useToast();
  const colorOf = Object.fromEntries(detail.speakers.map((s) => [s.id, s.color_index]));
  const speakerNameOf = Object.fromEntries(detail.speakers.map((s) => [s.id, speakerLabel(s, detail.speakers, tl)]));
  const noteById = Object.fromEntries(detail.notes.map((n) => [n.id, n]));

  const allBullets = version.topics.flatMap((tp) => tp.bullets).sort((a, b) => a.timestamp_sec - b.timestamp_sec);
  const [menuBullet, setMenuBullet] = useState<(typeof allBullets)[number] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Tạo bản mới (M6-03): xác nhận -> tiến trình 2 bước -> hiện bản mới
  const [creatingLang, setCreatingLang] = useState<Lang | null>(null);
  const [creatingStep, setCreatingStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(false);

  const isOriginal = verLang === originalLang;

  async function saveEdit() {
    const b = editingId ? allBullets.find((x) => x.id === editingId) : null;
    const next = editValue.trim();
    if (!b || !next || next === b.text) {
      setEditingId(null);
      return;
    }
    try {
      // Sửa ý ở bản nào thì chỉ bản đó đổi (M6-03)
      if (isOriginal) await data.sessions.updateBullet(detail.id, b.id, next);
      else await data.sessions.updateVersionBullet(detail.id, verLang, b.id, next);
      setEditingId(null);
      toast.show({ tone: "success", message: t("bulletSaved") });
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
    }
  }

  async function copyBullet(b: { text: string }) {
    try {
      await navigator.clipboard.writeText(b.text);
      toast.show({ tone: "success", message: t("bulletSaved") });
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
    }
  }

  async function bulletToTask(b: { id: string; text: string; is_quote: boolean; timestamp_sec: number }) {
    try {
      await data.tasks.upsert({
        id: `a-user-${Date.now().toString(36)}`,
        session_id: detail.id,
        task: b.text,
        assignee_contact_id: null,
        due_date: null,
        priority: "medium",
        done: false,
        done_at: null,
        source_quote: b.is_quote ? b.text : null,
        timestamp_sec: b.timestamp_sec,
      });
      toast.show({ tone: "success", message: t("bulletToTask") });
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
    }
  }

  /** Tạo bản dịch hoặc Dịch lại bản lỗi thời (M6-03). */
  async function createVersion(lang: Lang) {
    setCreating(true);
    setCreateError(false);
    setCreatingStep(1);
    setCreatingLang(lang);
    try {
      await data.sessions.createSummaryVersion(detail.id, lang, (step) => setCreatingStep(step));
      toast.show({ tone: "success", message: ts("createdToast", { lang: tl(LANG_UI_NAME_KEY[lang]) }) });
      onVerLang(lang);
      setCreatingLang(null);
      setCreating(false);
    } catch (e) {
      setCreating(false);
      setCreatingLang(null);
      setCreatingStep(0);
      if (e instanceof DataError && e.code === "quota_exceeded") toast.show({ tone: "error", message: ts("limitTitle") });
      else setCreateError(true);
    }
  }

  /** Thẻ trích dẫn từ một ý: đến đầu ý kế tiếp, tối đa 20 giây. */
  function quoteFromBullet(b: { id: string; text: string; timestamp_sec: number; speaker_id: string; is_quote: boolean; original_text?: string; original_lang?: Lang }): ShareIntent {
    const next = allBullets[allBullets.findIndex((x) => x.id === b.id) + 1];
    const end = Math.min(Math.max(b.timestamp_sec + 1, next ? next.timestamp_sec : detail.duration_sec), b.timestamp_sec + 20);
    return {
      kind: "card",
      quote: {
        text: b.text,
        speakerName: speakerNameOf[b.speaker_id] ?? "",
        speakerColorIndex: colorOf[b.speaker_id] ?? 0,
        startSec: b.timestamp_sec,
        endSec: end,
        // Bản dịch đang xem + câu gốc (M6-04): chọn được Câu gốc / kèm dịch / chỉ bản dịch
        originalText: b.original_text,
        originalLang: b.original_lang,
        translatedText: isOriginal ? undefined : b.text,
        translatedLang: isOriginal ? undefined : verLang,
      },
    };
  }

  const sections = (template?.sections ?? []).filter((s) => s.enabled);
  const ordered = [
    ...sections.map((s) => ({ id: s.id, title: sectionTitle(s, locale), topics: version.topics.filter((tp) => tp.section_id === s.id) })),
    {
      id: "other",
      title: "",
      topics: version.topics.filter((tp) => !sections.some((s) => s.id === tp.section_id)),
    },
  ].filter((s) => s.topics.length > 0);

  return (
    <div className="max-w-[68ch]">
      {/* Ô "Tóm tắt bằng" (M6-03): các bản đã có + tạo bản mới */}
      <fieldset>
        <legend className="text-small font-semibold text-ink-2">{ts("versionLabel")}</legend>
        <div role="radiogroup" aria-label={ts("versionLabel")} className="mt-1.5 flex flex-wrap items-center gap-2">
          {versions.map((lang) => (
            <button
              key={lang}
              type="button"
              role="radio"
              aria-checked={verLang === lang}
              onClick={() => onVerLang(lang)}
              className={cn(
                "h-11 rounded-control border px-3 text-small font-medium transition-colors ease-noteim duration-(--t-quick)",
                verLang === lang ? "border-sen bg-sen/10 text-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
              )}
            >
              <span>{tl(LANG_UI_NAME_KEY[lang])}</span>
            </button>
          ))}
          {/* Tạo bản cho ngôn ngữ chưa có. Gói Free: 1 bản thêm mỗi buổi,
              đủ hạn mức thì khóa có lý do và nút nâng cấp (M6-03). */}
          {(["vi", "en", "ko"] as Lang[])
            .filter((lang) => !versions.includes(lang))
            .map((lang) => {
              const locked = plan === "free" && versions.length >= 2;
              return (
                <button
                  key={lang}
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    setCreatingLang(lang);
                    setCreating(false);
                    setCreateError(false);
                    setCreatingStep(0);
                  }}
                  className={cn(
                    "inline-flex h-11 items-center gap-1.5 rounded-control border border-dashed px-3 text-small font-medium transition-colors ease-noteim duration-(--t-quick)",
                    locked ? "cursor-not-allowed border-line bg-surface-2 text-ink-3" : "border-dien bg-surface text-dien hover:bg-dien-tint",
                  )}
                >
                  <Languages aria-hidden={true} className="size-4" strokeWidth={1.75} />
                  {ts("createVersion", { lang: tl(LANG_UI_NAME_KEY[lang]) })}
                </button>
              );
            })}
        </div>
        {plan === "free" && versions.length >= 2 ? (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-3">
            <span>{ts("limitTitle")}</span>
            <Link2 aria-hidden={true} className="size-3.5" strokeWidth={1.75} />
            <a href="/upgrade" className="font-medium text-dien underline underline-offset-2">
              {ts("upgrade")}
            </a>
          </p>
        ) : null}
      </fieldset>

      {/* Nhãn bản đang xem + cảnh báo lỗi thời (M6-03) */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isOriginal ? (
          <span className="inline-flex items-center gap-1 rounded-pill bg-surface-2 px-2 py-0.5 text-caption font-medium text-ink-2">
            {ts("originalBadge")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-pill bg-dien-tint px-2 py-0.5 text-caption font-medium text-dien">
            {ts("translatedFrom", { lang: tl(LANG_UI_NAME_KEY[originalLang]) })}
          </span>
        )}
        {version.sample ? <span className="text-caption text-ink-3">{ts("sampleNote")}</span> : null}
      </div>
      {version.stale ? (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-tag-pending bg-tag-pending-bg px-3 py-2">
          <p className="min-w-0 flex-1 text-small text-tag-pending">{ts("staleBanner")}</p>
          <Button variant="secondary" className="h-9" loading={creating} onClick={() => void createVersion(verLang)}>
            {ts("retranslate")}
          </Button>
        </div>
      ) : null}

      {/* Tiến trình tạo bản 2 bước (M6-03) */}
      {creating ? (
        <div role="status" className="mt-3 rounded-block border border-dien bg-dien-tint p-3">
          <p className="text-small font-medium text-dien">{ts("createConfirmTitle", { lang: tl(LANG_UI_NAME_KEY[creatingLang ?? "ko"]) })}</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {[1, 2].map((step) => (
              <li key={step} className="flex items-center gap-2 text-small text-ink-2">
                {creatingStep > step ? (
                  <Check aria-hidden={true} className="size-4 text-dien" strokeWidth={2} />
                ) : creatingStep === step ? (
                  <Loader2 aria-hidden={true} className="size-4 animate-spin text-dien" strokeWidth={2} />
                ) : (
                  <span aria-hidden={true} className="size-4 rounded-pill border border-line" />
                )}
                {step === 1 ? ts("step1") : ts("step2")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {createError ? (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-tag-risk bg-tag-risk-bg px-3 py-2">
          <p className="min-w-0 flex-1 text-small text-tag-risk">{t("saveError")}</p>
          <Button variant="secondary" className="h-9" onClick={() => void createVersion(verLang)}>
            {t("retry")}
          </Button>
        </div>
      ) : null}

      <h2 className="mt-6 text-small font-semibold text-ink-2">{t("keyPoints")}</h2>
      {/* Nội dung bản tóm tắt theo ngôn ngữ của bản đang xem: lang để chữ Hàn
          không ngắt giữa từ và trình đọc màn hình đọc đúng giọng (Mục 2 review #52) */}
      <p lang={verLang} className="mt-1 text-body text-ink">{version.executive_summary}</p>

      {ordered.map((section) => (
        <section key={section.id} className="mt-8">
          {section.title ? <h2 className="text-small font-semibold text-ink-2">{section.title}</h2> : null}
          {section.topics.map((topic) => (
            <article key={topic.id} className="mt-4">
              <div className="flex items-center gap-2">
                <TagChip size="sm" tag={topic.tag} label={tagLabels[topic.tag]} />
              </div>
              <div className="mt-1.5 flex items-baseline gap-3">
                <h3 lang={verLang} className="min-w-0 flex-1 text-h2 font-semibold text-ink">{topic.title}</h3>
                {canSeek ? (
                  <button
                    type="button"
                    onClick={() => onSeek(topic.start_sec)}
                    aria-label={`${t("seek")} ${formatClock(topic.start_sec)}`}
                    className="relative inline-flex min-h-8 items-center rounded-control text-caption font-medium tabular-nums text-ink-3 hover:underline after:absolute after:-inset-1.5 after:content-['']"
                  >
                    {formatClock(topic.start_sec)}
                  </button>
                ) : (
                  <span className="text-caption tabular-nums text-ink-3">{formatClock(topic.start_sec)}</span>
                )}
              </div>
              <div className="mt-1">
                {topic.bullets.map((b) => {
                  const speakerName = speakerNameOf[b.speaker_id];
                  const editing = editingId === b.id;
                  return editing ? (
                    <form
                      key={b.id}
                      className="mb-2 ml-5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveEdit();
                      }}
                    >
                      <textarea
                        autoFocus
                        rows={2}
                        aria-label={t("edit")}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setEditingId(null);
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void saveEdit();
                          }
                        }}
                        className="w-full rounded-control border border-dien bg-surface px-3 py-2 text-body text-ink focus-visible:outline-none"
                      />
                      <div className="mt-2 flex gap-2">
                        <Button type="submit" variant="primary" icon={Check} className="h-9">
                          {t("save")}
                        </Button>
                        <Button variant="ghost" icon={X} className="h-9" onClick={() => setEditingId(null)}>
                          {t("cancel")}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <BulletRow
                      key={b.id}
                      bullet={b}
                      textLang={verLang}
                      tourAnchor={b.id === allBullets[0]?.id}
                      speakerColorIndex={colorOf[b.speaker_id] ?? 0}
                      speakerName={speakerName}
                      playing={playingBulletId === b.id}
                      canSeek={canSeek}
                      onSeek={onSeek}
                      editedLabel={b.edited ? t("edited") : undefined}
                      seekLabel={t("seek")}
                      menuLabel={t("bulletActions")}
                      onOpenMenu={() => setMenuBullet(b)}
                      isOriginal={isOriginal}
                      originalQuoteLabel={ts("originalQuote")}
                      originalLangLabel={tl(LANG_UI_NAME_KEY[originalLang])}
                    >
                      {b.note_ids.length ? (
                        <div className="flex flex-col gap-1.5">
                          {b.note_ids.map((id) =>
                            noteById[id] ? (
                              <UserNote key={id} label={t("yourNote")}>
                                {noteById[id].text}
                              </UserNote>
                            ) : null,
                          )}
                        </div>
                      ) : null}
                    </BulletRow>
                  );
                })}
              </div>
              {topic.figure ? <FigureBars figure={topic.figure} lang={verLang} /> : null}
            </article>
          ))}
        </section>
      ))}

      {footerNote(template, locale) ? <p className="mt-8 text-small text-ink-3">{footerNote(template, locale)}</p> : null}

      <div className="mt-8 flex flex-wrap gap-2">
        <Button variant="primary" onClick={onSendMinutes}>
          {t("sendMinutes")}
        </Button>
        <Button variant="ai" onClick={onAskAi}>
          {t("askAi")}
        </Button>
      </div>

      {/* Xác nhận tạo bản mới (M6-03) */}
      <ConfirmDialog
        open={!!creatingLang && !creating}
        onOpenChange={(next) => !next && setCreatingLang(null)}
        title={ts("createConfirmTitle", { lang: tl(LANG_UI_NAME_KEY[creatingLang ?? "ko"]) })}
        cancelLabel={t("cancel")}
        confirmLabel={ts("createVersion", { lang: tl(LANG_UI_NAME_KEY[creatingLang ?? "ko"]) })}
        onConfirm={() => creatingLang && void createVersion(creatingLang)}
      >
        {ts("createConfirmBody")}
      </ConfirmDialog>

      {/* Bảng thao tác với một ý: nhấn giữ trên điện thoại, nút ⋯ trên máy tính */}
      <Sheet
        open={!!menuBullet}
        onOpenChange={(open) => !open && setMenuBullet(null)}
        title={t("bulletActions")}
        description={menuBullet?.text}
        size="half"
      >
        {menuBullet ? (
          <ul className="divide-y divide-line">
            <ActionRow
              icon={ClipboardCopy}
              label={t("copy")}
              onClick={() => {
                setMenuBullet(null);
                void copyBullet(menuBullet);
              }}
            />
            <ActionRow
              icon={Pencil}
              label={t("edit")}
              onClick={() => {
                setEditingId(menuBullet.id);
                setEditValue(menuBullet.text);
                setMenuBullet(null);
              }}
            />
            <ActionRow
              icon={Quote}
              label={t("bulletQuoteCard")}
              onClick={() => {
                const intent = quoteFromBullet(menuBullet);
                setMenuBullet(null);
                onShareIntent?.(intent);
              }}
            />
            <ActionRow
              icon={Scissors}
              label={t("bulletToHighlights")}
              onClick={() => {
                const id = menuBullet.id;
                setMenuBullet(null);
                onShareIntent?.({ kind: "highlights", bulletId: id });
              }}
            />
            <ActionRow
              icon={ListPlus}
              label={t("bulletMakeTask")}
              onClick={() => {
                const b = menuBullet;
                setMenuBullet(null);
                void bulletToTask(b);
              }}
            />
          </ul>
        ) : null}
      </Sheet>
    </div>
  );
}

/** Một ý tóm tắt: chạm để phát, nhấn giữ (hoặc ⋯) để mở bảng thao tác. */
function BulletRow({
  bullet,
  textLang,
  speakerColorIndex,
  speakerName,
  playing,
  canSeek,
  onSeek,
  editedLabel,
  seekLabel,
  menuLabel,
  tourAnchor,
  onOpenMenu,
  isOriginal,
  originalQuoteLabel,
  originalLangLabel,
  children,
}: {
  bullet: SummaryVersion["topics"][number]["bullets"][number];
  /** Ngôn ngữ của nội dung bản đang xem (Mục 2 review #52) */
  textLang: Lang;
  speakerColorIndex: number;
  speakerName?: string;
  playing?: boolean;
  canSeek: boolean;
  onSeek: (time: number) => void;
  editedLabel?: string;
  seekLabel: string;
  menuLabel: string;
  /** Mốc cho chú thích nổi đầu tiên của tour làm quen (M4-04) */
  tourAnchor?: boolean;
  onOpenMenu: () => void;
  /** Bản gốc thì ý không kèm câu gốc; bản dịch thì ý trích dẫn giữ câu gốc (M6-03) */
  isOriginal?: boolean;
  originalQuoteLabel: string;
  originalLangLabel: string;
  children?: React.ReactNode;
}) {
  const holdTimer = useRef(0);
  const holdMoved = useRef(false);
  const holdFired = useRef(false);
  const holdPos = useRef({ x: 0, y: 0 });

  function holdStart(e: React.PointerEvent) {
    holdMoved.current = false;
    holdFired.current = false;
    holdPos.current = { x: e.clientX, y: e.clientY };
    holdTimer.current = window.setTimeout(() => {
      if (!holdMoved.current) {
        holdFired.current = true;
        onOpenMenu();
      }
    }, 500);
  }
  function holdMove(e: React.PointerEvent) {
    const dx = e.clientX - holdPos.current.x;
    const dy = e.clientY - holdPos.current.y;
    if (dx * dx + dy * dy > 144) holdMoved.current = true;
  }
  function holdEnd() {
    window.clearTimeout(holdTimer.current);
  }

  return (
    <div
      className="group/bullet relative"
      data-tour={tourAnchor ? "first-bullet" : undefined}
      onPointerDown={holdStart}
      onPointerMove={holdMove}
      onPointerUp={holdEnd}
      onPointerCancel={holdEnd}
    >
      <SummaryBullet
        text={bullet.text}
        textLang={textLang}
        time={formatClock(bullet.timestamp_sec)}
        speakerColorIndex={speakerColorIndex}
        speakerLabel={speakerName}
        quoteLabel={bullet.is_quote && speakerName ? speakerName : undefined}
        playing={playing}
        editedLabel={editedLabel}
        seekLabel={seekLabel}
        onSeek={
          canSeek
            ? () => {
                // Nhấn giữ vừa mở bảng thao tác thì không phát luôn
                if (holdFired.current) {
                  holdFired.current = false;
                  return;
                }
                onSeek(bullet.timestamp_sec);
              }
            : undefined
        }
      >
        {children}
        {/* Câu trích dẫn giữ câu gốc: bản dịch đặt dưới kèm nhãn (M6-03) */}
        {!isOriginal && bullet.is_quote && bullet.original_text ? (
          <div lang={bullet.original_lang ?? "vi"} className="mt-1 border-l-2 border-line pl-3">
            <p className="text-caption font-medium text-ink-3">
              {originalQuoteLabel} · {originalLangLabel}
            </p>
            <p className="text-small text-ink-2">“{bullet.original_text}”</p>
          </div>
        ) : null}
      </SummaryBullet>
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label={menuLabel}
        className="absolute right-0 top-1 hidden h-9 w-9 items-center justify-center rounded-control text-ink-3 opacity-0 hover:bg-surface-2 hover:text-ink focus-visible:opacity-100 group-hover/bullet:opacity-100 lg:flex"
      >
        <Ellipsis aria-hidden={true} className="size-4" strokeWidth={2} />
      </button>
    </div>
  );
}

function ActionRow({ icon: Icon, label, onClick }: { icon: typeof Pencil; label: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex min-h-12 w-full items-center gap-3 py-2 text-left text-body text-ink">
        <Icon aria-hidden={true} className="size-5 shrink-0 text-ink-2" strokeWidth={1.75} />
        {label}
      </button>
    </li>
  );
}
