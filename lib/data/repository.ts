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
  photos: { timestamp_sec: number; url: string }[];
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
    patch: Partial<Pick<Session, "title" | "template_id" | "participant_contact_ids">>,
  ): Promise<void>;
  updateBullet(sessionId: string, bulletId: string, text: string): Promise<void>;
  nameSpeaker(sessionId: string, speakerId: string, contactId: string): Promise<void>;
  mergeSpeakers(sessionId: string, fromId: string, intoId: string): Promise<void>;
  createFromRecording(draft: RecordingDraft): Promise<{ id: string }>;
  subscribeProcessing(id: string, onStep: (step: number) => void): () => void;
  /** Buổi ghi xử lý lỗi: chạy lại từ bước 1 */
  retryProcessing(id: string): Promise<void>;
  purgeRaw(ids: string[]): Promise<{ freed_bytes: number }>;
  remove(id: string): Promise<void>;
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

export type PublicSessionView = Pick<SessionDetail, "title" | "executive_summary" | "topics" | "duration_sec" | "created_at">;

export interface ShareRepository {
  create(
    sessionId: string,
    opts: Pick<ShareLink, "scope" | "expires_at"> & { password?: string },
  ): Promise<ShareLink>;
  revoke(id: string): Promise<void>;
  getPublic(shareId: string): Promise<PublicSessionView | "expired" | "revoked" | "needs_password">;
}

export type EmailDraft = {
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
}

export interface DataSource {
  sessions: SessionRepository;
  tasks: TaskRepository;
  chat: ChatRepository;
  share: ShareRepository;
  mail: MailRepository;
  account: AccountRepository;
}
