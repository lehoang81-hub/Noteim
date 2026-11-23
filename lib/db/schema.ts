/**
 * Schema Drizzle — toàn bộ §1.4 (PR 02, đặc tả C1 `docs/12-auth-db-group-spec.md`).
 *
 * **Schema Postgres `noteim`**: dự án dùng chung project Supabase với app khác,
 * mọi bảng nằm trong schema `noteim` (không đụng `public`). Xác thực trên
 * Supabase bằng role `noteim_app` (DATABASE_URL trên máy chủ trỏ tới role này;
 * chỉ đọc từ biến môi trường, không ghi khóa vào code).
 *
 * Quy ước:
 * - Tên bảng trùng 1-1 §1.4; cột snake_case trùng trường Zod trong
 *   `lib/data/types.ts` (nguồn sự thật hình dạng dữ liệu).
 * - **Id client sinh giữ kiểu text** (session, folder, contact, glossary,
 *   action item, share link, biên nhận) để di trú giữ nguyên mọi id (§1.2);
 *   id người dùng là uuid do máy chủ sinh (`users.id`).
 * - Phần linh hoạt (peaks, spans, translations, words, listening_map, topics,
 *   consent, result_json…) để JSONB thay vì bảng con — khớp hình dạng
 *   repository hiện tại, ít rủi ro di trú (đúng ghi chú §1.4).
 * - Thời điểm dùng timestamptz; thời lượng/giây dùng integer/doublePrecision;
 *   ngày dạng chuỗi ISO (due_date) giữ text đúng kiểu Zod hiện có.
 * - Ràng buộc chống trùng cho seed chạy lại (`scripts/db-seed.mjs` dùng
 *   `ON CONFLICT … DO NOTHING` nhắm đúng các khóa này):
 *   + `action_items` khóa chính composite (session_id, id) — id "a1"… trong
 *     fixture lặp giữa các buổi nên id một mình không đủ.
 *   + `workspace_members` unique (workspace_id, lower(email)) — thành viên
 *     còn lời mời chưa có user_id vẫn phải bị chặn trùng.
 *   + `chat_messages` unique (session_id, role, created_at, md5(text)) —
 *     chặn bản sao tin nhắn y hệt; md5 giữ chỉ mục gọn với lời dài.
 *   + `audit_log` unique (workspace_id, actor_user_id, action, target_type,
 *     target_id, at) — chặn bản sao nhật ký y hệt cùng thời điểm; log cùng
 *     action/target ở thời điểm khác vẫn ghi bình thường.
 *
 * Phiên đăng nhập dùng JWT trong cookie (`noteim.session`) nên
 * `auth_sessions` không nằm trên đường nóng — vẫn giữ đúng §1.4 cho cửa
 * Email OTP (PR riêng khi có nhu cầu).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Tất cả bảng của Noteim nằm trong schema này — không dùng `public`. */
export const noteimSchema = pgSchema("noteim");

/* ---------- Nền đăng nhập (PR 01) + bổ sung công tắc (PR 02) ---------- */

/**
 * Bảng users — người dùng của app. §1.4: gói (free/pro/edu), ngôn ngữ,
 * giao diện, các công tắc ghi/ngôn ngữ, đếm hạn mức ẩn danh.
 */
export const users = noteimSchema.table(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: text("email").notNull(),
    displayName: text("display_name"),
    honorific: text("honorific"),
    profession: text("profession"),
    defaultTemplateId: text("default_template_id"),
    plan: text("plan").notNull().default("free"),
    uiLanguage: text("ui_language").notNull().default("vi"),
    theme: text("theme").notNull().default("system"),
    /* Công tắc ghi/ngôn ngữ theo kiểu User (PR 02 bổ sung đủ §1.4) */
    consentReminder: boolean("consent_reminder").notNull().default(true),
    consentAnnouncement: text("consent_announcement"),
    autoFilterSilence: boolean("auto_filter_silence").notNull().default(false),
    defaultSpeechLanguage: text("default_speech_language").notNull().default("vi"),
    autoDetectLanguages: boolean("auto_detect_languages").notNull().default(true),
    defaultReportLanguage: text("default_report_language").notNull().default("vi"),
    autoTranslateOnSend: boolean("auto_translate_on_send").notNull().default(true),
    /** Không gian đang dùng — id workspaces (text, trùng kiểu Zod) */
    currentWorkspaceId: text("current_workspace_id").notNull().default(""),
    listeningPrefs: jsonb("listening_prefs"),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    anonymousUsedSessions: integer("anonymous_used_sessions")
      .notNull()
      .default(0),
    anonymousUsedSeconds: integer("anonymous_used_seconds")
      .notNull()
      .default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("users_email_key").on(table.email)],
);

/** Bảng accounts — liên kết nhà cung cấp OAuth (chuẩn next-auth). */
export const accounts = noteimSchema.table(
  "accounts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type"),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    expiresAt: integer("expires_at"),
    tokenType: text("token_type"),
    scope: text("scope"),
    idToken: text("id_token"),
    sessionState: text("session_state"),
  },
  (table) => [
    uniqueIndex("accounts_provider_account_key").on(
      table.provider,
      table.providerAccountId,
    ),
    index("accounts_user_id_idx").on(table.userId),
  ],
);

/** Bảng auth_sessions — phiên kiểu DB, nằm chờ cho cửa Email OTP. */
export const authSessions = noteimSchema.table(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sessionToken: text("session_token").notNull(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("auth_sessions_token_key").on(table.sessionToken)],
);

/** Bảng verification_tokens — mã xác thực một lần (chuẩn next-auth). */
export const verificationTokens = noteimSchema.table(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);

/* ---------- Không gian làm việc và nhóm (M7 thật — §1.4) ---------- */

/**
 * workspaces — mỗi người một không gian Cá nhân (kind "personal") và có thể
 * có không gian Nhóm (kind "team"). Id giữ text theo fixture (di trú giữ id).
 */
export const workspaces = noteimSchema.table(
  "workspaces",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull().default("personal"),
    name: text("name").notNull().default(""),
    profession: text("profession"),
    defaultReportLanguage: text("default_report_language").notNull().default("vi"),
    plan: text("plan").notNull().default("free"),
    seatLimit: integer("seat_limit"),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("workspaces_owner_idx").on(table.ownerUserId)],
);

/**
 * workspace_members — thành viên không gian; user_id null khi còn lời mời.
 * Vai trò 4 giá trị theo §3.1: owner/admin/member/assistant (assistant thêm
 * giá trị ở PR 09, cột để text để không phải migration khi thêm).
 *
 * Unique (workspace_id, lower(email)): một email trong một không gian chỉ
 * có một dòng — thành viên còn mời (user_id null) cũng bị chặn trùng.
 */
export const workspaceMembers = noteimSchema.table(
  "workspace_members",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    displayName: text("display_name").notNull().default(""),
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("invited"),
    invitedAt: timestamp("invited_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("workspace_members_workspace_email_key").on(
      table.workspaceId,
      sql`lower(${table.email})`,
    ),
    uniqueIndex("workspace_members_workspace_user_key").on(
      table.workspaceId,
      table.userId,
    ),
    index("workspace_members_workspace_idx").on(table.workspaceId),
  ],
);

/** invites — lời mời bằng token (lib/team/invite-token.ts dùng sau). */
export const invites = noteimSchema.table(
  "invites",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    token: text("token").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("member"),
    invitedBy: uuid("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("invites_token_key").on(table.token),
    index("invites_workspace_idx").on(table.workspaceId),
  ],
);

/* ---------- Thư mục hồ sơ (GC-05) ---------- */

/** folders — gom buổi ghi của cùng một hồ sơ (vụ việc, bệnh nhân, khách…). */
export const folders = noteimSchema.table(
  "folders",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    ownerUserId: uuid("owner_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    ref: text("ref"),
    note: text("note"),
    /** Mẫu kế thừa cho buổi mới gắn vào thư mục (GC-05); null là chưa chọn */
    templateId: text("template_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("folders_workspace_idx").on(table.workspaceId),
    index("folders_owner_idx").on(table.ownerUserId),
  ],
);

/**
 * folder_sessions — bảng nối (folder_id, session_id) thay `Folder.session_ids`
 * (§1.4); repository phía remote ghép lại thành session_ids để khớp interface.
 */
export const folderSessions = noteimSchema.table(
  "folder_sessions",
  {
    folderId: text("folder_id")
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.folderId, table.sessionId] }),
    index("folder_sessions_session_idx").on(table.sessionId),
  ],
);

/* ---------- Buổi ghi và chi tiết ---------- */

/**
 * sessions — StoredSession phần đầu (§1.4). Thêm so với Zod hiện có:
 * `intake_template_id` (ánh xạ 11 mẫu intake), `audio_path` (key R2 — PR 04),
 * `deleted_at` (xóa mềm cho Hoàn tác), `is_sample` (lọc buổi mẫu khỏi thư viện).
 */
export const sessions = noteimSchema.table(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    visibility: text("visibility").notNull().default("private"),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    templateId: text("template_id").notNull(),
    intakeTemplateId: text("intake_template_id"),
    primaryLanguage: text("primary_language").notNull().default("vi"),
    detectedLanguages: text("detected_languages")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    reportLanguages: text("report_languages")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    originalReportLanguage: text("original_report_language")
      .notNull()
      .default("vi"),
    status: text("status").notNull().default("processing"),
    processingStep: integer("processing_step"),
    failureReason: text("failure_reason"),
    storageStatus: text("storage_status").notNull().default("full"),
    durationSec: integer("duration_sec").notNull().default(0),
    sizeBytes: integer("size_bytes").notNull().default(0),
    /** Key object trên R2 (PR 04 đặt khi upload); null là chưa có băng */
    audioPath: text("audio_path"),
    audioExpiresAt: timestamp("audio_expires_at", { withTimezone: true }),
    /** { confirmed, announced, receipts? } — hình dạng session.consent */
    consent: jsonb("consent")
      .notNull()
      .default(sql`'{"confirmed":false,"announced":false}'::jsonb`),
    participantContactIds: text("participant_contact_ids")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    peaksThumb: jsonb("peaks_thumb"),
    speakerColorsThumb: jsonb("speaker_colors_thumb"),
    headlineTag: jsonb("headline_tag"),
    openTaskCount: integer("open_task_count").notNull().default(0),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    /** Xóa mềm cho Hoàn tác (spec §4 PR 03/04 dùng); null là chưa xóa */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("sessions_user_created_idx").on(table.userId, table.createdAt),
    index("sessions_workspace_idx").on(table.workspaceId),
  ],
);

/**
 * session_details — 1-1 với sessions: phần SessionDetail còn lại. Bổ sung
 * `speakers`, `listening_map`, `flow_mermaid` theo nguyên tắc JSONB của
 * §1.4 (bảng liệt kê "trường chính", các phần linh hoạt để JSONB).
 */
export const sessionDetails = noteimSchema.table("session_details", {
  sessionId: text("session_id")
    .primaryKey()
    .references(() => sessions.id, { onDelete: "cascade" }),
  executiveSummary: text("executive_summary").notNull().default(""),
  speakers: jsonb("speakers").notNull().default(sql`'[]'::jsonb`),
  topics: jsonb("topics").notNull().default(sql`'[]'::jsonb`),
  notes: jsonb("notes").notNull().default(sql`'[]'::jsonb`),
  bookmarks: jsonb("bookmarks").notNull().default(sql`'[]'::jsonb`),
  photos: jsonb("photos").notNull().default(sql`'[]'::jsonb`),
  peaks: jsonb("peaks").notNull().default(sql`'[]'::jsonb`),
  speakerSpans: jsonb("speaker_spans").notNull().default(sql`'[]'::jsonb`),
  sendHistory: jsonb("send_history").notNull().default(sql`'[]'::jsonb`),
  listeningMap: jsonb("listening_map"),
  flowMermaid: text("flow_mermaid"),
  gapCheck: jsonb("gap_check"),
  gapCheckDone: text("gap_check_done")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  pendingAiQuestions: text("pending_ai_questions")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
});

/** transcript_segments — bản ghi lời từng đoạn; khóa (session_id, id) của đoạn. */
export const transcriptSegments = noteimSchema.table(
  "transcript_segments",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    speakerId: text("speaker_id").notNull(),
    startSec: doublePrecision("start_sec").notNull(),
    endSec: doublePrecision("end_sec").notNull(),
    text: text("text").notNull(),
    textClean: text("text_clean").notNull().default(""),
    edited: boolean("edited").notNull().default(false),
    lang: text("lang").notNull().default("vi"),
    translations: jsonb("translations").notNull().default(sql`'{}'::jsonb`),
    words: jsonb("words"),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.id] }),
    index("transcript_segments_session_start_idx").on(
      table.sessionId,
      table.startSec,
    ),
  ],
);

/** summary_versions — một bản tóm tắt theo ngôn ngữ (M6-03). */
export const summaryVersions = noteimSchema.table(
  "summary_versions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    lang: text("lang").notNull(),
    source: text("source").notNull().default("original"),
    translatedFrom: text("translated_from"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    stale: boolean("stale").notNull().default(false),
    executiveSummary: text("executive_summary").notNull(),
    topics: jsonb("topics").notNull().default(sql`'[]'::jsonb`),
    taskTexts: jsonb("task_texts").notNull().default(sql`'{}'::jsonb`),
    sample: boolean("sample"),
  },
  (table) => [
    uniqueIndex("summary_versions_session_lang_key").on(
      table.sessionId,
      table.lang,
    ),
  ],
);

/**
 * action_items — việc cần làm, truy vấn xuyên buổi (TaskRepository).
 * Khóa chính composite (session_id, id): id "a1"… của fixture/client chỉ
 * duy nhất trong từng buổi — id một mình bị trùng giữa các buổi.
 */
export const actionItems = noteimSchema.table(
  "action_items",
  {
    id: text("id").notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    task: text("task").notNull(),
    assigneeContactId: text("assignee_contact_id"),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Ngày hẹn dạng chuỗi ISO đúng kiểu Zod hiện có */
    dueDate: text("due_date"),
    priority: text("priority").notNull().default("medium"),
    done: boolean("done").notNull().default(false),
    doneAt: timestamp("done_at", { withTimezone: true }),
    sourceQuote: text("source_quote"),
    timestampSec: doublePrecision("timestamp_sec"),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.id] }),
    index("action_items_session_idx").on(table.sessionId),
    index("action_items_assignee_idx").on(table.assigneeUserId),
  ],
);

/* ---------- Liên hệ, từ điển, hỏi AI, chia sẻ ---------- */

/** contacts — liên hệ gửi biên bản (M6-04). */
export const contacts = noteimSchema.table(
  "contacts",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role"),
    email: text("email"),
    preferredLanguage: text("preferred_language"),
  },
  (table) => [index("contacts_user_idx").on(table.userId)],
);

/** glossary_terms — từ điển tên riêng/thuật ngữ (M3-01, M6-02). */
export const glossaryTerms = noteimSchema.table(
  "glossary_terms",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    note: text("note"),
    variants: jsonb("variants").notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [index("glossary_terms_user_idx").on(table.userId)],
);

/**
 * chat_messages — hội thoại Hỏi AI của một buổi (MockDb.chat_log).
 * Unique (session_id, role, created_at, md5(text)): seed đặt created_at/id
 * cố định theo nội dung nên chạy lại không sinh trùng; runtime vẫn dùng id
 * uuid máy sinh (default), chỉ bị chặn khi hai tin nhắn y hệt cùng thời điểm.
 */
export const chatMessages = noteimSchema.table(
  "chat_messages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    text: text("text").notNull(),
    citations: jsonb("citations").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("chat_messages_session_role_created_key").on(
      table.sessionId,
      table.role,
      table.createdAt,
      sql`md5(${table.text})`,
    ),
    index("chat_messages_session_idx").on(table.sessionId),
  ],
);

/** share_links — link chia sẻ công khai; mật khẩu lưu dạng hash (§1.4). */
export const shareLinks = noteimSchema.table(
  "share_links",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    scope: text("scope").notNull().default("summary"),
    hasPassword: boolean("has_password").notNull().default(false),
    passwordHash: text("password_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revoked: boolean("revoked").notNull().default(false),
    viewCount: integer("view_count").notNull().default(0),
    languages: text("languages")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("share_links_session_idx").on(table.sessionId)],
);

/* ---------- Gap check, biên nhận, audit, hạn mức, mã kích hoạt ---------- */

/**
 * session_gap_checks — lịch sử rà thiếu (GC-02/04). Ràng buộc tối đa 10 dòng
 * mỗi buổi (§1.4) bằng trigger `noteim_gap_check_max10` trong migration.
 */
export const sessionGapChecks = noteimSchema.table(
  "session_gap_checks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    templateId: text("template_id").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    transcriptUntilMs: integer("transcript_until_ms").notNull().default(0),
    resultJson: jsonb("result_json").notNull(),
  },
  (table) => [
    index("session_gap_checks_session_checked_idx").on(
      table.sessionId,
      table.checkedAt,
    ),
  ],
);

/**
 * consent_receipts — biên nhận đồng ý tách thành bảng thật (GC-05, §3.2):
 * bằng chứng pháp lý, giữ kể cả khi băng gốc đã purge.
 */
export const consentReceipts = noteimSchema.table(
  "consent_receipts",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    who: text("who")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    at: timestamp("at", { withTimezone: true }).notNull(),
    method: text("method").notNull().default("button"),
    announcementText: text("announcement_text"),
  },
  (table) => [index("consent_receipts_session_idx").on(table.sessionId)],
);

/**
 * audit_log — nhật ký truy cập (§3.3, 14 loại hành động). Cột action/target
 * để text (không ràng buộc enum trong DB) để thêm loại mới không phải
 * migration; tuyệt đối không ghi transcript/evidence vào meta.
 * Unique (workspace_id, actor_user_id, action, target_type, target_id, at):
 * chặn bản sao y hệt cùng thời điểm (seed dùng id ổn định theo fixture id,
 * nên chạy lại không sinh trùng ngay cả khi workspace/actor để null).
 */
export const auditLog = noteimSchema.table(
  "audit_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: text("workspace_id"),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    targetLabel: text("target_label").notNull().default(""),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [
    uniqueIndex("audit_log_dedup_key").on(
      table.workspaceId,
      table.actorUserId,
      table.action,
      table.targetType,
      table.targetId,
      table.at,
    ),
    index("audit_log_workspace_at_idx").on(table.workspaceId, table.at),
    index("audit_log_target_idx").on(table.targetType, table.targetId),
    index("audit_log_actor_idx").on(table.actorUserId, table.at),
  ],
);

/**
 * usage_counters — thay đếm bộ nhớ (sửa lỗi serverless, §1.6). Phần ẩn danh
 * không có user: dùng chuỗi rỗng thay NULL để chỉ mục duy nhất chặn trùng
 * đúng luật (NULL trong Postgres không so sánh bằng nên sẽ sinh dòng trùng).
 */
export const usageCounters = noteimSchema.table(
  "usage_counters",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    /** id users của người đăng nhập; '' là ẩn danh */
    subjectUserId: text("subject_user_id").notNull().default(""),
    /** Mã khách của ẩn danh (gap-check hiện có); '' là không dùng */
    clientId: text("client_id").notNull().default(""),
    day: date("day").notNull(),
    kind: text("kind").notNull(),
    used: integer("used").notNull().default(0),
  },
  (table) => [
    uniqueIndex("usage_counters_subject_day_key").on(
      table.subjectUserId,
      table.clientId,
      table.day,
      table.kind,
    ),
  ],
);

/** promo_codes — mã kích hoạt gói thủ công (§3.5, dùng ở PR 07). */
export const promoCodes = noteimSchema.table(
  "promo_codes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    code: text("code").notNull(),
    plan: text("plan").notNull(),
    months: integer("months").notNull().default(1),
    maxRedemptions: integer("max_redemptions").notNull().default(1),
    redeemedCount: integer("redeemed_count").notNull().default(0),
    redeemedByUserId: uuid("redeemed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("promo_codes_code_key").on(table.code)],
);

/* ---------- Kiểu dòng dùng lại ở repository (PR 03 trở đi) ---------- */

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type AccountRow = typeof accounts.$inferSelect;
export type WorkspaceRow = typeof workspaces.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type SessionDetailRow = typeof sessionDetails.$inferSelect;
export type TranscriptSegmentRow = typeof transcriptSegments.$inferSelect;
export type ActionItemRow = typeof actionItems.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
export type UsageCounterRow = typeof usageCounters.$inferSelect;
export type PromoCodeRow = typeof promoCodes.$inferSelect;
