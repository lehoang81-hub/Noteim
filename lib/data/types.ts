import { z } from "zod";

/*
 * Kiểu dữ liệu của Noteim. Nguồn sự thật: docs/04-data-contract.md.
 * Tên trường snake_case trùng tên cột database sau này.
 * Thời gian tính bằng giây (_sec), ngày giờ là chuỗi ISO.
 */

export const Profession = z.enum([
  "business_owner",
  "doctor",
  "lawyer",
  "realestate_sales",
  "architect",
  "notary",
  "other",
]);
export type Profession = z.infer<typeof Profession>;

export const SemanticTag = z.enum(["decided", "pending", "risk", "idea", "figure"]);
export type SemanticTag = z.infer<typeof SemanticTag>;

export const SessionStatus = z.enum(["recording", "unsynced", "processing", "ready", "failed"]);
export type SessionStatus = z.infer<typeof SessionStatus>;

export const StorageStatus = z.enum(["full", "essence_only"]);

export const User = z.object({
  id: z.string(),
  display_name: z.string(),
  honorific: z.enum(["anh", "chị"]).nullable(),
  email: z.string(),
  profession: Profession,
  default_template_id: z.string(),
  plan: z.enum(["free", "pro"]),
  ui_language: z.enum(["vi", "en"]),
  theme: z.enum(["light", "dark", "system"]),
  consent_reminder: z.boolean(),
  /** Câu thông báo ghi âm người dùng tự sửa (M4-03); rỗng thì dùng câu mặc định */
  consent_announcement: z.string().optional().catch(undefined),
  /** Tự lọc khoảng lặng khi ghi (M4-03) */
  auto_filter_silence: z.boolean().optional().catch(undefined),
  /** Đã làm quen xong (M4-04); null/undefined là chưa, /welcome hiện lại */
  onboarded_at: z.string().nullable().optional().catch(undefined),
});
export type User = z.infer<typeof User>;

export const Quota = z.object({
  period_end: z.string(),
  minutes_used: z.number(),
  minutes_limit: z.number(),
  max_session_minutes: z.number(),
  chat_questions_per_session: z.number().nullable(),
});
export type Quota = z.infer<typeof Quota>;

export const Template = z.object({
  id: z.string(),
  profession: Profession,
  name: z.string(),
  sections: z.array(z.object({ id: z.string(), title: z.string(), enabled: z.boolean() })),
  suggested_questions: z.array(z.string()),
  footer_note: z.string().optional(),
});
export type Template = z.infer<typeof Template>;

export const Contact = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string().optional(),
  email: z.string().optional(),
});
export type Contact = z.infer<typeof Contact>;

export const Session = z.object({
  id: z.string(),
  user_id: z.string(),
  workspace_id: z.string().nullable(),
  title: z.string(),
  template_id: z.string(),
  language: z.string(),
  output_language: z.string(),
  status: SessionStatus,
  processing_step: z.number().int().min(1).max(5).optional(),
  failure_reason: z.string().optional(),
  storage_status: StorageStatus,
  duration_sec: z.number(),
  size_bytes: z.number(),
  created_at: z.string(),
  audio_expires_at: z.string().nullable(),
  consent: z.object({ confirmed: z.boolean(), announced: z.boolean() }),
  participant_contact_ids: z.array(z.string()),
  peaks_thumb: z.array(z.number()).length(40),
  speaker_colors_thumb: z.array(z.number().int().min(0).max(5)).length(40),
  headline_tag: z.object({ tag: SemanticTag, count: z.number() }).optional(),
  open_task_count: z.number(),
});
export type Session = z.infer<typeof Session>;

export const Speaker = z.object({
  id: z.string(),
  contact_id: z.string().nullable(),
  display_name: z.string(),
  is_me: z.boolean(),
  color_index: z.number().int().min(0).max(5),
  talk_ratio_percent: z.number(),
  sample_start_sec: z.number(),
});
export type Speaker = z.infer<typeof Speaker>;

export const Bullet = z.object({
  id: z.string(),
  text: z.string(),
  timestamp_sec: z.number(),
  speaker_id: z.string(),
  is_quote: z.boolean(),
  edited: z.boolean(),
  note_ids: z.array(z.string()),
});
export type Bullet = z.infer<typeof Bullet>;

export const Topic = z.object({
  id: z.string(),
  section_id: z.string(),
  title: z.string(),
  start_sec: z.number(),
  end_sec: z.number(),
  tag: SemanticTag,
  bullets: z.array(Bullet),
  figure: z
    .object({
      chart_type: z.enum(["bar", "line"]),
      title: z.string(),
      unit: z.string(),
      labels: z.array(z.string()),
      values: z.array(z.number()),
      source_timestamp_sec: z.number(),
    })
    .optional(),
});
export type Topic = z.infer<typeof Topic>;

export const ActionItem = z.object({
  id: z.string(),
  session_id: z.string(),
  task: z.string(),
  assignee_contact_id: z.string().nullable(),
  due_date: z.string().nullable(),
  priority: z.enum(["high", "medium", "low"]),
  done: z.boolean(),
  done_at: z.string().nullable(),
  source_quote: z.string().nullable(),
  timestamp_sec: z.number().nullable(),
});
export type ActionItem = z.infer<typeof ActionItem>;

export const Note = z.object({ id: z.string(), timestamp_sec: z.number(), text: z.string() });
export type Note = z.infer<typeof Note>;
export const BookmarkData = z.object({ id: z.string(), timestamp_sec: z.number(), tag: SemanticTag.nullable() });
export type BookmarkData = z.infer<typeof BookmarkData>;
export const Photo = z.object({ id: z.string(), timestamp_sec: z.number(), url: z.string(), caption: z.string().optional() });
export type Photo = z.infer<typeof Photo>;

export const SpeakerSpanData = z.object({ speaker_id: z.string(), start_sec: z.number(), end_sec: z.number() });

export const SessionDetail = Session.extend({
  executive_summary: z.string(),
  speakers: z.array(Speaker),
  topics: z.array(Topic),
  action_items: z.array(ActionItem),
  notes: z.array(Note),
  bookmarks: z.array(BookmarkData),
  photos: z.array(Photo),
  peaks: z.array(z.number()),
  speaker_spans: z.array(SpeakerSpanData),
  send_history: z.array(z.object({ sent_at: z.string(), recipient_count: z.number() })),
});
export type SessionDetail = z.infer<typeof SessionDetail>;

export const TranscriptSegment = z.object({
  id: z.string(),
  speaker_id: z.string(),
  start_sec: z.number(),
  end_sec: z.number(),
  text: z.string(),
  // Người dùng sửa tay chỗ AI nghe sai (M3-01). Fixture cũ không có trường
  // này nên để default; bản lưu trong localStorage trước M3 cũng có thể thiếu.
  edited: z.boolean().default(false).catch(false),
});
export type TranscriptSegment = z.infer<typeof TranscriptSegment>;

export const VisualArtifacts = z.object({
  timeline: z.array(z.object({ topic_id: z.string(), start_sec: z.number(), end_sec: z.number(), tag: SemanticTag })),
  talk_share: z.array(z.object({ speaker_id: z.string(), percent: z.number() })),
  flow_mermaid: z.string().optional(),
});
export type VisualArtifacts = z.infer<typeof VisualArtifacts>;

export const ChatMessage = z.object({
  id: z.string(),
  role: z.enum(["user", "ai"]),
  text: z.string(),
  citations: z.array(z.object({ timestamp_sec: z.number() })),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const ShareLink = z.object({
  id: z.string(),
  session_id: z.string(),
  scope: z.enum(["summary", "summary_audio"]),
  has_password: z.boolean(),
  expires_at: z.string().nullable(),
  revoked: z.boolean(),
  view_count: z.number(),
});
export type ShareLink = z.infer<typeof ShareLink>;

export const GlossaryTerm = z.object({ id: z.string(), term: z.string(), note: z.string().optional() });
export type GlossaryTerm = z.infer<typeof GlossaryTerm>;

/** Một file fixture buổi ghi: chi tiết + bản ghi lời (tách vì nặng). */
export const SessionFixture = z.object({
  detail: SessionDetail,
  transcript: z.array(TranscriptSegment),
  chat: z.array(z.object({ question: z.string(), answer: z.string(), citations: z.array(z.number()) })).default([]),
  // Sơ đồ quy trình dựng bằng Mermaid ở tab Hình (M3-03); sinh từ dữ liệu buổi ghi
  flow_mermaid: z.string().optional(),
});
export type SessionFixture = z.infer<typeof SessionFixture>;

/* ---------- Lỗi ---------- */

export type DataErrorCode = "offline" | "not_found" | "quota_exceeded" | "server";

export class DataError extends Error {
  constructor(public code: DataErrorCode, message?: string) {
    super(message ?? code);
    this.name = "DataError";
  }
}
