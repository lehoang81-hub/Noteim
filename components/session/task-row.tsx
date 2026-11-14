"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/*
 * Một việc cần làm (docs/03-screens.md mục 5b).
 * Chạm ô tròn để đánh dấu xong. Việc chưa có người phụ trách hiện màu hổ phách.
 */
export function TaskRow({
  task,
  done,
  onToggle,
  toggleLabel,
  assignee,
  unassignedLabel,
  due,
  overdue,
  priority,
  quote,
  time,
  seekLabel,
  onSeek,
}: {
  task: string;
  done: boolean;
  onToggle?: () => void;
  /** "Đánh dấu xong" */
  toggleLabel: string;
  /** Tên người phụ trách; bỏ trống là chưa giao */
  assignee?: string;
  /** "Chưa giao" */
  unassignedLabel: string;
  /** "hạn 13/11" hoặc "xong 12/11" */
  due?: string;
  overdue?: boolean;
  /** "Cao" */
  priority?: string;
  quote?: string;
  time?: string;
  seekLabel?: string;
  onSeek?: () => void;
}) {
  return (
    <div className="flex gap-3 border-b border-line py-3.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`${toggleLabel}: ${task}`}
        onClick={onToggle}
        className="-m-2.5 flex size-11 shrink-0 items-center justify-center rounded-pill"
      >
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-pill border-2 transition-colors ease-noteim duration-(--t-quick)",
            done ? "border-tag-decided bg-tag-decided text-surface" : overdue ? "border-tag-risk" : "border-ink-3",
          )}
        >
          {done ? <Check aria-hidden={true} className="size-4" strokeWidth={2.5} /> : null}
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <p className={cn("text-body", done ? "text-ink-3 line-through" : "text-ink")}>{task}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-small">
          {assignee ? (
            <span className="text-ink-2">{assignee}</span>
          ) : (
            <span className="font-medium text-tag-pending">{unassignedLabel}</span>
          )}
          {due ? <span className={overdue && !done ? "font-medium text-tag-risk" : "text-ink-2"}>{due}</span> : null}
          {priority ? <span className="text-ink-2">{priority}</span> : null}
          {time ? (
            <button
              type="button"
              onClick={onSeek}
              aria-label={seekLabel ? `${seekLabel} ${time}` : undefined}
              className="ml-auto inline-flex min-h-6 items-center rounded-control text-caption font-medium tabular-nums text-ink-3 hover:underline"
            >
              {time}
            </button>
          ) : null}
        </p>
        {quote ? (
          <blockquote className="mt-1.5 border-l-2 border-line pl-2.5 text-small text-ink-2">{quote}</blockquote>
        ) : null}
      </div>
    </div>
  );
}
