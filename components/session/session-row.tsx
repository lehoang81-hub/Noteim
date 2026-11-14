"use client";

import { CloudOff, LoaderCircle, TriangleAlert } from "lucide-react";
import { RibbonThumb } from "@/components/ribbon/ribbon-thumb";
import { TagChip, type SemanticTag } from "@/components/ui/chips";
import { cn } from "@/lib/cn";

/*
 * Một hàng trong thư viện (docs/03-screens.md mục 1).
 * Danh sách có đường kẻ mảnh, không phải chồng thẻ.
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
  className,
}: SessionRowProps) {
  const muted = status === "processing" || status === "essence" || status === "unsynced";

  return (
    <div className={cn("relative border-b border-line py-3.5", className)}>
      <a
        href={href}
        className="block rounded-control text-body-strong font-semibold text-ink after:absolute after:inset-0 after:content-['']"
      >
        {title}
      </a>
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
