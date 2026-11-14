import { cn } from "@/lib/cn";

/*
 * Dải giọng thu nhỏ trên thẻ buổi ghi: 40 cột, cao 28, tô màu người nói.
 * Bản tĩnh bằng DOM. M0-04 sẽ thay bằng bản canvas theo đặc tả "Dải giọng".
 * - peaks: 40 số từ 0 đến 1
 * - speakers: 40 chỉ số người nói (0 đến 5), cùng độ dài với peaks
 * - muted: buổi ghi đang xử lý hoặc chỉ còn tóm tắt, vẽ màu trung tính
 */
export function RibbonThumb({
  peaks,
  speakers,
  muted,
  className,
}: {
  peaks: number[];
  speakers: number[];
  muted?: boolean;
  className?: string;
}) {
  return (
    <span aria-hidden={true} className={cn("flex h-7 items-center gap-0.5", muted && "opacity-50", className)}>
      {peaks.map((h, i) => (
        <span
          key={i}
          className="w-[3px] shrink-0 rounded-pill"
          style={{
            height: `${Math.max(3, Math.round(h * 28))}px`,
            backgroundColor: muted ? "var(--ink-3)" : `var(--speaker-${((speakers[i] ?? 0) % 6) + 1})`,
          }}
        />
      ))}
    </span>
  );
}
