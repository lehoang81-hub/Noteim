"use client";

import { useTranslations } from "next-intl";
import { formatRatio, readHex, readMinContrast, readRaw, useTheme } from "./use-token-colors";

/*
 * Các mẩu chữ hiển thị giá trị thật của token, đọc từ CSS lúc chạy.
 * Đổi giao diện sáng tối thì tự cập nhật.
 */

const PENDING = "…";

export function Hex({ cssVar }: { cssVar: string }) {
  const theme = useTheme();
  const value = theme ? readHex(cssVar) : null;
  return <span className="tabular-nums">{value ?? PENDING}</span>;
}

export function Contrast({ fg, bgs }: { fg: string; bgs: string[] }) {
  const t = useTranslations("styleguide");
  const theme = useTheme();
  const ratio = theme ? readMinContrast(fg, bgs) : null;
  if (ratio === null) return <span>{PENDING}</span>;
  const pass = ratio >= 4.5;
  return (
    <span className={`tabular-nums ${pass ? "" : "font-semibold text-tag-risk"}`}>
      {t(pass ? "contrastPass" : "contrastFail", { ratio: formatRatio(ratio) })}
    </span>
  );
}

export function Raw({ cssVar }: { cssVar: string }) {
  const theme = useTheme();
  const value = theme ? readRaw(cssVar) : null;
  return <span className="tabular-nums">{value || PENDING}</span>;
}

/** Cỡ và dòng của một bậc chữ, ví dụ "32/40". */
export function SizeLine({ sizeVar, lineVar }: { sizeVar: string; lineVar: string }) {
  const theme = useTheme();
  if (!theme) return <span>{PENDING}</span>;
  const size = readRaw(sizeVar).replace("px", "");
  const line = readRaw(lineVar).replace("px", "");
  return (
    <span className="tabular-nums">
      {size}/{line}
    </span>
  );
}

/** Thời lượng chuyển động, luôn hiện theo mili giây, ví dụ "120ms". */
export function Duration({ cssVar }: { cssVar: string }) {
  const theme = useTheme();
  if (!theme) return <span>{PENDING}</span>;
  const raw = readRaw(cssVar);
  const value = Number.parseFloat(raw);
  const ms = raw.endsWith("ms") ? value : value * 1000;
  return <span className="tabular-nums">{Number.isFinite(ms) ? `${Math.round(ms)}ms` : PENDING}</span>;
}
