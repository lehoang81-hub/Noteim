"use client";

import { ArrowUp, ClipboardList, Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { AiBlock } from "@/components/session/ai-block";
import { FilterChip } from "@/components/ui/chips";
import { SkeletonParagraph } from "@/components/ui/feedback";
import { formatClock } from "@/components/ribbon/draw";
import { suggestedQuestions } from "@/lib/data/localize";
import { data, useData, type ChatMessage, type SessionDetail, type Template } from "@/lib/data";
import { cn } from "@/lib/cn";

/*
 * Tab Hỏi AI (docs/03-screens.md mục 5e, issue M3-03).
 * - Câu gợi ý theo mẫu của nghề; câu trả lời chạy dần từng chữ trong AiBlock,
 *   cuối câu có nút dẫn chứng bấm để nghe.
 * - Lịch sử hỏi đáp lưu theo buổi ghi (data.chat.history) — tải lại vẫn còn.
 * - Gói Free: bộ đếm 10 câu mỗi buổi, hết thì khóa ô nhập; công tắc phạm vi
 *   "Mọi buổi ghi" là của Pro.
 * - Lỗi (cờ "Lỗi khi tải"): khối AI trạng thái lỗi kèm nút "Thử lại".
 */

type Scope = "this" | "all";

export function AiTab({
  detail,
  template,
  canPlay,
  onSeek,
  autoQuestion,
  onAutoQuestionConsumed,
  pendingQuestions = [],
}: {
  detail: SessionDetail;
  template?: Template;
  canPlay: boolean;
  onSeek: (time: number) => void;
  /** Câu hỏi gửi thẳng khi mở tab (GC-04: checklist "Cần bổ sung sau buổi"
   * bấm Hỏi AI trên thư mục): hỏi một lần rồi báo cha gỡ. */
  autoQuestion?: string | null;
  onAutoQuestionConsumed?: () => void;
  /** Câu hỏi chuyển từ sheet rà thiếu khi đang ghi (GC-04, đặc tả v1.1
   * §4.3, §4.5): hiện thành chip, bấm để gửi; đã gửi thì gỡ khỏi kho. */
  pendingQuestions?: string[];
}) {
  const t = useTranslations("ai");
  const ts = useTranslations("session");
  const locale = useLocale();
  const history = useData(() => data.chat.history(detail.id), [detail.id]);
  const quota = useData(() => data.account.quota(), []);

  const [localMessages, setLocalMessages] = useState<ChatMessage[] | null>(null);
  // Lịch sử từ lớp dữ liệu là giá trị đầu; sau câu hỏi đầu tiên, trạng thái
  // địa phương là nguồn sự thật của phiên (đỡ đụng độ lúc ask đang chạy chữ)
  const messages = localMessages ?? history.data ?? null;
  const [asking, setAsking] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<{ question: string } | null>(null);
  const [scope, setScope] = useState<Scope>("this");
  const listEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Hỏi xong một câu thì cuộn tới cuối
    listEndRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [messages?.length, streamText]);

  useEffect(() => {
    if (!autoQuestion) return;
    // Gỡ câu hỏi ở cha trước để quay lại tab không hỏi lại; lỗi có khối
    // "Thử lại" giữ câu, không mất
    onAutoQuestionConsumed?.();
    void ask(autoQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoQuestion]);

  const plan = quota.data ? (quota.data.chat_questions_per_session === null ? "pro" : "free") : null;
  const total = quota.data?.chat_questions_per_session ?? null;
  const askedCount = (messages ?? []).filter((m) => m.role === "user").length;
  const remaining = total !== null ? Math.max(0, total - askedCount) : null;
  const quotaLocked = plan === "free" && remaining !== null && remaining <= 0;
  const inputLocked = asking || quotaLocked;

  function parseClock(label: string): number {
    const parts = label.split(":").map((x) => parseInt(x, 10));
    if (parts.some((n) => Number.isNaN(n))) return 0;
    return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  }

  function citationsOf(message: ChatMessage): string[] {
    return message.citations.map((c) => formatClock(c.timestamp_sec));
  }

  function suggest(question: string) {
    void ask(question);
  }

  async function ask(question: string, opts: { skipUser?: boolean } = {}) {
    const q = question.trim();
    if (!q || asking || quotaLocked) return;
    setError(null);
    setDraft("");
    setAsking(true);
    if (!opts.skipUser) {
      // Cập nhật hàm để không dính closure cũ của messages
      setLocalMessages((prev) => [...(prev ?? messages ?? []), { id: `q-${Date.now()}`, role: "user", text: q, citations: [] }]);
    }

    // Phạm vi "Mọi buổi ghi" (Pro): trả lời cố định, không gọi lớp dữ liệu
    if (scope === "all") {
      const answer = t("allAnswer");
      const words = answer.split(" ");
      for (let i = 1; i <= words.length; i++) {
        setStreamText(words.slice(0, i).join(" "));
        await new Promise((r) => setTimeout(r, 40));
      }
      setLocalMessages((prev) => [...(prev ?? []), { id: `a-${Date.now()}`, role: "ai", text: answer, citations: [] }]);
      setStreamText("");
      setAsking(false);
      return;
    }

    try {
      const answer = await data.chat.ask(detail.id, q, (text) => setStreamText(text));
      setLocalMessages((prev) => [
        ...(prev ?? []),
        // Thử lại không thêm bong bóng câu hỏi trước khi gọi; thành công thì hiện đủ cặp
        ...(opts.skipUser ? [{ id: `q-${Date.now()}`, role: "user" as const, text: q, citations: [] }] : []),
        answer,
      ]);
      setStreamText("");
    } catch {
      setLocalMessages((prev) => (prev ?? []).filter((m, i, arr) => !(m.role === "user" && m.text === q && i === arr.length - 1)));
      setError({ question: q });
    } finally {
      setAsking(false);
      setStreamText("");
    }
  }

  return (
    <div className="flex max-w-[68ch] flex-col">
      {/* Công tắc phạm vi: "Mọi buổi ghi" là của Pro */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption font-medium text-ink-3">{t("scope")}:</span>
        <FilterChip selected={scope === "this"} onClick={() => setScope("this")}>
          {t("scopeThis")}
        </FilterChip>
        <span className="relative inline-flex">
          <FilterChip
            selected={scope === "all"}
            disabled={plan === "free"}
            onClick={() => plan === "pro" && setScope("all")}
          >
            {t("scopeAll")}
          </FilterChip>
          {plan === "free" ? (
            <Lock aria-hidden={true} className="pointer-events-none absolute -right-1.5 -top-1.5 size-4 rounded-pill bg-surface p-0.5 text-ink-3" strokeWidth={2} />
          ) : null}
        </span>
        {plan === "free" ? <span className="text-caption text-ink-3">{t("scopeLocked")}</span> : null}
      </div>

      <div className="mt-4 flex flex-col gap-4 pb-2">
        {messages === null && history.initialLoading ? (
          <div aria-busy={true}>
            <SkeletonParagraph lines={3} />
          </div>
        ) : null}

        {/* Câu gợi ý theo mẫu của nghề: luôn hiện ở đầu tab */}
        {messages && messages.length === 0 ? <p className="text-small text-ink-3">{t("emptyHistory")}</p> : null}
        <div>
          <p className="text-small font-medium text-ink-2">{t("suggest")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestedQuestions(template, locale).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => suggest(q)}
                disabled={asking || quotaLocked}
                className="inline-flex min-h-9 items-center rounded-pill border border-line bg-surface px-3 text-small text-ink transition-colors ease-noteim duration-(--t-quick) hover:bg-surface-2 disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {(messages ?? []).map((m) =>
          m.role === "user" ? (
            <p key={m.id} className="self-end rounded-block rounded-br-control bg-ink px-3.5 py-2 text-body text-bg">
              {m.text}
            </p>
          ) : (
            <AiBlock
              key={m.id}
              state="done"
              label={t("title")}
              text={m.text}
              citations={citationsOf(m)}
              citationLabel={ts("seek")}
              onCite={(time) => canPlay && onSeek(parseClock(time))}
            />
          ),
        )}

        {asking ? (
          streamText ? (
            <AiBlock state="writing" label={t("title")} text={streamText} />
          ) : (
            <AiBlock state="writing" label={t("answering")} text="" />
          )
        ) : null}

        {error ? (
          <AiBlock
            state="error"
            label={t("title")}
            text={t("errorAnswer")}
            errorText={t("errorAnswer")}
            retryLabel={t("retry")}
            onRetry={() => void ask(error.question, { skipUser: true })}
          />
        ) : null}

        <div ref={listEndRef} />
      </div>

      {/* Bộ đếm câu hỏi của gói Free */}
      {plan === "free" && remaining !== null ? (
        <p className={cn("text-caption font-medium", remaining <= 2 ? "text-tag-pending" : "text-ink-3")} role="status">
          {t("quota", { left: remaining, total: total ?? 0 })}
        </p>
      ) : null}
      {quotaLocked ? (
        <div className="mt-1 rounded-block border border-line bg-surface p-3">
          <p className="text-small text-ink-2">{t("quotaOut")}</p>
          <Link href="/upgrade" className="mt-2 inline-flex min-h-11 items-center rounded-control bg-ink px-3 text-small font-semibold text-bg">
            {t("seePro")}
          </Link>
        </div>
      ) : null}

      {/* Câu hỏi chuyển từ Gap Check (GC-04): bấm chip là gửi; gỡ khỏi kho
          ngay khi bấm để tải lại trang không còn chip cũ, lỗi hỏi thì khối
          "Thử lại" vẫn giữ câu */}
      {pendingQuestions.length ? (
        <div className="rounded-block border border-line bg-surface-2 p-3">
          <p className="text-caption font-medium text-ink-3">{t("pendingFromGapCheck")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {pendingQuestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  void data.sessions.consumePendingAiQuestion(detail.id, q).catch(() => undefined);
                  void ask(q);
                }}
                disabled={asking}
                className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-pill border border-line bg-surface px-3 text-small text-ink transition-colors ease-noteim duration-(--t-quick) hover:bg-surface-2 disabled:opacity-50"
              >
                <ClipboardList aria-hidden={true} className="size-3.5 shrink-0 text-ink-3" strokeWidth={2} />
                <span className="truncate">{q}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Ô nhập ở đáy tab; đang trả lời thì khóa */}
      <form
        className="sticky bottom-16 mt-2 flex items-end gap-2 rounded-block border border-line bg-surface p-2 shadow-float lg:bottom-4"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft);
        }}
      >
        <label htmlFor="ai-question" className="sr-only">
          {t("inputLabel")}
        </label>
        <textarea
          id="ai-question"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(draft);
            }
          }}
          disabled={inputLocked}
          rows={1}
          aria-busy={asking || undefined}
          placeholder={quotaLocked ? t("quotaOut") : t("placeholder")}
          className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-control bg-transparent px-2 py-2.5 text-body text-ink placeholder:text-ink-3 focus-visible:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={inputLocked || !draft.trim()}
          aria-label={t("send")}
          className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-sen text-on-sen transition-[scale] ease-noteim duration-(--t-quick) disabled:bg-surface-2 disabled:text-ink-3"
        >
          {asking ? <Sparkles aria-hidden={true} className="size-5 animate-pulse motion-reduce:animate-none" strokeWidth={2} /> : <ArrowUp aria-hidden={true} className="size-5" strokeWidth={2} />}
        </button>
      </form>
    </div>
  );
}
