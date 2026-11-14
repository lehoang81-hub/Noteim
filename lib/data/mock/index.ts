"use client";

import { getFlags } from "@/lib/debug/flags";
import type { DataSource, EmailDraft, SessionFilter } from "../repository";
import { DataError, Session as SessionSchema, type ActionItem, type Session, type SessionDetail, type SessionFixture } from "../types";
import { MOCK_NOW, commit, getDb } from "./store";

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

const processingTimers = new Map<string, number>();

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
    createFromRecording: (draft) =>
      write(() => {
        const db = getDb();
        const id = `s-new-${Date.now()}`;
        const now = new Date().toISOString();
        const detail: SessionDetail = {
          id,
          user_id: db.user.id,
          workspace_id: null,
          title: draft.title ?? "",
          template_id: draft.template_id,
          language: "vi",
          output_language: "vi",
          status: "processing",
          processing_step: 1,
          storage_status: "full",
          duration_sec: draft.duration_sec,
          size_bytes: draft.duration_sec * 3000,
          created_at: now,
          audio_expires_at: null,
          consent: { confirmed: true, announced: false },
          participant_contact_ids: [],
          peaks_thumb: Array.from({ length: 40 }, () => 0.3 + Math.random() * 0.6),
          speaker_colors_thumb: Array.from({ length: 40 }, () => 0),
          open_task_count: 0,
          executive_summary: "",
          speakers: [],
          topics: [],
          action_items: [],
          notes: draft.notes.map((n, i) => ({ id: `n${i}`, ...n })),
          bookmarks: [],
          photos: [],
          peaks: [],
          speaker_spans: [],
          send_history: [],
        };
        db.sessions.unshift({ detail, transcript: [], chat: [] });
        return { id };
      }),
    subscribeProcessing: (id, onStep) => {
      const tick = () => {
        const fx = getDb().sessions.find((s) => s.detail.id === id);
        if (!fx || fx.detail.status !== "processing") return;
        const step = (fx.detail.processing_step ?? 1) + 1;
        if (step > 5) {
          fx.detail.status = "ready";
          delete fx.detail.processing_step;
          refreshCounts(fx.detail);
          commit();
          onStep(6);
          return;
        }
        fx.detail.processing_step = step as 1 | 2 | 3 | 4 | 5;
        commit();
        onStep(step);
        processingTimers.set(id, window.setTimeout(tick, 1600));
      };
      processingTimers.set(id, window.setTimeout(tick, 1600));
      return () => window.clearTimeout(processingTimers.get(id));
    },
    retryProcessing: (id) =>
      write(() => {
        const d = findFixture(id).detail;
        d.status = "processing";
        d.processing_step = 1;
        delete d.failure_reason;
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
  },
};

export { MOCK_NOW } from "./store";
