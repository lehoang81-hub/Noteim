import { z } from "zod";

/*
 * Kiểu dữ liệu của Noteim. Nguồn sự thật: docs/04-data-contract.md.
 * Tên trường snake_case trùng tên cột database sau này.
 * Thời gian tính bằng giây (_sec), ngày giờ là chuỗi ISO.
 *
 * M6 (đa ngôn ngữ): thêm Lang (vi, en, ko — thêm ja, zh sau chỉ là thêm
 * giá trị và một file messages/), LocalizedText thay các trường _en của M5,
 * Session đổi language -> primary_language, output_language ->
 * original_report_language. Kho từ localStorage cũ được tự chuyển khi nạp
 * (lib/data/mock/migrate.ts).
 */

export const Lang = z.enum(["vi", "en", "ko"]);
export type Lang = z.infer<typeof Lang>;
export const LANGS: readonly Lang[] = ["vi", "en", "ko"];

/** Nhãn ngắn của ngôn ngữ gắn cạnh đoạn lời: VI, EN, 한국어 (M6-02). */
export const LANG_BADGE: Record<Lang, string> = { vi: "VI", en: "EN", ko: "한국어" };

/**
 * Văn bản hệ thống theo ngôn ngữ: bắt buộc có vi, thiếu ngôn ngữ nào thì
 * rơi về tiếng Anh rồi tiếng Việt (xem localized() trong lib/data/localize.ts).
 */
export const LocalizedText = z.object({
  vi: z.string(),
  en: z.string().optional(),
  ko: z.string().optional(),
});
export type LocalizedText = z.infer<typeof LocalizedText>;

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
  /** Ngôn ngữ giao diện (M4-03; M6 mở thêm ko) */
  ui_language: Lang.catch("vi"),
  theme: z.enum(["light", "dark", "system"]),
  consent_reminder: z.boolean(),
  /** Câu thông báo ghi âm người dùng tự sửa (M4-03); rỗng thì dùng câu mặc định */
  consent_announcement: z.string().optional().catch(undefined),
  /** Tự lọc khoảng lặng khi ghi (M4-03) */
  auto_filter_silence: z.boolean().optional().catch(undefined),
  /** Đã làm quen xong (M4-04); null/undefined là chưa, /welcome hiện lại */
  onboarded_at: z.string().nullable().optional().catch(undefined),
  /** Ngôn ngữ nói chính mặc định khi bắt đầu ghi (M6-01) */
  default_speech_language: Lang.catch("vi"),
  /** Công tắc "Có thể có tiếng khác" khi ghi (M6-02), mặc định bật */
  auto_detect_languages: z.boolean().catch(true),
  /** Ngôn ngữ tóm tắt mặc định (M6-04, mục "Ngôn ngữ báo cáo") */
  default_report_language: Lang.catch("vi"),
  /** Tự tạo thêm bản cho người nhận khi gửi (M6-04), mặc định bật */
  auto_translate_on_send: z.boolean().catch(true),
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
  /** Tên mẫu theo ngôn ngữ (M6-01), bắt buộc có vi — thay name + name_en của M5 */
  name: LocalizedText,
  sections: z.array(
    z.object({
      id: z.string(),
      /** Tên phần theo ngôn ngữ (M6-01) — thay title + title_en của M5 */
      title: LocalizedText,
      enabled: z.boolean(),
    }),
  ),
  /** Gợi ý câu hỏi theo ngôn ngữ (M6-01) */
  suggested_questions: z.array(LocalizedText),
  /** Dòng lưu ý theo ngôn ngữ, ví dụ mẫu Buổi khám (M6-01) */
  footer_note: LocalizedText.optional(),
});
export type Template = z.infer<typeof Template>;

export const Contact = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string().optional(),
  email: z.string().optional(),
  /** Ngôn ngữ ưa dùng khi gửi biên bản (M6-04); null là theo cài đặt chung */
  preferred_language: Lang.nullable().catch(null),
});
export type Contact = z.infer<typeof Contact>;

export const Session = z.object({
  id: z.string(),
  user_id: z.string(),
  workspace_id: z.string().nullable(),
  title: z.string(),
  template_id: z.string(),
  /** Ngôn ngữ nói chính của buổi (M6-02) — thay language */
  primary_language: Lang.catch("vi"),
  /** Các ngôn ngữ xuất hiện trong buổi, gồm cả primary_language (M6-02) */
  detected_languages: z.array(Lang).catch([]),
  /** Các bản tóm tắt đã có (M6-03) */
  report_languages: z.array(Lang).catch([]),
  /** Ngôn ngữ của bản tóm tắt gốc (M6-03) — thay output_language */
  original_report_language: Lang.catch("vi"),
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
  // Chưa đặt tên thì null (M5, sửa review PR #41 mục 5): nhãn "Bạn"/
  // "Người nói N" là nhãn hệ thống, hiển thị lúc vẽ theo ngôn ngữ giao diện
  // qua speakerLabel trong lib/data/localize.ts, không lưu vào dữ liệu.
  display_name: z.string().nullable(),
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

/**
 * Một ý tóm tắt trong bản theo ngôn ngữ (M6-03): ý trích dẫn giữ thêm câu
 * gốc (original_text, original_lang) — trích dẫn là bằng chứng, dịch sai
 * không được thay câu gốc.
 */
export const SummaryBullet = Bullet.extend({
  original_text: z.string().optional(),
  original_lang: Lang.optional(),
});
export type SummaryBullet = z.infer<typeof SummaryBullet>;

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

/** Chủ đề trong một bản tóm tắt theo ngôn ngữ (M6-03): bullets có câu gốc. */
export const VersionTopic = Topic.omit({ bullets: true }).extend({ bullets: z.array(SummaryBullet) });
export type VersionTopic = z.infer<typeof VersionTopic>;

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
  /** Buổi ghi mẫu theo nghề (M4-04), không hiện trong thư viện chính */
  is_sample: z.boolean().optional().catch(undefined),
});
export type SessionDetail = z.infer<typeof SessionDetail>;

/**
 * Bản dịch của một đoạn bản ghi lời (M6-02). sample: bản dịch mẫu của
 * mockup (không có trong fixture, chỉ điền khi dịch giả lập).
 */
export const TranslationEntry = z.object({
  text: z.string(),
  stale: z.boolean().catch(false),
  sample: z.boolean().optional(),
});
export type TranslationEntry = z.infer<typeof TranslationEntry>;

export const TranscriptSegment = z.object({
  id: z.string(),
  speaker_id: z.string(),
  start_sec: z.number(),
  end_sec: z.number(),
  text: z.string(),
  // Người dùng sửa tay chỗ AI nghe sai (M3-01). Fixture cũ không có trường
  // này nên để default; bản lưu trong localStorage trước M3 cũng có thể thiếu.
  edited: z.boolean().default(false).catch(false),
  /** Ngôn ngữ của đoạn (M6-02); dữ liệu cũ không có thì coi là tiếng Việt */
  lang: Lang.catch("vi"),
  /** Bản dịch đã có của đoạn (M6-02), khóa theo ngôn ngữ đích */
  translations: z
    .object({ vi: TranslationEntry.optional(), en: TranslationEntry.optional(), ko: TranslationEntry.optional() })
    .catch({}),
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
  /** Các bản tóm tắt người xem được chọn (M6-04) */
  languages: z.array(Lang).catch([]),
});
export type ShareLink = z.infer<typeof ShareLink>;

/**
 * Một bản tóm tắt theo ngôn ngữ (M6-03). Bản gốc của buổi nằm trong
 * SessionDetail; các bản dịch lưu ở đây.
 */
export const SummaryVersion = z.object({
  session_id: z.string(),
  lang: Lang,
  source: z.enum(["original", "translated"]),
  translated_from: Lang.nullable(),
  created_at: z.string(),
  /** Bản gốc đã sửa sau khi dịch (M6-03) */
  stale: z.boolean().catch(false),
  executive_summary: z.string(),
  topics: z.array(VersionTopic),
  /** Tên việc cần làm ở ngôn ngữ này (action_item_id -> tên việc) */
  task_texts: z.record(z.string(), z.string()).catch({}),
  /** Bản giả không dịch được nội dung: ghi "Bản dịch mẫu" (M6-03) */
  sample: z.boolean().optional(),
});
export type SummaryVersion = z.infer<typeof SummaryVersion>;

export const GlossaryTerm = z.object({
  id: z.string(),
  term: z.string(),
  note: z.string().optional(),
  /** Cách viết ở ngôn ngữ khác (M6-02), ví dụ "Vinhomes Marina" -> "빈홈즈 마리나" */
  variants: z.object({ vi: z.string().optional(), en: z.string().optional(), ko: z.string().optional() }).catch({}),
});
export type GlossaryTerm = z.infer<typeof GlossaryTerm>;

/** Một file fixture buổi ghi: chi tiết + bản ghi lời (tách vì nặng). */
export const SessionFixture = z.object({
  detail: SessionDetail,
  transcript: z.array(TranscriptSegment),
  chat: z.array(z.object({ question: z.string(), answer: z.string(), citations: z.array(z.number()) })).default([]),
  // Sơ đồ quy trình dựng bằng Mermaid ở tab Hình (M3-03); sinh từ dữ liệu buổi ghi
  flow_mermaid: z.string().optional(),
  /** Các bản tóm tắt theo ngôn ngữ có sẵn trong fixture (M6-03); bản gốc nằm trong detail */
  summary_versions: z.array(SummaryVersion).optional(),
});
export type SessionFixture = z.infer<typeof SessionFixture>;

/* ---------- Lỗi ---------- */

// Đã tách sang errors.ts (M5, sửa review PR #41 mục 2): types.ts dựng schema
// Zod lúc nạp module, còn DataError được import dạng giá trị ở nhiều nơi.
// Re-export để chỗ import từ "@/lib/data/types" cũ vẫn chạy.
export { DataError, type DataErrorCode } from "./errors";
