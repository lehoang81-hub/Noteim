import type {
  ActionItem,
  ChatMessage,
  Contact,
  GlossaryTerm,
  Quota,
  Session,
  SessionDetail,
  ShareLink,
  Template,
  TranscriptSegment,
  User,
  VisualArtifacts,
} from "./types";

/*
 * Interface các repository. Giao diện chỉ biết các interface này.
 * Bản giả: lib/data/mock. Bản thật (sau mockup): lib/data/supabase.
 * Chọn bản cài đặt ở lib/data/index.ts.
 */

export type SessionFilter = {
  query?: string;
  template_id?: string;
  range?: "week" | "all";
  has_open_tasks?: boolean;
};

export type RecordingDraft = {
  title?: string;
  template_id: string;
  duration_sec: number;
  notes: { timestamp_sec: number; text: string }[];
  bookmarks: { timestamp_sec: number; tag: string | null }[];
  /** Ảnh giữ id để tìm pixel trong IndexedDB (lib/record/photo-store.ts);
   * url chỉ có giá trị trong bộ nhớ của phiên ghi, localStorage giữ rỗng. */
  photos: { id: string; timestamp_sec: number; url: string }[];
  /** Âm lượng lấy mẫu 4 giá trị mỗi giây, để dựng lại dải giọng */
  levels: number[];
  consent?: { confirmed: boolean; announced: boolean };
};

export interface SessionRepository {
  list(filter?: SessionFilter): Promise<Session[]>;
  get(id: string): Promise<SessionDetail>;
  getTranscript(id: string): Promise<TranscriptSegment[]>;
  getVisuals(id: string): Promise<VisualArtifacts>;
  update(
    id: string,
    patch: Partial<Pick<Session, "title" | "template_id" | "participant_contact_ids" | "audio_expires_at">>,
  ): Promise<void>;
  updateBullet(sessionId: string, bulletId: string, text: string): Promise<void>;
  /** Sửa lời một đoạn bản ghi: lưu và đánh dấu edited (M3-01) */
  updateSegment(sessionId: string, segmentId: string, text: string): Promise<void>;
  /** Đổi người nói của một đoạn bản ghi (M3-01) */
  reassignSegment(sessionId: string, segmentId: string, speakerId: string): Promise<void>;
  nameSpeaker(sessionId: string, speakerId: string, contactId: string): Promise<void>;
  mergeSpeakers(sessionId: string, fromId: string, intoId: string): Promise<void>;
  createFromRecording(draft: RecordingDraft): Promise<{ id: string }>;
  subscribeProcessing(id: string, onStep: (step: number) => void): () => void;
  /** Buổi ghi xử lý lỗi: chạy lại từ bước 1 */
  retryProcessing(id: string): Promise<void>;
  purgeRaw(ids: string[]): Promise<{ freed_bytes: number }>;
  remove(id: string): Promise<void>;
  /** Hoàn tác xóa: trả buổi ghi về thư viện đúng chỗ cũ (M4-01) */
  restore(id: string): Promise<void>;
  /** Đổi mẫu và tóm tắt lại: chạy lại 5 bước xử lý theo mẫu mới (M4-01) */
  reprocess(id: string, templateId: string): Promise<void>;
}

export interface TaskRepository {
  listAll(filter?: { mine?: boolean }): Promise<ActionItem[]>;
  upsert(item: ActionItem): Promise<void>;
  toggleDone(id: string): Promise<ActionItem>;
}

export interface ChatRepository {
  history(sessionId: string): Promise<ChatMessage[]>;
  ask(sessionId: string, question: string, onToken: (text: string) => void): Promise<ChatMessage>;
}

export type PublicSessionView = Pick<
  SessionDetail,
  "title" | "executive_summary" | "topics" | "duration_sec" | "created_at" | "speakers"
> & {
  /** Tên người chia sẻ, hiện đầu trang công khai (M4-01) */
  sharer_name: string;
  scope: ShareLink["scope"];
};

export interface ShareRepository {
  create(
    sessionId: string,
    opts: Pick<ShareLink, "scope" | "expires_at"> & { password?: string },
  ): Promise<ShareLink>;
  revoke(id: string): Promise<void>;
  /** Link đang sống của một buổi ghi (M4-01): null là chưa có */
  getForSession(sessionId: string): Promise<ShareLink | null>;
  /** Mọi link đã tạo, cho mục Quyền riêng tư (M4-01) */
  listAll(): Promise<ShareLink[]>;
  /** Mỗi lần mở trang công khai tăng lượt xem (M4-01) */
  recordView(shareId: string): Promise<void>;
  getPublic(
    shareId: string,
    password?: string,
  ): Promise<PublicSessionView | "expired" | "revoked" | "needs_password" | "not_found">;
}

export type EmailDraft = {
  /** Buổi ghi gốc — bản giả dùng để ghi send_history khi gửi (M3-04) */
  session_id?: string;
  to_contact_id: string;
  subject: string;
  body: string;
  kind: "minutes" | "tasks";
};

export interface MailRepository {
  preview(sessionId: string, recipientContactIds: string[], mode: "minutes" | "tasks" | "both"): Promise<EmailDraft[]>;
  send(drafts: EmailDraft[]): Promise<Array<{ contact_id: string; ok: boolean }>>;
}

export interface AccountRepository {
  me(): Promise<User>;
  updateMe(patch: Partial<User>): Promise<void>;
  quota(): Promise<Quota>;
  templates(): Promise<Template[]>;
  contacts(): Promise<Contact[]>;
  glossary(): Promise<GlossaryTerm[]>;
  /** Thêm từ vào từ điển tên riêng; trùng (không phân biệt hoa thường) thì trả từ cũ (M3-01) */
  addGlossaryTerm(term: string): Promise<GlossaryTerm>;
  /** Tạo liên hệ mới ngay trong ô chọn tên (M3-02) */
  addContact(input: { name: string; email?: string }): Promise<Contact>;
  /** Sửa liên hệ, ví dụ thêm email ngay tại hàng người nhận (M3-02, M3-04) */
  updateContact(id: string, patch: Partial<Pick<Contact, "name" | "role" | "email">>): Promise<void>;
}

export interface DataSource {
  sessions: SessionRepository;
  tasks: TaskRepository;
  chat: ChatRepository;
  share: ShareRepository;
  mail: MailRepository;
  account: AccountRepository;
}
