/**
 * Nhóm (c) — việc cần làm xuyên buổi (TaskRepository) phía máy chủ (C1-03b).
 * Mọi truy vấn gắn với buổi của PHIÊN: việc của buổi người khác không đọc
 * được, không tick được.
 */
import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { actionItems, sessionDetails, sessions, summaryVersions } from "@/lib/db/schema";
import { DataError } from "../errors";
import type { ActionItem, Lang } from "../types";

import type { ServerContext } from "./context";

type ActionRow = typeof actionItems.$inferSelect;

export function toActionItem(row: ActionRow): ActionItem {
  return {
    id: row.id,
    session_id: row.sessionId,
    task: row.task,
    assignee_contact_id: row.assigneeContactId ?? null,
    assignee_user_id: row.assigneeUserId ?? null,
    due_date: row.dueDate ?? null,
    priority: (row.priority as ActionItem["priority"]) ?? "medium",
    done: row.done,
    done_at: row.doneAt ? row.doneAt.toISOString() : null,
    source_quote: row.sourceQuote ?? null,
    timestamp_sec: row.timestampSec ?? null,
  };
}

/** Cập nhật lại số việc mở + nhãn chính của buổi (khớp refreshCounts của bản giả). */
export async function refreshSessionCounts(sessionId: string): Promise<void> {
  const db = getDb();
  const tasks = await db.select().from(actionItems).where(eq(actionItems.sessionId, sessionId));
  const session = (await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1))[0];
  if (!session) return;
  const open = tasks.filter((t) => !t.done).length;
  let headline: { tag: string; count: number } | null = null;
  if (session.status === "ready") {
    if (open > 0) headline = { tag: "pending", count: open };
    else {
      const detail = (await db.select().from(sessionDetails).where(eq(sessionDetails.sessionId, sessionId)).limit(1))[0];
      const topics = (detail?.topics as Array<{ tag?: string }> | null) ?? [];
      const decided = topics.filter((t) => t.tag === "decided").length;
      headline = decided > 0 ? { tag: "decided", count: decided } : null;
    }
  }
  await db.update(sessions).set({ openTaskCount: open, headlineTag: headline }).where(eq(sessions.id, sessionId));
}

export async function listTasks(ctx: ServerContext, filter?: { mine?: boolean; lang?: Lang }): Promise<ActionItem[]> {
  const db = getDb();
  const rows = await db
    .select({ item: actionItems })
    .from(actionItems)
    .innerJoin(sessions, eq(sessions.id, actionItems.sessionId))
    .where(and(eq(sessions.userId, ctx.userId)))
    .orderBy(desc(sessions.createdAt));
  let items: ActionItem[] = rows.map((r) => toActionItem(r.item));
  // Trang Việc hiển thị theo ngôn ngữ báo cáo (M6-03): tên việc lấy từ bản
  // đã có của buổi, thiếu thì giữ câu gốc
  if (filter?.lang) {
    const versions = await db.select().from(summaryVersions).where(eq(summaryVersions.lang, filter.lang));
    const textsBySession = new Map(versions.map((v) => [v.sessionId, (v.taskTexts as Record<string, string>) ?? {}]));
    items = items.map((item) => {
      const texts = textsBySession.get(item.session_id);
      return texts && texts[item.id] ? { ...item, task: texts[item.id] } : item;
    });
  }
  if (filter?.mine) {
    items = items.filter((a) => a.assignee_contact_id === "c-me" || a.assignee_user_id === ctx.userId);
  }
  return items;
}

export async function upsertTask(ctx: ServerContext, item: ActionItem): Promise<void> {
  const db = getDb();
  const session = (
    await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, item.session_id), eq(sessions.userId, ctx.userId)))
      .limit(1)
  )[0];
  if (!session) throw new DataError("not_found");
  const values = {
    id: item.id,
    sessionId: item.session_id,
    task: item.task,
    assigneeContactId: item.assignee_contact_id,
    assigneeUserId: item.assignee_user_id ?? null,
    dueDate: item.due_date,
    priority: item.priority,
    done: item.done,
    doneAt: item.done_at ? new Date(item.done_at) : null,
    sourceQuote: item.source_quote,
    timestampSec: item.timestamp_sec,
  };
  await db
    .insert(actionItems)
    .values(values)
    .onConflictDoUpdate({ target: [actionItems.sessionId, actionItems.id], set: values });
  await refreshSessionCounts(item.session_id);
}

export async function toggleTaskDone(ctx: ServerContext, id: string): Promise<ActionItem> {
  const db = getDb();
  const candidates = await db
    .select({ item: actionItems, createdAt: sessions.createdAt })
    .from(actionItems)
    .innerJoin(sessions, eq(sessions.id, actionItems.sessionId))
    .where(and(eq(actionItems.id, id), eq(sessions.userId, ctx.userId)))
    .orderBy(desc(sessions.createdAt));
  const target = candidates[0];
  if (!target) throw new DataError("not_found");
  const done = !target.item.done;
  await db
    .update(actionItems)
    .set({ done, doneAt: done ? new Date() : null })
    .where(and(eq(actionItems.sessionId, target.item.sessionId), eq(actionItems.id, id)));
  await refreshSessionCounts(target.item.sessionId);
  return { ...toActionItem(target.item), done, done_at: done ? new Date().toISOString() : null };
}
