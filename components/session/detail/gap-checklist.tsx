"use client";

import { useState } from "react";
import { Check, ClipboardList, Copy, Sparkles, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { data, type SessionDetail } from "@/lib/data";
import { deriveMissing } from "@/lib/gap-check/missing";

/*
 * Checklist "Cần bổ sung sau buổi" (GC-04, đặc tả v1.1 §4.5):
 * - Sinh từ kết quả rà thiếu gần nhất đi kèm buổi (lưu khi kết thúc ghi).
 * - Từng mục chép được vào ghi chú nhanh một dòng hoặc gửi thành câu hỏi cho
 *   Hỏi AI trên thư mục; tick hoàn thành thì mục mờ dần và tự ẩn, tải lại
 *   trang vẫn ẩn nhờ danh sách ô đã xong lưu trong kho buổi.
 * - Buổi đủ dữ liệu (ready_to_close) hoặc chưa rà lần nào thì không hiện.
 * - Thời lượng mờ dần theo token --t-sheet; giữ chừng 0,2 giây sau khi mờ
 *   xong rồi mới gỡ khỏi danh sách để chuyển động kịp hoàn tất.
 */

const HOLD_AFTER_FADE_MS = 560;

export function GapChecklist({ detail, onAskAi }: { detail: SessionDetail; onAskAi: (question: string) => void }) {
  const t = useTranslations("session");
  const tr = useTranslations("record");
  const toast = useToast();
  const [fading, setFading] = useState<string[]>([]);
  const [copied, setCopied] = useState<string[]>([]);

  const gc = detail.gap_check;
  if (!gc || gc.ready_to_close) return null;
  const done = detail.gap_check_done ?? [];
  const items = deriveMissing(gc, gc.template_id).filter((item) => !done.includes(item.key) || fading.includes(item.key));
  if (!items.length) return null;

  function complete(key: string) {
    setFading((keys) => (keys.includes(key) ? keys : [...keys, key]));
    void data.sessions.completeGapCheckItem(detail.id, key);
    window.setTimeout(() => setFading((keys) => keys.filter((k) => k !== key)), HOLD_AFTER_FADE_MS);
  }

  function copyToNote(key: string, question: string) {
    setCopied((keys) => [...keys, key]);
    void data.sessions
      .addQuickNote(detail.id, question)
      .then(() => toast.show({ tone: "success", message: tr("copiedToNote") }))
      .catch(() => {
        setCopied((keys) => keys.filter((k) => k !== key));
        toast.show({ tone: "error", message: t("saveError") });
      });
  }

  return (
    <section aria-label={t("gapCheckTitle")} className="px-page pt-3 lg:px-8">
      <div className="rounded-block border border-line bg-surface p-4">
        <p className="flex items-center gap-2 text-body-strong font-semibold text-ink">
          <ClipboardList aria-hidden={true} className="size-5 shrink-0 text-ink-2" strokeWidth={1.75} />
          {t("gapCheckTitle")}
        </p>
        <p className="mt-1 text-caption text-ink-3">{t("gapCheckCaption")}</p>
        <div className="mt-3 flex flex-col gap-3">
          {items.map((item) => {
            const isFading = fading.includes(item.key);
            return (
              <article
                key={item.key}
                aria-hidden={isFading || undefined}
                className={`rounded-block border border-line p-4 transition-opacity ease-noteim duration-(--t-sheet) ${isFading ? "opacity-0" : "opacity-100"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-caption font-medium text-ink-3">
                    {item.sensitive ? (
                      <TriangleAlert aria-hidden={true} className="size-3.5 shrink-0 text-tag-pending" strokeWidth={2} />
                    ) : null}
                    {item.label}
                  </p>
                  <button
                    type="button"
                    onClick={() => complete(item.key)}
                    aria-label={t("gapCheckDone")}
                    disabled={isFading}
                    className="-mr-1.5 -mt-1.5 flex size-11 shrink-0 items-center justify-center rounded-control text-ink-3 transition-colors ease-noteim duration-(--t-quick) hover:bg-surface-2 hover:text-ink disabled:pointer-events-none"
                  >
                    <Check aria-hidden={true} className="size-5" strokeWidth={2} />
                  </button>
                </div>
                <p className="mt-1 text-small text-ink-2">{item.why}</p>
                <p className="mt-2 text-body font-semibold text-ink">{item.question}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Button variant="secondary" icon={Copy} onClick={() => copyToNote(item.key, item.question)} disabled={copied.includes(item.key)}>
                    {copied.includes(item.key) ? tr("copiedToNote") : tr("copyToNote")}
                  </Button>
                  <Button variant="ai" icon={Sparkles} onClick={() => onAskAi(item.question)}>
                    {tr("askAiFolder")}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
