"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { SummaryBullet, UserNote } from "@/components/session/summary-bullet";
import { Button } from "@/components/ui/button";
import { TagChip } from "@/components/ui/chips";
import { formatClock } from "@/components/ribbon/draw";
import type { SessionDetail, Template, Topic } from "@/lib/data";

/*
 * Tab Tóm tắt (docs/03-screens.md mục 5a).
 * Điểm chính, rồi các phần theo mẫu của nghề, mỗi phần gồm các chủ đề.
 * Chạm một ý để phát từ mốc đó. Ghi chú tay hiện dưới ý liên quan.
 */

function FigureBars({ figure }: { figure: NonNullable<Topic["figure"]> }) {
  const t = useTranslations("session");
  const max = Math.max(...figure.values);
  const fmt = (v: number) => v.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
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
              <span
                className="block h-2 rounded-pill bg-tag-figure"
                style={{ width: `${Math.max(4, (figure.values[i] / max) * 100)}%` }}
              />
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
}: {
  detail: SessionDetail;
  template?: Template;
  tagLabels: Record<string, string>;
  playingBulletId: string | null;
  canSeek: boolean;
  onSeek: (time: number) => void;
  onAskAi: () => void;
  onSendMinutes: () => void;
}) {
  const t = useTranslations("session");
  const colorOf = Object.fromEntries(detail.speakers.map((s) => [s.id, s.color_index]));
  const noteById = Object.fromEntries(detail.notes.map((n) => [n.id, n]));

  const sections = (template?.sections ?? []).filter((s) => s.enabled);
  const ordered = [
    ...sections.map((s) => ({ id: s.id, title: s.title, topics: detail.topics.filter((tp) => tp.section_id === s.id) })),
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
                {topic.bullets.map((b) => (
                  <SummaryBullet
                    key={b.id}
                    text={b.text}
                    time={formatClock(b.timestamp_sec)}
                    speakerColorIndex={colorOf[b.speaker_id] ?? 0}
                    playing={playingBulletId === b.id}
                    editedLabel={b.edited ? t("edited") : undefined}
                    seekLabel={t("seek")}
                    onSeek={canSeek ? () => onSeek(b.timestamp_sec) : undefined}
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
                  </SummaryBullet>
                ))}
              </div>
              {topic.figure ? <FigureBars figure={topic.figure} /> : null}
            </article>
          ))}
        </section>
      ))}

      {template?.footer_note ? <p className="mt-8 text-small text-ink-3">{template.footer_note}</p> : null}

      <div className="mt-8 flex flex-wrap gap-2">
        <Button variant="primary" onClick={onSendMinutes}>
          {t("sendMinutes")}
        </Button>
        <Button variant="ai" icon={Sparkles} onClick={onAskAi}>
          {t("askAi")}
        </Button>
      </div>
    </div>
  );
}
