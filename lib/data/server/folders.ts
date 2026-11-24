/**
 * Nhóm (c) — thư mục theo hồ sơ (GC-05 + GY1) phía máy chủ (C1-03b): CRUD
 * thư mục, gắn/bỏ buổi, lịch sử và Hỏi AI của thư mục. Thư mục và hội thoại
 * lọc theo owner_user_id của PHIÊN; buổi gắn vào thư mục phải là buổi của
 * người dùng (kiểm từng id, không tin client).
 */
import { and, asc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  actionItems,
  folderChatMessages,
  folderSessions,
  folders,
  sessionDetails,
  sessions,
  users,
} from "@/lib/db/schema";
import { DataError } from "../errors";
import { foldVi } from "./fold";
import type { Folder, FolderChatMessage, FolderKind, SessionDetail, Topic } from "../types";

import type { ServerContext } from "./context";

type FolderRow = typeof folders.$inferSelect;

async function sessionIdsOf(folderId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db.select().from(folderSessions).where(eq(folderSessions.folderId, folderId)).orderBy(asc(folderSessions.addedAt));
  return rows.map((r) => r.sessionId);
}

export function toFolder(row: FolderRow, sessionIds: string[]): Folder {
  return {
    id: row.id,
    workspace_id: row.workspaceId ?? null,
    kind: row.kind as FolderKind,
    name: row.name,
    ref: row.ref ?? undefined,
    note: row.note ?? undefined,
    template_id: row.templateId ?? undefined,
    session_ids: sessionIds,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function listFolders(ctx: ServerContext): Promise<Folder[]> {
  const db = getDb();
  const rows = await db.select().from(folders).where(eq(folders.ownerUserId, ctx.userId)).orderBy(asc(folders.createdAt));
  const ids = rows.map((r) => r.id);
  const links = ids.length ? await db.select().from(folderSessions).where(inArray(folderSessions.folderId, ids)).orderBy(asc(folderSessions.addedAt)) : [];
  return rows.map((r) => toFolder(r, links.filter((l) => l.folderId === r.id).map((l) => l.sessionId)));
}

export async function getFolder(ctx: ServerContext, id: string): Promise<Folder> {
  const db = getDb();
  const row = (await db.select().from(folders).where(eq(folders.id, id)).limit(1))[0];
  if (!row) throw new DataError("not_found");
  if (row.ownerUserId !== ctx.userId) throw new DataError("forbidden");
  return toFolder(row, await sessionIdsOf(id));
}

export async function createFolder(
  ctx: ServerContext,
  input: { kind: FolderKind; name: string; ref?: string; note?: string; template_id?: string | null; session_ids?: string[] },
): Promise<Folder> {
  const db = getDb();
  const name = input.name.trim();
  if (!name) throw new DataError("not_found");
  const id = `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date();
  await db.insert(folders).values({
    id,
    workspaceId: null,
    ownerUserId: ctx.userId,
    kind: input.kind,
    name,
    ref: input.ref?.trim() || null,
    note: input.note?.trim() || null,
    templateId: input.template_id ?? null,
    createdAt: now,
    updatedAt: now,
  });
  if (input.session_ids?.length) {
    await attachSessions(ctx, id, input.session_ids);
  }
  const row = (await db.select().from(folders).where(eq(folders.id, id)).limit(1))[0];
  return toFolder(row, await sessionIdsOf(id));
}

/** Gắn buổi vào thư mục: từng buổi phải thuộc người dùng của PHIÊN. */
async function attachSessions(ctx: ServerContext, folderId: string, sessionIds: string[]): Promise<void> {
  const db = getDb();
  const owned = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.userId, ctx.userId), inArray(sessions.id, sessionIds)));
  const ownedIds = new Set(owned.map((o) => o.id));
  const allowed = sessionIds.filter((sid) => ownedIds.has(sid));
  if (allowed.length) {
    await db
      .insert(folderSessions)
      .values(allowed.map((sid) => ({ folderId, sessionId: sid })))
      .onConflictDoNothing();
  }
}

export async function updateFolder(
  ctx: ServerContext,
  id: string,
  patch: Partial<Pick<Folder, "name" | "ref" | "note" | "template_id" | "session_ids">>,
): Promise<void> {
  const db = getDb();
  const row = (await db.select().from(folders).where(eq(folders.id, id)).limit(1))[0];
  if (!row) throw new DataError("not_found");
  if (row.ownerUserId !== ctx.userId) throw new DataError("forbidden");
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.ref !== undefined) set.ref = patch.ref?.trim() || null;
  if (patch.note !== undefined) set.note = patch.note?.trim() || null;
  if (patch.template_id !== undefined) set.templateId = patch.template_id ?? null;
  await db.update(folders).set(set).where(eq(folders.id, id));
  if (patch.session_ids !== undefined) {
    await db.delete(folderSessions).where(eq(folderSessions.folderId, id));
    if (patch.session_ids.length) await attachSessions(ctx, id, patch.session_ids);
  }
}

export async function removeFolder(ctx: ServerContext, id: string): Promise<void> {
  const db = getDb();
  const row = (await db.select().from(folders).where(eq(folders.id, id)).limit(1))[0];
  if (!row) throw new DataError("not_found");
  if (row.ownerUserId !== ctx.userId) throw new DataError("forbidden");
  // Buổi ghi không bị xóa, chỉ gỡ khỏi thư mục (FK cascade dọn folder_sessions)
  await db.delete(folders).where(eq(folders.id, id));
}

/* ---------- Hỏi AI của thư mục (GY1) ---------- */

export async function folderHistory(ctx: ServerContext, folderId: string): Promise<FolderChatMessage[]> {
  await getFolder(ctx, folderId); // kiểm quyền
  const db = getDb();
  const rows = await db
    .select()
    .from(folderChatMessages)
    .where(eq(folderChatMessages.folderId, folderId))
    .orderBy(asc(folderChatMessages.createdAt));
  return rows.map((r) => ({
    id: r.id,
    role: r.role === "ai" ? "ai" : "user",
    text: r.text,
    citations: (r.citations as Array<{ session_id: string; timestamp_sec: number }>) ?? [],
  }));
}

type Hit = { session: SessionDetail; text: string; timestamp_sec: number; score: number };

/** Ghép câu trả lời từ ý tóm tắt, việc cần làm và ghi chú của các buổi trong thư mục. */
export async function folderAsk(ctx: ServerContext, folderId: string, question: string): Promise<FolderChatMessage> {
  const db = getDb();
  const folder = await getFolder(ctx, folderId);
  const me = (await db.select().from(users).where(eq(users.id, ctx.userId)).limit(1))[0];
  if ((me?.plan ?? "free") !== "pro") throw new DataError("quota_exceeded");

  const q = foldVi(question);
  const tokens = q
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
  const details = await db
    .select()
    .from(sessionDetails)
    .where(inArray(sessionDetails.sessionId, folder.session_ids.length ? folder.session_ids : [""]));
  const sessionRows = folder.session_ids.length
    ? await db.select().from(sessions).where(inArray(sessions.id, folder.session_ids))
    : [];
  const byId = new Map(sessionRows.map((s) => [s.id, s]));
  const actionRows = folder.session_ids.length
    ? await db.select().from(actionItems).where(inArray(actionItems.sessionId, folder.session_ids))
    : [];

  const hits: Hit[] = [];
  for (const detail of details) {
    const session = byId.get(detail.sessionId);
    if (!session) continue;
    const d: SessionDetail = {
      ...(session as unknown as SessionDetail),
      topics: (detail.topics as Topic[]) ?? [],
    };
    for (const topic of (detail.topics as Topic[]) ?? []) {
      for (const b of topic.bullets) {
        const folded = foldVi(b.text);
        hits.push({ session: d, text: b.text, timestamp_sec: b.timestamp_sec, score: tokens.reduce((n, w) => n + (folded.includes(w) ? 1 : 0), 0) });
      }
    }
    for (const n of (detail.notes as Array<{ text: string; timestamp_sec: number }>) ?? []) {
      const folded = foldVi(n.text);
      hits.push({ session: d, text: n.text, timestamp_sec: n.timestamp_sec, score: tokens.reduce((acc, w) => acc + (folded.includes(w) ? 1 : 0), 0) });
    }
  }
  for (const a of actionRows) {
    const session = byId.get(a.sessionId);
    if (!session) continue;
    const folded = foldVi(a.task);
    hits.push({
      session: byId.get(a.sessionId)! as unknown as SessionDetail,
      text: a.task,
      timestamp_sec: a.timestampSec ?? 0,
      score: tokens.reduce((n, w) => n + (folded.includes(w) ? 1 : 0), 0),
    });
  }

  const scored = hits.filter((h) => h.score > 0).sort((a, b) => b.score - a.score);
  // Trả lời xuyên buổi: mỗi buổi tối đa 2 đoạn, buổi mạnh nhất đứng trước, tối đa 2 buổi 4 đoạn
  const perSession = new Map<string, Hit[]>();
  for (const h of scored) {
    const list = perSession.get(h.session.id) ?? [];
    if (list.length >= 2) continue;
    list.push(h);
    perSession.set(h.session.id, list);
  }
  const ordered = [...perSession.values()].sort((a, b) => b[0].score - a[0].score).slice(0, 2);
  const best = ordered.flat().slice(0, 4);
  const answer = best.length
    ? `Trên ${folder.session_ids.length} buổi của hồ sơ "${folder.name}", tìm thấy ${best.length} đoạn khớp ở ${ordered.length} buổi. ` +
      ordered.map((list) => `Buổi "${list[0].session.title}" ghi rằng: ${list.map((h) => h.text).join("; ")}`).join(" ")
    : `Chưa tìm thấy nội dung khớp câu hỏi trong ${folder.session_ids.length} buổi của hồ sơ này. Thử hỏi bằng từ khóa khác.`;
  const citations = best.map((h) => ({ session_id: h.session.id, timestamp_sec: h.timestamp_sec }));

  await db.insert(folderChatMessages).values({ folderId, role: "user", text: question, citations: [] }).onConflictDoNothing();
  const [ai] = await db
    .insert(folderChatMessages)
    .values({ folderId, role: "ai", text: answer, citations })
    .returning();
  return { id: ai.id, role: "ai", text: ai.text, citations };
}
