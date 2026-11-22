/**
 * Seed dữ liệu demo từ fixture vào DATABASE_URL — PR 02 (đặc tả C1 §1.3:
 * "script seed dữ liệu demo từ fixture giữ cho môi trường thử").
 *
 * Dùng: `node scripts/db-seed.mjs [--dry]` (hoặc `pnpm db:seed [--dry]`)
 * - `--dry`: chỉ đếm số dòng sẽ ghi theo ánh xạ fixture → bảng, KHÔNG cần DB
 *   — dùng để kiểm ánh xạ trên máy không có khóa.
 * - Không `--dry`: nối DATABASE_URL và ghi; trùng id thì bỏ qua dòng đó
 *   (ON CONFLICT DO NOTHING) nên chạy lại không sinh trùng.
 * - Mã thoát: 0 thành công; 2 thiếu DATABASE_URL (đang chờ); 3 lỗi nối/ghi.
 *
 * Nguồn fixture (nguồn sự thật là `lib/data/types.ts`):
 *   fixtures/user.json, workspaces.json, members.json, contacts.json,
 *   folders.json, glossary.json, audit.json, sessions/*.json
 *
 * Quy tắc id (§1.2): id buổi/thư mục/liên hệ/từ điển/việc giữ nguyên như
 * fixture; id người dùng là uuid do máy sinh (fixture user id được ánh xạ
 * sang uuid trong lần chạy này). Không bao giờ in giá trị DATABASE_URL.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import postgres from "postgres";

const ROOT = join(import.meta.dirname, "..");
const FIXTURES = join(ROOT, "fixtures");

const dryRun = process.argv.includes("--dry");
const url = process.env.DATABASE_URL ?? "";

function exitWith(code, message) {
  console.log(message);
  process.exit(code);
}

if (!dryRun && !url) {
  exitWith(
    2,
    "Thiếu DATABASE_URL (Supabase Postgres vùng ap-southeast-1) — đang chờ. Chạy `--dry` để kiểm ánh xạ không cần DB; không commit khóa.",
  );
}
if (!dryRun && !url.startsWith("postgres://") && !url.startsWith("postgresql://")) {
  exitWith(2, "DATABASE_URL không phải chuỗi Postgres — đang chờ giá trị Supabase đúng. Không commit khóa.");
}

function readJson(rel) {
  return JSON.parse(readFileSync(join(FIXTURES, rel), "utf8"));
}

function toDateOrNull(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ---------- Đọc fixture ---------- */

const user = readJson("user.json");
const workspaces = readJson("workspaces.json");
const members = readJson("members.json");
const contacts = readJson("contacts.json");
const folders = readJson("folders.json");
const glossary = readJson("glossary.json");
const audit = readJson("audit.json");

const sessionsDir = join(FIXTURES, "sessions");
const sessionFiles = existsSync(sessionsDir)
  ? readdirSync(sessionsDir).filter((f) => f.endsWith(".json")).sort()
  : [];
const sessionFixtures = sessionFiles.map((f) => ({
  file: f,
  data: JSON.parse(readFileSync(join(sessionsDir, f), "utf8")),
}));

/* ---------- Ánh xạ ---------- */

// Ánh xạ id người dùng fixture (chuỗi như "u-...") → uuid máy sinh (§1.4: users.id là uuid)
const userIdMap = new Map(); // fixture user id -> uuid
// Chạy lại phải ra cùng một id, nếu không các bảng con trỏ tới user không tồn tại
// (lỗi khóa ngoại workspace_members_user_id ở lần chạy thứ hai). Có sẵn user cùng
// email trong DB thì dùng lại id đó; chưa có thì sinh uuid cố định từ email.
function stableUuid(seed) {
  const h = createHash("sha1").update(`noteim-seed:${seed}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
let existingUserId = null;
if (!dryRun && url) {
  const probe = postgres(url, { prepare: false, max: 1, connect_timeout: 15 });
  try {
    const [row] = await probe`select id from "users" where email = ${user.email.toLowerCase()} limit 1`;
    existingUserId = row?.id ?? null;
  } catch {
    existingUserId = null; // bảng chưa có: để bước ghi báo lỗi rõ ràng
  } finally {
    await probe.end({ timeout: 5 });
  }
}
const userUuid = existingUserId ?? stableUuid(user.email.toLowerCase());
userIdMap.set(user.id, userUuid);

// Ánh xạ id thành viên khác trong members (nếu trùng user fixture) → null khi không biết
for (const m of members) {
  if (m.user_id && !userIdMap.has(m.user_id)) userIdMap.set(m.user_id, null);
}

const usersRows = [
  {
    id: userUuid,
    email: user.email.toLowerCase(),
    display_name: user.display_name ?? null,
    honorific: user.honorific ?? null,
    profession: user.profession ?? null,
    default_template_id: user.default_template_id ?? null,
    plan: user.plan ?? "free",
    ui_language: user.ui_language ?? "vi",
    theme: user.theme ?? "system",
    consent_reminder: user.consent_reminder ?? true,
    consent_announcement: user.consent_announcement ?? null,
    auto_filter_silence: user.auto_filter_silence ?? false,
    default_speech_language: user.default_speech_language ?? "vi",
    auto_detect_languages: user.auto_detect_languages ?? true,
    default_report_language: user.default_report_language ?? "vi",
    auto_translate_on_send: user.auto_translate_on_send ?? true,
    current_workspace_id: user.current_workspace_id ?? "",
    listening_prefs: user.listening_prefs ?? null,
    onboarded_at: toDateOrNull(user.onboarded_at),
  },
];

const workspacesRows = workspaces.map((w) => ({
  id: w.id,
  kind: w.kind ?? "personal",
  name: w.name ?? "",
  profession: w.profession ?? null,
  default_report_language: w.default_report_language ?? "vi",
  plan: w.plan ?? "free",
  seat_limit: w.seat_limit ?? null,
  owner_user_id: userIdMap.get(w.owner_user_id) ?? userUuid,
}));

const membersRows = members.map((m) => ({
  workspace_id: m.workspace_id,
  user_id: m.user_id ? (userIdMap.get(m.user_id) ?? null) : null,
  email: m.email,
  display_name: m.display_name ?? "",
  role: m.role ?? "member",
  status: m.status ?? "invited",
  invited_at: toDateOrNull(m.invited_at) ?? new Date(),
  invite_expires_at: toDateOrNull(m.invite_expires_at),
}));

const contactsRows = contacts.map((c) => ({
  id: c.id,
  user_id: userUuid,
  name: c.name,
  role: c.role ?? null,
  email: c.email ?? null,
  preferred_language: c.preferred_language ?? null,
}));

const glossaryRows = glossary.map((g) => ({
  id: g.id,
  user_id: userUuid,
  term: g.term,
  note: g.note ?? null,
  variants: g.variants ?? {},
}));

/* Buổi ghi: sessions + session_details + transcript_segments + chat + tóm tắt + việc + biên nhận */
const sessionsRows = [];
const detailsRows = [];
const segmentRows = [];
const chatRows = [];
const summaryRows = [];
const actionRows = [];
const receiptRows = [];

for (const { file, data } of sessionFixtures) {
  const d = data.detail ?? {};
  const sid = d.id;
  if (!sid) {
    console.warn(`(bỏ qua ${file}) fixture buổi thiếu detail.id`);
    continue;
  }
  const ownerUuid = userIdMap.get(d.owner_user_id || d.user_id) ?? userUuid;
  sessionsRows.push({
    id: sid,
    user_id: userIdMap.get(d.user_id) ?? userUuid,
    workspace_id: d.workspace_id ?? null,
    visibility: d.visibility ?? "private",
    owner_user_id: ownerUuid,
    title: d.title ?? "(không tên)",
    template_id: d.template_id ?? "",
    intake_template_id: d.intake_template_id ?? null,
    primary_language: d.primary_language ?? "vi",
    detected_languages: d.detected_languages ?? [],
    report_languages: d.report_languages ?? [],
    original_report_language: d.original_report_language ?? "vi",
    status: d.status ?? "processing",
    processing_step: d.processing_step ?? null,
    failure_reason: d.failure_reason ?? null,
    storage_status: d.storage_status ?? "full",
    duration_sec: Math.round(d.duration_sec ?? 0),
    size_bytes: Math.round(d.size_bytes ?? 0),
    // audio_path là key R2 — PR 04 đặt khi upload thật; fixture chưa có nên để null
    audio_path: null,
    audio_expires_at: toDateOrNull(d.audio_expires_at),
    consent: d.consent ?? { confirmed: false, announced: false },
    participant_contact_ids: d.participant_contact_ids ?? [],
    peaks_thumb: d.peaks_thumb ?? null,
    speaker_colors_thumb: d.speaker_colors_thumb ?? null,
    headline_tag: d.headline_tag ?? null,
    open_task_count: d.open_task_count ?? 0,
    is_sample: Boolean(d.is_sample),
    created_at: toDateOrNull(d.created_at) ?? new Date(),
  });
  detailsRows.push({
    session_id: sid,
    executive_summary: d.executive_summary ?? "",
    speakers: d.speakers ?? [],
    topics: d.topics ?? [],
    notes: d.notes ?? [],
    bookmarks: d.bookmarks ?? [],
    photos: d.photos ?? [],
    peaks: d.peaks ?? [],
    speaker_spans: d.speaker_spans ?? [],
    send_history: d.send_history ?? [],
    listening_map: data.listening_map ?? null,
    flow_mermaid: data.flow_mermaid ?? null,
    gap_check: d.gap_check ?? null,
    gap_check_done: d.gap_check_done ?? [],
    pending_ai_questions: d.pending_ai_questions ?? [],
  });
  for (const seg of data.transcript ?? []) {
    segmentRows.push({
      session_id: sid,
      id: seg.id,
      speaker_id: seg.speaker_id,
      start_sec: seg.start_sec,
      end_sec: seg.end_sec,
      text: seg.text ?? "",
      text_clean: seg.text_clean ?? "",
      edited: Boolean(seg.edited),
      lang: seg.lang ?? "vi",
      translations: seg.translations ?? {},
      words: seg.words ?? null,
    });
  }
  let chatSeq = 0;
  for (const c of data.chat ?? []) {
    chatRows.push({ session_id: sid, role: "user", text: c.question ?? "", citations: [], created_at: new Date(Date.now() + chatSeq++) });
    chatRows.push({
      session_id: sid,
      role: "ai",
      text: c.answer ?? "",
      citations: (c.citations ?? []).map((ts) => ({ timestamp_sec: ts })),
      created_at: new Date(Date.now() + chatSeq++),
    });
  }
  for (const v of data.summary_versions ?? []) {
    summaryRows.push({
      session_id: sid,
      lang: v.lang,
      source: v.source ?? "original",
      translated_from: v.translated_from ?? null,
      created_at: toDateOrNull(v.created_at) ?? new Date(),
      stale: Boolean(v.stale),
      executive_summary: v.executive_summary ?? "",
      topics: v.topics ?? [],
      task_texts: v.task_texts ?? {},
      sample: v.sample ?? null,
    });
  }
  for (const a of d.action_items ?? []) {
    actionRows.push({
      id: a.id,
      session_id: sid,
      task: a.task ?? "",
      assignee_contact_id: a.assignee_contact_id ?? null,
      assignee_user_id: a.assignee_user_id ? (userIdMap.get(a.assignee_user_id) ?? null) : null,
      due_date: a.due_date ?? null,
      priority: a.priority ?? "medium",
      done: Boolean(a.done),
      done_at: toDateOrNull(a.done_at),
      source_quote: a.source_quote ?? null,
      timestamp_sec: a.timestamp_sec ?? null,
    });
  }
  for (const r of d.consent?.receipts ?? []) {
    receiptRows.push({
      id: r.id,
      session_id: sid,
      who: r.who ?? [],
      at: toDateOrNull(r.at) ?? new Date(),
      method: r.method ?? "button",
      announcement_text: r.announcement_text ?? null,
    });
  }
}

const seededSessionIds = new Set(sessionsRows.map((s) => s.id));
const folderSessionsRows = [];
for (const f of folders) {
  for (const sid of f.session_ids ?? []) {
    if (seededSessionIds.has(sid)) folderSessionsRows.push({ folder_id: f.id, session_id: sid });
  }
}
const foldersRows = folders.map((f) => ({
  id: f.id,
  workspace_id: f.workspace_id ?? null,
  owner_user_id: userUuid,
  kind: f.kind,
  name: f.name,
  ref: f.ref ?? null,
  note: f.note ?? null,
  template_id: f.template_id ?? null,
  created_at: toDateOrNull(f.created_at) ?? new Date(),
  updated_at: toDateOrNull(f.updated_at) ?? new Date(),
}));

const auditRows = audit.map((a) => ({
  workspace_id: a.workspace_id ?? null,
  actor_user_id: userIdMap.get(a.actor_user_id) ?? null,
  action: a.action,
  target_type: a.target_type,
  target_id: a.target_id,
  target_label: a.target_label ?? "",
  at: toDateOrNull(a.at) ?? new Date(),
  meta: {},
}));

/* ---------- Báo cáo / ghi ---------- */

const PLAN = [
  ["users", usersRows],
  ["workspaces", workspacesRows],
  ["workspace_members", membersRows],
  ["sessions", sessionsRows],
  ["session_details", detailsRows],
  ["transcript_segments", segmentRows],
  ["chat_messages", chatRows],
  ["summary_versions", summaryRows],
  ["action_items", actionRows],
  ["consent_receipts", receiptRows],
  ["folders", foldersRows],
  ["folder_sessions", folderSessionsRows],
  ["contacts", contactsRows],
  ["glossary_terms", glossaryRows],
  ["audit_log", auditRows],
];

const total = PLAN.reduce((n, [, rows]) => n + rows.length, 0);
console.log(`Ánh xạ fixture → bảng: tổng ${total} dòng`);
for (const [table, rows] of PLAN) {
  console.log(`  ${table.padEnd(20)} ${String(rows.length).padStart(4)}`);
}
console.log(
  `  (buổi ghi từ fixtures/sessions: ${sessionFixtures.length} file; ` +
    "audio_path để null — key R2 do PR 04 đặt khi upload thật)",
);

if (dryRun) {
  console.log("Chế độ --dry: không nối DB, không ghi gì.");
  process.exit(0);
}

const sql = postgres(url, { prepare: false, max: 3, connect_timeout: 15 });
try {
  // Ghi từng bảng trong một transaction; fragment `sql(rows, columns)` của
  // postgres.js sinh ("col1","col2")values(...) cho cả khối dòng — tên bảng
  // giữ literal trong template (không dùng helper cho identifier).
  // Trùng id bỏ qua (on conflict do nothing) nên chạy lại không sinh trùng.
  const inserted = await sql.begin(async (tx) => {
    const n = [];
    n.push((await tx`insert into "users" ${sql(usersRows, ["id", "email", "display_name", "honorific", "profession", "default_template_id", "plan", "ui_language", "theme", "consent_reminder", "consent_announcement", "auto_filter_silence", "default_speech_language", "auto_detect_languages", "default_report_language", "auto_translate_on_send", "current_workspace_id", "listening_prefs", "onboarded_at"])} on conflict do nothing returning 1`).length);
    n.push((await tx`insert into "workspaces" ${sql(workspacesRows, ["id", "kind", "name", "profession", "default_report_language", "plan", "seat_limit", "owner_user_id"])} on conflict do nothing returning 1`).length);
    n.push((await tx`insert into "workspace_members" ${sql(membersRows, ["workspace_id", "user_id", "email", "display_name", "role", "status", "invited_at", "invite_expires_at"])} on conflict do nothing returning 1`).length);
    n.push((await tx`insert into "sessions" ${sql(sessionsRows, ["id", "user_id", "workspace_id", "visibility", "owner_user_id", "title", "template_id", "intake_template_id", "primary_language", "detected_languages", "report_languages", "original_report_language", "status", "processing_step", "failure_reason", "storage_status", "duration_sec", "size_bytes", "audio_path", "audio_expires_at", "consent", "participant_contact_ids", "peaks_thumb", "speaker_colors_thumb", "headline_tag", "open_task_count", "is_sample", "created_at"])} on conflict do nothing returning 1`).length);
    n.push((await tx`insert into "session_details" ${sql(detailsRows, ["session_id", "executive_summary", "speakers", "topics", "notes", "bookmarks", "photos", "peaks", "speaker_spans", "send_history", "listening_map", "flow_mermaid", "gap_check", "gap_check_done", "pending_ai_questions"])} on conflict do nothing returning 1`).length);
    n.push((await tx`insert into "transcript_segments" ${sql(segmentRows, ["session_id", "id", "speaker_id", "start_sec", "end_sec", "text", "text_clean", "edited", "lang", "translations", "words"])} on conflict do nothing returning 1`).length);
    n.push((await tx`insert into "chat_messages" ${sql(chatRows, ["session_id", "role", "text", "citations", "created_at"])} on conflict do nothing returning 1`).length);
    n.push((await tx`insert into "summary_versions" ${sql(summaryRows, ["session_id", "lang", "source", "translated_from", "created_at", "stale", "executive_summary", "topics", "task_texts", "sample"])} on conflict do nothing returning 1`).length);
    n.push((await tx`insert into "action_items" ${sql(actionRows, ["id", "session_id", "task", "assignee_contact_id", "assignee_user_id", "due_date", "priority", "done", "done_at", "source_quote", "timestamp_sec"])} on conflict do nothing returning 1`).length);
    n.push((await tx`insert into "consent_receipts" ${sql(receiptRows, ["id", "session_id", "who", "at", "method", "announcement_text"])} on conflict do nothing returning 1`).length);
    n.push((await tx`insert into "folders" ${sql(foldersRows, ["id", "workspace_id", "owner_user_id", "kind", "name", "ref", "note", "template_id", "created_at", "updated_at"])} on conflict do nothing returning 1`).length);
    n.push((await tx`insert into "folder_sessions" ${sql(folderSessionsRows, ["folder_id", "session_id"])} on conflict do nothing returning 1`).length);
    n.push((await tx`insert into "contacts" ${sql(contactsRows, ["id", "user_id", "name", "role", "email", "preferred_language"])} on conflict do nothing returning 1`).length);
    n.push((await tx`insert into "glossary_terms" ${sql(glossaryRows, ["id", "user_id", "term", "note", "variants"])} on conflict do nothing returning 1`).length);
    n.push((await tx`insert into "audit_log" ${sql(auditRows, ["workspace_id", "actor_user_id", "action", "target_type", "target_id", "target_label", "at", "meta"])} on conflict do nothing returning 1`).length);
    return n;
  });
  const sum = inserted.reduce((a, b) => a + b, 0);
  PLAN.forEach(([table, rows], i) => {
    if (inserted[i] !== rows.length || process.env.SEED_VERBOSE) {
      console.log(`  ${table}: ghi ${inserted[i]}/${rows.length} (bỏ qua ${rows.length - inserted[i]})`);
    }
  });
  console.log(`Đã ghi ${sum}/${total} dòng (trùng id bị bỏ qua: ${total - sum}).`);
} catch (error) {
  exitWith(3, `Ghi seed thất bại: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await sql.end({ timeout: 5 });
}
