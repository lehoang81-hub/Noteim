import type {
  ActionItem,
  AuditEvent,
  ChatMessage,
  ConsentReceipt,
  Contact,
  DashboardData,
  Folder,
  FolderKind,
  GlossaryTerm,
  Invoice,
  Lang,
  ListeningMap,
  Member,
  Profession,
  Quota,
  Session,
  SessionDetail,
  ShareLink,
  SummaryVersion,
  Template,
  TranscriptSegment,
  UsageRow,
  User,
  VisualArtifacts,
  Visibility,
  Workspace,
} from "./types";
import type { GapCheckResult } from "../gap-check/types";

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
  /** Chỉ buổi của mình trong không gian Nhóm (M7-01, lọc "Của tôi") */
  mine?: boolean;
  /** Chỉ buổi đã chia sẻ cho cả nhóm (M7-01, lọc "Cả nhóm") */
  shared?: boolean;
};

/** Kết quả tìm kiếm (M4-02), nhóm theo Buổi ghi / Trong lời nói / Việc cần làm. */
export type SearchResult = {
  sessions: Session[];
  segments: Array<{ session_id: string; segment: TranscriptSegment }>;
  tasks: ActionItem[];
};

export type RecordingDraft = {
  title?: string;
  template_id: string;
  /** Ngôn ngữ nói chính của buổi (M6-02) */
  primary_language: Lang;
  /** Có thể có tiếng khác — app tự nhận các đoạn tiếng Anh, tiếng Hàn (M6-02) */
  auto_detect_languages?: boolean;
  duration_sec: number;
  notes: { timestamp_sec: number; text: string }[];
  bookmarks: { timestamp_sec: number; tag: string | null }[];
  /** Ảnh giữ id để tìm pixel trong IndexedDB (lib/record/photo-store.ts);
   * url chỉ có giá trị trong bộ nhớ của phiên ghi, localStorage giữ rỗng. */
  photos: { id: string; timestamp_sec: number; url: string }[];
  /** Âm lượng lấy mẫu 4 giá trị mỗi giây, để dựng lại dải giọng */
  levels: number[];
  consent?: { confirmed: boolean; announced: boolean; receipts?: ConsentReceipt[] };
  /** Thư mục gắn cho buổi mới (GC-05, đặc tả v1.1 §4.7): buổi kế thừa mẫu
   * của thư mục và được ghi vào session_ids của thư mục khi lưu. */
  folder_id?: string;
  /** Kết quả rà thiếu gần nhất của buổi (GC-04, đặc tả v1.1 §4.5): màn chi
   * tiết dùng để dựng checklist "Cần bổ sung sau buổi". Chưa rà lần nào thì
   * không có — checklist không hiện. */
  gap_check?: { template_id: string; checked_at: string; result: GapCheckResult } | null;
  /** Câu hỏi bấm "Hỏi AI trên thư mục" từ sheet rà thiếu khi đang ghi (GC-04):
   * sau khi lưu buổi nằm chờ trong tab Hỏi AI để người dùng bấm gửi. */
  pending_ai_questions?: string[];
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
  /** Sửa lời một đoạn bản ghi: lưu và đánh dấu edited (M3-01). M8-01 thêm
   * field: "text" là câu Nguyên văn (bản dịch của đoạn lỗi thời), "text_clean"
   * là bản gọn theo chế độ đang xem — câu gốc giữ nguyên. */
  updateSegment(sessionId: string, segmentId: string, text: string, field?: "text" | "text_clean"): Promise<void>;
  /** Đổi người nói của một đoạn bản ghi (M3-01) */
  reassignSegment(sessionId: string, segmentId: string, speakerId: string): Promise<void>;
  /** Chép một dòng vào ghi chú nhanh của buổi đã lưu (GC-04, đặc tả v1.1
   * §4.5): ghi chú gắn vào ý có mốc gần nhất để hiện trong Tóm tắt. */
  addQuickNote(sessionId: string, text: string): Promise<void>;
  /** Tick một mục trong checklist "Cần bổ sung sau buổi" (GC-04): mục mờ dần
   * và tự ẩn; tải lại trang vẫn ẩn nhờ danh sách ô đã xong lưu kèm buổi. */
  completeGapCheckItem(sessionId: string, key: string): Promise<void>;
  /** Câu hỏi chuyển từ Gap Check đã bấm gửi trong Hỏi AI (GC-04): gỡ khỏi
   * hàng chờ để tải lại trang không còn chip cũ. */
  consumePendingAiQuestion(sessionId: string, question: string): Promise<void>;
  /** Dịch đoạn bản ghi lời sang ngôn ngữ `lang` (M6-02). Không truyền
   * segmentIds thì dịch mọi đoạn chưa có bản dịch ở `lang`. */
  translateSegments(sessionId: string, lang: Lang, segmentIds?: string[]): Promise<TranscriptSegment[]>;
  /** Bản tóm tắt theo ngôn ngữ (M6-03): lang == original_report_language thì
   * trả bản gốc trong detail, ngược lại trả bản đã tạo. */
  getSummary(id: string, lang: Lang): Promise<SummaryVersion>;
  /** Tạo (hoặc Dịch lại nếu bản đã có và lỗi thời) một bản tóm tắt theo
   * ngôn ngữ, qua 2 bước: onStep(1) dịch tóm tắt, onStep(2) dịch việc (M6-03).
   * Gói Free chỉ tạo 1 bản thêm mỗi buổi: vượt hạn mức ném DataError
   * quota_exceeded. */
  createSummaryVersion(id: string, lang: Lang, onStep: (step: 1 | 2) => void): Promise<SummaryVersion>;
  /** Sửa một ý trong bản tóm tắt theo ngôn ngữ; bản khác không đổi (M6-03) */
  updateVersionBullet(sessionId: string, lang: Lang, bulletId: string, text: string): Promise<void>;
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
  /** Tìm kiếm xuyên buổi: tiêu đề, tóm tắt, bản ghi lời, việc cần làm (M4-02).
   * Bản giả so khớp không phân biệt hoa thường và cả dấu tiếng Việt. */
  search(query: string): Promise<SearchResult>;
  /** Tạo buổi ghi từ file có sẵn (M4-02): không lưu file, chỉ đọc thông tin.
   * M6-02: language là ngôn ngữ nói chính, auto_detect_languages là công tắc
   * "Có thể có tiếng khác" (bản giả không nhận diện được, chỉ lưu lựa chọn). */
  createFromImport(input: { file_name: string; duration_sec: number; template_id: string; language: Lang; auto_detect_languages?: boolean }): Promise<{ id: string }>;
  /** Buổi ghi mẫu theo nghề (M4-04): dùng ở màn làm quen và Cài đặt > Hồ sơ */
  getSample(profession: Profession): Promise<SessionDetail>;
  /** Đổi Riêng tư / Cả nhóm (M7-01). Chỉ người ghi buổi được đổi; buổi cá
   * nhân luôn riêng tư. Đổi sang "workspace" chỉ có tác dụng trong không gian Nhóm. */
  setVisibility(id: string, visibility: Visibility): Promise<void>;
  /** Ghi nhật ký "xuất file" của buổi ghi khi đang ở không gian Nhóm (M7-03).
   * Nút xuất (Sao chép văn bản, Xuất PDF, Xuất Word) gọi để nhật ký nhóm có
   * dòng xuất; chỉ người được đọc nội dung mới ghi được dòng này. */
  recordExport(id: string): Promise<void>;
  /** Bản đồ nghe của buổi (M8-01, docs/09): khoảng lặng, tiếng đệm, mức to
   * nhỏ theo người nói. null là buổi chưa có dữ liệu nghe sạch (buổi cũ chưa
   * xử lại, buổi ghi mới đang xử lý) — nút Nghe sạch tắt kèm dòng giải thích. */
  getListeningMap(id: string): Promise<ListeningMap | null>;
}

/**
 * Không gian làm việc, thành viên, lời mời và quyền (M7-01).
 * Quyền kiểm ở repository: thao tác ngoài vai trò ném DataError mã
 * "forbidden"; nhóm hết chỗ khi mời, lời mời hết hạn khi nhận.
 */
export interface WorkspaceRepository {
  list(): Promise<Workspace[]>;
  switchTo(id: string): Promise<void>;
  create(input: Pick<Workspace, "name" | "profession" | "default_report_language">): Promise<Workspace>;
  update(id: string, patch: Partial<Pick<Workspace, "name" | "profession" | "default_report_language">>): Promise<void>;
  remove(id: string): Promise<void>;
  members(id: string): Promise<Member[]>;
  invite(id: string, email: string, role: Member["role"]): Promise<Member>;
  revokeInvite(id: string, email: string): Promise<void>;
  changeRole(id: string, userId: string, role: Member["role"]): Promise<void>;
  /** Gỡ thành viên: buổi riêng tư của họ về không gian Cá nhân của họ, buổi
   * đã chia sẻ với nhóm ở lại nhóm. */
  removeMember(id: string, userId: string): Promise<void>;
  transferOwnership(id: string, userId: string): Promise<void>;
  /** Rời nhóm (M7-03): Thành viên và Quản trị tự rời; Chủ phải chuyển quyền
   * Chủ hoặc xóa nhóm trước. Buổi riêng tư của người rời về không gian Cá
   * nhân của họ, buổi đã chia sẻ với nhóm ở lại nhóm; xong quay về Cá nhân. */
  leave(id: string): Promise<void>;
  /** Đổi số chỗ của gói Nhóm, giả lập (M7-03): chỉ Chủ; không giảm dưới số
   * thành viên đang có, không dưới 1. */
  setSeats(id: string, seats: number): Promise<void>;
  /** Xem lời mời theo token của bản giả (sinh từ email, xem inviteToken).
   * "expired" khi hết hạn (thật hoặc ép bằng cờ thử nghiệm), "not_found"
   * khi token không tồn tại. */
  getInvite(token: string): Promise<{ workspace: Workspace; invited_by: string } | "expired" | "not_found">;
  acceptInvite(token: string): Promise<void>;
  usage(id: string, month: string): Promise<UsageRow[]>;
  audit(id: string, filter?: { actor_user_id?: string; action?: AuditEvent["action"] }): Promise<AuditEvent[]>;
  invoices(id: string): Promise<Invoice[]>;
}

/**
 * Thư mục theo hồ sơ (GC-05, đặc tả v1.1 §4.7): tạo/sửa thư mục chọn nghề một
 * lần, buổi mới gắn vào thư mục kế thừa mẫu; buổi vẫn đổi mẫu riêng được
 * (override từng buổi). Hình dạng và tên phương thức khớp nhánh GY1 (PR #76).
 */
export interface FolderRepository {
  list(): Promise<Folder[]>;
  get(id: string): Promise<Folder>;
  create(input: {
    kind: FolderKind;
    name: string;
    ref?: string;
    note?: string;
    /** Mẫu kế thừa cho buổi mới; không chọn là null (mẫu mặc định "Tổng quát") */
    template_id?: string | null;
    session_ids?: string[];
  }): Promise<Folder>;
  update(id: string, patch: Partial<Pick<Folder, "name" | "ref" | "note" | "template_id" | "session_ids">>): Promise<void>;
  /** Xóa thư mục: các buổi ghi không bị xóa, chỉ gỡ khỏi thư mục */
  remove(id: string): Promise<void>;
}

export interface TaskRepository {
  /** lang: hiển thị theo ngôn ngữ báo cáo của từng buổi (M6-03) */
  listAll(filter?: { mine?: boolean; lang?: Lang }): Promise<ActionItem[]>;
  upsert(item: ActionItem): Promise<void>;
  toggleDone(id: string): Promise<ActionItem>;
}

/**
 * Tổng quan cá nhân và nhóm (M7-02, docs/04). Mọi số liệu tính từ dữ liệu của
 * kho theo không gian đang dùng và quyền đọc của người dùng: không đếm nội
 * dung buổi riêng tư của người khác (quyền của M7-01, docs/08 phần B).
 */
export interface DashboardRepository {
  get(range: DashboardData["range"]): Promise<DashboardData>;
  /** Bảng Nhóm: mức dùng và việc mở của cả nhóm. Chỉ Chủ và Quản trị trong
   * không gian Nhóm; không đúng vai trò ném DataError mã "forbidden".
   * Mức dùng tính cả buổi riêng tư của từng người (bảng quyền cho phép thấy
   * tên và thời lượng để tính mức dùng), nhưng chỉ ra số — không lộ nội dung. */
  team(range: DashboardData["range"]): Promise<{
    usage: UsageRow[];
    open_tasks_by_assignee: Array<{ user_id: string; open: number; overdue: number }>;
  }>;
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
  /** Ngôn ngữ của bản đang xem (M6-04) */
  lang: Lang;
  /** Các bản người xem được chọn (M6-04); bản đầu là bản gốc */
  languages: Lang[];
};

export interface ShareRepository {
  create(
    sessionId: string,
    // M6-04: languages là các bản tóm tắt người xem được chọn
    opts: Pick<ShareLink, "scope" | "expires_at"> & { password?: string; languages?: Lang[] },
  ): Promise<ShareLink>;
  revoke(id: string): Promise<void>;
  /** Link đang sống của một buổi ghi (M4-01): null là chưa có */
  getForSession(sessionId: string): Promise<ShareLink | null>;
  /** Mọi link đã tạo, cho mục Quyền riêng tư (M4-01) */
  listAll(): Promise<ShareLink[]>;
  /** Mỗi lần mở trang công khai tăng lượt xem (M4-01) */
  recordView(shareId: string): Promise<void>;
  /** lang: xem bản tóm tắt theo ngôn ngữ (M6-04); không truyền là bản gốc */
  getPublic(
    shareId: string,
    password?: string,
    lang?: Lang,
  ): Promise<PublicSessionView | "expired" | "revoked" | "needs_password" | "not_found">;
}

export type EmailDraft = {
  /** Buổi ghi gốc — bản giả dùng để ghi send_history khi gửi (M3-04) */
  session_id?: string;
  to_contact_id: string;
  subject: string;
  body: string;
  kind: "minutes" | "tasks";
  /** Ngôn ngữ của email, theo người nhận (M6-04) */
  lang: Lang;
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
  /** Sửa một từ trong từ điển (M4-03) */
  updateGlossaryTerm(id: string, term: string): Promise<void>;
  /** Xóa một từ khỏi từ điển (M4-03) */
  removeGlossaryTerm(id: string): Promise<void>;
  /** Tạo liên hệ mới ngay trong ô chọn tên (M3-02) */
  addContact(input: { name: string; email?: string }): Promise<Contact>;
  /** Sửa liên hệ, ví dụ thêm email ngay tại hàng người nhận (M3-02, M3-04);
   * preferred_language là ngôn ngữ ưa dùng khi gửi biên bản (M6-04) */
  updateContact(id: string, patch: Partial<Pick<Contact, "name" | "role" | "email" | "preferred_language">>): Promise<void>;
  /** Xóa liên hệ: trả về các buổi ghi đang dùng người này làm người nói,
   * để giao diện cảnh báo trước khi xóa (M4-03) */
  contactUsage(id: string): Promise<string[]>;
  /** Xóa liên hệ; người nói đang gán liên hệ này về lại "Người nói N" (M4-03) */
  removeContact(id: string): Promise<void>;
  /** Bật/tắt và đổi thứ tự các phần của một mẫu (M4-03) */
  updateTemplate(id: string, patch: Pick<Template, "sections">): Promise<void>;
  /** Xuất toàn bộ dữ liệu mẫu ra JSON để tải về (M4-03) */
  exportAll(): Promise<Record<string, unknown>>;
}

export interface DataSource {
  sessions: SessionRepository;
  tasks: TaskRepository;
  chat: ChatRepository;
  share: ShareRepository;
  mail: MailRepository;
  account: AccountRepository;
  /** Không gian làm việc (M7-01) */
  workspaces: WorkspaceRepository;
  /** Tổng quan cá nhân và nhóm (M7-02) */
  dashboard: DashboardRepository;
  /** Thư mục theo hồ sơ (GC-05, đặc tả v1.1 §4.7) */
  folders: FolderRepository;
}
