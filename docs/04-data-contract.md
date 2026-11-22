# 04. Dữ liệu và kiến trúc mockup

Mục tiêu: giao diện viết một lần. Khi nối database, chỉ thay lớp dữ liệu, không sửa component.

## Công nghệ

| Lớp | Lựa chọn |
| --- | --- |
| Khung | Next.js bản ổn định mới nhất (App Router), React, TypeScript ở chế độ `strict` |
| Giao diện | Tailwind CSS v4 (token khai báo bằng biến CSS), shadcn/ui, Lucide |
| Chuyển động | Motion (tên cũ là Framer Motion) |
| Kiểm tra kiểu dữ liệu | Zod |
| Ngôn ngữ | next-intl, file `messages/vi.json` và `messages/en.json` |
| Biểu đồ, sơ đồ | Recharts, Mermaid (tải khi mở tab Hình ảnh hóa) |
| Trạng thái phía máy khách | Zustand, chỉ cho trình phát và buổi đang ghi |
| AI phía máy chủ (Gap Check B4, đặc tả `docs/gap-check-spec-v1.1.md` §3) | z-ai-web-dev-sdk, model tốc độ cao, thinking tắt, chỉ gọi trong route API |
| Triển khai | Vercel, mỗi PR có link xem thử riêng |

Chưa dùng ở giai đoạn mockup: Supabase, Drizzle, Dexie, Serwist, WaveSurfer, Resend, cổng thanh toán. Dải giọng tự vẽ bằng canvas theo đặc tả trong `02-design-system.md`.

## Cấu trúc thư mục

```
app/                     các trang theo bản đồ đường dẫn
components/
  ui/                    shadcn/ui đã đổi kiểu
  ribbon/                Dải giọng (sống, phát lại, thu nhỏ)
  session/               ý tóm tắt, hàng việc, đoạn lời, khối AI
  shell/                 thanh điều hướng, trình phát nổi, dải báo
lib/
  data/
    types.ts             schema Zod và kiểu TypeScript (nguồn sự thật)
    repository.ts        interface các repository
    mock/                bản cài đặt giả: đọc fixture, giả lập độ trễ và lỗi
    index.ts             nơi DUY NHẤT chọn bản cài đặt (mock hoặc supabase)
  player/                đồng hồ phát lại giả lập
  debug/                 bảng điều khiển thử nghiệm
fixtures/                dữ liệu mẫu dạng JSON
messages/                vi.json, en.json
styles/tokens.css        toàn bộ token thiết kế
```

## Quy tắc lớp dữ liệu

1. Component và trang chỉ import từ `lib/data` (file `index.ts`). Không import `fixtures/` hay `lib/data/mock` ở bất kỳ đâu khác. Thêm luật ESLint `no-restricted-imports` để chặn.
2. Mọi hàm repository trả về `Promise`, kể cả khi dữ liệu có sẵn. Bản giả thêm độ trễ 300 đến 800ms.
3. Mọi fixture phải đi qua `schema.parse()` khi tải. Fixture sai kiểu thì báo lỗi ngay lúc chạy.
4. Tên trường dùng `snake_case` trùng với tên cột database sau này. Thời gian tính bằng giây (`_sec`), ngày giờ là chuỗi ISO.
5. Thao tác ghi (sửa tiêu đề, đánh dấu xong việc, đặt tên người nói) cập nhật vào bộ nhớ của bản giả và lưu `localStorage`, để người duyệt thấy thay đổi còn nguyên khi tải lại trang. Có nút "Đặt lại dữ liệu mẫu" trong bảng thử nghiệm.

## Kiểu dữ liệu

Viết bằng Zod trong `lib/data/types.ts`, suy ra kiểu TypeScript bằng `z.infer`. Dưới đây là hình dạng cần có.

```ts
type Profession =
  | "business_owner" | "doctor" | "lawyer"
  | "realestate_sales" | "architect" | "notary" | "other";

type SemanticTag = "decided" | "pending" | "risk" | "idea" | "figure";

type SessionStatus =
  | "recording"      // đang ghi
  | "unsynced"       // ghi xong, chưa tải lên
  | "processing"     // đang xử lý
  | "ready"          // xem được
  | "failed";        // xử lý lỗi

type StorageStatus = "full" | "essence_only";

interface User {
  id: string;
  display_name: string;
  honorific: "anh" | "chị" | null;
  email: string;
  profession: Profession;
  default_template_id: string;
  plan: "free" | "pro";
  ui_language: "vi" | "en";
  theme: "light" | "dark" | "system";
  consent_reminder: boolean;
}

interface Quota {
  period_end: string;
  minutes_used: number;
  minutes_limit: number;        // free 180, pro 1200
  max_session_minutes: number;  // free 45, pro 240
  chat_questions_per_session: number | null; // free 10, pro null
}

interface Template {
  id: string;
  profession: Profession;
  name: string;                 // "Gặp khách"
  sections: Array<{ id: string; title: string; enabled: boolean }>;
  suggested_questions: string[];
  footer_note?: string;         // dòng lưu ý của mẫu Buổi khám
}

interface Contact {
  id: string;
  name: string;
  role?: string;
  email?: string;
}

interface Session {
  id: string;
  user_id: string;
  workspace_id: string | null;
  title: string;
  template_id: string;
  language: string;             // ngôn ngữ nói, "vi"
  output_language: string;      // ngôn ngữ tóm tắt
  status: SessionStatus;
  processing_step?: 1 | 2 | 3 | 4 | 5;
  failure_reason?: string;
  storage_status: StorageStatus;
  duration_sec: number;
  size_bytes: number;
  audio_url: string | null;     // M9: file âm thanh thật; null là chưa có, phát giả như cũ
  created_at: string;
  audio_expires_at: string | null;
  consent: { confirmed: boolean; announced: boolean };
  participant_contact_ids: string[];

  // Nhẹ, đủ để vẽ hàng trong thư viện mà không cần tải chi tiết
  peaks_thumb: number[];        // 40 số từ 0 đến 1
  speaker_colors_thumb: string[]; // 40 mã màu tương ứng
  headline_tag?: { tag: SemanticTag; count: number };
  open_task_count: number;
}

interface SessionDetail extends Session {
  executive_summary: string;
  speakers: Speaker[];
  topics: Topic[];
  action_items: ActionItem[];
  notes: Note[];
  bookmarks: Bookmark[];
  photos: Photo[];
  peaks: number[];              // khoảng 600 số cho trình phát
  speaker_spans: Array<{ speaker_id: string; start_sec: number; end_sec: number }>;
  send_history: Array<{ sent_at: string; recipient_count: number }>;
}

interface Speaker {
  id: string;                   // "SPK_01"
  contact_id: string | null;    // null là chưa đặt tên
  display_name: string;         // "Người nói 2" khi chưa đặt tên
  is_me: boolean;
  color_index: 0 | 1 | 2 | 3 | 4 | 5;
  talk_ratio_percent: number;
  sample_start_sec: number;     // đoạn để "nghe thử"
}

interface Topic {
  id: string;
  section_id: string;           // thuộc phần nào của mẫu
  title: string;
  start_sec: number;
  end_sec: number;
  tag: SemanticTag;
  bullets: Array<{
    id: string;
    text: string;
    timestamp_sec: number;
    speaker_id: string;
    is_quote: boolean;          // câu trích nguyên văn
    edited: boolean;
    note_ids: string[];         // ghi chú tay gắn vào ý này
  }>;
  figure?: {
    chart_type: "bar" | "line";
    title: string;
    unit: string;               // "tỷ đồng"
    labels: string[];
    values: number[];
    source_timestamp_sec: number;
  };
}

interface ActionItem {
  id: string;
  session_id: string;
  task: string;
  assignee_contact_id: string | null;   // null là "Chưa giao"
  due_date: string | null;
  priority: "high" | "medium" | "low";
  done: boolean;
  done_at: string | null;
  source_quote: string | null;
  timestamp_sec: number | null;
}

interface Note { id: string; timestamp_sec: number; text: string }
interface Bookmark { id: string; timestamp_sec: number; tag: SemanticTag | null }
interface Photo { id: string; timestamp_sec: number; url: string; caption?: string }

interface TranscriptSegment {
  id: string;
  speaker_id: string;
  start_sec: number;
  end_sec: number;
  text: string;
  edited: boolean;              // người dùng đã sửa tay, mặc định false
}

interface VisualArtifacts {
  timeline: Array<{ topic_id: string; start_sec: number; end_sec: number; tag: SemanticTag }>;
  talk_share: Array<{ speaker_id: string; percent: number }>;
  flow_mermaid?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  citations: Array<{ timestamp_sec: number }>;
}

interface ShareLink {
  id: string;
  session_id: string;
  scope: "summary" | "summary_audio";
  has_password: boolean;
  expires_at: string | null;
  revoked: boolean;
  view_count: number;
}

interface GlossaryTerm { id: string; term: string; note?: string }
```

## Repository

```ts
interface SessionRepository {
  list(filter?: { query?: string; template_id?: string; range?: "week" | "all"; has_open_tasks?: boolean }): Promise<Session[]>;
  get(id: string): Promise<SessionDetail>;
  getTranscript(id: string): Promise<TranscriptSegment[]>;   // tải riêng vì nặng
  getVisuals(id: string): Promise<VisualArtifacts>;          // chỉ gọi khi mở tab
  update(id: string, patch: Partial<Pick<Session, "title" | "template_id" | "participant_contact_ids" | "audio_expires_at">>): Promise<void>;   // M4: audio_expires_at null là "Giữ lại bản gốc"
  updateBullet(sessionId: string, bulletId: string, text: string): Promise<void>;
  updateSegment(sessionId: string, segmentId: string, text: string): Promise<void>;   // M3: sửa lời, đánh dấu edited
  reassignSegment(sessionId: string, segmentId: string, speakerId: string): Promise<void>; // M3: đổi người nói của đoạn
  nameSpeaker(sessionId: string, speakerId: string, contactId: string): Promise<void>;
  mergeSpeakers(sessionId: string, fromId: string, intoId: string): Promise<void>;
  addContact(input: { name: string; email?: string }): Promise<Contact>;   // M3: tạo liên hệ ngay trong ô chọn tên
  updateContact(id: string, patch: Partial<Pick<Contact, "name" | "role" | "email">>): Promise<void>;  // M3: thêm email tại hàng người nhận
  createFromRecording(draft: RecordingDraft): Promise<{ id: string }>;
  subscribeProcessing(id: string, onStep: (step: number) => void): () => void;
  retryProcessing(id: string): Promise<void>;                 // thêm ở M1: nút "Thử lại" khi xử lý lỗi
  purgeRaw(ids: string[]): Promise<{ freed_bytes: number }>;
  remove(id: string): Promise<void>;                          // xóa, giữ trong removed để Hoàn tác (M4)
  restore(id: string): Promise<void>;                         // M4: Hoàn tác xóa, trả về đúng chỗ cũ
  reprocess(id: string, templateId: string): Promise<void>;   // M4: đổi mẫu và tóm tắt lại, chạy lại 5 bước
  search(query: string): Promise<{ sessions: Session[]; segments: Array<{ session_id: string; segment: TranscriptSegment }>; tasks: ActionItem[] }>;   // M4: so khớp bỏ dấu, không phân biệt hoa thường
  createFromImport(input: { file_name: string; duration_sec: number; template_id: string; language: string }): Promise<{ id: string }>;   // M4: file không được lưu
  getSample(profession: Profession): Promise<SessionDetail>;  // M4: buổi ghi mẫu theo nghề, không nằm trong list()
}

interface TaskRepository {
  listAll(filter?: { mine?: boolean }): Promise<ActionItem[]>;
  upsert(item: ActionItem): Promise<void>;
  toggleDone(id: string): Promise<void>;
}

interface ChatRepository {
  history(sessionId: string): Promise<ChatMessage[]>;
  ask(sessionId: string, question: string, onToken: (t: string) => void): Promise<ChatMessage>;
}

interface ShareRepository {
  create(sessionId: string, opts: Pick<ShareLink, "scope" | "expires_at"> & { password?: string }): Promise<ShareLink>;
  revoke(id: string): Promise<void>;
  getForSession(sessionId: string): Promise<ShareLink | null>;   // M4: link đang sống của một buổi
  listAll(): Promise<ShareLink[]>;                               // M4: mọi link, mục Quyền riêng tư
  recordView(shareId: string): Promise<void>;                    // M4: mỗi lần mở trang công khai tăng lượt xem
  getPublic(shareId: string, password?: string): Promise<PublicSessionView | "expired" | "revoked" | "needs_password" | "not_found">;   // M4: kiểm mật khẩu thật trên bản giả
}

interface MailRepository {
  preview(sessionId: string, recipientContactIds: string[], mode: "minutes" | "tasks" | "both"): Promise<EmailDraft[]>;
  send(drafts: EmailDraft[]): Promise<Array<{ contact_id: string; ok: boolean }>>;   // M3: ghi send_history, cờ ép lỗi một người
}

interface AccountRepository {
  me(): Promise<User>;
  updateMe(patch: Partial<User>): Promise<void>;                 // M4: thêm consent_announcement, auto_filter_silence, onboarded_at
  quota(): Promise<Quota>;
  templates(): Promise<Template[]>;
  contacts(): Promise<Contact[]>;
  glossary(): Promise<GlossaryTerm[]>;
  addGlossaryTerm(term: string): Promise<GlossaryTerm>;   // M3: trùng thì trả từ cũ
  updateGlossaryTerm(id: string, term: string): Promise<void>;   // M4: sửa từ
  removeGlossaryTerm(id: string): Promise<void>;                 // M4: xóa từ
  addContact(input: { name: string; email?: string }): Promise<Contact>;
  updateContact(id: string, patch: Partial<Pick<Contact, "name" | "role" | "email">>): Promise<void>;
  contactUsage(id: string): Promise<string[]>;                   // M4: các buổi ghi đang dùng liên hệ làm người nói
  removeContact(id: string): Promise<void>;                      // M4: xóa liên hệ, người nói về lại "Người nói N"
  updateTemplate(id: string, patch: Pick<Template, "sections">): Promise<void>;   // M4: bật/tắt và đổi thứ tự phần
  exportAll(): Promise<Record<string, unknown>>;                 // M4: tải toàn bộ dữ liệu JSON
}
```

Hàm nào trả lỗi phải ném `DataError` có trường `code`: `offline`, `not_found`, `quota_exceeded`, `server`. Giao diện hiển thị thông báo theo `code`, không hiển thị chuỗi lỗi thô.

## Bổ sung M6, M7

Đặc tả màn hình ở `08-da-ngon-ngu-va-nhom.md`. Các kiểu dưới đây thay hoặc mở rộng kiểu cũ; trường cũ nào bị thay thì bản giả phải tự chuyển dữ liệu cũ trong localStorage khi nạp.

```ts
type Lang = "vi" | "en" | "ko";            // thêm "ja", "zh" sau này
type LocalizedText = { vi: string } & Partial<Record<Lang, string>>;

// M6: thay đổi trên kiểu cũ
interface User {
  ui_language: Lang;
  default_speech_language: Lang;
  auto_detect_languages: boolean;
  default_report_language: Lang;
  auto_translate_on_send: boolean;
  current_workspace_id: string;      // M7
}

interface Template {
  name: LocalizedText;                // thay name + name_en
  sections: Array<{ id: string; title: LocalizedText; enabled: boolean }>;
  suggested_questions: LocalizedText[];
  footer_note?: LocalizedText;
  workspace_id: string | null;        // M7: null là mẫu hệ thống
}

interface Contact {
  preferred_language: Lang | null;    // null là theo ngôn ngữ báo cáo mặc định
}

interface GlossaryTerm {
  term: string;
  variants: Partial<Record<Lang, string>>;   // cách viết ở ngôn ngữ khác
}

interface Session {
  primary_language: Lang;             // thay language
  detected_languages: Lang[];         // gồm cả primary_language
  report_languages: Lang[];           // các bản tóm tắt đã có
  original_report_language: Lang;     // thay output_language
  visibility: "private" | "workspace";   // M7
  owner_user_id: string;              // M7, người ghi
}

interface TranscriptSegment {
  lang: Lang;
  translations: Partial<Record<Lang, { text: string; stale: boolean }>>;
}

// Phần tóm tắt tách thành bản theo ngôn ngữ.
// SessionDetail.executive_summary, topics, figure được đọc từ bản đang xem.
interface SummaryVersion {
  session_id: string;
  lang: Lang;
  source: "original" | "translated";
  translated_from: Lang | null;
  created_at: string;
  stale: boolean;                     // bản gốc đã sửa sau khi dịch
  executive_summary: string;
  topics: Topic[];                    // bullet trích dẫn giữ thêm original_text, original_lang
  task_texts: Record<string, string>; // action_item_id -> tên việc ở ngôn ngữ này
}

interface EmailDraft {
  lang: Lang;                         // theo người nhận
}

interface ShareLink {
  languages: Lang[];                  // các bản người xem được chọn
}

// M7
interface Workspace {
  id: string;
  kind: "personal" | "team";
  name: string;
  profession: Profession | null;
  default_report_language: Lang;
  plan: "free" | "pro" | "team";
  seat_limit: number | null;
  owner_user_id: string;
}

interface Member {
  workspace_id: string;
  user_id: string | null;             // null khi còn là lời mời
  email: string;
  display_name: string;
  role: "owner" | "admin" | "member";
  status: "active" | "invited";
  invited_at: string;
  invite_expires_at: string | null;
}

interface AuditEvent {
  id: string;
  workspace_id: string;
  actor_user_id: string;
  action: "view" | "share" | "unshare" | "export" | "delete" | "invite" | "remove_member" | "role_change" | "purge" | "send_email";
  target_type: "session" | "member" | "workspace" | "share_link";
  target_id: string;
  target_label: string;
  at: string;
}

interface UsageRow { user_id: string; month: string; sessions: number; minutes: number; open_tasks: number }
interface Invoice { id: string; period: string; seats: number; amount_label: string; status: "paid" | "due" }

interface DashboardData {
  range: "week" | "month";
  attention: Array<{ kind: "task_overdue" | "task_due_today" | "speaker_unnamed" | "audio_expiring" | "link_expiring" | "processing_failed"; target_id: string; label: string; href: string }>;
  totals: { sessions: number; minutes: number; decisions: number; tasks_done: number; tasks_total: number };
  by_day: Array<{ date: string; session_ids: string[]; minutes: number }>;
  decisions: Array<{ session_id: string; bullet_id: string; text: string; timestamp_sec: number }>;
  top_contacts: Array<{ contact_id: string; sessions: number; last_met_at: string }>;
  by_template: Array<{ template_id: string; minutes: number }>;
}
```

Repository thêm:

```ts
interface SessionRepository {
  getSummary(id: string, lang: Lang): Promise<SummaryVersion>;             // M6
  createSummaryVersion(id: string, lang: Lang, onStep: (step: 1 | 2) => void): Promise<SummaryVersion>;   // M6
  translateSegments(id: string, lang: Lang, segmentIds?: string[]): Promise<TranscriptSegment[]>;   // M6
  setVisibility(id: string, visibility: Session["visibility"]): Promise<void>;   // M7
  recordExport(id: string): Promise<void>;   // M7-03, nhật ký xuất file nhóm
}

interface WorkspaceRepository {           // M7
  list(): Promise<Workspace[]>;
  switchTo(id: string): Promise<void>;
  create(input: Pick<Workspace, "name" | "profession" | "default_report_language">): Promise<Workspace>;
  update(id: string, patch: Partial<Pick<Workspace, "name" | "profession" | "default_report_language">>): Promise<void>;
  remove(id: string): Promise<void>;
  members(id: string): Promise<Member[]>;
  invite(id: string, email: string, role: Member["role"]): Promise<Member>;
  revokeInvite(id: string, email: string): Promise<void>;
  changeRole(id: string, userId: string, role: Member["role"]): Promise<void>;
  removeMember(id: string, userId: string): Promise<void>;
  transferOwnership(id: string, userId: string): Promise<void>;
  leave(id: string): Promise<void>;       // M7-03
  setSeats(id: string, seats: number): Promise<void>;   // M7-03, đổi số chỗ giả lập
  getInvite(token: string): Promise<{ workspace: Workspace; invited_by: string } | "expired" | "not_found">;
  acceptInvite(token: string): Promise<void>;
  usage(id: string, month: string): Promise<UsageRow[]>;
  audit(id: string, filter?: { actor_user_id?: string; action?: AuditEvent["action"] }): Promise<AuditEvent[]>;
  invoices(id: string): Promise<Invoice[]>;
}

interface DashboardRepository {           // M7
  get(range: DashboardData["range"]): Promise<DashboardData>;
  team(range: DashboardData["range"]): Promise<{ usage: UsageRow[]; open_tasks_by_assignee: Array<{ user_id: string; open: number; overdue: number }> }>;
}
```

Quy tắc quyền nằm ở repository (bản giả cũng phải kiểm): `get`, `getTranscript` của buổi riêng tư người khác ném `DataError` mã `forbidden`; `list` trong không gian Nhóm chỉ trả buổi của mình và buổi `visibility: "workspace"`. Thêm `forbidden` vào danh sách mã lỗi.

M7-03 bổ sung: `audit`, `usage`, `invoices` chỉ Chủ và Quản trị đọc được; Thành viên gọi ném `DataError` mã `forbidden`. `leave` cho Thành viên và Quản trị tự rời nhóm; Chủ phải chuyển quyền Chủ hoặc xóa nhóm trước.

Khi nối database: `SummaryVersion` thành bảng `summary_versions (session_id, lang)`, `workspaces`, `members`, `audit_events` là bảng riêng; chính sách bảo mật theo hàng dựa trên `members` và `visibility`. Cập nhật `07-handover.md` mục 3 ở M7-04.

## Bổ sung M8 (nghe sạch, docs/09-nghe-sach.md)

Nguyên tắc: chỉ lưu một file gốc, không cắt sửa — "Nghe sạch" là **chế độ
phát** bật tắt được, dựa trên bản đồ nghe tính trước một lần khi xử lý. Máy
người dùng chỉ đọc bản đồ để nhảy qua và chỉnh âm lượng; lọc ồn chạy nhẹ trên
máy. Tải file, gửi biên bản, xuất file, link công khai luôn dùng file gốc.

```ts
interface ListeningMap {
  session_id: string;
  silences: Array<{ start_sec: number; end_sec: number }>;   // khoảng lặng hơn 1,5 giây
  fillers: Array<{ start_sec: number; end_sec: number; text: string }>;
  speaker_gain_db: Record<string, number>;                   // speaker_id -> mức tăng giảm, -6 đến +9
  noise_level: "low" | "medium" | "high";
  clean_duration_sec: number;                                // thời lượng khi bỏ khoảng lặng (không bỏ tiếng đệm)
}

interface TranscriptSegment {
  text_clean: string;          // Bản gọn; text giữ Nguyên văn
  words?: Array<{ w: string; start_sec: number; end_sec: number; filler?: boolean }>;   // có khi nối AI thật
}

interface User {
  listening_prefs: { enabled: boolean; denoise: boolean; level: boolean; skip_silence: boolean; skip_fillers: boolean };
}

interface SessionRepository {
  getListeningMap(id: string): Promise<ListeningMap | null>;   // null: buổi chưa có dữ liệu nghe sạch
}
```

- Bản giả: `getListeningMap` đọc từ fixture (`scripts/gen-listening-map.mjs`
  sinh cho mọi buổi mẫu từ `speaker_spans`, `transcript` và `peaks` — khoảng
  lặng là chỗ trống giữa hai đoạn, nền ồn của buổi được vẽ thấp vào `peaks`).
  `text_clean` viết tay cho các đoạn có tiếng đệm, từ lặp, nói vấp; đoạn còn
  lại trùng câu gốc. Mốc từng chữ mockup chưa có: chia đều thời lượng đoạn
  theo số ký tự (`lib/listening/words.ts`, hàm riêng — thay bằng mốc thật sau).
- Dữ liệu cũ trong localStorage tự chuyển khi nạp (migrate): thiếu
  `listening_prefs` điền mặc định (`enabled: false`, còn lại theo đặc tả);
  thiếu `text_clean` thì dùng `text`.
- Bản thật: lọc ồn bằng `AudioWorklet` (ví dụ RNNoise WASM), cân âm lượng bằng
  `GainNode` theo người nói đang phát, nhảy khoảng lặng bằng `seek` theo bản
  đồ. Khi xử lý buổi ghi, cùng lượt AI sinh mốc từng chữ, đánh dấu tiếng đệm,
  sinh `text_clean` và tính bản đồ nghe (VAD cho khoảng lặng, mức âm lượng
  trung bình theo người nói). Ghi chi tiết vào `07-handover.md` ở bước 6.

## Bổ sung M9 (âm thanh thật cho 3 buổi mẫu, issue #65)

- `Session.audio_url: string | null` — đường dẫn file âm thanh thật. Ba buổi
  mẫu có âm thanh thật (giọng AI edge-tts, PR #64): `s-bds-lan`
  (`/audio/01-bds-gap-chi-lan.m4a`), `s-hop-han` (`02-hop-doi-tac-han.m4a`),
  `s-sample-doctor` (`03-bac-si-kham.m4a`); chỉ dùng `.m4a` (AAC) để phát được
  trên mọi trình duyệt kể cả iPhone. Buổi khác `audio_url` null — trình phát
  dùng đồng hồ giả như cũ.
- Với 3 buổi này: `duration_sec` = độ dài file; mốc từng đoạn bản ghi lời lấy
  từ `truth.json` (khớp theo `id`); mọi `source_ref` (ý tóm tắt, việc, trích
  dẫn, biểu đồ, ghi chú, dấu trang, ảnh, trích dẫn Hỏi AI) đổi theo mốc mới
  (ánh xạ gấp khúc theo `fixture_start_sec`, sinh bằng script
  `scripts/attach-test-audio.mjs`); `peaks`/`peaks_thumb` sinh lại từ RMS của
  chính file; `ListeningMap` tính lại từ âm thanh (khoảng lặng xác năng lượng
  trong khoảng trống giữa các đoạn, dài hơn 1,5 giây; `speaker_gain_db` đo
  RMS thật của từng người, giữ -6 đến +9 dB; `clean_duration_sec` trừ các
  khoảng lặng). Dữ liệu ánh xạ đầy đủ nằm ở `fixtures/audio-attach.json`
  (keyframes, peaks, bản đồ nghe) — migrate kho localStorage cũ đọc từ đây,
  giữ nguyên phần người dùng đã sửa, chỉ đổi mốc.
- Trình phát: buổi có `audio_url` dùng `HTMLAudioElement` qua
  `createAudioPlayer(url, duration)` cùng interface `Player` với đồng hồ giả
  (`lib/player/mock-player.ts`); Nghe sạch nối `MediaElementSource` vào Web
  Audio (GainNode theo người nói, lọc tạm cắt 100 Hz–7 kHz + nén nhẹ — bản
  thật dùng RNNoise, xem `07-handover.md`). Buổi không có âm thanh phát giả
  như trước, mọi phần khác không đổi.

## Fixture

Viết bằng tiếng Việt, nội dung như thật, tên người và số liệu hợp lý. Không dùng "Lorem ipsum", "Nguyễn Văn A", "Test 1".

| File | Nội dung | Độ đầy đủ |
| --- | --- | --- |
| `sessions/bds-gap-chi-lan.json` | Gặp khách mua căn 2PN, 42 phút, 3 người nói (1 chưa đặt tên) | Đầy đủ: 6 chủ đề, 3 việc, bản ghi lời khoảng 80 đoạn, 1 biểu đồ so giá, 2 ảnh, 3 ghi chú, 5 câu hỏi AI |
| `sessions/hop-dieu-hanh-t11.json` | Họp điều hành công ty nội thất, 68 phút, 5 người nói | Đầy đủ: 7 chủ đề, 8 việc (1 quá hạn, 2 đã xong), biểu đồ doanh thu, sơ đồ quy trình |
| `sessions/luat-tu-van-ong-phuoc.json` | Tư vấn tranh chấp hợp đồng thuê | Vừa: tóm tắt + việc, đang ở trạng thái `processing` bước 3 |
| `sessions/kts-hop-cong-truong.json` | Họp hiện trường nhà phố 4 tầng | Vừa: tóm tắt + việc + 4 ảnh |
| `sessions/bac-si-buoi-kham.json` | Buổi khám nội tổng quát | Vừa: tóm tắt + dặn dò, `storage_status: essence_only` |
| `sessions/cong-chung-chuyen-nhuong.json` | Phiên công chứng hợp đồng chuyển nhượng | Vừa: tóm tắt + giấy tờ thiếu |
| `sessions/loi-xu-ly.json` | Buổi ghi `failed` | Tối thiểu |
| `sessions/chua-tai-len.json` | Buổi ghi `unsynced` | Tối thiểu |
| `templates.json`, `contacts.json`, `glossary.json`, `user.json`, `quota.json` | Theo kiểu dữ liệu | 6 mẫu, 10 liên hệ, 12 thuật ngữ |

Mảng `peaks` sinh bằng một script nhỏ (`scripts/gen-peaks.ts`) từ `speaker_spans`, có khoảng lặng giữa các lượt nói, để dải giọng trông tự nhiên.

Người dùng mẫu: nghề `realestate_sales`. Đổi nghề trong bảng thử nghiệm thì buổi ghi mẫu ở màn hình làm quen đổi theo.

## Nối database sau này

Khi mockup đã duyệt, việc nối dữ liệu gồm đúng các bước sau, không đụng tới `components/` và `app/`:

1. Tạo bảng theo các kiểu ở trên. `Session` và `SessionDetail` thành bảng `sessions` (phần chi tiết nằm trong cột JSONB `structured_summary`), `ActionItem` tách bảng riêng `action_items` để truy vấn xuyên buổi ghi, `TranscriptSegment` nằm trong cột `raw_transcript` (xóa được khi dọn bản gốc).
2. Viết `lib/data/supabase/` cài đặt cùng các interface repository.
3. Đổi một dòng trong `lib/data/index.ts`, điều khiển bằng biến môi trường `NEXT_PUBLIC_DATA_SOURCE`.
4. Thay `lib/player` bằng trình phát âm thanh thật, giữ nguyên interface (`play`, `pause`, `seek`, `currentTime`, `rate`).
5. Thay phần ghi âm giả bằng bản ghi thật theo kết quả bài thử kỹ thuật.

Khác biệt cố ý so với bản đặc tả 1.0: thêm `status`, `consent`, `participant_contact_ids`, `output_language`, tách `action_items` ra bảng riêng, đổi nhãn `breakthrough` thành `idea` và `formula` thành `figure`, thêm bảng `contacts`, `glossary_terms`, `share_links`.

## Bổ sung C1 (PR 01 — nền đăng nhập)

Thư viện đã duyệt và đang dùng ở PR 01 (đặc tả `docs/12-auth-db-group-spec.md` §1.1, §1.3):

- `next-auth` v4 (4.24.15): đăng nhập Google OAuth là cửa chính; phiên JWT trong cookie `noteim.session` (httpOnly, SameSite=Lax, 30 ngày), không cần bảng phiên trong DB. Chỉ lần đăng nhập là ghi DB.
- `drizzle-orm` + `drizzle-kit`: schema và migration cho Postgres (Supabase). Migration chạy bằng `pnpm db:migrate` khi triển khai.
- `postgres` (postgres.js): driver nối Postgres qua connection pooler của Supabase (`prepare: false`).

Bảng nền đã có: `users`, `accounts`, `auth_sessions`, `verification_tokens` (`lib/db/schema.ts`, migration `drizzle/`). Schema toàn bộ §1.4 là việc của PR 02.

Nguồn dữ liệu: chưa đổi — app vẫn chạy mock (`lib/data`). Chế độ remote bật ở PR 03 bằng `NEXT_PUBLIC_DATA_SOURCE=remote` cho người đăng nhập; chế độ ẩn danh luôn dùng dữ liệu trên máy.

Biến môi trường mới (chỉ tên — không commit khóa, xem `.env.example`): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `NEXTAUTH_URL`, `DATABASE_URL`; cờ kiểm thử `AUTH_FAKE`, `NEXT_PUBLIC_AUTH_FAKE` (chỉ máy e2e).

## Bổ sung C1 (PR 02 — schema toàn bộ §1.4)

Đặc tả nguồn sự thật: `docs/12-auth-db-group-spec.md` §1.4. Mục này chỉ thêm, không đụng nội dung cũ ở trên.

- **Nền DB**: Supabase Postgres (vùng ap-southeast-1) qua connection pooler transaction; driver `postgres` đặt `prepare: false` (`lib/db/index.ts`). Supabase chỉ dùng như một Postgres: không Auth, không RLS — quyền kiểm nằm ở repository phía máy chủ.
- **Bảng theo §1.4** (`lib/db/schema.ts`, migration `drizzle/`): `users` (bổ sung các công tắc ghi/ngôn ngữ còn thiếu theo kiểu `User`), `accounts`, `auth_sessions`, `verification_tokens` (từ PR 01); thêm `workspaces`, `workspace_members`, `invites`, `folders`, `folder_sessions`, `sessions`, `session_details`, `transcript_segments`, `summary_versions`, `action_items`, `contacts`, `glossary_terms`, `chat_messages`, `share_links`, `session_gap_checks`, `consent_receipts`, `audit_log`, `usage_counters`, `promo_codes`.
- **Quy tắc id**: id các bảng mà client sinh (session, folder, contact, glossary, action item, thư mục nối…) giữ kiểu **text** để di trú giữ nguyên mọi id (§1.2); id người dùng là uuid do máy chủ sinh (`users.id`).
- **Phần linh hoạt** (peaks, speaker_spans, translations, words, listening_map, topics, consent, result_json…) để JSONB thay vì dựng bảng con — khớp hình dạng repository hiện tại.
- `session_gap_checks` có **ràng buộc tối đa 10 dòng/buổi** bằng trigger trong migration (đúng §1.4); `usage_counters` dùng chuỗi rỗng thay NULL cho phần ẩn danh để chỉ mục duy nhất chặn trùng đúng luật.
- **Chạy thật** theo thứ tự: `pnpm db:check` (kiểm nối, không cần migration) → `pnpm db:migrate` → `pnpm db:seed` (dữ liệu demo cho môi trường thử, có chế độ `--dry`). `DATABASE_URL` chỉ đọc từ biến môi trường — trên máy làm việc hiện chưa có giá trị Supabase nên migration thật **đang chờ**.
- **`dataNow()`** (§1.3): bản mock giữ `MOCK_NOW` cố định để e2e ổn định; bản remote trả giờ máy chủ, ngày tính theo múi giờ `Asia/Ho_Chi_Minh` (trợ giúp `lib/data/vn-time.ts`).
- Nguồn dữ liệu app vẫn chưa đổi — chọn nguồn remote là việc của PR 03.
