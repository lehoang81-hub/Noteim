/*
 * Tính tỷ lệ tương phản WCAG 2.1 để hiển thị trên /styleguide.
 * Chỉ phục vụ việc hiển thị thông số của token; không quyết định màu.
 */

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const int = Number.parseInt(full, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function channelLuminance(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

export function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return Math.round(ratio * 100) / 100;
}

/**
 * Trộn màu đầu vào lên màu nền với độ mờ cho trước, theo kênh sRGB
 * (cùng cách `color-mix(in srgb, ...)` hoạt động) — dùng cho nền nhạt
 * của nhãn ngữ nghĩa ở giao diện tối (16%).
 */
export function blend(foreground: string, background: string, alpha: number): string {
  const [fr, fg, fb] = hexToRgb(foreground);
  const [br, bg, bb] = hexToRgb(background);
  const mix = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha));
  return (
    "#" +
    [mix(fr, br), mix(fg, bg), mix(fb, bb)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function formatRatio(ratio: number): string {
  return ratio.toFixed(2).replace(/\.?0+$/, "");
}
