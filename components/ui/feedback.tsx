import { CloudOff, Hourglass, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/* ---------- Dải báo trạng thái ---------- */

export type BannerKind = "offline" | "quota" | "expiring";

const bannerStyle: Record<BannerKind, { icon: LucideIcon; className: string }> = {
  offline: { icon: CloudOff, className: "bg-surface-2 text-ink" },
  quota: { icon: Hourglass, className: "bg-tag-pending-bg text-tag-pending" },
  expiring: { icon: TriangleAlert, className: "bg-tag-pending-bg text-tag-pending" },
};

/** Dải báo mỏng dưới thanh tiêu đề: mất mạng, sắp hết hạn mức, bản ghi sắp bị xóa. */
export function Banner({
  kind,
  children,
  action,
  className,
}: {
  kind: BannerKind;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const { icon: Icon, className: tone } = bannerStyle[kind];
  return (
    <div role="status" className={cn("flex items-center gap-2.5 px-page py-2.5 text-small", tone, className)}>
      <Icon aria-hidden={true} className="size-4 shrink-0" strokeWidth={2} />
      <p className="min-w-0 flex-1 font-medium">{children}</p>
      {action}
    </div>
  );
}

/* ---------- Trạng thái rỗng ---------- */

/** Hình vẽ nét đơn chiếc micro, dùng cho thư viện rỗng. */
export function MicDrawing({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={true}
      className={className}
    >
      <rect x="36" y="14" width="24" height="44" rx="12" />
      <path d="M26 46c0 12 10 22 22 22s22-10 22-22" />
      <path d="M48 68v12M38 82h20" />
      <path d="M14 40c-2 4-2 10 0 14M82 40c2 4 2 10 0 14M20 36c-3 6-3 16 0 22M76 36c3 6 3 16 0 22" />
    </svg>
  );
}

/** Màn hình trống: hình vẽ, một câu, một nút. */
export function EmptyState({
  drawing,
  message,
  action,
}: {
  drawing?: React.ReactNode;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="text-ink-3">{drawing ?? <MicDrawing className="size-24" />}</div>
      <p className="mt-4 max-w-[34ch] text-body text-ink-2">{message}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* ---------- Khung chờ tải ---------- */

function Bar({ className }: { className?: string }) {
  return <span aria-hidden={true} className={cn("block rounded-pill bg-surface-2 animate-pulse motion-reduce:animate-none", className)} />;
}

/** Khung chờ cho một hàng buổi ghi. */
export function SkeletonRow() {
  return (
    <div className="border-b border-line py-3.5">
      <Bar className="h-4 w-3/4" />
      <Bar className="mt-3 h-5 w-48" />
      <Bar className="mt-3 h-3.5 w-24" />
    </div>
  );
}

/** Khung chờ cho một đoạn văn. */
export function SkeletonParagraph({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2.5 py-1">
      {Array.from({ length: lines }, (_, i) => (
        <Bar key={i} className={cn("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}
