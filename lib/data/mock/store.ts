"use client";

import { clearStorageFull, markStorageFull } from "@/lib/storage-full";
import type { RecordingDraft } from "../repository";
import type { ChatMessage, Contact, GlossaryTerm, Quota, SessionFixture, ShareLink, Template, User } from "../types";
import type { StoredSession } from "./seed-data";

export type { StoredSession } from "./seed-data";

/*
 * Kho dữ liệu của bản giả: nạp fixture bằng import() động khi kho khởi tạo
 * lần đầu (M5, sửa review PR #41 mục 2 — nhờ vậy Zod và JSON fixture không
 * nằm trong chunk khởi tạo), giữ trong bộ nhớ, lưu thay đổi vào localStorage
 * để tải lại trang vẫn còn. Chỉ lib/data/mock được import file này.
 */

const STORAGE_KEY = "noteim-mock-db-v1";

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
 * Kho mới: các thực thể gốc và buổi ghi được nạp bất đồng bộ qua ensureDb()
 * (M5 — fixture đi qua import() động). Mọi lần đọc/ghi dữ liệu qua repository
 * đều chờ sessionsReady() nên không có màn hình nào nhìn thấy kho rỗng.
 */
function emptyDb(): MockDb {
  return {
    user: null as unknown as User,
    quota: null as unknown as Quota,
    contacts: [],
    templates: [],
    glossary: [],
    sessions: [],
    samples: [],
    shares: [],
    removed: [],
  };
}

let db: MockDb | null = null;
const listeners = new Set<() => void>();

export function getDb(): MockDb {
  if (db) return db;
  try {
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    // Kho lưu trước bản có shares/removed thì lấy giá trị mặc định cho phần thiếu
    db = saved ? { ...emptyDb(), ...(JSON.parse(saved) as MockDb) } : emptyDb();
  } catch {
    db = emptyDb();
  }
  return db;
}

/**
 * Nạp kho lần đầu (M5): fixture đi qua import() động trong seed-data.ts.
 * - Kho mới: nạp thực thể gốc và tám buổi ghi thư viện.
 * - Kho từ localStorage: giữ nguyên dữ liệu người dùng; chỉ bổ sung bản tiếng
 *   Anh cho mẫu lưu trước M5-02 (M5-02) khi thiếu.
 * Mọi lần đọc/ghi dữ liệu gọi await sessionsReady() trước nên không có màn
 * hình nào nhìn thấy kho rỗng.
 */
const loadMap = new WeakMap<MockDb, Promise<MockDb>>();

/** Bảo đảm kho tồn tại và bắt đầu nạp nếu chưa (kích hoạt đúng một lần). */
export function ensureDb(): MockDb {
  const d = getDb();
  if (!loadMap.has(d)) {
    loadMap.set(
      d,
      (async () => {
        const mod = await import("./seed-data");
        if (!d.templates.length) {
          const base = await mod.loadBase();
          d.user = base.user;
          d.quota = base.quota;
          d.contacts = base.contacts;
          d.templates = base.templates;
          d.glossary = base.glossary;
        } else if (d.templates.some((tp) => !tp.name_en)) {
          await mod.backfillTemplates(d.templates);
        }
        // Buổi ghi thư viện: kho từ localStorage đã có sẵn, không ghi đè
        if (!d.sessions.length) d.sessions = await mod.loadSessions();
        return d;
      })(),
    );
  }
  return d;
}

/** Chờ kho nạp xong (thực thể gốc + buổi ghi thư viện) — mọi đọc/ghi gọi trước khi dùng. */
export function sessionsReady(): Promise<MockDb> {
  const d = ensureDb();
  return loadMap.get(d)!;
}

const sampleLoad = new WeakMap<Promise<MockDb>, Promise<MockDb>>();

/** Chờ sáu buổi mẫu theo nghề nạp xong — chỉ màn làm quen và Cài đặt gọi. */
export function samplesReady(): Promise<MockDb> {
  const base = sessionsReady();
  let p = sampleLoad.get(base);
  if (!p) {
    p = base.then(async (db) => {
      if (db.samples.length === 0) {
        const mod = await import("./seed-data");
        const files = await Promise.all([
          import("@/fixtures/samples/realestate_sales.json"),
          import("@/fixtures/samples/business_owner.json"),
          import("@/fixtures/samples/doctor.json"),
          import("@/fixtures/samples/lawyer.json"),
          import("@/fixtures/samples/architect.json"),
          import("@/fixtures/samples/notary.json"),
        ]);
        db.samples = mod.lazyParseSessions(files.map((m) => m.default));
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
  db = emptyDb();
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
