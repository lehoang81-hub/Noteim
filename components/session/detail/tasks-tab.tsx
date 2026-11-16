"use client";

import { Mail, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { TaskRow } from "@/components/session/task-row";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { formatClock } from "@/components/ribbon/draw";
import type { ActionItem, Contact } from "@/lib/data";
import { endOfDay, shortDate } from "@/lib/format";

/*
 * Tab Việc cần làm (docs/03-screens.md mục 5b).
 * Chạm ô tròn để đánh dấu xong, có thông báo kèm "Hoàn tác".
 * Việc chưa có người phụ trách hiện "Chưa giao", không tự đoán.
 */
export function TasksTab({
  items,
  /** Ngôn ngữ của nội dung việc (theo bản tóm tắt đang xem, M6-03 + Mục 2 review #52) */
  lang,
  contacts,
  now,
  canSeek,
  onSeek,
  onToggle,
  onOpen,
  onAdd,
  onEmail,
}: {
  items: ActionItem[];
  lang?: string;
  contacts: Contact[];
  now: Date;
  canSeek: boolean;
  onSeek: (time: number) => void;
  onToggle: (item: ActionItem) => void;
  /** Chạm một hàng việc để mở bảng sửa (M3-04) */
  onOpen: (item: ActionItem) => void;
  onAdd: () => void;
  onEmail: () => void;
}) {
  const t = useTranslations("session");
  const tr = useTranslations(); // nhãn "Bạn" của chính người dùng theo ngôn ngữ (review #41 mục 5)
  const locale = useLocale();
  // Liên hệ "c-me" là chính người dùng: role trong fixture là nhãn hệ thống
  // tiếng Việt ("Bạn"), hiển thị qua speakerYou thay vì giữ nguyên (review #41 mục 5)
  const nameOf = Object.fromEntries(contacts.map((c) => [c.id, c.id === "c-me" ? tr("speakerYou") : c.name]));
  const isOverdue = (a: ActionItem) => !a.done && !!a.due_date && endOfDay(a.due_date) < now;
  const overdue = items.filter(isOverdue).length;

  // Chưa xong lên trước, quá hạn lên đầu
  const sorted = [...items].sort((a, b) => Number(a.done) - Number(b.done) || Number(isOverdue(b)) - Number(isOverdue(a)));

  return (
    <div className="max-w-[68ch]">
      {items.length === 0 ? (
        <EmptyState
          drawing={<span />}
          message={t("noTasks")}
          action={
            <Button icon={Plus} onClick={onAdd}>
              {t("addTask")}
            </Button>
          }
        />
      ) : (
        <>
          <p className="text-small font-medium text-ink-2">
            {t("tasksSummary", { total: items.length })}
            {overdue ? t("tasksOverdue", { count: overdue }) : ""}
          </p>
          <div className="mt-1">
            {sorted.map((a) => {
              const od = isOverdue(a);
              return (
                <TaskRow
                  key={a.id}
                  task={a.task}
                  lang={lang}
                  done={a.done}
                  onToggle={() => onToggle(a)}
                  toggleLabel={t("toggle")}
                  onOpen={() => onOpen(a)}
                  openLabel={`${t("editTask")}: ${a.task}`}
                  assignee={a.assignee_contact_id ? nameOf[a.assignee_contact_id] : undefined}
                  unassignedLabel={t("unassigned")}
                  due={
                    a.done && a.done_at
                      ? t("doneOn", { date: shortDate(a.done_at, locale) })
                      : a.due_date
                        ? od
                          ? t("overdueOn", { date: shortDate(endOfDay(a.due_date), locale) })
                          : t("due", { date: shortDate(endOfDay(a.due_date), locale) })
                        : undefined
                  }
                  overdue={od}
                  priority={!a.done && a.priority !== "medium" ? t(`pr.${a.priority}`) : undefined}
                  quote={a.source_quote ? `"${a.source_quote}"` : undefined}
                  time={a.timestamp_sec !== null ? formatClock(a.timestamp_sec) : undefined}
                  seekLabel={t("seek")}
                  onSeek={canSeek && a.timestamp_sec !== null ? () => onSeek(a.timestamp_sec!) : undefined}
                />
              );
            })}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button icon={Plus} onClick={onAdd}>
              {t("addTask")}
            </Button>
            <Button icon={Mail} onClick={onEmail}>
              {t("emailTasks")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
