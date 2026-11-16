"use client";

import { ArrowDown, ArrowUp, Check, ClipboardCopy, Ellipsis, Languages, Pencil, Quote, TriangleAlert, UserRoundCog, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatClock } from "@/components/ribbon/draw";
import { SpeakerName } from "@/components/ui/chips";
import { Button } from "@/components/ui/button";
import { EmptyState, SkeletonParagraph } from "@/components/ui/feedback";
import { SearchField, Switch } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { speakerLabel } from "@/lib/data/localize";
import { data, useData, type Lang, type SessionDetail, type Speaker, type TranscriptSegment } from "@/lib/data";
import { LANG_BADGE } from "@/lib/data/types";
import { cn } from "@/lib/cn";

/*
 * Tab Lời — bản ghi lời nguyên văn (docs/03-screens.md mục 5c, issue M3-01).
 * - Tải riêng bằng getTranscript khi mở tab (Radix Tabs gỡ nội dung tab chưa mở,
 *   nên chỉ vào tab này mới tải — bản ghi lời nặng).
 * - Đoạn đang phát nền --surface-2 và tự cuộn theo; người dùng cuộn tay thì
 *   dừng tự cuộn, hiện nút nổi "Về đoạn đang phát".
 * - M6-02 (issue #44): đoạn khác ngôn ngữ chính có nhãn ngôn ngữ cạnh giờ;
 *   nút "Xem bản dịch" bật dịch cho mọi đoạn khác ngôn ngữ giao diện — bản
 *   dịch nằm dưới câu gốc, chữ nhỏ, màu phụ; từng đoạn có "Dịch đoạn này";
 *   sửa câu gốc thì bản dịch hiện "Cần dịch lại".
 * - Tìm trong lời: tô sáng, đếm "2/5", tới và lùi. Nhấn giữ (hoặc nút ⋯ trên
 *   máy tính): sao chép, sửa lời, đổi người nói, tạo thẻ trích dẫn.
 * - Từ trong từ điển gạch chân chấm; bôi đen một từ hoặc cụm từ để thêm vào từ điển.
 */

type Range = { start: number; end: number };
type Piece = { text: string; kind: "plain" | "match" | "term"; matchIndex?: number };

/** Tất cả chỗ khớp của `needle` trong `hay`, không phân biệt hoa thường, giữ dấu. */
function findAll(hay: string, needle: string): Range[] {
  if (!needle) return [];
  const h = hay.toLocaleLowerCase("vi");
  const n = needle.toLocaleLowerCase("vi");
  const out: Range[] = [];
  let i = h.indexOf(n);
  while (i >= 0) {
    out.push({ start: i, end: i + n.length });
    i = h.indexOf(n, i + n.length);
  }
  return out;
}

/** Chia văn bản thành các mảnh: chỗ khớp tìm kiếm (ưu tiên tô sáng) và từ điển. */
function annotate(text: string, query: string, terms: string[]): Piece[] {
  const matches = findAll(text, query);
  const termRanges: Range[] = [];
  if (!query && terms.length) {
    for (const term of terms) for (const r of findAll(text, term)) termRanges.push(r);
    termRanges.sort((a, b) => a.start - b.start || b.start - b.end - (a.start - a.end));
  }
  const boundaries = [...matches.map((r) => r.start), ...matches.map((r) => r.end), ...termRanges.map((r) => r.start), ...termRanges.map((r) => r.end), text.length];
  const points = [...new Set(boundaries.filter((p) => p > 0 && p < text.length))].sort((a, b) => a - b);

  const pieces: Piece[] = [];
  let pos = 0;
  let localMatch = 0;
  for (const point of [...points, text.length]) {
    if (point > pos) {
      const slice = { start: pos, end: point };
      const m = matches.findIndex((r) => r.start === slice.start && r.end === slice.end);
      const tr = termRanges.findIndex((r) => r.start === slice.start && r.end === slice.end);
      if (m >= 0) pieces.push({ text: text.slice(slice.start, slice.end), kind: "match", matchIndex: localMatch++ });
      else if (tr >= 0 && !matches.some((r) => r.start < slice.end && slice.start < r.end))
        pieces.push({ text: text.slice(slice.start, slice.end), kind: "term" });
      else pieces.push({ text: text.slice(slice.start, slice.end), kind: "plain" });
      pos = point;
    }
  }
  return pieces;
}

export function TranscriptTab({
  detail,
  canPlay,
  currentTime,
  playing,
  onSeek,
  onQuoteCard,
}: {
  detail: SessionDetail;
  canPlay: boolean;
  currentTime: number;
  playing: boolean;
  onSeek: (time: number) => void;
  /** Tạo thẻ trích dẫn từ đoạn lời này (M4-01) */
  onQuoteCard?: (seg: TranscriptSegment) => void;
}) {
  const t = useTranslations("transcript");
  const tr = useTranslations(); // nhãn người nói chưa đặt tên ở cấp gốc (review #41 mục 5)
  const ts = useTranslations("session");
  const toast = useToast();

  const transcript = useData(() => data.sessions.getTranscript(detail.id), [detail.id]);
  const glossary = useData(() => data.account.glossary(), []);

  const [query, setQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  // Từ tìm đổi thì quay về chỗ khớp đầu tiên: chỉnh trạng thái lúc vẽ thay vì effect
  const [prevQuery, setPrevQuery] = useState("");
  if (prevQuery !== query) {
    setPrevQuery(query);
    setActiveMatch(0);
  }
  const [autoFollow, setAutoFollow] = useState(true);
  const [menuSegId, setMenuSegId] = useState<string | null>(null);
  const [reassignSegId, setReassignSegId] = useState<string | null>(null);
  const [editingSegId, setEditingSegId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Bản dịch (M6-02): bật "Xem bản dịch" thì dịch mọi đoạn khác ngôn ngữ
  // giao diện; từng đoạn có "Dịch đoạn này". Lỗi dịch hiện thông báo + Thử lại.
  const locale = useLocale() as Lang;
  const [showTranslation, setShowTranslation] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState(false);

  const segments = useMemo(
    () => [...(transcript.data ?? [])].sort((a, b) => a.start_sec - b.start_sec),
    [transcript.data],
  );
  const segById = useMemo(() => Object.fromEntries(segments.map((s) => [s.id, s])), [segments]);
  const speakerOf = useMemo(() => Object.fromEntries(detail.speakers.map((s) => [s.id, s])), [detail.speakers]);
  /** Buổi có đoạn nói bằng ngôn ngữ khác ngôn ngữ giao diện thì mới hiện hàng "Xem bản dịch" */
  const hasForeign = useMemo(() => segments.some((s) => s.lang !== locale), [segments, locale]);

  const q = query.trim();
  const terms = useMemo(() => (glossary.data ?? []).map((g) => g.term).filter((x) => x.length > 0), [glossary.data]);
  const glossaryActive = q === "" && terms.length > 0;

  /** Đánh số chỗ khớp liên tục trên cả danh sách để tới/lùi. */
  const matchIndex = useMemo(() => {
    if (!q) return null;
    const rows: Array<{ segId: string; range: Range }> = [];
    for (const seg of segments) for (const range of findAll(seg.text, q)) rows.push({ segId: seg.id, range });
    return rows;
  }, [segments, q]);

  /** Đoạn đang phát: đoạn cuối có mốc bắt đầu trước (hoặc đúng) thời điểm hiện tại. */
  const playingSegId = useMemo(() => {
    if (!canPlay) return null;
    if (!playing && currentTime === 0) return null;
    let current: string | null = null;
    for (const s of segments) if (s.start_sec <= currentTime + 0.5) current = s.id;
    return current;
  }, [segments, currentTime, playing, canPlay]);

  const listRef = useRef<HTMLUListElement>(null);
  const followSegRef = useRef<string | null>(null);

  // Tự cuộn theo đoạn đang phát (cuộn tức thời — trang bật cuộn mượt, xem AGENTS.md)
  useEffect(() => {
    if (!autoFollow || !playingSegId || playingSegId === followSegRef.current) return;
    followSegRef.current = playingSegId;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-seg="${playingSegId}"]`);
    el?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [playingSegId, autoFollow]);

  // Tới/lùi chỗ khớp: cuộn tới đoạn chứa chỗ khớp hiện tại
  useEffect(() => {
    if (!matchIndex || !matchIndex.length) return;
    const { segId } = matchIndex[Math.min(activeMatch, matchIndex.length - 1)];
    const el = listRef.current?.querySelector<HTMLElement>(`[data-seg="${segId}"]`);
    el?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [activeMatch, matchIndex]);

  // Từ tìm đổi thì quay về chỗ khớp đầu tiên

  async function translate(lang: Lang, segmentIds?: string[]) {
    setTranslating(true);
    setTranslateError(false);
    try {
      await data.sessions.translateSegments(detail.id, lang, segmentIds);
      transcript.reload();
    } catch {
      setTranslateError(true);
    } finally {
      setTranslating(false);
    }
  }

  async function copySegment(seg: TranscriptSegment) {
    try {
      await navigator.clipboard.writeText(seg.text);
      toast.show({ tone: "success", message: t("copied") });
    } catch {
      toast.show({ tone: "error", message: ts("saveError") });
    }
  }

  const menuSeg = menuSegId ? segById[menuSegId] : null;
  const reassignSeg = reassignSegId ? segById[reassignSegId] : null;

  return (
    <div className="max-w-[68ch]">
      {/* Ô tìm + đếm chỗ khớp + tới lùi */}
      <div className="flex items-center gap-2">
        <SearchField
          value={query}
          onChange={setQuery}
          label={t("searchLabel")}
          clearLabel={t("clearSearch")}
          placeholder={t("searchPlaceholder")}
          className="min-w-0 flex-1"
        />
        {matchIndex && matchIndex.length > 0 ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <span
              aria-label={t("matchCount", { current: Math.min(activeMatch + 1, matchIndex.length), total: matchIndex.length })}
              className="px-1 text-caption font-medium tabular-nums text-ink-2"
            >
              {Math.min(activeMatch + 1, matchIndex.length)}/{matchIndex.length}
            </span>
            <Button
              variant="ghost"
              icon={ArrowUp}
              iconOnly
              aria-label={t("prevMatch")}
              onClick={() => setActiveMatch((i) => (i - 1 + matchIndex.length) % matchIndex.length)}
            />
            <Button
              variant="ghost"
              icon={ArrowDown}
              iconOnly
              aria-label={t("nextMatch")}
              onClick={() => setActiveMatch((i) => (i + 1) % matchIndex.length)}
            />
          </div>
        ) : null}
      </div>

      {q && matchIndex && matchIndex.length === 0 ? (
        <p role="status" className="mt-4 text-body text-ink-2">
          {t("noMatch", { query: q })}
        </p>
      ) : null}

      {/* Xem bản dịch (M6-02): chỉ hiện khi buổi có đoạn khác ngôn ngữ giao diện */}
      {hasForeign ? (
        <div className="mt-3 flex items-center gap-3">
          <Switch
            checked={showTranslation}
            onCheckedChange={(v) => {
              setShowTranslation(v);
              if (v && !translating) void translate(locale);
            }}
            label={t(showTranslation ? "hideTranslation" : "showTranslation")}
          />
          {translating ? (
            <p role="status" className="text-small text-ink-3">{t("translating")}</p>
          ) : null}
        </div>
      ) : null}
      {translateError ? (
        <div role="alert" className="mt-2 flex items-center gap-2 rounded-control border border-tag-risk bg-tag-risk-bg px-3 py-2">
          <TriangleAlert aria-hidden={true} className="size-4 shrink-0 text-tag-risk" strokeWidth={2} />
          <p className="min-w-0 flex-1 text-small text-tag-risk">{t("translateFail")}</p>
          <Button variant="secondary" className="h-9" onClick={() => void translate(locale)}>
            {ts("retry")}
          </Button>
        </div>
      ) : null}

      {detail.storage_status === "essence_only" ? (
        <EmptyState drawing={<span />} message={t("essenceEmpty")} />
      ) : transcript.initialLoading ? (
        <div className="mt-5" aria-busy={true} aria-label={t("loading")}>
          <SkeletonParagraph lines={6} />
          <SkeletonParagraph lines={5} />
        </div>
      ) : transcript.data ? (
        <TranscriptList
          listRef={listRef}
          segments={segments}
          speakerOf={speakerOf}
          primaryLang={detail.primary_language}
          uiLang={locale}
          showTranslation={showTranslation}
          onTranslateSegment={(segId) => void translate(locale, [segId])}
          query={q}
          glossaryActive={glossaryActive}
          terms={terms}
          matchIndex={matchIndex}
          activeMatch={activeMatch}
          playingSegId={playingSegId}
          editingSegId={editingSegId}
          editValue={editValue}
          setEditValue={setEditValue}
          canPlay={canPlay}
          onSeek={onSeek}
          onOpenMenu={setMenuSegId}
          onCancelEdit={() => setEditingSegId(null)}
          onSaveEdit={async () => {
            const seg = editingSegId ? segById[editingSegId] : null;
            const next = editValue.trim();
            if (!seg || !next || next === seg.text) {
              setEditingSegId(null);
              return;
            }
            try {
              await data.sessions.updateSegment(detail.id, seg.id, next);
              setEditingSegId(null);
              toast.show({ tone: "success", message: t("editSaved") });
            } catch {
              toast.show({ tone: "error", message: ts("saveError") });
            }
          }}
          onUserScroll={() => setAutoFollow(false)}
        />
      ) : (
        <EmptyState
          drawing={<span />}
          message={t("errorLoad")}
          action={<Button onClick={transcript.reload}>{ts("retry")}</Button>}
        />
      )}

      {/* Dừng tự cuộn: nút nổi quay về đoạn đang phát (nằm trên trình phát nổi) */}
      {!autoFollow && playingSegId ? (
        <div className="pointer-events-none fixed inset-x-3 bottom-[calc(136px+env(safe-area-inset-bottom))] z-20 flex justify-center lg:inset-x-auto lg:bottom-24 lg:left-1/2 lg:-translate-x-1/2">
          <Button
            className="pointer-events-auto shadow-float"
            onClick={() => {
              followSegRef.current = null;
              setAutoFollow(true);
              const el = listRef.current?.querySelector<HTMLElement>(`[data-seg="${playingSegId}"]`);
              el?.scrollIntoView({ block: "center", behavior: "instant" });
            }}
          >
            {t("jumpPlaying")}
          </Button>
        </div>
      ) : null}

      {/* Bảng thao tác với một đoạn: nhấn giữ trên điện thoại, nút ⋯ trên máy tính */}
      <Sheet
        open={!!menuSeg}
        onOpenChange={(open) => !open && setMenuSegId(null)}
        title={menuSeg ? t("actions", { time: formatClock(menuSeg.start_sec) }) : ""}
        description={menuSeg?.text}
        size="half"
      >
        {menuSeg ? (
          <ul className="divide-y divide-line">
            <ActionRow
              icon={ClipboardCopy}
              label={t("copy")}
              onClick={() => {
                setMenuSegId(null);
                void copySegment(menuSeg);
              }}
            />
            <ActionRow
              icon={Pencil}
              label={t("edit")}
              onClick={() => {
                setEditingSegId(menuSeg.id);
                setEditValue(menuSeg.text);
                setMenuSegId(null);
              }}
            />
            {menuSeg.lang !== locale || menuSeg.translations[locale] ? (
              <ActionRow
                icon={Languages}
                label={t("translateSegment")}
                onClick={() => {
                  const id = menuSeg.id;
                  setMenuSegId(null);
                  setShowTranslation(true);
                  void translate(locale, [id]);
                }}
              />
            ) : null}
            <ActionRow
              icon={UserRoundCog}
              label={t("reassign")}
              onClick={() => {
                setReassignSegId(menuSeg.id);
                setMenuSegId(null);
              }}
            />
            <ActionRow
              icon={Quote}
              label={t("quoteCard")}
              onClick={() => {
                const seg = menuSeg;
                setMenuSegId(null);
                onQuoteCard?.(seg);
              }}
            />
          </ul>
        ) : null}
      </Sheet>

      {/* Đổi người nói: chọn trong người nói của buổi ghi */}
      <Sheet
        open={!!reassignSeg}
        onOpenChange={(open) => !open && setReassignSegId(null)}
        title={t("reassignTitle")}
        description={reassignSeg ? `${formatClock(reassignSeg.start_sec)} — ${reassignSeg.text}` : undefined}
        size="half"
      >
        {reassignSeg ? (
          <ul className="divide-y divide-line">
            {detail.speakers.map((sp) => (
              <li key={sp.id}>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await data.sessions.reassignSegment(detail.id, reassignSeg.id, sp.id);
                      setReassignSegId(null);
                      toast.show({ tone: "success", message: t("reassignSaved") });
                    } catch {
                      toast.show({ tone: "error", message: ts("saveError") });
                    }
                  }}
                  className="flex w-full items-center gap-3 py-3 text-left"
                >
                  <SpeakerName colorIndex={sp.color_index} name={speakerLabel(sp, detail.speakers, tr)} named={true} className="flex-1" />
                  {reassignSeg.speaker_id === sp.id ? (
                    <Check aria-hidden={true} className="size-5 shrink-0 text-sen" strokeWidth={2} />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Sheet>
    </div>
  );
}

function ActionRow({ icon: Icon, label, onClick }: { icon: typeof Pencil; label: string; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-12 w-full items-center gap-3 py-2 text-left text-body text-ink"
      >
        <Icon aria-hidden={true} className="size-5 shrink-0 text-ink-2" strokeWidth={1.75} />
        {label}
      </button>
    </li>
  );
}

/* ---------- Danh sách đoạn lời ---------- */

type ListProps = {
  listRef: React.RefObject<HTMLUListElement | null>;
  segments: TranscriptSegment[];
  speakerOf: Record<string, Speaker>;
  /** Ngôn ngữ nói chính của buổi: đoạn khác ngôn ngữ này có nhãn (M6-02) */
  primaryLang: Lang;
  /** Ngôn ngữ giao diện: bản dịch hiển thị theo ngôn ngữ này */
  uiLang: Lang;
  showTranslation: boolean;
  onTranslateSegment: (segId: string) => void;
  query: string;
  glossaryActive: boolean;
  terms: string[];
  matchIndex: Array<{ segId: string; range: Range }> | null;
  activeMatch: number;
  playingSegId: string | null;
  editingSegId: string | null;
  editValue: string;
  setEditValue: (v: string) => void;
  canPlay: boolean;
  onSeek: (time: number) => void;
  onOpenMenu: (segId: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onUserScroll: () => void;
};

function TranscriptList(props: ListProps) {
  const t = useTranslations("transcript");
  const tr = useTranslations(); // nhãn người nói chưa đặt tên ở cấp gốc (review #41 mục 5)
  const ts = useTranslations("session");
  const {
    listRef,
    segments,
    speakerOf,
    primaryLang,
    uiLang,
    showTranslation,
    onTranslateSegment,
    query,
    glossaryActive,
    terms,
    matchIndex,
    activeMatch,
    playingSegId,
    editingSegId,
    editValue,
    setEditValue,
    canPlay,
    onSeek,
    onOpenMenu,
    onCancelEdit,
    onSaveEdit,
    onUserScroll,
  } = props;

  const holdTimer = useRef<number>(0);
  const holdMoved = useRef(false);
  const holdFired = useRef(false);
  const holdPos = useRef({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState("");

  function holdStart(segId: string, e: React.PointerEvent) {
    holdMoved.current = false;
    holdFired.current = false;
    holdPos.current = { x: e.clientX, y: e.clientY };
    holdTimer.current = window.setTimeout(() => {
      if (!holdMoved.current) {
        holdFired.current = true;
        onOpenMenu(segId);
      }
    }, 500);
  }
  function holdMove(e: React.PointerEvent) {
    const dx = e.clientX - holdPos.current.x;
    const dy = e.clientY - holdPos.current.y;
    if (dx * dx + dy * dy > 144) holdMoved.current = true;
  }
  function holdEnd() {
    window.clearTimeout(holdTimer.current);
  }

  // Bôi đen một từ hoặc cụm từ -> hiện nút "Thêm vào từ điển"
  function readSelection() {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    setSelectedText(text.length > 0 && text.length <= 80 && sel && !sel.isCollapsed ? text : "");
  }

  const activeRow = matchIndex && matchIndex.length ? matchIndex[Math.min(activeMatch, matchIndex.length - 1)] : null;

  return (
    <>
      <ul
        ref={listRef}
        aria-label={t("listLabel")}
        onWheel={onUserScroll}
        onTouchMove={onUserScroll}
        onMouseUp={readSelection}
        onTouchEnd={readSelection}
        className="mt-3 select-text"
      >
        {segments.map((seg) => {
          const sp = speakerOf[seg.speaker_id];
          const isPlaying = playingSegId === seg.id;
          const editing = editingSegId === seg.id;
          const pieces = annotate(seg.text, query, glossaryActive ? terms : []);
          const isActiveSeg = activeRow?.segId === seg.id;
          return (
            <li
              key={seg.id}
              data-seg={seg.id}
              className={cn(
                "flex gap-3 border-b border-line py-3.5 transition-colors ease-noteim duration-(--t-base)",
                isPlaying && "bg-surface-2",
              )}
            >
              {/* Vạch dọc màu người nói */}
              <span
                aria-hidden={true}
                className="w-1 shrink-0 self-stretch rounded-pill"
                style={{ backgroundColor: `var(--speaker-${((sp?.color_index ?? 0) % 6) + 1})` }}
              />
              {editing ? (
                <form
                  className="min-w-0 flex-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    onSaveEdit();
                  }}
                >
                  <p className="text-small font-medium text-ink-3">{t("editHint")}</p>
                  <textarea
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") onCancelEdit();
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        onSaveEdit();
                      }
                    }}
                    rows={3}
                    aria-label={t("edit")}
                    className="mt-1 w-full rounded-control border border-dien bg-surface px-3 py-2 text-body text-ink focus-visible:outline-none"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button type="submit" variant="primary" icon={Check}>
                      {ts("save")}
                    </Button>
                    <Button variant="ghost" icon={X} onClick={onCancelEdit}>
                      {ts("cancel")}
                    </Button>
                  </div>
                </form>
              ) : (
                <div
                  className="min-w-0 flex-1"
                  onPointerDown={(e) => holdStart(seg.id, e)}
                  onPointerMove={holdMove}
                  onPointerUp={holdEnd}
                  onPointerCancel={holdEnd}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 truncate text-small font-medium text-ink-2">
                      {sp ? speakerLabel(sp, Object.values(speakerOf), tr) : "—"}
                    </span>
                    {/* Đoạn khác ngôn ngữ chính: nhãn ngôn ngữ nhỏ cạnh giờ (M6-02) */}
                    {seg.lang !== primaryLang ? (
                      <span lang={seg.lang} className="shrink-0 rounded-pill bg-surface-2 px-1.5 text-caption font-medium text-ink-2">
                        {LANG_BADGE[seg.lang]}
                      </span>
                    ) : null}
                    <span className="ml-auto shrink-0 text-caption tabular-nums text-ink-3">{formatClock(seg.start_sec)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      // Nhấn giữ vừa mở bảng thao tác thì không phát luôn
                      if (holdFired.current) {
                        holdFired.current = false;
                        return;
                      }
                      if (canPlay) onSeek(seg.start_sec);
                    }}
                    aria-label={canPlay ? t("playFrom", { time: formatClock(seg.start_sec) }) : undefined}
                    aria-current={isPlaying ? "true" : undefined}
                    className="mt-0.5 block w-full text-left text-body text-ink"
                  >
                    {(() => {
                      let offset = 0;
                      return pieces.map((piece, i) => {
                        const start = offset;
                        offset += piece.text.length;
                        if (piece.kind === "match") {
                          const active = isActiveSeg && activeRow && start === activeRow.range.start;
                          return (
                            <mark
                              key={i}
                              aria-current={active ? "true" : undefined}
                              className={cn(
                                "rounded-control px-0.5 text-inherit",
                                active ? "bg-tag-pending text-tag-pending" : "bg-tag-pending-bg",
                              )}
                            >
                              {piece.text}
                            </mark>
                          );
                        }
                        if (piece.kind === "term")
                          return (
                            <u key={i} className="decoration-dotted underline-offset-4">
                              {piece.text}
                            </u>
                          );
                        return <span key={i}>{piece.text}</span>;
                      });
                    })()}
                    {seg.edited ? (
                      <span className="ml-2 inline-flex items-center gap-1 align-middle text-caption font-medium text-ink-3">
                        <span aria-hidden={true} className="size-1.5 rounded-pill bg-ink-3" />
                        {ts("edited")}
                      </span>
                    ) : null}
                  </button>
                  {/* Bản dịch nằm dưới câu gốc, chữ nhỏ hơn, màu phụ (M6-02) */}
                  {showTranslation ? <TranslationBlock seg={seg} uiLang={uiLang} onTranslate={onTranslateSegment} /> : null}
                </div>
              )}

              {/* Nút ⋯ cho máy tính; điện thoại dùng nhấn giữ */}
              <button
                type="button"
                onClick={() => onOpenMenu(seg.id)}
                aria-label={t("actions", { time: formatClock(seg.start_sec) })}
                className="hidden h-9 w-9 shrink-0 self-center items-center justify-center rounded-control text-ink-3 hover:bg-surface-2 hover:text-ink lg:flex"
              >
                <Ellipsis aria-hidden={true} className="size-4" strokeWidth={2} />
              </button>
            </li>
          );
        })}
      </ul>

      {/* Chọn chữ trong bản ghi lời để thêm vào từ điển tên riêng */}
      {selectedText ? (
        <GlossaryAddBar
          term={selectedText}
          label={t("glossaryAdd")}
          onDone={(term) => {
            const sel = window.getSelection();
            sel?.removeAllRanges();
            setSelectedText("");
            return term;
          }}
        />
      ) : null}
    </>
  );
}

/** Khối bản dịch của một đoạn: hiển thị bản dịch có sẵn, nhãn "Bản dịch mẫu"
 * hoặc "Cần dịch lại"; đoạn chưa có bản dịch thì nút dịch nhanh (M6-02). */
function TranslationBlock({
  seg,
  uiLang,
  onTranslate,
}: {
  seg: TranscriptSegment;
  uiLang: Lang;
  onTranslate: (segId: string) => void;
}) {
  const t = useTranslations("transcript");
  const ts = useTranslations("session");
  const trEntry = seg.translations[uiLang];
  if (!trEntry) {
    return (
      <button
        type="button"
        onClick={() => onTranslate(seg.id)}
        className="mt-1 inline-flex min-h-9 items-center gap-1.5 rounded-control text-caption font-medium text-dien hover:underline"
      >
        <Languages aria-hidden={true} className="size-3.5" strokeWidth={1.75} />
        {t("translateSegment")}
      </button>
    );
  }
  return (
    <div lang={uiLang} className="mt-1.5 border-l-2 border-line pl-3">
      {trEntry.sample ? <p className="text-caption font-medium text-ink-3">{t("sampleTranslation")}</p> : null}
      <p className="text-small text-ink-2">{trEntry.text}</p>
      {trEntry.stale ? (
        <div className="mt-1 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-caption font-medium text-tag-pending">
            <span aria-hidden={true} className="size-1.5 rounded-pill bg-tag-pending" />
            {t("translationStale")}
          </span>
          <button
            type="button"
            onClick={() => onTranslate(seg.id)}
            className="inline-flex min-h-6 items-center text-caption font-medium text-dien hover:underline"
          >
            {ts("retry")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function GlossaryAddBar({
  term,
  label,
  onDone,
}: {
  term: string;
  label: string;
  onDone: (term: string) => string;
}) {
  const t = useTranslations("transcript");
  const ts = useTranslations("session");
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      const saved = await data.account.addGlossaryTerm(term);
      onDone(saved.term);
      toast.show({ tone: "success", message: t("glossaryAdded", { term: saved.term }) });
    } catch {
      toast.show({ tone: "error", message: ts("saveError") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(136px+env(safe-area-inset-bottom))] z-20 flex justify-center lg:inset-x-auto lg:bottom-24 lg:left-1/2 lg:-translate-x-1/2">
      <Button className="pointer-events-auto shadow-float" loading={busy} onClick={() => void add()}>
        {label}: “{term}”
      </Button>
    </div>
  );
}
