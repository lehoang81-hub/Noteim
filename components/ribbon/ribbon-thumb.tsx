"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { BAR_STEP, BAR_WIDTH, drawBar, prepareCanvas, speakerColor, tokenColor, useThemeKey } from "./draw";

/*
 * Dải giọng thu nhỏ trên thẻ buổi ghi: 40 cột, cao 28, tô màu người nói.
 * Vẽ bằng canvas. Không tương tác.
 * - peaks: 40 số từ 0 đến 1
 * - speakers: 40 chỉ số người nói (0 đến 5), cùng độ dài với peaks
 * - muted: buổi ghi đang xử lý hoặc chỉ còn tóm tắt, vẽ màu trung tính, mờ 50%
 */

const HEIGHT = 28;

export function RibbonThumb({
  peaks,
  speakers,
  muted,
  className,
}: {
  peaks: number[];
  speakers: number[];
  muted?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useThemeKey();
  const width = peaks.length * BAR_STEP - (BAR_STEP - BAR_WIDTH);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    // Vẽ khi luồng chính rảnh (M5-04): thư viện có nhiều dải, vẽ ngay khi dựng
    // sẽ chen vào lúc nội dung quan trọng nhất đang hiện.
    let raf = 0;
    const idle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(() => raf = window.requestAnimationFrame(draw), { timeout: 500 })
        : window.requestAnimationFrame(draw);
    function draw() {
      const ctx = prepareCanvas(canvas!, width, HEIGHT);
      if (!ctx) return;
      const neutral = tokenColor(canvas!, "--ink-3");
      ctx.globalAlpha = muted ? 0.5 : 1;
      peaks.forEach((p, i) => {
        ctx.fillStyle = muted ? neutral : speakerColor(canvas!, speakers[i] ?? 0);
        drawBar(ctx, i * BAR_STEP, HEIGHT / 2, p * HEIGHT);
      });
    }
    return () => {
      if (typeof window.cancelIdleCallback === "function" && typeof idle === "number") window.cancelIdleCallback(idle);
      cancelAnimationFrame(raf);
    };
  }, [peaks, speakers, muted, width, theme]);

  return (
    <canvas
      ref={ref}
      aria-hidden={true}
      width={width}
      height={HEIGHT}
      className={cn("block shrink-0", className)}
      style={{ width, height: HEIGHT }}
    />
  );
}
