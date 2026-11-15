"use client";

import { CloudOff, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { RibbonThumb } from "@/components/ribbon/ribbon-thumb";
import { TagChip, type SemanticTag } from "@/components/ui/chips";
import { cn } from "@/lib/cn";

/*
 * Một hàng trong thư viện (docs/03-screens.md mục 1).
 * Danh sách có đường kẻ mảnh, không phải chồng thẻ.
 * M4-01: chọn nhiều (nhấn giữ để vào chế độ chọn), nút ⋯ cho máy tính.
 * Vuốt hàng sang trái nằm ở SwipeRow (components/library/swipe-row.tsx).
 */

export type SessionRowStatus = "ready" | "processing" | "failed" | "essence" | "unsynced";

export interface SessionRowProps {
  href: string;
  title: string;
  /** "42 phút" */
  duration: string;
  /** Tên mẫu, ví dụ "Gặp khách" */
  template: string;
  peaks: number[];
  speakers: number[];
  status?: SessionRowStatus;
  /** Dòng trạng thái khi không ở "ready", ví dụ "Đang tóm tắt, còn khoảng 1 phút" */
  statusText?: string;
  /** Nhãn quan trọng nhất khi "ready" */
  tag?: { tag: SemanticTag; label: string };
  /** Nút hành động khi lỗi, ví dụ "Thử lại" */
  action?: React.ReactNode;
  /** Đang mở ở cột bên phải (máy tính) */
  selected?: boolean;
  /** Chế độ chọn nhiều: ô tích thay cho mở buổi ghi (M4-01) */
  selecting?: boolean;
  checked?: boolean;
  onToggleCheck?: () => void;
  /** Nhãn ô tích cho trình đọc màn hình, theo ngôn ngữ giao diện */
  checkOnLabel?: string;
  checkOffLabel?: string;
  /** Nhấn giữ để vào chế độ chọn nhiều (điện thoại) */
  onLongPress?: () => void;
  /** Nút ⋯ hiện khi rê chuột trên máy tính (M4-01) */
  trailing?: React.ReactNode;
  className?: string;
}

export function SessionRow({
  href,
  title,
  duration,
  template,
  peaks,
  speakers,
  status = "ready",
  statusText,
  tag,
  action,
  selected,
  selecting,
  checked,
  onToggleCheck,
  checkOnLabel,
  checkOffLabel,
  onLongPress,
  trailing,
  className,
}: SessionRowProps) {
  const muted = status === "processing" || status === "essence" || status === "unsynced";

  const holdRef = useRef(0);
  function holdStart() {
    if (!onLongPress || selecting) return;
    holdRef.current = window.setTimeout(() => onLongPress(), 500);
  }
  function holdEnd() {
    window.clearTimeout(holdRef.current);
  }

  const checkbox = selecting ? (
    <span className="mt-1 flex shrink-0 items-start">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={onToggleCheck}
        aria-label={`${checked ? checkOffLabel : checkOnLabel}: ${title}`}
        className="size-5 accent-[var(--sen)]"
      />
    </span>
  ) : null;

  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-body-strong font-semibold text-ink">{title}</span>
        <span className="mt-1.5 flex items-center gap-3">
          <RibbonThumb peaks={peaks} speakers={speakers} muted={muted} />
          <span className="text-small tabular-nums text-ink-3">{duration}</span>
        </span>
        <span className="mt-1.5 flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1">
          {status === "ready" ? (
            <>
              {tag ? <TagChip size="sm" tag={tag.tag} label={tag.label} /> : null}
              <span className="text-small text-ink-2">{template}</span>
            </>
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-small",
                status === "failed" ? "font-medium text-tag-risk" : "text-ink-2",
              )}
            >
              {status === "processing" ? (
                <LoaderCircle aria-hidden={true} className="size-4 animate-spin motion-reduce:animate-none" strokeWidth={2} />
              ) : status === "failed" ? (
                <TriangleAlert aria-hidden={true} className="size-4" strokeWidth={2} />
              ) : status === "unsynced" ? (
                <CloudOff aria-hidden={true} className="size-4" strokeWidth={1.75} />
              ) : null}
              {statusText}
            </span>
          )}
          {action ? <span className="relative z-[1] ml-auto">{action}</span> : null}
        </span>
      </span>
      {trailing ? <span className="relative z-[1] self-center">{trailing}</span> : null}
    </>
  );

  const rowClass = cn("relative border-b border-line py-3.5", selected && "bg-surface-2", className);

  if (selecting) {
    return (
      <div className={rowClass}>
        <button
          type="button"
          onClick={onToggleCheck}
          aria-pressed={!!checked}
          className="flex w-full items-start gap-3 text-left"
        >
          {checkbox}
          {content}
        </button>
      </div>
    );
  }

  return (
    <div className={rowClass} onPointerDown={holdStart} onPointerUp={holdEnd} onPointerCancel={holdEnd} onPointerLeave={holdEnd}>
      <div className="flex items-start gap-3">
        {checkbox}
        <Link
          href={href}
          aria-current={selected ? "page" : undefined}
          className="min-w-0 flex-1 rounded-control text-body-strong font-semibold text-ink after:absolute after:inset-0 after:content-['']"
        >
          {title}
        </Link>
        {trailing ? <span className="relative z-[1] self-center">{trailing}</span> : null}
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        <RibbonThumb peaks={peaks} speakers={speakers} muted={muted} />
        <span className="text-small tabular-nums text-ink-3">{duration}</span>
      </div>
      <div className="mt-1.5 flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1">
        {status === "ready" ? (
          <>
            {tag ? <TagChip size="sm" tag={tag.tag} label={tag.label} /> : null}
            <span className="text-small text-ink-2">{template}</span>
          </>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-small",
              status === "failed" ? "font-medium text-tag-risk" : "text-ink-2",
            )}
          >
            {status === "processing" ? (
              <LoaderCircle aria-hidden={true} className="size-4 animate-spin motion-reduce:animate-none" strokeWidth={2} />
            ) : status === "failed" ? (
              <TriangleAlert aria-hidden={true} className="size-4" strokeWidth={2} />
            ) : status === "unsynced" ? (
              <CloudOff aria-hidden={true} className="size-4" strokeWidth={1.75} />
            ) : null}
            {statusText}
          </span>
        )}
        {action ? <span className="relative z-[1] ml-auto">{action}</span> : null}
      </div>
    </div>
  );
}
