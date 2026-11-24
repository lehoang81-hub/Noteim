/**
 * Nhóm (d) — danh bạ (ContactRepository phần AccountRepository) phía máy
 * chủ (C1-03b). Liên hệ lọc theo user_id của PHIÊN; xóa liên hệ gỡ khỏi
 * người nói ở mọi buổi của người dùng (không đụng buổi người khác).
 */
import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { contacts, sessionDetails, sessions } from "@/lib/db/schema";
import { DataError } from "../errors";
import type { Contact, Lang, Speaker } from "../types";

import type { ServerContext } from "./context";

type ContactRow = typeof contacts.$inferSelect;

function toContact(row: ContactRow): Contact {
  return {
    id: row.id,
    name: row.name,
    role: row.role ?? undefined,
    email: row.email ?? undefined,
    preferred_language: (row.preferredLanguage as Lang | null) ?? null,
  };
}

export async function listContacts(ctx: ServerContext): Promise<Contact[]> {
  const db = getDb();
  const rows = await db.select().from(contacts).where(eq(contacts.userId, ctx.userId));
  return rows.map(toContact);
}

export async function addContact(ctx: ServerContext, input: { name: string; email?: string }): Promise<Contact> {
  const db = getDb();
  const contact = {
    id: `c-new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    userId: ctx.userId,
    name: input.name.trim(),
    email: input.email?.trim() || null,
    preferredLanguage: null,
  };
  const [row] = await db.insert(contacts).values(contact).returning();
  return toContact(row);
}

export async function updateContact(
  ctx: ServerContext,
  id: string,
  patch: Partial<Pick<Contact, "name" | "role" | "email" | "preferred_language">>,
): Promise<void> {
  const db = getDb();
  const row = (await db.select().from(contacts).where(eq(contacts.id, id)).limit(1))[0];
  if (!row) throw new DataError("not_found");
  if (row.userId !== ctx.userId) throw new DataError("forbidden");
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.role !== undefined) set.role = patch.role?.trim() || null;
  if (patch.email !== undefined) set.email = patch.email?.trim() || null;
  if (patch.preferred_language !== undefined) set.preferredLanguage = patch.preferred_language;
  if (Object.keys(set).length === 0) return;
  await db.update(contacts).set(set).where(and(eq(contacts.id, id), eq(contacts.userId, ctx.userId)));
}

/** Các buổi đang dùng người này làm người nói — cảnh báo trước khi xóa (M4-03). */
export async function contactUsage(ctx: ServerContext, id: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ id: sessions.id, title: sessions.title, speakers: sessionDetails.speakers })
    .from(sessions)
    .innerJoin(sessionDetails, eq(sessionDetails.sessionId, sessions.id))
    .where(eq(sessions.userId, ctx.userId));
  return rows
    .filter((r) => ((r.speakers as Speaker[]) ?? []).some((s) => s.contact_id === id))
    .map((r) => r.title);
}

export async function removeContact(ctx: ServerContext, id: string): Promise<void> {
  const db = getDb();
  const row = (await db.select().from(contacts).where(eq(contacts.id, id)).limit(1))[0];
  if (!row) throw new DataError("not_found");
  if (row.userId !== ctx.userId) throw new DataError("forbidden");
  await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.userId, ctx.userId)));
  // Người nói đang gán liên hệ này về lại chưa đặt tên, ở mọi buổi của mình
  const details = await db
    .select()
    .from(sessionDetails)
    .where(
      inArray(
        sessionDetails.sessionId,
        db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, ctx.userId)),
      ),
    );
  for (const detail of details) {
    const speakers = (detail.speakers as Speaker[]) ?? [];
    if (!speakers.some((s) => s.contact_id === id)) continue;
    await db
      .update(sessionDetails)
      .set({
        speakers: speakers.map((s) => (s.contact_id === id ? { ...s, contact_id: null, display_name: null } : s)),
      })
      .where(eq(sessionDetails.sessionId, detail.sessionId));
  }
}
