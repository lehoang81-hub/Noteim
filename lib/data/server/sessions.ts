/**
 * Nhóm (b) — buổi ghi: danh sách + chi tiết (đọc/ghi) phía máy chủ (C1-03b).
 *
 * Mọi hàm nhận `ctx` từ PHIÊN (getServerSession) và lọc theo user_id —
 * không bao giờ tin id do client gửi. Buổi của người khác: 403 khi tồn tại
 * (không lộ nội dung), 404 khi không có. Buổi mẫu trong fixture
 * (`s-sample-*`) đọc được ở chế độ chỉ xem khi chưa nhập vào tài khoản —
 * đó là nội dung demo tĩnh, không phải dữ liệu người dùng.
 */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  actionItems,
  chatMessages,
  contacts,
  folderSessions,
  folders,
  sessionDetails,
  sessions,
  summaryVersions,
  transcriptSegments,
  users,
} from "@/lib/db/schema";
import { DataError } from "../errors";
import type { SessionAction } from "../session-actions";
import type {
  ActionItem,
  BookmarkData,
  ChatMessage,
  Lang,
  ListeningMap,
  Note,
  Photo,
  Profession,
  SavedGapCheck,
  SemanticTag,
  Session,
  SessionDetail,
  SessionStatus,
  Speaker,
  SummaryVersion,
  TranscriptSegment,
  TranslationEntry,
  Topic,
  VersionTopic,
  VisualArtifacts,
} from "../types";
import type { SearchResult, RecordingDraft, SessionFilter } from "../repository";

import { buildSessionContent, THUMB_COUNT } from "@/lib/data/mock/generate";

import { loadSampleFixture } from "./sample-fixtures";
import { foldVi } from "./fold";
import { templateById, templatesOfProfession } from "./templates";
import { ApiError, type ServerContext } from "./context";
import { deleteObjectSafe, isAudioObjectKey } from "./r2";
import { retryPipeline, stateOf } from "./asr-pipeline";
import type { AsrStage } from "./asr-pipeline";
import { FREE_CHAT_QUESTIONS_PER_SESSION, FREE_RESUMMARIZE_PER_SESSION } from "./account";
import { GeminiError, speakerOrder } from "./summarize";
import { answerSessionChat, notFoundText, readUiLocale, type SessionChatContext } from "./chat-ai";
import { translateSummaryVersion, translateTexts } from "./translate-ai";

type SessionRow = typeof sessions.$inferSelect;
type DetailRow = typeof sessionDetails.$inferSelect;
type SegmentRow = typeof transcriptSegments.$inferSelect;
type ActionRow = typeof actionItems.$inferSelect;

const PROCESS_STEP_MS = 1600;
const PROCESS_STEPS = 5;

/* ---------- Ánh xạ dòng DB → hình dạng Zod (lib/data/types.ts) ---------- */

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

export function toSession(row: SessionRow): Session {
  const consent = (row.consent ?? {}) as Session["consent"];
  return {
    id: row.id,
    user_id: row.userId,
    workspace_id: row.workspaceId,
    visibility: row.visibility === "workspace" ? "workspace" : "private",
    owner_user_id: row.ownerUserId,
    title: row.title,
    template_id: row.templateId,
    primary_language: (row.primaryLanguage as Lang) ?? "vi",
    detected_languages: (row.detectedLanguages as Lang[]) ?? [],
    report_languages: (row.reportLanguages as Lang[]) ?? [],
    original_report_language: (row.originalReportLanguage as Lang) ?? "vi",
    status: row.status as SessionStatus,
    processing_step: row.processingStep ?? undefined,
    failure_reason: row.failureReason ?? undefined,
    storage_status: row.storageStatus === "essence_only" ? "essence_only" : "full",
    duration_sec: row.durationSec,
    size_bytes: row.sizeBytes,
    // Băng trên R2 (khóa u/…) không bao giờ lộ khóa thô: client nhận lối
    // /api/audio/{id} — route kiểm quyền theo phiên rồi 302 sang signed GET
    // 15 phút (C1-04 yêu cầu 3). Buổi mẫu giữ đường dẫn tĩnh /audio/….
    audio_url: isAudioObjectKey(row.audioPath) ? `/api/audio/${row.id}` : (row.audioPath ?? null),
    asr_stage: (row.asrStage as Session["asr_stage"]) ?? undefined,
    asr_error: row.asrError ?? undefined,
    is_sample: row.isSample || undefined,
    trial_recording: row.trialRecording || undefined,
    created_at: row.createdAt.toISOString(),
    audio_expires_at: iso(row.audioExpiresAt),
    consent: {
      confirmed: Boolean(consent.confirmed),
      announced: Boolean(consent.announced),
      receipts: consent.receipts,
    },
    participant_contact_ids: row.participantContactIds ?? [],
    peaks_thumb: (row.peaksThumb as number[]) ?? [],
    speaker_colors_thumb: (row.speakerColorsThumb as number[]) ?? [],
    headline_tag: (row.headlineTag as Session["headline_tag"]) ?? undefined,
    open_task_count: row.openTaskCount,
  };
}

export function toDetail(row: SessionRow, detail: DetailRow, tasks: ActionRow[]): SessionDetail {
  const s = toSession(row);
  return {
    ...s,
    executive_summary: detail.executiveSummary ?? "",
    speakers: (detail.speakers as Speaker[]) ?? [],
    topics: (detail.topics as Topic[]) ?? [],
    action_items: tasks.map(toActionItem),
    notes: (detail.notes as Note[]) ?? [],
    bookmarks: (detail.bookmarks as BookmarkData[]) ?? [],
    photos: (detail.photos as Photo[]) ?? [],
    peaks: (detail.peaks as number[]) ?? [],
    speaker_spans: (detail.speakerSpans as Array<{ speaker_id: string; start_sec: number; end_sec: number }>) ?? [],
    send_history: (detail.sendHistory as Array<{ sent_at: string; recipient_count: number }>) ?? [],
    gap_check: (detail.gapCheck as SavedGapCheck | null) ?? undefined,
    gap_check_done: detail.gapCheckDone ?? [],
    pending_ai_questions: detail.pendingAiQuestions ?? [],
    // C1-09 mục 4: băng "Tóm tắt lại" và hạn mức Free đếm phía máy chủ
    transcript_stale: row.transcriptStale,
    resummarize_count: row.resummarizeCount,
  };
}

function toActionItem(row: ActionRow): ActionItem {
  return {
    id: row.id,
    session_id: row.sessionId,
    task: row.task,
    assignee_contact_id: row.assigneeContactId ?? null,
    assignee_user_id: row.assigneeUserId ?? null,
    due_date: row.dueDate ?? null,
    priority: (row.priority as ActionItem["priority"]) ?? "medium",
    done: row.done,
    done_at: iso(row.doneAt),
    source_quote: row.sourceQuote ?? null,
    timestamp_sec: row.timestampSec ?? null,
  };
}

function toSegment(row: SegmentRow): TranscriptSegment {
  return {
    id: row.id,
    speaker_id: row.speakerId,
    start_sec: row.startSec,
    end_sec: row.endSec,
    text: row.text,
    text_clean: row.textClean,
    edited: row.edited,
    lang: (row.lang as Lang) ?? "vi",
    translations: (row.translations as TranscriptSegment["translations"]) ?? {},
    words: (row.words as TranscriptSegment["words"]) ?? undefined,
  };
}

/* ---------- Đọc buổi của riêng mình ---------- */

/** Buổi thuộc người dùng của phiên; không phải chủ → forbidden (403). */
export async function getOwnedSessionRow(ctx: ServerContext, id: string): Promise<SessionRow> {
  const db = getDb();
  const row = (await db.select().from(sessions).where(eq(sessions.id, id)).limit(1))[0];
  if (!row) throw new DataError("not_found");
  if (row.userId !== ctx.userId) throw new DataError("forbidden");
  return row;
}

async function getDetailRow(sessionId: string): Promise<DetailRow> {
  const db = getDb();
  const row = (await db.select().from(sessionDetails).where(eq(sessionDetails.sessionId, sessionId)).limit(1))[0];
  if (row) return row;
  await db.insert(sessionDetails).values({ sessionId }).onConflictDoNothing();
  return (await db.select().from(sessionDetails).where(eq(sessionDetails.sessionId, sessionId)).limit(1))[0];
}

async function getTasks(sessionId: string): Promise<ActionRow[]> {
  const db = getDb();
  return db.select().from(actionItems).where(eq(actionItems.sessionId, sessionId));
}

export async function getSessionDetail(ctx: ServerContext, id: string): Promise<SessionDetail> {
  const db = getDb();
  const row = (await db.select().from(sessions).where(eq(sessions.id, id)).limit(1))[0];
  if (row && row.userId === ctx.userId) {
    await finalizeIfDue(ctx, row);
    const fresh = (await db.select().from(sessions).where(eq(sessions.id, id)).limit(1))[0] ?? row;
    const [detail, tasks] = await Promise.all([getDetailRow(id), getTasks(id)]);
    return toDetail(fresh, detail, tasks);
  }
  if (row && row.userId !== ctx.userId) throw new DataError("forbidden");
  // Buổi mẫu chưa nhập vào tài khoản: nội dung demo tĩnh, chỉ xem
  if (id.startsWith("s-sample-")) {
    const fixture = await loadSampleFixture(id);
    if (fixture) return fixture.detail;
  }
  throw new DataError("not_found");
}

export async function getTranscript(ctx: ServerContext, id: string): Promise<TranscriptSegment[]> {
  const db = getDb();
  const row = (await db.select().from(sessions).where(eq(sessions.id, id)).limit(1))[0];
  if (row && row.userId !== ctx.userId) throw new DataError("forbidden");
  if (row && row.userId === ctx.userId) {
    const rows = await db
      .select()
      .from(transcriptSegments)
      .where(eq(transcriptSegments.sessionId, id))
      .orderBy(transcriptSegments.startSec);
    return rows.map(toSegment);
  }
  if (id.startsWith("s-sample-")) {
    const fixture = await loadSampleFixture(id);
    if (fixture) return fixture.transcript;
  }
  throw new DataError("not_found");
}

export async function getVisuals(ctx: ServerContext, id: string): Promise<VisualArtifacts> {
  const db = getDb();
  const row = (await db.select().from(sessions).where(eq(sessions.id, id)).limit(1))[0];
  if (row && row.userId !== ctx.userId) throw new DataError("forbidden");
  if (row && row.userId === ctx.userId) {
    const detail = await getDetailRow(id);
    const d = toDetail(row, detail, await getTasks(id));
    return {
      timeline: d.topics.map((t) => ({ topic_id: t.id, start_sec: t.start_sec, end_sec: t.end_sec, tag: t.tag })),
      // C1-09: người nói hết đoạn (tỉ lệ 0) ẩn khỏi tỉ lệ nói, không xóa dữ liệu
      talk_share: d.speakers.filter((s) => s.talk_ratio_percent > 0).map((s) => ({ speaker_id: s.id, percent: s.talk_ratio_percent })),
      flow_mermaid: detail.flowMermaid ?? undefined,
    };
  }
  if (id.startsWith("s-sample-")) {
    const fixture = await loadSampleFixture(id);
    if (fixture) {
      const d = fixture.detail;
      return {
        timeline: d.topics.map((t) => ({ topic_id: t.id, start_sec: t.start_sec, end_sec: t.end_sec, tag: t.tag })),
        talk_share: d.speakers.map((s) => ({ speaker_id: s.id, percent: s.talk_ratio_percent })),
        flow_mermaid: fixture.flow_mermaid,
      };
    }
  }
  throw new DataError("not_found");
}

export async function getListeningMap(ctx: ServerContext, id: string): Promise<ListeningMap | null> {
  const db = getDb();
  const row = (await db.select().from(sessions).where(eq(sessions.id, id)).limit(1))[0];
  if (row && row.userId !== ctx.userId) throw new DataError("forbidden");
  if (row && row.userId === ctx.userId) {
    const detail = await getDetailRow(id);
    return (detail.listeningMap as ListeningMap | null) ?? null;
  }
  if (id.startsWith("s-sample-")) {
    const fixture = await loadSampleFixture(id);
    return fixture?.listening_map ?? null;
  }
  throw new DataError("not_found");
}

/* ---------- Danh sách ---------- */

export async function listSessions(ctx: ServerContext, filter?: SessionFilter): Promise<Session[]> {
  const db = getDb();
  await finalizeDueAll(ctx);
  const conditions = [eq(sessions.userId, ctx.userId), isNull(sessions.deletedAt), eq(sessions.isSample, false)];
  const rows = await db
    .select()
    .from(sessions)
    .where(and(...conditions))
    .orderBy(desc(sessions.createdAt));
  let items = rows.map(toSession);
  if (filter?.template_id) items = items.filter((d) => d.template_id === filter.template_id);
  if (filter?.has_open_tasks) items = items.filter((d) => d.open_task_count > 0);
  if (filter?.range === "week") {
    const cutoff = Date.now() - 7 * 86400_000;
    items = items.filter((d) => Date.parse(d.created_at) >= cutoff);
  }
  if (filter?.query) {
    const q = foldVi(filter.query);
    const details = await db.select().from(sessionDetails).where(inArray(sessionDetails.sessionId, items.map((i) => i.id)));
    const hayById = new Map(
      details.map((d) => [
        d.sessionId,
        foldVi(
          [
            d.executiveSummary ?? "",
            ...((d.topics as Topic[]) ?? []).flatMap((t) => [t.title, ...t.bullets.map((b) => b.text)]),
          ].join(" "),
        ),
      ]),
    );
    items = items.filter((d) => {
      const hay = `${foldVi(d.title)} ${hayById.get(d.id) ?? ""}`;
      return hay.includes(q);
    });
  }
  return items;
}

/* ---------- Xử lý buổi ghi mới (bản nháp → nội dung) ---------- */

function resampleThumb(levels: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < 40; i++) {
    const from = Math.floor((i * levels.length) / 40);
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / 40));
    let max = 0;
    for (let j = from; j < to; j++) max = Math.max(max, levels[j] ?? 0);
    out.push(Math.round(max * 100) / 100);
  }
  return out;
}

function syntheticThumb(): number[] {
  return Array.from({ length: 40 }, (_, i) => Math.round((0.3 + 0.5 * Math.abs(Math.sin(i / 5))) * 100) / 100);
}

type CreateInput =
  | { kind: "recording"; draft: RecordingDraft }
  | { kind: "import"; input: { file_name: string; duration_sec: number; template_id: string; language: Lang; auto_detect_languages?: boolean } };

export async function createSession(ctx: ServerContext, source: CreateInput): Promise<{ id: string }> {
  const db = getDb();
  const user = (await db.select().from(users).where(eq(users.id, ctx.userId)).limit(1))[0];
  const reportLang = ((user?.defaultReportLanguage || user?.uiLanguage || "vi") as Lang) ?? "vi";
  const id = `s-new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date();

  const draft: RecordingDraft =
    source.kind === "recording"
      ? source.draft
      : {
          title: source.input.file_name.replace(/\.[^.]+$/, ""),
          template_id: source.input.template_id,
          primary_language: source.input.language,
          auto_detect_languages: source.input.auto_detect_languages,
          duration_sec: source.input.duration_sec,
          notes: [],
          bookmarks: [],
          photos: [],
          levels: [],
        };

  const detail: SessionDetail = {
    id,
    user_id: ctx.userId,
    workspace_id: null,
    visibility: "private",
    owner_user_id: ctx.userId,
    title: draft.title ?? "",
    template_id: draft.template_id,
    primary_language: draft.primary_language,
    detected_languages: [draft.primary_language],
    report_languages: [reportLang],
    original_report_language: reportLang,
    status: "processing",
    processing_step: 1,
    storage_status: "full",
    duration_sec: draft.duration_sec,
    size_bytes: source.kind === "recording" ? Math.round(draft.duration_sec * 3000) : Math.round(draft.duration_sec * 16_000),
    created_at: now.toISOString(),
    audio_expires_at: null,
    // Buổi tạo từ màn ghi âm chưa thu tiếng thật (PR 04 mới lưu R2): bản ghi thử
    trial_recording: source.kind === "recording" ? true : undefined,
    consent: draft.consent
      ? {
          confirmed: draft.consent.confirmed,
          announced: draft.consent.announced,
          receipts: draft.consent.receipts,
        }
      : { confirmed: true, announced: false },
    participant_contact_ids: [],
    peaks_thumb: source.kind === "recording" && draft.levels.length >= 6 ? resampleThumb(draft.levels) : syntheticThumb(),
    speaker_colors_thumb: Array.from({ length: 40 }, () => 0),
    open_task_count: 0,
    executive_summary: "",
    speakers: [],
    topics: [],
    action_items: [],
    notes: draft.notes.map((n, i) => ({ id: `n-${i}`, timestamp_sec: n.timestamp_sec, text: n.text })),
    bookmarks: draft.bookmarks.map((b, i) => ({
      id: `m-${i}`,
      timestamp_sec: b.timestamp_sec,
      tag: (b.tag as SemanticTag | null) ?? null,
      note: b.note ?? "",
    })),
    // Ảnh chỉ lưu id: pixel nằm ở IndexedDB theo id (lib/record/photo-store.ts)
    photos: draft.photos.map((p) => ({ id: p.id, timestamp_sec: p.timestamp_sec, url: "" })),
    peaks: [],
    speaker_spans: [],
    send_history: [],
    gap_check: draft.gap_check
      ? {
          template_id: draft.gap_check.template_id,
          checked_at: draft.gap_check.checked_at,
          ...draft.gap_check.result,
        }
      : undefined,
    gap_check_done: [],
    pending_ai_questions: draft.pending_ai_questions?.length ? [...draft.pending_ai_questions] : undefined,
  };

  await db.insert(sessions).values({
    id,
    userId: ctx.userId,
    workspaceId: null,
    visibility: "private",
    ownerUserId: ctx.userId,
    title: detail.title,
    templateId: detail.template_id,
    primaryLanguage: detail.primary_language,
    detectedLanguages: detail.detected_languages,
    reportLanguages: detail.report_languages,
    originalReportLanguage: detail.original_report_language,
    status: "processing",
    processingStep: 1,
    durationSec: Math.round(detail.duration_sec),
    sizeBytes: Math.round(detail.size_bytes),
    trialRecording: source.kind === "recording",
    consent: detail.consent,
    peaksThumb: detail.peaks_thumb,
    speakerColorsThumb: detail.speaker_colors_thumb,
    createdAt: now,
  });
  await db.insert(sessionDetails).values({
    sessionId: id,
    notes: detail.notes,
    bookmarks: detail.bookmarks,
    photos: detail.photos,
    gapCheck: detail.gap_check ?? null,
    pendingAiQuestions: detail.pending_ai_questions ?? [],
    draft,
  });

  // Gắn buổi vào thư mục chọn lúc bắt đầu ghi (GC-05, đặc tả §4.7)
  if (draft.folder_id) {
    const folder = (
      await db
        .select()
        .from(folders)
        .where(and(eq(folders.id, draft.folder_id), eq(folders.ownerUserId, ctx.userId)))
        .limit(1)
    )[0];
    if (folder) {
      await db.insert(folderSessions).values({ folderId: folder.id, sessionId: id }).onConflictDoNothing();
    }
  }

  return { id };
}

/** Sinh nội dung khi đến hạn xử lý xong (bước 5 → xong): khớp completeProcessing của bản giả. */
async function finalizeProcessing(row: SessionRow): Promise<void> {
  const db = getDb();
  if (row.status !== "processing") return;
  const detail = await getDetailRow(row.id);
  const draft = detail.draft as RecordingDraft | null;
  const planRow = (await db.select().from(users).where(eq(users.id, row.userId)).limit(1))[0];

  if (draft) {
    const template = templateById(draft.template_id);
    const content = await buildSessionContent({ sessionId: row.id, draft, template, createdAt: row.createdAt.toISOString() });
    await db.delete(actionItems).where(eq(actionItems.sessionId, row.id));
    if (content.action_items.length) {
      await db.insert(actionItems).values(
        content.action_items.map((a) => ({
          id: a.id,
          sessionId: row.id,
          task: a.task,
          assigneeContactId: a.assignee_contact_id,
          assigneeUserId: a.assignee_user_id ?? null,
          dueDate: a.due_date,
          priority: a.priority,
          done: a.done,
          doneAt: null,
          sourceQuote: a.source_quote,
          timestampSec: a.timestamp_sec,
        })),
      );
    }
    await db
      .update(sessionDetails)
      .set({
        executiveSummary: content.executive_summary,
        speakers: content.speakers,
        topics: content.topics,
        notes: content.notes,
        bookmarks: content.bookmarks,
        photos: content.photos,
        peaks: content.peaks,
        speakerSpans: content.speaker_spans,
        draft: null,
      })
      .where(eq(sessionDetails.sessionId, row.id));
    await db
      .update(sessions)
      .set({
        status: "ready",
        processingStep: null,
        failureReason: null,
        headlineTag: content.headline_tag ?? null,
        openTaskCount: content.open_task_count,
        peaksThumb: content.peaks_thumb,
        speakerColorsThumb: content.speaker_colors_thumb,
        // Gói Free: bản gốc tự xóa sau 7 ngày; Pro giữ đến khi tự dọn
        audioExpiresAt:
          (planRow?.plan ?? "free") === "free" ? new Date(row.createdAt.getTime() + 7 * 86400_000) : null,
      })
      .where(eq(sessions.id, row.id));
    return;
  }

  // Không có bản nháp (buổi nhập/xử lý lại): chỉ đánh dấu đã xử lý xong
  await db
    .update(sessions)
    .set({ status: "ready", processingStep: null, failureReason: null })
    .where(eq(sessions.id, row.id));
}

function stepAt(row: SessionRow): number {
  const elapsed = Date.now() - row.createdAt.getTime();
  return Math.min(PROCESS_STEPS, 1 + Math.floor(elapsed / PROCESS_STEP_MS));
}

/** Bước xử lý hiện tại; đến hạn thì hoàn tất (lười — không cần worker nền). */
export async function getProcessingState(ctx: ServerContext, id: string): Promise<{ status: SessionStatus; step: number; asr_stage: string | null; asr_error: string | null }> {
  const row = await getOwnedSessionRow(ctx, id);
  if (isRealAudioSession(row)) {
    // Luồng nội dung thật (C1-05): bước đọc từ stage ASR, không hoàn tất mockup
    const state = stateOf(row);
    return {
      status: state.status as SessionStatus,
      step: state.step,
      asr_stage: state.asr_stage,
      asr_error: state.asr_error,
    };
  }
  await finalizeIfDue(ctx, row);
  const fresh = (await getDb().select().from(sessions).where(eq(sessions.id, id)).limit(1))[0] ?? row;
  if (fresh.status === "processing") {
    return { status: "processing", step: stepAt(fresh), asr_stage: null, asr_error: null };
  }
  return { status: fresh.status as SessionStatus, step: PROCESS_STEPS + 1, asr_stage: null, asr_error: null };
}

/** Buổi có băng thật trên R2 chạy luồng ASR (C1-05) — KHÔNG hoàn tất mockup. */
function isRealAudioSession(row: SessionRow): boolean {
  return isAudioObjectKey(row.audioPath);
}

async function finalizeIfDue(_ctx: ServerContext, row: SessionRow): Promise<void> {
  if (row.status !== "processing") return;
  if (isRealAudioSession(row)) return; // luồng ASR tự hoàn tất qua process/cron
  if (Date.now() - row.createdAt.getTime() < PROCESS_STEPS * PROCESS_STEP_MS) return;
  await finalizeProcessing(row);
}

/** Danh sách đang xử lý đã đến hạn: hoàn tất để thư viện không kẹt "Đang xử lý". */
async function finalizeDueAll(ctx: ServerContext): Promise<void> {
  const db = getDb();
  const due = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, ctx.userId),
        eq(sessions.status, "processing"),
        sql`${sessions.createdAt} < now() - interval '${sql.raw(String(PROCESS_STEPS * PROCESS_STEP_MS + 500))} milliseconds'`,
      ),
    );
  for (const row of due) {
    if (isRealAudioSession(row)) continue; // luồng ASR tự hoàn tất qua process/cron
    await finalizeProcessing(row);
  }
}

export async function retryProcessing(ctx: ServerContext, id: string): Promise<void> {
  const db = getDb();
  const row = await getOwnedSessionRow(ctx, id);
  if (isRealAudioSession(row)) {
    // Luồng ASR (C1-05): nút "Thử lại" đưa buổi failed về queued, màn
    // processing tự gọi process tiếp
    await retryPipeline(id);
    return;
  }
  await db
    .update(sessions)
    .set({ status: "processing", processingStep: 1, failureReason: null, createdAt: new Date() })
    .where(and(eq(sessions.id, id), eq(sessions.userId, ctx.userId)));
}

export async function reprocessSession(ctx: ServerContext, id: string, templateId: string): Promise<void> {
  const db = getDb();
  await getOwnedSessionRow(ctx, id);
  const template = templateById(templateId);
  if (template) {
    const detail = await getDetailRow(id);
    const topics = ((detail.topics as Topic[]) ?? []).map((t) => ({ ...t }));
    const sectionIds = template.sections.map((s) => s.id);
    for (const topic of topics) {
      if (sectionIds.includes(topic.section_id)) continue;
      const oldIndex = topics.indexOf(topic);
      topic.section_id = sectionIds[Math.min(oldIndex, sectionIds.length - 1)] ?? topic.section_id;
    }
    await db.update(sessionDetails).set({ topics }).where(eq(sessionDetails.sessionId, id));
    await db
      .update(sessions)
      .set({ templateId, status: "processing", processingStep: 1, failureReason: null, createdAt: new Date() })
      .where(and(eq(sessions.id, id), eq(sessions.userId, ctx.userId)));
  } else {
    await db
      .update(sessions)
      .set({ status: "processing", processingStep: 1, failureReason: null, createdAt: new Date() })
      .where(and(eq(sessions.id, id), eq(sessions.userId, ctx.userId)));
  }
}

export async function removeSession(ctx: ServerContext, id: string): Promise<void> {
  const db = getDb();
  const row = await getOwnedSessionRow(ctx, id);
  // Xóa băng trên kho (C1-04 yêu cầu 4): xóa buổi là băng cũng mất — khôi
  // phục được buổi nhưng không còn âm thanh. Chỉ đụng khóa u/… (buổi mẫu
  // giữ file tĩnh, không xóa).
  if (isAudioObjectKey(row.audioPath)) {
    await deleteObjectSafe(row.audioPath as string);
  }
  // Xóa mềm: còn "Hoàn tác" (M4-01)
  await db
    .update(sessions)
    .set({ deletedAt: new Date(), audioPath: null, audioExpiresAt: null, sizeBytes: 0 })
    .where(and(eq(sessions.id, id), eq(sessions.userId, ctx.userId)));
}

export async function restoreSession(ctx: ServerContext, id: string): Promise<void> {
  const db = getDb();
  await getOwnedSessionRow(ctx, id);
  await db.update(sessions).set({ deletedAt: null }).where(and(eq(sessions.id, id), eq(sessions.userId, ctx.userId)));
}

export async function purgeRaw(ctx: ServerContext, ids: string[]): Promise<{ freed_bytes: number }> {
  const db = getDb();
  let freed = 0;
  for (const id of ids) {
    const row = await getOwnedSessionRow(ctx, id);
    freed += row.sizeBytes;
    // Băng thật trên R2 cũng bị xóa để chép chỗ (C1-04); buổi mẫu giữ file tĩnh.
    if (isAudioObjectKey(row.audioPath)) {
      await deleteObjectSafe(row.audioPath as string);
    }
    await db
      .update(sessions)
      .set({
        storageStatus: "essence_only",
        sizeBytes: 0,
        audioExpiresAt: null,
        audioPath: isAudioObjectKey(row.audioPath) ? null : row.audioPath,
      })
      .where(and(eq(sessions.id, id), eq(sessions.userId, ctx.userId)));
    await db.delete(transcriptSegments).where(eq(transcriptSegments.sessionId, id));
  }
  return { freed_bytes: freed };
}

export async function updateSession(
  ctx: ServerContext,
  id: string,
  patch: Partial<Pick<Session, "title" | "template_id" | "participant_contact_ids" | "audio_expires_at">>,
): Promise<void> {
  const db = getDb();
  await getOwnedSessionRow(ctx, id);
  const set: Record<string, unknown> = {};
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.template_id !== undefined) set.templateId = patch.template_id;
  if (patch.participant_contact_ids !== undefined) set.participantContactIds = patch.participant_contact_ids;
  if (patch.audio_expires_at !== undefined) set.audioExpiresAt = patch.audio_expires_at ? new Date(patch.audio_expires_at) : null;
  if (Object.keys(set).length === 0) return;
  await db.update(sessions).set(set).where(and(eq(sessions.id, id), eq(sessions.userId, ctx.userId)));
}

/* ---------- Các thao tác nhỏ trên buổi (điểm gom một route) ---------- */

/**
 * C1-09 — tính lại người nói sau MỌI lần đổi người nói của buổi: tỉ lệ nói
 * từng người từ độ dài đoạn lời, speaker_spans theo đoạn hiện tại, dải màu
 * cột thumb theo spans. Người hết đoạn giữ nguyên dữ liệu nhưng tỉ lệ về 0
 * (màn hình lọc tỉ lệ 0 nên người đó ẩn khỏi đầu buổi và tỉ lệ nói).
 */
async function recomputeSpeakerStats(row: SessionRow, speakers: Speaker[]): Promise<void> {
  const db = getDb();
  const segs = await db
    .select({ speakerId: transcriptSegments.speakerId, startSec: transcriptSegments.startSec, endSec: transcriptSegments.endSec })
    .from(transcriptSegments)
    .where(eq(transcriptSegments.sessionId, row.id))
    .orderBy(transcriptSegments.startSec);
  const current = speakers.map((s) => ({ ...s }));
  const durations = new Map<string, number>();
  for (const seg of segs) durations.set(seg.speakerId, (durations.get(seg.speakerId) ?? 0) + Math.max(0, seg.endSec - seg.startSec));
  const total = [...durations.values()].reduce((a, b) => a + b, 0) || 1;
  for (const sp of current) {
    const d = durations.get(sp.id) ?? 0;
    const pct = Math.round((d / total) * 100);
    // Người còn đoạn nhưng quá ít tiếng (dưới 0,5%) vẫn giữ ≥1% để không bị
    // nhầm là hết đoạn; hết đoạn thì đúng là 0
    sp.talk_ratio_percent = d > 0 && pct === 0 ? 1 : pct;
    if (d > 0) {
      const first = segs.find((s) => s.speakerId === sp.id);
      if (first) sp.sample_start_sec = Math.max(0, first.startSec);
    }
  }
  const spans = segs.map((s) => ({ speaker_id: s.speakerId, start_sec: s.startSec, end_sec: s.endSec }));
  const colorAt = (t: number): number => {
    const span = spans.find((sp) => t >= sp.start_sec && t < sp.end_sec) ?? spans[spans.length - 1];
    const sp = current.find((s) => s.id === span?.speaker_id);
    return sp ? sp.color_index : 0;
  };
  const colorsThumb = Array.from({ length: THUMB_COUNT }, (_, i) => colorAt(((i + 0.5) / THUMB_COUNT) * Math.max(1, row.durationSec)));
  await db.update(sessionDetails).set({ speakers: current, speakerSpans: spans }).where(eq(sessionDetails.sessionId, row.id));
  await db.update(sessions).set({ speakerColorsThumb: colorsThumb }).where(eq(sessions.id, row.id));
}

/** Các đoạn LIỀN SAU `segmentId` cùng người nói cũ (dừng ở người khác). */
async function followingSegmentIds(sessionId: string, segmentId: string, oldSpeakerId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ id: transcriptSegments.id, speakerId: transcriptSegments.speakerId })
    .from(transcriptSegments)
    .where(eq(transcriptSegments.sessionId, sessionId))
    .orderBy(transcriptSegments.startSec);
  const out: string[] = [];
  const idx = rows.findIndex((r) => r.id === segmentId);
  for (let i = idx + 1; i < rows.length; i++) {
    if (rows[i].speakerId !== oldSpeakerId) break;
    out.push(rows[i].id);
  }
  return out;
}

export async function applySessionAction(ctx: ServerContext, id: string, action: SessionAction): Promise<unknown> {
  const db = getDb();
  const sessionRow = await getOwnedSessionRow(ctx, id);
  const detail = await getDetailRow(id);

  switch (action.type) {
    case "updateBullet": {
      const topics = ((detail.topics as Topic[]) ?? []).map((t) => ({
        ...t,
        bullets: t.bullets.map((b) => (b.id === action.bulletId ? { ...b, text: action.text, edited: true } : b)),
      }));
      await db.update(sessionDetails).set({ topics }).where(eq(sessionDetails.sessionId, id));
      // Sửa ý ở bản gốc: mọi bản dịch hiện "Bản gốc đã sửa sau khi dịch" (M6-03)
      await db.update(summaryVersions).set({ stale: true }).where(eq(summaryVersions.sessionId, id));
      return { ok: true };
    }
    case "updateSegment": {
      const seg = (
        await db
          .select()
          .from(transcriptSegments)
          .where(and(eq(transcriptSegments.sessionId, id), eq(transcriptSegments.id, action.segmentId)))
          .limit(1)
      )[0];
      if (!seg) throw new DataError("not_found");
      const translations = { ...(seg.translations as TranscriptSegment["translations"]) };
      if (action.field === "text_clean") {
        // Bản gọn sửa text_clean, không đụng câu Nguyên văn (M8-01)
        await db
          .update(transcriptSegments)
          .set({ textClean: action.text, edited: true })
          .where(and(eq(transcriptSegments.sessionId, id), eq(transcriptSegments.id, action.segmentId)));
        // C1-09 mục 4: lời đã sửa sau lần tóm tắt gần nhất → cần tóm tắt lại
        await db.update(sessions).set({ transcriptStale: true }).where(eq(sessions.id, id));
        return { ok: true };
      }
      // Câu gốc đã sửa: bản dịch hiện có của đoạn chuyển "Cần dịch lại" (M6-02)
      for (const key of Object.keys(translations) as Lang[]) {
        if (translations[key]) translations[key] = { ...translations[key]!, stale: true };
      }
      await db
        .update(transcriptSegments)
        .set({ text: action.text, edited: true, translations })
        .where(and(eq(transcriptSegments.sessionId, id), eq(transcriptSegments.id, action.segmentId)));
      // C1-09 mục 4: câu Nguyên văn đã sửa → cần tóm tắt lại
      await db.update(sessions).set({ transcriptStale: true }).where(eq(sessions.id, id));
      return { ok: true };
    }
    case "reassignSegment": {
      const speakers = (detail.speakers as Speaker[]) ?? [];
      if (!speakers.some((s) => s.id === action.speakerId)) throw new DataError("not_found");
      const seg = (
        await db
          .select({ id: transcriptSegments.id })
          .from(transcriptSegments)
          .where(and(eq(transcriptSegments.sessionId, id), eq(transcriptSegments.id, action.segmentId)))
          .limit(1)
      )[0];
      if (!seg) throw new DataError("not_found");
      await db
        .update(transcriptSegments)
        .set({ speakerId: action.speakerId })
        .where(and(eq(transcriptSegments.sessionId, id), eq(transcriptSegments.id, action.segmentId)));
      // C1-09: tính lại tỉ lệ nói, speaker_spans, màu thumb sau MỌI lần đổi;
      // lời đã đổi người sau lần tóm tắt gần nhất thì đánh dấu cần tóm tắt lại
      await db.update(sessions).set({ transcriptStale: true }).where(eq(sessions.id, id));
      await recomputeSpeakerStats(sessionRow, (detail.speakers as Speaker[]) ?? []);
      return { ok: true };
    }
    case "addSpeakerAndReassign": {
      // C1-09 mục 2: thêm người nói mới (id kế tiếp, color_index chưa dùng,
      // chưa có tên) rồi gán đoạn đang chọn cho người đó, một thao tác phía
      // máy chủ. Trả thêm các đoạn LIỀN SAU cùng người nói cũ để sheet hỏi
      // "Đổi luôn N đoạn liền sau?" (không bắt buộc).
      const speakers = (((detail.speakers as Speaker[]) ?? []) as Speaker[]).map((s) => ({ ...s }));
      const seg = (
        await db
          .select()
          .from(transcriptSegments)
          .where(and(eq(transcriptSegments.sessionId, id), eq(transcriptSegments.id, action.segmentId)))
          .limit(1)
      )[0];
      if (!seg) throw new DataError("not_found");
      const oldSpeakerId = seg.speakerId;
      if (!speakers.some((s) => s.id === oldSpeakerId)) throw new DataError("not_found");
      // Id kế tiếp chưa dùng trong SPK_01, SPK_02, ...
      let nextNum = 1;
      for (const sp of speakers) {
        const m = /^SPK_(\d+)$/.exec(sp.id);
        if (m) nextNum = Math.max(nextNum, Number(m[1]) + 1);
      }
      const newId = `SPK_${String(nextNum).padStart(2, "0")}`;
      // Màu kế tiếp chưa dùng; hết 6 màu thì quay vòng theo số thứ tự
      const usedColors = new Set(speakers.map((s) => s.color_index));
      let colorIndex = 0;
      while (usedColors.has(colorIndex) && colorIndex < 6) colorIndex++;
      if (colorIndex >= 6) colorIndex = (speakers.length) % 6;
      speakers.push({
        id: newId,
        contact_id: null,
        display_name: null,
        is_me: false,
        color_index: colorIndex,
        talk_ratio_percent: 0,
        sample_start_sec: Math.max(0, seg.startSec),
      });
      await db.update(sessionDetails).set({ speakers }).where(eq(sessionDetails.sessionId, id));
      await db
        .update(transcriptSegments)
        .set({ speakerId: newId })
        .where(and(eq(transcriptSegments.sessionId, id), eq(transcriptSegments.id, action.segmentId)));
      await db.update(sessions).set({ transcriptStale: true }).where(eq(sessions.id, id));
      // Truyền đúng danh sách người nói ĐÃ CÓ người mới (recompute không tự
      // đọc lại từ detail đọc đầu hàm, tránh ghi đè mất người vừa thêm)
      await recomputeSpeakerStats(sessionRow, speakers);
      const followingIds = await followingSegmentIds(id, action.segmentId, oldSpeakerId);
      console.log(`[speaker] ok ${JSON.stringify({ sessionId: id, event: "add", newSpeaker: newId, following: followingIds.length, ts: new Date().toISOString() })}`);
      return { speaker_id: newId, following_ids: followingIds };
    }
    case "reassignSegments": {
      // C1-09 mục 2: đổi nhiều đoạn liền sau sang một người nói (chọn từ kết
      // quả "Đổi luôn N đoạn liền sau"). Mỗi đoạn phải thuộc buổi này.
      if (!(detail.speakers as Speaker[]).some((s) => s.id === action.speakerId)) throw new DataError("not_found");
      const rowsById = new Set(
        (await db.select({ id: transcriptSegments.id }).from(transcriptSegments).where(eq(transcriptSegments.sessionId, id))).map((r) => r.id),
      );
      for (const segId of action.segmentIds) {
        if (!rowsById.has(segId)) throw new DataError("not_found");
      }
      await db
        .update(transcriptSegments)
        .set({ speakerId: action.speakerId })
        .where(and(eq(transcriptSegments.sessionId, id), inArray(transcriptSegments.id, action.segmentIds)));
      await db.update(sessions).set({ transcriptStale: true }).where(eq(sessions.id, id));
      await recomputeSpeakerStats(sessionRow, (detail.speakers as Speaker[]) ?? []);
      return { ok: true };
    }
    case "resummarize": {
      // C1-09 mục 4: tóm tắt lại trên bản lời hiện tại (đã sửa, đúng người
      // nói) theo luồng asr_stage sẵn có, đặt stage "summarizing" để màn xử
      // lý và ProcessingWatcher tự đẩy. Chặn TRƯỚC khi gọi AI: hạn mức Free
      // đếm phía máy chủ, chỉ lần TÓM TẮT THÀNH CÔNG mới được đếm.
      const me = (await db.select().from(users).where(eq(users.id, ctx.userId)).limit(1))[0];
      if ((me?.plan ?? "free") !== "pro" && sessionRow.resummarizeCount >= FREE_RESUMMARIZE_PER_SESSION) {
        throw new DataError("quota_exceeded");
      }
      // Buổi đang xử lý dở thì không chen vào luồng
      const stage = (sessionRow.asrStage as AsrStage | null) ?? null;
      if (stage !== null && stage !== "done") throw new DataError("server", "Buổi đang xử lý, chờ xong rồi tóm tắt lại");
      // Không có bản chữ thì không có gì để tóm tắt lại
      const segCount = (
        await db.select({ n: sql<number>`count(*)::int` }).from(transcriptSegments).where(eq(transcriptSegments.sessionId, id))
      )[0]?.n ?? 0;
      if (segCount === 0) throw new DataError("not_found");
      // Mốc kiểm thử e2e: lần này lỗi mô phỏng (không đổi trạng thái, không trừ lượt)
      if (sessionRow.title.includes("[failsum]")) {
        throw new ApiError(502, "resummarize_failed", "Chưa tóm tắt lại được, thử lại sau");
      }
      await db
        .update(sessions)
        .set({
          asrStage: "summarizing",
          asrUpdatedAt: new Date(),
          asrError: null,
          failureReason: null,
          status: "processing",
          resummarizePending: true,
        })
        .where(eq(sessions.id, id));
      console.log(`[asr] ${JSON.stringify({ sessionId: id, event: "resummarize-requested", count: sessionRow.resummarizeCount, ts: new Date().toISOString() })}`);
      return { ok: true };
    }
    case "addQuickNote": {
      const clean = action.text.trim();
      if (!clean) return { ok: true };
      // Ghi chú nhanh gắn vào ý có mốc gần nhất để hiện trong Tóm tắt (GC-04)
      const note: Note = { id: `n-user-${Date.now().toString(36)}`, timestamp_sec: 0, text: clean };
      const notes = [...((detail.notes as Note[]) ?? []), note];
      const topics = ((detail.topics as Topic[]) ?? []).map((t) => ({ ...t, bullets: [...t.bullets] }));
      const bullets = topics.flatMap((tp) => tp.bullets);
      if (bullets.length) {
        const nearest = bullets.reduce((best, b) =>
          Math.abs(b.timestamp_sec - note.timestamp_sec) < Math.abs(best.timestamp_sec - note.timestamp_sec) ? b : best,
        );
        nearest.note_ids.push(note.id);
        await db.update(sessionDetails).set({ notes, topics }).where(eq(sessionDetails.sessionId, id));
      } else {
        await db.update(sessionDetails).set({ notes }).where(eq(sessionDetails.sessionId, id));
      }
      return { ok: true };
    }
    case "completeGapCheckItem": {
      const done = detail.gapCheckDone ?? [];
      if (!done.includes(action.key)) {
        await db
          .update(sessionDetails)
          .set({ gapCheckDone: [...done, action.key] })
          .where(eq(sessionDetails.sessionId, id));
      }
      return { ok: true };
    }
    case "consumePendingAiQuestion": {
      const list = detail.pendingAiQuestions ?? [];
      await db
        .update(sessionDetails)
        .set({ pendingAiQuestions: list.filter((q) => q !== action.question) })
        .where(eq(sessionDetails.sessionId, id));
      return { ok: true };
    }
    case "translateSegments": {
      const lang = action.lang;
      const rows = await db.select().from(transcriptSegments).where(eq(transcriptSegments.sessionId, id)).orderBy(transcriptSegments.startSec);
      const targets: Array<typeof transcriptSegments.$inferSelect> = [];
      for (const seg of rows) {
        if (action.segmentIds && !action.segmentIds.includes(seg.id)) continue;
        if ((seg.lang as Lang) === lang) continue;
        const translations = { ...(seg.translations as TranscriptSegment["translations"]) };
        const existing: TranslationEntry | undefined = translations[lang];
        if (existing && (!existing.stale || !action.segmentIds)) continue;
        targets.push(seg);
      }
      if (targets.length) {
        // Dịch thật bằng Gemini (C1-08): dịch cả đợt rồi mới ghi — lỗi giữa
        // chừng thì không ghi mục nào, tránh dịch lưng chừng khó hiểu
        const started = Date.now();
        try {
          const map = await translateTexts({
            items: targets.filter((seg) => seg.text.trim()).map((seg) => ({ id: seg.id, text: seg.text })),
            targetLang: lang,
          });
          for (const seg of targets) {
            const translations = { ...(seg.translations as TranscriptSegment["translations"]) };
            const text = map.get(seg.id);
            if (!text) continue; // mục rỗng: giữ nguyên trạng thái cũ
            translations[lang] = { text, stale: false };
            await db
              .update(transcriptSegments)
              .set({ translations })
              .where(and(eq(transcriptSegments.sessionId, id), eq(transcriptSegments.id, seg.id)));
          }
          console.log(`[translate] ok ${JSON.stringify({ sessionId: id, kind: "segments", lang, ms: Date.now() - started, count: targets.length, ts: new Date().toISOString() })}`);
        } catch (error) {
          const code = error instanceof GeminiError ? `gemini_${error.step}${error.status ? `_${error.status}` : ""}` : "unknown";
          console.error(`[translate] lỗi ${JSON.stringify({ sessionId: id, kind: "segments", lang, ms: Date.now() - started, code, ts: new Date().toISOString() })}`);
          throw new ApiError(502, "translate_failed", "Chưa dịch được, thử lại sau");
        }
      }
      const fresh = await db.select().from(transcriptSegments).where(eq(transcriptSegments.sessionId, id)).orderBy(transcriptSegments.startSec);
      return { transcript: fresh.map(toSegment) };
    }
    case "nameSpeaker": {
      const speakers = ((detail.speakers as Speaker[]) ?? []).map((s) => ({ ...s }));
      const sp = speakers.find((s) => s.id === action.speakerId);
      if (!sp) throw new DataError("not_found");
      const contact = (
        await db
          .select()
          .from(contacts)
          .where(and(eq(contacts.id, action.contactId), eq(contacts.userId, ctx.userId)))
          .limit(1)
      )[0];
      if (!contact) throw new DataError("not_found");
      // Một liên hệ chỉ gán cho một người nói trong cùng buổi (M3-02):
      // người nói nào đang giữ liên hệ này thì trả về chưa đặt tên
      speakers.forEach((other) => {
        if (other.id !== action.speakerId && other.contact_id === action.contactId) {
          other.contact_id = null;
          other.display_name = null;
        }
      });
      sp.contact_id = action.contactId;
      sp.display_name = contact.name;
      await db.update(sessionDetails).set({ speakers }).where(eq(sessionDetails.sessionId, id));
      return { ok: true };
    }
    case "mergeSpeakers": {
      const speakers = ((detail.speakers as Speaker[]) ?? []).map((s) => ({ ...s }));
      const from = speakers.find((s) => s.id === action.fromId);
      const into = speakers.find((s) => s.id === action.intoId);
      if (!from || !into) throw new DataError("not_found");
      into.talk_ratio_percent += from.talk_ratio_percent;
      const nextSpeakers = speakers.filter((s) => s.id !== action.fromId);
      const spans = ((detail.speakerSpans as Array<{ speaker_id: string; start_sec: number; end_sec: number }>) ?? []).map((s) => ({
        ...s,
        speaker_id: s.speaker_id === action.fromId ? action.intoId : s.speaker_id,
      }));
      const topics = ((detail.topics as Topic[]) ?? []).map((t) => ({
        ...t,
        bullets: t.bullets.map((b) => ({ ...b, speaker_id: b.speaker_id === action.fromId ? action.intoId : b.speaker_id })),
      }));
      await db.update(sessionDetails).set({ speakers: nextSpeakers, speakerSpans: spans, topics }).where(eq(sessionDetails.sessionId, id));
      await db
        .update(transcriptSegments)
        .set({ speakerId: action.intoId })
        .where(and(eq(transcriptSegments.sessionId, id), eq(transcriptSegments.speakerId, action.fromId)));
      return { ok: true };
    }
    case "updateVersionBullet": {
      await updateVersionBullet(ctx, id, action.lang, action.bulletId, action.text);
      return { ok: true };
    }
    case "recordExport": {
      // Nhật ký nhóm (M7-03) chỉ áp dụng buổi nhóm; buổi cá nhân không ghi gì
      return { ok: true };
    }
    case "restore": {
      await restoreSession(ctx, id);
      return { ok: true };
    }
    case "reprocess": {
      await reprocessSession(ctx, id, action.templateId);
      return { ok: true };
    }
    case "purgeRaw": {
      return purgeRaw(ctx, [id]);
    }
    case "setVisibility": {
      // Buổi cá nhân luôn riêng tư: đổi chỉ có ý nghĩa trong không gian Nhóm
      // (M7-01) — không gian Nhóm là việc của C1-08
      return { ok: true };
    }
    default:
      throw new ApiError(400, "bad_request", "Thao tác không hỗ trợ");
  }
}

/* ---------- Tóm tắt theo ngôn ngữ (M6-03) ---------- */

function originalVersion(d: SessionDetail): SummaryVersion {
  return {
    session_id: d.id,
    lang: d.original_report_language,
    source: "original",
    translated_from: null,
    created_at: d.created_at,
    stale: false,
    executive_summary: d.executive_summary,
    topics: d.topics,
    task_texts: Object.fromEntries(d.action_items.map((a) => [a.id, a.task])),
  };
}

function versionFromRow(row: typeof summaryVersions.$inferSelect): SummaryVersion {
  return {
    session_id: row.sessionId,
    lang: row.lang as Lang,
    source: row.source === "translated" ? "translated" : "original",
    translated_from: (row.translatedFrom as Lang | null) ?? null,
    created_at: row.createdAt.toISOString(),
    // Bản dịch MẪU cũ (trước C1-08) của buổi thật: coi là lỗi thời để hiện nút "Dịch lại" bằng AI thật
    stale: row.stale || (row.sample === true && !row.sessionId.startsWith("s-sample-")),
    executive_summary: row.executiveSummary,
    topics: (row.topics as VersionTopic[]) ?? [],
    task_texts: (row.taskTexts as Record<string, string>) ?? {},
    sample: row.sample ?? undefined,
  };
}

export async function getSummary(ctx: ServerContext, id: string, lang: Lang): Promise<SummaryVersion> {
  const db = getDb();
  const row = (await db.select().from(sessions).where(eq(sessions.id, id)).limit(1))[0];
  if (row && row.userId !== ctx.userId) throw new DataError("forbidden");
  if (row && row.userId === ctx.userId) {
    const detail = toDetail(row, await getDetailRow(id), await getTasks(id));
    if (lang === detail.original_report_language) return originalVersion(detail);
    const stored = (await db.select().from(summaryVersions).where(and(eq(summaryVersions.sessionId, id), eq(summaryVersions.lang, lang))).limit(1))[0];
    if (!stored) throw new DataError("not_found");
    return versionFromRow(stored);
  }
  if (id.startsWith("s-sample-")) {
    const fixture = await loadSampleFixture(id);
    if (fixture) {
      const d = fixture.detail;
      if (lang === d.original_report_language) return originalVersion(d);
      const stored = (fixture.summary_versions ?? []).find((v) => v.lang === lang);
      if (stored) return stored;
    }
  }
  throw new DataError("not_found");
}

export async function createSummaryVersion(ctx: ServerContext, id: string, lang: Lang): Promise<SummaryVersion> {
  const db = getDb();
  const row = (await db.select().from(sessions).where(eq(sessions.id, id)).limit(1))[0];
  if (row && row.userId !== ctx.userId) throw new DataError("forbidden");
  if (!row) throw new DataError("not_found");
  const detail = toDetail(row, await getDetailRow(id), await getTasks(id));
  if (lang === detail.original_report_language) return originalVersion(detail);
  const existing = (
    await db.select().from(summaryVersions).where(and(eq(summaryVersions.sessionId, id), eq(summaryVersions.lang, lang))).limit(1)
  )[0];
  const planRow = (await db.select().from(users).where(eq(users.id, ctx.userId)).limit(1))[0];
  const countRows = await db.select({ n: sql<number>`count(*)::int` }).from(summaryVersions).where(eq(summaryVersions.sessionId, id));
  // Gói Free: 1 bản thêm mỗi buổi (bản gốc không tính); bản lỗi thời "Dịch lại" không mất gì thêm
  if (!existing && (planRow?.plan ?? "free") === "free" && (countRows[0]?.n ?? 0) >= 1) {
    throw new DataError("quota_exceeded");
  }
  // Dịch thật bằng Gemini (C1-08): giữ nguyên số liệu/tên/ngày giờ, từng ý
  // gắn "Câu gốc" để đối chiếu. Thất bại thì báo lỗi rõ và không tạo bản —
  // lượt hạn mức không mất (bản chưa tồn tại, lần thử sau vẫn được phép).
  const started = Date.now();
  let translated: { executiveSummary: string; topics: VersionTopic[]; taskTexts: Record<string, string> };
  try {
    translated = await translateSummaryVersion(detail, lang);
  } catch (error) {
    const code = error instanceof GeminiError ? `gemini_${error.step}${error.status ? `_${error.status}` : ""}` : "unknown";
    console.error(`[translate] lỗi ${JSON.stringify({ sessionId: id, kind: "summary", lang, ms: Date.now() - started, code, ts: new Date().toISOString() })}`);
    throw new ApiError(502, "translate_failed", "Chưa dịch được, thử lại sau");
  }
  console.log(`[translate] ok ${JSON.stringify({ sessionId: id, kind: "summary", lang, ms: Date.now() - started, ts: new Date().toISOString() })}`);
  const values = {
    sessionId: id,
    lang,
    source: "translated" as const,
    translatedFrom: detail.original_report_language,
    stale: false,
    executiveSummary: translated.executiveSummary,
    topics: translated.topics,
    taskTexts: translated.taskTexts,
    sample: false,
  };
  const [saved] = await db
    .insert(summaryVersions)
    .values(values)
    .onConflictDoUpdate({
      target: [summaryVersions.sessionId, summaryVersions.lang],
      set: { stale: false, createdAt: new Date(), executiveSummary: values.executiveSummary, topics: values.topics, taskTexts: values.taskTexts, sample: false },
    })
    .returning();
  if (!detail.report_languages.includes(lang)) {
    await db.update(sessions).set({ reportLanguages: [...detail.report_languages, lang] }).where(eq(sessions.id, id));
  }
  return versionFromRow(saved);
}

export async function updateVersionBullet(ctx: ServerContext, id: string, lang: Lang, bulletId: string, text: string): Promise<void> {
  const db = getDb();
  const row = (await db.select().from(sessions).where(eq(sessions.id, id)).limit(1))[0];
  if (row && row.userId !== ctx.userId) throw new DataError("forbidden");
  if (!row) throw new DataError("not_found");
  const stored = (await db.select().from(summaryVersions).where(and(eq(summaryVersions.sessionId, id), eq(summaryVersions.lang, lang))).limit(1))[0];
  if (!stored) throw new DataError("not_found");
  const version = versionFromRow(stored);
  const topics = version.topics.map((t) => ({
    ...t,
    bullets: t.bullets.map((b) => (b.id === bulletId ? { ...b, text, edited: true } : b)),
  }));
  await db.update(summaryVersions).set({ topics }).where(eq(summaryVersions.id, stored.id));
}

/* ---------- Hỏi AI của buổi (M3-03) ---------- */

export async function chatHistory(ctx: ServerContext, sessionId: string): Promise<ChatMessage[]> {
  const db = getDb();
  const row = (await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1))[0];
  if (row && row.userId !== ctx.userId) throw new DataError("forbidden");
  if (row && row.userId === ctx.userId) {
    const rows = await db.select().from(chatMessages).where(eq(chatMessages.sessionId, sessionId)).orderBy(chatMessages.createdAt);
    return rows.map((r) => ({
      id: r.id,
      role: r.role === "ai" ? "ai" : "user",
      text: r.text,
      citations: (r.citations as Array<{ timestamp_sec: number }>) ?? [],
    }));
  }
  return []; // buổi mẫu chưa nhập: chưa có lịch sử hỏi đáp
}

export async function chatAsk(ctx: ServerContext, sessionId: string, question: string): Promise<ChatMessage> {
  const db = getDb();
  const row = (await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1))[0];
  if (row && row.userId !== ctx.userId) throw new DataError("forbidden");
  if (!row) throw new DataError("not_found");

  // Hạn mức 10 câu mỗi buổi của gói Free đếm PHÍA MÁY CHỦ từ lịch sử chat:
  // chỉ câu trả lời THÀNH CÔNG mới được ghi vào lịch sử (tức chỉ trừ lượt khi
  // AI trả lời được) — lỗi, hết hạn mức, AI không phản hồi thì không trừ và
  // chặn TRƯỚC khi gọi AI.
  const me = (await db.select().from(users).where(eq(users.id, ctx.userId)).limit(1))[0];
  if ((me?.plan ?? "free") !== "pro") {
    const asked = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(and(eq(chatMessages.sessionId, sessionId), eq(chatMessages.role, "user")));
    if ((asked[0]?.n ?? 0) >= FREE_CHAT_QUESTIONS_PER_SESSION) throw new DataError("quota_exceeded");
  }

  // Ngữ cảnh: tóm tắt (bản chi tiết) + bản chữ đầy đủ (mốc giây, người nói)
  const detailRow = (await db.select().from(sessionDetails).where(eq(sessionDetails.sessionId, sessionId)).limit(1))[0];
  const segRows = await db
    .select({ speakerId: transcriptSegments.speakerId, startSec: transcriptSegments.startSec, text: transcriptSegments.text })
    .from(transcriptSegments)
    .where(eq(transcriptSegments.sessionId, sessionId))
    .orderBy(transcriptSegments.startSec);
  const order = speakerOrder(
    segRows.map((s) => ({ speaker: s.speakerId, lang: "vi", start_sec: s.startSec, end_sec: s.startSec + 1, text: s.text })),
  );
  const chatCtx: SessionChatContext = {
    question,
    locale: await readUiLocale(),
    executiveSummary: detailRow?.executiveSummary ?? "",
    topics: (detailRow?.topics as Topic[]) ?? [],
    segments: segRows.map((s) => ({
      speaker_index: Math.max(0, order.indexOf(s.speakerId)),
      start_sec: s.startSec,
      text: s.text,
    })),
    speakerCount: order.length,
    durationSec: row.durationSec ?? 0,
  };
  const notFound = await notFoundText("session");

  // Buổi chưa có nội dung gì (chưa xử lý xong): trả đúng câu "không nhắc
  // tới", không gọi AI — không bịa, không tốn chi phí
  if (!chatCtx.segments.length && !chatCtx.executiveSummary && !chatCtx.topics.length) {
    await db.insert(chatMessages).values({ sessionId, role: "user", text: question, citations: [] }).onConflictDoNothing();
    const [ai] = await db.insert(chatMessages).values({ sessionId, role: "ai", text: notFound, citations: [] }).returning();
    return { id: ai.id, role: "ai", text: ai.text, citations: [] };
  }

  const started = Date.now();
  try {
    const { answer, citations } = await answerSessionChat(chatCtx, notFound);
    await db.insert(chatMessages).values({ sessionId, role: "user", text: question, citations: [] }).onConflictDoNothing();
    const [ai] = await db.insert(chatMessages).values({ sessionId, role: "ai", text: answer, citations }).returning();
    console.log(`[chat] ok ${JSON.stringify({ sessionId, ms: Date.now() - started, citations: citations.length, ts: new Date().toISOString() })}`);
    return { id: ai.id, role: "ai", text: ai.text, citations };
  } catch (error) {
    const code =
      error instanceof GeminiError
        ? `gemini_${error.step}${error.status ? `_${error.status}` : ""}`
        : error instanceof DataError
          ? error.code
          : "unknown";
    // Nhật ký chỉ có sessionId, độ trễ, mã lỗi — không ghi câu hỏi/câu trả lời/bản chữ
    console.error(`[chat] lỗi ${JSON.stringify({ sessionId, ms: Date.now() - started, code, ts: new Date().toISOString() })}`);
    if (error instanceof DataError) throw error;
    throw new ApiError(502, "ai_unavailable", "AI không trả lời được, thử lại sau");
  }
}

/* ---------- Tìm kiếm xuyên buổi (M4-02) ---------- */

export async function searchAll(ctx: ServerContext, query: string): Promise<SearchResult> {
  const db = getDb();
  const q = foldVi(query.trim());
  const out: SearchResult = { sessions: [], segments: [], tasks: [] };
  if (!q) return out;
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, ctx.userId), isNull(sessions.deletedAt)))
    .orderBy(desc(sessions.createdAt));
  for (const row of rows) {
    const [detail, tasks, segments] = await Promise.all([getDetailRow(row.id), getTasks(row.id), db.select().from(transcriptSegments).where(eq(transcriptSegments.sessionId, row.id)).orderBy(transcriptSegments.startSec)]);
    const d = toDetail(row, detail, tasks);
    const versions = await db.select().from(summaryVersions).where(eq(summaryVersions.sessionId, row.id));
    const all: SummaryVersion[] = [originalVersion(d), ...versions.map(versionFromRow)];
    const hayTitle = foldVi(
      [
        d.title,
        ...all.flatMap((v) => [
          v.executive_summary,
          ...v.topics.flatMap((t) => [t.title, ...t.bullets.flatMap((b) => [b.text, b.original_text ?? ""])]),
          ...Object.values(v.task_texts ?? {}),
        ]),
        ...tasks.map((t) => `${t.task} ${t.sourceQuote ?? ""}`),
      ].join(" "),
    );
    if (hayTitle.includes(q)) {
      // Tách phần việc cần làm: SearchResult.sessions nhận Session nhẹ
      const { action_items, ...rest } = d;
      void action_items;
      out.sessions.push(rest);
    }
    for (const seg of segments) {
      const trans = Object.values((seg.translations as TranscriptSegment["translations"]) ?? {})
        .map((tr) => tr?.text ?? "")
        .join(" ");
      if (foldVi(`${seg.text} ${trans}`).includes(q)) {
        out.segments.push({ session_id: row.id, segment: toSegment(seg) });
      }
    }
    for (const t of tasks) {
      if (foldVi(`${t.task} ${t.sourceQuote ?? ""}`).includes(q)) out.tasks.push(toActionItem(t));
    }
  }
  out.segments.sort((a, b) => a.segment.start_sec - b.segment.start_sec);
  return out;
}

/* ---------- Nhập buổi mẫu vào tài khoản mới (nhóm yêu cầu 4) ---------- */

export async function importSample(ctx: ServerContext, profession: Profession): Promise<{ id: string }> {
  const db = getDb();
  const template = templatesOfProfession(profession);
  const fixture = await loadSampleFixtureByProfession(profession);
  if (!fixture) throw new DataError("not_found");
  const id = `s-sample-${profession}-${ctx.userId.slice(0, 8)}`;
  const existing = (await db.select().from(sessions).where(eq(sessions.id, id)).limit(1))[0];
  if (existing) return { id: existing.id };
  const d = fixture.detail;
  const now = new Date(d.created_at);
  await db.insert(sessions).values({
    id,
    userId: ctx.userId,
    workspaceId: null,
    visibility: "private",
    ownerUserId: ctx.userId,
    title: d.title,
    templateId: d.template_id,
    intakeTemplateId: template?.id ?? null,
    primaryLanguage: d.primary_language,
    detectedLanguages: d.detected_languages ?? [],
    reportLanguages: d.report_languages ?? [],
    originalReportLanguage: d.original_report_language,
    status: "ready",
    storageStatus: "full",
    durationSec: Math.round(d.duration_sec),
    sizeBytes: Math.round(d.size_bytes),
    audioPath: d.audio_url ?? null,
    trialRecording: false,
    isSample: true,
    consent: d.consent,
    participantContactIds: d.participant_contact_ids ?? [],
    peaksThumb: d.peaks_thumb,
    speakerColorsThumb: d.speaker_colors_thumb,
    headlineTag: d.headline_tag ?? null,
    openTaskCount: d.open_task_count,
    createdAt: Number.isNaN(now.getTime()) ? new Date() : now,
  });
  await db.insert(sessionDetails).values({
    sessionId: id,
    executiveSummary: d.executive_summary,
    speakers: d.speakers,
    topics: d.topics,
    notes: d.notes,
    bookmarks: d.bookmarks,
    photos: d.photos,
    peaks: d.peaks,
    speakerSpans: d.speaker_spans,
    sendHistory: d.send_history,
    listeningMap: fixture.listening_map ?? null,
    flowMermaid: fixture.flow_mermaid ?? null,
    gapCheck: d.gap_check ?? null,
    gapCheckDone: d.gap_check_done ?? [],
    pendingAiQuestions: d.pending_ai_questions ?? [],
  });
  const segments = fixture.transcript;
  if (segments.length) {
    await db.insert(transcriptSegments).values(
      segments.map((s) => ({
        sessionId: id,
        id: s.id,
        speakerId: s.speaker_id,
        startSec: s.start_sec,
        endSec: s.end_sec,
        text: s.text,
        textClean: s.text_clean ?? "",
        edited: s.edited ?? false,
        lang: s.lang,
        translations: s.translations ?? {},
        words: s.words ?? null,
      })),
    );
  }
  const versions = fixture.summary_versions ?? [];
  if (versions.length) {
    await db
      .insert(summaryVersions)
      .values(
        versions.map((v) => ({
          sessionId: id,
          lang: v.lang,
          source: v.source,
          translatedFrom: v.translated_from,
          stale: v.stale ?? false,
          executiveSummary: v.executive_summary,
          topics: v.topics,
          taskTexts: v.task_texts ?? {},
          sample: v.sample ?? null,
          createdAt: new Date(v.created_at),
        })),
      )
      .onConflictDoNothing();
  }
  const tasks = d.action_items;
  if (tasks.length) {
    await db
      .insert(actionItems)
      .values(
        tasks.map((a) => ({
          id: a.id,
          sessionId: id,
          task: a.task,
          assigneeContactId: a.assignee_contact_id,
          assigneeUserId: a.assignee_user_id ?? null,
          dueDate: a.due_date,
          priority: a.priority,
          done: a.done,
          doneAt: a.done_at ? new Date(a.done_at) : null,
          sourceQuote: a.source_quote,
          timestampSec: a.timestamp_sec,
        })),
      )
      .onConflictDoNothing();
  }
  return { id };
}

async function loadSampleFixtureByProfession(profession: Profession) {
  const template = templatesOfProfession(profession);
  const { listSampleIds } = await import("./sample-fixtures");
  for (const id of listSampleIds()) {
    const fx = await loadSampleFixture(id);
    if (fx && (!template || fx.detail.template_id === template.id)) return fx;
  }
  const any = await loadSampleFixture(listSampleIds()[0] ?? "");
  return any;
}
