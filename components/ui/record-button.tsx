"use client";

import { Mic, Pause, Play } from "lucide-react";
import { cn } from "@/lib/cn";

/*
 * Nút ghi âm. Nơi duy nhất (cùng logo và dải giọng) được dùng dải Hừng đông.
 * - idle: chưa ghi, biểu tượng micro
 * - recording: đang ghi, vòng sen bao quanh nhịp chậm, bấm để tạm dừng
 * - paused: tạm dừng, nền nhạt đi, bấm để ghi tiếp
 * Cỡ 72 cho thanh điều hướng, 88 cho màn hình ghi âm.
 */

export type RecordState = "idle" | "recording" | "paused";

const icons = { idle: Mic, recording: Pause, paused: Play };

export function RecordButton({
  state = "idle",
  size = 72,
  label,
  className,
  ...rest
}: {
  state?: RecordState;
  size?: 72 | 88;
  /** Nhãn cho trình đọc màn hình, ví dụ "Ghi âm", "Tạm dừng", "Ghi tiếp" */
  label: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  const Icon = icons[state];
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={state === "recording"}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-pill text-on-dawn shadow-record",
        "transition-[scale,opacity] ease-noteim duration-(--t-quick)",
        size === 72 ? "size-18" : "size-22",
        state === "paused" && "opacity-70",
        className,
      )}
      style={{ background: "var(--gradient-dawn)" }}
      {...rest}
    >
      {state === "recording" ? (
        <span
          aria-hidden={true}
          className="absolute -inset-1.5 rounded-pill border-2 border-sen animate-pulse motion-reduce:animate-none"
        />
      ) : null}
      <Icon aria-hidden={true} className={size === 72 ? "size-7" : "size-9"} strokeWidth={1.75} />
    </button>
  );
}
