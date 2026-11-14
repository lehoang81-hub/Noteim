import { blend, contrastRatio } from "@/lib/contrast";

/*
 * Giá trị mã màu để hiển thị tên và mã trên /styleguide.
 * Nguồn sự thật là styles/tokens.css; file này chỉ sao chép đúng mã đó
 * để in ra màn hình. Sửa mã màu phải sửa cả hai nơi.
 */

export interface ThemeHex {
  light: string;
  dark: string;
}

export const SURFACE: ThemeHex = { light: "#FFFFFF", dark: "#171A40" };

/** Màu nền và chữ. */
export const baseColors = {
  bg: { light: "#F6F7FB", dark: "#0D0F2B" },
  surface: { light: "#FFFFFF", dark: "#171A40" },
  surface2: { light: "#ECEEF6", dark: "#20244F" },
  line: { light: "#DDE0EE", dark: "#2C3063" },
  ink: { light: "#16193B", dark: "#F2F3FB" },
  ink2: { light: "#4A4E72", dark: "#B5B8D6" },
  ink3: { light: "#666A8E", dark: "#8E92B8" },
} satisfies Record<string, ThemeHex>;

/** Màu hành động. */
export const actionColors = {
  sen: { light: "#D81F5F", dark: "#FF6B97" },
  senText: { light: "#C2185B", dark: "#FF6B97" },
  onSen: { light: "#FFFFFF", dark: "#0D0F2B" },
  dien: { light: "#5B3DF5", dark: "#A594FF" },
  dienTint: { light: "#ECE8FF", dark: "#241F5C" },
} satisfies Record<string, ThemeHex>;

export type TagId = "decided" | "pending" | "risk" | "idea" | "figure";

/** Nhãn ngữ nghĩa. Ở giao diện tối, nền nhạt là chính màu chữ với độ mờ 16%. */
export const tagColors: Record<
  TagId,
  { lightText: string; lightBg: string; darkText: string }
> = {
  decided: { lightText: "#08715C", lightBg: "#E1F5F0", darkText: "#3FD9B8" },
  pending: { lightText: "#9A6200", lightBg: "#FCF1DA", darkText: "#FFC457" },
  risk: { lightText: "#C2371F", lightBg: "#FCE7E2", darkText: "#FF8A70" },
  idea: { lightText: "#5B3DF5", lightBg: "#ECE8FF", darkText: "#A594FF" },
  figure: { lightText: "#1F62D0", lightBg: "#E3EDFD", darkText: "#7FB0FF" },
};

/** Màu người nói, gán theo thứ tự xuất hiện. */
export const speakerColors = [
  "#6B4EFF",
  "#E6336E",
  "#0FA98A",
  "#F08A24",
  "#2F7BF6",
  "#B14FD8",
] as const;

/** Ba màu đầu của dải Hừng đông. */
export const dawnStops = ["#FF8A4C", "#E6336E", "#6B4EFF"] as const;

/** Thang khoảng cách (px), bội số của 4. */
export const spacingScale = [4, 8, 12, 16, 24, 32, 48, 64] as const;

export const pageMargins = { mobile: 20, desktop: 32 } as const;

export const radii = [
  { id: "radiusControl", className: "rounded-control", px: 10 },
  { id: "radiusBlock", className: "rounded-block", px: 16 },
  { id: "radiusSheet", className: "rounded-sheet", px: 28 },
  { id: "radiusPill", className: "rounded-pill", px: 999 },
] as const;

/** Tỷ lệ tương phản của một cặp chữ và nền, ở cả hai giao diện. */
export interface RatioPair {
  light: number;
  dark: number;
}

export function pairRatio(text: ThemeHex, background: ThemeHex): RatioPair {
  return {
    light: contrastRatio(text.light, background.light),
    dark: contrastRatio(text.dark, background.dark),
  };
}

/** Nền nhạt của nhãn ở giao diện tối: màu chữ trộn 16% lên nền surface. */
export function tagDarkBg(tag: TagId): string {
  return blend(tagColors[tag].darkText, SURFACE.dark, 0.16);
}

export function tagRatio(tag: TagId): RatioPair {
  return {
    light: contrastRatio(tagColors[tag].lightText, tagColors[tag].lightBg),
    dark: contrastRatio(
      tagColors[tag].darkText,
      tagDarkBg(tag),
    ),
  };
}
