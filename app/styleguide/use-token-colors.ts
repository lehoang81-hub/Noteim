"use client";

import { useSyncExternalStore } from "react";
import { contrastRatio } from "@/lib/contrast";

/*
 * Đọc giá trị thật của token từ CSS lúc chạy, theo giao diện đang mở.
 * Màu được "giải" qua một phần tử thăm dò, nên cả những token viết bằng
 * color-mix() (nền nhãn ở giao diện tối) cũng ra đúng mã màu cuối cùng.
 */

type Rgba = { r: number; g: number; b: number; a: number };

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function getSnapshot(): "light" | "dark" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function getServerSnapshot(): null {
  return null;
}

/** Giao diện đang mở; null khi đang dựng trên máy chủ. */
export function useTheme() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function parseColor(value: string): Rgba | null {
  const rgb = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/);
  if (rgb) {
    return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] === undefined ? 1 : +rgb[4] };
  }
  const srgb = value.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/);
  if (srgb) {
    return {
      r: +srgb[1] * 255,
      g: +srgb[2] * 255,
      b: +srgb[3] * 255,
      a: srgb[4] === undefined ? 1 : +srgb[4],
    };
  }
  return null;
}

function toHex({ r, g, b }: Rgba): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.round(v).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function composite(top: Rgba, bottom: Rgba): Rgba {
  const mix = (t: number, b: number) => t * top.a + b * (1 - top.a);
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

let probe: HTMLSpanElement | null = null;

function resolve(cssVar: string): Rgba | null {
  if (!probe) {
    probe = document.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    probe.style.position = "absolute";
    probe.style.width = "0";
    probe.style.height = "0";
    probe.style.overflow = "hidden";
    document.body.appendChild(probe);
  }
  probe.style.backgroundColor = `var(${cssVar})`;
  return parseColor(getComputedStyle(probe).backgroundColor);
}

/** Mã màu cuối cùng của một token (đã trộn lên nền trang nếu trong suốt). */
export function readHex(cssVar: string): string | null {
  const color = resolve(cssVar);
  const bg = resolve("--bg");
  if (!color || !bg) return null;
  return toHex(color.a < 1 ? composite(color, bg) : color);
}

/** Tỷ lệ tương phản thấp nhất của màu chữ trên các nền cho trước. */
export function readMinContrast(fg: string, bgs: string[]): number | null {
  const page = resolve("--bg");
  const text = resolve(fg);
  if (!page || !text) return null;
  let min = Infinity;
  for (const name of bgs) {
    const bg = resolve(name);
    if (!bg) return null;
    const solidBg = bg.a < 1 ? composite(bg, page) : bg;
    const solidText = text.a < 1 ? composite(text, solidBg) : text;
    min = Math.min(min, contrastRatio(toHex(solidText), toHex(solidBg)));
  }
  return min;
}

/** Giá trị thô của một biến CSS, ví dụ "16px" hoặc "120ms". */
export function readRaw(cssVar: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
}

/** Định dạng tỷ lệ kiểu Việt Nam: 4,88:1 */
export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2).replace(".", ",")}:1`;
}
