"use client";

import contactsJson from "@/fixtures/contacts.json";
import glossaryJson from "@/fixtures/glossary.json";
import quotaJson from "@/fixtures/quota.json";
import s1 from "@/fixtures/sessions/bds-gap-chi-lan.json";
import s2 from "@/fixtures/sessions/hop-dieu-hanh-t11.json";
import s3 from "@/fixtures/sessions/luat-tu-van-ong-phuoc.json";
import s4 from "@/fixtures/sessions/kts-hop-cong-truong.json";
import s5 from "@/fixtures/sessions/bac-si-buoi-kham.json";
import s6 from "@/fixtures/sessions/cong-chung-chuyen-nhuong.json";
import s7 from "@/fixtures/sessions/loi-xu-ly.json";
import s8 from "@/fixtures/sessions/chua-tai-len.json";
import templatesJson from "@/fixtures/templates.json";
import userJson from "@/fixtures/user.json";
import { z } from "zod";
import type { RecordingDraft } from "../repository";
import { ChatMessage, Contact, GlossaryTerm, Quota, Session, Session as SessionSchema, SessionDetail, SessionFixture, ShareLink, Template, TranscriptSegment, User } from "../types";
import { clearStorageFull, markStorageFull } from "@/lib/storage-full";

/*
 * Kho dữ liệu của bản giả: nạp fixture (kiểm tra bằng Zod), giữ trong bộ nhớ,
 * lưu thay đổi vào localStorage để tải lại trang vẫn còn.
 * Chỉ lib/data/mock được import file này.
 */

const STORAGE_KEY = "noteim-mock-db-v1";

/** Buổi ghi trong kho: fixture thô kiểm Zod lười + bản nhẹ cho danh sách (M5-04) */
export type StoredSession = SessionFixture & { readonly listDetail?: Session };

export type MockDb = {
  user: User;
  quota: Quota;
  contacts: Contact[];
  templates: Template[];
  glossary: GlossaryTerm[];
  sessions: Array<
    StoredSession & {
      /** Bản nháp của buổi ghi vừa ghi, dùng để sinh nội dung khi xử lý xong */
      draft?: RecordingDraft;
      /** Lịch sử hỏi đáp của tab Hỏi AI (M3-03), lưu theo buổi ghi */
      chat_log?: ChatMessage[];
    }
  >;
  /** Link chia sẻ đã tạo (M4-01). Mật khẩu lưu trong bản giả để trang công khai kiểm lại. */
  shares: Array<ShareLink & { password?: string }>;
  /** Buổi ghi vừa xóa, giữ để "Hoàn tác" (M4-01); dọn khi tải lại trang */
  removed: Array<SessionFixture & { chat_log?: ChatMessage[] }>;
  /** Buổi ghi mẫu theo nghề (M4-04), tách khỏi danh sách thư viện chính */
  samples: StoredSession[];
};

/**
 * Bọc danh sách buổi ghi thô bằng proxy: đọc phần tử nào thì kiểm Zod phần tử
 * đó (một lần, có nhớ kết quả). Mọi cách dùng mảng (map/filter/find) vẫn chạy
 * bình thường. (M5-04)
 */
/**
 * Một buổi ghi thô kiểm Zod từng phần khi có nơi đọc tới (M5-04): danh sách
 * thư viện chỉ đọc `detail`, không phải trả giá cả parse cả bản ghi lời
 * (60 đoạn/buổi). Phần nào đã đọc được nhớ lại; ghi vào JSON (commit) vẫn
 * nhận đủ dữ liệu vì JSON.stringify gọi được getter.
 */
function lazyFixture(raw: Record<string, unknown>): StoredSession {
  const cache: Record<string, unknown> = {};
  return {
    get detail() {
      if (!("detail" in cache)) cache.detail = SessionDetail.parse(raw.detail);
      return cache.detail;
    },
    /** Bản nhẹ cho danh sách thư viện: chỉ các trường của Session, không
     * phải trả giá parse tóm tắt, người nói, việc cần làm... (M5-04) */
    get listDetail(): Session | undefined {
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

function lazyParseSessions(raw: unknown[]): StoredSession[] {
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

function seed(): MockDb {
  return {
    user: User.parse(userJson),
    quota: Quota.parse(quotaJson),
    contacts: z.array(Contact).parse(contactsJson),
    templates: z.array(Template).parse(templatesJson),
    glossary: z.array(GlossaryTerm).parse(glossaryJson),
    // Buổi ghi (kể cả mẫu) nạp bất đồng bộ qua ensureDb() (M5-04): JS khởi tạo
    // không mang theo fixture buổi ghi nữa, màn hình mở nhanh hơn.
    sessions: [],
    samples: [],
    shares: [],
    removed: [],
  };
}

/**
 * Bổ sung trường tiếng Anh cho mẫu đã lưu trước M5-02 (M5-02, issue #37):
 * kho localStorage cũ không có name_en/title_en, lấy từ fixture. Người dùng
 * vẫn giữ phần sửa tay (thứ tự phần, bật/tắt); phần thiếu mới lấy từ fixture.
 */
function backfillTemplateEn(saved: Template[]) {
  const fresh = new Map(seed().templates.map((tp) => [tp.id, tp]));
  for (const tp of saved) {
    const f = fresh.get(tp.id);
    if (!f) continue;
    if (!tp.name_en && f.name_en) tp.name_en = f.name_en;
    if (!tp.suggested_questions_en && f.suggested_questions_en) tp.suggested_questions_en = f.suggested_questions_en;
    if (!tp.footer_note_en && f.footer_note_en) tp.footer_note_en = f.footer_note_en;
    for (const sec of tp.sections) {
      const fs = f.sections.find((x) => x.id === sec.id);
      if (fs && !sec.title_en && fs.title_en) sec.title_en = fs.title_en;
    }
  }
}

let db: MockDb | null = null;
const listeners = new Set<() => void>();

export function getDb(): MockDb {
  if (db) return db;
  try {
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    // Kho lưu trước bản có shares/removed thì lấy giá trị mặc định cho phần thiếu
    db = saved ? { ...seed(), ...(JSON.parse(saved) as MockDb) } : seed();
    if (saved) backfillTemplateEn(db.templates);
  } catch {
    db = seed();
  }
  return db;
}

/**
 * Nạp buổi ghi cho kho mới tạo (M5-04). Kho khôi phục từ localStorage đã có
 * dữ liệu người dùng thì giữ nguyên, không ghi đè bằng fixture.
 * Mọi lần đọc/ghi dữ liệu gọi await ensureDb() trước nên không có màn hình
 * nào nhìn thấy danh sách rỗng.
 */
const sessionLoad = new WeakMap<MockDb, Promise<MockDb>>();

/** Bảo đảm kho tồn tại và buổi ghi đang được nạp (kích hoạt đúng một lần). */
export function ensureDb(): MockDb {
  const d = getDb();
  if (!sessionLoad.has(d)) {
    const p =
      d.sessions.length > 0
        ? Promise.resolve(d) // kho từ localStorage: buổi ghi đã có sẵn
        : (async () => {
            // Buổi ghi nạp tĩnh (đi cùng đợt tải đầu) nhưng kiểm Zod lười theo
            // từng buổi và từng phần (M5-04). Sáu buổi mẫu tách riêng qua
            // samplesReady() vì chỉ mở từ làm quen/Cài đặt.
            d.sessions = lazyParseSessions([s1, s2, s3, s4, s5, s6, s7, s8]);
            return d;
          })();
    sessionLoad.set(d, p);
  }
  return d;
}

/** Chờ buổi ghi thư viện nạp xong — chỉ các đọc cần buổi ghi mới gọi. */
export function sessionsReady(): Promise<MockDb> {
  const d = ensureDb();
  return sessionLoad.get(d)!;
}

const sampleLoad = new WeakMap<Promise<MockDb>, Promise<MockDb>>();

/** Chờ sáu buổi mẫu theo nghề nạp xong — chỉ màn làm quen và Cài đặt gọi. */
export function samplesReady(): Promise<MockDb> {
  const base = sessionsReady();
  let p = sampleLoad.get(base);
  if (!p) {
    p = base.then(async (db) => {
      if (db.samples.length === 0) {
        const files = await Promise.all([
          import("@/fixtures/samples/realestate_sales.json"),
          import("@/fixtures/samples/business_owner.json"),
          import("@/fixtures/samples/doctor.json"),
          import("@/fixtures/samples/lawyer.json"),
          import("@/fixtures/samples/architect.json"),
          import("@/fixtures/samples/notary.json"),
        ]);
        db.samples = lazyParseSessions(files.map((m) => m.default));
      }
      return db;
    });
    sampleLoad.set(base, p);
  }
  return p;
}

/** Ghi thay đổi: gọi sau mỗi lần sửa kho. */
export function commit() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    // localStorage đầy hoặc bị chặn: thay đổi chỉ còn đến khi tải lại.
    // Không im lặng nữa: báo dải "Bộ nhớ đầy" (PR #22, lỗi 3).
    console.error("Lưu kho mẫu thất bại:", e);
    markStorageFull();
  }
  listeners.forEach((l) => l());
}

/** Đặt lại toàn bộ dữ liệu mẫu (nút trong bảng thử nghiệm). */
export function resetDb() {
  db = seed();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // bỏ qua
  }
  // Bộ nhớ trống trở lại: gở dải báo "Bộ nhớ đầy"
  clearStorageFull();
  listeners.forEach((l) => l());
}

export function subscribeDb(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** "Bây giờ" của mockup: cố định để nhóm Hôm nay, Hôm qua luôn khớp dữ liệu mẫu. */
export const MOCK_NOW = new Date("2026-11-14T19:00:00+07:00");
