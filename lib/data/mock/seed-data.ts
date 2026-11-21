"use client";

import { z } from "zod";
import {
  AuditEvent,
  Contact,
  Folder,
  GlossaryTerm,
  Invoice,
  ListeningMap,
  Member,
  Quota,
  Session as SessionSchema,
  SessionDetail,
  SummaryVersion,
  Template,
  TranscriptSegment,
  User,
  Workspace,
  type ListeningMap as ListeningMapFull,
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
     * phải trả giá parse tóm tắt, người nói, việc cần làm... (M5-04).
     * Parse MỖI LẦN đọc, không cache: khi buổi đã được đọc chi tiết rồi sửa
     * qua repository (đổi visibility, tiêu đề...), danh sách cập nhật ngay
     * không cần tải lại trang (M7-01 — lỗi bắt được khi thử đổi Riêng tư/
     * Cả nhóm: bản cache cũ giữ nguyên visibility cũ). Chưa đọc chi tiết lần
     * nào thì parse nhẹ từ raw, không kéo cả tóm tắt vào bộ nhớ. */
    get listDetail(): Session | undefined {
      const src = "detail" in cache ? (cache.detail as SessionDetail) : raw.detail;
      // Session (bản nhẹ) không mang danh sách người nói nên không cần normalize
      return SessionSchema.parse(src);
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
    // Các bản tóm tắt theo ngôn ngữ có sẵn trong fixture (M6-03), kiểm Zod lười.
    // Có cả setter: tạo bản mới (createSummaryVersion) gán mảng qua đây.
    get summary_versions() {
      if (!("summary_versions" in cache)) {
        const list = (raw as { summary_versions?: unknown }).summary_versions;
        cache.summary_versions = list ? z.array(SummaryVersion).parse(list) : undefined;
      }
      return cache.summary_versions as SummaryVersion[] | undefined;
    },
    set summary_versions(v: SummaryVersion[] | undefined) {
      cache.summary_versions = v;
    },
    // Bản đồ nghe tính sẵn (M8-01), kiểm Zod lười như các phần nặng khác
    get listening_map() {
      if (!("listening_map" in cache)) {
        const lm = (raw as { listening_map?: unknown }).listening_map;
        cache.listening_map = lm ? ListeningMap.parse(lm) : undefined;
      }
      return cache.listening_map as ListeningMapFull | undefined;
    },
  } as unknown as StoredSession;
}

/** Bọc danh sách buổi ghi thô: đọc phần tử nào thì kiểm Zod phần tử đó.
 * Cache theo ĐỐI TƯỢNG (WeakMap), không theo chỉ số: splice/unshift của
 * remove, restore, createFromRecording dịch chuyển mảng gốc — cache theo
 * chỉ số sẽ trả nhầm buổi cũ cho vị trí mới, làm thư viện hiện lại buổi vừa
 * xóa và hỏng luôn kho ghi xuống localStorage (bắt được khi M7-01 thêm buổi
 * nhóm, khi đó số hàng không còn khớp may mắn như trước). */
export function lazyParseSessions(raw: unknown[]): StoredSession[] {
  const cache = new WeakMap<object, StoredSession>();
  return new Proxy(raw, {
    get(target, prop) {
      // Chỉ chặn chỉ số dạng chuỗi ("0", "1", "length"); Symbol (Symbol.iterator,
      // Symbol.toStringTag) và phương thức đi thẳng vào mảng gốc, nếu không
      // Number(Symbol) ném lỗi khi mảng được trải (...) hoặc in ra.
      if (typeof prop === "string") {
        if (prop === "length") return target.length;
        const index = Number(prop);
        if (Number.isInteger(index) && index >= 0 && String(index) === prop) {
          const item = target[index];
          if (item === undefined || item === null) return undefined;
          const key = item as object;
          let fx = cache.get(key);
          if (!fx) {
            fx = lazyFixture(item as Record<string, unknown>);
            cache.set(key, fx);
          }
          return fx;
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

/** Chín buổi của không gian Cá nhân + sáu buổi của không gian nhóm (M7-01), kiểm Zod lười. */
export async function loadSessions(): Promise<StoredSession[]> {
  const [s1, s2, s3, s4, s5, s6, s7, s8, s9, t1, t2, t3, t4, t5, t6] = await Promise.all([
    import("@/fixtures/sessions/bds-gap-chi-lan.json"),
    import("@/fixtures/sessions/hop-dieu-hanh-t11.json"),
    import("@/fixtures/sessions/luat-tu-van-ong-phuoc.json"),
    import("@/fixtures/sessions/kts-hop-cong-truong.json"),
    import("@/fixtures/sessions/bac-si-buoi-kham.json"),
    import("@/fixtures/sessions/cong-chung-chuyen-nhuong.json"),
    import("@/fixtures/sessions/loi-xu-ly.json"),
    import("@/fixtures/sessions/chua-tai-len.json"),
    import("@/fixtures/sessions/hop-doi-tac-han.json"),
    import("@/fixtures/sessions/s-nhom-marina-c.json"),
    import("@/fixtures/sessions/s-nhom-hop-tuan-45.json"),
    import("@/fixtures/sessions/s-nhom-legend-ha-phong.json"),
    import("@/fixtures/sessions/s-nhom-chu-dau-tu-le-hong.json"),
    import("@/fixtures/sessions/s-nhom-van-phong-song-hong.json"),
    import("@/fixtures/sessions/s-nhom-chot-can-12a.json"),
  ]);
  return lazyParseSessions([
    s1.default, s2.default, s3.default, s4.default, s5.default, s6.default, s7.default, s8.default, s9.default,
    t1.default, t2.default, t3.default, t4.default, t5.default, t6.default,
  ]);
}

/** Không gian làm việc (M7-01): không gian Cá nhân + nhóm mẫu. */
export async function loadWorkspaces(): Promise<Workspace[]> {
  const m = await import("@/fixtures/workspaces.json");
  return z.array(Workspace).parse(m.default);
}

/** Thành viên và lời mời của các không gian (M7-01). */
export async function loadMembers(): Promise<Member[]> {
  const m = await import("@/fixtures/members.json");
  return z.array(Member).parse(m.default);
}

/** Nhật ký truy cập mẫu của không gian nhóm (M7-01). */
export async function loadAudit(): Promise<AuditEvent[]> {
  const m = await import("@/fixtures/audit.json");
  return z.array(AuditEvent).parse(m.default);
}

/** Hóa đơn mẫu của gói Nhóm (M7-01). */
export async function loadInvoices(): Promise<Invoice[]> {
  const m = await import("@/fixtures/invoices.json");
  return z.array(Invoice).parse(m.default);
}

/** Thư mục theo hồ sơ (GC-05, đặc tả v1.1 §4.7). */
export async function loadFolders(): Promise<Folder[]> {
  const m = await import("@/fixtures/folders.json");
  return z.array(Folder).parse(m.default);
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
