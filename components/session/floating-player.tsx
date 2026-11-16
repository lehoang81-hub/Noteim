"use client";

import { ChevronDown, ChevronUp, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useTranslations } from "next-intl";
import { RibbonPlayback, type Bookmark, type HeatSpan } from "@/components/ribbon/ribbon-playback";
import { formatClock, type SpeakerSpan } from "@/components/ribbon/draw";
import { cn } from "@/lib/cn";
import { PLAYBACK_RATES, usePlayerState, type Player } from "@/lib/player/mock-player";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";

/*
 * Trình phát nổi trong chi tiết buổi ghi (docs/03-screens.md mục 5).
 * - Thu gọn: nút phát, mốc hiện tại, dải giọng nhỏ, tổng thời lượng, nút mở rộng
 * - Mở rộng: dải giọng đầy đủ có điểm nóng và dải nhiệt, lùi 10 giây,
 *   phát, tới 10 giây, tốc độ
 * Vị trí (nổi trên thanh điều hướng) do khung ứng dụng quyết định ở M1;
 * component này chỉ lo phần bên trong.
 */

export function FloatingPlayer({
  player,
  peaks,
  spans,
  bookmarks,
  heat,
  expanded,
  onExpandedChange,
  className,
}: {
  player: Player;
  peaks: number[];
  spans: SpeakerSpan[];
  bookmarks?: Bookmark[];
  heat?: HeatSpan[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  className?: string;
}) {
  const t = useTranslations("ui.player");
  const s = usePlayerState(player);
  const reduce = useReducedMotionSafe();

  const playButton = (big: boolean) => (
    <button
      type="button"
      onClick={player.toggle}
      aria-label={s.playing ? t("pause") : t("play")}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-pill bg-ink text-bg transition-[scale] ease-noteim duration-(--t-quick)",
        big ? "size-14" : "size-11",
      )}
    >
      {s.playing ? (
        <Pause aria-hidden={true} className={big ? "size-6" : "size-5"} strokeWidth={2} />
      ) : (
        <Play aria-hidden={true} className={cn(big ? "size-6" : "size-5", "translate-x-px")} strokeWidth={2} />
      )}
    </button>
  );

  const rateIndex = PLAYBACK_RATES.indexOf(s.rate as (typeof PLAYBACK_RATES)[number]);
  const nextRate = PLAYBACK_RATES[(rateIndex + 1) % PLAYBACK_RATES.length];
  const rateLabel = `${String(s.rate).replace(".", ",")}x`;

  return (
    <m.div
      layout={!reduce}
      transition={{ duration: 0.34, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn("overflow-hidden rounded-block border border-line bg-surface text-ink shadow-float", className)}
    >
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
            height={28}
            label={t("position")}
          />
          <span className="w-11 shrink-0 text-right text-caption tabular-nums text-ink-3">{formatClock(s.duration)}</span>
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
            <div className="flex items-center justify-between">
              <span className="text-small font-medium tabular-nums text-ink">
                {formatClock(s.currentTime)}
                <span className="text-ink-3"> / {formatClock(s.duration)}</span>
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
            <RibbonPlayback
              className="mt-1"
              peaks={peaks}
              spans={spans}
              duration={s.duration}
              currentTime={s.currentTime}
              onSeek={player.seek}
              bookmarks={bookmarks}
              heat={heat}
              label={t("position")}
            />
            <div className="mt-3 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => player.setRate(nextRate)}
                aria-label={t("rate", { rate: rateLabel })}
                className="flex h-11 w-14 items-center justify-center rounded-control text-small font-semibold tabular-nums text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                {rateLabel}
              </button>
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
              <span aria-hidden={true} className="w-14" />
            </div>
          </m.div>
        </AnimatePresence>
      )}
    </m.div>
  );
}
