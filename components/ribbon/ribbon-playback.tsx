"use client";

import { useEffect, useRef, useState } from "react";
import type { SemanticTag } from "@/components/ui/chips";
import { cn } from "@/lib/cn";
import {
  BAR_STEP,
  drawBar,
  formatClock,
  prepareCanvas,
  resample,
  speakerAt,
  speakerColor,
  tokenColor,
  useThemeKey,
  type SpeakerSpan,
} from "./draw";

/*
 * Dải giọng phát lại (docs/02-design-system.md, "Dải giọng: đặc tả").
 * - Phần đã phát tô màu người nói, phần chưa phát cùng màu mờ 35%.
 * - Chạm hoặc kéo ngang để tua. Mũi tên trái phải tua 5 giây, Home và End về đầu cuối.
 * - Chấm điểm nóng phía trên, dải nhiệt 4px phía dưới theo màu nhãn chủ đề.
 * - dye (0 đến 1): phần bên phải điểm này vẽ màu trung tính. Dùng cho khoảnh khắc "Xử lý xong".
 */

export type Bookmark = { time: number; tag?: SemanticTag | null };
export type HeatSpan = { start: number; end: number; tag: SemanticTag };
/** Khoảng bị bỏ qua khi nghe sạch (M8-01): tô nhạt hơn trên dải giọng. */
export type DimRange = { start: number; end: number };

const MARK_ZONE = 10;
const HEAT_GAP = 4;
const HEAT_HEIGHT = 4;

function inRanges(ranges: DimRange[], t: number): boolean {
  for (const r of ranges) if (t >= r.start && t < r.end) return true;
  return false;
}

export function RibbonPlayback({
  peaks,
  spans,
  duration,
  currentTime,
  onSeek,
  bookmarks = [],
  heat = [],
  dim = [],
  flashMark = null,
  height = 72,
  dye = 1,
  label,
  interactive = true,
  className,
}: {
  peaks: number[];
  spans: SpeakerSpan[];
  duration: number;
  currentTime: number;
  onSeek?: (time: number) => void;
  bookmarks?: Bookmark[];
  heat?: HeatSpan[];
  /** Khoảng bị bỏ qua khi nghe sạch (M8-01): vẽ nhạt hơn hẳn */
  dim?: DimRange[];
  /** Mốc vừa nhảy qua (khoảng lặng dài hơn 5 giây): chớp một dấu nhỏ thoáng qua (M8-01) */
  flashMark?: number | null;
  height?: number;
  dye?: number;
  /** Nhãn cho trình đọc màn hình, ví dụ "Vị trí phát" */
  label: string;
  interactive?: boolean;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const dragging = useRef(false);
  const theme = useThemeKey();

  const showMarks = bookmarks.length > 0;
  const showHeat = heat.length > 0;
  const top = showMarks ? MARK_ZONE : 0;
  const total = top + height + (showHeat ? HEAT_GAP + HEAT_HEIGHT : 0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || duration <= 0) return;
    const ctx = prepareCanvas(canvas, width, total);
    if (!ctx) return;

    const count = Math.max(1, Math.floor((width + 2) / BAR_STEP));
    const bars = resample(peaks, count);
    const progressX = (currentTime / duration) * width;
    const dyeX = dye * width;
    const neutral = tokenColor(canvas, "--ink-3");
    const mid = top + height / 2;

    for (let i = 0; i < count; i++) {
      const x = i * BAR_STEP;
      const t = ((x + 1.5) / width) * duration;
      ctx.fillStyle = x + 1.5 > dyeX ? neutral : speakerColor(canvas, speakerAt(spans, t));
      const skipped = dim.length > 0 && inRanges(dim, t);
      // Nghe sạch (M8-01): khoảng bị bỏ qua vẽ nhạt hơn hẳn để thấy đường đi
      ctx.globalAlpha = skipped ? 0.14 : x + 1.5 <= progressX ? 1 : 0.35;
      drawBar(ctx, x, mid, bars[i] * height);
    }
    ctx.globalAlpha = 1;

    for (const b of bookmarks) {
      const x = Math.min(width - 3, Math.max(3, (b.time / duration) * width));
      ctx.fillStyle = tokenColor(canvas, b.tag ? `--tag-${b.tag}-text` : "--sen");
      ctx.beginPath();
      ctx.arc(x, MARK_ZONE / 2 - 1, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (showHeat) {
      const y = top + height + HEAT_GAP;
      for (const h of heat) {
        const x0 = (h.start / duration) * width;
        const x1 = (h.end / duration) * width;
        ctx.fillStyle = tokenColor(canvas, `--tag-${h.tag}-text`);
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.roundRect(x0, y, Math.max(2, x1 - x0 - 1), HEAT_HEIGHT, HEAT_HEIGHT / 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Đầu phát: vạch mảnh màu chữ chính
    if (currentTime > 0 && currentTime < duration) {
      ctx.fillStyle = tokenColor(canvas, "--ink");
      ctx.fillRect(Math.round(progressX) - 1, top + 2, 2, height - 4);
    }

    // Dấu nhỏ thoáng qua: vừa nhảy qua một khoảng lặng dài (M8-01)
    if (flashMark !== null && flashMark > 0 && flashMark < duration) {
      const fx = (flashMark / duration) * width;
      ctx.fillStyle = tokenColor(canvas, "--dien");
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.roundRect(fx - 1.5, top + 2, 3, Math.min(14, height / 3), 1.5);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }, [peaks, spans, duration, currentTime, bookmarks, heat, dim, flashMark, height, dye, width, top, total, showHeat, theme]);

  function timeFromEvent(e: React.PointerEvent) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    return ratio * duration;
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!onSeek) return;
    const step = { ArrowLeft: -5, ArrowRight: 5, ArrowDown: -5, ArrowUp: 5, PageDown: -30, PageUp: 30 } as const;
    if (e.key in step) {
      e.preventDefault();
      onSeek(Math.min(duration, Math.max(0, currentTime + step[e.key as keyof typeof step])));
    } else if (e.key === "Home") {
      e.preventDefault();
      onSeek(0);
    } else if (e.key === "End") {
      e.preventDefault();
      onSeek(duration);
    }
  }

  const sliderProps = interactive
    ? {
        role: "slider" as const,
        tabIndex: 0,
        "aria-label": label,
        "aria-valuemin": 0,
        "aria-valuemax": Math.round(duration),
        "aria-valuenow": Math.round(currentTime),
        "aria-valuetext": `${formatClock(currentTime)} / ${formatClock(duration)}`,
        onKeyDown,
        onPointerDown: (e: React.PointerEvent) => {
          if (!onSeek) return;
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          onSeek(timeFromEvent(e));
        },
        onPointerMove: (e: React.PointerEvent) => {
          if (dragging.current && onSeek) onSeek(timeFromEvent(e));
        },
        onPointerUp: () => {
          dragging.current = false;
        },
        onPointerCancel: () => {
          dragging.current = false;
        },
      }
    : { "aria-hidden": true };

  return (
    <div
      ref={wrapRef}
      className={cn("w-full rounded-control", interactive && "cursor-pointer touch-pan-y", className)}
      style={{ height: total }}
      {...sliderProps}
    >
      <canvas ref={canvasRef} className="block" style={{ width: "100%", height: total }} />
    </div>
  );
}
