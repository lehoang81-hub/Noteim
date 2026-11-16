"use client";

import {
  CalendarClock,
  ChevronRight,
  CircleAlert,
  FileClock,
  Link2,
  TriangleAlert,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { TopBar } from "@/components/shell/app-shell";
import { RibbonThumb } from "@/components/ribbon/ribbon-thumb";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/chips";
import { EmptyState } from "@/components/ui/feedback";
import { data, dataNow, useData, type AttentionKind, type DashboardData, type Session } from "@/lib/data";
import { dayDiff, durationParts, weekdayDate } from "@/lib/format";

/*
 * Tổng quan (docs/08 phần B "Bảng điều khiển cá nhân", M7-02, issue #48).
 * - Số liệu từ data.dashboard.get(range), tính theo không gian đang dùng và
 *   quyền đọc của người dùng (bản giả không đếm nội dung buổi riêng tư của
 *   người khác — quyền của M7-01).
 * - Danh sách có đường kẻ mảnh; KHÔNG dùng lưới thẻ số liệu giống nhau
 *   (Bốn điều cấm, docs/02).
 * - "Cần xử lý" ở đầu trang, mỗi dòng đi thẳng tới chỗ xử lý.
 * - "Tuần này": một câu tổng kết và dải giọng ghép theo ngày (dùng lại
 *   RibbonThumb của thư viện), bấm một ngày để lọc thư viện.
 * - Bước 4 sẽ thêm: Quyết định đã chốt, Người gặp nhiều, Theo mẫu, Hạn mức
 *   và tab Nhóm.
 */

const KIND_ICON: Record<AttentionKind, LucideIcon> = {
  task_overdue: CircleAlert,
  task_due_today: CalendarClock,
  speaker_unnamed: UsersRound,
  audio_expiring: FileClock,
  link_expiring: Link2,
  processing_failed: TriangleAlert,
};

type Range = DashboardData["range"];

/**
 * Gom dải giọng của các buổi trong cùng ngày thành một dải, gom về tối đa
 * 40 cột để vừa bề ngang điện thoại (giống resampleThumb của bản giả:
 * cột gộp giữ âm lượng cao nhất và màu người nói của cột đó).
 */
function mergeStrip(sessions: Session[], ids: string[]): { peaks: number[]; speakers: number[] } | null {
  const rows = ids.map((id) => sessions.find((s) => s.id === id)).filter((s): s is Session => !!s);
  if (!rows.length) return null;
  const peaks: number[] = [];
  const speakers: number[] = [];
  for (const s of rows) {
    peaks.push(...s.peaks_thumb);
    speakers.push(...s.speaker_colors_thumb);
  }
  if (peaks.length <= 40) return { peaks, speakers };
  const outP: number[] = [];
  const outS: number[] = [];
  for (let i = 0; i < 40; i++) {
    const from = Math.floor((i * peaks.length) / 40);
    const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / 40));
    let max = 0;
    let sp = speakers[from] ?? 0;
    for (let j = from; j < to; j++) {
      const p = peaks[j] ?? 0;
      if (p >= max) {
        max = p;
        sp = speakers[j] ?? 0;
      }
    }
    outP.push(Math.round(max * 100) / 100);
    outS.push(sp);
  }
  return { peaks: outP, speakers: outS };
}

export function DashboardScreen() {
  const t = useTranslations("dashboard");
  const tl = useTranslations("library");
  const locale = useLocale();
  const router = useRouter();
  const now = dataNow();
  const [range, setRange] = useState<Range>("week");
  const dash = useData(() => data.dashboard.get(range), [range]);
  const sessions = useData(() => data.sessions.list(), []);

  function durationLabel(minutes: number) {
    const { h, m } = durationParts(minutes * 60);
    return h > 0 ? tl("hours", { h, m: String(m).padStart(2, "0") }) : tl("minutes", { m });
  }

  function dayLabel(date: string) {
    const d = new Date(`${date}T12:00:00+07:00`);
    const diff = dayDiff(d, now);
    if (diff <= 0) return tl("today");
    if (diff === 1) return tl("yesterday");
    return weekdayDate(d, locale);
  }

  const loading = dash.initialLoading || sessions.initialLoading;

  return (
    <div className="min-h-dvh">
      <TopBar title={t("title")} />
      <div className="mx-auto w-full max-w-[720px] px-page pt-1 pb-40 lg:px-0">
        {/* Chọn khoảng: áp dụng cho các phần số liệu (Tuần này và các phần sau) */}
        <div role="group" aria-label={t("rangeLabel")} className="flex gap-2 pt-1 pb-2">
          <FilterChip selected={range === "week"} onClick={() => setRange("week")}>
            {t("rangeWeek")}
          </FilterChip>
          <FilterChip selected={range === "month"} onClick={() => setRange("month")}>
            {t("rangeMonth")}
          </FilterChip>
        </div>

        {loading ? (
          <div aria-busy={true} className="mt-4 flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-4 animate-pulse rounded-pill bg-surface-2 motion-reduce:animate-none"
                style={{ width: `${88 - i * 14}%` }}
              />
            ))}
          </div>
        ) : dash.error && !dash.data ? (
          <EmptyState
            drawing={<span />}
            message={t("loadError")}
            action={<Button onClick={dash.reload}>{t("retry")}</Button>}
          />
        ) : (
          dash.data && (
            <>
              {/* ---------- 1. Cần xử lý (đầu trang, quan trọng nhất) ---------- */}
              <section aria-labelledby="dash-attention" className="mt-3">
                <h2 id="dash-attention" className="text-small font-semibold text-ink-2">
                  {t("attention")}
                </h2>
                {dash.data.attention.length === 0 ? (
                  <p className="py-3 text-body text-ink-3">{t("attentionEmpty")}</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {dash.data.attention.map((a) => {
                      const Icon = KIND_ICON[a.kind];
                      return (
                        <li key={`${a.kind}-${a.target_id}`}>
                          <Link
                            href={a.href}
                            className="group flex min-h-14 items-center gap-3 py-2.5 pr-1 transition-colors ease-noteim duration-(--t-quick)"
                            aria-label={t("openAttention", { kind: t(`atKind.${a.kind}`), label: a.label })}
                          >
                            <Icon aria-hidden={true} className="size-5 shrink-0 text-ink-2" strokeWidth={1.75} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-caption text-ink-3">{t(`atKind.${a.kind}`)}</span>
                              <span className="block truncate text-body font-medium text-ink">{a.label}</span>
                            </span>
                            <ChevronRight
                              aria-hidden={true}
                              className="size-5 shrink-0 text-ink-3 transition-transform ease-noteim duration-(--t-quick) group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                              strokeWidth={1.75}
                            />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* ---------- 2. Tuần này / Tháng này ---------- */}
              <section aria-labelledby="dash-week" className="mt-6">
                <h2 id="dash-week" className="text-small font-semibold text-ink-2">
                  {range === "week" ? t("rangeWeek") : t("rangeMonth")}
                </h2>
                {dash.data.totals.sessions === 0 ? (
                  <p className="py-3 text-body text-ink-3">{t("summaryNoSessions")}</p>
                ) : (
                  <>
                    <p className="py-2 text-body text-ink">
                      {t("summary", {
                        sessions: dash.data.totals.sessions,
                        duration: durationLabel(dash.data.totals.minutes),
                        decisions: dash.data.totals.decisions,
                        done: dash.data.totals.tasks_done,
                        total: dash.data.totals.tasks_total,
                      })}
                    </p>
                    <p className="sr-only">{t("dayHint")}</p>
                    {/* Dải giọng ghép theo ngày: bấm một ngày để lọc thư viện */}
                    <ul className="divide-y divide-line">
                      {dash.data.by_day.map((day) => {
                        const strip = mergeStrip(sessions.data ?? [], day.session_ids);
                        return (
                          <li key={day.date}>
                            <button
                              type="button"
                              onClick={() => router.push(`/?day=${day.date}`)}
                              aria-label={t("openDay", { date: dayLabel(day.date) })}
                              className="group flex w-full items-center gap-4 py-3 text-left transition-colors ease-noteim duration-(--t-quick)"
                            >
                              <span className="w-24 shrink-0">
                                <span className="block text-body font-medium text-ink">{dayLabel(day.date)}</span>
                                <span className="block text-caption text-ink-3">{tl("minutes", { m: day.minutes })}</span>
                              </span>
                              {strip ? (
                                <span className="min-w-0 flex-1 overflow-hidden">
                                  <RibbonThumb peaks={strip.peaks} speakers={strip.speakers} className="max-w-full" />
                                </span>
                              ) : null}
                              <ChevronRight
                                aria-hidden={true}
                                className="size-5 shrink-0 text-ink-3 transition-transform ease-noteim duration-(--t-quick) group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                                strokeWidth={1.75}
                              />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </section>
            </>
          )
        )}
      </div>
    </div>
  );
}
