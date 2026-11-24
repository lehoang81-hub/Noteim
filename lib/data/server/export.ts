/**
 * Nhóm (d) — xuất toàn bộ dữ liệu của người dùng (M4-03, C1-03b): JSON tải
 * về từ Cài đặt > Quyền riêng tư. Chỉ dữ liệu của PHIÊN; không chứa mật khẩu
 * hay khóa nào.
 */
import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { actionItems, contacts, glossaryTerms, sessionDetails, sessions, transcriptSegments } from "@/lib/db/schema";

import { getMe, getQuota } from "./account";
import type { ServerContext } from "./context";

export async function exportAll(ctx: ServerContext): Promise<Record<string, unknown>> {
  const db = getDb();
  const [user, quota, contactRows, termRows] = await Promise.all([
    getMe(ctx),
    getQuota(ctx),
    db.select().from(contacts).where(eq(contacts.userId, ctx.userId)),
    db.select().from(glossaryTerms).where(eq(glossaryTerms.userId, ctx.userId)),
  ]);
  const sessionRows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, ctx.userId), isNull(sessions.deletedAt)));
  const sessionsOut = [];
  for (const row of sessionRows) {
    const [detail, tasks, segments] = await Promise.all([
      db.select().from(sessionDetails).where(eq(sessionDetails.sessionId, row.id)).limit(1),
      db.select().from(actionItems).where(eq(actionItems.sessionId, row.id)),
      db.select().from(transcriptSegments).where(eq(transcriptSegments.sessionId, row.id)),
    ]);
    sessionsOut.push({
      session: {
        id: row.id,
        title: row.title,
        template_id: row.templateId,
        status: row.status,
        duration_sec: row.durationSec,
        size_bytes: row.sizeBytes,
        is_sample: row.isSample,
        trial_recording: row.trialRecording,
        created_at: row.createdAt.toISOString(),
      },
      detail: detail[0]
        ? {
            executive_summary: detail[0].executiveSummary,
            speakers: detail[0].speakers,
            topics: detail[0].topics,
            notes: detail[0].notes,
            bookmarks: detail[0].bookmarks,
            photos: detail[0].photos,
            peaks: detail[0].peaks,
            speaker_spans: detail[0].speakerSpans,
          }
        : null,
      transcript: segments.map((s) => ({
        id: s.id,
        speaker_id: s.speakerId,
        start_sec: s.startSec,
        end_sec: s.endSec,
        text: s.text,
        text_clean: s.textClean,
        lang: s.lang,
      })),
      action_items: tasks.map((t) => ({ id: t.id, task: t.task, done: t.done, due_date: t.dueDate, priority: t.priority })),
    });
  }
  return {
    exported_at: new Date().toISOString(),
    user,
    quota,
    contacts: contactRows.map((c) => ({ id: c.id, name: c.name, role: c.role, email: c.email, preferred_language: c.preferredLanguage })),
    glossary: termRows.map((g) => ({ id: g.id, term: g.term, note: g.note, variants: g.variants })),
    sessions: sessionsOut,
  };
}
