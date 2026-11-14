"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { AnimatePresence, motion, useDragControls, type DragControls, type PanInfo } from "motion/react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";

/*
 * Bảng trượt từ dưới lên (docs/02-design-system.md, bo góc --r-sheet hai góc trên).
 * - size "half": cao tối đa nửa màn hình; "full": gần hết màn hình
 * - Đóng bằng nút X, chạm nền mờ, phím Esc, hoặc vuốt tay nắm xuống
 * - Giữ tiêu điểm bên trong khi mở (Radix Dialog)
 * - Bật giảm chuyển động: hiện bằng mờ dần, không trượt
 * Từ 768px: rộng tối đa 560px, nằm giữa.
 */

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  size = "half",
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: "half" | "full";
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const t = useTranslations("ui");
  const reduce = useReducedMotionSafe();
  const controls = useDragControls();

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 120 || info.velocity.y > 600) onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-ink/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount {...(description ? {} : { "aria-describedby": undefined })}>
              <motion.div
                className={cn(
                  "fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[560px] flex-col rounded-t-sheet border border-b-0 border-line bg-surface text-ink shadow-float focus:outline-none",
                  size === "half" ? "max-h-[55dvh]" : "h-[calc(100dvh-24px)]",
                )}
                initial={reduce ? { opacity: 0 } : { y: "100%" }}
                animate={reduce ? { opacity: 1 } : { y: 0 }}
                exit={reduce ? { opacity: 0 } : { y: "100%" }}
                transition={{ duration: reduce ? 0.22 : 0.34, ease: [0.2, 0.8, 0.2, 1] }}
                drag={reduce ? false : "y"}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.6 }}
                dragListener={false}
                dragControls={controls}
                onDragEnd={onDragEnd}
              >
                <SheetHandle controls={reduce ? null : controls} />
                <div className="flex items-start gap-3 px-page pb-3">
                  <div className="min-w-0 flex-1">
                    <Dialog.Title className="text-h2 font-semibold text-ink">{title}</Dialog.Title>
                    {description ? (
                      <Dialog.Description className="mt-0.5 text-small text-ink-2">{description}</Dialog.Description>
                    ) : null}
                  </div>
                  <Dialog.Close
                    aria-label={t("close")}
                    className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-control text-ink-2 hover:bg-surface-2 hover:text-ink"
                  >
                    <X aria-hidden={true} className="size-5" strokeWidth={1.75} />
                  </Dialog.Close>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-page pb-4">{children}</div>
                {footer ? (
                  <div className="border-t border-line px-page pb-[max(16px,env(safe-area-inset-bottom))] pt-3">{footer}</div>
                ) : null}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/* Tay nắm: kéo xuống để đóng. Chỉ vùng này bắt đầu thao tác kéo, để phần nội dung cuộn bình thường. */
function SheetHandle({ controls }: { controls: DragControls | null }) {
  return (
    <div
      aria-hidden={true}
      onPointerDown={controls ? (e) => controls.start(e) : undefined}
      className="flex h-7 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
    >
      <span className="h-1 w-9 rounded-pill bg-line" />
    </div>
  );
}
