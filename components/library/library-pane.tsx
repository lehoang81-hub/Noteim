"use client";

import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { Archive, Ellipsis, FileClock, HardDrive, Share2, Trash2, UsersRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { TopBar } from "@/components/shell/app-shell";
import { WorkspaceSwitcher } from "@/components/shell/workspace-switcher";
import { SessionRow, type SessionRowStatus } from "@/components/session/session-row";
import { SwipeRow } from "@/components/library/swipe-row";
import dynamic from "next/dynamic";

// Bảng chia sẻ chứa canvas thẻ trích dẫn: nạp chậm khi mở (M5-04)
const ShareSheet = dynamic(() => import("@/components/session/detail/share-sheet").then((m) => m.ShareSheet), { ssr: false });
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/chips";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Banner, EmptyState, SkeletonRow } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { data, dataNow, useData, type Session, type SessionFilter } from "@/lib/data";
import { useDebugFlags } from "@/lib/debug/flags";
import { holdImportFile } from "@/lib/import-file";
import { dayDiff, durationParts, shortDate, weekdayDate } from "@/lib/format";
import { templateName } from "@/lib/data/localize";
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
 * Vuốt hàng sang trái để Chia sẻ / Xóa (SwipeRow); nhấn giữ hàng (chạm thật,
 * xử lý ở SwipeRow) để vào chế độ chọn nhiều. Máy tính: ô chọn hiện khi rê
 * chuột, Shift+bấm chọn liền dải, Esc thoát chế độ chọn.
 * Thanh chọn: "Đã chọn N", Chia sẻ (khi chọn 1 buổi), Xóa, Dọn bản gốc, Xong.
 * Xóa luôn có hộp xác nhận đúng số lượng và thông báo Hoàn tác.
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
  const ts = useTranslations("session");
  const locale = useLocale();
  const toast = useToast();
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const [filter, setFilter] = useState<FilterId>("all");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const recording = useRecording();
  const flags = useDebugFlags();
  const storageAlert = useStorageFull() || flags.storageFull;

  // Chọn nhiều (M4-01); hàng mốc cho Shift+bấm (M5-01)
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const anchorRef = useRef<string | null>(null);
  // Sau khi nhấn giữ ăn, lần click kế tiếp (nhả tay) phải bỏ qua để không
  // hủy chọn hàng vừa chọn — đây là lần click sinh ra từ chính cử chỉ giữ.
  const suppressToggleRef = useRef(false);
  // Esc thoát chế độ chọn (máy tính, M5-01); không chạy khi hộp thoại khác đang mở
  useEffect(() => {
    if (!selecting) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Esc" && e.key !== "Escape") return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      exitSelect();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selecting]);
  // Vuốt hàng (M4-01): chỉ một hàng mở
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null);
  // Menu ⋯ của một hàng trên máy tính
  const [menuRowId, setMenuRowId] = useState<string | null>(null);
  // Bảng chia sẻ mở từ thư viện: cần chi tiết buổi ghi
  const [shareTargetId, setShareTargetId] = useState<string | null>(null);
  // Xóa (một hoặc nhiều) và dọn bản gốc
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [purgeIds, setPurgeIds] = useState<string[] | null>(null);

  const me = useData(() => data.account.me(), []);
  const quota = useData(() => data.account.quota(), []);
  const templates = useData(() => data.account.templates(), []);
  // Không gian nhóm đang dùng: chip Của tôi/Cả nhóm và tên người ghi (M7-01)
  const workspaces = useData(() => data.workspaces.list(), []);
  const team = (workspaces.data ?? []).find((w) => w.id === me.data?.current_workspace_id && w.kind === "team");
  const members = useData(() => (team ? data.workspaces.members(team.id) : Promise.resolve([])), [team?.id]);
  const [scope, setScope] = useState<null | "mine" | "workspace">(null);
  const all = useData(() => data.sessions.list(), []);
  const list = useData(() => data.sessions.list({ ...toFilter(filter), mine: scope === "mine", shared: scope === "workspace" }), [filter, scope]);
  const shareDetail = useData(() => (shareTargetId ? data.sessions.get(shareTargetId) : Promise.resolve(null)), [shareTargetId]);

  // Chưa làm quen (M4-04): mở / chuyển tới /welcome, làm xong hoặc bỏ qua thì không hiện lại
  const redirectChecked = useRef(false);
  useEffect(() => {
    if (redirectChecked.current || !me.data) return;
    redirectChecked.current = true;
    if (!me.data.onboarded_at) router.replace("/welcome");
  }, [me.data, router]);

  const now = dataNow();
  const tplName = useMemo(
    () => Object.fromEntries((templates.data ?? []).map((tp) => [tp.id, templateName(tp, locale)])),
    [templates.data, locale],
  );
  // Tên người ghi theo user_id (M7-01): hàng buổi của người khác hiện tên
  const memberName = useMemo(() => Object.fromEntries((members.data ?? []).map((m) => [m.user_id, m.display_name])), [members.data]);

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
      const label = diff <= 0 ? t("today") : diff === 1 ? t("yesterday") : weekdayDate(s.created_at, locale);
      const g = out.find((x) => x.label === label);
      if (g) g.items.push(s);
      else out.push({ label, items: [s] });
    }
    return out;
  }, [list.data, now, t, locale]);

  const u = me.data;
  const q = quota.data;
  const quotaLeft = q ? q.minutes_limit - q.minutes_used : 0;

  function durationLabel(sec: number) {
    const { h, m } = durationParts(sec);
    return h > 0 ? t("hours", { h, m: String(m).padStart(2, "0") }) : t("minutes", { m });
  }

  const unfinishedTime = recording.startedAtClock
    ? new Intl.DateTimeFormat(locale === "en" ? "en-US" : "vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(recording.startedAtClock))
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

  /* ---------- Chọn nhiều (M4-01, máy tính Shift/Esc: M5-01) ---------- */

  function enterSelect(firstId: string, suppressNextToggle = false) {
    setSelecting(true);
    setSelectedIds([firstId]);
    setSwipeOpenId(null);
    anchorRef.current = firstId;
    // Nhấn giữ ăn: lần click kế tiếp là nhả tay của chính cử chỉ giữ, bỏ qua
    // để không hủy chọn hàng vừa chọn. Bấm ô chọn thì không cần chặn.
    suppressToggleRef.current = suppressNextToggle;
    if (suppressNextToggle) window.setTimeout(() => (suppressToggleRef.current = false), 600);
  }

  function toggleSelect(id: string, shift = false) {
    if (suppressToggleRef.current) {
      suppressToggleRef.current = false;
      return;
    }
    // Bấm ô chọn khi chưa ở chế độ chọn (máy tính rê chuột): vào chế độ chọn
    if (!selecting) {
      enterSelect(id);
      return;
    }
    // Shift+bấm: chọn liền dải từ hàng mốc tới hàng vừa bấm (máy tính, M5-01)
    if (shift && anchorRef.current) {
      const order = (list.data ?? []).map((s) => s.id);
      const a = order.indexOf(anchorRef.current);
      const b = order.indexOf(id);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelectedIds(order.slice(lo, hi + 1));
        return;
      }
    }
    anchorRef.current = id;
    setSelectedIds((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  function exitSelect() {
    setSelecting(false);
    setSelectedIds([]);
    anchorRef.current = null;
  }

  async function confirmDelete() {
    const ids = deleteIds ?? [];
    setDeleteIds(null);
    exitSelect();
    try {
      for (const id of ids) await data.sessions.remove(id);
      toast.show({
        tone: "success",
        message: t("deletedToast", { count: ids.length }),
        action: {
          label: ts("undo"),
          onClick: () => {
            void Promise.all(ids.map((id) => data.sessions.restore(id))).catch(() =>
              toast.show({ tone: "error", message: ts("saveError") }),
            );
          },
        },
      });
    } catch {
      toast.show({ tone: "error", message: ts("saveError") });
    }
  }

  async function confirmPurge() {
    const ids = purgeIds ?? [];
    setPurgeIds(null);
    exitSelect();
    try {
      const { freed_bytes } = await data.sessions.purgeRaw(ids);
      toast.show({ tone: "success", message: t("purgedToast", { count: ids.length, mb: Math.max(1, Math.round(freed_bytes / 1_000_000)) }) });
    } catch {
      toast.show({ tone: "error", message: ts("saveError") });
    }
  }

  // Buổi của menu ⋯ đang mở (để hiện mục đổi Riêng tư/Cả nhóm, M7-01)
  const menuSession = (all.data ?? []).find((s) => s.id === menuRowId) ?? null;
  const deleteTargets = (deleteIds ?? []).map((id) => (all.data ?? []).find((s) => s.id === id)).filter(Boolean) as Session[];
  const purgeTargets = (purgeIds ?? []).map((id) => (all.data ?? []).find((s) => s.id === id)).filter(Boolean) as Session[];
  const purgeMb = Math.max(1, Math.round(purgeTargets.reduce((n, s) => n + s.size_bytes, 0) / 1_000_000));

  return (
    <section
      aria-label={t("list")}
      className={cn("flex min-w-0 flex-col [&>*]:shrink-0", className)}
      // Chạm ra ngoài hàng đang vuốt thì đóng hàng đó (M4-01)
      onPointerDownCapture={(e) => {
        if (swipeOpenId && !(e.target as Element).closest("[data-swipe-open]")) setSwipeOpenId(null);
      }}
      // Máy tính kéo thả file vào thư viện để nhập (M4-02)
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        const f = e.dataTransfer.files?.[0];
        if (!f) return;
        e.preventDefault();
        holdImportFile(f);
        router.push("/import");
      }}
    >
      {selecting ? (
        <header className="flex min-h-14 items-center gap-1 px-page pt-2 lg:px-8 lg:pt-4">
          <p aria-live="polite" className="min-w-0 flex-1 truncate text-body-strong font-semibold text-ink">
            {t("selectedCount", { count: selectedIds.length })}
          </p>
          <Button
            variant="ghost"
            icon={Share2}
            iconOnly
            aria-label={t("swipeShare")}
            disabled={selectedIds.length !== 1}
            onClick={() => selectedIds.length === 1 && setShareTargetId(selectedIds[0])}
          />
          <Button
            variant="ghost"
            icon={Trash2}
            iconOnly
            aria-label={t("deleteAction")}
            disabled={!selectedIds.length}
            onClick={() => setDeleteIds(selectedIds)}
          />
          <Button
            variant="ghost"
            icon={Archive}
            iconOnly
            aria-label={t("purgeAction")}
            disabled={!selectedIds.length}
            onClick={() => setPurgeIds(selectedIds)}
          />
          <Button variant="secondary" className="h-11" onClick={exitSelect}>
            {t("doneAction")}
          </Button>
        </header>
      ) : (
        <TopBar importHref={true} />
      )}

      {/* Đổi không gian ở tiêu đề thư viện trên điện thoại (M7-01); máy tính
          có bộ chọn ở thanh bên rồi, không lặp lại */}
      {selecting ? null : <WorkspaceSwitcher className="px-page pt-2 lg:hidden" />}

      <div className="px-page pb-4">
        <h1 className="font-display text-h1 font-semibold text-ink">
          {u
            ? u.honorific
              ? t("greeting", { honorific: u.honorific === "chị" ? t("honorificChi") : t("honorificAnh"), name: u.display_name })
              : t("greetingPlain", { name: u.display_name })
            : " "}
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
                className="-my-2 inline-flex h-11 items-center px-1 font-semibold underline underline-offset-2"
              >
                {t("restore")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDiscard(true)}
                className="-my-2 inline-flex h-11 items-center px-1 font-semibold underline underline-offset-2"
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
        <Banner kind="quota">
          {/* Ngày hạn mức mới tính từ period_end như màn hình ghi, không viết cứng (PR #22, lỗi 4) */}
          {t("quotaOut", {
            limit: q.minutes_limit,
            date: shortDate(new Date(Date.parse(q.period_end) + 86400_000), locale),
          })}
        </Banner>
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
        {team
          ? [
              <FilterChip key="scope-mine" selected={scope === "mine"} onClick={() => setScope(scope === "mine" ? null : "mine")}>
                {t("scopeMine")}
              </FilterChip>,
              <FilterChip key="scope-shared" selected={scope === "workspace"} onClick={() => setScope(scope === "workspace" ? null : "workspace")}>
                {t("scopeWorkspace")}
              </FilterChip>,
            ]
          : null}
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
                const row = (
                  <SessionRow
                    key={s.id}
                    href={`/s/${s.id}`}
                    className="px-page"
                    selected={!selecting && params?.id === s.id}
                    selecting={selecting}
                    checked={selectedIds.includes(s.id)}
                    onToggleCheck={(shift) => toggleSelect(s.id, shift)}
                    checkOnLabel={t("pickRowOff")}
                    checkOffLabel={t("pickRowOn")}
                    hoverCheck={true}
                    title={s.title || t("untitled")}
                    ownerLabel={
                      team && (s.owner_user_id || s.user_id) !== me.data?.id
                        ? t("recordedBy", { name: memberName[s.owner_user_id || s.user_id] ?? "" })
                        : undefined
                    }
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
                        <Button variant="ghost" className="-my-2 min-h-11" onClick={() => retry(s.id)}>
                          {t("retry")}
                        </Button>
                      ) : undefined
                    }
                    trailing={
                      /* Ẩn trên điện thoại nhưng vẫn bấm được bằng bàn phím:
                         nhận tiêu điểm thì hiện — thao tác hàng thay cho vuốt (M5-03) */
                      <span className="opacity-0 transition-opacity has-[:focus-visible]:opacity-100 lg:opacity-100">
                        <Button
                          variant="ghost"
                          icon={Ellipsis}
                          iconOnly
                          aria-label={t("rowMenu")}
                          onClick={() => setMenuRowId(s.id)}
                        />
                      </span>
                    }
                  />
                );
                return selecting ? (
                  <div key={s.id}>{row}</div>
                ) : (
                  <SwipeRow
                    key={s.id}
                    open={swipeOpenId === s.id}
                    onOpenChange={(open) => setSwipeOpenId(open ? s.id : null)}
                    shareLabel={t("swipeShare")}
                    deleteLabel={t("swipeDelete")}
                    onShare={() => (setSwipeOpenId(null), setShareTargetId(s.id))}
                    onDelete={() => (setSwipeOpenId(null), setDeleteIds([s.id]))}
                    onLongPress={() => enterSelect(s.id, true)}
                  >
                    {row}
                  </SwipeRow>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Menu ⋯ của một hàng trên máy tính: Chia sẻ, Xóa */}
      <Sheet
        open={!!menuRowId}
        onOpenChange={(open) => !open && setMenuRowId(null)}
        title={t("rowMenu")}
        description={(all.data ?? []).find((s) => s.id === menuRowId)?.title}
        size="half"
      >
        <ul className="divide-y divide-line">
          <li>
            <button
              type="button"
              onClick={() => {
                const id = menuRowId;
                setMenuRowId(null);
                if (id) setShareTargetId(id);
              }}
              className="flex min-h-12 w-full items-center gap-3 py-2 text-left text-body text-ink"
            >
              <Share2 aria-hidden={true} className="size-5 shrink-0 text-ink-2" strokeWidth={1.75} />
              {t("swipeShare")}
            </button>
          </li>
          {menuSession && team && (menuSession.owner_user_id || menuSession.user_id) === me.data?.id ? (
            <li>
              <button
                type="button"
                onClick={() => {
                  const id = menuRowId;
                  setMenuRowId(null);
                  if (id)
                    void data.sessions
                      .setVisibility(id, menuSession.visibility === "workspace" ? "private" : "workspace")
                      .then(() => toast.show({ tone: "success", message: t("visibilityChanged") }))
                      .catch(() => toast.show({ tone: "error", message: ts("saveError") }));
                }}
                className="flex min-h-12 w-full items-center gap-3 py-2 text-left text-body text-ink"
              >
                <UsersRound aria-hidden={true} className="size-5 shrink-0 text-ink-2" strokeWidth={1.75} />
                {menuSession.visibility === "workspace" ? t("makePrivate") : t("shareWithTeam")}
              </button>
            </li>
          ) : null}
          <li>
            <button
              type="button"
              onClick={() => {
                const id = menuRowId;
                setMenuRowId(null);
                if (id) setDeleteIds([id]);
              }}
              className="flex min-h-12 w-full items-center gap-3 py-2 text-left text-body text-ink"
            >
              <Trash2 aria-hidden={true} className="size-5 shrink-0 text-tag-risk" strokeWidth={1.75} />
              <span className="text-tag-risk">{t("swipeDelete")}</span>
            </button>
          </li>
        </ul>
      </Sheet>

      {/* Bảng chia sẻ cần chi tiết buổi ghi: tải xong mới mở */}
      {shareTargetId && shareDetail.data ? (
        <ShareSheet detail={shareDetail.data} open={true} onOpenChange={(open) => !open && setShareTargetId(null)} />
      ) : null}

      {/* Xóa một hoặc nhiều buổi ghi: xác nhận ghi đúng số lượng, có Hoàn tác */}
      <ConfirmDialog
        open={!!deleteIds}
        onOpenChange={(open) => !open && setDeleteIds(null)}
        title={t("deleteTitle", { count: deleteIds?.length ?? 0 })}
        cancelLabel={ts("cancel")}
        confirmLabel={t("deleteAction")}
        onConfirm={() => void confirmDelete()}
      >
        {deleteIds?.length === 1 ? t("deleteBodyOne", { title: deleteTargets[0]?.title ?? "" }) : t("deleteBodyMany", { count: deleteIds?.length ?? 0 })}
      </ConfirmDialog>

      {/* Dọn bản gốc nhiều buổi: nói rõ thứ gì mất và thứ gì giữ (docs mục 12) */}
      <ConfirmDialog
        open={!!purgeIds}
        onOpenChange={(open) => !open && setPurgeIds(null)}
        title={t("purgeTitle", { count: purgeIds?.length ?? 0 })}
        cancelLabel={ts("cancel")}
        confirmLabel={t("purgeAction")}
        onConfirm={() => void confirmPurge()}
      >
        <span className="block">{ts("purgeBodyRemove", { mb: purgeMb })}</span>
        <span className="block">{ts("purgeBodyKeep")}</span>
        <span className="mt-2 block font-medium text-ink">{ts("purgeBodyIrreversible")}</span>
      </ConfirmDialog>

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
