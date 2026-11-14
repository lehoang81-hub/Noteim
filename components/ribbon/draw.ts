"use client";

import { useSyncExternalStore } from "react";

/*
 * Công cụ chung cho dải giọng vẽ bằng canvas.
 * Hình dạng theo docs/02-design-system.md: cột bo tròn hai đầu, rộng 3, cách 2,
 * đối xứng qua trục giữa.
 */

export const BAR_WIDTH = 3;
export const BAR_GAP = 2;
export const BAR_STEP = BAR_WIDTH + BAR_GAP;

export type SpeakerSpan = { speaker: number; start: number; end: number };

/** Đổi giá trị mỗi khi trang đổi giao diện, để canvas biết lúc vẽ lại. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const getSnapshot = () => document.documentElement.className;
const getServerSnapshot = () => "";

export function useThemeKey() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Đọc màu token tại đúng phần tử (không phải :root), để vùng bị ép
 * .light/.dark vẫn ra đúng màu.
 */
export function tokenColor(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || "currentColor";
}

export function speakerColor(el: Element, speaker: number): string {
  return tokenColor(el, `--speaker-${(((speaker % 6) + 6) % 6) + 1}`);
}

/** Chuẩn bị canvas sắc nét trên màn hình mật độ cao. Trả về context đã scale. */
export function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = Math.round(width * dpr);
  const h = Math.round(height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

/** Vẽ một cột bo tròn, đối xứng quanh trục giữa `mid`. */
export function drawBar(ctx: CanvasRenderingContext2D, x: number, mid: number, h: number) {
  const height = Math.max(BAR_WIDTH, h);
  ctx.beginPath();
  ctx.roundRect(x, mid - height / 2, BAR_WIDTH, height, BAR_WIDTH / 2);
  ctx.fill();
}

/** Gom mảng peaks về đúng số cột, lấy giá trị lớn nhất mỗi đoạn. */
export function resample(peaks: number[], count: number): number[] {
  if (count <= 0 || peaks.length === 0) return [];
  const out = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    const from = Math.floor((i * peaks.length) / count);
    const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / count));
    let max = 0;
    for (let j = from; j < to; j++) max = Math.max(max, peaks[j] ?? 0);
    out[i] = max;
  }
  return out;
}

/** Người nói tại thời điểm t. */
export function speakerAt(spans: SpeakerSpan[], t: number): number {
  for (const s of spans) if (t >= s.start && t < s.end) return s.speaker;
  return spans.length ? spans[spans.length - 1].speaker : 0;
}

/** "04:30" hoặc "1:08:05" */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${String(r).padStart(2, "0")}` : `${mm}:${String(r).padStart(2, "0")}`;
}
