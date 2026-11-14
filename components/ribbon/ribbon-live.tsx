"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { BAR_STEP, drawBar, prepareCanvas, tokenColor, useThemeKey } from "./draw";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";

/*
 * Dải giọng sống khi đang ghi (docs/02-design-system.md, "Dải giọng: đặc tả").
 * - Cột mới xuất hiện ở mép phải, trôi sang trái. Cột màu --on-dawn.
 * - Quầng sáng Hừng đông phía sau, độ sáng theo âm lượng.
 * - Nhận âm lượng qua prop level (0 đến 1). Không tự mở micro.
 * - Chạy bằng requestAnimationFrame, dừng khi tab bị ẩn, khi cuộn ra khỏi màn hình,
 *   hoặc khi paused.
 * - Giảm chuyển động: các cột đứng yên, cập nhật mỗi giây.
 * Nên đặt trên nền chàm đêm (vùng có class .dark).
 */

const PUSH_EVERY_MS = 90;

export function RibbonLive({
  level,
  paused,
  height = 160,
  className,
}: {
  level: number;
  paused?: boolean;
  height?: number;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const levelRef = useRef(level);
  const pausedRef = useRef(!!paused);
  const reduce = useReducedMotionSafe();
  const theme = useThemeKey();

  useEffect(() => {
    levelRef.current = level;
  }, [level]);
  useEffect(() => {
    pausedRef.current = !!paused;
  }, [paused]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    let width = Math.floor(wrap.clientWidth);
    let bars: number[] = [];
    let lastPush = performance.now();
    let raf = 0;
    let timer = 0;
    let smoothed = 0;
    let visible = true;
    // Đọc màu một lần mỗi khi đổi giao diện, không đọc trong từng khung hình
    const barColor = tokenColor(canvas, "--on-dawn");

    const ro = new ResizeObserver(() => {
      width = Math.floor(wrap.clientWidth);
    });
    ro.observe(wrap);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(wrap);

    function nextBar() {
      const l = levelRef.current;
      const jitter = 0.55 + Math.random() * 0.45;
      return Math.max(0.04, Math.min(1, l * jitter));
    }

    function draw(offset: number) {
      const ctx = prepareCanvas(canvas!, width, height);
      if (!ctx) return;
      ctx.fillStyle = barColor;
      const mid = height / 2;
      for (let k = 0; k < bars.length; k++) {
        const x = width - offset - k * BAR_STEP;
        if (x < -BAR_STEP) break;
        ctx.globalAlpha = pausedRef.current ? 0.45 : 1;
        drawBar(ctx, x, mid, bars[k] * (height - 8));
      }
      // Quầng sáng: chỉ đổi khi chênh đáng kể, để trình duyệt không phải vẽ lại vùng mờ mỗi khung hình
      if (glowRef.current) {
        const target = pausedRef.current ? 0.15 : 0.2 + levelRef.current * 0.7;
        if (Math.abs(target - smoothed) > 0.08) {
          smoothed = target;
          glowRef.current.style.opacity = target.toFixed(2);
        }
      }
    }

    function capacity() {
      return Math.ceil(width / BAR_STEP) + 2;
    }

    if (reduce) {
      bars = Array.from({ length: capacity() }, () => 0.04);
      draw(BAR_STEP);
      timer = window.setInterval(() => {
        if (document.hidden || !visible) return;
        if (!pausedRef.current) bars = [nextBar(), ...bars].slice(0, capacity());
        draw(BAR_STEP);
      }, 1000);
    } else {
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        if (document.hidden || !visible) return;
        if (!pausedRef.current && now - lastPush >= PUSH_EVERY_MS) {
          bars = [nextBar(), ...bars].slice(0, capacity());
          lastPush = now;
        }
        const offset = pausedRef.current ? BAR_STEP : Math.min(1, (now - lastPush) / PUSH_EVERY_MS) * BAR_STEP;
        draw(offset);
      };
      raf = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(timer);
      ro.disconnect();
      io.disconnect();
    };
  }, [height, reduce, theme]);

  return (
    <div ref={wrapRef} aria-hidden={true} className={cn("relative w-full", className)} style={{ height }}>
      <div
        ref={glowRef}
        className="pointer-events-none absolute inset-x-[8%] inset-y-[18%] rounded-pill blur-2xl"
        style={{
          background: "var(--gradient-dawn)",
          opacity: 0.2,
          willChange: "opacity",
          transition: "opacity var(--t-sheet) var(--ease)",
        }}
      />
      <canvas ref={canvasRef} className="relative block" style={{ width: "100%", height }} />
    </div>
  );
}
