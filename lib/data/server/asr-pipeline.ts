/**
 * C1-05 — máy trạng thái nội dung thật cho buổi có băng trên R2:
 *
 *   queued → transcribing → summarizing → done | failed
 *
 * Hàm Vercel ngắn nên KHÔNG chạy một mạch: mỗi lần `driveProcess` đẩy ĐÚNG
 * MỘT bước rồi trả trạng thái về. Người gọi đẩy tiếp:
 * - POST /api/sessions/[id]/process (chỉ chủ buổi) — màn processing tự gọi
 *   lại mỗi 3–5 giây;
 * - cron /api/cron/asr-retry quét buổi kẹt > 10 phút (asr_updated_at cũ)
 *   và đẩy tiếp;
 * - /api/audio/complete đặt stage = "queued" ngay khi chốt băng và gọi
 *   process lần đầu (không chặn phản hồi).
 *
 * Buổi KHÔNG có băng (bản ghi thử, nhập file, buổi mẫu) không vào luồng này
 * — giữ nguyên luồng mockup cũ (finalizeProcessing).
 *
 * Lưu bản chữ: transcript_segments (đoạn có người nói + mốc), speakers +
 * speaker_spans (session_details), peaks từ mảng âm lượng đã ghi. Tóm tắt:
 * Gemini (summarize.ts) → session_details.executive_summary/topics +
 * action_items + headline_tag/open_task_count — đúng cấu trúc màn chi tiết.
 *
 * Quy tắc nhật ký: chỉ ghi sessionId, bước, độ trễ, mã lỗi — KHÔNG ghi
 * transcript, nội dung tóm tắt, URL presigned hay khóa.
 */
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { actionItems, sessionDetails, sessions, summaryVersions, transcriptSegments, users } from "@/lib/db/schema";
import { fallbackPeaks, resampleMax, PEAK_COUNT, THUMB_COUNT } from "@/lib/data/mock/generate";
import { isAudioObjectKey, minuteCapForPlan, presignGetUrl } from "./r2";
import {
  fakeSonioxSegments,
  groupSonioxTokens,
  sonioxCleanup,
  sonioxFakeActive,
  sonioxFetchTokens,
  sonioxStart,
  sonioxStatus,
  SonioxError,
  type SonioxSegment,
} from "./soniox";
import {
  fakeSummaryPlan,
  geminiFakeActive,
  speakerOrder,
  summarizeTranscript,
  GeminiError,
  type SummaryPlan,
} from "./summarize";
import { templateById } from "./templates";
import type { SemanticTag, Speaker, Topic } from "../types";

export type AsrStage = "queued" | "transcribing" | "summarizing" | "done" | "failed";

type SessionRec = typeof sessions.$inferSelect;
type DetailRec = typeof sessionDetails.$inferSelect;

const PROCESS_STEPS = 5;
/** presigned GET cho Soniox lấy băng: hạn 1 giờ (chốt yêu cầu 2). */
const ASR_AUDIO_URL_TTL_SEC = 3600;
/** Cron chỉ đẩy lại buổi kẹt quá thời gian này. */
export const STUCK_AFTER_MS = 10 * 60_000;
/** Trần số lần đẩy cho một buổi — hết trần coi như hỏng, không đẩy nữa. */
export const MAX_ATTEMPTS = 20;

const ASR_STEPS: Record<AsrStage, number> = {
  queued: 2,
  transcribing: 3,
  summarizing: 4,
  done: PROCESS_STEPS + 1,
  failed: 2,
};

function logEvent(sessionId: string, event: string, extra: Record<string, unknown> = {}): void {
  console.log(`[asr] ${JSON.stringify({ sessionId, event, ...extra, ts: new Date().toISOString() })}`);
}

function now(): Date {
  return new Date();
}

/** Trạng thái xử lý dùng chung cho route process / processing / cron. */
export type ProcessState = {
  status: "processing" | "ready" | "failed";
  step: number;
  asr_stage: AsrStage | null;
  asr_error: string | null;
};

export function stateOf(row: SessionRec): ProcessState {
  const stage = (row.asrStage as AsrStage | null) ?? null;
  const status = row.status === "ready" || row.status === "failed" ? row.status : "processing";
  return {
    status,
    step: stage ? ASR_STEPS[stage] : 1,
    asr_stage: stage,
    asr_error: row.asrError ?? null,
  };
}

async function markFailed(row: SessionRec, code: string): Promise<void> {
  const db = getDb();
  // Tóm tắt lại sau khi sửa lời mà lỗi: KHÔNG chuyển buổi sang "failed" — nút
  // "Thử lại" sẽ đưa về hàng đợi và chép lời lại từ băng, ghi đè lời người
  // dùng đã sửa. Trả về trạng thái xong, giữ nguyên lời và tóm tắt cũ, không
  // đếm lượt (cờ chờ tắt, transcript_stale còn true nên băng "Tóm tắt lại"
  // vẫn hiện để bấm lại).
  if (row.resummarizePending) {
    await db
      .update(sessions)
      .set({
        asrStage: "done",
        asrError: code.slice(0, 200),
        asrUpdatedAt: now(),
        status: "ready",
        failureReason: null,
        processingStep: null,
        resummarizePending: false,
      })
      .where(eq(sessions.id, row.id));
    logEvent(row.id, "resummarize-failed", { code, attempts: row.asrAttempts });
    return;
  }
  await db
    .update(sessions)
    .set({
      asrStage: "failed",
      asrError: code.slice(0, 200),
      asrUpdatedAt: now(),
      status: "failed",
      failureReason: code.slice(0, 200),
      processingStep: null,
    })
    .where(eq(sessions.id, row.id));
  logEvent(row.id, "failed", { code, attempts: row.asrAttempts });
}

async function setStage(row: SessionRec, stage: AsrStage, extra: Partial<typeof sessions.$inferInsert> = {}): Promise<void> {
  const db = getDb();
  await db
    .update(sessions)
    .set({
      asrStage: stage,
      asrUpdatedAt: now(),
      status: "processing",
      failureReason: null,
      asrError: null,
      ...extra,
    })
    .where(eq(sessions.id, row.id));
}

function speakerNum(raw: string | null, order: string[]): number {
  return Math.max(0, order.indexOf(raw ?? "?")) + 1;
}

/* ---------- Bước 1: queued — gửi băng ra nhận dạng ---------- */

async function stepQueued(row: SessionRec, detail: DetailRec): Promise<void> {
  const db = getDb();
  const draft = detail.draft as { duration_sec?: number } | null;
  const durationSec = Math.max(row.durationSec, Math.round(draft?.duration_sec ?? 0));

  // Trần phút theo gói — vượt thì báo rõ, KHÔNG gọi nhà cung cấp
  const planRow = (await db.select({ plan: users.plan }).from(users).where(eq(users.id, row.userId)).limit(1))[0];
  const capMinutes = minuteCapForPlan(planRow?.plan ?? "free");
  if (durationSec > capMinutes * 60) {
    await markFailed(row, "quota_exceeded");
    logEvent(row.id, "quota-blocked", { durationSec, capMinutes });
    return;
  }

  if (sonioxFakeActive()) {
    // Kho giả: id nội bộ. Marker "[quota]" trong tiêu đề → mô phỏng vượt trần
    // phút (trần thật bị chặn ở presign 413 — e2e c1-audio kiểm; gate này là
    // lưới phòng thủ của pipeline, bài e2e quota dùng marker để chạm được).
    if (row.title.includes("[quota]")) {
      await markFailed(row, "quota_exceeded");
      return;
    }
    // Marker "[fail]" trong tiêu đề → lần thử ĐẦU lỗi để e2e kiểm nút
    // "Thử lại" (thử lại lần sau thì thành công).
    const failOnce = row.title.includes("[fail]") && row.asrAttempts === 0;
    if (failOnce) {
      await markFailed(row, "fake_fail_once");
      return;
    }
    await setStage(row, "transcribing", { asrTranscriptionId: `fake-${row.id}` });
    logEvent(row.id, "queued-fake");
    return;
  }

  if (!isAudioObjectKey(row.audioPath)) {
    await markFailed(row, "audio_missing");
    return;
  }
  const url = await presignGetUrl(row.audioPath as string, ASR_AUDIO_URL_TTL_SEC);
  const started = Date.now();
  try {
    const { id } = await sonioxStart(url);
    await setStage(row, "transcribing", { asrTranscriptionId: id });
    logEvent(row.id, "queued", { ms: Date.now() - started });
  } catch (error) {
    await markFailed(row, error instanceof SonioxError ? `soniox_${error.step}` : "asr_start_failed");
  }
}

/* ---------- Bước 2: transcribing — hỏi kết quả, lưu bản chữ ---------- */

function buildSpeakersAndSpans(
  sessionId: string,
  segments: SonioxSegment[],
  durationSec: number,
  levels: number[],
): {
  speakers: Speaker[];
  spans: Array<{ speaker_id: string; start_sec: number; end_sec: number }>;
  colorsThumb: number[];
  peaks: number[];
} {
  const order = speakerOrder(segments);
  const segs = segments.slice().sort((a, b) => a.start_sec - b.start_sec);
  const durations = new Map<string, number>();
  for (const s of segs) {
    const id = `SPK_${String(speakerNum(s.speaker, order)).padStart(2, "0")}`;
    durations.set(id, (durations.get(id) ?? 0) + Math.max(0, s.end_sec - s.start_sec));
  }
  const totalTalk = [...durations.values()].reduce((a, b) => a + b, 0) || 1;
  const speakers: Speaker[] = order.map((raw, i) => {
    const id = `SPK_${String(speakerNum(raw, order)).padStart(2, "0")}`;
    const first = segs.find((s) => s.speaker === raw);
    return {
      id,
      contact_id: i === 0 ? "c-me" : null,
      display_name: null,
      is_me: i === 0,
      color_index: i % 6,
      talk_ratio_percent: Math.round(((durations.get(id) ?? 0) / totalTalk) * 100),
      sample_start_sec: Math.max(0, Math.min(durationSec, Math.round(first?.start_sec ?? 0))),
    };
  });
  const spans = segs.map((s) => ({
    speaker_id: `SPK_${String(speakerNum(s.speaker, order)).padStart(2, "0")}`,
    start_sec: s.start_sec,
    end_sec: s.end_sec,
  }));
  const colorAt = (t: number): number => {
    const span = spans.find((sp) => t >= sp.start_sec && t < sp.end_sec) ?? spans[spans.length - 1];
    const idx = speakers.findIndex((sp) => sp.id === span?.speaker_id);
    return idx >= 0 ? idx % 6 : 0;
  };
  const colorsThumb = Array.from({ length: THUMB_COUNT }, (_, i) => colorAt(((i + 0.5) / THUMB_COUNT) * Math.max(1, durationSec)));
  const peaks = levels.length >= 12 ? resampleMax(levels, PEAK_COUNT) : fallbackPeaks(Math.max(1, durationSec), sessionId);
  return { speakers, spans, colorsThumb, peaks };
}

async function saveTranscript(row: SessionRec, detail: DetailRec, segments: SonioxSegment[]): Promise<void> {
  const db = getDb();
  const durationSec = Math.max(1, row.durationSec);
  const draft = detail.draft as { levels?: number[] } | null;
  const built = buildSpeakersAndSpans(row.id, segments, durationSec, draft?.levels ?? []);
  const order = speakerOrder(segments);
  const segs = segments.slice().sort((a, b) => a.start_sec - b.start_sec);
  const segRows = segs.map((s, i) => ({
    sessionId: row.id,
    id: `sg-${i + 1}`,
    speakerId: `SPK_${String(speakerNum(s.speaker, order)).padStart(2, "0")}`,
    startSec: Math.max(0, s.start_sec),
    endSec: Math.max(s.start_sec + 0.1, s.end_sec),
    text: s.text,
    textClean: s.text,
    lang: s.lang ?? "vi",
  }));
  // UPSERT thay delete+insert: hai luồng đẩy có thể đua nhau cùng lúc (người
  // dùng bấm Xử lý lại trong khi cron gọi tiếp) — lần sau ghi đè lần trước,
  // dọn đoạn thừa bằng notInArray; không cần giao dịch (PGlite chốt từng lệnh).
  if (segRows.length) {
    await db
      .insert(transcriptSegments)
      .values(segRows)
      .onConflictDoUpdate({
        target: [transcriptSegments.sessionId, transcriptSegments.id],
        set: {
          speakerId: sql`excluded.speaker_id`,
          startSec: sql`excluded.start_sec`,
          endSec: sql`excluded.end_sec`,
          text: sql`excluded.text`,
          textClean: sql`excluded.text_clean`,
          lang: sql`excluded.lang`,
        },
      });
    await db
      .delete(transcriptSegments)
      .where(and(eq(transcriptSegments.sessionId, row.id), notInArray(transcriptSegments.id, segRows.map((s) => s.id))));
  } else {
    await db.delete(transcriptSegments).where(eq(transcriptSegments.sessionId, row.id));
  }
  await db
    .update(sessionDetails)
    .set({
      speakers: built.speakers,
      speakerSpans: built.spans,
      peaks: built.peaks,
    })
    .where(eq(sessionDetails.sessionId, row.id));
  // Màu người nói cột thumb thuộc sessions (hàng thư viện/timeline)
  await db
    .update(sessions)
    .set({ speakerColorsThumb: built.colorsThumb })
    .where(eq(sessions.id, row.id));
}

async function stepTranscribing(row: SessionRec, detail: DetailRec): Promise<void> {
  const db = getDb();
  const jobId = row.asrTranscriptionId;
  if (!jobId) {
    await markFailed(row, "transcription_id_missing");
    return;
  }

  let segments: SonioxSegment[];
  if (sonioxFakeActive()) {
    const draft = detail.draft as { duration_sec?: number } | null;
    segments = fakeSonioxSegments(Math.max(row.durationSec, Math.round(draft?.duration_sec ?? 0)));
    logEvent(row.id, "transcribing-fake", { segments: segments.length });
  } else {
    const status = await sonioxStatus(jobId);
    if (status.status !== "completed") {
      // chưa xong — chỉ gia hạn thời điểm cập nhật; màn processing/cron hỏi lại
      await db.update(sessions).set({ asrUpdatedAt: now() }).where(eq(sessions.id, row.id));
      logEvent(row.id, "poll", { status: status.status });
      return;
    }
    const tokens = await sonioxFetchTokens(jobId);
    segments = groupSonioxTokens(tokens);
    // Lấy xong chữ là dọn cả việc nhận dạng lẫn file phía Soniox (chính sách
    // không lưu dữ liệu) — lỗi dọn bỏ qua, không chặn luồng.
    await sonioxCleanup(jobId, status.fileId);
    logEvent(row.id, "transcribed", { segments: segments.length });
  }

  if (!segments.length) {
    await markFailed(row, "empty_transcript");
    return;
  }
  await saveTranscript(row, detail, segments);
  await setStage(row, "summarizing", { asrTranscriptionId: null });
}

/* ---------- Bước 3: summarizing — Gemini, lưu nội dung chi tiết ---------- */

function topicsFromPlan(plan: SummaryPlan, durationSec: number): Topic[] {
  return plan.topics.map((t, i) => {
    const bullets = t.bullets.map((b, j) => ({
      id: `b-${i}-${j}`,
      text: b.text,
      timestamp_sec: b.timestamp_sec,
      speaker_id: `SPK_${String(b.speaker_index + 1).padStart(2, "0")}`,
      is_quote: b.is_quote,
      edited: false,
      note_ids: [] as string[],
    }));
    const start = bullets.length ? Math.min(...bullets.map((b) => b.timestamp_sec)) : 0;
    const end = bullets.length ? Math.max(...bullets.map((b) => b.timestamp_sec), start + 1) : Math.min(durationSec, 60);
    return {
      id: `t-${i}`,
      section_id: t.section_id,
      title: t.title,
      start_sec: Math.max(0, start),
      end_sec: Math.min(durationSec, Math.max(start + 1, end)),
      tag: t.tag,
      bullets,
    };
  });
}

async function stepSummarizing(row: SessionRec): Promise<void> {
  const db = getDb();
  const segRows = await db
    .select()
    .from(transcriptSegments)
    .where(eq(transcriptSegments.sessionId, row.id))
    .orderBy(transcriptSegments.startSec);
  if (!segRows.length) {
    await markFailed(row, "transcript_missing");
    return;
  }
  const segments: SonioxSegment[] = segRows.map((s) => ({
    // SPK_01 → "0", SPK_02 → "1" — tròn trịa cho Gemini (speaker_index 0-based)
    speaker: String(Math.max(0, Number(s.speakerId.replace(/^SPK_/, "")) - 1)),
    lang: s.lang,
    start_sec: s.startSec,
    end_sec: s.endSec,
    text: s.text,
  }));
  const durationSec = Math.max(1, row.durationSec);
  const template = templateById(row.templateId);
  const reportLang = row.originalReportLanguage ?? "vi";

  let plan: SummaryPlan;
  if (geminiFakeActive()) {
    // Mốc e2e: ép lỗi AI giữa lúc tóm tắt (chỉ ngoài production)
    if (row.title.includes("[failrun]")) {
      await markFailed(row, "gemini_fake_fail");
      return;
    }
    plan = fakeSummaryPlan(durationSec, (template?.sections ?? []).filter((s) => s.enabled).map((s) => s.id));
    logEvent(row.id, "summarize-fake");
  } else {
    try {
      plan = await summarizeTranscript({
        segments,
        speakerCount: new Set(segments.map((s) => s.speaker)).size || 1,
        template,
        reportLang,
        durationSec,
      });
    } catch (error) {
      await markFailed(row, error instanceof GeminiError ? `gemini_${error.step}` : "summarize_failed");
      return;
    }
  }

  // Việc cần làm: người nói đầu (SPK_01, là "Bạn") gán cho chủ buổi.
  // UPSERT thay delete+insert (lý do như saveTranscript): hai luồng đẩy đua
  // nhau cùng lúc thì lần sau ghi đè lần trước, dọn dòng thừa bằng notInArray.
  // C1-09 mục 4: tóm tắt lại GIỮ việc người dùng đã tick xong hoặc tự thêm
  // (id a-user-*) — AI chỉ thay các việc máy sinh (a-1, a-2, ...).
  const existingTasks = await db.select().from(actionItems).where(eq(actionItems.sessionId, row.id));
  const keptTasks = existingTasks.filter((t) => t.done || t.id.startsWith("a-user-"));
  const resummarized = row.resummarizePending === true;
  const taskRows = plan.action_items.map((a, i) => ({
    id: `a-${i + 1}`,
    sessionId: row.id,
    task: a.task,
    assigneeContactId: a.speaker_index === 0 ? "c-me" : null,
    assigneeUserId: null,
    dueDate: a.due_date,
    priority: a.priority,
    done: false,
    doneAt: null,
    sourceQuote: a.source_quote,
    timestampSec: a.timestamp_sec,
  }));
  if (taskRows.length) {
    await db
      .insert(actionItems)
      .values(taskRows)
      .onConflictDoUpdate({
        target: [actionItems.sessionId, actionItems.id],
        set: {
          task: sql`excluded.task`,
          assigneeContactId: sql`excluded.assignee_contact_id`,
          dueDate: sql`excluded.due_date`,
          priority: sql`excluded.priority`,
          // C1-09 mục 4: tóm tắt lại phải GIỮ việc người dùng đã tick xong
          // (done/doneAt của dòng cũ), không bật lại thành chưa xong
          done: resummarized ? sql`${actionItems.done}` : sql`excluded.done`,
          doneAt: resummarized ? sql`${actionItems.doneAt}` : sql`excluded.done_at`,
          sourceQuote: sql`excluded.source_quote`,
          timestampSec: sql`excluded.timestamp_sec`,
        },
      });
    const keepIds = [...keptTasks.map((t) => t.id), ...taskRows.map((t) => t.id)];
    await db
      .delete(actionItems)
      .where(and(eq(actionItems.sessionId, row.id), notInArray(actionItems.id, keepIds)));
  } else if (keptTasks.length) {
    // Không sinh được việc nào nhưng người dùng có việc của mình: giữ nguyên
  } else {
    await db.delete(actionItems).where(eq(actionItems.sessionId, row.id));
  }
  const openTaskCount = taskRows.length + keptTasks.filter((t) => !t.done).length;
  const topics = topicsFromPlan(plan, durationSec);
  const headlineTag =
    openTaskCount > 0
      ? ({ tag: "pending", count: openTaskCount } as { tag: SemanticTag; count: number })
      : topics.some((t) => t.tag === "decided")
        ? ({ tag: "decided", count: topics.filter((t) => t.tag === "decided").length } as { tag: SemanticTag; count: number })
        : null;

  await db
    .update(sessionDetails)
    .set({
      executiveSummary: plan.executive_summary,
      topics,
      draft: null,
    })
    .where(eq(sessionDetails.sessionId, row.id));
  // C1-09 mục 4: tóm tắt lại thành công thì mới đếm lượt và tắt cờ chờ;
  // lời đã dùng để tóm tắt là bản mới nhất nên gỡ băng "Tóm tắt lại". Bản
  // dịch tóm tắt theo nội dung cũ chuyển lỗi thời (hiện "Dịch lại").
  await db
    .update(sessions)
    .set({
      status: "ready",
      processingStep: null,
      failureReason: null,
      headlineTag,
      openTaskCount,
      asrStage: "done",
      asrError: null,
      asrUpdatedAt: now(),
      resummarizeCount: resummarized ? row.resummarizeCount + 1 : row.resummarizeCount,
      resummarizePending: false,
      transcriptStale: false,
    })
    .where(eq(sessions.id, row.id));
  if (resummarized) {
    await db.update(summaryVersions).set({ stale: true }).where(eq(summaryVersions.sessionId, row.id));
    console.log(`[asr] ${JSON.stringify({ sessionId: row.id, event: "resummarized", count: row.resummarizeCount + 1, topics: topics.length, tasks: openTaskCount, ts: new Date().toISOString() })}`);
  }
  logEvent(row.id, "done", { topics: topics.length, tasks: openTaskCount });
}

/* ---------- Đẩy một bước ---------- */

/**
 * Khởi tạo luồng cho buổi có băng (gọi khi chốt băng tải lên): đặt
 * stage = "queued". Chạy lại an toàn — không ghi đè stage đang chạy.
 */
export async function initPipeline(sessionId: string): Promise<void> {
  const db = getDb();
  await db
    .update(sessions)
    .set({ asrStage: "queued", asrUpdatedAt: now(), asrError: null })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.asrStage)));
}

/** Đọc chi tiết buổi, tạo dòng rỗng nếu thiếu (khớp getDetailRow của sessions.ts). */
async function ensureDetail(sessionId: string): Promise<DetailRec> {
  const db = getDb();
  const row = (await db.select().from(sessionDetails).where(eq(sessionDetails.sessionId, sessionId)).limit(1))[0];
  if (row) return row;
  await db.insert(sessionDetails).values({ sessionId }).onConflictDoNothing();
  return (await db.select().from(sessionDetails).where(eq(sessionDetails.sessionId, sessionId)).limit(1))[0]!;
}

/** Đẩy ĐÚNG MỘT bước; trả trạng thái sau khi đẩy. Stage null → không làm gì. */
export async function driveProcess(sessionId: string): Promise<ProcessState | null> {
  const db = getDb();
  let row = (await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1))[0];
  if (!row) return null;
  const stage = row.asrStage as AsrStage | null;
  if (!stage) return stateOf(row);
  // C1-09 mục 4: tóm tắt lại chạy cho cả buổi KHÔNG có băng (buổi nhập file,
  // buổi mẫu đã nhập) vì bản chữ đã có sẵn, chỉ cần Gemini tóm tắt lại. Các
  // bước khác vẫn yêu cầu băng như cũ.
  if (!isAudioObjectKey(row.audioPath) && stage !== "summarizing") return stateOf(row);

  if (stage !== "done" && row.asrAttempts >= MAX_ATTEMPTS) {
    await markFailed(row, "attempts_exhausted");
    row = (await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1))[0]!;
    return stateOf(row);
  }

  // Nhường quyền đẩy: chỉ MỘT lời gọi cùng lúc được xử lý một stage — lời gọi
  // khác về sau đọc lại trạng thái mới, không gọi hai lần Soniox/Gemini.
  const claimed = await db
    .update(sessions)
    .set({ asrAttempts: sql`${sessions.asrAttempts} + 1`, asrUpdatedAt: now() })
    .where(and(eq(sessions.id, sessionId), eq(sessions.asrStage, stage)))
    .returning({ id: sessions.id });
  if (!claimed.length) {
    const fresh = (await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1))[0];
    return fresh ? stateOf(fresh) : null;
  }

  const detail = await ensureDetail(sessionId);

  if (stage === "failed") {
    // Thử lại: quay về queued rồi đẩy tiếp bước queued trong cùng lần gọi
    await db
      .update(sessions)
      .set({ asrStage: "queued", asrError: null, status: "processing", failureReason: null, asrUpdatedAt: now() })
      .where(eq(sessions.id, sessionId));
    await stepQueued(row, detail);
  } else if (stage === "queued") {
    await stepQueued(row, detail);
  } else if (stage === "transcribing") {
    await stepTranscribing(row, detail);
  } else if (stage === "summarizing") {
    await stepSummarizing(row);
  }
  // done: không làm gì

  const fresh = (await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1))[0];
  return fresh ? stateOf(fresh) : null;
}

/** Nút "Thử lại" và cron dùng chung: buổi failed quay lại luồng (stage queued). */
export async function retryPipeline(sessionId: string): Promise<void> {
  const db = getDb();
  await db
    .update(sessions)
    .set({ asrStage: "queued", asrError: null, status: "processing", failureReason: null, processingStep: 1, asrUpdatedAt: now() })
    .where(and(eq(sessions.id, sessionId), eq(sessions.asrStage, "failed")));
}
