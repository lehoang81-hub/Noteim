"use client";

/*
 * Biểu đồ thanh ngang "Theo mẫu" (M7-02): thời lượng ghi gom theo mẫu tóm tắt.
 * Nạp chậm từ dashboard-screen (next/dynamic + IntersectionObserver) — phần
 * này nằm cuối trang, không cần JS ngay khi mở.
 * Thanh: nền đường chạy surface-2, phần đã dùng màu sen (thời lượng ghi là
 * việc người dùng làm). Không dùng canvas vì chỉ vẽ một lần khi hiện ra.
 */

export type TemplateBar = {
  template_id: string;
  name: string;
  minutes: number;
  /** Nhãn thời lượng đã định dạng, ví dụ "1 giờ 58" */
  minutesLabel: string;
};

export function TemplateChart({ rows, label }: { rows: TemplateBar[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.minutes));
  return (
    <div role="img" aria-label={label}>
      <ul className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={r.template_id} className="flex items-center gap-3">
            <span className="w-40 shrink-0 truncate text-small text-ink-2">{r.name}</span>
            <span className="h-3 min-w-0 flex-1 overflow-hidden rounded-pill bg-surface-2">
              <span
                className="block h-full rounded-pill bg-sen transition-[width] ease-noteim duration-(--t-base) motion-reduce:transition-none"
                style={{ width: `${Math.max(4, Math.round((r.minutes / max) * 100))}%` }}
              />
            </span>
            <span className="w-16 shrink-0 text-right text-caption text-ink-3">{r.minutesLabel}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
