"use client";

import { LoaderCircle, type LucideIcon } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

/*
 * Nút. Năm biến thể theo docs/02-design-system.md:
 * - primary: việc chính của người dùng (sen). Mỗi màn hình tối đa một nút này.
 * - secondary: việc phụ, viền mảnh.
 * - ghost: nút chữ, cho hành động nhẹ trong danh sách.
 * - ai: mọi thứ gọi tới AI (điện).
 * - danger: xóa, dọn bản gốc.
 * Không dùng tiện ích dark:, mọi khác biệt sáng tối nằm trong token.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "ai" | "danger";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-sen text-on-sen hover:bg-sen/90",
  secondary: "border border-line bg-surface text-ink hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  ai: "border border-line bg-surface text-dien hover:bg-dien-tint",
  danger: "bg-tag-risk text-on-sen hover:bg-tag-risk/90",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: LucideIcon;
  /** Chỉ hiện biểu tượng; khi đó bắt buộc có aria-label. */
  iconOnly?: boolean;
  loading?: boolean;
  /** Kéo dài hết bề ngang */
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", icon: Icon, iconOnly, loading, block, className, children, disabled, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "relative inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-control text-small font-semibold",
        "transition-[background-color,color,scale] ease-noteim duration-(--t-quick)",
        "disabled:cursor-not-allowed",
        iconOnly ? "w-11" : variant === "ghost" ? "px-3" : "px-4",
        block && "w-full",
        disabled && !loading ? "border border-transparent bg-surface-2 text-ink-3" : variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <LoaderCircle aria-hidden={true} className="size-5 animate-spin motion-reduce:animate-none" strokeWidth={2} />
      ) : Icon ? (
        <Icon aria-hidden={true} className="size-5" strokeWidth={1.75} />
      ) : null}
      {iconOnly ? null : children}
    </button>
  );
});
