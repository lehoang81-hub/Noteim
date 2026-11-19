"use client";

import { getFlags } from "@/lib/debug/flags";
import { inviteToken } from "@/lib/team/invite-token";
import { dayDiff, endOfDay, vnDate } from "@/lib/format";
import type { DataSource, EmailDraft, RecordingDraft, SessionFilter, SearchResult as SearchResult } from "../repository";
import { DataError } from "../errors";
import type {
  ActionItem,
  AuditEvent,
  ChatMessage,
  Contact,
  DashboardData,
  Folder,
  FolderChatMessage,
  GlossaryTerm,
  Lang,
  Member,
  Session,
  SessionDetail,
  ShareLink,
  SummaryVersion,
  UsageRow,
  Workspace,
  WorkspaceRole,
} from "../types";
import { MOCK_NOW, commit, getDb, persistSilently, samplesReady, sessionsReady, type StoredSession } from "./store";

/*
 * Bản giả của lớp dữ liệu (docs/04-data-contract.md).
 * - Mọi hàm trả Promise, có độ trễ 300 đến 800ms (3 giây khi bật "Tải chậm").
 * - Cờ bảng thử nghiệm: "Lỗi tải" làm mọi lần đọc lỗi, "Mất mạng" làm mọi lần ghi lỗi.
 * - Ghi thì sửa kho trong bộ nhớ và lưu localStorage.
 */

function wait(): Promise<void> {
  const ms = getFlags().slow ? 3000 : 300 + Math.random() * 500;
  return new Promise((r) => setTimeout(r, ms));
}

async function read<T>(fn: () => T | Promise<T>): Promise<T> {
  await wait();
  // Chờ kho nạp xong (fixture đi qua import() động — M5 sửa review #41)
  await sessionsReady();
  if (getFlags().failLoad) throw new DataError("server");
  return structuredClone(await fn());
}

async function write<T>(fn: () => T | Promise<T>): Promise<T> {
  await wait();
  await sessionsReady();
  if (getFlags().offline) throw new DataError("offline");
  const out = await fn();
  commit();
  return structuredClone(out);
}

/** So khớp không phân biệt hoa thường, bỏ dấu tiếng Việt (M4-02). */
function foldVi(s: string): string {
  return s
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

async function findFixture(id: string): Promise<StoredSession & { draft?: RecordingDraft; chat_log?: ChatMessage[] }> {
  const db = await sessionsReady();
  // Buổi ghi mẫu (M4-04) nằm ngoài danh sách chính nhưng vẫn mở được chi tiết;
  // chỉ đợi nạp mẫu khi id là buổi mẫu (M5-04 — thư viện không trả giá này)
  let fx = db.sessions.find((s) => (s.listDetail ?? s.detail).id === id);
  if (!fx && id.startsWith("s-sample-")) {
    await samplesReady();
    fx = db.samples.find((s) => (s.listDetail ?? s.detail).id === id);
  }
  if (!fx) throw new DataError("not_found");
  return fx;
}

/** Tách phần nhẹ của buổi ghi (dùng cho thư viện và tìm kiếm): Zod nằm ở
 * seed-data.ts, nạp bằng import() động để không vào chunk khởi tạo. */
async function stripSessions(list: Array<Session | SessionDetail>): Promise<Session[]> {
  const { stripToSession } = await import("./seed-data");
  return list.map(stripToSession);
}

/* ---------- Không gian làm việc và quyền (M7-01, issue #47) ---------- */

function myUserId(): string {
  return getDb().user.id;
}

/** Không gian đang dùng; dữ liệu lạ thì quy về không gian Cá nhân. */
function currentWorkspace(): Workspace {
  const db = getDb();
  const id = db.user.current_workspace_id || "w-hoang";
  return db.workspaces.find((w) => w.id === id) ?? db.workspaces.find((w) => w.kind === "personal")!;
}

/**
 * Vai trò của tôi trong một không gian. Không gian Cá nhân coi như Chủ;
 * không gian Nhóm theo dữ liệu thành viên. Cờ "Đổi vai trò" của bảng thử
 * nghiệm ép vai trò để kiểm bảng quyền (M7-01).
 */
function myRole(workspaceId: string): WorkspaceRole | null {
  const db = getDb();
  const ws = db.workspaces.find((w) => w.id === workspaceId);
  if (!ws) return null;
  if (ws.kind === "personal") return "owner";
  const forced = getFlags().debugRole;
  if (forced) return forced;
  const m = db.members.find((x) => x.workspace_id === workspaceId && x.user_id === myUserId() && x.status === "active");
  return m?.role ?? null;
}

/**
 * Quyền quản trị nhóm (M7-03): mức dùng theo người, nhật ký truy cập, hóa đơn
 * chỉ Chủ và Quản trị thấy. Thành viên ném forbidden (docs/08 bảng quyền).
 */
function assertAdmin(workspaceId: string) {
  const r = myRole(workspaceId);
  if (!r || r === "member") throw new DataError("forbidden");
}

/** Buổi ghi thuộc không gian đang dùng: Cá nhân là buổi không thuộc nhóm nào. */
function inCurrentWorkspace(d: Pick<Session, "workspace_id">): boolean {
  const ws = currentWorkspace();
  return ws.kind === "personal" ? !d.workspace_id : d.workspace_id === ws.id;
}

/** Quyền đọc nội dung buổi ghi (M7-01): buổi Cá nhân chỉ người ghi; buổi nhóm
 * phải là thành viên, buổi riêng tư chỉ người ghi được đọc — kể cả Chủ, Quản trị. */
function canRead(d: Pick<Session, "workspace_id" | "visibility" | "owner_user_id" | "user_id">): boolean {
  const owner = d.owner_user_id || d.user_id;
  if (!d.workspace_id) return owner === myUserId();
  if (!myRole(d.workspace_id)) return false;
  return d.visibility === "workspace" || owner === myUserId();
}

function assertCanRead(d: Pick<Session, "workspace_id" | "visibility" | "owner_user_id" | "user_id">) {
  if (!canRead(d)) throw new DataError("forbidden");
}

/** Quyền sửa buổi ghi: đọc được và là người ghi. */
function assertOwnSession(d: Pick<Session, "workspace_id" | "visibility" | "owner_user_id" | "user_id">) {
  assertCanRead(d);
  if ((d.owner_user_id || d.user_id) !== myUserId()) throw new DataError("forbidden");
}

/** Ghi một dòng nhật ký của không gian nhóm (M7-01). */
function pushAudit(
  workspaceId: string,
  action: AuditEvent["action"],
  targetType: AuditEvent["target_type"],
  targetId: string,
  targetLabel: string,
) {
  getDb().audit.push({
    id: `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    workspace_id: workspaceId,
    actor_user_id: myUserId(),
    action,
    target_type: targetType,
    target_id: targetId,
    target_label: targetLabel,
    at: MOCK_NOW.toISOString(),
  });
}

/*
 * Nhật ký "ai xem" (M7-03): mỗi phiên trình duyệt ghi một dòng cho mỗi buổi và
 * người xem. Lưu bằng persistSilently (không gọi commit) để không kích hoạt tải
 * lại của useData (vòng lặp), nhưng vẫn còn sau khi tải lại trang.
 */
const viewLogged = new Set<string>();

function pushViewAudit(d: Pick<Session, "workspace_id" | "id" | "title">) {
  if (!d.workspace_id) return;
  const key = `${d.id}:${myUserId()}`;
  if (viewLogged.has(key)) return;
  viewLogged.add(key);
  pushAudit(d.workspace_id, "view", "session", d.id, d.title);
  persistSilently();
}

/** Bản sao ShareLink không kèm mật khẩu (mật khẩu chỉ dùng nội bộ bản giả). */
function toShareLink(s: ShareLink & { password?: string }): ShareLink {
  return {
    id: s.id,
    session_id: s.session_id,
    scope: s.scope,
    has_password: s.has_password,
    expires_at: s.expires_at,
    revoked: s.revoked,
    view_count: s.view_count,
    languages: s.languages ?? [],
  };
}

/*
 * Tổng quan (M7-02, issue #48). Mọi số liệu tính tại chỗ từ kho theo không
 * gian đang dùng — không có số cứng trong dữ liệu mẫu.
 */

/** Cửa sổ khoảng: Tuần này = 7 ngày gần nhất (khớp lọc "Tuần này" của thư viện), Tháng này = 30 ngày. */
function rangeWindow(range: DashboardData["range"]): number {
  return (range === "week" ? 7 : 30) * 86400_000;
}

/**
 * Buổi ghi được ĐỌC NỘI DUNG trong không gian đang dùng — cùng phạm vi với
 * sessions.list. Buổi riêng tư của người khác không lọt vào đây: số liệu
 * Tổng quan không đếm nội dung buổi riêng tư người khác (quyền M7-01).
 */
function visibleSessions(): SessionDetail[] {
  const db = getDb();
  const ws = currentWorkspace();
  const me = myUserId();
  return db.sessions
    .map((s) => s.detail)
    .filter((d) => {
      if (ws.kind === "personal") return !d.workspace_id && (d.owner_user_id || d.user_id) === me;
      return d.workspace_id === ws.id && (d.visibility === "workspace" || (d.owner_user_id || d.user_id) === me);
    });
}

/** Gom "Cần xử lý" từ các buổi được đọc nội dung (M7-02). */
function buildAttention(visible: SessionDetail[]): DashboardData["attention"] {
  const now = MOCK_NOW;
  const out: DashboardData["attention"] = [];
  // Việc quá hạn và đến hạn hôm nay: hàng nào mở đúng chỗ sửa việc, kèm mốc
  // trong buổi nếu có
  const tasks: DashboardData["attention"] = [];
  for (const d of visible) {
    for (const a of d.action_items) {
      if (a.done || !a.due_date) continue;
      const end = endOfDay(a.due_date);
      // target_id ghép id buổi: id việc chỉ duy nhất trong từng buổi của fixture
      if (end.getTime() < now.getTime()) {
        tasks.push({ kind: "task_overdue", target_id: `${d.id}:${a.id}`, label: a.task, href: `/s/${d.id}?tab=tasks` });
      } else if (dayDiff(now, end) === 0) {
        tasks.push({ kind: "task_due_today", target_id: `${d.id}:${a.id}`, label: a.task, href: `/s/${d.id}?tab=tasks` });
      }
    }
  }
  tasks.sort((a, b) => a.label.localeCompare(b.label, "vi"));
  out.push(...tasks);
  for (const d of visible) {
    // Người nói chưa đặt tên: một dòng mỗi buổi (nhấn vào mở bảng đặt tên)
    if (d.status === "ready" && d.speakers.some((s) => !s.contact_id && !s.is_me))
      out.push({ kind: "speaker_unnamed", target_id: d.id, label: d.title, href: `/s/${d.id}?sheet=speakers` });
    // Bản gốc sắp tự xóa (gói Free, nhắc trước 48 giờ như cảnh báo của buổi)
    if (d.audio_expires_at) {
      const diff = new Date(d.audio_expires_at).getTime() - now.getTime();
      if (diff > 0 && diff <= 48 * 3600_000)
        out.push({ kind: "audio_expiring", target_id: d.id, label: d.title, href: `/s/${d.id}` });
    }
    // Buổi ghi xử lý lỗi: mở buổi để bấm Chạy lại
    if (d.status === "failed")
      out.push({ kind: "processing_failed", target_id: d.id, label: d.title, href: `/s/${d.id}` });
  }
  // Link chia sẻ sắp hết hạn: chỉ link của buổi được đọc trong không gian đang dùng
  for (const sh of getDb().shares) {
    if (sh.revoked || !sh.expires_at) continue;
    const diff = new Date(sh.expires_at).getTime() - now.getTime();
    if (diff <= 0 || diff > 48 * 3600_000) continue;
    const d = visible.find((x) => x.id === sh.session_id);
    if (!d) continue;
    out.push({ kind: "link_expiring", target_id: sh.id, label: d.title, href: `/s/${d.id}?sheet=share` });
  }
  return out;
}

function refreshCounts(d: SessionDetail) {
  const open = d.action_items.filter((a) => !a.done).length;
  d.open_task_count = open;
  if (d.status === "ready") {
    if (open > 0) d.headline_tag = { tag: "pending", count: open };
    else {
      const decided = d.topics.filter((t) => t.tag === "decided").length;
      d.headline_tag = decided > 0 ? { tag: "decided", count: decided } : undefined;
    }
  }
}

/**
 * Bản gốc của buổi (M6-03): đọc executive_summary/topics từ SessionDetail,
 * gói thành SummaryVersion. Ý trích dẫn không cần original_text vì đây là
 * câu gốc.
 */
function originalVersion(d: SessionDetail): SummaryVersion {
  return {
    session_id: d.id,
    lang: d.original_report_language,
    source: "original",
    translated_from: null,
    created_at: d.created_at,
    stale: false,
    executive_summary: d.executive_summary,
    topics: d.topics,
    task_texts: Object.fromEntries(d.action_items.map((a) => [a.id, a.task])),
  };
}

/** Bản dịch đã lưu trong kho (fixture summary_versions hoặc bản đã tạo). */
function storedVersion(fx: { detail: SessionDetail; summary_versions?: SummaryVersion[] }, lang: Lang): SummaryVersion | null {
  return (fx.summary_versions ?? []).find((v) => v.lang === lang) ?? null;
}

function matches(d: Session | SessionDetail, f: SessionFilter | undefined): boolean {
  if (!f) return true;
  if (f.template_id && d.template_id !== f.template_id) return false;
  if (f.has_open_tasks && d.open_task_count === 0) return false;
  if (f.range === "week" && MOCK_NOW.getTime() - new Date(d.created_at).getTime() > 7 * 86400_000) return false;
  if (f.query) {
    // Tìm theo query chỉ dùng cho danh sách có tóm tắt (SessionDetail);
    // danh sách thư viện (Session) không lọc theo từ.
    if (!("topics" in d)) return false;
    const q = f.query.toLocaleLowerCase("vi");
    const hay = [d.title, d.executive_summary, ...d.topics.flatMap((t) => [t.title, ...t.bullets.map((b) => b.text)])]
      .join(" ")
      .toLocaleLowerCase("vi");
    if (!hay.includes(q)) return false;
  }
  return true;
}

/*
 * Xử lý buổi ghi: bộ đếm chạy độc lập với người nghe, nên rời màn hình giữa
 * chừng xử lý vẫn chạy; tải lại trang thì chạy tiếp từ bước đang dở (resume).
 * subscribeProcessing chỉ để màn hình xử lý nghe bước hiện tại.
 */

const processingTimers = new Map<string, number>();
const processingListeners = new Map<string, Set<(step: number) => void>>();
const PROCESS_STEP_MS = 1600;

/** Người nhận đã từng gửi lỗi (cờ "Gửi email lỗi một người"): gửi lại thì thành công. */
const mailFailedOnce = new Set<string>();

function notifyProcessing(id: string, step: number) {
  processingListeners.get(id)?.forEach((fn) => fn(step));
}

function completeProcessing(id: string) {
  const db = getDb();
  const fx = db.sessions.find((s) => s.detail.id === id);
  processingTimers.delete(id);
  if (!fx || fx.detail.status !== "processing") return;
  const draft = fx.draft;
  if (draft) {
    const template = db.templates.find((t) => t.id === draft.template_id);
    // Sinh nội dung nằm ở seed-data/generate (fixture nghề) — nạp bằng
    // import() động, không nằm trong chunk khởi tạo (M5 sửa review #41)
    void (async () => {
      const { buildSessionContent } = await import("./generate");
      // Trong lúc chờ module, buổi ghi có thể đã bị xóa hoặc xử lý lại
      if (fx.detail.status !== "processing") return;
      const content = await buildSessionContent({ sessionId: id, draft, template, createdAt: fx.detail.created_at });
      Object.assign(fx.detail, content);
      fx.detail.status = "ready";
      delete fx.detail.processing_step;
      delete fx.detail.failure_reason;
      delete fx.draft;
      // Gói Free: bản gốc tự xóa sau 7 ngày; Pro giữ đến khi tự dọn
      const plan = getFlags().plan ?? getDb().user.plan;
      fx.detail.audio_expires_at =
        plan === "free" ? new Date(Date.parse(fx.detail.created_at) + 7 * 86400_000).toISOString() : null;
      refreshCounts(fx.detail);
      commit();
      notifyProcessing(id, 6);
    })();
  } else {
    // Không có bản nháp (buổi ghi mẫu): chỉ đánh dấu đã xử lý xong
    fx.detail.status = "ready";
    delete fx.detail.processing_step;
    refreshCounts(fx.detail);
    commit();
    notifyProcessing(id, 6);
  }
}

function advanceProcessing(id: string) {
  const fx = getDb().sessions.find((s) => s.detail.id === id);
  if (!fx || fx.detail.status !== "processing") {
    processingTimers.delete(id);
    return;
  }
  const step = (fx.detail.processing_step ?? 1) + 1;
  if (step > 5) {
    completeProcessing(id);
    return;
  }
  fx.detail.processing_step = step as 1 | 2 | 3 | 4 | 5;
  commit();
  notifyProcessing(id, step);
  processingTimers.set(id, window.setTimeout(() => advanceProcessing(id), PROCESS_STEP_MS));
}

/** Chạy xử lý từ trạng thái hiện tại; gọi khi tạo buổi ghi và khi tải lại trang. */
function scheduleProcessing(id: string) {
  window.clearTimeout(processingTimers.get(id));
  processingTimers.set(id, window.setTimeout(() => advanceProcessing(id), PROCESS_STEP_MS));
}

/** Gom mảng âm lượng về 40 cột cho hàng thư viện (giống resample trong draw.ts). */
function resampleThumb(levels: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < 40; i++) {
    const from = Math.floor((i * levels.length) / 40);
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / 40));
    let max = 0;
    for (let j = from; j < to; j++) max = Math.max(max, levels[j] ?? 0);
    out.push(Math.round(max * 100) / 100);
  }
  return out;
}

/** Buổi ghi mới đang xử lý dở: chạy tiếp sau khi tải lại trang. */
if (typeof window !== "undefined") {
  const resume = () => {
    for (const s of getDb().sessions) {
      if (s.detail.status === "processing" && s.detail.id.startsWith("s-new-") && !processingTimers.has(s.detail.id)) {
        scheduleProcessing(s.detail.id);
      }
    }
  };
  // Chạy sau khung vẽ đầu để localStorage đã sẵn sàng. Kho khôi phục từ
  // localStorage đã có buổi ghi; kho mới tạo rỗng thì không chủ động kéo
  // fixture về chỉ để kiểm resume (M5-04) — nơi đọc buổi ghi đầu tiên sẽ nạp.
  window.setTimeout(resume, 0);
  window.setTimeout(() => {
    if (getDb().sessions.length > 0) resume();
  }, 3000);
}

export const mockSource: DataSource = {
  sessions: {
    list: (filter) =>
      read(async () => {
        await sessionsReady();
        if (getFlags().emptyLibrary) return [];
        const db = getDb();
        const ws = currentWorkspace();
        const me = myUserId();
        return stripSessions(
          db.sessions
            .map((s) => s.listDetail ?? s.detail)
            .filter((d) => {
              // Không gian Cá nhân: chỉ buổi của mình — buổi nhóm không lẫn vào,
              // kể cả buổi riêng tư của người khác sau khi bị gỡ khỏi nhóm (M7-01)
              if (ws.kind === "personal") return !d.workspace_id && (d.owner_user_id || d.user_id) === me;
              if (d.workspace_id !== ws.id) return false;
              // Không gian Nhóm: buổi của mình và buổi đã chia sẻ cho cả nhóm
              return d.visibility === "workspace" || (d.owner_user_id || d.user_id) === me;
            })
            .filter((d) => (filter?.mine ? (d.owner_user_id || d.user_id) === me : true))
            .filter((d) => (filter?.shared ? d.visibility === "workspace" : true))
            .filter((d) => matches(d, filter))
            .sort((a, b) => b.created_at.localeCompare(a.created_at)),
        );
      }),
    get: (id) =>
      read(async () => {
        const fx = await findFixture(id);
        // Buổi riêng tư của người khác ném forbidden — giao diện hiện thông
        // báo không có quyền, không lộ nội dung (docs/08 phần B)
        assertCanRead(fx.detail);
        // Nhật ký nhóm: ai xem buổi ghi nào (M7-03)
        pushViewAudit(fx.detail);
        return fx.detail;
      }),
    getTranscript: (id) =>
      read(async () => {
        const fx = await findFixture(id);
        assertCanRead(fx.detail);
        return fx.transcript;
      }),
    getVisuals: (id) =>
      read(async () => {
        await sessionsReady();
        const fx = await findFixture(id);
        assertCanRead(fx.detail);
        const d = fx.detail;
        return {
          timeline: d.topics.map((t) => ({ topic_id: t.id, start_sec: t.start_sec, end_sec: t.end_sec, tag: t.tag })),
          talk_share: d.speakers.map((s) => ({ speaker_id: s.id, percent: s.talk_ratio_percent })),
          flow_mermaid: fx.flow_mermaid,
        };
      }),
    update: (id, patch) =>
      write(async () => {
        await sessionsReady();
        const fx = await findFixture(id);
        assertOwnSession(fx.detail);
        Object.assign(fx.detail, patch);
      }),
    updateBullet: (sessionId, bulletId, text) =>
      write(async () => {
        await sessionsReady();
        const fx = await findFixture(sessionId);
        assertOwnSession(fx.detail);
        for (const t of fx.detail.topics)
          for (const b of t.bullets)
            if (b.id === bulletId) {
              b.text = text;
              b.edited = true;
            }
        // Sửa ý ở bản gốc: mọi bản dịch hiện "Bản gốc đã sửa sau khi dịch" (M6-03)
        for (const v of fx.summary_versions ?? []) v.stale = true;
      }),
    updateSegment: (sessionId, segmentId, text, field = "text") =>
      write(async () => {
        await sessionsReady();
        const fx = await findFixture(sessionId);
        assertOwnSession(fx.detail);
        const seg = fx.transcript.find((s) => s.id === segmentId);
        if (!seg) throw new DataError("not_found");
        // M8-01: sửa theo chế độ đang xem — bản gọn sửa text_clean, không đụng
        // câu Nguyên văn (bằng chứng không bị đổi); bản dịch không lỗi thời.
        if (field === "text_clean") {
          seg.text_clean = text;
          seg.edited = true;
          return;
        }
        seg.text = text;
        seg.edited = true;
        // Câu gốc đã sửa: mọi bản dịch hiện có của đoạn này sang trạng thái
        // "Cần dịch lại" (M6-02)
        for (const tr of Object.values(seg.translations)) if (tr) tr.stale = true;
      }),
    translateSegments: (sessionId, lang, segmentIds) =>
      write(async () => {
        await sessionsReady();
        const fx = await findFixture(sessionId);
        // Cờ bảng thử nghiệm: dịch chậm 10 giây, dịch lỗi có Thử lại (M6-02)
        if (getFlags().translateSlow) await new Promise((r) => setTimeout(r, 10000));
        if (getFlags().translateFail) throw new DataError("server");
        // Bật "Xem bản dịch" (không kèm segmentIds): chỉ điền đoạn CHƯA có bản
        // dịch; đoạn đang "Cần dịch lại" giữ nguyên nhãn cho đến khi người dùng
        // chủ động dịch lại đoạn đó ("Dịch đoạn này") — M6-02
        const bulk = !segmentIds;
        const list = fx.transcript.filter((s) => (segmentIds ? segmentIds.includes(s.id) : true) && s.lang !== lang);
        for (const seg of list) {
          const existing = seg.translations[lang];
          if (existing && (!existing.stale || bulk)) continue;
          if (existing?.stale) {
            // Mockup không dịch lại được nội dung: giữ bản dịch cũ, gỡ nhãn lỗi thời
            seg.translations[lang] = { ...existing, stale: false };
          } else {
            // Chưa có bản dịch trong fixture: điền "bản dịch mẫu" kèm câu gốc,
            // không bịa nội dung (docs/08, Bản ghi lời)
            seg.translations[lang] = { text: seg.text, stale: false, sample: true };
          }
        }
        return fx.transcript;
      }),
    getSummary: (id, lang) =>
      read(async () => {
        await sessionsReady();
        const fx = await findFixture(id);
        if (lang === fx.detail.original_report_language) return originalVersion(fx.detail);
        const stored = storedVersion(fx, lang);
        if (!stored) throw new DataError("not_found");
        return stored;
      }),
    createSummaryVersion: (id, lang, onStep) =>
      write(async () => {
        await sessionsReady();
        const db = getDb();
        const fx = await findFixture(id);
        const d = fx.detail;
        if (lang === d.original_report_language) return originalVersion(d);
        const existing = storedVersion(fx, lang);
        // Gói Free: 1 bản thêm mỗi buổi (bản gốc không tính). Bản lỗi thời
        // "Dịch lại" thì không mất gì thêm.
        const plan = getFlags().plan ?? db.user.plan;
        if (!existing && plan === "free" && (fx.summary_versions?.length ?? 0) >= 1) {
          throw new DataError("quota_exceeded");
        }
        // Cờ bảng thử nghiệm: dịch chậm 10 giây, dịch lỗi có Thử lại (docs/08)
        if (getFlags().translateSlow) await new Promise((r) => setTimeout(r, 10000));
        onStep(1);
        await new Promise((r) => setTimeout(r, 1500));
        onStep(2);
        await new Promise((r) => setTimeout(r, 1500));
        if (getFlags().translateFail) throw new DataError("server");
        // Bản giả không sinh nội dung mới: giữ câu gốc ở bản dịch, đánh dấu
        // sample để giao diện ghi "Bản dịch mẫu" (không bịa nội dung)
        const version: SummaryVersion = existing ?? {
          session_id: d.id,
          lang,
          source: "translated",
          translated_from: d.original_report_language,
          created_at: new Date().toISOString(),
          stale: false,
          executive_summary: d.executive_summary,
          topics: d.topics.map((t) => ({
            ...t,
            bullets: t.bullets.map((b) => ({ ...b, original_text: b.text, original_lang: d.original_report_language })),
          })),
          task_texts: Object.fromEntries(d.action_items.map((a) => [a.id, a.task])),
          sample: true,
        };
        version.stale = false;
        version.created_at = new Date().toISOString();
        if (existing) {
          for (const v of fx.summary_versions ?? []) if (v.lang === lang) v.stale = false;
        } else {
          (fx.summary_versions ??= []).push(version);
          if (!d.report_languages.includes(lang)) d.report_languages.push(lang);
        }
        return version;
      }),
    updateVersionBullet: (sessionId, lang, bulletId, text) =>
      write(async () => {
        await sessionsReady();
        const fx = await findFixture(sessionId);
        const v = storedVersion(fx, lang);
        if (!v) throw new DataError("not_found");
        for (const t of v.topics)
          for (const b of t.bullets)
            if (b.id === bulletId) {
              b.text = text;
              b.edited = true;
              // Sửa bản dịch không tự sửa bản khác, bản gốc giữ nguyên (M6-03)
            }
      }),
    reassignSegment: (sessionId, segmentId, speakerId) =>
      write(async () => {
        await sessionsReady();
        const fx = await findFixture(sessionId);
        assertOwnSession(fx.detail);
        const seg = fx.transcript.find((s) => s.id === segmentId);
        const sp = fx.detail.speakers.find((s) => s.id === speakerId);
        if (!seg || !sp) throw new DataError("not_found");
        seg.speaker_id = speakerId;
      }),
    nameSpeaker: (sessionId, speakerId, contactId) =>
      write(async () => {
        await sessionsReady();
        const d = (await findFixture(sessionId)).detail;
        assertOwnSession(d);
        const contact = getDb().contacts.find((c) => c.id === contactId);
        const sp = d.speakers.find((s) => s.id === speakerId);
        if (!sp || !contact) throw new DataError("not_found");
        // Một liên hệ chỉ gán cho một người nói trong cùng buổi (M3-02):
        // người nói nào đang giữ liên hệ này thì trả về chưa đặt tên. Nhãn
        // "Người nói N" sinh lúc vẽ theo ngôn ngữ (M5 sửa review #41 mục 5)
        d.speakers.forEach((other) => {
          if (other.id !== speakerId && other.contact_id === contact.id) {
            other.contact_id = null;
            other.display_name = null;
          }
        });
        sp.contact_id = contact.id;
        sp.display_name = contact.name;
      }),
    mergeSpeakers: (sessionId, fromId, intoId) =>
      write(async () => {
        await sessionsReady();
        const d = (await findFixture(sessionId)).detail;
        assertOwnSession(d);
        const from = d.speakers.find((s) => s.id === fromId);
        const into = d.speakers.find((s) => s.id === intoId);
        if (!from || !into) throw new DataError("not_found");
        into.talk_ratio_percent += from.talk_ratio_percent;
        d.speakers = d.speakers.filter((s) => s.id !== fromId);
        // Gộp chuyển cả dải giọng (speaker_spans), ý tóm tắt, bản ghi lời —
        // nhờ đó mọi nơi đổi màu theo người giữ lại
        d.speaker_spans.forEach((s) => s.speaker_id === fromId && (s.speaker_id = intoId));
        d.topics.forEach((t) => t.bullets.forEach((b) => b.speaker_id === fromId && (b.speaker_id = intoId)));
        (await findFixture(sessionId)).transcript.forEach((g) => g.speaker_id === fromId && (g.speaker_id = intoId));
      }),
    createFromRecording: (draft) => {
      // Mất mạng: vẫn tạo buổi ghi trên máy, trạng thái chờ tải lên (M2-04);
      // có mạng lại thì tự chuyển sang xử lý (xem ProcessingWatcher)
      const offline = getFlags().offline;
      const create = () => {
        const db = getDb();
        const id = `s-new-${Date.now()}`;
        const now = new Date().toISOString();
        // Ảnh chỉ lưu id trong kho mẫu: pixel nằm ở IndexedDB theo id ảnh
        // (lib/record/photo-store.ts), localStorage không giữ data URL
        // cỡ trăm KB — nguyên nhân mất buổi ghi khi bộ nhớ đầy (PR #22, lỗi 3)
        const storedDraft: RecordingDraft = { ...draft, photos: draft.photos.map(({ id: photoId, timestamp_sec }) => ({ id: photoId, timestamp_sec, url: "" })) };
        // Dải giọng hàng thư viện hình thành theo âm lượng đã ghi ngay từ lúc
        // tạo, không đợi xử lý xong
        const thumb =
          draft.levels.length >= 6
            ? resampleThumb(draft.levels)
            : Array.from({ length: 40 }, (_, i) => 0.3 + 0.5 * Math.abs(Math.sin(i / 5)));
        const detail: SessionDetail = {
          id,
          user_id: db.user.id,
          // Buổi mới thuộc không gian đang dùng; ở không gian Cá nhân để
          // workspace_id null (quy ước của dữ liệu cũ, M7-01)
          workspace_id: currentWorkspace().kind === "team" ? currentWorkspace().id : null,
          // Buổi mới luôn riêng tư cho đến khi người dùng chia sẻ (M7-01)
          visibility: "private",
          owner_user_id: db.user.id,
          title: draft.title ?? "",
          template_id: draft.template_id,
          // Ngôn ngữ nói chính chọn ở bảng "Bắt đầu ghi" (M6-02)
          primary_language: draft.primary_language,
          detected_languages: [draft.primary_language],
          report_languages: [db.user.default_report_language ?? db.user.ui_language],
          original_report_language: db.user.default_report_language ?? db.user.ui_language,
          status: offline ? "unsynced" : "processing",
          processing_step: offline ? undefined : 1,
          storage_status: "full",
          duration_sec: draft.duration_sec,
          size_bytes: draft.duration_sec * 3000,
          created_at: now,
          audio_expires_at: null,
          consent: draft.consent ?? { confirmed: true, announced: false },
          participant_contact_ids: [],
          peaks_thumb: thumb,
          speaker_colors_thumb: Array.from({ length: 40 }, () => 0),
          open_task_count: 0,
          executive_summary: "",
          speakers: [],
          topics: [],
          action_items: [],
          notes: draft.notes.map((n, i) => ({ id: `n-${i}`, timestamp_sec: n.timestamp_sec, text: n.text })),
          bookmarks: draft.bookmarks.map((b, i) => ({ id: `m-${i}`, timestamp_sec: b.timestamp_sec, tag: (b.tag as SessionDetail["bookmarks"][number]["tag"]) ?? null, note: b.note ?? "" })),
          photos: draft.photos.map((p) => ({ id: p.id, timestamp_sec: p.timestamp_sec, url: "" })),
          peaks: [],
          speaker_spans: [],
          send_history: [],
        };
        db.sessions.unshift({ detail, transcript: [], chat: [], draft: storedDraft });
        if (!offline) scheduleProcessing(id);
        return { id };
      };
      if (offline) {
        // write() ném lỗi khi mất mạng; buổi ghi này thì vẫn phải lưu trên máy
        return wait().then(() => {
          const out = create();
          commit();
          return structuredClone(out);
        });
      }
      return write(create);
    },
    subscribeProcessing: (id, onStep) => {
      const fx = getDb().sessions.find((s) => s.detail.id === id);
      if (!fx) return () => undefined;
      // Nghe ngay từ bước hiện tại; xử lý xong là bước 6
      if (fx.detail.status === "processing") onStep(fx.detail.processing_step ?? 1);
      else onStep(6);
      let set = processingListeners.get(id);
      if (!set) {
        set = new Set();
        processingListeners.set(id, set);
      }
      set.add(onStep);
      return () => {
        set?.delete(onStep);
      };
    },
    retryProcessing: (id) =>
      write(async () => {
        await sessionsReady();
        const fx = await findFixture(id);
        assertOwnSession(fx.detail);
        const d = fx.detail;
        d.status = "processing";
        d.processing_step = 1;
        delete d.failure_reason;
        scheduleProcessing(id);
      }),
    purgeRaw: (ids) =>
      write(async () => {
        await sessionsReady();
        let freed = 0;
        for (const id of ids) {
          const fx = await findFixture(id);
          assertOwnSession(fx.detail);
          freed += fx.detail.size_bytes;
          fx.detail.storage_status = "essence_only";
          fx.detail.size_bytes = 0;
          fx.detail.audio_expires_at = null;
          fx.transcript = [];
          // Nhật ký nhóm: dọn bản gốc (M7-03)
          if (fx.detail.workspace_id) pushAudit(fx.detail.workspace_id, "purge", "session", fx.detail.id, fx.detail.title);
        }
        return { freed_bytes: freed };
      }),
    remove: (id) =>
      write(async () => {
        await sessionsReady();
        const db = getDb();
        const target = await findFixture(id);
        assertOwnSession(target.detail);
        // Nhật ký nhóm: xóa buổi ghi (M7-03). Xóa còn hoàn tác được nhưng vẫn
        // ghi — nhật ký là hành động đã làm, không phải trạng thái cuối.
        if (target.detail.workspace_id) pushAudit(target.detail.workspace_id, "delete", "session", target.detail.id, target.detail.title);
        // Giữ buổi ghi trong removed để "Hoàn tác" đưa về đúng chỗ cũ (M4-01)
        const i = db.sessions.findIndex((s) => s.detail.id === id);
        if (i < 0) throw new DataError("not_found");
        const [fx] = db.sessions.splice(i, 1);
        db.removed.push(fx);
      }),
    restore: (id) =>
      write(async () => {
        await sessionsReady();
        const db = getDb();
        const i = db.removed.findIndex((s) => s.detail.id === id);
        if (i < 0) throw new DataError("not_found");
        const [fx] = db.removed.splice(i, 1);
        // Trả về đúng chỗ cũ theo ngày tạo (mới nhất trên cùng)
        const at = db.sessions.findIndex((s) => s.detail.created_at <= fx.detail.created_at);
        if (at < 0) db.sessions.push(fx);
        else db.sessions.splice(at, 0, fx);
      }),
    reprocess: (id, templateId) =>
      write(async () => {
        await sessionsReady();
        const fx = await findFixture(id);
        assertOwnSession(fx.detail);
        const d = fx.detail;
        // Chuyển các chủ đề sang phần tương ứng của mẫu mới theo thứ tự,
        // nhờ đó tóm tắt hiện đủ các phần của mẫu mới (bản giả)
        const template = getDb().templates.find((t) => t.id === templateId);
        if (template) {
          const sections = template.sections;
          for (const topic of d.topics) {
            const at = sections.findIndex((s) => s.id === topic.section_id);
            if (at >= 0) continue;
            const oldIndex = d.topics.indexOf(topic);
            topic.section_id = sections[Math.min(oldIndex, sections.length - 1)].id;
          }
          d.template_id = templateId;
        }
        d.status = "processing";
        d.processing_step = 1;
        delete d.failure_reason;
        scheduleProcessing(id);
      }),
    search: (query) =>
      read(async () => {
        await sessionsReady();
        const q = foldVi(query.trim());
        const out: SearchResult = { sessions: [], segments: [], tasks: [] };
        if (!q) return out;
        const { stripToSession } = await import("./seed-data");
        for (const fx of getDb().sessions) {
          const d = fx.detail;
          // Buổi riêng tư của người khác không tham gia tìm kiếm (M7-01),
          // và chỉ tìm trong không gian đang dùng, giống thư viện (review PR #55)
          if (!canRead(d) || !inCurrentWorkspace(d)) continue;
          // Tìm trong tiêu đề, tóm tắt chung, tên các phần tóm tắt, tên chủ đề
          // và từng điểm chính (review PR #35: thiếu điểm chính nên "lai suat"
          // không ra ý "Lo lãi suất tăng mạnh sau thời gian ưu đãi")
          const template = getDb().templates.find((t) => t.id === d.template_id);
          const sectionTitles = template
            ? template.sections.filter((s) => d.topics.some((tp) => tp.section_id === s.id)).map((s) => s.title)
            : [];
          // Tìm trên câu gốc VÀ mọi bản tóm tắt đã có (M6-03): bản dịch tiếng
          // Hàn cũng dẫn về đúng buổi
          const versions: Array<SummaryVersion> = [originalVersion(d), ...(fx.summary_versions ?? [])];
          const hayTitle = foldVi(
            [
              d.title,
              ...sectionTitles,
              ...versions.flatMap((v) => [
                v.executive_summary,
                ...v.topics.flatMap((t) => [t.title, ...t.bullets.flatMap((b) => [b.text, b.original_text ?? "", b.original_text ? `“${b.original_text}”` : ""])]),
                ...Object.values(v.task_texts ?? {}),
              ]),
            ].join(" "),
          );
          if (hayTitle.includes(q)) out.sessions.push(stripToSession(d));
          for (const seg of fx.transcript) {
            // Câu gốc và mọi bản dịch đoạn lời (M6-03)
            const trans = Object.values(seg.translations ?? {})
              .map((tr) => tr?.text ?? "")
              .join(" ");
            if (foldVi(`${seg.text} ${trans}`).includes(q)) out.segments.push({ session_id: d.id, segment: seg });
          }
          for (const task of d.action_items) {
            if (foldVi(`${task.task} ${task.source_quote ?? ""}`).includes(q)) out.tasks.push(task);
          }
        }
        out.sessions.sort((a, b) => b.created_at.localeCompare(a.created_at));
        out.segments.sort((a, b) => a.segment.start_sec - b.segment.start_sec);
        return out;
      }),
    createFromImport: (input) =>
      write(async () => {
        await sessionsReady();
        const db = getDb();
        const id = `s-new-${Date.now()}`;
        const now = new Date().toISOString();
        // Bản nháp không có âm lượng: xử lý xong sẽ sinh nội dung theo mẫu và
        // dải giọng dự phòng (buildSessionContent), file gốc không được lưu
        const draft: RecordingDraft = {
          title: input.file_name.replace(/\.[^.]+$/, ""),
          template_id: input.template_id,
          primary_language: input.language,
          duration_sec: input.duration_sec,
          notes: [],
          bookmarks: [],
          photos: [],
          levels: [],
        };
        const detail: SessionDetail = {
          id,
          user_id: db.user.id,
          // Buổi nhập cũng thuộc không gian đang dùng (M7-01)
          workspace_id: currentWorkspace().kind === "team" ? currentWorkspace().id : null,
          visibility: "private",
          owner_user_id: db.user.id,
          title: draft.title ?? "",
          template_id: input.template_id,
          primary_language: input.language,
          detected_languages: [input.language],
          report_languages: [db.user.default_report_language ?? db.user.ui_language],
          original_report_language: db.user.default_report_language ?? db.user.ui_language,
          status: "processing",
          processing_step: 1,
          storage_status: "full",
          duration_sec: input.duration_sec,
          size_bytes: Math.round(input.duration_sec * 16_000),
          created_at: now,
          audio_expires_at: null,
          consent: { confirmed: true, announced: false },
          participant_contact_ids: [],
          peaks_thumb: Array.from({ length: 40 }, (_, i) => 0.3 + 0.5 * Math.abs(Math.sin(i / 5))),
          speaker_colors_thumb: Array.from({ length: 40 }, () => 0),
          open_task_count: 0,
          executive_summary: "",
          speakers: [],
          topics: [],
          action_items: [],
          notes: [],
          bookmarks: [],
          photos: [],
          peaks: [],
          speaker_spans: [],
          send_history: [],
        };
        db.sessions.unshift({ detail, transcript: [], chat: [], draft });
        scheduleProcessing(id);
        return { id };
      }),
    getSample: (profession) =>
      read(async () => {
        await samplesReady();
        const db = getDb();
        const tpl = db.templates.find((t) => t.profession === profession);
        const sample = db.samples.find((s) => s.detail.template_id === tpl?.id) ?? db.samples[0];
        if (!sample) throw new DataError("not_found");
        return sample.detail;
      }),
    setVisibility: (id, visibility) =>
      write(async () => {
        await sessionsReady();
        const fx = await findFixture(id);
        const d = fx.detail;
        assertOwnSession(d);
        // Buổi cá nhân luôn riêng tư: đổi chỉ có ý nghĩa trong không gian Nhóm
        if (!d.workspace_id) return;
        d.visibility = visibility;
        // Nhật ký nhóm: chia sẻ hoặc gỡ chia sẻ (M7-01)
        pushAudit(d.workspace_id, visibility === "workspace" ? "share" : "unshare", "session", d.id, d.title);
      }),
    recordExport: (id) =>
      write(async () => {
        await sessionsReady();
        const fx = await findFixture(id);
        assertCanRead(fx.detail);
        // Nhật ký nhóm: xuất file (M7-03). Chỉ người được đọc nội dung mới
        // xuất được; buổi cá nhân không thuộc nhật ký nhóm nào.
        if (fx.detail.workspace_id) pushAudit(fx.detail.workspace_id, "export", "session", fx.detail.id, fx.detail.title);
      }),
    getListeningMap: (id) =>
      read(async () => {
        await sessionsReady();
        const fx = await findFixture(id);
        assertCanRead(fx.detail);
        // Cờ "Không có bản đồ nghe" của bảng thử nghiệm: ép trạng thái buổi cũ
        // chưa xử lý (M8-01) — nút Nghe sạch tắt kèm dòng giải thích.
        if (getFlags().noListeningMap) return null;
        return fx.listening_map ?? null;
      }),
  },

  tasks: {
    listAll: (filter) =>
      read(async () => {
        await sessionsReady();
        const items: ActionItem[] = [];
        const me = myUserId();
        const ws = currentWorkspace();
        for (const fx of getDb().sessions) {
          const d = fx.detail;
          // Chỉ việc của những buổi mình được đọc (M7-01): buổi riêng tư của
          // người khác không lộ việc qua trang Việc
          if (!canRead(d)) continue;
          // Việc theo không gian đang dùng (M7-01): Cá nhân thấy việc buổi cá
          // nhân, Nhóm thấy việc buổi của nhóm đó
          if (ws.kind === "personal") {
            if (d.workspace_id || (d.owner_user_id || d.user_id) !== me) continue;
          } else if (d.workspace_id !== ws.id) {
            continue;
          }
          const lang = filter?.lang;
          const version = lang ? storedVersion(fx, lang) : null;
          for (const a of d.action_items) {
            // Trang Việc hiển thị theo ngôn ngữ báo cáo mặc định (M6-03):
            // tên việc lấy từ bản đã có của buổi, thiếu thì giữ câu gốc
            items.push(version ? { ...a, task: version.task_texts[a.id] ?? a.task } : a);
          }
        }
        // "Giao cho tôi": giao cho liên hệ của mình hoặc giao cho thành viên là mình (M7-01)
        return filter?.mine
          ? items.filter((a) => a.assignee_contact_id === "c-me" || a.assignee_user_id === me)
          : items;
      }),
    upsert: (item) =>
      write(async () => {
        await sessionsReady();
        const d = (await findFixture(item.session_id)).detail;
        const i = d.action_items.findIndex((a) => a.id === item.id);
        if (i >= 0) d.action_items[i] = item;
        else d.action_items.push(item);
        refreshCounts(d);
      }),
    toggleDone: (id) =>
      write(async () => {
        await sessionsReady();
        for (const fx of getDb().sessions) {
          const item = fx.detail.action_items.find((a) => a.id === id);
          if (item) {
            item.done = !item.done;
            item.done_at = item.done ? new Date().toISOString() : null;
            refreshCounts(fx.detail);
            return item as ActionItem;
          }
        }
        throw new DataError("not_found");
      }),
  },

  chat: {
    history: (sessionId) =>
      read(async () => {
        await sessionsReady();
        const fx = await findFixture(sessionId);
        return fx.chat_log ?? [];
      }),
    ask: async (sessionId, question, onToken) => {
      await wait();
      if (getFlags().failLoad) throw new DataError("server");
      const fx = await findFixture(sessionId);
      const hit = fx.chat.find((c) => c.question.trim().toLowerCase() === question.trim().toLowerCase());
      // Hỏi AI trả lời bằng ngôn ngữ của câu hỏi (M6-03): chữ Hàn thì trả lời
      // tiếng Hàn, chữ Latin không dấu thì tiếng Anh, còn lại tiếng Việt
      const hasHangul = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/.test(question);
      const hasViDiacritics = /[ăâêôơưđáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/i.test(question);
      const fallback = hasHangul
        ? "샘플 목업에서는 추천 질문에만 답변할 수 있어요."
        : !hasViDiacritics && /^[a-z0-9\s?,.'-]+$/i.test(question)
          ? "The mockup can only answer the suggested questions."
          : "Bản mockup chỉ trả lời được các câu gợi ý.";
      const answer = hit?.answer ?? fallback;
      // Lịch sử hỏi đáp lưu theo buổi ghi (M3-03): cả câu không có trong fixture
      const log = (fx.chat_log ?? []);
      log.push({ id: `q-${Date.now().toString(36)}`, role: "user", text: question, citations: [] });
      const aiMessage: ChatMessage = {
        id: `a-${Date.now().toString(36)}`,
        role: "ai",
        text: answer,
        citations: (hit?.citations ?? []).map((t) => ({ timestamp_sec: t })),
      };
      log.push(aiMessage);
      fx.chat_log = log;
      commit();
      const words = answer.split(" ");
      for (let i = 1; i <= words.length; i++) {
        onToken(words.slice(0, i).join(" "));
        await new Promise((r) => setTimeout(r, 40));
      }
      return aiMessage;
    },
  },

  folders: {
    list: () =>
      read(() =>
        getDb()
          .folders.slice()
          .reverse(),
      ),
    get: (id) =>
      read(() => {
        const folder = getDb().folders.find((f) => f.id === id);
        if (!folder) throw new DataError("not_found");
        return folder;
      }),
    create: (input) =>
      write(() => {
        const db = getDb();
        const now = new Date().toISOString();
        const folder: Folder = {
          id: `f-${Date.now().toString(36)}`,
          workspace_id: currentWorkspace().kind === "team" ? currentWorkspace().id : null,
          kind: input.kind,
          name: input.name.trim(),
          ref: input.ref?.trim() || undefined,
          note: input.note?.trim() || undefined,
          session_ids: [...(input.session_ids ?? [])],
          created_at: now,
          updated_at: now,
        };
        db.folders.unshift(folder);
        return folder;
      }),
    update: (id, patch) =>
      write(() => {
        const folder = getDb().folders.find((f) => f.id === id);
        if (!folder) throw new DataError("not_found");
        if (patch.name !== undefined) folder.name = patch.name.trim() || folder.name;
        if (patch.ref !== undefined) folder.ref = patch.ref.trim() || undefined;
        if (patch.note !== undefined) folder.note = patch.note.trim() || undefined;
        if (patch.session_ids !== undefined) folder.session_ids = [...patch.session_ids];
        folder.updated_at = new Date().toISOString();
      }),
    remove: (id) =>
      write(() => {
        const db = getDb();
        if (!db.folders.some((f) => f.id === id)) throw new DataError("not_found");
        db.folders = db.folders.filter((f) => f.id !== id);
        delete db.folder_chats[id];
      }),
    history: (folderId) =>
      read(() => getDb().folder_chats[folderId] ?? []),
    /* Hỏi AI xuyên các buổi của thư mục (góp ý vòng 1, #75): bản giả ghép
     * câu trả lời từ ý tóm tắt, việc cần làm và ghi chú của các buổi trong
     * thư mục, xếp theo mức khớp từ khóa của câu hỏi (so khớp bỏ dấu như
     * tìm kiếm M4-02); dẫn chứng mang theo buổi và mốc giây. Gói Free ném
     * quota_exceeded — giao diện khóa trước rồi, đây là chốt sau. */
    ask: async (folderId, question, onToken) => {
      await wait();
      if (getFlags().failLoad) throw new DataError("server");
      const db = getDb();
      const folder = db.folders.find((f) => f.id === folderId);
      if (!folder) throw new DataError("not_found");
      const plan = getFlags().plan ?? db.user.plan;
      if (plan !== "pro") throw new DataError("quota_exceeded");

      const q = foldVi(question);
      const tokens = q
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 2);
      const sessions = folder.session_ids
        .map((id) => db.sessions.find((s) => (s.listDetail ?? s.detail).id === id))
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map((s) => s.detail);
      type Hit = { session: SessionDetail; text: string; timestamp_sec: number; score: number };
      const hits: Hit[] = [];
      for (const d of sessions) {
        for (const topic of d.topics) {
          for (const b of topic.bullets) {
            const folded = foldVi(b.text);
            hits.push({ session: d, text: b.text, timestamp_sec: b.timestamp_sec, score: tokens.reduce((n, w) => n + (folded.includes(w) ? 1 : 0), 0) });
          }
        }
        for (const a of d.action_items) {
          const folded = foldVi(a.task);
          hits.push({ session: d, text: a.task, timestamp_sec: a.timestamp_sec ?? 0, score: tokens.reduce((n, w) => n + (folded.includes(w) ? 1 : 0), 0) });
        }
        for (const n of d.notes) {
          const folded = foldVi(n.text);
          hits.push({ session: d, text: n.text, timestamp_sec: n.timestamp_sec, score: tokens.reduce((n, w) => n + (folded.includes(w) ? 1 : 0), 0) });
        }
      }
      const best = hits
        .filter((h) => h.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      const answer = best.length
        ? `Trên ${sessions.length} buổi của hồ sơ "${folder.name}", tìm thấy ${best.length} đoạn khớp câu hỏi. ` +
          best
            .map((h) => `Buổi "${h.session.title}" ghi rằng: ${h.text}`)
            .join(" ")
        : `Chưa tìm thấy nội dung khớp câu hỏi trong ${sessions.length} buổi của hồ sơ này. Thử hỏi bằng từ khóa khác.`;
      const citations = best.map((h) => ({ session_id: h.session.id, timestamp_sec: h.timestamp_sec }));

      const log = db.folder_chats[folderId] ?? [];
      log.push({ id: `fq-${Date.now().toString(36)}`, role: "user", text: question, citations: [] });
      const aiMessage: FolderChatMessage = {
        id: `fa-${Date.now().toString(36)}`,
        role: "ai",
        text: answer,
        citations,
      };
      log.push(aiMessage);
      db.folder_chats[folderId] = log;
      commit();
      const words = answer.split(" ");
      for (let i = 1; i <= words.length; i++) {
        onToken(words.slice(0, i).join(" "));
        await new Promise((r) => setTimeout(r, 40));
      }
      return aiMessage;
    },
  },

  share: {
    create: (sessionId, opts) =>
      write(() => {
        const db = getDb();
        const fx = db.sessions.find((s) => s.detail.id === sessionId);
        if (!fx) throw new DataError("not_found");
        assertOwnSession(fx.detail);
        // Mỗi buổi ghi chỉ giữ một link sống: tạo mới thì thu hồi link cũ
        for (const s of db.shares) if (s.session_id === sessionId && !s.revoked) s.revoked = true;
        const link: ShareLink & { password?: string } = {
          id: `sh-${Date.now().toString(36)}`,
          session_id: sessionId,
          scope: opts.scope,
          has_password: !!opts.password,
          expires_at: opts.expires_at,
          revoked: false,
          view_count: 0,
          languages: opts.languages ?? [],
        };
        if (opts.password) link.password = opts.password;
        db.shares.push(link);
        // Nhật ký nhóm: tạo link chia sẻ (M7-03)
        if (fx.detail.workspace_id) pushAudit(fx.detail.workspace_id, "share", "share_link", link.id, fx.detail.title);
        return link;
      }),
    revoke: (id) =>
      write(() => {
        const db = getDb();
        const link = db.shares.find((s) => s.id === id);
        if (!link) throw new DataError("not_found");
        link.revoked = true;
        // Nhật ký nhóm: thu hồi link chia sẻ (M7-03)
        const fx = db.sessions.find((s) => s.detail.id === link.session_id);
        if (fx?.detail.workspace_id) pushAudit(fx.detail.workspace_id, "unshare", "share_link", link.id, fx.detail.title);
      }),
    getForSession: (sessionId) =>
      read(() => {
        const live = getDb()
          .shares.filter((s) => s.session_id === sessionId && !s.revoked)
          .at(-1);
        return live ? toShareLink(live) : null;
      }),
    listAll: () =>
      read(() =>
        getDb()
          .shares.map(toShareLink)
          .reverse(),
      ),
    recordView: (shareId) =>
      write(() => {
        const link = getDb().shares.find((s) => s.id === shareId);
        if (link) link.view_count += 1;
      }),
    getPublic: (shareId, password, lang) =>
      read(async () => {
        await sessionsReady();
        const db = getDb();
        const link = db.shares.find((s) => s.id === shareId);
        if (!link) return "not_found" as const;
        if (link.revoked) return "revoked" as const;
        // Cờ "Link chia sẻ hết hạn" của bảng thử nghiệm: ép trạng thái hết hạn
        const expiredByFlag = getFlags().shareExpired;
        if (expiredByFlag || (link.expires_at && new Date(link.expires_at).getTime() < MOCK_NOW.getTime()))
          return "expired" as const;
        if (link.has_password) {
          if (!password || password !== link.password) return "needs_password" as const;
        }
        const fx = db.sessions.find((s) => s.detail.id === link.session_id);
        if (!fx) return "not_found" as const;
        const d = fx.detail;
        // Người xem chọn bản theo ngôn ngữ (M6-04): mặc định bản gốc, có bản
        // đã tạo thì lấy nội dung của bản đó
        const available = link.languages.length
          ? link.languages
          : [d.original_report_language, ...(fx.summary_versions ?? []).map((v) => v.lang)];
        const viewLang = lang && available.includes(lang) ? lang : d.original_report_language;
        const version = viewLang === d.original_report_language ? null : storedVersion(fx, viewLang);
        return {
          title: d.title,
          executive_summary: version?.executive_summary ?? d.executive_summary,
          topics: (version?.topics ?? d.topics) as typeof d.topics,
          duration_sec: d.duration_sec,
          created_at: d.created_at,
          speakers: d.speakers,
          sharer_name: db.user.display_name,
          scope: link.scope,
          lang: viewLang,
          languages: available,
        };
      }),
  },

  mail: {
    // M6-04 (issue #46): tiêu đề, lời chào và chân email theo ngôn ngữ người
    // nhận; khóa chuỗi nằm trong messages/ (tải động khi soạn, không vào
    // chunk khởi tạo). Nội dung lấy theo bản tóm tắt của ngôn ngữ đó.
    preview: (sessionId, recipientContactIds, mode) =>
      read(async () => {
        await sessionsReady();
        const db = getDb();
        const d = (await findFixture(sessionId)).detail;
        const [viMsg, enMsg, koMsg] = await Promise.all([
          import("@/messages/vi.json"),
          import("@/messages/en.json"),
          import("@/messages/ko.json"),
        ]);
        const msgFiles = { vi: viMsg.default, en: enMsg.default, ko: koMsg.default };
        const msg = (lang: Lang, path: string, params?: Record<string, string | number>): string => {
          let text: unknown = path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], msgFiles[lang]);
          if (typeof text !== "string") text = path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], msgFiles.vi);
          if (typeof text !== "string") return path;
          return text.replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? `{${name}}`));
        };
        const langName = (lang: Lang): string => msg(lang, `settings.lang${lang === "vi" ? "Vi" : lang === "en" ? "En" : "Ko"}`);
        const drafts: EmailDraft[] = [];
        for (const cid of recipientContactIds) {
          const contact = db.contacts.find((c) => c.id === cid);
          const lang = contact?.preferred_language ?? db.user.default_report_language ?? "vi";
          const fx = await findFixture(sessionId);
          const version = lang === d.original_report_language ? null : storedVersion(fx, lang);
          const summaryText = version?.executive_summary ?? d.executive_summary;
          const taskText = (id: string, fallback: string) => version?.task_texts?.[id] ?? fallback;
          if (mode !== "tasks")
            drafts.push({
              to_contact_id: cid,
              kind: "minutes",
              lang,
              subject: msg(lang, "sendMinutes.emailSubjectMinutes", { title: d.title }),
              body: `${msg(lang, "sendMinutes.emailGreeting", { name: contact?.name ?? "" })}\n\n${summaryText}\n\n${msg(lang, "sendMinutes.emailFooter")}`,
            });
          const mine = d.action_items.filter((a) => a.assignee_contact_id === cid && !a.done);
          if (mode !== "minutes" && mine.length)
            drafts.push({
              to_contact_id: cid,
              kind: "tasks",
              lang,
              subject: msg(lang, "sendMinutes.emailSubjectTasks", { title: d.title }),
              body: `${msg(lang, "sendMinutes.emailGreeting", { name: contact?.name ?? "" })}\n\n${msg(lang, "sendMinutes.emailTasksHeading")}:\n${mine.map((a) => `- ${taskText(a.id, a.task)}`).join("\n")}\n\n${msg(lang, "sendMinutes.emailFooter")}`,
            });
        }
        void langName;
        return drafts;
      }),
    send: (drafts) =>
      write(async () => {
        await sessionsReady();
        // Cờ "Gửi email lỗi một người" (M3-04): đúng một người thất bại,
        // những người khác vẫn tính là đã gửi. Mỗi người chỉ lỗi một lần
        // để nút "Gửi lại" gửi được (giống thật: lỗi rồi thì gửi lại được).
        const failOne = getFlags().mailFailOne;
        const results = drafts.map((d, i) => {
          const ok = !(failOne && i === 0 && !mailFailedOnce.has(d.to_contact_id));
          if (!ok) mailFailedOnce.add(d.to_contact_id);
          return { contact_id: d.to_contact_id, ok };
        });
        // Ghi lịch sử gửi vào buổi ghi (M3-04): số người gửi thành công
        const sessionId = drafts.find((d) => d.session_id)?.session_id;
        const okCount = results.filter((r) => r.ok).length;
        if (sessionId && okCount > 0) {
          // Dùng ngày của mockup (dataNow) để khớp với các ngày khác trong dữ liệu mẫu
          (await findFixture(sessionId)).detail.send_history.push({
            sent_at: MOCK_NOW.toISOString(),
            recipient_count: okCount,
          });
          // Nhật ký nhóm: gửi biên bản qua email (M7-03); một dòng mỗi lần gửi
          const sentFx = await findFixture(sessionId);
          if (sentFx.detail.workspace_id) pushAudit(sentFx.detail.workspace_id, "send_email", "session", sessionId, sentFx.detail.title);
        }
        return results;
      }),
  },

  account: {
    me: () =>
      read(() => {
        const f = getFlags();
        const u = getDb().user;
        const profession = f.profession ?? u.profession;
        const tpl = getDb().templates.find((t) => t.profession === profession)?.id ?? u.default_template_id;
        return { ...u, profession, default_template_id: tpl, plan: f.plan ?? u.plan };
      }),
    updateMe: (patch) =>
      write(() => {
        Object.assign(getDb().user, patch);
      }),
    quota: () =>
      read(() => {
        const f = getFlags();
        const plan = f.plan ?? getDb().user.plan;
        const base =
          plan === "pro"
            ? { ...getDb().quota, minutes_limit: 1200, max_session_minutes: 240, chat_questions_per_session: null }
            : getDb().quota;
        return f.quotaOut ? { ...base, minutes_used: base.minutes_limit } : base;
      }),
    templates: () => read(() => getDb().templates),
    contacts: () => read(() => getDb().contacts),
    glossary: () => read(() => getDb().glossary),
    addContact: (input) =>
      write(() => {
        const db = getDb();
        const contact: Contact = {
          id: `c-new-${Date.now().toString(36)}`,
          name: input.name.trim(),
          preferred_language: null,
          ...(input.email?.trim() ? { email: input.email.trim() } : {}),
        };
        db.contacts.push(contact);
        return contact;
      }),
    updateContact: (id, patch) =>
      write(() => {
        const c = getDb().contacts.find((x) => x.id === id);
        if (!c) throw new DataError("not_found");
        if (patch.name !== undefined) c.name = patch.name.trim();
        if (patch.role !== undefined) c.role = patch.role.trim() || undefined;
        if (patch.email !== undefined) c.email = patch.email.trim() || undefined;
        if (patch.preferred_language !== undefined) c.preferred_language = patch.preferred_language;
      }),
    addGlossaryTerm: (term) =>
      write(() => {
        const clean = term.trim();
        const db = getDb();
        const existing = db.glossary.find(
          (g) => g.term.toLocaleLowerCase("vi") === clean.toLocaleLowerCase("vi"),
        );
        if (existing) return existing;
        const item: GlossaryTerm = { id: `gl-${Date.now().toString(36)}`, term: clean, variants: {} };
        db.glossary.push(item);
        return item;
      }),
    updateGlossaryTerm: (id, term) =>
      write(() => {
        const item = getDb().glossary.find((g) => g.id === id);
        if (!item) throw new DataError("not_found");
        item.term = term.trim();
      }),
    removeGlossaryTerm: (id) =>
      write(() => {
        const db = getDb();
        db.glossary = db.glossary.filter((g) => g.id !== id);
      }),
    contactUsage: (id) =>
      read(async () => {
        await sessionsReady();
        const out: string[] = [];
        for (const fx of getDb().sessions) {
          const used = fx.detail.speakers.some((s) => s.contact_id === id);
          if (used) out.push(fx.detail.title);
        }
        return out;
      }),
    removeContact: (id) =>
      write(async () => {
        await sessionsReady();
        const db = getDb();
        db.contacts = db.contacts.filter((c) => c.id !== id);
        // Người nói đang gán liên hệ này về lại chưa đặt tên, ở mọi buổi ghi;
        // nhãn hiển thị sinh lúc vẽ theo ngôn ngữ (M5 sửa review #41 mục 5)
        db.sessions.forEach((fx) => {
          fx.detail.speakers.forEach((s) => {
            if (s.contact_id === id) {
              s.contact_id = null;
              s.display_name = null;
            }
          });
        });
      }),
    updateTemplate: (id, patch) =>
      write(() => {
        const tpl = getDb().templates.find((t) => t.id === id);
        if (!tpl) throw new DataError("not_found");
        tpl.sections = patch.sections;
      }),
    exportAll: () =>
      read(async () => {
        await sessionsReady();
        const db = getDb();
        // Mật khẩu link chia sẻ không xuất ra file; chỉ xuất buổi mình được đọc (M7-01)
        const shares = db.shares.map((s) => toShareLink(s));
        return {
          exported_at: MOCK_NOW.toISOString(),
          user: db.user,
          quota: db.quota,
          contacts: db.contacts,
          templates: db.templates,
          glossary: db.glossary,
          sessions: db.sessions.filter((s) => canRead(s.detail)).map((s) => ({ detail: s.detail, transcript: s.transcript })),
          shares,
        };
      }),
  },

  /* ---------- Không gian làm việc (M7-01, issue #47) ---------- */
  workspaces: {
    list: () =>
      read(() => {
        const db = getDb();
        const f = getFlags();
        // Không gian Cá nhân đi gói theo người dùng: cờ "Đổi gói" áp dụng cả đây
        return db.workspaces.map((w) => (w.kind === "personal" ? { ...w, plan: f.plan ?? db.user.plan } : w));
      }),
    switchTo: (id) =>
      write(() => {
        const db = getDb();
        const ws = db.workspaces.find((w) => w.id === id);
        if (!ws) throw new DataError("not_found");
        if (ws.kind === "team" && !myRole(ws.id)) throw new DataError("forbidden");
        db.user.current_workspace_id = ws.id;
      }),
    create: (input) =>
      write(() => {
        const db = getDb();
        const ws: Workspace = {
          id: `w-new-${Date.now().toString(36)}`,
          kind: "team",
          name: input.name.trim(),
          profession: input.profession,
          default_report_language: input.default_report_language,
          plan: "free",
          seat_limit: null,
          owner_user_id: db.user.id,
        };
        db.workspaces.push(ws);
        db.members.push({
          workspace_id: ws.id,
          user_id: db.user.id,
          email: db.user.email,
          display_name: db.user.display_name,
          role: "owner",
          status: "active",
          invited_at: MOCK_NOW.toISOString(),
          invite_expires_at: null,
        });
        // Tạo xong chuyển sang không gian vừa tạo
        db.user.current_workspace_id = ws.id;
        return ws;
      }),
    update: (id, patch) =>
      write(() => {
        const r = myRole(id);
        if (!r || r === "member") throw new DataError("forbidden");
        const ws = getDb().workspaces.find((w) => w.id === id);
        if (!ws) throw new DataError("not_found");
        if (patch.name !== undefined) ws.name = patch.name.trim();
        if (patch.profession !== undefined) ws.profession = patch.profession;
        if (patch.default_report_language !== undefined) ws.default_report_language = patch.default_report_language;
      }),
    remove: (id) =>
      write(() => {
        const db = getDb();
        const ws = db.workspaces.find((w) => w.id === id);
        if (!ws) throw new DataError("not_found");
        if (ws.kind === "personal") throw new DataError("server", "Không thể xóa không gian Cá nhân");
        if (myRole(id) !== "owner") throw new DataError("forbidden");
        db.workspaces = db.workspaces.filter((w) => w.id !== id);
        db.members = db.members.filter((m) => m.workspace_id !== id);
        db.audit = db.audit.filter((a) => a.workspace_id !== id);
        // Buổi ghi của nhóm về không gian Cá nhân của từng người ghi
        db.sessions.forEach((fx) => {
          if (fx.detail.workspace_id === id) {
            fx.detail.workspace_id = null;
            fx.detail.visibility = "private";
          }
        });
        const personal = db.workspaces.find((w) => w.kind === "personal");
        if (db.user.current_workspace_id === id) db.user.current_workspace_id = personal?.id ?? "";
      }),
    members: (id) =>
      read(() => {
        if (!myRole(id)) throw new DataError("forbidden");
        return getDb().members.filter((m) => m.workspace_id === id);
      }),
    invite: (id, email, role) =>
      write(() => {
        const db = getDb();
        const r = myRole(id);
        if (!r || r === "member") throw new DataError("forbidden");
        const ws = db.workspaces.find((w) => w.id === id);
        if (!ws) throw new DataError("not_found");
        const clean = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new DataError("server", "Email không hợp lệ");
        if (role === "owner") throw new DataError("server", "Không thể mời làm Chủ; hãy chuyển quyền Chủ sau khi họ tham gia");
        if (db.members.some((m) => m.workspace_id === id && m.email.toLowerCase() === clean))
          throw new DataError("server", "Email này đã trong nhóm hoặc đang được mời");
        const used = db.members.filter((m) => m.workspace_id === id).length;
        if (getFlags().seatsFull || (ws.seat_limit != null && used >= ws.seat_limit)) {
          throw new DataError("quota_exceeded", "Nhóm đã dùng hết số chỗ của gói");
        }
        const member: Member = {
          workspace_id: id,
          user_id: null,
          email: clean,
          // Tên hiển thị tạm theo email; sửa được sau khi họ tham gia
          display_name: clean
            .split("@")[0]
            .split(/[._-]+/)
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join(" "),
          role,
          status: "invited",
          invited_at: MOCK_NOW.toISOString(),
          // Lời mời hết hạn sau 7 ngày (docs/08)
          invite_expires_at: new Date(MOCK_NOW.getTime() + 7 * 86400_000).toISOString(),
        };
        db.members.push(member);
        pushAudit(id, "invite", "member", clean, clean);
        return member;
      }),
    revokeInvite: (id, email) =>
      write(() => {
        const db = getDb();
        const r = myRole(id);
        if (!r || r === "member") throw new DataError("forbidden");
        const clean = email.trim().toLowerCase();
        const before = db.members.length;
        db.members = db.members.filter(
          (m) => !(m.workspace_id === id && m.status === "invited" && m.email.toLowerCase() === clean),
        );
        if (db.members.length === before) throw new DataError("not_found");
        // Thu hồi lời mời: lời mời là thành viên đang chờ, ghi nhật ký như gỡ (M7-03)
        pushAudit(id, "remove_member", "member", clean, clean);
      }),
    changeRole: (id, userId, role) =>
      write(() => {
        const r = myRole(id);
        if (!r || r === "member") throw new DataError("forbidden");
        const m = getDb().members.find((x) => x.workspace_id === id && x.user_id === userId);
        if (!m) throw new DataError("not_found");
        // Quản trị đổi vai trò được mọi người trừ Chủ; không đặt ai làm Chủ
        // bằng cách này (docs/08 bảng quyền)
        if (m.role === "owner") throw new DataError("forbidden", "Không thể đổi vai trò của Chủ");
        if (role === "owner") throw new DataError("server", "Chuyển quyền Chủ bằng chức năng riêng");
        m.role = role;
        pushAudit(id, "role_change", "member", userId, m.display_name);
      }),
    removeMember: (id, userId) =>
      write(async () => {
        await sessionsReady();
        const r = myRole(id);
        if (!r || r === "member") throw new DataError("forbidden");
        const db = getDb();
        const m = db.members.find((x) => x.workspace_id === id && x.user_id === userId);
        if (!m) throw new DataError("not_found");
        if (m.role === "owner") throw new DataError("forbidden", "Không thể gỡ Chủ");
        // Buổi riêng tư của người bị gỡ đi theo họ về không gian Cá nhân của
        // họ; buổi đã chia sẻ với nhóm ở lại nhóm (docs/08 phần B)
        db.sessions.forEach((fx) => {
          const d = fx.detail;
          if (d.workspace_id === id && (d.owner_user_id || d.user_id) === userId && d.visibility === "private") {
            d.workspace_id = null;
          }
        });
        db.members = db.members.filter((x) => x !== m);
        pushAudit(id, "remove_member", "member", userId, m.display_name);
      }),
    transferOwnership: (id, userId) =>
      write(() => {
        if (myRole(id) !== "owner") throw new DataError("forbidden");
        const db = getDb();
        const m = db.members.find((x) => x.workspace_id === id && x.user_id === userId && x.status === "active");
        if (!m) throw new DataError("not_found");
        const me = db.members.find((x) => x.workspace_id === id && x.user_id === myUserId());
        if (me) me.role = "admin";
        m.role = "owner";
        const ws = db.workspaces.find((w) => w.id === id);
        if (ws) ws.owner_user_id = userId;
        pushAudit(id, "role_change", "member", userId, m.display_name);
      }),
    leave: (id) =>
      write(async () => {
        await sessionsReady();
        const db = getDb();
        const ws = db.workspaces.find((w) => w.id === id);
        if (!ws) throw new DataError("not_found");
        if (ws.kind !== "team") throw new DataError("server", "Không gian Cá nhân không thể rời");
        const me = db.members.find((x) => x.workspace_id === id && x.user_id === myUserId());
        if (!me) throw new DataError("forbidden");
        // Chủ không tự rời: phải chuyển quyền Chủ hoặc xóa nhóm (docs/08 phần B)
        // vai trò lấy qua myRole để cờ "Vai trò trong nhóm" của bảng thử nghiệm ăn theo
        if (myRole(id) === "owner") throw new DataError("forbidden", "Chủ nhóm phải chuyển quyền Chủ hoặc xóa nhóm trước khi rời");
        // Buổi riêng tư của người rời đi theo họ về không gian Cá nhân; buổi
        // đã chia sẻ với nhóm ở lại nhóm (như khi bị gỡ, docs/08 phần B)
        db.sessions.forEach((fx) => {
          const d = fx.detail;
          if (d.workspace_id === id && (d.owner_user_id || d.user_id) === myUserId() && d.visibility === "private") {
            d.workspace_id = null;
          }
        });
        db.members = db.members.filter((x) => x !== me);
        pushAudit(id, "remove_member", "member", myUserId(), me.display_name);
        // Rời xong quay về không gian Cá nhân
        const personal = db.workspaces.find((w) => w.kind === "personal");
        if (personal) db.user.current_workspace_id = personal.id;
      }),
    setSeats: (id, seats) =>
      write(() => {
        const db = getDb();
        // Đổi số chỗ là hành động gói: chỉ Chủ (Quản trị chỉ xem, docs/08)
        if (myRole(id) !== "owner") throw new DataError("forbidden");
        const ws = db.workspaces.find((w) => w.id === id);
        if (!ws) throw new DataError("not_found");
        if (ws.kind !== "team") throw new DataError("server", "Chỉ không gian Nhóm có số chỗ");
        const used = db.members.filter((m) => m.workspace_id === id).length;
        const next = Math.floor(seats);
        if (next < Math.max(1, used))
          throw new DataError("server", `Không thể giảm dưới số thành viên đang có (${used})`);
        ws.seat_limit = next;
      }),
    getInvite: (token) =>
      read(() => {
        const db = getDb();
        const m = db.members.find((x) => x.status === "invited" && inviteToken(x.email) === token);
        if (!m) return "not_found" as const;
        // Cờ "Lời mời hết hạn" của bảng thử nghiệm: ép trạng thái hết hạn
        if (getFlags().inviteExpired || (m.invite_expires_at && new Date(m.invite_expires_at).getTime() < MOCK_NOW.getTime()))
          return "expired" as const;
        const ws = db.workspaces.find((w) => w.id === m.workspace_id);
        if (!ws) return "not_found" as const;
        // Ai mời: dòng nhật ký mời mới nhất trùng email; thiếu thì coi chủ nhóm mời
        const evt = db.audit
          .filter((a) => a.workspace_id === ws.id && a.action === "invite" && a.target_label.toLowerCase() === m.email.toLowerCase())
          .at(-1);
        const inviter = db.members.find((x) => x.workspace_id === ws.id && x.user_id === (evt?.actor_user_id ?? ws.owner_user_id));
        return { workspace: ws, invited_by: inviter?.display_name ?? ws.name };
      }),
    acceptInvite: (token) =>
      write(() => {
        const db = getDb();
        const m = db.members.find((x) => x.status === "invited" && inviteToken(x.email) === token);
        if (!m) throw new DataError("not_found", "Không tìm thấy lời mời");
        if (getFlags().inviteExpired || (m.invite_expires_at && new Date(m.invite_expires_at).getTime() < MOCK_NOW.getTime()))
          throw new DataError("server", "Lời mời đã hết hạn");
        const ws = db.workspaces.find((w) => w.id === m.workspace_id);
        if (!ws) throw new DataError("not_found");
        const used = db.members.filter((x) => x.workspace_id === ws.id).length;
        if (getFlags().seatsFull || (ws.seat_limit != null && used >= ws.seat_limit)) {
          throw new DataError("quota_exceeded", "Nhóm đã hết chỗ");
        }
        m.status = "active";
      }),
    usage: (id, month) =>
      read(() => {
        // Mức dùng theo người: Chủ và Quản trị, Thành viên không (docs/08 bảng quyền, M7-03)
        assertAdmin(id);
        const db = getDb();
        const rows: UsageRow[] = [];
        for (const m of db.members.filter((x) => x.workspace_id === id && x.status === "active" && x.user_id)) {
          const uid = m.user_id!;
          // Mức dùng tính cả buổi riêng tư của từng người: chỉ ra số buổi, số
          // phút, số việc — không lộ tiêu đề và nội dung (docs/08 bảng quyền)
          const own = db.sessions
            .map((s) => s.detail)
            .filter((d) => d.workspace_id === id && (d.owner_user_id || d.user_id) === uid);
          const minutes = Math.round(own.reduce((n, d) => n + d.duration_sec, 0) / 60);
          const open = own.reduce((n, d) => n + d.action_items.filter((a) => !a.done && (a.assignee_user_id ?? null) === uid).length, 0);
          rows.push({ user_id: uid, month, sessions: own.length, minutes, open_tasks: open });
        }
        return rows;
      }),
    audit: (id, filter) =>
      read(() => {
        // Nhật ký truy cập: Chủ và Quản trị, Thành viên không (docs/08 bảng quyền, M7-03)
        assertAdmin(id);
        return getDb()
          .audit.filter((a) => a.workspace_id === id)
          .filter((a) => (filter?.actor_user_id ? a.actor_user_id === filter.actor_user_id : true))
          .filter((a) => (filter?.action ? a.action === filter.action : true))
          .sort((x, y) => y.at.localeCompare(x.at));
      }),
    invoices: (id) =>
      read(() => {
        const r = myRole(id);
        // Gói, thanh toán, hóa đơn: Chủ có, Quản trị xem, Thành viên không (docs/08)
        if (!r || r === "member") throw new DataError("forbidden");
        const ws = getDb().workspaces.find((w) => w.id === id);
        if (!ws) throw new DataError("not_found");
        return ws.kind === "team" ? getDb().invoices : [];
      }),
  },

  /* ---------- Tổng quan cá nhân và nhóm (M7-02, issue #48) ---------- */
  dashboard: {
    get: (range) =>
      read(async () => {
        await sessionsReady();
        if (getFlags().emptyLibrary) {
          // Thư viện rỗng (người mới): mọi số liệu về 0 — giao diện hiện hướng
          // dẫn ghi buổi đầu tiên thay vì dãy số 0
          return {
            range,
            attention: [],
            totals: { sessions: 0, minutes: 0, decisions: 0, tasks_done: 0, tasks_total: 0 },
            by_day: [],
            decisions: [],
            top_contacts: [],
            by_template: [],
          } satisfies DashboardData;
        }
        const now = MOCK_NOW;
        const db = getDb();
        const visible = visibleSessions();
        const inRange = visible
          .filter((d) => now.getTime() - new Date(d.created_at).getTime() <= rangeWindow(range))
          .sort((a, b) => b.created_at.localeCompare(a.created_at));

        // Tuần này: câu tổng kết và dải giọng theo ngày
        const dayMap = new Map<string, { session_ids: string[]; sec: number }>();
        for (const d of inRange) {
          const date = vnDate(new Date(d.created_at));
          const g = dayMap.get(date) ?? { session_ids: [], sec: 0 };
          g.session_ids.push(d.id);
          g.sec += d.duration_sec;
          dayMap.set(date, g);
        }
        const by_day = [...dayMap.entries()]
          .map(([date, g]) => ({ date, session_ids: g.session_ids, minutes: Math.round(g.sec / 60) }))
          .sort((a, b) => a.date.localeCompare(b.date));

        // Quyết định đã chốt: ý thuộc chủ đề nhãn "decided" trong khoảng
        const decisions: DashboardData["decisions"] = [];
        for (const d of inRange) {
          for (const t of d.topics) {
            if (t.tag !== "decided") continue;
            for (const b of t.bullets)
              decisions.push({ session_id: d.id, bullet_id: b.id, text: b.text, timestamp_sec: b.timestamp_sec });
          }
        }
        decisions.sort(
          (a, b) =>
            (inRange.find((x) => x.id === b.session_id)!.created_at).localeCompare(
              inRange.find((x) => x.id === a.session_id)!.created_at,
            ) || a.timestamp_sec - b.timestamp_sec,
        );

        // Người gặp nhiều: liên hệ trong các buổi của khoảng, đủ 5 người.
        // Loại chính người dùng ("c-me" trùng email người dùng) — đó là người
        // mình gặp, không phải người gặp mình.
        const selfContactId = db.contacts.find((c) => c.email?.toLowerCase() === db.user.email.toLowerCase())?.id;
        const contactMap = new Map<string, { sessions: number; last_met_at: string }>();
        for (const d of inRange) {
          for (const cid of d.participant_contact_ids) {
            if (cid === selfContactId) continue;
            const g = contactMap.get(cid) ?? { sessions: 0, last_met_at: d.created_at };
            g.sessions += 1;
            if (d.created_at > g.last_met_at) g.last_met_at = d.created_at;
            contactMap.set(cid, g);
          }
        }
        const top_contacts = [...contactMap.entries()]
          .map(([contact_id, g]) => ({ contact_id, ...g }))
          .sort((a, b) => b.sessions - a.sessions || b.last_met_at.localeCompare(a.last_met_at))
          .slice(0, 5);

        // Theo mẫu: thời lượng gom theo mẫu, vẽ biểu đồ thanh ngang
        const tplMap = new Map<string, number>();
        for (const d of inRange) tplMap.set(d.template_id, (tplMap.get(d.template_id) ?? 0) + d.duration_sec);
        const by_template = [...tplMap.entries()]
          .map(([template_id, sec]) => ({ template_id, minutes: Math.round(sec / 60) }))
          .sort((a, b) => b.minutes - a.minutes);

        const tasks = inRange.flatMap((d) => d.action_items);
        return {
          range,
          attention: buildAttention(visible),
          totals: {
            sessions: inRange.length,
            minutes: Math.round(inRange.reduce((n, d) => n + d.duration_sec, 0) / 60),
            decisions: decisions.length,
            tasks_done: tasks.filter((a) => a.done).length,
            tasks_total: tasks.length,
          },
          by_day,
          decisions,
          top_contacts,
          by_template,
        } satisfies DashboardData;
      }),

    team: (range) =>
      read(async () => {
        await sessionsReady();
        const ws = currentWorkspace();
        // Tab Nhóm chỉ có trong không gian Nhóm và chỉ Chủ, Quản trị thấy
        // (docs/08 phần B) — sai vai trò ném forbidden
        if (ws.kind !== "team") throw new DataError("forbidden");
        const role = myRole(ws.id);
        if (role !== "owner" && role !== "admin") throw new DataError("forbidden");
        const db = getDb();
        const from = MOCK_NOW.getTime() - rangeWindow(range);
        const month = vnDate(MOCK_NOW).slice(0, 7);
        const allWs = db.sessions.map((s) => s.detail).filter((d) => d.workspace_id === ws.id);
        // Mức dùng theo người TÍNH CẢ buổi riêng tư của từng người: bảng quyền
        // cho phép Chủ, Quản trị thấy tên và thời lượng để tính mức dùng,
        // nhưng chỉ ra số — không lộ tiêu đề và nội dung (docs/08 phần B)
        const usage: UsageRow[] = [];
        for (const m of db.members.filter((x) => x.workspace_id === ws.id && x.status === "active" && x.user_id)) {
          const uid = m.user_id!;
          const own = allWs.filter((d) => (d.owner_user_id || d.user_id) === uid && new Date(d.created_at).getTime() >= from);
          usage.push({
            user_id: uid,
            month,
            sessions: own.length,
            minutes: Math.round(own.reduce((n, d) => n + d.duration_sec, 0) / 60),
            // Việc mở đếm trên mọi buổi của nhóm đã giao cho người này (số lượng)
            open_tasks: allWs.reduce(
              (n, d) => n + d.action_items.filter((a) => !a.done && (a.assignee_user_id ?? null) === uid).length,
              0,
            ),
          });
        }
        // Việc mở theo người phụ trách, kèm số quá hạn của nhóm — chỉ số lượng
        const open_tasks_by_assignee = usage.map((u) => {
          let open = 0;
          let overdue = 0;
          for (const d of allWs) {
            for (const a of d.action_items) {
              if (a.done || (a.assignee_user_id ?? null) !== u.user_id) continue;
              open += 1;
              if (a.due_date && endOfDay(a.due_date).getTime() < MOCK_NOW.getTime()) overdue += 1;
            }
          }
          return { user_id: u.user_id, open, overdue };
        });
        return { usage, open_tasks_by_assignee };
      }),
  },
};

export { MOCK_NOW } from "./store";
