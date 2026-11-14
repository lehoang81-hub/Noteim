/*
 * Danh sách token hiển thị trên /styleguide.
 * File này KHÔNG chứa mã màu. Mã màu và tỷ lệ tương phản được đọc từ
 * styles/tokens.css lúc chạy (xem use-token-colors.ts), nên đổi màu chỉ cần
 * sửa một nơi.
 */

export type ColorRow = {
  /** Khóa trong messages: styleguide.tokens.<key>.name / .usage */
  key: string;
  /** Biến CSS hiển thị và dùng làm ô màu */
  cssVar: string;
  /** Cách vẽ ô mẫu: "fill" là ô màu đặc, "text" là chữ Aa trên nền trang */
  swatch: "fill" | "text" | "onFill";
  /** Cặp để tính tương phản: [màu chữ, ...các nền]. Lấy giá trị thấp nhất. */
  contrast?: { fg: string; bgs: string[] };
};

export const baseColors: ColorRow[] = [
  { key: "bg", cssVar: "--bg", swatch: "fill" },
  { key: "surface", cssVar: "--surface", swatch: "fill" },
  { key: "surface2", cssVar: "--surface-2", swatch: "fill", contrast: { fg: "--ink", bgs: ["--surface-2"] } },
  { key: "line", cssVar: "--line", swatch: "fill" },
  { key: "ink", cssVar: "--ink", swatch: "text", contrast: { fg: "--ink", bgs: ["--bg", "--surface"] } },
  { key: "ink2", cssVar: "--ink-2", swatch: "text", contrast: { fg: "--ink-2", bgs: ["--bg", "--surface", "--surface-2"] } },
  { key: "ink3", cssVar: "--ink-3", swatch: "text", contrast: { fg: "--ink-3", bgs: ["--bg", "--surface", "--surface-2"] } },
];

export const actionColors: ColorRow[] = [
  { key: "sen", cssVar: "--sen", swatch: "onFill", contrast: { fg: "--on-sen", bgs: ["--sen"] } },
  { key: "senText", cssVar: "--sen-text", swatch: "text", contrast: { fg: "--sen-text", bgs: ["--bg", "--surface"] } },
  { key: "dien", cssVar: "--dien", swatch: "text", contrast: { fg: "--dien", bgs: ["--bg", "--surface", "--dien-tint"] } },
  { key: "dienTint", cssVar: "--dien-tint", swatch: "fill" },
];

export const tagIds = ["decided", "pending", "risk", "idea", "figure"] as const;
export type TagId = (typeof tagIds)[number];

export const speakerVars = [
  "--speaker-1",
  "--speaker-2",
  "--speaker-3",
  "--speaker-4",
  "--speaker-5",
  "--speaker-6",
] as const;

export const dawnVars = ["--dawn-orange", "--dawn-pink", "--dawn-violet"] as const;

/** Mục lục trang, theo thứ tự xuất hiện. */
export const sections = [
  "preview",
  "colors",
  "tags",
  "speakers",
  "type",
  "shape",
  "motion",
] as const;
export type SectionId = (typeof sections)[number];

/** Thang chữ. Cỡ và dòng hiển thị được đọc từ token lúc chạy. */
export const typeScale = [
  { key: "display", className: "text-display font-bold", sizeVar: "--text-display-size", lineVar: "--text-display-line", compareFonts: true },
  { key: "h1", className: "text-h1 font-semibold", sizeVar: "--text-h1-size", lineVar: "--text-h1-line", compareFonts: true },
  { key: "h2", className: "text-h2 font-semibold", sizeVar: "--text-h2-size", lineVar: "--text-h2-line", compareFonts: false },
  { key: "body", className: "text-body font-normal", sizeVar: "--text-body-size", lineVar: "--text-body-line", compareFonts: false },
  { key: "bodyStrong", className: "text-body-strong font-semibold", sizeVar: "--text-body-strong-size", lineVar: "--text-body-strong-line", compareFonts: false },
  { key: "small", className: "text-small font-normal", sizeVar: "--text-small-size", lineVar: "--text-small-line", compareFonts: false },
  { key: "caption", className: "text-caption font-medium", sizeVar: "--text-caption-size", lineVar: "--text-caption-line", compareFonts: false },
] as const;

export const spacingVars = [
  "--space-1",
  "--space-2",
  "--space-3",
  "--space-4",
  "--space-6",
  "--space-8",
  "--space-12",
  "--space-16",
] as const;

export const radii = [
  { key: "control", className: "rounded-control", cssVar: "--r-control" },
  { key: "block", className: "rounded-block", cssVar: "--r-block" },
  { key: "sheet", className: "rounded-t-sheet", cssVar: "--r-sheet" },
  { key: "pill", className: "rounded-pill", cssVar: "--r-pill" },
] as const;

export const motionVars = [
  { key: "quick", cssVar: "--t-quick" },
  { key: "base", cssVar: "--t-base" },
  { key: "sheet", cssVar: "--t-sheet" },
  { key: "scene", cssVar: "--t-scene" },
] as const;
