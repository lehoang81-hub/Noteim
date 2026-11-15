"use client";

import { Archive, ArrowLeft, Check, Ellipsis, Pencil, Share2, UserRoundPen, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { FloatingPlayer } from "@/components/session/floating-player";
import { Button } from "@/components/ui/button";
import { SpeakerName } from "@/components/ui/chips";
import { Banner, EmptyState, SkeletonParagraph } from "@/components/ui/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { data, dataNow, DataError, useData, type ActionItem, type SessionDetail } from "@/lib/data";
import { durationParts, shortDate } from "@/lib/format";
import { createMockPlayer, usePlayerState, type Player } from "@/lib/player/mock-player";
import { SummaryTab } from "./summary-tab";
import { SpeakerSheet } from "./speaker-sheet";
import { TasksTab } from "./tasks-tab";
import { TranscriptTab } from "./transcript-tab";

/*
 * Chi tiết buổi ghi (docs/03-screens.md mục 5).
 * M1: phần đầu, tab Tóm tắt, tab Việc cần làm, trình phát giả lập, chạm ý để tua.
 * M3-01: tab Lời. Tab Hình và Hỏi AI thuộc M3-03; Chia sẻ, Thêm thuộc M4.
 */

const TABS = ["summary", "tasks", "transcript", "visual", "ai"] as const;
type TabId = (typeof TABS)[number];
const TAB_LABEL: Record<TabId, string> = {
  summary: "tSummary",
  tasks: "tTasks",
  transcript: "tTranscript",
  visual: "tVisual",
  ai: "tAi",
};

export function SessionDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("session");
  const detail = useData(() => data.sessions.get(id), [id]);
  const templates = useData(() => data.account.templates(), []);
  const contacts = useData(() => data.account.contacts(), []);

  const back = (
    <Link
      href="/"
      aria-label={t("back")}
      className="-ml-2 flex size-11 items-center justify-center rounded-control text-ink hover:bg-surface-2 lg:hidden"
    >
      <ArrowLeft aria-hidden={true} className="size-5" strokeWidth={1.75} />
    </Link>
  );

  if (detail.initialLoading) {
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

  if (!detail.data) {
    const notFound = detail.error?.code === "not_found";
    return (
      <div className="px-page pt-2">
        <div className="flex min-h-14 items-center">{back}</div>
        <EmptyState
          drawing={<span />}
          message={notFound ? t("notFound") : t("loadError")}
          action={
            notFound ? (
              <Link
                href="/"
                className="inline-flex h-11 items-center rounded-control border border-line bg-surface px-4 text-small font-semibold text-ink hover:bg-surface-2"
              >
                {t("back")}
              </Link>
            ) : (
              <Button onClick={detail.reload}>{t("retry")}</Button>
            )
          }
        />
      </div>
    );
  }

  const template = templates.data?.find((tp) => tp.id === detail.data!.template_id);
  return (
    <Loaded
      key={detail.data.id}
      detail={detail.data}
      templateName={template?.name ?? ""}
      template={template}
      contacts={contacts.data ?? []}
      back={back}
    />
  );
}

function Loaded({
  detail,
  template,
  templateName,
  contacts,
  back,
}: {
  detail: SessionDetail;
  template: Parameters<typeof SummaryTab>[0]["template"];
  templateName: string;
  contacts: NonNullable<ReturnType<typeof useData<Awaited<ReturnType<typeof data.account.contacts>>>>["data"]>;
  back: React.ReactNode;
}) {
  const t = useTranslations("session");
  const tl = useTranslations("styleguide.tags");
  const toast = useToast();
  const router = useRouter();
  const search = useSearchParams();
  const now = dataNow();

  const tab: TabId = (TABS as readonly string[]).includes(search.get("tab") ?? "") ? (search.get("tab") as TabId) : "summary";
  const setTab = (v: string) => router.replace(`/s/${detail.id}?tab=${v}`, { scroll: false });

  const [player] = useState<Player>(() => createMockPlayer(detail.duration_sec));
  useEffect(() => () => player.pause(), [player]);
  const ps = usePlayerState(player);
  const [expanded, setExpanded] = useState(false);
  const [naming, setNaming] = useState(false);
  const touched = useRef(false);

  const canPlay = detail.storage_status === "full" && detail.status === "ready";
  function seek(time: number) {
    touched.current = true;
    player.seek(time);
    player.play();
  }

  const bullets = useMemo(
    () => detail.topics.flatMap((tp) => tp.bullets).sort((a, b) => a.timestamp_sec - b.timestamp_sec),
    [detail.topics],
  );
  const playingBulletId = useMemo(() => {
    if (!touched.current && !ps.playing && ps.currentTime === 0) return null;
    let current: string | null = null;
    for (const b of bullets) if (b.timestamp_sec <= ps.currentTime + 0.5) current = b.id;
    return current;
  }, [bullets, ps.currentTime, ps.playing]);

  const [items, setItems] = useState(detail.action_items);
  async function toggle(item: ActionItem, isUndo = false) {
    setItems((list) => list.map((a) => (a.id === item.id ? { ...a, done: !a.done, done_at: a.done ? null : new Date().toISOString() } : a)));
    try {
      const updated = await data.tasks.toggleDone(item.id);
      setItems((list) => list.map((a) => (a.id === item.id ? updated : a)));
      if (!isUndo)
        toast.show({
          tone: "success",
          message: updated.done ? t("taskDone") : t("taskUndone"),
          action: { label: t("undo"), onClick: () => toggle(updated, true) },
        });
    } catch (e) {
      setItems((list) => list.map((a) => (a.id === item.id ? item : a)));
      toast.show({ tone: "error", message: e instanceof DataError && e.code === "offline" ? t("saveError") : t("saveError") });
    }
  }

  const soon = () => toast.show({ tone: "success", message: t("soonTab") });
  const { h, m } = durationParts(detail.duration_sec);
  const durationLabel = h > 0 ? `${h} giờ ${String(m).padStart(2, "0")}` : `${m} phút`;
  const unnamed = detail.speakers.filter((s) => !s.contact_id && !s.is_me).length;
  const expiresSoon =
    detail.storage_status === "full" &&
    detail.audio_expires_at &&
    new Date(detail.audio_expires_at).getTime() - now.getTime() < 48 * 3600_000;

  const tagLabels = { decided: tl("decided"), pending: tl("pending"), risk: tl("risk"), idea: tl("idea"), figure: tl("figure") };

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="px-page pt-2 lg:px-8 lg:pt-4">
        <div className="flex min-h-14 items-center gap-1">
          {back}
          <span className="flex-1" />
          <Button variant="ghost" icon={Share2} iconOnly aria-label={t("share")} onClick={soon} />
          <Button variant="ghost" icon={Ellipsis} iconOnly aria-label={t("more")} onClick={soon} />
        </div>
        <TitleEditor id={detail.id} title={detail.title} />
        <p className="mt-1 text-small text-ink-2">
          {t("meta", { date: shortDate(detail.created_at), duration: durationLabel, template: templateName })}
        </p>
        {detail.speakers.length ? (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {detail.speakers.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setNaming(true)}
                aria-label={`${t("nameSpeakers")}: ${s.display_name}`}
                className="-mx-1 rounded-control px-1 py-0.5 text-left"
              >
                <SpeakerName colorIndex={s.color_index} name={s.display_name} named={!!s.contact_id || s.is_me} />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {unnamed && detail.status === "ready" ? (
        <Banner
          kind="offline"
          icon={UserRoundPen}
          className="mt-3 lg:px-8"
          action={
            <button type="button" onClick={() => setNaming(true)} className="-my-2 inline-flex h-10 items-center px-1 font-semibold underline underline-offset-2">
              {t("nameThem")}
            </button>
          }
        >
          {t("unnamed", { count: unnamed })}
        </Banner>
      ) : null}
      {expiresSoon ? (
        <Banner
          kind="expiring"
          className="mt-2 lg:px-8"
          action={
            <button type="button" onClick={soon} className="-my-2 inline-flex h-10 items-center px-1 font-semibold underline underline-offset-2">
              {t("keep")}
            </button>
          }
        >
          {t("expiring", { date: shortDate(detail.audio_expires_at!) })}
        </Banner>
      ) : null}
      {detail.storage_status === "essence_only" ? (
        <Banner kind="offline" icon={Archive} className="mt-3 lg:px-8">
          {t("essence")}
        </Banner>
      ) : null}

      {detail.status !== "ready" ? (
        <StatusBlock detail={detail} />
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="mt-4 flex-1">
          <div className="sticky top-0 z-10 bg-bg px-page lg:px-8">
            <TabsList label={t("tabs")}>
              {TABS.map((id) => (
                <TabsTrigger key={id} value={id}>
                  {t(TAB_LABEL[id])}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="px-page pb-40 pt-5 lg:px-8">
            <TabsContent value="summary">
              <SummaryTab
                detail={detail}
                template={template}
                tagLabels={tagLabels}
                playingBulletId={playingBulletId}
                canSeek={canPlay}
                onSeek={seek}
                onAskAi={() => setTab("ai")}
                onSendMinutes={soon}
              />
            </TabsContent>
            <TabsContent value="tasks">
              <TasksTab
                items={items}
                contacts={contacts}
                now={now}
                canSeek={canPlay}
                onSeek={seek}
                onToggle={(a) => toggle(a)}
                onAdd={soon}
                onEmail={soon}
              />
            </TabsContent>
            {(["transcript"] as const).map((id) => (
              <TabsContent key={id} value={id}>
                <TranscriptTab
                  detail={detail}
                  canPlay={canPlay}
                  currentTime={ps.currentTime}
                  playing={ps.playing}
                  onSeek={seek}
                />
              </TabsContent>
            ))}
            {(["visual", "ai"] as const).map((id) => (
              <TabsContent key={id} value={id}>
                <EmptyState drawing={<span />} message={t("soonTab")} />
              </TabsContent>
            ))}
          </div>
        </Tabs>
      )}

      {canPlay ? (
        <div className="fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 lg:sticky lg:inset-x-auto lg:bottom-4 lg:mx-8 lg:mb-4">
          <FloatingPlayer
            player={player}
            peaks={detail.peaks}
            spans={detail.speaker_spans.map((s) => ({
              speaker: detail.speakers.find((sp) => sp.id === s.speaker_id)?.color_index ?? 0,
              start: s.start_sec,
              end: s.end_sec,
            }))}
            bookmarks={detail.bookmarks.map((b) => ({ time: b.timestamp_sec, tag: b.tag }))}
            heat={detail.topics.map((tp) => ({ start: tp.start_sec, end: tp.end_sec, tag: tp.tag }))}
            expanded={expanded}
            onExpandedChange={setExpanded}
          />
        </div>
      ) : null}

      {/* Ai là ai? (M3-02): đặt tên, nghe thử, gộp người nói */}
      <SpeakerSheet detail={detail} player={player} canPlay={canPlay} open={naming} onOpenChange={setNaming} />
    </div>
  );
}

function TitleEditor({ id, title }: { id: string; title: string }) {
  const t = useTranslations("session");
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [saved, setSaved] = useState(title);

  async function save() {
    const next = value.trim();
    if (!next || next === saved) {
      setEditing(false);
      setValue(saved);
      return;
    }
    setSaved(next);
    setEditing(false);
    try {
      await data.sessions.update(id, { title: next });
      toast.show({ tone: "success", message: t("titleSaved") });
    } catch {
      setSaved(saved);
      setValue(saved);
      toast.show({ tone: "error", message: t("saveError") });
    }
  }

  if (editing) {
    return (
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <input
          autoFocus
          aria-label={t("edit")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && (setEditing(false), setValue(saved))}
          className="h-11 min-w-0 flex-1 rounded-control border border-dien bg-surface px-2 font-display text-h2 font-semibold text-ink focus-visible:outline-none"
        />
        <Button type="submit" variant="primary" icon={Check} iconOnly aria-label={t("save")} />
        <Button variant="ghost" icon={X} iconOnly aria-label={t("cancel")} onClick={() => (setEditing(false), setValue(saved))} />
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={`${t("edit")}: ${saved}`}
      className="group -mx-1 flex max-w-full items-start gap-2 rounded-control px-1 text-left"
    >
      <h1 className="min-w-0 font-display text-h1 font-semibold text-ink">{saved}</h1>
      <Pencil aria-hidden={true} className="mt-2 size-4 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" strokeWidth={1.75} />
    </button>
  );
}

function StatusBlock({ detail }: { detail: SessionDetail }) {
  const t = useTranslations("session");
  const toast = useToast();
  const message =
    detail.status === "processing"
      ? t("processing", { step: detail.processing_step ?? 1 })
      : detail.status === "failed"
        ? t("failed")
        : t("unsynced");
  return (
    <div className="px-page lg:px-8">
      <EmptyState
        drawing={<span />}
        message={message}
        action={
          detail.status === "failed" ? (
            <div className="flex flex-col items-center gap-2">
              {detail.failure_reason ? <p className="text-small text-ink-3">{t("failedReason", { reason: detail.failure_reason })}</p> : null}
              <Button
                onClick={async () => {
                  await data.sessions.retryProcessing(detail.id);
                  data.sessions.subscribeProcessing(detail.id, () => {});
                  toast.show({ tone: "success", message: t("processing", { step: 1 }) });
                }}
              >
                {t("retry")}
              </Button>
            </div>
          ) : undefined
        }
      />
    </div>
  );
}
