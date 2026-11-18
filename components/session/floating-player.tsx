"use client";

import { AudioWaveform, ChevronDown, ChevronRight, ChevronUp, Loader2, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { RibbonPlayback, type Bookmark, type DimRange, type HeatSpan } from "@/components/ribbon/ribbon-playback";
import { formatClock, type SpeakerSpan } from "@/components/ribbon/draw";
import { cn } from "@/lib/cn";
import { Switch } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import type { ListeningMap, ListeningPrefs } from "@/lib/data/types";
import { PLAYBACK_RATES, usePlayerState, type Player, type SkipRange } from "@/lib/player/mock-player";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";

/*
 * Trình phát nổi trong chi tiết buổi ghi (docs/03-screens.md mục 5).
 * - Thu gọn: nút phát, mốc hiện tại, dải giọng nhỏ, tổng thời lượng, nút mở rộng
 * - Mở rộng: dải giọng đầy đủ có điểm nóng và dải nhiệt, lùi 10 giây,
 *   phát, tới 10 giây, tốc độ
 * - Nghe sạch (M8-01, docs/09-nghe-sach.md): nút bật chế độ (màu điện khi
 *   bật), giữ nút hoặc bấm mũi tên mở bảng 4 công tắc; thời lượng hiện cả
 *   "nghe sạch còn"; khoảng bỏ qua tô nhạt trên dải giọng; nhảy qua khoảng
 *   lặng dài hơn 5 giây chớp một dấu nhỏ thoáng qua. File gốc không bị cắt
 *   sửa — tải về và gửi đi luôn là bản gốc.
 * Vị trí (nổi trên thanh điều hướng) do khung ứng dụng quyết định ở M1;
 * component này chỉ lo phần bên trong.
 */

export type ListeningControl = {
  map: ListeningMap | null;
  prefs: ListeningPrefs | null;
  /** Thời lượng nghe sạch theo lựa chọn hiện tại */
  cleanDuration: number;
  /** Đổi lựa chọn và nhớ theo người dùng */
  onPrefs: (patch: Partial<ListeningPrefs>) => void;
};

export function FloatingPlayer({
  player,
  peaks,
  spans,
  bookmarks,
  heat,
  skips = [],
  listening,
  gainDb,
  expanded,
  onExpandedChange,
  className,
}: {
  player: Player;
  peaks: number[];
  spans: SpeakerSpan[];
  bookmarks?: Bookmark[];
  heat?: HeatSpan[];
  /** Khoảng đang bỏ qua trên dải giọng (nghe sạch bật, M8-01) */
  skips?: SkipRange[];
  /** Gain Web Audio đang áp dụng (dB, M9-01); null là đi thẳng — ghi ra thuộc tính dữ liệu cho kiểm thử */
  gainDb?: number | null;
  /** Điều khiển Nghe sạch; undefined khi buổi không phát được */
  listening?: ListeningControl;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  className?: string;
}) {
  const t = useTranslations("ui.player");
  const s = usePlayerState(player);
  const reduce = useReducedMotionSafe();

  // Bảng Nghe sạch: giữ nút hoặc bấm mũi tên cạnh nút để mở (M8-01)
  const [panelOpen, setPanelOpen] = useState(false);
  const hasMap = !!listening?.map;
  // Chế độ bật chỉ khi người dùng đã bật VÀ bản đồ nghe đã sẵn sàng — không
  // hiện "đang bật" thoáng qua khi bản đồ còn đang tải (cờ Chậm phải sạch)
  const cleanOn = !!listening?.prefs?.enabled && hasMap;

  // Nhảy qua khoảng lặng dài hơn 5 giây: chớp một dấu nhỏ thoáng qua trên
  // dải giọng (M8-01) — không dùng thông báo nổi.
  const prevTime = useRef(0);
  const [flash, setFlash] = useState<number | null>(null);
  const flashTimer = useRef(0);
  useEffect(() => {
    const prev = prevTime.current;
    prevTime.current = s.currentTime;
    if (!s.playing) return;
    if (s.currentTime - prev > 5) {
      setFlash(prev);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), 900);
    }
  }, [s.currentTime, s.playing]);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  // Giữ nút Nghe sạch 500ms để mở bảng (điện thoại); thả sớm là bật/tắt
  const holdTimer = useRef(0);
  const holdFired = useRef(false);
  function holdStart() {
    holdFired.current = false;
    holdTimer.current = window.setTimeout(() => {
      holdFired.current = true;
      setPanelOpen(true);
    }, 500);
  }
  function holdEnd() {
    window.clearTimeout(holdTimer.current);
  }

  function toggleClean() {
    // Giữ nút vừa mở bảng thì không bật/tắt luôn
    if (holdFired.current) {
      holdFired.current = false;
      return;
    }
    listening?.onPrefs({ enabled: !listening.prefs?.enabled });
  }

  const dimRanges: DimRange[] = cleanOn ? skips : [];
  const flashMark = cleanOn ? flash : null;

  const playButton = (big: boolean) => (
    <button
      type="button"
      onClick={player.toggle}
      disabled={!!s.error}
      aria-busy={!!s.waiting}
      aria-label={s.playing ? t("pause") : t("play")}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-pill bg-ink text-bg transition-[scale] ease-noteim duration-(--t-quick)",
        big ? "size-14" : "size-11",
        s.error && "cursor-not-allowed opacity-50",
      )}
    >
      {/* Đang đệm âm thanh: trạng thái chờ trên nút (M9-01) */}
      {s.waiting ? (
        <Loader2 aria-hidden={true} className={cn("animate-spin", big ? "size-6" : "size-5")} strokeWidth={2} />
      ) : s.playing ? (
        <Pause aria-hidden={true} className={big ? "size-6" : "size-5"} strokeWidth={2} />
      ) : (
        <Play aria-hidden={true} className={cn(big ? "size-6" : "size-5", "translate-x-px")} strokeWidth={2} />
      )}
    </button>
  );

  /** Nút Nghe sạch: biểu tượng sóng âm, bật thì đổi màu điện (M8-01). */
  const cleanButton = (withLabel: boolean) => (
    <button
      type="button"
      onPointerDown={holdStart}
      onPointerUp={holdEnd}
      onPointerLeave={holdEnd}
      onPointerCancel={holdEnd}
      onClick={toggleClean}
      disabled={!hasMap}
      aria-pressed={cleanOn}
      aria-label={t(cleanOn ? "cleanOn" : "cleanOff")}
      title={hasMap ? undefined : t("cleanNone")}
      className={cn(
        "flex h-11 shrink-0 items-center gap-1.5 rounded-control px-2 text-small font-semibold transition-colors ease-noteim duration-(--t-quick)",
        withLabel ? "w-auto" : "w-11 justify-center",
        !hasMap
          ? "cursor-not-allowed text-ink-3 opacity-60"
          : cleanOn
            ? "bg-dien-tint text-dien"
            : "text-ink-2 hover:bg-surface-2 hover:text-ink",
      )}
    >
      <AudioWaveform aria-hidden={true} className="size-5" strokeWidth={1.75} />
      {withLabel ? <span className="hidden lg:inline">{t("clean")}</span> : null}
    </button>
  );

  /** Mũi tên nhỏ cạnh nút: mở bảng Nghe sạch (máy tính và giữ-nút trên điện thoại). */
  const panelArrow = (
    <button
      type="button"
      onClick={() => setPanelOpen(true)}
      aria-label={t("cleanOpen")}
      aria-haspopup="dialog"
      disabled={!hasMap}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-control text-ink-3 hover:bg-surface-2 hover:text-ink",
        !hasMap && "hidden",
      )}
    >
      <ChevronRight aria-hidden={true} className="size-4" strokeWidth={1.75} />
    </button>
  );

  const rateIndex = PLAYBACK_RATES.indexOf(s.rate as (typeof PLAYBACK_RATES)[number]);
  const nextRate = PLAYBACK_RATES[(rateIndex + 1) % PLAYBACK_RATES.length];
  const rateLabel = `${String(s.rate).replace(".", ",")}x`;

  const cleanDurationText = listening ? formatClock(listening.cleanDuration) : "";

  return (
    <m.div
      layout={!reduce}
      transition={{ duration: 0.34, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn("overflow-hidden rounded-block border border-line bg-surface text-ink shadow-float", className)}
      // Trạng thái nghe sạch cho kiểm thử tự động: "on" khi bản đồ nghe đã áp dụng
      data-listening={cleanOn ? "on" : "off"}
      // Gain Web Audio đang áp dụng (M9-01): rỗng là đi thẳng, không cân âm lượng
      data-gain-db={gainDb != null ? String(gainDb) : ""}
    >
      {/* Lỗi tải âm thanh: câu lỗi và Thử lại (M9-01) */}
      {s.error === "load" ? (
        <div role="alert" className="flex items-center gap-2 bg-tag-risk-bg px-3 py-2 text-small text-tag-risk">
          <span className="min-w-0 flex-1 font-medium">{t("errorLoad")}</span>
          <button
            type="button"
            onClick={() => player.retry?.()}
            className="flex h-9 shrink-0 items-center rounded-control bg-surface px-3 font-semibold text-ink hover:bg-surface-2"
          >
            {t("retry")}
          </button>
        </div>
      ) : null}

      {!expanded ? (
        <div className="flex items-center gap-3 p-2 pr-1">
          {playButton(false)}
          <span className="w-11 shrink-0 text-caption font-medium tabular-nums text-ink">{formatClock(s.currentTime)}</span>
          <RibbonPlayback
            className="min-w-0 flex-1"
            peaks={peaks}
            spans={spans}
            duration={s.duration}
            currentTime={s.currentTime}
            onSeek={player.seek}
            dim={dimRanges}
            flashMark={flashMark}
            height={28}
            label={t("position")}
          />
          {/* Nghe sạch bật: hiện thời lượng còn sau khi bỏ khoảng lặng (M8-01) */}
          <span
            title={cleanOn ? t("cleanRemaining", { time: cleanDurationText }) : undefined}
            className="w-11 shrink-0 text-right text-caption tabular-nums text-ink-3"
          >
            {cleanOn ? <span className="font-medium text-dien">{cleanDurationText}</span> : formatClock(s.duration)}
          </span>
          <button
            type="button"
            onClick={() => onExpandedChange(true)}
            aria-label={t("expand")}
            aria-expanded={false}
            className="flex size-11 shrink-0 items-center justify-center rounded-control text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <ChevronUp aria-hidden={true} className="size-5" strokeWidth={1.75} />
          </button>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          <m.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.22 }}
            className="p-4 pt-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 text-small font-medium tabular-nums text-ink">
                {formatClock(s.currentTime)}
                <span className="text-ink-3"> / {formatClock(s.duration)}</span>
                {cleanOn ? (
                  <span className="block text-caption font-medium text-dien lg:inline lg:pl-1">
                    , {t("cleanRemaining", { time: cleanDurationText })}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => onExpandedChange(false)}
                aria-label={t("collapse")}
                aria-expanded={true}
                className="-mr-2 flex size-11 items-center justify-center rounded-control text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                <ChevronDown aria-hidden={true} className="size-5" strokeWidth={1.75} />
              </button>
            </div>
            {!hasMap ? (
              <p role="note" className="mt-1 text-caption text-ink-3">
                {t("cleanNone")}
              </p>
            ) : null}
            <RibbonPlayback
              className="mt-1"
              peaks={peaks}
              spans={spans}
              duration={s.duration}
              currentTime={s.currentTime}
              onSeek={player.seek}
              bookmarks={bookmarks}
              heat={heat}
              dim={dimRanges}
              flashMark={flashMark}
              label={t("position")}
            />
            <div className="mt-3 flex items-center justify-center gap-4">
              <div className="flex items-center">
                {cleanButton(true)}
                {panelArrow}
              </div>
              <button
                type="button"
                onClick={() => player.skip(-10)}
                aria-label={t("back10")}
                className="flex size-11 items-center justify-center rounded-control text-ink hover:bg-surface-2"
              >
                <RotateCcw aria-hidden={true} className="size-5" strokeWidth={1.75} />
              </button>
              {playButton(true)}
              <button
                type="button"
                onClick={() => player.skip(10)}
                aria-label={t("forward10")}
                className="flex size-11 items-center justify-center rounded-control text-ink hover:bg-surface-2"
              >
                <RotateCw aria-hidden={true} className="size-5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={() => player.setRate(nextRate)}
                aria-label={t("rate", { rate: rateLabel })}
                className="flex h-11 w-14 items-center justify-center rounded-control text-small font-semibold tabular-nums text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                {rateLabel}
              </button>
            </div>
          </m.div>
        </AnimatePresence>
      )}

      {/* Bảng Nghe sạch: 4 công tắc, nhớ theo người dùng (M8-01) */}
      <Sheet open={panelOpen} onOpenChange={setPanelOpen} title={t("clean")} size="auto">
        <ul className="divide-y divide-line">
          <li className="py-1">
            <Switch
              checked={!!listening?.prefs?.denoise}
              onCheckedChange={(v) => listening?.onPrefs({ denoise: v })}
              label={t("cleanDenoise")}
              description={t("cleanDenoiseHint")}
            />
          </li>
          <li className="py-1">
            <Switch
              checked={!!listening?.prefs?.level}
              onCheckedChange={(v) => listening?.onPrefs({ level: v })}
              label={t("cleanLevel")}
              description={t("cleanLevelHint")}
            />
          </li>
          <li className="py-1">
            <Switch
              checked={!!listening?.prefs?.skip_silence}
              onCheckedChange={(v) => listening?.onPrefs({ skip_silence: v })}
              label={t("cleanSkipSilence")}
              description={t("cleanSkipSilenceHint")}
            />
          </li>
          <li className="py-1">
            <Switch
              checked={!!listening?.prefs?.skip_fillers}
              onCheckedChange={(v) => listening?.onPrefs({ skip_fillers: v })}
              label={t("cleanSkipFillers")}
              description={t("cleanSkipFillersHint")}
            />
          </li>
        </ul>
        <p className="mt-3 border-t border-line pt-3 text-caption text-ink-3">{t("cleanOriginalNote")}</p>
      </Sheet>
    </m.div>
  );
}
