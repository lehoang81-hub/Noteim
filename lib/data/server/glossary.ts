/**
 * Nhóm (d) — từ điển tên riêng (GlossaryTerm) phía máy chủ (C1-03b). Từ lọc
 * theo user_id của PHIÊN; thêm từ trùng (không phân biệt hoa thường, tiếng
 * Việt) trả lại từ cũ như bản giả.
 */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { glossaryTerms } from "@/lib/db/schema";
import { DataError } from "../errors";
import type { GlossaryTerm } from "../types";

import type { ServerContext } from "./context";

type Row = typeof glossaryTerms.$inferSelect;

function toTerm(row: Row): GlossaryTerm {
  return {
    id: row.id,
    term: row.term,
    note: row.note ?? undefined,
    variants: (row.variants as GlossaryTerm["variants"]) ?? {},
  };
}

export async function listTerms(ctx: ServerContext): Promise<GlossaryTerm[]> {
  const db = getDb();
  const rows = await db.select().from(glossaryTerms).where(eq(glossaryTerms.userId, ctx.userId));
  return rows.map(toTerm);
}

export async function addTerm(ctx: ServerContext, term: string): Promise<GlossaryTerm> {
  const db = getDb();
  const clean = term.trim();
  if (!clean) throw new DataError("not_found");
  const existing = await db.select().from(glossaryTerms).where(eq(glossaryTerms.userId, ctx.userId));
  const hit = existing.find((g) => g.term.toLocaleLowerCase("vi") === clean.toLocaleLowerCase("vi"));
  if (hit) return toTerm(hit);
  const [row] = await db
    .insert(glossaryTerms)
    .values({ id: `gl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`, userId: ctx.userId, term: clean, variants: {} })
    .returning();
  return toTerm(row);
}

export async function updateTerm(ctx: ServerContext, id: string, term: string): Promise<void> {
  const db = getDb();
  const row = (await db.select().from(glossaryTerms).where(eq(glossaryTerms.id, id)).limit(1))[0];
  if (!row) throw new DataError("not_found");
  if (row.userId !== ctx.userId) throw new DataError("forbidden");
  await db
    .update(glossaryTerms)
    .set({ term: term.trim() })
    .where(and(eq(glossaryTerms.id, id), eq(glossaryTerms.userId, ctx.userId)));
}

export async function removeTerm(ctx: ServerContext, id: string): Promise<void> {
  const db = getDb();
  const row = (await db.select().from(glossaryTerms).where(eq(glossaryTerms.id, id)).limit(1))[0];
  if (!row) throw new DataError("not_found");
  if (row.userId !== ctx.userId) throw new DataError("forbidden");
  await db.delete(glossaryTerms).where(and(eq(glossaryTerms.id, id), eq(glossaryTerms.userId, ctx.userId)));
}
