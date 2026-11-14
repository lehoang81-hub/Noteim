"use client";

import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { FileClock, HardDrive } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { TopBar } from "@/components/shell/app-shell";
import { SessionRow, type SessionRowStatus } from "@/components/session/session-row";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/chips";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Banner, EmptyState, SkeletonRow } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { data, dataNow, useData, type Session, type SessionFilter } from "@/lib/data";
import { useDebugFlags } from "@/lib/debug/flags";
import { dayDiff, durationParts, weekdayDate } from "@/lib/format";
import {
  discardRecording,
  recordedSec,
  restoreRecording,
  useRecording,
} from "@/lib/record/recording-store";
import { useStorageFull } from "@/lib/storage-full";

/*
 * Thư viện (docs/03-screens.md mục 1).
 * Điện thoại: cả màn hình. Máy tính: cột giữa 360px, buổi ghi đang mở được tô.
 * Chưa có ở bước này (để M4): vuốt hàng để chia sẻ hoặc xóa, nhấn giữ để chọn nhiều.
 */

type FilterId = "all" | "week" | "open" | `tpl:${string}`;

function toFilter(id: FilterId): SessionFilter | undefined {
  if (id === "week") return { range: "week" };
  if (id === "open") return { has_open_tasks: true };
  if (id.startsWith("tpl:")) return { template_id: id.slice(4) };
  return undefined;
}

const statusMap: Record<Session["status"], SessionRowStatus> = {
  ready: "ready",
  processing: "processing",
  failed: "failed",
  unsynced: "unsynced",
  recording: "processing",
};

export function LibraryPane({ className }: { className?: string }) {
  const t = useTranslations("library");
  const toast = useToast();
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const [filter, setFilter] = useState<FilterId>("all");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const recording = useRecording();
  const flags = useDebugFlags();
  const storageAlert = useStorageFull() || flags.storageFull;

  const me = useData(() => data.account.me(), []);
  const quota = useData(() => data.account.quota(), []);
  const templates = useData(() => data.account.templates(), []);
  const all = useData(() => data.sessions.list(), []);
  const list = useData(() => data.sessions.list(toFilter(filter)), [filter]);

  const now = dataNow();
  const tplName = useMemo(
    () => Object.fromEntries((templates.data ?? []).map((tp) => [tp.id, tp.name])),
    [templates.data],
  );

  const week = useMemo(() => {
    const items = (all.data ?? []).filter((s) => dayDiff(new Date(s.created_at), now) < 7);
    return { sessions: items.length, tasks: items.reduce((n, s) => n + s.open_task_count, 0) };
  }, [all.data, now]);

  const usedTemplates = useMemo(
    () => Array.from(new Set((all.data ?? []).map((s) => s.template_id))),
    [all.data],
  );

  const groups = useMemo(() => {
    const out: { label: string; items: Session[] }[] = [];
    for (const s of list.data ?? []) {
      const diff = dayDiff(new Date(s.created_at), now);
      const label = diff <= 0 ? t("today") : diff === 1 ? t("yesterday") : weekdayDate(s.created_at);
      const g = out.find((x) => x.label === label);
      if (g) g.items.push(s);
      else out.push({ label, items: [s] });
    }
    return out;
  }, [list.data, now, t]);

  const u = me.data;
  const q = quota.data;
  const quotaLeft = q ? q.minutes_limit - q.minutes_used : 0;

  function durationLabel(sec: number) {
    const { h, m } = durationParts(sec);
    return h > 0 ? t("hours", { h, m: String(m).padStart(2, "0") }) : t("minutes", { m });
  }

  const unfinishedTime = recording.startedAtClock
    ? new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(
        new Date(recording.startedAtClock),
      )
    : "";

  function rowStatusText(s: Session) {
    if (s.storage_status === "essence_only" && s.status === "ready") return t("essence");
    if (s.status === "processing") return t("processing", { step: s.processing_step ?? 1 });
    if (s.status === "failed") return t("failed");
    if (s.status === "unsynced") return t("unsynced");
    return undefined;
  }

  async function retry(id: string) {
    try {
      await data.sessions.retryProcessing(id);
      toast.show({ tone: "success", message: t("retrying") });
      data.sessions.subscribeProcessing(id, () => {});
    } catch {
      toast.show({ tone: "error", message: t("loadError") });
    }
  }

  return (
    <section aria-label={t("list")} className={cn("flex min-w-0 flex-col [&>*]:shrink-0", className)}>
      <TopBar />
      <div className="px-page pb-4">
        <h1 className="font-display text-h1 font-semibold text-ink">
          {u
            ? u.honorific
              ? t("greeting", { honorific: u.honorific, name: u.display_name })
              : t("greetingPlain", { name: u.display_name })
            : " "}
        </h1>
        <p className="mt-0.5 min-h-6 text-small text-ink-2">
          {all.data ? (week.sessions ? t("week", week) : t("weekNone")) : null}
        </p>
      </div>

      {/* Chỉ hiện khi buổi ghi bị gián đoạn (tải lại/đóng trang), không hiện
          khi buổi ghi đang chạy trong tab hiện tại — khi đó chỉ có thanh sen
          "Đang ghi" (PR #22, lỗi 2). Không nhận className của cột thư viện. */}
      {recording.interrupted ? (
        <Banner
          kind="offline"
          icon={FileClock}
          className="mt-3"
          action={
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  restoreRecording();
                  router.push("/record");
                }}
                className="-my-2 inline-flex h-10 items-center px-1 font-semibold underline underline-offset-2"
              >
                {t("restore")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDiscard(true)}
                className="-my-2 inline-flex h-10 items-center px-1 font-semibold underline underline-offset-2"
              >
                {t("discard")}
              </button>
            </span>
          }
        >
          {t("unfinished", { time: unfinishedTime, duration: durationLabel(recordedSec()) })}
        </Banner>
      ) : null}

      {/* Bộ nhớ trình duyệt đầy: dữ liệu chỉ còn trong bộ nhớ của phiên.
          Cảnh báo thật từ lần ghi localStorage thất bại, hoặc ép bằng cờ
          "Bộ nhớ đầy" của bảng thử nghiệm (PR #22, lỗi 3). */}
      {storageAlert ? (
        <Banner kind="expiring" icon={HardDrive} className="mt-3">
          {t("storageFull")}
        </Banner>
      ) : null}

      {q && quotaLeft <= 0 ? (
        <Banner kind="quota">{t("quotaOut", { limit: q.minutes_limit, date: "1/12" })}</Banner>
      ) : q && q.minutes_used / q.minutes_limit >= 0.8 ? (
        <Banner kind="quota">{t("quotaLow", { minutes: quotaLeft })}</Banner>
      ) : null}

      <div
        role="group"
        aria-label={t("filters")}
        className="flex gap-2 overflow-x-auto px-page py-2 [scrollbar-width:none]"
      >
        <FilterChip selected={filter === "all"} onClick={() => setFilter("all")}>
          {t("all")}
        </FilterChip>
        <FilterChip selected={filter === "week"} onClick={() => setFilter("week")}>
          {t("thisWeek")}
        </FilterChip>
        <FilterChip selected={filter === "open"} onClick={() => setFilter("open")}>
          {t("openTasks")}
        </FilterChip>
        {usedTemplates.map((id) => (
          <FilterChip key={id} selected={filter === `tpl:${id}`} onClick={() => setFilter(`tpl:${id}`)}>
            {tplName[id] ?? id}
          </FilterChip>
        ))}
      </div>

      <div className="flex-1" aria-busy={list.loading}>
        {list.initialLoading ? (
          <div className="px-page">
            {Array.from({ length: 5 }, (_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : list.error && !list.data ? (
          <EmptyState
            drawing={<span />}
            message={t("loadError")}
            action={<Button onClick={list.reload}>{t("retry")}</Button>}
          />
        ) : (list.data ?? []).length === 0 ? (
          filter === "all" ? (
            <EmptyState
              message={t("empty")}
              action={
                <Button variant="primary" onClick={() => router.push("/record")}>
                  {t("emptyAction")}
                </Button>
              }
            />
          ) : (
            <EmptyState
              drawing={<span />}
              message={t("noMatch")}
              action={<Button onClick={() => setFilter("all")}>{t("clearFilter")}</Button>}
            />
          )
        ) : (
          groups.map((g) => (
            <div key={g.label}>
              <h2 className="px-page pt-4 text-caption font-medium text-ink-3">{g.label}</h2>
              {g.items.map((s) => {
                const status = statusMap[s.status];
                const essence = s.storage_status === "essence_only" && s.status === "ready";
                return (
                  <SessionRow
                    key={s.id}
                    href={`/s/${s.id}`}
                    className="px-page"
                    selected={params?.id === s.id}
                    title={s.title || t("untitled")}
                    duration={durationLabel(s.duration_sec)}
                    template={tplName[s.template_id] ?? ""}
                    peaks={s.peaks_thumb}
                    speakers={s.speaker_colors_thumb}
                    status={essence ? "essence" : status}
                    statusText={rowStatusText(s)}
                    tag={
                      s.headline_tag
                        ? {
                            tag: s.headline_tag.tag,
                            label:
                              s.headline_tag.tag === "pending"
                                ? t("openTag", { count: s.headline_tag.count })
                                : t("decidedTag", { count: s.headline_tag.count }),
                          }
                        : undefined
                    }
                    action={
                      s.status === "failed" ? (
                        <Button variant="ghost" className="-my-2 h-9" onClick={() => retry(s.id)}>
                          {t("retry")}
                        </Button>
                      ) : undefined
                    }
                  />
                );
              })}
            </div>
          ))
        )}
      </div>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={t("discardTitle")}
        cancelLabel={t("cancel")}
        confirmLabel={t("discardConfirm")}
        onConfirm={() => {
          discardRecording();
          setConfirmDiscard(false);
          toast.show({ tone: "success", message: t("discardDone") });
        }}
      >
        {t("discardBody")}
      </ConfirmDialog>
    </section>
  );
}
