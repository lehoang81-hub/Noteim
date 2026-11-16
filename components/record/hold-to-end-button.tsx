"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/*
 * Nút "Kết thúc buổi ghi": phải nhấn giữ 0,8 giây, có vòng tiến độ chạy quanh
 * nút để tránh chạm nhầm (docs/03-screens.md mục 3). Nhả sớm thì không kết thúc.
 * Bàn phím: giữ phím Enter hoặc Space đủ 0,8 giây.
 */

const HOLD_MS = 800;

export function HoldToEndButton({
  label,
  onHold,
  className,
}: {
  label: string;
  onHold: () => void;
  className?: string;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef(0);
  const armed = useRef(false);

  const begin = useCallback(() => {
    if (armed.current) return;
    armed.current = true;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      armed.current = false;
      setHolding(false);
      onHold();
    }, HOLD_MS);
  }, [onHold]);

  const cancel = useCallback(() => {
    if (!armed.current) return;
    armed.current = false;
    window.clearTimeout(timer.current);
    setHolding(false);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={begin}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") cancel();
      }}
      onBlur={cancel}
      className={cn(
        "relative inline-flex h-11 select-none items-center justify-center rounded-pill border border-line bg-surface px-5",
        "text-small font-semibold text-ink transition-[background-color,scale] ease-noteim duration-(--t-quick)",
        "[-webkit-touch-callout:none] active:bg-surface-2",
        className,
      )}
    >
      {label}
      <svg
        aria-hidden={true}
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 200 44"
        preserveAspectRatio="none"
      >
        {/* Chỉ hiện vòng sen khi đang giữ (M5-01, dọn #27): không giữ thì không
            vẽ nét — nét ẩn bằng dashoffset vẫn để lại một chấm ở góc do
            strokeLinecap tròn, nên thêm stroke=none khi chưa giữ. */}
        <rect
          x="1.5"
          y="1.5"
          width="197"
          height="41"
          rx="20.5"
          pathLength={100}
          fill="none"
          stroke={holding ? "var(--sen)" : "none"}
          strokeWidth="2.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          strokeDasharray={100}
          style={{
            transition: holding ? `stroke-dashoffset ${HOLD_MS}ms linear` : "none",
            strokeDashoffset: holding ? 0 : 100,
          }}
        />
      </svg>
    </button>
  );
}
