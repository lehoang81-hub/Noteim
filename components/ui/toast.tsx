"use client";

import { Check, TriangleAlert } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";

/*
 * Thông báo nhanh, hiện ở đáy màn hình rồi tự tắt sau 4 giây
 * (6 giây nếu có nút hoàn tác).
 * Nền chàm đảo màu so với trang để nổi trên mọi nội dung.
 * Bật giảm chuyển động: hiện bằng mờ dần, không trượt.
 *
 * Dùng: const toast = useToast(); toast.show({ tone: "success", message: "Đã gửi biên bản" })
 */

export type ToastTone = "success" | "error";

export interface ToastInput {
  tone?: ToastTone;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<{ show: (t: ToastInput) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast phải nằm trong <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const reduce = useReducedMotionSafe();

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-2), { ...input, id }]);
      window.setTimeout(() => dismiss(id), input.action ? 6000 : 4000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(156px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-page lg:bottom-28"
      >
        <AnimatePresence initial={false}>
          {items.map((item) => {
            const Icon = item.tone === "error" ? TriangleAlert : Check;
            return (
              <m.div
                key={item.id}
                layout={!reduce}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-control bg-ink px-4 py-3 text-small text-bg shadow-float"
              >
                <Icon aria-hidden={true} className="size-5 shrink-0" strokeWidth={2} />
                <span className="min-w-0 flex-1">{item.message}</span>
                {item.action ? (
                  <button
                    type="button"
                    onClick={() => {
                      item.action?.onClick();
                      dismiss(item.id);
                    }}
                    className="-my-2 -mr-2 inline-flex h-11 items-center rounded-control px-2 font-semibold underline underline-offset-2"
                  >
                    {item.action.label}
                  </button>
                ) : null}
              </m.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
