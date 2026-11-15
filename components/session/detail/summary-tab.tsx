"use client";

import { Check, ClipboardCopy, Ellipsis, Pencil, Quote, Scissors, ListPlus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { SummaryBullet, UserNote } from "@/components/session/summary-bullet";
import { Button } from "@/components/ui/button";
import { TagChip } from "@/components/ui/chips";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { formatClock } from "@/components/ribbon/draw";
import { data, type Bullet, type SessionDetail, type Template, type Topic } from "@/lib/data";
import { footerNote, sectionTitle } from "@/lib/data/localize";
import type { ShareIntent } from "./share-sheet";

/*
 * Tab Tóm tắt (docs/03-screens.md mục 5a).
 * Điểm chính, rồi các phần theo mẫu của nghề, mỗi phần gồm các chủ đề.
 * Chạm một ý để phát từ mốc đó. Ghi chú tay hiện dưới ý liên quan.
 * M4-01: nhấn giữ một ý (hoặc nút ⋯ trên máy tính): sao chép, sửa, tạo thẻ
 * trích dẫn, thêm vào đoạn tinh túy, chuyển thành việc cần làm.
 */

function FigureBars({ figure }: { figure: NonNullable<Topic["figure"]> }) {
  const t = useTranslations("session");
  const locale = useLocale();
  const max = Math.max(...figure.values);
  const fmt = (v: number) => new Intl.NumberFormat(locale === "en" ? "en-US" : "vi-VN", { maximumFractionDigits: 2 }).format(v);
  return (
    <figure className="ml-5 mt-2 rounded-block border border-line p-3">
      <figcaption className="text-small font-medium text-ink">{figure.title}</figcaption>
      <ul className="mt-2 flex flex-col gap-2">
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
}) {
  const t = useTranslations("session");
  const ts = useTranslations("transcript");
  const locale = useLocale();
  const toast = useToast();
  const colorOf = Object.fromEntries(detail.speakers.map((s) => [s.id, s.color_index]));
  const speakerNameOf = Object.fromEntries(detail.speakers.map((s) => [s.id, s.display_name]));
  const noteById = Object.fromEntries(detail.notes.map((n) => [n.id, n]));

  const allBullets = detail.topics.flatMap((tp) => tp.bullets).sort((a, b) => a.timestamp_sec - b.timestamp_sec);
  const [menuBullet, setMenuBullet] = useState<Bullet | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  async function saveEdit() {
    const b = editingId ? allBullets.find((x) => x.id === editingId) : null;
    const next = editValue.trim();
    if (!b || !next || next === b.text) {
      setEditingId(null);
      return;
    }
    try {
      await data.sessions.updateBullet(detail.id, b.id, next);
      setEditingId(null);
      toast.show({ tone: "success", message: t("bulletSaved") });
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
    }
  }

  async function copyBullet(b: Bullet) {
    try {
      await navigator.clipboard.writeText(b.text);
      toast.show({ tone: "success", message: ts("copied") });
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
    }
  }

  async function bulletToTask(b: Bullet) {
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

  /** Thẻ trích dẫn từ một ý: đến đầu ý kế tiếp, tối đa 20 giây. */
  function quoteFromBullet(b: Bullet): ShareIntent {
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
      },
    };
  }

  const sections = (template?.sections ?? []).filter((s) => s.enabled);
  const ordered = [
    ...sections.map((s) => ({ id: s.id, title: sectionTitle(s, locale), topics: detail.topics.filter((tp) => tp.section_id === s.id) })),
    {
      id: "other",
      title: "",
      topics: detail.topics.filter((tp) => !sections.some((s) => s.id === tp.section_id)),
    },
  ].filter((s) => s.topics.length > 0);

  return (
    <div className="max-w-[68ch]">
      <h2 className="text-small font-semibold text-ink-2">{t("keyPoints")}</h2>
      <p className="mt-1 text-body text-ink">{detail.executive_summary}</p>

      {ordered.map((section) => (
        <section key={section.id} className="mt-8">
          {section.title ? <h2 className="text-small font-semibold text-ink-2">{section.title}</h2> : null}
          {section.topics.map((topic) => (
            <article key={topic.id} className="mt-4">
              <div className="flex items-center gap-2">
                <TagChip size="sm" tag={topic.tag} label={tagLabels[topic.tag]} />
              </div>
              <div className="mt-1.5 flex items-baseline gap-3">
                <h3 className="min-w-0 flex-1 text-h2 font-semibold text-ink">{topic.title}</h3>
                {canSeek ? (
                  <button
                    type="button"
                    onClick={() => onSeek(topic.start_sec)}
                    aria-label={`${t("seek")} ${formatClock(topic.start_sec)}`}
                    className="inline-flex min-h-8 items-center rounded-control text-caption font-medium tabular-nums text-ink-3 hover:underline"
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
              {topic.figure ? <FigureBars figure={topic.figure} /> : null}
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
              label={ts("copy")}
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
  children,
}: {
  bullet: Bullet;
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
