"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { TaskRow } from "@/components/session/task-row";
import { FilterChip } from "@/components/ui/chips";
import { EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatClock } from "@/components/ribbon/draw";
import { data, dataNow, useData, type ActionItem, type Lang } from "@/lib/data";
import { dayDiff, endOfDay, shortDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { TopBar } from "@/components/shell/app-shell";

/*
 * Việc cần làm của mọi buổi (docs/03-screens.md mục 8, issue M3-04).
 * - Gom việc từ mọi buổi ghi qua data.tasks.listAll, nhóm: Quá hạn, Hôm nay,
 *   Tuần này, Sau đó, Chưa có hạn, Đã xong (thu gọn mặc định); ngày so với dataNow().
 * - Lọc: Việc của tôi, Tôi đã giao, Tất cả.
 * - Mỗi hàng có tên buổi ghi gốc; chạm thì mở buổi ghi ở tab Việc và tua tới mốc.
 * - Máy tính: một cột rộng tối đa 720px.
 */

type Filter = "mine" | "delegated" | "all";
const MY_CONTACT_ID = "c-me";

export default function TasksPage() {
  const t = useTranslations("tasksPage");
  const ts = useTranslations("session");
  // Nhãn "Bạn" của chính người dùng theo ngôn ngữ giao diện (review #41 mục 5)
  const tr = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const now = dataNow();
  // Trang Việc hiển thị theo ngôn ngữ báo cáo mặc định (M6-03)
  const me = useData(() => data.account.me(), []);
  const reportLang = me.data?.default_report_language ?? (locale as Lang);
  const tasks = useData(() => data.tasks.listAll({ lang: reportLang }), [reportLang]);
  const sessions = useData(() => data.sessions.list(), []);
  const contacts = useData(() => data.account.contacts(), []);
  const [filter, setFilter] = useState<Filter>("all");
  const [doneOpen, setDoneOpen] = useState(false);

  const nameOf = useMemo(
    // Liên hệ "c-me" là chính người dùng: role trong fixture là nhãn hệ thống
    // tiếng Việt ("Bạn"), hiển thị qua speakerYou (review #41 mục 5)
    () => Object.fromEntries((contacts.data ?? []).map((c) => [c.id, c.id === MY_CONTACT_ID ? tr("speakerYou") : c.name])),
    [contacts.data, tr],
  );

  const sessionTitle = useMemo(
    () => Object.fromEntries((sessions.data ?? []).map((s) => [s.id, s.title])),
    [sessions.data],
  );

  const filtered = useMemo(() => {
    const list = tasks.data ?? [];
    if (filter === "mine") return list.filter((a) => a.assignee_contact_id === MY_CONTACT_ID);
    if (filter === "delegated")
      return list.filter((a) => a.assignee_contact_id && a.assignee_contact_id !== MY_CONTACT_ID);
    return list;
  }, [tasks.data, filter]);

  const isOverdue = (a: ActionItem) => !a.done && !!a.due_date && endOfDay(a.due_date) < now;

  const groups = useMemo(() => {
    const open = filtered.filter((a) => !a.done);
    const done = filtered.filter((a) => a.done);
    const bucket = (list: ActionItem[]) =>
      [...list].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || a.task.localeCompare(b.task, "vi"));
    return {
      overdue: bucket(open.filter((a) => isOverdue(a))),
      today: bucket(
        open.filter((a) => a.due_date && !isOverdue(a) && dayDiff(now, endOfDay(a.due_date)) === 0),
      ),
      week: bucket(
        open.filter((a) => {
          if (!a.due_date || isOverdue(a)) return false;
          const d = dayDiff(now, endOfDay(a.due_date));
          return d >= 1 && d <= 7;
        }),
      ),
      later: bucket(
        open.filter((a) => a.due_date && !isOverdue(a) && dayDiff(now, endOfDay(a.due_date)) > 7),
      ),
      noDue: bucket(open.filter((a) => !a.due_date)),
      done: bucket(done),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, now]);

  async function toggle(item: ActionItem, isUndo = false) {
    try {
      const updated = await data.tasks.toggleDone(item.id);
      if (!isUndo)
        toast.show({
          tone: "success",
          message: updated.done ? ts("taskDone") : ts("taskUndone"),
          action: { label: ts("undo"), onClick: () => void toggle(updated, true) },
        });
    } catch {
      toast.show({ tone: "error", message: ts("saveError") });
    }
  }

  function openInSession(a: ActionItem) {
    const params = new URLSearchParams({ tab: "tasks" });
    if (a.timestamp_sec !== null) params.set("t", String(a.timestamp_sec));
    router.push(`/s/${a.session_id}?${params.toString()}`);
  }

  const loading = tasks.initialLoading || sessions.initialLoading;

  return (
    <div className="min-h-dvh">
      <TopBar title={t("title")} />
      <div className="mx-auto w-full max-w-[720px] px-page pt-1 lg:px-0">
        {/* Bộ lọc */}
        <div className="flex gap-2 overflow-x-auto pb-1 pt-2 [scrollbar-width:none]">
          {(
            [
              { value: "mine" as const, label: t("filterMine") },
              { value: "delegated" as const, label: t("filterDelegated") },
              { value: "all" as const, label: t("filterAll") },
            ]
          ).map((f) => (
            <FilterChip key={f.value} selected={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label}
            </FilterChip>
          ))}
        </div>

        {loading ? (
          <div className="mt-4 flex flex-col gap-3" aria-busy={true}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-4 animate-pulse rounded-pill bg-surface-2 motion-reduce:animate-none" style={{ width: `${90 - i * 12}%` }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            drawing={<span />}
            message={(tasks.data ?? []).length === 0 ? t("empty") : t("emptyFilter")}
          />
        ) : (
          <div className="pb-40">
            {(
              [
                { key: "overdue", items: groups.overdue },
                { key: "today", items: groups.today },
                { key: "week", items: groups.week },
                { key: "later", items: groups.later },
                { key: "noDue", items: groups.noDue },
              ] as const
            ).map(
              (g) =>
                g.items.length ? (
                  <section key={g.key} className="mt-5">
                    <h2 className="text-small font-semibold text-ink-2">
                      {t(`group${g.key.charAt(0).toUpperCase()}${g.key.slice(1)}` as keyof typeof t)}
                      <span className="ml-2 font-normal text-ink-3">{t("count", { count: g.items.length })}</span>
                    </h2>
                    <div className="mt-1">
                      {g.items.map((a) => (
                        <TaskRow
                          key={a.id}
                          task={a.task}
                          lang={reportLang}
                          done={a.done}
                          onToggle={() => void toggle(a)}
                          toggleLabel={ts("toggle")}
                          onOpen={() => openInSession(a)}
                          openLabel={t("openSession", { session: sessionTitle[a.session_id] ?? a.session_id })}
                          sessionLabel={t("inSession", { session: sessionTitle[a.session_id] ?? a.session_id })}
                          assignee={a.assignee_contact_id ? nameOf[a.assignee_contact_id] : undefined}
                          unassignedLabel={ts("unassigned")}
                          due={a.due_date ? (isOverdue(a) ? ts("overdueOn", { date: shortDate(endOfDay(a.due_date), locale) }) : ts("due", { date: shortDate(endOfDay(a.due_date), locale) })) : undefined}
                          overdue={isOverdue(a)}
                          priority={!a.done && a.priority !== "medium" ? ts(`pr.${a.priority}`) : undefined}
                          time={a.timestamp_sec !== null ? formatClock(a.timestamp_sec) : undefined}
                          seekLabel={ts("seek")}
                        />
                      ))}
                    </div>
                  </section>
                ) : null,
            )}

            {/* Đã xong: thu gọn mặc định */}
            {groups.done.length ? (
              <section className="mt-5">
                <button
                  type="button"
                  onClick={() => setDoneOpen((v) => !v)}
                  aria-expanded={doneOpen}
                  className="flex min-h-11 w-full items-center gap-2 text-left"
                >
                  <h2 className="text-small font-semibold text-ink-2">
                    {t("groupDone")}
                    <span className="ml-2 font-normal text-ink-3">{t("count", { count: groups.done.length })}</span>
                  </h2>
                  <span className={cn("text-caption text-ink-3 transition-transform ease-noteim duration-(--t-quick)", doneOpen && "rotate-180")}>
                    ▾
                  </span>
                  {!doneOpen ? <span className="sr-only">{t("doneCollapsedHint")}</span> : null}
                </button>
                {doneOpen ? (
                  <div className="mt-1">
                    {groups.done.map((a) => (
                      <TaskRow
                        key={a.id}
                        task={a.task}
                        lang={reportLang}
                        done={a.done}
                        onToggle={() => void toggle(a)}
                        toggleLabel={ts("toggle")}
                        onOpen={() => openInSession(a)}
                        openLabel={t("openSession", { session: sessionTitle[a.session_id] ?? a.session_id })}
                        sessionLabel={t("inSession", { session: sessionTitle[a.session_id] ?? a.session_id })}
                        unassignedLabel={ts("unassigned")}
                        due={a.done_at ? ts("doneOn", { date: shortDate(a.done_at, locale) }) : undefined}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
