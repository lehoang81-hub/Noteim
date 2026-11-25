/**
 * Nhóm (c) — thư mục theo hồ sơ (GC-05 + GY1) phía máy chủ (C1-03b): CRUD
 * thư mục, gắn/bỏ buổi, lịch sử và Hỏi AI của thư mục. Thư mục và hội thoại
 * lọc theo owner_user_id của PHIÊN; buổi gắn vào thư mục phải là buổi của
 * người dùng (kiểm từng id, không tin client).
 */
import { and, asc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  folderChatMessages,
  folderSessions,
  folders,
  sessionDetails,
  sessions,
  transcriptSegments,
  users,
} from "@/lib/db/schema";
import { DataError } from "../errors";
import type { Folder, FolderChatMessage, FolderKind, Topic } from "../types";

import type { ServerContext } from "./context";
import { ApiError } from "./context";
import { GeminiError } from "./summarize";
import {
  answerFolderChat,
  notFoundText,
  readUiLocale,
  FOLDER_CONTEXT_MAX_CHARS,
  FOLDER_EXCERPT_MAX_CHARS,
  FOLDER_MAX_SESSIONS,
  type FolderSessionBlock,
} from "./chat-ai";

type FolderRow = typeof folders.$inferSelect;

function secToLabel(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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

/* ---------- Hỏi AI của thư mục (GY1, C1-08 nối AI thật) ---------- */

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

/** Kích thước xấp xỉ của một khối buổi trong ngữ cảnh (ký tự). */
function blockSize(b: FolderSessionBlock): number {
  return (
    b.title.length +
    b.executiveSummary.length +
    b.bullets.reduce((n, x) => n + x.text.length, 0) +
    b.excerpt.length
  );
}

/**
 * Hỏi AI thật của thư mục (gói Pro): câu hỏi + ngữ cảnh các buổi trong hồ sơ
 * (tóm tắt, ý chính, trích bản chữ) → Gemini. Trần ký tự tổng: vượt thì bỏ
 * trích bản chữ trước, vẫn vượt thì chỉ giữ số buổi đầu. Trả lời bằng ngôn
 * ngữ giao diện, dẫn nguồn mốc giây để bấm nghe lại; không bịa (không buổi
 * nào nhắc tới thì nói không nhắc tới); số liệu/tên/ngày giờ nguyên văn.
 * Lịch sử lưu folder_chat_messages; chỉ ghi khi AI trả lời thành công.
 */
export async function folderAsk(ctx: ServerContext, folderId: string, question: string): Promise<FolderChatMessage> {
  const db = getDb();
  const folder = await getFolder(ctx, folderId);
  const me = (await db.select().from(users).where(eq(users.id, ctx.userId)).limit(1))[0];
  if ((me?.plan ?? "free") !== "pro") throw new DataError("quota_exceeded");

  const ids = folder.session_ids.slice(0, FOLDER_MAX_SESSIONS);
  const rows = ids.length ? await db.select().from(sessions).where(inArray(sessions.id, ids)) : [];
  const byId = new Map(rows.map((s) => [s.id, s]));
  const details = ids.length
    ? await db.select().from(sessionDetails).where(inArray(sessionDetails.sessionId, ids))
    : [];
  const detailById = new Map(details.map((d) => [d.sessionId, d]));

  const blocks: FolderSessionBlock[] = [];
  for (const id of ids) {
    const s = byId.get(id);
    if (!s) continue;
    const d = detailById.get(id);
    const topics = (d?.topics as Topic[]) ?? [];
    const segRows = await db
      .select({ startSec: transcriptSegments.startSec, text: transcriptSegments.text })
      .from(transcriptSegments)
      .where(eq(transcriptSegments.sessionId, id))
      .orderBy(transcriptSegments.startSec);
    const excerpt = segRows
      .map((seg) => `[${secToLabel(seg.startSec)}] ${seg.text}`)
      .join("\n")
      .slice(0, FOLDER_EXCERPT_MAX_CHARS);
    blocks.push({
      session_id: id,
      title: s.title ?? "",
      durationSec: s.durationSec ?? 0,
      executiveSummary: d?.executiveSummary ?? "",
      bullets: topics
        .slice(0, 6)
        .flatMap((t) => t.bullets.slice(0, 6).map((b) => ({ text: b.text, timestamp_sec: b.timestamp_sec }))),
      excerpt,
    });
  }
  // Trần ngữ cảnh tổng: vượt thì bỏ trích bản chữ (giữ tóm tắt/ý chính);
  // vẫn vượt thì cắt bớt số buổi từ cuối
  if (blocks.reduce((n, b) => n + blockSize(b), 0) > FOLDER_CONTEXT_MAX_CHARS) {
    for (const b of blocks) b.excerpt = "";
    while (
      blocks.length > 1 &&
      blocks.reduce((n, b) => n + blockSize(b), 0) > FOLDER_CONTEXT_MAX_CHARS
    ) {
      blocks.pop();
    }
  }

  const notFound = await notFoundText("folder");
  const started = Date.now();
  try {
    const { answer, citations } = await answerFolderChat(
      { question, locale: await readUiLocale(), folderName: folder.name, blocks },
      notFound,
    );
    await db.insert(folderChatMessages).values({ folderId, role: "user", text: question, citations: [] }).onConflictDoNothing();
    const [ai] = await db
      .insert(folderChatMessages)
      .values({ folderId, role: "ai", text: answer, citations })
      .returning();
    console.log(`[chat] ok ${JSON.stringify({ sessionId: folderId, kind: "folder", ms: Date.now() - started, citations: citations.length, ts: new Date().toISOString() })}`);
    return { id: ai.id, role: "ai", text: ai.text, citations };
  } catch (error) {
    const code =
      error instanceof GeminiError
        ? `gemini_${error.step}${error.status ? `_${error.status}` : ""}`
        : error instanceof DataError
          ? error.code
          : "unknown";
    // Nhật ký chỉ có id thư mục, độ trễ, mã lỗi — không ghi câu hỏi/câu trả lời
    console.error(`[chat] lỗi ${JSON.stringify({ sessionId: folderId, kind: "folder", ms: Date.now() - started, code, ts: new Date().toISOString() })}`);
    if (error instanceof DataError) throw error;
    throw new ApiError(502, "ai_unavailable", "AI không trả lời được, thử lại sau");
  }
}
