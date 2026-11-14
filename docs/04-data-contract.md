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
  update(id: string, patch: Partial<Pick<Session, "title" | "template_id">>): Promise<void>;
  updateBullet(sessionId: string, bulletId: string, text: string): Promise<void>;
  nameSpeaker(sessionId: string, speakerId: string, contactId: string): Promise<void>;
  mergeSpeakers(sessionId: string, fromId: string, intoId: string): Promise<void>;
  createFromRecording(draft: RecordingDraft): Promise<{ id: string }>;
  subscribeProcessing(id: string, onStep: (step: number) => void): () => void;
  retryProcessing(id: string): Promise<void>;                 // thêm ở M1: nút "Thử lại" khi xử lý lỗi
  purgeRaw(ids: string[]): Promise<{ freed_bytes: number }>;
  remove(id: string): Promise<void>;
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
  getPublic(shareId: string): Promise<PublicSessionView | "expired" | "revoked" | "needs_password">;
}

interface MailRepository {
  preview(sessionId: string, recipientContactIds: string[], mode: "minutes" | "tasks" | "both"): Promise<EmailDraft[]>;
  send(drafts: EmailDraft[]): Promise<Array<{ contact_id: string; ok: boolean }>>;
}

interface AccountRepository {
  me(): Promise<User>;
  updateMe(patch: Partial<User>): Promise<void>;
  quota(): Promise<Quota>;
  templates(): Promise<Template[]>;
  contacts(): Promise<Contact[]>;
  glossary(): Promise<GlossaryTerm[]>;
}
```

Hàm nào trả lỗi phải ném `DataError` có trường `code`: `offline`, `not_found`, `quota_exceeded`, `server`. Giao diện hiển thị thông báo theo `code`, không hiển thị chuỗi lỗi thô.

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
