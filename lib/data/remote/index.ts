"use client";

import { apiGet, apiSend } from "./http";
import { bumpVersion as notifyDataChanged } from "../changes";
import type { DataSource, SearchResult } from "../repository";
import { DataError } from "../errors";
import type {
  Contact,
  Folder,
  FolderChatMessage,
  GlossaryTerm,
  ListeningMap,
  Member,
  Session,
  SessionDetail,
  SummaryVersion,
  TranscriptSegment,
  User,
  VisualArtifacts,
  Workspace,
} from "../types";
import type { Quota } from "../types";
import type { SessionAction } from "../session-actions";

/*
 * Bản cài đặt remote của DataSource (C1-03b, docs/04 mục "Bổ sung C1").
 * Mọi hàm gọi API route của app; máy chủ lấy user_id/workspace_id từ PHIÊN
 * (getServerSession) nên client không gửi id người dùng bao giờ.
 *
 * Phạm vi của PR này: account, workspaces (Cá nhân), sessions, tasks,
 * folders, contacts, glossary, gap-check. Chia sẻ (share), gửi email (mail),
 * Tổng quan (dashboard) và các thao tác nhóm (mời/vai trò) là việc của các
 * PR sau (C1-07/08) — gọi sẽ ném DataError với lời nhắn rõ ràng, không trả
 * dữ liệu giả.
 */

type MeResponse = { user: User; quota: Quota };

function notAvailableYet(feature: string): DataError {
  return new DataError("server", `${feature} chưa nối nguồn remote, là việc của PR sau`);
}

/** Gửi một thao tác nhỏ trên buổi; ghi thành công thì báo các màn hình tải lại. */
async function postAction<T = { ok: boolean }>(sessionId: string, action: SessionAction): Promise<T> {
  const r = await apiSend<T>(`/api/data/sessions/${encodeURIComponent(sessionId)}/actions`, "POST", action);
  notifyDataChanged();
  return r;
}

export const remoteSource: DataSource = {
  account: {
    me: async () => {
      const r = await apiGet<MeResponse>("/api/data/me");
      return r.user;
    },
    updateMe: async (patch) => {
      const snake: Record<string, unknown> = {};
      if (patch.display_name !== undefined) snake.display_name = patch.display_name;
      if (patch.honorific !== undefined) snake.honorific = patch.honorific;
      if (patch.profession !== undefined) snake.profession = patch.profession;
      if (patch.default_template_id !== undefined) snake.default_template_id = patch.default_template_id;
      if (patch.ui_language !== undefined) snake.ui_language = patch.ui_language;
      if (patch.theme !== undefined) snake.theme = patch.theme;
      if (patch.consent_reminder !== undefined) snake.consent_reminder = patch.consent_reminder;
      if (patch.consent_announcement !== undefined) snake.consent_announcement = patch.consent_announcement ?? null;
      if (patch.auto_filter_silence !== undefined) snake.auto_filter_silence = patch.auto_filter_silence;
      if (patch.default_speech_language !== undefined) snake.default_speech_language = patch.default_speech_language;
      if (patch.auto_detect_languages !== undefined) snake.auto_detect_languages = patch.auto_detect_languages;
      if (patch.default_report_language !== undefined) snake.default_report_language = patch.default_report_language;
      if (patch.auto_translate_on_send !== undefined) snake.auto_translate_on_send = patch.auto_translate_on_send;
      if (patch.listening_prefs !== undefined) snake.listening_prefs = patch.listening_prefs ?? null;
      if (patch.onboarded_at !== undefined) snake.onboarded_at = patch.onboarded_at;
      await apiSend("/api/data/me", "PATCH", snake);
    },
    quota: async () => {
      const r = await apiGet<MeResponse>("/api/data/me");
      return r.quota;
    },
    templates: () => import("../mock").then((m) => m.mockSource.account.templates()),
    contacts: () => apiGet<{ contacts: Contact[] }>("/api/data/contacts").then((r) => r.contacts),
    glossary: () => apiGet<{ terms: GlossaryTerm[] }>("/api/data/glossary").then((r) => r.terms),
    addGlossaryTerm: async (term) => {
      const r = await apiSend<{ term: GlossaryTerm }>("/api/data/glossary", "POST", { term });
      notifyDataChanged();
      return r.term;
    },
    updateGlossaryTerm: async (id, term) => {
      await apiSend(`/api/data/glossary/${encodeURIComponent(id)}`, "PATCH", { term });
      notifyDataChanged();
    },
    removeGlossaryTerm: async (id) => {
      await apiSend(`/api/data/glossary/${encodeURIComponent(id)}`, "DELETE");
      notifyDataChanged();
    },
    addContact: async (input) => {
      const r = await apiSend<{ contact: Contact }>("/api/data/contacts", "POST", input);
      notifyDataChanged();
      return r.contact;
    },
    updateContact: async (id, patch) => {
      await apiSend(`/api/data/contacts/${encodeURIComponent(id)}`, "PATCH", patch);
      notifyDataChanged();
    },
    contactUsage: (id) =>
      apiGet<{ sessions: string[] }>(`/api/data/contacts/${encodeURIComponent(id)}/usage`).then((r) => r.sessions),
    removeContact: async (id) => {
      await apiSend(`/api/data/contacts/${encodeURIComponent(id)}`, "DELETE");
      notifyDataChanged();
    },
    updateTemplate: () => {
      throw notAvailableYet("Tùy chỉnh mẫu theo người dùng");
    },
    exportAll: () => apiGet<Record<string, unknown>>("/api/data/export"),
  },

  workspaces: {
    list: () => apiGet<{ workspaces: Workspace[] }>("/api/data/workspaces").then((r) => r.workspaces),
    switchTo: (id) => apiSend("/api/data/workspaces/switch", "POST", { id }),
    create: () => {
      throw notAvailableYet("Tạo không gian Nhóm");
    },
    update: () => {
      throw notAvailableYet("Sửa không gian Nhóm");
    },
    remove: () => {
      throw notAvailableYet("Xóa không gian Nhóm");
    },
    members: (id) =>
      apiGet<{ members: Member[] }>(`/api/data/workspaces?member_of=${encodeURIComponent(id)}`).then((r) => r.members),
    invite: () => {
      throw notAvailableYet("Mời thành viên");
    },
    revokeInvite: () => {
      throw notAvailableYet("Thu hồi lời mời");
    },
    changeRole: () => {
      throw notAvailableYet("Đổi vai trò");
    },
    removeMember: () => {
      throw notAvailableYet("Gỡ thành viên");
    },
    transferOwnership: () => {
      throw notAvailableYet("Chuyển quyền Chủ");
    },
    leave: () => {
      throw notAvailableYet("Rời nhóm");
    },
    setSeats: () => {
      throw notAvailableYet("Đổi số chỗ gói Nhóm");
    },
    getInvite: () => {
      throw notAvailableYet("Lời mời nhóm");
    },
    acceptInvite: () => {
      throw notAvailableYet("Nhận lời mời nhóm");
    },
    usage: () => {
      throw notAvailableYet("Mức dùng nhóm");
    },
    audit: () => {
      throw notAvailableYet("Nhật ký nhóm");
    },
    invoices: () => {
      throw notAvailableYet("Hóa đơn nhóm");
    },
  },

  sessions: {
    list: async (filter) => {
      const params = new URLSearchParams();
      if (filter?.query) params.set("query", filter.query);
      if (filter?.template_id) params.set("template_id", filter.template_id);
      if (filter?.range === "week") params.set("range", "week");
      if (filter?.has_open_tasks) params.set("has_open_tasks", "1");
      const q = params.toString();
      const r = await apiGet<{ sessions: Session[] }>(`/api/data/sessions${q ? `?${q}` : ""}`);
      return r.sessions;
    },
    get: (id) =>
      apiGet<{ detail: SessionDetail }>(`/api/data/sessions/${encodeURIComponent(id)}`).then((r) => r.detail),
    getTranscript: (id) =>
      apiGet<{ transcript: TranscriptSegment[] }>(`/api/data/sessions/${encodeURIComponent(id)}/transcript`).then(
        (r) => r.transcript,
      ),
    getVisuals: (id) =>
      apiGet<{ visuals: VisualArtifacts }>(`/api/data/sessions/${encodeURIComponent(id)}/visuals`).then(
        (r) => r.visuals,
      ),
    update: async (id, patch) => {
      await apiSend(`/api/data/sessions/${encodeURIComponent(id)}`, "PATCH", {
        title: patch.title,
        template_id: patch.template_id,
        participant_contact_ids: patch.participant_contact_ids,
        audio_expires_at: patch.audio_expires_at,
      });
      notifyDataChanged();
    },
    updateBullet: async (sessionId, bulletId, text) => {
      await postAction(sessionId, { type: "updateBullet", bulletId, text });
    },
    updateSegment: async (sessionId, segmentId, text, field) => {
      await postAction(sessionId, { type: "updateSegment", segmentId, text, field });
    },
    reassignSegment: async (sessionId, segmentId, speakerId) => {
      await postAction(sessionId, { type: "reassignSegment", segmentId, speakerId });
    },
    addQuickNote: async (sessionId, text) => {
      await postAction(sessionId, { type: "addQuickNote", text });
    },
    completeGapCheckItem: async (sessionId, key) => {
      await postAction(sessionId, { type: "completeGapCheckItem", key });
    },
    consumePendingAiQuestion: async (sessionId, question) => {
      await postAction(sessionId, { type: "consumePendingAiQuestion", question });
    },
    translateSegments: async (sessionId, lang, segmentIds) => {
      const r = await postAction<{ transcript: TranscriptSegment[] }>(sessionId, {
        type: "translateSegments",
        lang,
        segmentIds,
      });
      notifyDataChanged();
      return r.transcript;
    },
    getSummary: (id, lang) =>
      apiGet<{ version: SummaryVersion }>(`/api/data/sessions/${encodeURIComponent(id)}/summaries?lang=${lang}`).then(
        (r) => r.version,
      ),
    createSummaryVersion: async (id, lang, onStep) => {
      onStep(1);
      const r = await apiSend<{ version: SummaryVersion }>(
        `/api/data/sessions/${encodeURIComponent(id)}/summaries`,
        "POST",
        { lang },
      );
      onStep(2);
      notifyDataChanged();
      return r.version;
    },
    updateVersionBullet: async (sessionId, lang, bulletId, text) => {
      // Sửa ý của bản theo ngôn ngữ: máy chủ cập nhật topics của bản đó
      await postAction(sessionId, { type: "updateVersionBullet", lang, bulletId, text });
    },
    nameSpeaker: async (sessionId, speakerId, contactId) => {
      await postAction(sessionId, { type: "nameSpeaker", speakerId, contactId });
    },
    mergeSpeakers: async (sessionId, fromId, intoId) => {
      await postAction(sessionId, { type: "mergeSpeakers", fromId, intoId });
    },
    createFromRecording: async (draft) => {
      const r = await apiSend<{ id: string }>("/api/data/sessions", "POST", { kind: "recording", draft });
      notifyDataChanged();
      return r;
    },
    subscribeProcessing: (id, onStep) => {
      // C1-05: buổi có băng thật (asr_stage khác null) thì mỗi 3,5 giây gọi
      // POST process — vừa ĐẨY luồng tiến một bước vừa nhận trạng thái về
      // (tiến độ thật, failed trả s=-1 kèm mã lỗi). Buổi mockup/nhập file
      // giữ nhịp dò GET 1,6 giây như cũ (máy chủ hoàn tất lười khi có người hỏi).
      let stop = false;
      void (async () => {
        let mode: "mock" | "asr" = "mock";
        while (!stop) {
          try {
            if (mode === "asr") {
              const s = await apiSend<{ status: string; step: number; asr_stage: string | null; asr_error: string | null }>(
                `/api/sessions/${encodeURIComponent(id)}/process`,
                "POST",
                {},
              );
              if (s.status === "failed") {
                onStep(-1, { status: "failed", asr_error: s.asr_error });
                notifyDataChanged();
                return;
              }
              if (s.status !== "processing") {
                onStep(6, { status: s.status });
                notifyDataChanged();
                return;
              }
              onStep(Math.min(5, Math.max(1, s.step)), { status: "processing" });
            } else {
              const s = await apiGet<{ status: string; step: number; asr_stage: string | null; asr_error: string | null }>(
                `/api/data/sessions/${encodeURIComponent(id)}/processing`,
              );
              if (s.asr_stage) {
                mode = "asr";
                continue;
              }
              const step = s.status === "processing" ? Math.min(5, Math.max(1, s.step)) : 6;
              onStep(step, { status: s.status });
              if (step === 6) {
                notifyDataChanged();
                return;
              }
            }
          } catch {
            return; // lỗi mạng/phiên: dừng dò, màn xử lý tự hiện trạng thái
          }
          await new Promise((r) => setTimeout(r, mode === "asr" ? 3500 : 1600));
        }
      })();
      return () => {
        stop = true;
      };
    },
    retryProcessing: async (id) => {
      await apiSend(`/api/data/sessions/${encodeURIComponent(id)}/processing`, "POST", { action: "retry" });
      notifyDataChanged();
    },
    purgeRaw: async (ids) => {
      let freed = 0;
      for (const id of ids) {
        const r = await postAction<{ freed_bytes: number }>(id, { type: "purgeRaw" });
        freed += r.freed_bytes;
      }
      notifyDataChanged();
      return { freed_bytes: freed };
    },
    remove: async (id) => {
      await apiSend(`/api/data/sessions/${encodeURIComponent(id)}`, "DELETE");
      notifyDataChanged();
    },
    restore: async (id) => {
      await postAction(id, { type: "restore" });
    },
    reprocess: async (id, templateId) => {
      await postAction(id, { type: "reprocess", templateId });
    },
    search: (query) =>
      apiGet<SearchResult>(`/api/data/search?q=${encodeURIComponent(query)}`),
    createFromImport: async (input) => {
      const r = await apiSend<{ id: string }>("/api/data/sessions", "POST", { kind: "import", input });
      notifyDataChanged();
      return r;
    },
    getSample: (profession) => import("../mock").then((m) => m.mockSource.sessions.getSample(profession)),
    importSample: async (profession) => {
      const r = await apiSend<{ id: string }>("/api/data/samples", "POST", { profession });
      notifyDataChanged();
      return r;
    },
    setVisibility: async (id) => {
      // Buổi cá nhân luôn riêng tư; không gian Nhóm là việc của C1-08
      await postAction(id, { type: "setVisibility" });
    },
    recordExport: async (id) => {
      await postAction(id, { type: "recordExport" });
    },
    getListeningMap: (id) =>
      apiGet<{ map: ListeningMap | null }>(`/api/data/sessions/${encodeURIComponent(id)}/listening-map`).then(
        (r) => r.map,
      ),
  },

  tasks: {
    listAll: (filter) => {
      const params = new URLSearchParams();
      if (filter?.mine) params.set("mine", "1");
      if (filter?.lang) params.set("lang", filter.lang);
      const q = params.toString();
      return apiGet<{ items: import("../types").ActionItem[] }>(`/api/data/tasks${q ? `?${q}` : ""}`).then((r) => r.items);
    },
    upsert: (item) => apiSend("/api/data/tasks", "PUT", item).then(() => notifyDataChanged()),
    toggleDone: (id) =>
      apiSend<{ item: import("../types").ActionItem }>("/api/data/tasks", "POST", { id }).then((r) => {
        notifyDataChanged();
        return r.item;
      }),
  },

  chat: {
    history: (sessionId) =>
      apiGet<{ messages: import("../types").ChatMessage[] }>(`/api/data/sessions/${encodeURIComponent(sessionId)}/chat`).then(
        (r) => r.messages,
      ),
    ask: async (sessionId, question, onToken) => {
      // Máy chủ gọi AI thật (C1-08): trả lời theo ngôn ngữ giao diện, dẫn
      // nguồn mốc giây; client chạy chữ dần như bản giả
      const r = await apiSend<{ message: import("../types").ChatMessage }>(
        `/api/data/sessions/${encodeURIComponent(sessionId)}/chat`,
        "POST",
        { question },
      );
      notifyDataChanged();
      const words = r.message.text.split(" ");
      for (let i = 1; i <= words.length; i++) {
        onToken(words.slice(0, i).join(" "));
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      return r.message;
    },
  },

  share: {
    create: () => {
      throw notAvailableYet("Chia sẻ (PR sau)");
    },
    revoke: () => {
      throw notAvailableYet("Chia sẻ (PR sau)");
    },
    getForSession: () => {
      throw notAvailableYet("Chia sẻ (PR sau)");
    },
    listAll: () => {
      throw notAvailableYet("Chia sẻ (PR sau)");
    },
    recordView: () => {
      throw notAvailableYet("Chia sẻ (PR sau)");
    },
    getPublic: () => {
      throw notAvailableYet("Chia sẻ (PR sau)");
    },
  },

  mail: {
    preview: () => {
      throw notAvailableYet("Gửi biên bản qua email (PR sau)");
    },
    send: () => {
      throw notAvailableYet("Gửi biên bản qua email (PR sau)");
    },
  },

  dashboard: {
    get: () => {
      throw notAvailableYet("Tổng quan (PR sau)");
    },
    team: () => {
      throw notAvailableYet("Tổng quan nhóm (PR sau)");
    },
  },

  folders: {
    list: () => apiGet<{ folders: Folder[] }>("/api/data/folders").then((r) => r.folders),
    get: (id) => apiGet<{ folder: Folder }>(`/api/data/folders/${encodeURIComponent(id)}`).then((r) => r.folder),
    create: async (input) => {
      const r = await apiSend<{ folder: Folder }>("/api/data/folders", "POST", input);
      notifyDataChanged();
      return r.folder;
    },
    update: async (id, patch) => {
      await apiSend(`/api/data/folders/${encodeURIComponent(id)}`, "PATCH", {
        name: patch.name,
        ref: patch.ref ?? null,
        note: patch.note ?? null,
        template_id: patch.template_id ?? null,
        session_ids: patch.session_ids,
      });
      notifyDataChanged();
    },
    remove: async (id) => {
      await apiSend(`/api/data/folders/${encodeURIComponent(id)}`, "DELETE");
      notifyDataChanged();
    },
    history: (folderId) =>
      apiGet<{ messages: FolderChatMessage[] }>(`/api/data/folders/${encodeURIComponent(folderId)}/chat`).then(
        (r) => r.messages,
      ),
    ask: async (folderId, question, onToken) => {
      // Máy chủ gọi AI thật với ngữ cảnh các buổi của thư mục (C1-08); client
      // chạy chữ dần như bản giả (40 ms một từ)
      const r = await apiSend<{ message: FolderChatMessage }>(
        `/api/data/folders/${encodeURIComponent(folderId)}/chat`,
        "POST",
        { question },
      );
      notifyDataChanged();
      const words = r.message.text.split(" ");
      for (let i = 1; i <= words.length; i++) {
        onToken(words.slice(0, i).join(" "));
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      return r.message;
    },
  },
};
