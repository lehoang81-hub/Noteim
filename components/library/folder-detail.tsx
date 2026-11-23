"use client";

import { ArrowLeft, ArrowUp, Check, FolderOpen, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { FolderKindIcon } from "@/components/library/folder-list";
import { SessionRow } from "@/components/session/session-row";
import { AiBlock } from "@/components/session/ai-block";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState, SkeletonParagraph } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { data, useData, type Folder, type FolderChatMessage, type Session, type Template } from "@/lib/data";
import { useDebugFlags } from "@/lib/debug/flags";
import { durationParts } from "@/lib/format";
import { templateName } from "@/lib/data/localize";
import { formatClock } from "@/components/ribbon/draw";

/*
 * Chi tiết hồ sơ /f/[id] (góp ý vòng 1, #75): điện thoại cả màn hình, máy
 * tính chiếm cột phải của Thư viện như chi tiết buổi ghi. Hai tab: Buổi ghi
 * (danh sách buổi của hồ sơ, thêm/bỏ được) và Hỏi AI (tính năng Pro: trả
 * lời ghép từ các buổi trong hồ sơ, dẫn chứng kèm tên buổi và mốc giây,
 * bấm là nhảy tới đúng mốc của buổi đó).
 */

const AI_SUGGESTIONS = ["aiSuggest1", "aiSuggest2", "aiSuggest3"] as const;

export function FolderDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const t = useTranslations("folders");
  const tl = useTranslations("library");
  const ts = useTranslations("session");
  const locale = useLocale();
  const folder = useData(() => data.folders.get(id), [id]);
  const sessions = useData(() => data.sessions.list(), []);
  const templates = useData(() => data.account.templates(), []);
  const [tab, setTab] = useState<"sessions" | "ai">("sessions");
  const [adding, setAdding] = useState(false);
  const [addingOnce, setAddingOnce] = useState(false);
  if (adding && !addingOnce) setAddingOnce(true);
  // Mẫu kế thừa của hồ sơ (GC-05, đặc tả §4.7): xem/đổi + xóa hồ sơ (luồng gộp)
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateOnce, setTemplateOnce] = useState(false);
  if (templateOpen && !templateOnce) setTemplateOnce(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const toast = useToast();

  async function saveTemplate(tid: string | null) {
    try {
      await data.folders.update(id, { template_id: tid });
      setTemplateOpen(false);
      folder.reload();
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
    }
  }

  async function removeFolder() {
    try {
      await data.folders.remove(id);
      toast.show({ tone: "success", message: t("deletedToast") });
      router.push("/");
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
    }
  }

  const tplName = (tid: string) => {
    const tp = templates.data?.find((x) => x.id === tid);
    return tp ? templateName(tp, locale) : "";
  };

  const back = (
    <Link
      href="/"
      aria-label={t("backToLibrary")}
      className="-ml-2 flex size-11 items-center justify-center rounded-control text-ink hover:bg-surface-2 lg:hidden"
    >
      <ArrowLeft aria-hidden={true} className="size-5" strokeWidth={1.75} />
    </Link>
  );

  if (folder.initialLoading) {
    return (
      <div className="px-page pt-2" aria-busy={true}>
        <div className="flex min-h-14 items-center">{back}</div>
        <SkeletonParagraph lines={2} />
        <div className="mt-8">
          <SkeletonParagraph lines={5} />
        </div>
      </div>
    );
  }
  if (!folder.data) {
    return (
      <div className="px-page pt-2">
        <div className="flex min-h-14 items-center">{back}</div>
        <EmptyState
          drawing={<span />}
          message={folder.error?.code === "not_found" ? t("notFound") : t("loadError")}
          action={
            folder.error?.code === "not_found" ? (
              <Link href="/" className="inline-flex h-11 items-center rounded-control border border-line bg-surface px-4 text-small font-semibold text-ink hover:bg-surface-2">
                {t("backToLibrary")}
              </Link>
            ) : (
              <Button onClick={folder.reload}>{t("retry")}</Button>
            )
          }
        />
      </div>
    );
  }

  const f = folder.data;
  const items = f.session_ids.map((sid) => (sessions.data ?? []).find((s) => s.id === sid)).filter(Boolean) as Session[];
  const minutes = items.reduce((n, s) => n + s.duration_sec, 0);
  const { h, m } = durationParts(minutes);
  const duration = h > 0 ? tl("hours", { h, m: String(m).padStart(2, "0") }) : tl("minutes", { m });
  const openTasks = items.reduce((n, s) => n + s.open_task_count, 0);
  const inheritTemplate = (templates.data ?? []).find((tp) => tp.id === f.template_id);
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="px-page pt-2 lg:px-8 lg:pt-4">
        <div className="flex min-h-14 items-center gap-1">
          {back}
          <span className="flex-1" />
          {/* Xóa hồ sơ (từ luồng GC khi gộp): các buổi không bị xóa, chỉ gỡ khỏi hồ sơ */}
          <Button variant="ghost" icon={Trash2} iconOnly aria-label={t("deleteAction")} onClick={() => setDeleteOpen(true)} />
        </div>
        <p className="mt-1 flex items-center gap-2 text-caption font-medium text-ink-3">
          <FolderKindIcon kind={f.kind} className="size-4 shrink-0" />
          <span>
            {t(`kind.${f.kind}`)}
            {f.ref ? `, ${f.ref}` : ""}
          </span>
        </p>
        <h1 className="mt-1 font-display text-h1 font-semibold text-ink">{f.name}</h1>
        <p className="mt-1 text-small text-ink-2">
          {t("meta", { sessions: t("sessionsCount", { count: items.length }), duration, tasks: openTasks > 0 ? t("openTasks", { count: openTasks }) : t("noOpenTasks") })}
        </p>
        {f.note ? <p className="mt-1 text-small text-ink-2">{f.note}</p> : null}
        {/* Nghề chọn một lần ở hồ sơ (GC-05, đặc tả §4.7): bấm là đổi mẫu kế thừa */}
        <button
          type="button"
          onClick={() => setTemplateOpen(true)}
          className="-mx-1 mt-2 inline-flex min-h-11 items-center gap-2 rounded-control px-1 text-left text-small text-ink-2 transition-colors ease-noteim duration-(--t-quick) hover:text-ink"
        >
          <FolderOpen aria-hidden={true} className="size-4 shrink-0" strokeWidth={1.75} />
          <span className="min-w-0 truncate">
            {inheritTemplate ? t("inherits", { template: templateName(inheritTemplate, locale) }) : t("inheritsNone")}
          </span>
        </button>
      </div>

      <div className="sticky top-0 z-10 mt-4 bg-bg px-page lg:px-8">
        <div role="tablist" aria-label={t("tabs")} className="flex gap-2 border-b border-line">
          {(["sessions", "ai"] as const).map((id2) => (
            <button
              key={id2}
              type="button"
              role="tab"
              aria-selected={tab === id2}
              onClick={() => setTab(id2)}
              className={cn(
                "min-h-11 px-3 text-body-strong transition-colors ease-noteim duration-(--t-quick)",
                tab === id2 ? "border-b-2 border-sen font-semibold text-ink" : "text-ink-3 hover:text-ink",
              )}
            >
              {id2 === "sessions" ? t("tabSessions") : t("tabAi")}
            </button>
          ))}
        </div>
      </div>

      {tab === "sessions" ? (
        <div className="flex-1 pb-24 pt-3">
          {items.length === 0 ? (
            <EmptyState message={t("noSessions")} action={<Button onClick={() => setAdding(true)}>{t("addSessions")}</Button>} />
          ) : (
            <ul className="flex flex-col">
              {items.map((s) => (
                <li key={s.id}>
                  <SessionRow
                    href={`/s/${s.id}`}
                    className="px-page"
                    title={s.title || tl("untitled")}
                    duration={duration}
                    template={tplName(s.template_id)}
                    badge={s.is_sample ? ts("sampleBadge") : undefined}
                    noAudio={
                      s.status === "ready"
                        ? s.trial_recording
                          ? ts("trialRecording")
                          : !s.audio_url
                            ? ts("noAudio")
                            : undefined
                        : undefined
                    }
                    peaks={s.peaks_thumb}
                    speakers={s.speaker_colors_thumb}
                    status={s.status === "ready" ? "ready" : s.status === "failed" ? "failed" : s.status === "unsynced" ? "unsynced" : "processing"}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="px-page pt-3">
            <Button variant="secondary" icon={Plus} onClick={() => setAdding(true)}>
              {t("addSessions")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 px-page pb-24 pt-3 lg:px-8">
          <FolderAiChat folder={f} sessions={items} />
        </div>
      )}

      {addingOnce ? (
        <AddSessionsSheet folder={f} allSessions={sessions.data ?? []} open={adding} onOpenChange={setAdding} />
      ) : null}

      {/* Đổi mẫu kế thừa của hồ sơ (GC-05, đặc tả §4.7 port sang luồng GY1) */}
      {templateOnce ? <FolderTemplateSheet folder={f} templates={templates.data ?? []} open={templateOpen} onOpenChange={setTemplateOpen} onSave={saveTemplate} /> : null}

      {/* Xóa hồ sơ: các buổi ghi không bị xóa, chỉ gỡ khỏi hồ sơ */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("deleteTitle", { name: f.name })}
        cancelLabel={t("deleteCancel")}
        confirmLabel={t("deleteConfirm")}
        onConfirm={() => void removeFolder()}
      >
        {t("deleteBody")}
      </ConfirmDialog>
    </div>
  );
}

/** Sheet chọn mẫu kế thừa cho buổi mới của hồ sơ (port từ luồng GC khi gộp). */
function FolderTemplateSheet({
  folder,
  templates,
  open,
  onOpenChange,
  onSave,
}: {
  folder: Folder;
  templates: Template[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (templateId: string | null) => void;
}) {
  const t = useTranslations("folders");
  const ts = useTranslations("session");
  const locale = useLocale();
  const [tid, setTid] = useState<string | null>(folder.template_id ?? null);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t("templateLabel")} size="half">
      <div className="flex flex-col gap-3 py-1">
        <p className="text-caption text-ink-3">{t("templateHint")}</p>
        <div role="radiogroup" aria-label={t("templateLabel")} className="flex flex-wrap gap-2">
          <button
            type="button"
            role="radio"
            aria-checked={tid === null}
            onClick={() => setTid(null)}
            className={cn(
              "h-11 rounded-control border px-3 text-small font-medium transition-colors ease-noteim duration-(--t-quick)",
              tid === null ? "border-sen bg-sen/10 text-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
            )}
          >
            {t("templateNone")}
          </button>
          {templates.map((tp) => (
            <button
              key={tp.id}
              type="button"
              role="radio"
              aria-checked={tid === tp.id}
              onClick={() => setTid(tp.id)}
              className={cn(
                "h-11 rounded-control border px-3 text-small font-medium transition-colors ease-noteim duration-(--t-quick)",
                tid === tp.id ? "border-sen bg-sen/10 text-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
              )}
            >
              {templateName(tp, locale)}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {t("deleteCancel")}
        </Button>
        <Button variant="primary" onClick={() => onSave(tid)}>
          {ts("save")}
        </Button>
      </div>
    </Sheet>
  );
}

function FolderAiChat({ folder, sessions }: { folder: Folder; sessions: Session[] }) {
  const t = useTranslations("folders");
  const ta = useTranslations("ai");
  const router = useRouter();
  const me = useData(() => data.account.me(), []);
  const flags = useDebugFlags();
  // Gói theo cờ bảng thử nghiệm trước (ép Pro để duyệt), sau đó theo hồ sơ
  const plan = flags.plan ?? me.data?.plan ?? "free";
  const history = useData(() => data.folders.history(folder.id), [folder.id]);

  const [localMessages, setLocalMessages] = useState<FolderChatMessage[] | null>(null);
  const messages = localMessages ?? history.data ?? null;
  const [asking, setAsking] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<{ question: string } | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [messages?.length, streamText]);

  const titleById = new Map(sessions.map((s) => [s.id, s.title]));

  function shortTitle(s: string, max = 26) {
    if (s.length <= max) return s;
    const cut = s.slice(0, max);
    const space = cut.lastIndexOf(" ");
    return (space > 12 ? cut.slice(0, space) : cut) + "…";
  }

  function citationLabel(sessionId: string, timestampSec: number): string {
    const title = titleById.get(sessionId);
    const clock = formatClock(timestampSec);
    return title ? `${shortTitle(title)}, ${clock}` : clock;
  }

  function openCitation(message: FolderChatMessage, label: string) {
    const hit = message.citations.find((c) => citationLabel(c.session_id, c.timestamp_sec) === label);
    if (!hit) return;
    router.push(`/s/${hit.session_id}?t=${hit.timestamp_sec}&tab=transcript`);
  }

  async function ask(question: string, opts: { skipUser?: boolean } = {}) {
    const q = question.trim();
    if (!q || asking) return;
    setError(null);
    setDraft("");
    setAsking(true);
    if (!opts.skipUser) {
      setLocalMessages((prev) => [...(prev ?? messages ?? []), { id: `fq-${Date.now()}`, role: "user", text: q, citations: [] }]);
    }
    try {
      const answer = await data.folders.ask(folder.id, q, (text) => setStreamText(text));
      setLocalMessages((prev) => [
        ...(prev ?? []),
        ...(opts.skipUser ? [{ id: `fq-${Date.now()}`, role: "user" as const, text: q, citations: [] }] : []),
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

  if (plan !== "pro") {
    return (
      <div className="rounded-block border border-line bg-surface p-4">
        <p className="text-body text-ink-2">{t("aiProHint")}</p>
        <Link href="/upgrade" className="mt-3 inline-flex min-h-11 items-center rounded-control bg-ink px-4 text-small font-semibold text-bg">
          {t("aiSeePro")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex max-w-[68ch] flex-col">
      <p className="text-caption text-ink-3">{t("aiScope", { count: sessions.length })}</p>

      <div className="mt-4 flex flex-col gap-4">
        {messages === null && history.initialLoading ? (
          <div aria-busy={true}>
            <SkeletonParagraph lines={3} />
          </div>
        ) : null}
        {messages && messages.length === 0 ? <p className="text-small text-ink-3">{t("aiEmptyHistory")}</p> : null}

        <div>
          <p className="text-small font-medium text-ink-2">{ta("suggest")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {AI_SUGGESTIONS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => void ask(t(key))}
                disabled={asking}
                className="inline-flex min-h-9 items-center rounded-pill border border-line bg-surface px-3 text-small text-ink transition-colors ease-noteim duration-(--t-quick) hover:bg-surface-2 disabled:opacity-50"
              >
                {t(key)}
              </button>
            ))}
          </div>
        </div>

        {(messages ?? []).map((m2) =>
          m2.role === "user" ? (
            <p key={m2.id} className="self-end rounded-block rounded-br-control bg-ink px-3.5 py-2 text-body text-bg">
              {m2.text}
            </p>
          ) : (
            <AiBlock
              key={m2.id}
              state="done"
              label={t("aiTitle")}
              text={m2.text}
              citations={m2.citations.map((c) => citationLabel(c.session_id, c.timestamp_sec))}
              citationLabel={t("citeSeek")}
              onCite={(label) => openCitation(m2, label)}
            />
          ),
        )}

        {asking ? (
          streamText ? (
            <AiBlock state="writing" label={t("aiTitle")} text={streamText} />
          ) : (
            <AiBlock state="writing" label={t("aiTitle")} text="" />
          )
        ) : null}

        {error ? (
          <AiBlock
            state="error"
            label={t("aiTitle")}
            text={t("aiError")}
            errorText={t("aiError")}
            retryLabel={t("aiRetry")}
            onRetry={() => void ask(error.question, { skipUser: true })}
          />
        ) : null}

        <div ref={listEndRef} />
      </div>

      <form
        className="sticky bottom-16 mt-4 flex items-end gap-2 rounded-block border border-line bg-surface p-2 shadow-float lg:bottom-4"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft);
        }}
      >
        <label htmlFor="folder-ai-question" className="sr-only">
          {t("aiInput")}
        </label>
        <textarea
          id="folder-ai-question"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(draft);
            }
          }}
          disabled={asking}
          rows={1}
          aria-busy={asking || undefined}
          placeholder={t("aiPlaceholder")}
          className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-control bg-transparent px-2 py-2.5 text-body text-ink placeholder:text-ink-3 focus-visible:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={asking || !draft.trim()}
          aria-label={t("aiSend")}
          className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-sen text-on-sen transition-[scale] ease-noteim duration-(--t-quick) disabled:bg-surface-2 disabled:text-ink-3"
        >
          <ArrowUp aria-hidden={true} className="size-5" strokeWidth={2} />
        </button>
      </form>
    </div>
  );
}

function AddSessionsSheet({
  folder,
  allSessions,
  open,
  onOpenChange,
}: {
  folder: Folder;
  allSessions: Session[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("folders");
  const ts = useTranslations("session");
  const tl = useTranslations("library");
  const locale = useLocale();
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>(folder.session_ids);

  function toggle(id: string) {
    setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  async function save() {
    try {
      await data.folders.update(folder.id, { session_ids: selected });
      onOpenChange(false);
    } catch {
      toast.show({ tone: "error", message: ts("saveError") });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t("addSessions")} description={folder.name} size="half">
      {allSessions.length === 0 ? (
        <p className="py-2 text-body text-ink-2">{t("noSessions")}</p>
      ) : (
        <ul aria-label={t("addSessions")} className="flex max-h-96 flex-col divide-y divide-line overflow-y-auto">
          {allSessions.map((s) => {
            const checked = selected.includes(s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggle(s.id)}
                  className="flex min-h-12 w-full items-center gap-3 py-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-ink">{s.title || tl("untitled")}</span>
                    <span className="block text-caption text-ink-3">{new Date(s.created_at).toLocaleDateString(locale === "en" ? "en-US" : locale === "ko" ? "ko-KR" : "vi-VN")}</span>
                  </span>
                  <span
                    aria-hidden={true}
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-control border",
                      checked ? "border-sen bg-sen text-on-sen" : "border-line bg-surface",
                    )}
                  >
                    {checked ? <Check className="size-4" strokeWidth={2.25} /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Button variant="primary" block className="mt-4" onClick={() => void save()}>
        {t("saveSessions")}
      </Button>
    </Sheet>
  );
}
