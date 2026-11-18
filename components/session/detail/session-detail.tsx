"use client";

import { Archive, ArrowLeft, Check, Ellipsis, Pencil, Share2, Trash2, UserRoundPen, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { FloatingPlayer } from "@/components/session/floating-player";
import { Button } from "@/components/ui/button";
import { SpeakerName } from "@/components/ui/chips";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Banner, EmptyState, SkeletonParagraph } from "@/components/ui/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { data, dataNow, DataError, useData, type ListeningPrefs, type ActionItem, type Lang, type SessionDetail, type SummaryVersion } from "@/lib/data";
import { durationParts, shortDate } from "@/lib/format";
import { cleanDurationOf, skipsFromMap } from "@/lib/listening/skips";
import { templateName as localizedTemplateName, speakerLabel } from "@/lib/data/localize";
import { useDebugFlags } from "@/lib/debug/flags";
import { createAudioPlayer } from "@/lib/player/audio-player";
import { createMockPlayer, usePlayerState, type Player } from "@/lib/player/mock-player";
import { SummaryTab } from "./summary-tab";
import type { ShareIntent } from "./share-sheet";

/* Tab và bảng ít dùng nạp chậm để giảm JS khởi tạo (M5-04):
 * tab Tóm tắt là mặc định nên giữ nạp sẵn, phần còn lại tải khi mở. */
const SendMinutesSheet = dynamic(() => import("./send-minutes").then((m) => m.SendMinutesSheet), { ssr: false });
const ShareSheet = dynamic(() => import("./share-sheet").then((m) => m.ShareSheet), { ssr: false });
const SpeakerSheet = dynamic(() => import("./speaker-sheet").then((m) => m.SpeakerSheet), { ssr: false });
const TaskSheet = dynamic(() => import("./task-sheet").then((m) => m.TaskSheet), { ssr: false });
const TasksTab = dynamic(() => import("./tasks-tab").then((m) => m.TasksTab), { ssr: false });
const TranscriptTab = dynamic(() => import("./transcript-tab").then((m) => m.TranscriptTab), { ssr: false });
const VisualTab = dynamic(() => import("./visual-tab").then((m) => m.VisualTab), { ssr: false });
const AiTab = dynamic(() => import("./ai-tab").then((m) => m.AiTab), { ssr: false });
const SessionTour = dynamic(() => import("@/components/welcome/session-tour").then((m) => m.SessionTour), { ssr: false });

/*
 * Chi tiết buổi ghi (docs/03-screens.md mục 5).
 * M1: phần đầu, tab Tóm tắt, tab Việc cần làm, trình phát giả lập, chạm ý để tua.
 * M3-01: tab Lời. M3-02: đặt tên người nói. M3-03: tab Hình, Hỏi AI.
 * M4-01: bảng chia sẻ (nút chia sẻ + menu nhấn giữ ý), menu ⋯: đổi mẫu và
 * tóm tắt lại, gửi biên bản, xuất file, dọn bản gốc, xóa (có Hoàn tác).
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
  const locale = useLocale();
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
    const forbidden = detail.error?.code === "forbidden";
    return (
      <div className="px-page pt-2">
        <div className="flex min-h-14 items-center">{back}</div>
        <EmptyState
          drawing={<span />}
          message={forbidden ? t("forbidden") : notFound ? t("notFound") : t("loadError")}
          action={
            forbidden || notFound ? (
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
      templateName={template ? localizedTemplateName(template, locale) : ""}
      template={template}
      templates={templates.data ?? []}
      contacts={contacts.data ?? []}
      back={back}
    />
  );
}

function Loaded({
  detail,
  template,
  templateName,
  templates,
  contacts,
  back,
}: {
  detail: SessionDetail;
  template: Parameters<typeof SummaryTab>[0]["template"];
  templateName: string;
  templates: Awaited<ReturnType<typeof data.account.templates>>;
  contacts: NonNullable<ReturnType<typeof useData<Awaited<ReturnType<typeof data.account.contacts>>>>["data"]>;
  back: React.ReactNode;
}) {
  const t = useTranslations("session");
  // Bộ dịch cấp gốc cho nhãn hệ thống của người nói chưa đặt tên (review #41 mục 5)
  const tr = useTranslations();
  const tl = useTranslations("styleguide.tags");
  const tlLib = useTranslations("library");
  const locale = useLocale();
  const toast = useToast();
  const router = useRouter();
  const search = useSearchParams();
  const now = dataNow();
  const me = useData(() => data.account.me(), []);
  // Thành viên nhóm để giao việc và hiện tên người phụ trách (M7-01);
  // chỉ buổi thuộc không gian Nhóm mới cần
  const members = useData(
    () => (detail.workspace_id ? data.workspaces.members(detail.workspace_id) : Promise.resolve([])),
    [detail.workspace_id],
  );
  const memberNames = Object.fromEntries((members.data ?? []).map((m) => [m.user_id, m.display_name]));
  const planFlag: "free" | "pro" = me.data?.plan ?? "free";

  const tab: TabId = (TABS as readonly string[]).includes(search.get("tab") ?? "") ? (search.get("tab") as TabId) : "summary";
  const setTab = (v: string) => router.replace(`/s/${detail.id}?tab=${v}`, { scroll: false });

  // Buổi có file âm thanh thật dùng trình phát thật (M9-01); cờ "Âm thanh giả"
  // ép dùng đồng hồ giả cho cả 3 buổi đó (để bộ kiểm thử cũ chạy nhanh)
  const flags = useDebugFlags();
  const audioUrl = detail.audio_url && !flags.audioMock ? detail.audio_url : null;
  function makePlayer(url: string | null): Player {
    return url ? createAudioPlayer(url, detail.duration_sec) : createMockPlayer(detail.duration_sec);
  }
  const [player, setPlayer] = useState<Player>(() => makePlayer(audioUrl));
  // Đổi cờ "Âm thanh giả": thay trình phát, không giữ vị trí cũ của loại kia
  const playerKind = useRef(audioUrl ? "audio" : "mock");
  useEffect(() => {
    const kind = audioUrl ? "audio" : "mock";
    if (playerKind.current === kind) return;
    playerKind.current = kind;
    player.pause();
    player.destroy?.();
    setPlayer(makePlayer(audioUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);
  useEffect(() => () => {
    player.pause();
    player.destroy?.();
  }, [player]);
  const ps = usePlayerState(player);

  const [expanded, setExpanded] = useState(false);
  // Mở sâu từ Tổng quan (?sheet=speakers, M7-02): vào trang là bảng đặt tên người nói
  const [naming, setNaming] = useState(() => search.get("sheet") === "speakers");
  // Các bảng nạp chậm chỉ dựng sau lần mở đầu tiên (M5-04): tránh tải chunk
  // ngay khi vào trang dù chưa bấm gì.
  const [namingOnce, setNamingOnce] = useState(false);
  if (naming && !namingOnce) setNamingOnce(true);
  const [editingTask, setEditingTask] = useState<ActionItem | null>(null);
  const [taskSheet, setTaskSheet] = useState(false);
  const [taskSheetOnce, setTaskSheetOnce] = useState(false);
  if (taskSheet && !taskSheetOnce) setTaskSheetOnce(true);
  const [sending, setSending] = useState(false);
  const [sendingOnce, setSendingOnce] = useState(false);
  if (sending && !sendingOnce) setSendingOnce(true);
  // Mở sâu từ Tổng quan (?sheet=share, M7-02): vào trang là bảng chia sẻ
  const [sharing, setSharing] = useState(() => search.get("sheet") === "share");
  const [sharingOnce, setSharingOnce] = useState(false);
  if (sharing && !sharingOnce) setSharingOnce(true);
  const [shareIntent, setShareIntent] = useState<ShareIntent>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reprocessOpen, setReprocessOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [keepOpen, setKeepOpen] = useState(false);
  // Tour làm quen (?tour=1): 3 chú thích nổi, hiện khi buổi ghi tải xong (M4-04)
  const tourParam = search.get("tour") === "1";
  const [tourDone, setTourDone] = useState(false);
  const touched = useRef(false);

  const canPlay = detail.storage_status === "full" && detail.status === "ready";
  function seek(time: number) {
    touched.current = true;
    player.seek(time);
    player.play();
  }

  // Nghe sạch (M8-01): bản đồ nghe của buổi + lựa chọn của người dùng. Kim
  // nhảy qua khoảng lặng/tiếng đệm khi phát; file gốc không bị cắt sửa.
  const listeningMap = useData(
    () => (canPlay ? data.sessions.getListeningMap(detail.id) : Promise.resolve(null)),
    [detail.id, canPlay],
  );
  const prefs: ListeningPrefs | null = me.data?.listening_prefs ?? null;
  const skips = useMemo(() => skipsFromMap(listeningMap.data, prefs), [listeningMap.data, prefs]);
  useEffect(() => {
    player.setSkips(skips);
  }, [player, skips]);
  const cleanDuration = cleanDurationOf(detail.duration_sec, skips);
  function setPrefs(patch: Partial<ListeningPrefs>) {
    void data.account
      .updateMe({ listening_prefs: { ...(prefs ?? { enabled: false, denoise: true, level: true, skip_silence: true, skip_fillers: false }), ...patch } })
      .catch(() => undefined);
  }

  // /tasks và /search dẫn tới đây kèm mốc thời gian (?t=giây): tua tới đúng
  // đoạn rồi dọn URL, giữ nguyên tab đang mở (M4-02: vào từ tab Lời)
  const didSeekParam = useRef(false);
  useEffect(() => {
    if (didSeekParam.current || !canPlay) return;
    const tParam = Number(search.get("t"));
    if (search.get("t") && !Number.isNaN(tParam) && tParam > 0) {
      didSeekParam.current = true;
      seek(tParam);
      const tab = search.get("tab") ?? "summary";
      router.replace(`/s/${detail.id}?tab=${tab}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPlay, search]);

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

  // Bản tóm tắt đang xem (M6-03): mặc định bản gốc, đổi qua ô "Tóm tắt bằng".
  // Bản gốc có sẵn trong detail — dựng bản ngay không chờ fetch, nhờ điểm
  // nội dung lớn nhất (tóm tắt chung) vẽ cùng lần đầu, LCP không bị đẩy xa.
  const [verLang, setVerLang] = useState<Lang>(detail.original_report_language);
  const summaryFetch = useData(() => data.sessions.getSummary(detail.id, verLang), [detail.id, verLang]);
  const summary =
    verLang === detail.original_report_language
      ? ({
          session_id: detail.id,
          lang: detail.original_report_language,
          source: "original",
          translated_from: null,
          created_at: detail.created_at,
          stale: false,
          executive_summary: detail.executive_summary,
          topics: detail.topics,
          task_texts: Object.fromEntries(detail.action_items.map((a) => [a.id, a.task])),
        } as SummaryVersion)
      : summaryFetch.data;

  const [items, setItems] = useState(detail.action_items);
  // Dữ liệu tải lại (sửa việc ở nơi khác, thêm việc...) thì đồng bộ lại danh sách;
  // làm lúc vẽ thay vì trong effect
  const [prevItems, setPrevItems] = useState(detail.action_items);
  if (detail.action_items !== prevItems) {
    setPrevItems(detail.action_items);
    setItems(detail.action_items);
  }
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

  const { h, m } = durationParts(detail.duration_sec);
  const durationLabel = h > 0 ? tlLib("hours", { h, m: String(m).padStart(2, "0") }) : tlLib("minutes", { m });
  const unnamed = detail.speakers.filter((s) => !s.contact_id && !s.is_me).length;
  const expiresSoon =
    detail.storage_status === "full" &&
    detail.audio_expires_at &&
    new Date(detail.audio_expires_at).getTime() - now.getTime() < 48 * 3600_000;
  const lastSent = detail.send_history.length ? detail.send_history[detail.send_history.length - 1] : null;

  const tagLabels = { decided: tl("decided"), pending: tl("pending"), risk: tl("risk"), idea: tl("idea"), figure: tl("figure") };

  /** Mở bảng chia sẻ với một lựa chọn chỉ định (thẻ trích dẫn, đoạn tinh túy, xuất file). */
  function openShare(intent: ShareIntent) {
    setShareIntent(intent);
    setSharing(true);
  }

  async function deleteSession() {
    try {
      await data.sessions.remove(detail.id);
      setConfirmDelete(false);
      toast.show({
        tone: "success",
        message: t("deletedToast"),
        action: {
          label: t("undo"),
          onClick: () => {
            void data.sessions
              .restore(detail.id)
              .catch(() => toast.show({ tone: "error", message: t("saveError") }));
          },
        },
      });
      router.push("/");
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
      setConfirmDelete(false);
    }
  }

  async function purge() {
    try {
      const { freed_bytes } = await data.sessions.purgeRaw([detail.id]);
      setConfirmPurge(false);
      toast.show({ tone: "success", message: t("purgedToast", { mb: Math.max(1, Math.round(freed_bytes / 1_000_000)) }) });
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
      setConfirmPurge(false);
    }
  }

  async function reprocess(templateId: string) {
    try {
      await data.sessions.reprocess(detail.id, templateId);
      setReprocessOpen(false);
      setMoreOpen(false);
      router.push(`/s/${detail.id}/processing`);
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="px-page pt-2 lg:px-8 lg:pt-4">
        <div className="flex min-h-14 items-center gap-1">
          {back}
          <span className="flex-1" />
          <Button variant="ghost" icon={Share2} iconOnly aria-label={t("share")} onClick={() => openShare(null)} />
          <Button variant="ghost" icon={Ellipsis} iconOnly aria-label={t("more")} onClick={() => setMoreOpen(true)} />
        </div>
        <TitleEditor id={detail.id} title={detail.title} />
        <p className="mt-1 text-small text-ink-2">
          {t("meta", { date: shortDate(detail.created_at, locale), duration: durationLabel, template: templateName })}
          {lastSent ? `, ${t("sentAt", { date: shortDate(lastSent.sent_at, locale) })}` : ""}
        </p>
        {detail.speakers.length ? (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {detail.speakers.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setNaming(true)}
                aria-label={`${t("nameSpeakers")}: ${speakerLabel(s, detail.speakers, tr)}`}
                className="-mx-1 rounded-control px-1 py-0.5 text-left"
              >
                <SpeakerName colorIndex={s.color_index} name={speakerLabel(s, detail.speakers, tr)} named={!!s.contact_id || s.is_me} />
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
            <button type="button" onClick={() => setNaming(true)} className="-my-2 inline-flex h-11 items-center px-1 font-semibold underline underline-offset-2">
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
            <button type="button" onClick={() => setKeepOpen(true)} className="-my-2 inline-flex h-11 items-center px-1 font-semibold underline underline-offset-2">
              {t("keep")}
            </button>
          }
        >
          {t("expiring", { date: shortDate(detail.audio_expires_at!, locale) })}
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
              {summary ? (
                <SummaryTab
                  detail={detail}
                  template={template}
                  tagLabels={tagLabels}
                  playingBulletId={playingBulletId}
                  canSeek={canPlay}
                  onSeek={seek}
                  onAskAi={() => setTab("ai")}
                  onSendMinutes={() => setSending(true)}
                  onShareIntent={openShare}
                  version={summary}
                  verLang={verLang}
                  onVerLang={setVerLang}
                  versions={detail.report_languages.length ? detail.report_languages : [detail.original_report_language]}
                  originalLang={detail.original_report_language}
                  plan={planFlag}
                />
              ) : (
                <div aria-busy={true}>
                  <SkeletonParagraph lines={4} />
                </div>
              )}
            </TabsContent>
            <TabsContent value="tasks">
              <TasksTab
                items={items.map((a) => (summary?.task_texts?.[a.id] ? { ...a, task: summary.task_texts[a.id] } : a))}
                lang={verLang}
                contacts={contacts}
                memberNames={memberNames}
                now={now}
                canSeek={canPlay}
                onSeek={seek}
                onToggle={(a) => toggle(a)}
                onOpen={(a) => (setEditingTask(a), setTaskSheet(true))}
                onAdd={() => (setEditingTask(null), setTaskSheet(true))}
                onEmail={() => setSending(true)}
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
                  fillers={listeningMap.data?.fillers ?? []}
                  onQuoteCard={(seg) => {
                    const sp = detail.speakers.find((s) => s.id === seg.speaker_id);
                    // Thẻ trích dẫn: câu gốc + bản dịch ở ngôn ngữ giao diện (M6-04)
                    const translation = seg.translations[locale as Lang];
                    openShare({
                      kind: "card",
                      quote: {
                        text: seg.text,
                        speakerName: sp ? speakerLabel(sp, detail.speakers, tr) : "",
                        speakerColorIndex: sp?.color_index ?? 0,
                        startSec: seg.start_sec,
                        endSec: seg.end_sec,
                        originalText: seg.text,
                        originalLang: seg.lang,
                        translatedText: translation?.text,
                        translatedLang: translation ? (locale as Lang) : undefined,
                      },
                    });
                  }}
                />
              </TabsContent>
            ))}
            <TabsContent value="visual">
              <VisualTab detail={detail} canPlay={canPlay} onSeek={seek} />
            </TabsContent>
            <TabsContent value="ai">
              <AiTab detail={detail} template={template} canPlay={canPlay} onSeek={seek} />
            </TabsContent>
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
            skips={skips}
            listening={{ map: listeningMap.data ?? null, prefs, cleanDuration, onPrefs: setPrefs }}
            expanded={expanded}
            onExpandedChange={setExpanded}
          />
        </div>
      ) : null}

      {/* Ai là ai? (M3-02): đặt tên, nghe thử, gộp người nói */}
      {namingOnce ? (
        <SpeakerSheet detail={detail} player={player} canPlay={canPlay} open={naming} onOpenChange={setNaming} />
      ) : null}

      {/* Sửa / thêm việc (M3-04) */}
      {taskSheetOnce ? (
        <TaskSheet session={detail} contacts={contacts} members={members.data ?? []} item={editingTask} open={taskSheet} onOpenChange={setTaskSheet} />
      ) : null}

      {/* Gửi biên bản và giao việc, ba bước (M3-04) */}
      {sendingOnce ? (
        <SendMinutesSheet session={detail} contacts={contacts} plan={planFlag} defaultReportLang={me.data?.default_report_language ?? detail.original_report_language} canPlay={canPlay} onSeek={seek} open={sending} onOpenChange={setSending} />
      ) : null}

      {/* Bảng chia sẻ: link xem, thẻ trích dẫn, đoạn tinh túy, xuất file (M4-01) */}
      {sharingOnce ? (
        <ShareSheet detail={detail} template={template} open={sharing} onOpenChange={setSharing} intent={shareIntent} />
      ) : null}

      {/* Menu ⋯: đổi mẫu và tóm tắt lại, gửi biên bản, xuất file, dọn bản gốc, xóa */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen} title={t("moreTitle")} description={detail.title} size="half">
        <ul className="divide-y divide-line">
          <MenuRow icon={Pencil} label={t("moreReprocess")} onClick={() => (setMoreOpen(false), setReprocessOpen(true))} />
          <MenuRow icon={Share2} label={t("sendMinutes")} onClick={() => (setMoreOpen(false), setSending(true))} />
          <MenuRow icon={Archive} label={t("moreExport")} onClick={() => (setMoreOpen(false), openShare({ kind: "export" }))} />
          {detail.storage_status === "full" && detail.status === "ready" ? (
            <MenuRow icon={Archive} label={t("purge")} onClick={() => (setMoreOpen(false), setConfirmPurge(true))} />
          ) : null}
          <MenuRow icon={Trash2} label={t("delete")} danger={true} onClick={() => (setMoreOpen(false), setConfirmDelete(true))} />
        </ul>
      </Sheet>

      {/* Đổi mẫu và tóm tắt lại: chọn mẫu, xử lý lại như ghi mới */}
      <Sheet open={reprocessOpen} onOpenChange={setReprocessOpen} title={t("reprocessTitle")} description={t("reprocessHint")} size="half">
        <ul className="divide-y divide-line">
          {templates.map((tp) => (
            <li key={tp.id}>
              <button type="button" onClick={() => void reprocess(tp.id)} className="flex min-h-12 w-full items-center gap-3 py-2 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block text-body text-ink">{localizedTemplateName(tp, locale)}</span>
                  {tp.id === detail.template_id ? <span className="block text-caption text-ink-3">{t("currentTemplate")}</span> : null}
                </span>
                {tp.id === detail.template_id ? <Check aria-hidden={true} className="size-5 shrink-0 text-sen" strokeWidth={2} /> : null}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      {/* Dọn bản gốc: nói rõ thứ gì mất và thứ gì giữ (docs mục 12) */}
      <ConfirmDialog
        open={confirmPurge}
        onOpenChange={setConfirmPurge}
        title={t("purgeTitle")}
        cancelLabel={t("cancel")}
        confirmLabel={t("purgeConfirm")}
        onConfirm={() => void purge()}
      >
        <span className="block">{t("purgeBodyRemove", { mb: Math.max(1, Math.round(detail.size_bytes / 1_000_000)) })}</span>
        <span className="block">{t("purgeBodyKeep")}</span>
        <span className="mt-2 block font-medium text-ink">{t("purgeBodyIrreversible")}</span>
      </ConfirmDialog>

      {/* Giữ lại bản gốc (M4-03): Pro bỏ ngày tự xóa; Free mở giải thích + gói Pro */}
      <ConfirmDialog
        open={keepOpen}
        onOpenChange={setKeepOpen}
        title={planFlag === "pro" ? t("keepProTitle") : t("keepFreeTitle")}
        cancelLabel={t("cancel")}
        confirmLabel={planFlag === "pro" ? t("keepProConfirm") : t("keepFreeConfirm")}
        confirmVariant={planFlag === "pro" ? "primary" : "secondary"}
        onConfirm={() => {
          setKeepOpen(false);
          if (planFlag === "pro") {
            void data.sessions
              .update(detail.id, { audio_expires_at: null })
              .then(() => toast.show({ tone: "success", message: t("keptPro") }))
              .catch(() => toast.show({ tone: "error", message: t("saveError") }));
          } else {
            router.push("/upgrade");
          }
        }}
      >
        {planFlag === "pro" ? t("keepProBody") : t("keepFreeBody")}
      </ConfirmDialog>

      {/* Xóa buổi ghi: hộp xác nhận, xong thì về thư viện, thông báo có Hoàn tác */}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("deleteTitle")}
        cancelLabel={t("cancel")}
        confirmLabel={t("deleteConfirm")}
        onConfirm={() => void deleteSession()}
      >
        {t("deleteBody", { title: detail.title })}
      </ConfirmDialog>

      {/* Tour làm quen: 3 chú thích nổi (M4-04) */}
      {tourParam && !tourDone && detail.status === "ready" ? (
        <SessionTour
          onDone={() => {
            setTourDone(true);
            void data.account.updateMe({ onboarded_at: dataNow().toISOString() }).catch(() => undefined);
            router.replace(`/s/${detail.id}`, { scroll: false });
          }}
        />
      ) : null}
    </div>
  );
}

function MenuRow({ icon: Icon, label, danger, onClick }: { icon: typeof Pencil; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex min-h-12 w-full items-center gap-3 py-2 text-left text-body text-ink">
        <Icon aria-hidden={true} className={danger ? "size-5 shrink-0 text-tag-risk" : "size-5 shrink-0 text-ink-2"} strokeWidth={1.75} />
        <span className={danger ? "text-tag-risk" : undefined}>{label}</span>
      </button>
    </li>
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
