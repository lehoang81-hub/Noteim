"use client";

import { cn } from "@/lib/cn";

/*
 * Một ý tóm tắt (docs/03-screens.md mục 5a).
 * Chạm vào ý thì phát từ mốc đó. Ý đang phát có vạch sen bên trái.
 */
export function SummaryBullet({
  text,
  time,
  speakerColorIndex,
  playing,
  editedLabel,
  seekLabel,
  onSeek,
  children,
}: {
  text: string;
  /** "04:30" */
  time: string;
  speakerColorIndex: number;
  playing?: boolean;
  /** Có giá trị thì hiện dấu "đã sửa" */
  editedLabel?: string;
  /** Nhãn cho trình đọc màn hình, ví dụ "Nghe từ 04:30" */
  seekLabel: string;
  onSeek?: () => void;
  /** Ghi chú tay của người dùng gắn vào ý này */
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "border-l-2 pl-3 transition-colors ease-noteim duration-(--t-base)",
        playing ? "border-sen" : "border-transparent",
      )}
    >
      <button
        type="button"
        onClick={onSeek}
        aria-label={`${seekLabel}: ${text}`}
        aria-current={playing ? "true" : undefined}
        className="group flex w-full items-start gap-3 rounded-control py-1.5 text-left"
      >
        <span
          aria-hidden={true}
          className="mt-2 size-2 shrink-0 rounded-pill"
          style={{ backgroundColor: `var(--speaker-${(speakerColorIndex % 6) + 1})` }}
        />
        <span className="min-w-0 flex-1 text-body text-ink">
          {text}
          {editedLabel ? (
            <span className="ml-2 inline-flex items-center gap-1 align-middle text-caption font-medium text-ink-3">
              <span aria-hidden={true} className="size-1.5 rounded-pill bg-ink-3" />
              {editedLabel}
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "pt-0.5 text-caption font-medium tabular-nums group-hover:underline",
            playing ? "text-sen-text" : "text-ink-3",
          )}
        >
          {time}
        </span>
      </button>
      {children ? <div className="mb-1.5 ml-5">{children}</div> : null}
    </div>
  );
}

/** Ghi chú tay của người dùng, viền mảnh để phân biệt với nội dung AI viết. */
export function UserNote({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-control border border-line px-3 py-2">
      <p className="text-caption font-medium text-ink-3">{label}</p>
      <p className="text-small text-ink">{children}</p>
    </div>
  );
}
