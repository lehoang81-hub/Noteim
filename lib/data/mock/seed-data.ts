"use client";

import { z } from "zod";
import {
  Contact,
  GlossaryTerm,
  Quota,
  Session as SessionSchema,
  SessionDetail,
  Template,
  TranscriptSegment,
  User,
  type Session,
  type SessionFixture,
} from "../types";
import { normalizeSpeakerNames } from "./normalize";

/*
 * Nạp dữ liệu mẫu của bản giả (M5, sửa review PR #41 mục 2).
 * File này CHỈ được nạp bằng import() động từ store.ts — nhờ vậy Zod và mọi
 * JSON fixture nằm ngoài chunk khởi tạo của ứng dụng, JS đầu trang nhẹ hơn.
 * Buổi ghi kiểm Zod lười theo từng buổi và từng phần (M5-04): đọc phần nào
 * thì mới kiểm phần đó; JSON.stringify vẫn nhận đủ dữ liệu qua getter.
 */

/** Buổi ghi trong kho: fixture thô kiểm Zod lười + bản nhẹ cho danh sách (M5-04) */
export type StoredSession = SessionFixture & { readonly listDetail?: Session };

/**
 * Bọc một buổi ghi thô bằng proxy: đọc trường nào thì kiểm Zod trường đó
 * (một lần, có nhớ kết quả).
 */
function lazyFixture(raw: Record<string, unknown>): StoredSession {
  const cache: Record<string, unknown> = {};
  return {
    get detail() {
      if (!("detail" in cache)) {
        const d = SessionDetail.parse(raw.detail);
        // Fixture lưu nhãn hệ thống ("Bạn", "Người nói N") — quy về chưa đặt
        // tên để hiển thị theo ngôn ngữ giao diện (M5 sửa review #41 mục 5)
        normalizeSpeakerNames(d.speakers);
        cache.detail = d;
      }
      return cache.detail;
    },
    /** Bản nhẹ cho danh sách thư viện: chỉ các trường của Session, không
     * phải trả giá parse tóm tắt, người nói, việc cần làm... (M5-04) */
    get listDetail(): Session | undefined {
      // Session (bản nhẹ) không mang danh sách người nói nên không cần normalize
      if (!("listDetail" in cache)) cache.listDetail = SessionSchema.parse(raw.detail);
      return cache.listDetail as Session | undefined;
    },
    get transcript() {
      if (!("transcript" in cache)) cache.transcript = z.array(TranscriptSegment).parse(raw.transcript ?? []);
      return cache.transcript;
    },
    get chat() {
      // Lịch sử hỏi đáp trong fixture là dạng {question, answer, citations},
      // khác ChatMessage trong kho — dùng đúng schema của SessionFixture.
      if (!("chat" in cache))
        cache.chat = z
          .array(z.object({ question: z.string(), answer: z.string(), citations: z.array(z.number()) }))
          .default([])
          .parse(raw.chat ?? []);
      return cache.chat;
    },
    get flow_mermaid() {
      if (!("flow_mermaid" in cache)) cache.flow_mermaid = raw.flow_mermaid;
      return cache.flow_mermaid;
    },
  } as unknown as StoredSession;
}

/** Bọc danh sách buổi ghi thô: đọc phần tử nào thì kiểm Zod phần tử đó. */
export function lazyParseSessions(raw: unknown[]): StoredSession[] {
  const cache = new Map<number, StoredSession>();
  return new Proxy(raw, {
    get(target, prop) {
      // Chỉ chặn chỉ số dạng chuỗi ("0", "1", "length"); Symbol (Symbol.iterator,
      // Symbol.toStringTag) và phương thức đi thẳng vào mảng gốc, nếu không
      // Number(Symbol) ném lỗi khi mảng được trải (...) hoặc in ra.
      if (typeof prop === "string") {
        if (prop === "length") return target.length;
        const index = Number(prop);
        if (Number.isInteger(index) && index >= 0 && String(index) === prop) {
          if (!cache.has(index)) cache.set(index, lazyFixture(target[index] as Record<string, unknown>));
          return cache.get(index);
        }
      }
      return Reflect.get(target, prop);
    },
  }) as StoredSession[];
}

/** Thực thể gốc (người dùng, hạn mức, danh bạ, mẫu, thuật ngữ) nạp từ fixture. */
export async function loadBase() {
  const [contactsJson, glossaryJson, quotaJson, templatesJson, userJson] = await Promise.all([
    import("@/fixtures/contacts.json"),
    import("@/fixtures/glossary.json"),
    import("@/fixtures/quota.json"),
    import("@/fixtures/templates.json"),
    import("@/fixtures/user.json"),
  ]);
  return {
    user: User.parse(userJson.default),
    quota: Quota.parse(quotaJson.default),
    contacts: z.array(Contact).parse(contactsJson.default),
    templates: z.array(Template).parse(templatesJson.default),
    glossary: z.array(GlossaryTerm).parse(glossaryJson.default),
  };
}

/** Tám buổi ghi của thư viện, kiểm Zod lười. */
export async function loadSessions(): Promise<StoredSession[]> {
  const [s1, s2, s3, s4, s5, s6, s7, s8] = await Promise.all([
    import("@/fixtures/sessions/bds-gap-chi-lan.json"),
    import("@/fixtures/sessions/hop-dieu-hanh-t11.json"),
    import("@/fixtures/sessions/luat-tu-van-ong-phuoc.json"),
    import("@/fixtures/sessions/kts-hop-cong-truong.json"),
    import("@/fixtures/sessions/bac-si-buoi-kham.json"),
    import("@/fixtures/sessions/cong-chung-chuyen-nhuong.json"),
    import("@/fixtures/sessions/loi-xu-ly.json"),
    import("@/fixtures/sessions/chua-tai-len.json"),
  ]);
  return lazyParseSessions([s1.default, s2.default, s3.default, s4.default, s5.default, s6.default, s7.default, s8.default]);
}

/**
 * Bổ sung bản tiếng Hàn (và en nếu thiếu) cho mẫu đã lưu trước M6 (M6-01,
 * issue #43): kho localStorage cũ đã chuyển _en sang LocalizedText ở
 * migrate.ts nhưng chưa có ko — lấy từ fixture. Người dùng vẫn giữ phần sửa
 * tay (thứ tự phần, bật/tắt); chỉ điền ngôn ngữ còn thiếu.
 */
export function templatesMissingKo(saved: Template[]): boolean {
  return saved.some(
    (tp) =>
      !tp.name.ko ||
      tp.sections.some((s) => !s.title.ko) ||
      (tp.suggested_questions ?? []).some((q) => !q.ko) ||
      (tp.footer_note ? !tp.footer_note.ko : false),
  );
}

export async function backfillTemplates(saved: Template[]) {
  const templatesJson = await import("@/fixtures/templates.json");
  const fresh = z.array(Template).parse(templatesJson.default);
  const map = new Map(fresh.map((tp) => [tp.id, tp]));
  for (const tp of saved) {
    const f = map.get(tp.id);
    if (!f) continue;
    if (!tp.name.ko && f.name.ko) tp.name.ko = f.name.ko;
    if (!tp.name.en && f.name.en) tp.name.en = f.name.en;
    if (!tp.suggested_questions?.length && f.suggested_questions?.length) tp.suggested_questions = f.suggested_questions;
    else if (tp.suggested_questions?.length && f.suggested_questions?.length) {
      tp.suggested_questions = tp.suggested_questions.map((q, i) => {
        const fq = f.suggested_questions[i];
        return fq ? { ...q, en: q.en ?? fq.en, ko: q.ko ?? fq.ko } : q;
      });
    }
    if (tp.footer_note && f.footer_note) {
      tp.footer_note = { ...tp.footer_note, en: tp.footer_note.en ?? f.footer_note.en, ko: tp.footer_note.ko ?? f.footer_note.ko };
    } else if (!tp.footer_note && f.footer_note) {
      tp.footer_note = f.footer_note;
    }
    for (const sec of tp.sections) {
      const fs = f.sections.find((x) => x.id === sec.id);
      if (fs) sec.title = { ...sec.title, en: sec.title.en ?? fs.title.en, ko: sec.title.ko ?? fs.title.ko };
    }
  }
}

/** Tách phần nhẹ của buổi ghi (dùng cho thư viện và tìm kiếm). */
export function stripToSession(d: Session | SessionDetail): Session {
  // Zod bỏ các trường không thuộc Session
  return SessionSchema.parse(d);
}
