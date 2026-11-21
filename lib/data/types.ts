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
  /** Không gian đang dùng (M7-01): id của không gian Cá nhân hoặc Nhóm; dữ liệu cũ thiếu thì migrate điền không gian Cá nhân */
  current_workspace_id: z.string().default("").catch(""),
  /** Lựa chọn Nghe sạch, nhớ theo người dùng áp dụng cho mọi buổi (M8-01).
   * enabled: chế độ đang bật; các công tắc là giá trị khi bật Nghe sạch. */
  listening_prefs: z
    .object({
      enabled: z.boolean().catch(false),
      denoise: z.boolean().catch(true),
      level: z.boolean().catch(true),
      skip_silence: z.boolean().catch(true),
      skip_fillers: z.boolean().catch(false),
    })
    .catch({ enabled: false, denoise: true, level: true, skip_silence: true, skip_fillers: false }),
});
export type User = z.infer<typeof User>;
export type ListeningPrefs = NonNullable<User["listening_prefs"]>;

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

/**
 * Một dòng trong biên nhận đồng ý ghi âm (góp ý #4; GC-05, đặc tả v1.1 §4.6):
 * ai đồng ý (who), lúc nào (at), bằng cách nào (method: bấm nút hay bảng tự
 * đóng), kèm câu thông báo đã phát nếu có. Hình dạng khớp với nhánh GY1
 * (PR #76) để hai chuỗi PR gộp được vào nhau.
 */
export const ConsentReceipt = z.object({
  id: z.string(),
  /** Tên những người đã đồng ý (gõ nhanh ở bảng đồng ý); rỗng là chưa ghi tên */
  who: z.array(z.string()).catch([]),
  /** Thời điểm ghi nhận đồng ý (ISO) */
  at: z.string(),
  method: z.enum(["button", "auto"]),
  /** Câu thông báo ghi âm đã phát trong buổi, nếu có */
  announcement_text: z.string().optional(),
});
export type ConsentReceipt = z.infer<typeof ConsentReceipt>;

export const Session = z.object({
  id: z.string(),
  user_id: z.string(),
  workspace_id: z.string().nullable(),
  /** Riêng tư hay chia sẻ cho cả không gian Nhóm (M7-01); buổi cá nhân luôn riêng tư. Dữ liệu cũ thiếu thì coi là riêng tư */
  visibility: z.enum(["private", "workspace"]).default("private").catch("private"),
  /** Người ghi buổi (M7-01) — buổi cũ thiếu thì migrate điền người dùng hiện tại */
  owner_user_id: z.string().default("").catch(""),
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
  /** File âm thanh thật của buổi (M9-01); thiếu/null là chưa có — trình phát dùng đồng hồ giả như cũ */
  audio_url: z.string().nullable().optional().catch(undefined),
  created_at: z.string(),
  audio_expires_at: z.string().nullable(),
  consent: z.object({
    confirmed: z.boolean(),
    announced: z.boolean(),
    /** Biên nhận đồng ý ghi âm (GC-05, đặc tả v1.1 §4.6); buổi cũ không có */
    receipts: z.array(ConsentReceipt).optional().catch(undefined),
  }),
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
  /** Giao cho thành viên không gian Nhóm (M7-01); null là chưa giao cho thành viên nào */
  assignee_user_id: z.string().nullish(),
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

/* ---------- GC-05: Thư mục và mẫu kế thừa ---------- */

/**
 * Loại thư mục theo hồ sơ (góp ý #3, đặc tả v1.1 §4.7): tên gọi theo nghề của
 * người dùng, nhãn hiển thị nằm trong messages. Hình dạng khớp với nhánh GY1
 * (PR #76); GC-05 thêm trường template_id để thư mục chọn nghề một lần,
 * buổi mới kế thừa mẫu của thư mục.
 */
export const FolderKind = z.enum(["legal_case", "patient", "client", "project"]);
export type FolderKind = z.infer<typeof FolderKind>;

/** Thư mục gom các buổi ghi của cùng một hồ sơ: vụ việc, bệnh nhân, khách hàng, công trình. */
export const Folder = z.object({
  id: z.string(),
  workspace_id: z.string().nullable().catch(null),
  kind: FolderKind,
  name: z.string(),
  /** Mã hồ sơ: số vụ việc, mã bệnh nhân, mã bất động sản, mã công trình */
  ref: z.string().optional().catch(undefined),
  /** Ghi chú ngắn về hồ sơ, ví dụ mốc quan trọng tiếp theo */
  note: z.string().optional().catch(undefined),
  /** Mẫu ghi âm kế thừa cho buổi mới gắn vào thư mục (GC-05, đặc tả §4.7);
   * null là thư mục chưa chọn nghề — buổi mới dùng mẫu mặc định */
  template_id: z.string().nullish().catch(undefined),
  session_ids: z.array(z.string()).catch([]),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Folder = z.infer<typeof Folder>;


/**
 * Kết quả rà thiếu gần nhất lưu kèm buổi (GC-04, đặc tả v1.1 §4.5). Cùng hình
 * dạng với GapCheckResult của API (lib/gap-check/types.ts) nhưng đi qua zod
 * để dữ liệu mẫu/kho hỏng không làm sập màn chi tiết.
 */
export const SavedGapCheck = z.object({
  template_id: z.string(),
  checked_at: z.string(),
  ready_to_close: z.boolean(),
  slots_status: z.array(
    z.object({
      key: z.string(),
      filled: z.boolean(),
      confidence: z.enum(["high", "medium", "low"]),
      evidence: z.string(),
    }),
  ),
  missing_priorities: z.array(z.object({ key: z.string(), why_missing: z.string(), question: z.string() })),
  one_line_bridge: z.string(),
});
export type SavedGapCheck = z.infer<typeof SavedGapCheck>;

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
  /** Kết quả rà thiếu gần nhất đi kèm buổi (GC-04); fixture cũ không có */
  gap_check: SavedGapCheck.nullish().catch(undefined),
  /** Các ô checklist đã tick xong (GC-04); tải lại trang vẫn ẩn */
  gap_check_done: z.array(z.string()).nullish().catch(undefined),
  /** Câu hỏi chờ gửi trong Hỏi AI, chuyển từ sheet rà thiếu khi đang ghi (GC-04) */
  pending_ai_questions: z.array(z.string()).nullish().catch(undefined),
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
  /** Bản gọn: bỏ tiếng đệm, từ lặp, nói vấp (M8-01). Dữ liệu cũ thiếu thì
   * migrate dùng câu Nguyên văn; không bao giờ rỗng khi hiển thị. */
  text_clean: z.string().catch(""),
  /** Mốc từng chữ (có khi nối AI thật). Mockup chưa có: chữ chạy theo chia
   * đều thời lượng đoạn theo số ký tự, xem lib/listening/words.ts. */
  words: z
    .array(
      z.object({
        w: z.string(),
        start_sec: z.number(),
        end_sec: z.number(),
        filler: z.boolean().catch(false),
      }),
    )
    .optional()
    .catch(undefined),
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

/**
 * Bản đồ nghe tính trước một lần khi xử lý buổi ghi (M8-01, docs/09).
 * Lúc nghe máy người dùng chỉ đọc bản đồ để nhảy qua khoảng lặng/tiếng đệm và
 * cân âm lượng; không tạo bản ghi âm sạch lưu riêng — file gốc là bằng chứng.
 */
export const ListeningMap = z.object({
  session_id: z.string(),
  /** Khoảng lặng dài hơn 1,5 giây giữa các lượt nói */
  silences: z.array(z.object({ start_sec: z.number(), end_sec: z.number() })),
  /** Vị trí tiếng đệm ("à", "ừ", "ừm", "thì là"...) trong câu Nguyên văn */
  fillers: z.array(z.object({ start_sec: z.number(), end_sec: z.number(), text: z.string() })),
  /** Mức tăng/giảm âm lượng theo người nói, -6 đến +9 dB */
  speaker_gain_db: z.record(z.string(), z.number().min(-6).max(9)),
  noise_level: z.enum(["low", "medium", "high"]),
  /** Thời lượng khi bỏ khoảng lặng (không bỏ tiếng đệm) */
  clean_duration_sec: z.number(),
});
export type ListeningMap = z.infer<typeof ListeningMap>;

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

/* ---------- M7: Không gian làm việc, vai trò và quyền ---------- */

/** Buổi ghi riêng tư (mặc định) hay đã chia sẻ cho cả không gian Nhóm (M7-01). */
export const Visibility = z.enum(["private", "workspace"]);
export type Visibility = z.infer<typeof Visibility>;

/** Vai trò trong không gian Nhóm (M7-01). Quyền chi tiết: docs/08 phần B. */
export const WorkspaceRole = z.enum(["owner", "admin", "member"]);
export type WorkspaceRole = z.infer<typeof WorkspaceRole>;

/**
 * Không gian làm việc (M7-01). Mỗi người luôn có một không gian Cá nhân
 * (kind "personal", name không hiển thị trực tiếp — nhãn "Cá nhân" là nhãn
 * hệ thống, hiển thị theo ngôn ngữ giao diện) và có thể có không gian Nhóm.
 */
export const Workspace = z.object({
  id: z.string(),
  kind: z.enum(["personal", "team"]),
  name: z.string(),
  profession: Profession.nullable().catch(null),
  default_report_language: Lang.catch("vi"),
  plan: z.enum(["free", "pro", "team"]).catch("free"),
  /** Số chỗ tối đa của gói Nhóm; null là không giới hạn */
  seat_limit: z.number().nullable().catch(null),
  owner_user_id: z.string(),
});
export type Workspace = z.infer<typeof Workspace>;

/**
 * Thành viên của một không gian (M7-01). user_id null khi còn là lời mời
 * (status "invited"); lời mời hết hạn sau 7 ngày, có thể thu hồi.
 */
export const Member = z.object({
  workspace_id: z.string(),
  user_id: z.string().nullable(),
  email: z.string(),
  display_name: z.string(),
  role: WorkspaceRole.catch("member"),
  status: z.enum(["active", "invited"]).catch("invited"),
  invited_at: z.string(),
  invite_expires_at: z.string().nullable().catch(null),
});
export type Member = z.infer<typeof Member>;

/** Một dòng nhật ký truy cập của không gian Nhóm (M7-01). */
export const AuditEvent = z.object({
  id: z.string(),
  workspace_id: z.string(),
  actor_user_id: z.string(),
  action: z.enum(["view", "share", "unshare", "export", "delete", "invite", "remove_member", "role_change", "purge", "send_email"]),
  target_type: z.enum(["session", "member", "workspace", "share_link"]),
  target_id: z.string(),
  target_label: z.string(),
  at: z.string(),
});
export type AuditEvent = z.infer<typeof AuditEvent>;

/** Một dòng mức dùng theo người trong tháng (M7-01). */
export const UsageRow = z.object({
  user_id: z.string(),
  month: z.string(),
  sessions: z.number(),
  minutes: z.number(),
  open_tasks: z.number(),
});
export type UsageRow = z.infer<typeof UsageRow>;

/** Một hóa đơn của gói Nhóm (M7-01, số liệu mẫu cho /team/billing sau này). */
export const Invoice = z.object({
  id: z.string(),
  period: z.string(),
  seats: z.number(),
  amount_label: z.string(),
  status: z.enum(["paid", "due"]),
});
export type Invoice = z.infer<typeof Invoice>;

/* ---------- M7-02: Tổng quan cá nhân và nhóm ---------- */

/** Loại dòng "Cần xử lý" (M7-02, docs/04). */
export const AttentionKind = z.enum([
  "task_overdue",
  "task_due_today",
  "speaker_unnamed",
  "audio_expiring",
  "link_expiring",
  "processing_failed",
]);
export type AttentionKind = z.infer<typeof AttentionKind>;

/**
 * Dữ liệu Tổng quan (M7-02, docs/04-data-contract.md). Mọi số liệu do bản giả
 * tính từ kho theo không gian đang dùng và quyền đọc — không viết số cứng,
 * không đếm nội dung buổi riêng tư của người khác (M7-01).
 */
export const DashboardData = z.object({
  range: z.enum(["week", "month"]),
  attention: z.array(
    z.object({
      kind: AttentionKind,
      target_id: z.string(),
      label: z.string(),
      href: z.string(),
    }),
  ),
  totals: z.object({
    sessions: z.number(),
    minutes: z.number(),
    decisions: z.number(),
    tasks_done: z.number(),
    tasks_total: z.number(),
  }),
  by_day: z.array(
    z.object({
      /** "2026-11-14" theo múi giờ Việt Nam */
      date: z.string(),
      session_ids: z.array(z.string()),
      minutes: z.number(),
    }),
  ),
  decisions: z.array(
    z.object({
      session_id: z.string(),
      bullet_id: z.string(),
      text: z.string(),
      timestamp_sec: z.number(),
    }),
  ),
  top_contacts: z.array(
    z.object({
      contact_id: z.string(),
      sessions: z.number(),
      last_met_at: z.string(),
    }),
  ),
  by_template: z.array(
    z.object({
      template_id: z.string(),
      minutes: z.number(),
    }),
  ),
});
export type DashboardData = z.infer<typeof DashboardData>;

/** Một file fixture buổi ghi: chi tiết + bản ghi lời (tách vì nặng). */
export const SessionFixture = z.object({
  detail: SessionDetail,
  transcript: z.array(TranscriptSegment),
  chat: z.array(z.object({ question: z.string(), answer: z.string(), citations: z.array(z.number()) })).default([]),
  // Sơ đồ quy trình dựng bằng Mermaid ở tab Hình (M3-03); sinh từ dữ liệu buổi ghi
  flow_mermaid: z.string().optional(),
  /** Các bản tóm tắt theo ngôn ngữ có sẵn trong fixture (M6-03); bản gốc nằm trong detail */
  summary_versions: z.array(SummaryVersion).optional(),
  /** Bản đồ nghe tính sẵn (M8-01); buổi ghi mới chưa xử lý thì không có */
  listening_map: ListeningMap.optional().catch(undefined),
});
export type SessionFixture = z.infer<typeof SessionFixture>;

/* ---------- Lỗi ---------- */

// Đã tách sang errors.ts (M5, sửa review PR #41 mục 2): types.ts dựng schema
// Zod lúc nạp module, còn DataError được import dạng giá trị ở nhiều nơi.
// Re-export để chỗ import từ "@/lib/data/types" cũ vẫn chạy.
export { DataError, type DataErrorCode } from "./errors";
