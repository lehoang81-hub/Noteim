"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

/*
 * Ba chú thích nổi của màn làm quen (M4-04, bước 3): lần lượt chỉ vào
 * một ý tóm tắt (chạm để nghe), tab Việc và nút ghi âm.
 * Dùng được bằng bàn phím: thẻ chú thích nhận tiêu điểm, Esc là bỏ qua.
 */

export type TourStepId = 1 | 2 | 3;

export function SessionTour({ onDone }: { onDone: () => void }) {
  const t = useTranslations("welcome");
  const ts = useTranslations("session");
  const shell = useTranslations("shell");
  const [step, setStep] = useState<TourStepId>(1);
  const ringRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardBottom, setCardBottom] = useState(96);

  function target(step: TourStepId): Element | null {
    if (typeof document === "undefined") return null;
    if (step === 1) return document.querySelector("[data-tour='first-bullet']");
    if (step === 2) {
      return [...document.querySelectorAll("[role=tab]")].find((b) => b.textContent === ts("tTasks")) ?? null;
    }
    return document.querySelector(`button[aria-label="${shell("record")}"]`);
  }

  // Mỗi bước: cuộn tới đích, vẽ khung sáng quanh đích, đưa tiêu điểm vào thẻ
  useEffect(() => {
    const el = target(step);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "instant" });
    const draw = () => {
      const rect = el.getBoundingClientRect();
      const ring = ringRef.current;
      if (!ring) return;
      ring.style.display = "block";
      ring.style.top = `${rect.top - 8}px`;
      ring.style.left = `${rect.left - 8}px`;
      ring.style.width = `${rect.width + 16}px`;
      ring.style.height = `${rect.height + 16}px`;
      // Thẻ chú thích đặt phía dưới đích nếu đích nằm thấp, ngược lại neo đáy màn hình
      if (rect.top > window.innerHeight * 0.55) setCardBottom(window.innerHeight - rect.bottom + rect.height + 16);
      else setCardBottom(96);
    };
    window.setTimeout(draw, 60);
    cardRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Esc: bỏ qua cả tour
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDone();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  const texts: Record<TourStepId, string> = {
    1: t("tourBullet"),
    2: t("tourTasks"),
    3: t("tourRecord"),
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-[70]">
      {/* Khung sáng quanh đích */}
      <div ref={ringRef} aria-hidden={true} className="absolute rounded-block border-2 border-sen shadow-[0_0_0_9999px_rgba(0,0,0,0.28)] transition-all duration-(--t-base) ease-noteim" style={{ display: "none" }} />
      {/* Thẻ chú thích */}
      <div
        ref={cardRef}
        role="dialog"
        aria-label={t("tourTitle", { step, total: 3 })}
        tabIndex={-1}
        className="pointer-events-auto absolute inset-x-3 rounded-block border border-line bg-surface p-4 text-ink shadow-float outline-none focus-visible:ring-2 focus-visible:ring-dien/40 lg:inset-x-auto lg:left-1/2 lg:w-[420px] lg:-translate-x-1/2"
        style={{ bottom: `calc(${cardBottom}px + env(safe-area-inset-bottom))` }}
      >
        <p className="text-caption font-semibold text-sen-text">{t("tourTitle", { step, total: 3 })}</p>
        <p className="mt-1 text-body text-ink">{texts[step]}</p>
        <div className="mt-3 flex items-center gap-2">
          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s + 1) as TourStepId)}
              className="inline-flex h-11 items-center rounded-control bg-sen px-4 text-small font-semibold text-on-sen hover:bg-sen/90"
            >
              {t("tourNext")}
            </button>
          ) : (
            <button
              type="button"
              onClick={onDone}
              className="inline-flex h-11 items-center rounded-control bg-sen px-4 text-small font-semibold text-on-sen hover:bg-sen/90"
            >
              {t("tourDone")}
            </button>
          )}
          <button
            type="button"
            onClick={onDone}
            className="inline-flex h-11 items-center rounded-control px-3 text-small font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            {t("skip")}
          </button>
        </div>
      </div>
    </div>
  );
}
