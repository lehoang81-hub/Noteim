"use client";

import { CloudOff, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { RibbonThumb } from "@/components/ribbon/ribbon-thumb";
import { TagChip, type SemanticTag } from "@/components/ui/chips";
import { cn } from "@/lib/cn";

/*
 * Một hàng trong thư viện (docs/03-screens.md mục 1).
 * Danh sách có đường kẻ mảnh, không phải chồng thẻ.
 * M4-01: chọn nhiều, nút ⋯ cho máy tính. Vuốt sang trái và nhấn giữ để vào
 * chế độ chọn nằm ở SwipeRow (components/library/swipe-row.tsx) — khung đó
 * giữ con trỏ khi chạm nên phải do nó nhận biết nhấn giữ (M5-01).
 * M5-01: máy tính ô chọn hiện khi rê chuột; Shift+bấm chọn liền dải
 * (onToggleCheck nhận phím Shift để thư viện tính dải).
 */

export type SessionRowStatus = "ready" | "processing" | "failed" | "essence" | "unsynced";

export interface SessionRowProps {
  href: string;
  title: string;
  /** "42 phút" */
  duration: string;
  /** Tên mẫu, ví dụ "Gặp khách" */
  template: string;
  /** Nhãn người ghi đã dịch, ví dụ "Ghi bởi Trâm" — chỉ với buổi của người khác trong nhóm (M7-01) */
  ownerLabel?: string;
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
  /** Nhận phím Shift để chọn liền dải trên máy tính (M5-01) */
  onToggleCheck?: (shiftKey: boolean) => void;
  /** Nhãn ô tích cho trình đọc màn hình, theo ngôn ngữ giao diện */
  checkOnLabel?: string;
  checkOffLabel?: string;
  /** Máy tính: hiện ô chọn khi rê chuột để vào chế độ chọn nhiều (M5-01) */
  hoverCheck?: boolean;
  /** Nút ⋯ hiện khi rê chuột trên máy tính (M4-01) */
  trailing?: React.ReactNode;
  className?: string;
}

export function SessionRow({
  href,
  title,
  duration,
  template,
  ownerLabel,
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
  hoverCheck,
  trailing,
  className,
}: SessionRowProps) {
  const muted = status === "processing" || status === "essence" || status === "unsynced";

  // Ô tích dùng chung: trong chế độ chọn là phần tử duy nhất của label hàng;
  // ngoài chế độ chọn đứng cạnh liên kết mở buổi ghi (không lồng nhau).
  const checkboxInput = (
    <input
      type="checkbox"
      checked={!!checked}
      onClick={(e) => {
        // Dùng click thay vì change: change không mang phím Shift
        // (nhấn giữ Shift+bấm để chọn liền dải, M5-01).
        e.stopPropagation();
        onToggleCheck?.(e.shiftKey);
      }}
      onChange={() => {}} // React cần onChange cho ô tích có kiểm soát
      aria-label={`${checked ? checkOffLabel : checkOnLabel}: ${title}`}
      className="size-5 accent-[var(--sen)]"
    />
  );

  const checkbox = (
    <span
      className={cn(
        "relative z-[1] mt-1 shrink-0 items-start",
        // Chỉ hiện ô chọn khi đang chọn; ngoài chế độ chọn, máy tính hiện khi
        // rê chuột hoặc ô đã nhận tiêu điểm (M5-01).
        // Nên sửa review PR #41 mục 6: khi CHƯA chọn, ô tích đè lên lề trang
        // (absolute left-0, lề máy tính 32px chứa vừa ô 20px) thay vì chiếm
        // chỗ w-5 đẩy tiêu đề lệch với "Hôm nay"/"Chào chị Mai". Khi đang
        // chọn thì vẫn chiếm chỗ như thường.
        selecting
          ? "flex"
          : hoverCheck
            ? "hidden lg:absolute lg:left-0 lg:top-4 lg:mt-0 lg:flex lg:opacity-0 group-hover/row:lg:opacity-100 focus-within:lg:opacity-100"
            : "hidden",
      )}
    >
      {checkboxInput}
    </span>
  );

  // Nhãn người ghi (M7-01): chỉ hiện ở không gian nhóm với buổi của người khác
  const recordedBy = ownerLabel ? <span className="text-small text-ink-2">{ownerLabel}</span> : null;

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
              {recordedBy}
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
          {action && !selecting ? <span className="relative z-[1] ml-auto">{action}</span> : null}
        </span>
      </span>
      {trailing && !selecting ? <span className="relative z-[1] self-center">{trailing}</span> : null}
    </>
  );

  const rowClass = cn("relative border-b border-line py-3.5", selected && "bg-surface-2", className);

  if (selecting) {
    // Ô tích là phần tử tương tác DUY NHẤT của hàng, cả hàng là label của nó
    // (review PR #41 mục 4: trước đây nút aria-pressed bọc ô tích — hai phần
    // tử tương tác lồng nhau, trình đọc màn hình đọc hai lần). Nút ⋯ và
    // "Thử lại" ẩn trong chế độ chọn vì thanh chọn đã đủ thao tác; bấm vào
    // bất kỳ đâu trên hàng vẫn tích nhờ hành vi label gốc.
    return (
      <div className={rowClass}>
        <label className="flex w-full cursor-pointer items-start gap-3 text-left">
          {checkboxInput}
          {content}
        </label>
      </div>
    );
  }

  return (
    <div className={cn(rowClass, "group/row")}>
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
            {recordedBy}
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
