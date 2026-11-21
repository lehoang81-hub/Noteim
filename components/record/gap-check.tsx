"use client";

import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, RotateCcw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SkeletonParagraph } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { Copy, Sparkles } from "lucide-react";
import { useDebugFlags } from "@/lib/debug/flags";
import { runGapCheck, type GapCheckInput } from "@/lib/record/gap-check-client";
import { deriveMissing, type MissingItem } from "@/lib/gap-check/missing";
import type { GapCheckResult } from "@/lib/gap-check/types";

/*
 * Gap Check ở màn ghi âm (GC-03, đặc tả v1.1 §4.1–4.3):
 * - Bottom sheet kết quả: đang rà (khung chờ, cho bỏ qua sau 3 giây), đủ dữ liệu
 *   (băng xanh), thiếu (tối đa 3 mục: vì sao thiếu, câu hỏi lái in đậm, 2 nút
 *   hành động: chép vào ghi chú nhanh, hỏi AI trên thư mục), lỗi, hết lượt miễn phí.
 * - Lỗi hoặc timeout của model tuyệt đối không hiện dữ liệu bịa (đặc tả §8).
 * - Mỗi lần mở sheet cha tăng key (lượt rà mới): trạng thái dựng sạch từ đầu,
 *   "Thử lại" chỉ đổi số lượt rà nội bộ — setState đều nằm ngoài effect thân.
 * - GC-04: kết quả rà xong đẩy lên cha qua onResult để đi kèm buổi khi lưu;
 *   "Hỏi AI trên thư mục" đưa câu hỏi vào hàng chờ qua onAskAi (không còn
 *   chỉ hiện thông báo).
 */

const SKIP_AFTER_SEC = 3;
const SLOW_DEBUG_MS = 4000;

export function GapCheckSheet({
  input,
  transcriptEmpty,
  onClose,
  onResumeLater,
  onCopyToNote,
  onAskAi,
  onResult,
  onFinishSession,
}: {
  input: GapCheckInput | null;
  /** Buổi chưa có lời thoại nhận dạng được: hiện gợi ý nói thêm trước khi rà lại */
  transcriptEmpty: boolean;
  onClose: () => void;
  /** "Rà lại sau khi nói tiếp": đóng sheet và cổng chốt, về màn ghi */
  onResumeLater: () => void;
  /** Chép câu hỏi vào ghi chú nhanh (record-screen tự thêm vào kho buổi ghi) */
  onCopyToNote: (text: string) => void;
  /** Hỏi AI trên thư mục (GC-04): câu hỏi vào hàng chờ, hiện trong Hỏi AI sau khi lưu buổi */
  onAskAi: (text: string) => void;
  /** Một lượt rà xong (GC-04): kết quả gần nhất đi kèm buổi khi lưu, để màn chi tiết dựng checklist */
  onResult: (result: GapCheckResult, templateId: string) => void;
  /** Chốt buổi ngay từ sheet (chỉ hiện khi đủ dữ liệu) */
  onFinishSession: () => void;
}) {
  const t = useTranslations("record");
  const toast = useToast();
  const flags = useDebugFlags();
  // Mở sheet là đang rà (cha remount bằng key cho mỗi lượt rà mới)
  const [phase, setPhase] = useState<"running" | "done" | "error" | "rate_limited">("running");
  const [result, setResult] = useState<GapCheckResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [copiedKeys, setCopiedKeys] = useState<string[]>([]);

  // Chạy rà: khi gắn vào màn (mới mở) và khi bấm Thử lại (attempt tăng)
  useEffect(() => {
    if (!input) return;
    const run = () => {
      if (flags.gapCheckRateLimited) return setPhase("rate_limited");
      if (flags.gapCheckError) return setPhase("error");
      void runGapCheck(input).then((outcome) => {
        if (outcome.ok) {
          setResult(outcome.result);
          setPhase("done");
          // Kết quả gần nhất đi kèm buổi khi lưu (GC-04); templateId là mẫu
          // intake của nghề (khác với mẫu ghi âm của app)
          onResult(outcome.result, input.templateId);
        } else {
          setPhase(outcome.error === "rate_limited" ? "rate_limited" : "error");
        }
      });
    };
    const id = window.setTimeout(run, flags.gapCheckSlow ? SLOW_DEBUG_MS : 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, attempt, flags.gapCheckError, flags.gapCheckRateLimited, flags.gapCheckSlow]);

  // Đồng hồ đếm thời gian chờ để hiện nút "Bỏ qua" sau 3 giây (đặc tả §4.3)
  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setInterval(() => setElapsed((s) => s + 0.25), 250);
    return () => window.clearInterval(id);
  }, [phase]);

  const missing = result && input ? deriveMissing(result, input.templateId) : [];
  const slotsLeft = result ? result.slots_status.filter((s) => !s.filled).length : 0;

  return (
    <Sheet open={true} onOpenChange={(next) => !next && onClose()} title={t("checkGapsTitle")} size="auto">
      {phase === "running" ? (
        <div className="py-2" aria-busy="true" aria-live="polite">
          <p className="text-small font-medium text-ink-2">{t("checking")}</p>
          <SkeletonParagraph lines={3} />
          {elapsed >= SKIP_AFTER_SEC ? (
            <Button variant="ghost" block onClick={onClose} className="mt-3">
              {t("skipWait")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {phase === "error" ? (
        <div className="flex flex-col items-center py-4 text-center">
          <TriangleAlert aria-hidden={true} className="size-10 text-tag-risk" strokeWidth={1.75} />
          <p className="mt-3 max-w-[36ch] text-body text-ink">{t("checkFailed")}</p>
          <div className="mt-4 flex w-full flex-col gap-2">
            <Button variant="primary" block icon={RotateCcw} onClick={() => setAttempt((n) => n + 1)}>
              {t("retryCheck")}
            </Button>
            <Button variant="ghost" block onClick={onClose}>
              {t("skipWait")}
            </Button>
          </div>
        </div>
      ) : null}

      {phase === "rate_limited" ? (
        <div className="flex flex-col items-center py-4 text-center">
          <CircleAlert aria-hidden={true} className="size-10 text-tag-pending" strokeWidth={1.75} />
          <p className="mt-3 max-w-[36ch] text-body text-ink">{t("rateLimited")}</p>
          <Button variant="ghost" block onClick={onClose} className="mt-4">
            {t("skipWait")}
          </Button>
        </div>
      ) : null}

      {phase === "done" && result && result.ready_to_close ? (
        <div className="py-1" aria-live="polite">
          <div className="flex items-start gap-2.5 rounded-block bg-tag-decided-bg p-4">
            <CircleCheck aria-hidden={true} className="mt-0.5 size-5 shrink-0 text-tag-decided" strokeWidth={2} />
            <p className="text-body font-semibold text-tag-decided">{t("readyBanner")}</p>
          </div>
          <Button variant="primary" block onClick={onFinishSession} className="mt-4">
            {t("closeSession")}
          </Button>
          <Button variant="ghost" block onClick={onResumeLater} className="mt-2">
            {t("recheckLater")}
          </Button>
        </div>
      ) : null}

      {phase === "done" && result && !result.ready_to_close ? (
        <div className="py-1" aria-live="polite">
          <p className="text-body-strong font-semibold text-ink">{t("missingCount", { count: slotsLeft })}</p>
          {transcriptEmpty ? (
            <p className="mt-2 rounded-block bg-surface-2 p-3 text-small text-ink-2">{t("noTranscript")}</p>
          ) : null}
          <div className="mt-3 flex flex-col gap-3">
            {missing.map((item) => (
              <MissingCard
                key={item.key}
                item={item}
                copied={copiedKeys.includes(item.key)}
                onCopy={() => {
                  setCopiedKeys((keys) => [...keys, item.key]);
                  onCopyToNote(item.question);
                  toast.show({ tone: "success", message: t("copiedToNote") });
                }}
                onAskAi={() => {
                  onAskAi(item.question);
                  toast.show({ tone: "success", message: t("askAiQueued") });
                }}
              />
            ))}
          </div>
          <Button variant="ghost" block onClick={onResumeLater} className="mt-4">
            {t("recheckLater")}
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}

/** Một ô còn thiếu: vì sao thiếu (1 dòng) + câu hỏi lái in đậm + 2 nút hành động
 * (đặc tả §4.3). Ô nhạy cảm thêm biểu tượng cảnh báo, không dựa vào màu. */
function MissingCard({
  item,
  copied,
  onCopy,
  onAskAi,
}: {
  item: MissingItem;
  copied: boolean;
  onCopy: () => void;
  onAskAi: () => void;
}) {
  const t = useTranslations("record");
  return (
    <article className="rounded-block border border-line p-4">
      <p className="flex items-center gap-1.5 text-caption font-medium text-ink-3">
        {item.sensitive ? (
          <TriangleAlert aria-hidden={true} className="size-3.5 shrink-0 text-tag-pending" strokeWidth={2} />
        ) : null}
        {item.label}
      </p>
      <p className="mt-1.5 text-small text-ink-2">{item.why}</p>
      <p className="mt-2 text-body font-semibold text-ink">{item.question}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Button variant="secondary" icon={Copy} onClick={onCopy} disabled={copied}>
          {copied ? t("copiedToNote") : t("copyToNote")}
        </Button>
        <Button variant="ai" icon={Sparkles} onClick={onAskAi}>
          {t("askAiFolder")}
        </Button>
      </div>
    </article>
  );
}
