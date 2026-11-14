"use client";

import { ChartColumn, Check, Hourglass, Lightbulb, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type SemanticTag = "decided" | "pending" | "risk" | "idea" | "figure";

const tagIcons: Record<SemanticTag, LucideIcon> = {
  decided: Check,
  pending: Hourglass,
  risk: TriangleAlert,
  idea: Lightbulb,
  figure: ChartColumn,
};

const tagClasses: Record<SemanticTag, string> = {
  decided: "bg-tag-decided-bg text-tag-decided",
  pending: "bg-tag-pending-bg text-tag-pending",
  risk: "bg-tag-risk-bg text-tag-risk",
  idea: "bg-tag-idea-bg text-tag-idea",
  figure: "bg-tag-figure-bg text-tag-figure",
};

/** Nhãn ngữ nghĩa. Luôn có biểu tượng và chữ, không bao giờ chỉ dựa vào màu. */
export function TagChip({
  tag,
  label,
  size = "md",
  className,
}: {
  tag: SemanticTag;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const Icon = tagIcons[tag];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-pill font-medium",
        size === "sm" ? "gap-1 px-2 py-0.5 text-caption" : "gap-1.5 px-3 py-1 text-small",
        tagClasses[tag],
        className,
      )}
    >
      <Icon aria-hidden={true} className={size === "sm" ? "size-3.5" : "size-4"} strokeWidth={2} />
      {label}
    </span>
  );
}

/** Chip lọc trong thư viện. Bấm để bật tắt. */
export function FilterChip({
  selected,
  children,
  className,
  ...rest
}: { selected: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-pill border px-3.5 text-small font-medium",
        "transition-colors ease-noteim duration-(--t-quick)",
        selected ? "border-ink bg-ink text-bg" : "border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink",
        className,
      )}
      {...rest}
    >
      {selected ? <Check aria-hidden={true} className="size-4" strokeWidth={2} /> : null}
      {children}
    </button>
  );
}

/** Chấm màu người nói và tên. Chưa đặt tên thì chữ phụ. */
export function SpeakerName({
  colorIndex,
  name,
  named = true,
  className,
}: {
  colorIndex: number;
  name: string;
  named?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2 text-small", className)}>
      <span
        aria-hidden={true}
        className="size-2.5 shrink-0 rounded-pill"
        style={{ backgroundColor: `var(--speaker-${(colorIndex % 6) + 1})` }}
      />
      <span className={cn("truncate", named ? "font-medium text-ink" : "text-ink-2")}>{name}</span>
    </span>
  );
}
