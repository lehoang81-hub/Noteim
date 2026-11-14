"use client";

import { Play, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";

/*
 * Khối nội dung do AI tạo (nền điện nhạt, biểu tượng tia sáng).
 * - writing: chữ hiện dần từng từ, có con trỏ nhấp nháy
 * - done: đủ chữ, có nút dẫn chứng bấm để nghe
 * - error: báo lỗi và nút thử lại
 * Bật giảm chuyển động thì chữ hiện đủ ngay, con trỏ đứng yên.
 */

export type AiBlockState = "writing" | "done" | "error";

function useTypewriter(text: string, active: boolean) {
  const reduce = useReducedMotionSafe();
  const words = text.split(" ");
  const [count, setCount] = useState(active ? 0 : words.length);

  useEffect(() => {
    if (!active) return;
    // Giảm chuyển động: hiện đủ chữ ngay, nhưng sau lần vẽ đầu để khớp với máy chủ.
    if (reduce) {
      const id = window.setTimeout(() => setCount(words.length), 0);
      return () => window.clearTimeout(id);
    }
    const id = window.setInterval(() => {
      setCount((c) => {
        if (c >= words.length) {
          window.clearInterval(id);
          return c;
        }
        return c + 1;
      });
    }, 70);
    return () => window.clearInterval(id);
  }, [active, reduce, words.length]);

  return active ? words.slice(0, count).join(" ") : text;
}

export function AiBlock({
  state,
  label,
  text,
  citations = [],
  citationLabel,
  onCite,
  errorText,
  retryLabel,
  onRetry,
}: {
  state: AiBlockState;
  /** "Hỏi AI" */
  label: string;
  text: string;
  /** Mốc dẫn chứng, ví dụ ["04:30", "15:12"] */
  citations?: string[];
  /** "Nghe từ" */
  citationLabel?: string;
  onCite?: (time: string) => void;
  errorText?: string;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  const shown = useTypewriter(text, state === "writing");

  return (
    <div className="rounded-block bg-dien-tint p-4" aria-busy={state === "writing" || undefined}>
      <p className="flex items-center gap-1.5 text-caption font-medium text-dien">
        <Sparkles aria-hidden={true} className="size-4" strokeWidth={1.75} />
        {label}
      </p>

      {state === "error" ? (
        <div className="mt-1.5">
          <p className="flex items-start gap-2 text-body text-ink">
            <TriangleAlert aria-hidden={true} className="mt-1 size-4 shrink-0 text-tag-risk" strokeWidth={2} />
            {errorText}
          </p>
          {onRetry && retryLabel ? (
            <Button variant="ai" className="mt-3" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <p className="mt-1.5 text-body text-ink" aria-live={state === "writing" ? "polite" : undefined}>
            {shown}
            {state === "writing" ? (
              <span
                aria-hidden={true}
                className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-dien animate-pulse motion-reduce:animate-none"
              />
            ) : null}
          </p>
          {state === "done" && citations.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {citations.map((time) => (
                <button
                  key={time}
                  type="button"
                  onClick={() => onCite?.(time)}
                  aria-label={citationLabel ? `${citationLabel} ${time}` : undefined}
                  className="inline-flex h-8 items-center gap-1 rounded-pill bg-surface px-3 text-caption font-medium tabular-nums text-dien transition-colors ease-noteim duration-(--t-quick) hover:bg-bg"
                >
                  <Play aria-hidden={true} className="size-3" strokeWidth={2.25} />
                  {time}
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
