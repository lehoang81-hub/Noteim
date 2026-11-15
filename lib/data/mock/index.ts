"use client";

import { getFlags } from "@/lib/debug/flags";
import type { DataSource, EmailDraft, RecordingDraft, SessionFilter } from "../repository";
import { DataError, Session as SessionSchema, type ActionItem, type GlossaryTerm, type Session, type SessionDetail, type SessionFixture } from "../types";
import { MOCK_NOW, commit, getDb } from "./store";
import { buildSessionContent } from "./generate";

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

async function read<T>(fn: () => T): Promise<T> {
  await wait();
  if (getFlags().failLoad) throw new DataError("server");
  return structuredClone(fn());
}

async function write<T>(fn: () => T): Promise<T> {
  await wait();
  if (getFlags().offline) throw new DataError("offline");
  const out = fn();
  commit();
  return structuredClone(out);
}

function findFixture(id: string): SessionFixture {
  const fx = getDb().sessions.find((s) => s.detail.id === id);
  if (!fx) throw new DataError("not_found");
  return fx;
}

/** Tách phần nhẹ của buổi ghi (dùng cho thư viện). */
function toSession(d: SessionDetail): Session {
  // Zod bỏ các trường không thuộc Session
  return SessionSchema.parse(d);
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

function matches(d: SessionDetail, f: SessionFilter | undefined): boolean {
  if (!f) return true;
  if (f.template_id && d.template_id !== f.template_id) return false;
  if (f.has_open_tasks && d.open_task_count === 0) return false;
  if (f.range === "week" && MOCK_NOW.getTime() - new Date(d.created_at).getTime() > 7 * 86400_000) return false;
  if (f.query) {
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
    const content = buildSessionContent({ sessionId: id, draft, template, createdAt: fx.detail.created_at });
    Object.assign(fx.detail, content);
    fx.detail.status = "ready";
    delete fx.detail.processing_step;
    delete fx.detail.failure_reason;
    delete fx.draft;
    // Gói Free: bản gốc tự xóa sau 7 ngày; Pro giữ đến khi tự dọn
    const plan = getFlags().plan ?? db.user.plan;
    fx.detail.audio_expires_at =
      plan === "free" ? new Date(Date.parse(fx.detail.created_at) + 7 * 86400_000).toISOString() : null;
    refreshCounts(fx.detail);
  } else {
    // Không có bản nháp (buổi ghi mẫu): chỉ đánh dấu đã xử lý xong
    fx.detail.status = "ready";
    delete fx.detail.processing_step;
    refreshCounts(fx.detail);
  }
  commit();
  notifyProcessing(id, 6);
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
  // Chạy sau khung vẽ đầu để localStorage đã sẵn sàng
  window.setTimeout(resume, 0);
}

export const mockSource: DataSource = {
  sessions: {
    list: (filter) =>
      read(() => {
        if (getFlags().emptyLibrary) return [];
        return getDb()
          .sessions.map((s) => s.detail)
          .filter((d) => matches(d, filter))
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map(toSession);
      }),
    get: (id) => read(() => findFixture(id).detail),
    getTranscript: (id) => read(() => findFixture(id).transcript),
    getVisuals: (id) =>
      read(() => {
        const d = findFixture(id).detail;
        return {
          timeline: d.topics.map((t) => ({ topic_id: t.id, start_sec: t.start_sec, end_sec: t.end_sec, tag: t.tag })),
          talk_share: d.speakers.map((s) => ({ speaker_id: s.id, percent: s.talk_ratio_percent })),
        };
      }),
    update: (id, patch) =>
      write(() => {
        Object.assign(findFixture(id).detail, patch);
      }),
    updateBullet: (sessionId, bulletId, text) =>
      write(() => {
        for (const t of findFixture(sessionId).detail.topics)
          for (const b of t.bullets)
            if (b.id === bulletId) {
              b.text = text;
              b.edited = true;
            }
      }),
    updateSegment: (sessionId, segmentId, text) =>
      write(() => {
        const seg = findFixture(sessionId).transcript.find((s) => s.id === segmentId);
        if (!seg) throw new DataError("not_found");
        seg.text = text;
        seg.edited = true;
      }),
    reassignSegment: (sessionId, segmentId, speakerId) =>
      write(() => {
        const fx = findFixture(sessionId);
        const seg = fx.transcript.find((s) => s.id === segmentId);
        const sp = fx.detail.speakers.find((s) => s.id === speakerId);
        if (!seg || !sp) throw new DataError("not_found");
        seg.speaker_id = speakerId;
      }),
    nameSpeaker: (sessionId, speakerId, contactId) =>
      write(() => {
        const d = findFixture(sessionId).detail;
        const contact = getDb().contacts.find((c) => c.id === contactId);
        const sp = d.speakers.find((s) => s.id === speakerId);
        if (!sp || !contact) throw new DataError("not_found");
        sp.contact_id = contact.id;
        sp.display_name = contact.name;
      }),
    mergeSpeakers: (sessionId, fromId, intoId) =>
      write(() => {
        const d = findFixture(sessionId).detail;
        const from = d.speakers.find((s) => s.id === fromId);
        const into = d.speakers.find((s) => s.id === intoId);
        if (!from || !into) throw new DataError("not_found");
        into.talk_ratio_percent += from.talk_ratio_percent;
        d.speakers = d.speakers.filter((s) => s.id !== fromId);
        d.speaker_spans.forEach((s) => s.speaker_id === fromId && (s.speaker_id = intoId));
        d.topics.forEach((t) => t.bullets.forEach((b) => b.speaker_id === fromId && (b.speaker_id = intoId)));
        findFixture(sessionId).transcript.forEach((g) => g.speaker_id === fromId && (g.speaker_id = intoId));
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
          workspace_id: null,
          title: draft.title ?? "",
          template_id: draft.template_id,
          language: "vi",
          output_language: "vi",
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
          bookmarks: draft.bookmarks.map((b, i) => ({ id: `m-${i}`, timestamp_sec: b.timestamp_sec, tag: (b.tag as SessionDetail["bookmarks"][number]["tag"]) ?? null })),
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
      write(() => {
        const d = findFixture(id).detail;
        d.status = "processing";
        d.processing_step = 1;
        delete d.failure_reason;
        scheduleProcessing(id);
      }),
    purgeRaw: (ids) =>
      write(() => {
        let freed = 0;
        for (const id of ids) {
          const fx = findFixture(id);
          freed += fx.detail.size_bytes;
          fx.detail.storage_status = "essence_only";
          fx.detail.size_bytes = 0;
          fx.detail.audio_expires_at = null;
          fx.transcript = [];
        }
        return { freed_bytes: freed };
      }),
    remove: (id) =>
      write(() => {
        const db = getDb();
        findFixture(id);
        db.sessions = db.sessions.filter((s) => s.detail.id !== id);
      }),
  },

  tasks: {
    listAll: (filter) =>
      read(() => {
        const items = getDb().sessions.flatMap((s) => s.detail.action_items);
        return filter?.mine ? items.filter((a) => a.assignee_contact_id === "c-me") : items;
      }),
    upsert: (item) =>
      write(() => {
        const d = findFixture(item.session_id).detail;
        const i = d.action_items.findIndex((a) => a.id === item.id);
        if (i >= 0) d.action_items[i] = item;
        else d.action_items.push(item);
        refreshCounts(d);
      }),
    toggleDone: (id) =>
      write(() => {
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
    history: () => read(() => []),
    ask: async (sessionId, question, onToken) => {
      await wait();
      if (getFlags().failLoad) throw new DataError("server");
      const fx = findFixture(sessionId);
      const hit = fx.chat.find((c) => c.question.trim().toLowerCase() === question.trim().toLowerCase());
      const answer = hit?.answer ?? "Bản mockup chỉ trả lời được các câu gợi ý.";
      const words = answer.split(" ");
      for (let i = 1; i <= words.length; i++) {
        onToken(words.slice(0, i).join(" "));
        await new Promise((r) => setTimeout(r, 40));
      }
      return {
        id: `m-${Date.now()}`,
        role: "ai",
        text: answer,
        citations: (hit?.citations ?? []).map((t) => ({ timestamp_sec: t })),
      };
    },
  },

  share: {
    create: (sessionId, opts) =>
      write(() => ({
        id: `sh-${Date.now().toString(36)}`,
        session_id: sessionId,
        scope: opts.scope,
        has_password: !!opts.password,
        expires_at: opts.expires_at,
        revoked: false,
        view_count: 0,
      })),
    revoke: () => write(() => undefined),
    getPublic: () => read(() => "expired" as const),
  },

  mail: {
    preview: (sessionId, recipientContactIds, mode) =>
      read(() => {
        const d = findFixture(sessionId).detail;
        const drafts: EmailDraft[] = [];
        for (const cid of recipientContactIds) {
          if (mode !== "tasks")
            drafts.push({ to_contact_id: cid, kind: "minutes", subject: `Biên bản: ${d.title}`, body: d.executive_summary });
          const mine = d.action_items.filter((a) => a.assignee_contact_id === cid && !a.done);
          if (mode !== "minutes" && mine.length)
            drafts.push({
              to_contact_id: cid,
              kind: "tasks",
              subject: `Việc của bạn sau buổi ${d.title}`,
              body: mine.map((a) => `- ${a.task}`).join("\n"),
            });
        }
        return drafts;
      }),
    send: (drafts) => write(() => drafts.map((d) => ({ contact_id: d.to_contact_id, ok: true }))),
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
    addGlossaryTerm: (term) =>
      write(() => {
        const clean = term.trim();
        const db = getDb();
        const existing = db.glossary.find(
          (g) => g.term.toLocaleLowerCase("vi") === clean.toLocaleLowerCase("vi"),
        );
        if (existing) return existing;
        const item: GlossaryTerm = { id: `gl-${Date.now().toString(36)}`, term: clean };
        db.glossary.push(item);
        return item;
      }),
  },
};

export { MOCK_NOW } from "./store";
