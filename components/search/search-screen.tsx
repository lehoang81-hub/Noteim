"use client";

import { ArrowLeft, Clock, Search as SearchIcon, Users, X } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatClock } from "@/components/ribbon/draw";
import { Button } from "@/components/ui/button";
import { EmptyState, SkeletonRow } from "@/components/ui/feedback";
import { SearchField } from "@/components/ui/form";
import { data, useData, type SearchResult as SearchResultData, type Session } from "@/lib/data";
import { durationParts, weekdayDate } from "@/lib/format";
import { templateName } from "@/lib/data/localize";

/*
 * Tìm kiếm (docs/03-screens.md mục 11, issue M4-02).
 * - Chưa gõ: tìm gần đây (lưu 8 từ, xóa từng mục và xóa hết), gợi ý theo người
 *   và theo mẫu.
 * - Gõ (chờ 250ms): kết quả nhóm Buổi ghi, Trong lời nói, Việc cần làm.
 *   "Trong lời nói" hiện đoạn trích tô sáng + tên buổi + mốc; chạm mở tab Lời
 *   đúng đoạn và tua tới mốc.
 * - So khớp không phân biệt hoa thường, không dấu ("gia cao" ra "giá cao").
 * - Free: tìm tiêu đề, tóm tắt, việc; nhóm "Trong lời nói" khóa với nút Pro.
 */

const RECENT_KEY = "noteim-search-recent";
const MAX_RECENT = 8;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    // Không lưu được thì chỉ mất gợi ý gần đây
  }
}

/** So khớp bỏ dấu, không phân biệt hoa thường. */
function foldVi(s: string): string {
  return s
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

/** Cắt đoạn trích quanh chỗ khớp đầu tiên, kèm vị trí tô sáng tương đối. */
function excerptAround(text: string, query: string, radius = 60): { text: string; matchStart: number; matchLen: number } {
  const folded = foldVi(text);
  const at = folded.indexOf(foldVi(query));
  if (at < 0) return { text: text.slice(0, radius * 2), matchStart: -1, matchLen: 0 };
  const from = Math.max(0, at - radius);
  const to = Math.min(text.length, at + query.length + radius);
  const prefix = from > 0 ? "…" : "";
  const suffix = to < text.length ? "…" : "";
  return {
    text: `${prefix}${text.slice(from, to)}${suffix}`,
    matchStart: at - from + prefix.length,
    matchLen: query.length,
  };
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const ex = excerptAround(text, query);
  if (ex.matchStart < 0) return <>{ex.text}</>;
  return (
    <>
      {ex.text.slice(0, ex.matchStart)}
      <mark className="rounded-control bg-tag-pending-bg px-0.5">{ex.text.slice(ex.matchStart, ex.matchStart + ex.matchLen)}</mark>
      {ex.text.slice(ex.matchStart + ex.matchLen)}
    </>
  );
}

function durationLabel(sec: number, fmt: (h: number, m: string) => string): string {
  const { h, m } = durationParts(sec);
  return h > 0 ? fmt(h, String(m).padStart(2, "0")) : fmt(0, String(m));
}

export function SearchScreen() {
  const t = useTranslations("search");
  const locale = useLocale();
  const tl = useTranslations("library");
  const me = useData(() => data.account.me(), []);
  const templates = useData(() => data.account.templates(), []);
  const contacts = useData(() => data.account.contacts(), []);
  const sessions = useData(() => data.sessions.list(), []);
  const plan = me.data?.plan ?? "free";

  const [raw, setRaw] = useState("");
  const [query, setQuery] = useState(""); // đã qua chờ 250ms
  const [recent, setRecent] = useState<string[]>([]);
  const mounted = useRef(false);

  // Lấy ô tìm lấy nét sẵn và danh sách tìm gần đây sau khung vẽ đầu
  // (đọc localStorage trong timer để tránh lệch hydrate và setState trong effect)
  useEffect(() => {
    const id = window.setTimeout(() => {
      setRecent(readRecent());
      mounted.current = true;
      document.querySelector<HTMLInputElement>("input[type=search]")?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // Chờ 250ms sau lần gõ cuối rồi mới tìm (bản thân timer là bất đồng bộ)
  useEffect(() => {
    const id = window.setTimeout(() => setQuery(raw.trim()), 250);
    return () => window.clearTimeout(id);
  }, [raw]);

  const committed = useRef("");
  const results = useData<SearchResultData | null>(
    () => (query ? data.sessions.search(query) : Promise.resolve(null)),
    [query],
  );

  // Lưu từ vừa tìm vào danh sách gần đây (tối đa 8, không trùng)
  useEffect(() => {
    if (!mounted.current || !query || query === committed.current) return;
    committed.current = query;
    setRecent((list) => {
      const next = [query, ...list.filter((x) => foldVi(x) !== foldVi(query))].slice(0, MAX_RECENT);
      saveRecent(next);
      return next;
    });
  }, [query]);

  /** Gợi ý theo người: liên hệ xuất hiện trong người tham gia của các buổi ghi. */
  const people = useMemo(() => {
    const ids = new Set((sessions.data ?? []).flatMap((s) => s.participant_contact_ids));
    return (contacts.data ?? []).filter((c) => ids.has(c.id));
  }, [contacts.data, sessions.data]);

  const usedTemplates = useMemo(() => {
    const ids = new Set((sessions.data ?? []).map((s) => s.template_id));
    return (templates.data ?? []).filter((tp) => ids.has(tp.id));
  }, [templates.data, sessions.data]);

  const titleById = useMemo(
    () => Object.fromEntries((sessions.data ?? []).map((s) => [s.id, s.title])),
    [sessions.data],
  );

  const r = results.data;
  const noResult = query && r && !r.sessions.length && !r.segments.length && !r.tasks.length;

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl">
      <header className="flex min-h-14 items-center gap-1 px-page pt-2 lg:px-8 lg:pt-4">
        <Link
          href="/"
          aria-label={tl("list")}
          className="-ml-2 flex size-11 items-center justify-center rounded-control text-ink hover:bg-surface-2"
        >
          <ArrowLeft aria-hidden={true} className="size-5" strokeWidth={1.75} />
        </Link>
        <SearchField
          value={raw}
          onChange={setRaw}
          label={t("label")}
          clearLabel={t("clear")}
          placeholder={t("placeholder")}
          className="min-w-0 flex-1"
        />
      </header>

      <div className="px-page pb-40 pt-4 lg:px-8">
        {/* Chưa gõ: tìm gần đây + gợi ý theo người và theo mẫu */}
        {!query ? (
          <div>
            {recent.length ? (
              <section aria-label={t("recent")}>
                <div className="flex items-center gap-3">
                  <h2 className="text-small font-semibold text-ink-2">{t("recent")}</h2>
                  <button
                    type="button"
                    onClick={() => {
                      setRecent([]);
                      saveRecent([]);
                    }}
                    className="ml-auto text-caption font-medium text-ink-3 underline underline-offset-2 hover:text-ink"
                  >
                    {t("clearAll")}
                  </button>
                </div>
                <ul className="mt-2 divide-y divide-line">
                  {recent.map((term) => (
                    <li key={term} className="flex items-center">
                      <button
                        type="button"
                        onClick={() => setRaw(term)}
                        className="flex min-h-12 flex-1 items-center gap-3 py-2 text-left text-body text-ink"
                      >
                        <Clock aria-hidden={true} className="size-5 shrink-0 text-ink-3" strokeWidth={1.75} />
                        <span className="min-w-0 flex-1 truncate">{term}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = recent.filter((x) => x !== term);
                          setRecent(next);
                          saveRecent(next);
                        }}
                        aria-label={t("removeOne", { term })}
                        className="flex size-11 shrink-0 items-center justify-center rounded-control text-ink-3 hover:bg-surface-2 hover:text-ink"
                      >
                        <X aria-hidden={true} className="size-4" strokeWidth={2} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {people.length ? (
              <section aria-label={t("byPeople")} className="mt-6">
                <h2 className="flex items-center gap-2 text-small font-semibold text-ink-2">
                  <Users aria-hidden={true} className="size-4" strokeWidth={1.75} />
                  {t("byPeople")}
                </h2>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {people.map((c) => (
                    <li key={c.id}>
                      <Button variant="secondary" className="h-11" onClick={() => setRaw(c.name)}>
                        {c.name}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {usedTemplates.length ? (
              <section aria-label={t("byTemplate")} className="mt-6">
                <h2 className="flex items-center gap-2 text-small font-semibold text-ink-2">
                  <SearchIcon aria-hidden={true} className="size-4" strokeWidth={1.75} />
                  {t("byTemplate")}
                </h2>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {usedTemplates.map((tp) => (
                    <li key={tp.id}>
                      <Button variant="secondary" className="h-11" onClick={() => setRaw(templateName(tp, locale))}>
                        {templateName(tp, locale)}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {!recent.length && !people.length && !usedTemplates.length ? (
              <EmptyState drawing={<span />} message={t("emptyHint")} />
            ) : null}
          </div>
        ) : results.initialLoading ? (
          <div aria-busy={true} className="mt-2">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : noResult ? (
          <EmptyState drawing={<span />} message={t("noResult", { query })} />
        ) : r ? (
          <div className="flex flex-col gap-8">
            <Group title={t("groupSessions")} count={r.sessions.length}>
              {r.sessions.map((s: Session) => (
                <li key={s.id}>
                  <Link href={`/s/${s.id}`} className="flex min-h-12 flex-col justify-center gap-0.5 py-2 hover:opacity-80">
                    <span className="text-body-strong font-semibold text-ink">{s.title}</span>
                    <span className="text-small text-ink-3">
                      {weekdayDate(s.created_at, locale)}, {durationLabel(s.duration_sec, (h, m) => (h > 0 ? tl("hours", { h, m }) : tl("minutes", { m: Number(m) })))}
                    </span>
                  </Link>
                </li>
              ))}
            </Group>

            <Group
              title={t("groupTranscript")}
              count={plan === "free" ? undefined : r.segments.length}
              lock={plan === "free" ? <Link href="/upgrade" className="inline-flex h-11 items-center gap-2 rounded-control border border-line bg-surface px-4 text-small font-semibold text-ink hover:bg-surface-2">{t("transcriptPro")}</Link> : undefined}
            >
              {plan === "pro"
                ? r.segments.slice(0, 12).map(({ session_id, segment }) => (
                    <li key={`${session_id}-${segment.id}`}>
                      <Link href={`/s/${session_id}?tab=transcript&t=${segment.start_sec}`} className="block py-2.5 hover:opacity-80">
                        <span className="block text-body text-ink">
                          <Highlighted text={segment.text} query={query} />
                        </span>
                        <span className="mt-0.5 block text-small text-ink-3">
                          {titleById[session_id] ?? ""}, {formatClock(segment.start_sec)}
                        </span>
                      </Link>
                    </li>
                  ))
                : null}
            </Group>

            <Group title={t("groupTasks")} count={r.tasks.length}>
              {r.tasks.map((task) => (
                <li key={task.id}>
                  <Link
                    href={task.timestamp_sec ? `/s/${task.session_id}?tab=tasks&t=${task.timestamp_sec}` : `/s/${task.session_id}?tab=tasks`}
                    className="flex min-h-12 flex-col justify-center py-2 hover:opacity-80"
                  >
                    <span className="text-body text-ink">{task.task}</span>
                    <span className="text-small text-ink-3">{titleById[task.session_id] ?? ""}</span>
                  </Link>
                </li>
              ))}
            </Group>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Group({
  title,
  count,
  lock,
  children,
}: {
  title: string;
  count?: number;
  lock?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <h2 className="text-small font-semibold text-ink-2">
        {title}
        {count !== undefined ? <span className="ml-2 font-normal tabular-nums text-ink-3">{count}</span> : null}
      </h2>
      {lock ? <div className="mt-3 rounded-block border border-line p-4 text-center">{lock}</div> : <ul className="mt-1 divide-y divide-line">{children}</ul>}
    </section>
  );
}
