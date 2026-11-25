"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Circle, LoaderCircle, Plus, UploadCloud, UserRoundPlus } from "lucide-react";
import { animate } from "motion/react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { RibbonPlayback } from "@/components/ribbon/ribbon-playback";
import { SpeakerName } from "@/components/ui/chips";
import { EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { data, useData } from "@/lib/data";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import { useAudioUpload } from "@/lib/audio/upload-store";
import { retryPendingUploads } from "@/lib/audio/upload-manager";

/*
 * Màn hình đang xử lý /s/[id]/processing (docs/03-screens.md mục 4; issue M2-03).
 * - Dải giọng đang một màu trung tính, xong thì được nhuộm dần theo màu người
 *   nói (khoảnh khắc "Xử lý xong") rồi tự chuyển tới chi tiết buổi ghi.
 * - Năm bước chạy lần lượt nhờ data.sessions.subscribeProcessing.
 * - "Trong lúc chờ" lấy tiêu đề và người tham gia; rời màn hình vẫn xử lý tiếp,
 *   thư viện tự cập nhật, xong hiện thông báo nhanh (xem ProcessingWatcher).
 */

const EASE = [0.2, 0.8, 0.2, 1] as const;

const STEP_LABELS = ["step1", "step2", "step3", "step4", "step5"] as const;

export function ProcessingScreen() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("processing");
  const ts = useTranslations("session");
  const router = useRouter();
  const toast = useToast();
  const reduce = useReducedMotionSafe();
  const detail = useData(() => data.sessions.get(id), [id]);
  const contacts = useData(() => data.account.contacts(), []);

  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [dye, setDye] = useState(0);
  const [asrFail, setAsrFail] = useState<string | null>(null);
  const [pollEpoch, setPollEpoch] = useState(0);
  const [title, setTitle] = useState<string | null>(null);
  const [participants, setParticipants] = useState<string[] | null>(null);
  const [addSheet, setAddSheet] = useState(false);
  const navigateTimer = useRef(0);
  const animRef = useRef<{ stop: () => void } | null>(null);
  const navigated = useRef(false);

  /* Nghe bước xử lý; đã ready từ trước thì vào thẳng khoảnh khắc xong.
   * Luồng thật (C1-05): failed thì hiện banner lỗi + nút Thử lại, không tự
   * chuyển trang; bấm Thử lại gọi retry rồi mở lại vòng dò (pollEpoch). */
  useEffect(() => {
    const d = detail.data;
    if (!d) return;
    if (d.status === "failed") {
      const id2 = window.setTimeout(() => setAsrFail((v) => v ?? d.failure_reason ?? "unknown"), 0);
      return () => window.clearTimeout(id2);
    }
    if (d.status !== "processing") {
      const id0 = window.setTimeout(() => setDone(true), 0);
      return () => window.clearTimeout(id0);
    }
    const id1 = window.setTimeout(() => {
      setParticipants((p) => p ?? d.participant_contact_ids);
      setTitle((v) => v ?? d.title);
    }, 0);
    const off = data.sessions.subscribeProcessing(id, (s, state) => {
      if (s < 0) {
        setAsrFail(state?.asr_error ?? "unknown");
        return;
      }
      setAsrFail(null);
      if (s >= 6) setDone(true);
      else setStep(s);
    });
    return () => {
      window.clearTimeout(id1);
      off();
    };
  }, [detail.data, id, pollEpoch]);

  async function retryAsr() {
    try {
      await data.sessions.retryProcessing(id);
      setAsrFail(null);
      setStep(1);
      setPollEpoch((e) => e + 1);
    } catch {
      toast.show({ tone: "error", message: ts("saveError") });
    }
  }

  /* Khoảnh khắc "Xử lý xong": nhuộm dải giọng rồi chuyển tới chi tiết */
  useEffect(() => {
    if (!done || !detail.data || detail.data.status !== "ready") return;
    if (navigated.current) return;
    animRef.current?.stop();
    if (reduce) {
      const fadeId = window.setTimeout(() => setDye(1), 0);
      navigateTimer.current = window.setTimeout(() => {
        navigated.current = true;
        router.replace(`/s/${id}`);
      }, 700);
      return () => {
        window.clearTimeout(fadeId);
        window.clearTimeout(navigateTimer.current);
      };
    }
    animRef.current = animate(0, 1, { duration: 0.7, ease: EASE, delay: 0.15, onUpdate: setDye });
    navigateTimer.current = window.setTimeout(() => {
      navigated.current = true;
      router.replace(`/s/${id}`);
    }, 1500);
    return () => window.clearTimeout(navigateTimer.current);
  }, [done, detail.data, id, reduce, router]);

  useEffect(
    () => () => {
      window.clearTimeout(navigateTimer.current);
      animRef.current?.stop();
    },
    [],
  );

  if (detail.initialLoading) {
    return (
      <div className="px-page py-4" aria-busy={true}>
        <div className="h-32 rounded-block bg-surface-2 animate-pulse motion-reduce:animate-none" />
        <div className="mt-6 flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-6 w-64 rounded-pill bg-surface-2 animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
      </div>
    );
  }

  if (!detail.data) {
    return (
      <div className="px-page py-4">
        <EmptyState
          drawing={<span />}
          message={detail.error?.code === "not_found" ? ts("notFound") : ts("loadError")}
          action={<Button onClick={detail.reload}>{ts("retry")}</Button>}
        />
      </div>
    );
  }

  const d = detail.data;
  const contactById = Object.fromEntries((contacts.data ?? []).map((c) => [c.id, c]));

  async function saveTitle() {
    const next = (title ?? "").trim();
    if (!next || next === d.title) return;
    try {
      await data.sessions.update(id, { title: next });
      toast.show({ tone: "success", message: ts("titleSaved") });
    } catch {
      setTitle(d.title);
      toast.show({ tone: "error", message: ts("saveError") });
    }
  }

  async function toggleParticipant(contactId: string) {
    if (!participants) return;
    const next = participants.includes(contactId)
      ? participants.filter((c) => c !== contactId)
      : [...participants, contactId];
    setParticipants(next);
    try {
      await data.sessions.update(id, { participant_contact_ids: next });
    } catch {
      setParticipants(participants);
      toast.show({ tone: "error", message: ts("saveError") });
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-page py-4">
      <div className="flex min-h-14 items-center">
        <button
          type="button"
          onClick={() => router.push("/")}
          aria-label={ts("back")}
          className="-ml-2 flex size-11 items-center justify-center rounded-control text-ink hover:bg-surface-2"
        >
          <ArrowLeft aria-hidden={true} className="size-5" strokeWidth={1.75} />
        </button>
      </div>

      <RibbonPlayback
        peaks={d.peaks}
        spans={d.speaker_spans.map((s) => ({
          speaker: d.speakers.find((sp) => sp.id === s.speaker_id)?.color_index ?? 0,
          start: s.start_sec,
          end: s.end_sec,
        }))}
        duration={Math.max(1, d.duration_sec)}
        currentTime={0}
        dye={dye}
        height={56}
        interactive={false}
        label={t("ribbonLabel")}
      />

      <UploadBanner sessionId={id} onRetry={() => void retryPendingUploads()} />

      {asrFail ? (
        <div className="mt-4 rounded-block border border-line bg-surface-2 p-4" role="alert">
          <p className="text-small text-ink-2">
            {asrFail === "quota_exceeded" ? t("asrQuota") : t("asrFailed", { code: asrFail })}
          </p>
          <Button variant="secondary" className="mt-3 h-9" onClick={() => void retryAsr()}>
            {t("asrRetry")}
          </Button>
        </div>
      ) : null}

      <ol className="mt-6 flex flex-col gap-3">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const state = done || n < step ? "done" : n === step ? "current" : "todo";
          return (
            <li key={label} className="flex items-center gap-3 text-body">
              {state === "done" ? (
                <Check aria-hidden={true} className="size-5 shrink-0 text-ink" strokeWidth={2} />
              ) : state === "current" ? (
                <LoaderCircle
                  aria-hidden={true}
                  className="size-5 shrink-0 animate-spin text-sen motion-reduce:animate-none"
                  strokeWidth={2}
                />
              ) : (
                <Circle aria-hidden={true} className="size-5 shrink-0 text-ink-3" strokeWidth={1.75} />
              )}
              <span
                className={cn(
                  state === "todo" && "text-ink-3",
                  state === "current" && "font-medium text-ink",
                  state === "done" && "text-ink-2",
                )}
                aria-current={state === "current" ? "step" : undefined}
              >
                {t(label)}
              </span>
            </li>
          );
        })}
      </ol>

      <section className="mt-8">
        <h2 className="text-small font-semibold text-ink-2">{t("whileWaiting")}</h2>
        <label className="mt-3 block">
          <span className="mb-1.5 block text-small font-medium text-ink">{ts("edit")}</span>
          <input
            value={title ?? ""}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), undefined)}
            className="h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink focus:border-dien focus-visible:outline-none"
          />
        </label>

        <div className="mt-4">
          <p className="text-small font-medium text-ink">{t("participants")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            {(participants ?? []).map((pid) =>
              contactById[pid] ? (
                <SpeakerName
                  key={pid}
                  colorIndex={(contacts.data ?? []).findIndex((c) => c.id === pid) % 6}
                  name={contactById[pid].name}
                />
              ) : null,
            )}
            <Button variant="secondary" icon={UserRoundPlus} onClick={() => setAddSheet(true)} className="h-9">
              {t("addParticipant")}
            </Button>
          </div>
        </div>
      </section>

      <p className="mt-8 text-small text-ink-3">{t("safeToLeave")}</p>

      <Sheet open={addSheet} onOpenChange={setAddSheet} title={t("pickParticipants")} size="half">
        <ul className="flex flex-col">
          {(contacts.data ?? []).map((c) => {
            const checked = participants?.includes(c.id) ?? false;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => void toggleParticipant(c.id)}
                  aria-pressed={checked}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-control px-3 py-2.5 text-left",
                    "transition-colors ease-noteim duration-(--t-quick) hover:bg-surface-2",
                    checked && "bg-surface-2",
                  )}
                >
                  <span
                    aria-hidden={true}
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-control border",
                      checked ? "border-sen bg-sen text-on-sen" : "border-line",
                    )}
                  >
                    {checked ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-ink">{c.name}</span>
                    {c.role ? <span className="block truncate text-caption text-ink-3">{c.role}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 flex items-center gap-2 text-caption text-ink-3">
          <Plus aria-hidden={true} className="size-4" strokeWidth={1.75} />
          {t("pickHint")}
        </p>
      </Sheet>
    </div>
  );
}

/* Dải trạng thái tải băng lên kho (C1-04 yêu cầu 2c): băng ghi đang PUT thẳng
 * lên R2 thì hiện "Đang tải lên NN%"; hỏng thì hiện nút thử lại — băng nằm
 * trong IndexedDB nên thử lại vẫn còn nguyên. Xong tự ẩn; buổi bên thư viện
 * gỡ nhãn "Bản ghi thử" nhờ useDataVersion nhận báo thay đổi từ upload. */
function UploadBanner({ sessionId, onRetry }: { sessionId: string; onRetry: () => void }) {
  const t = useTranslations("processing");
  const upload = useAudioUpload();
  if (!upload || upload.sessionId !== sessionId) return null;

  if (upload.status === "failed") {
    return (
      <div className="mt-4 flex items-center justify-between gap-3 rounded-block border border-line bg-surface-2 p-4" role="status">
        <p className="flex items-center gap-2 text-small text-ink-2">
          <UploadCloud aria-hidden={true} className="size-4 shrink-0" strokeWidth={1.75} />
          {t("uploadFailed")}
        </p>
        <Button variant="secondary" className="h-9 shrink-0" onClick={onRetry}>
          {t("uploadRetry")}
        </Button>
      </div>
    );
  }

  return (
    <div
      className="mt-4 rounded-block border border-line bg-surface-2 p-4"
      role="status"
      aria-live="polite"
    >
      <p className="flex items-center gap-2 text-small text-ink-2">
        <UploadCloud aria-hidden={true} className="size-4 shrink-0" strokeWidth={1.75} />
        {upload.status === "complete" ? t("uploadDone") : t("uploading", { percent: upload.percent })}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-surface" aria-hidden={true}>
        <div
          className="h-full rounded-pill bg-sen transition-[width] duration-300 ease-noteim"
          style={{ width: `${upload.status === "complete" ? 100 : upload.percent}%` }}
        />
      </div>
    </div>
  );
}
