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
import { ChatMessage, Contact, GlossaryTerm, Quota, SessionFixture, ShareLink, Template, User } from "../types";
import { clearStorageFull, markStorageFull } from "@/lib/storage-full";

/*
 * Kho dữ liệu của bản giả: nạp fixture (kiểm tra bằng Zod), giữ trong bộ nhớ,
 * lưu thay đổi vào localStorage để tải lại trang vẫn còn.
 * Chỉ lib/data/mock được import file này.
 */

const STORAGE_KEY = "noteim-mock-db-v1";

export type MockDb = {
  user: User;
  quota: Quota;
  contacts: Contact[];
  templates: Template[];
  glossary: GlossaryTerm[];
  sessions: Array<
    SessionFixture & {
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
};

function seed(): MockDb {
  return {
    user: User.parse(userJson),
    quota: Quota.parse(quotaJson),
    contacts: z.array(Contact).parse(contactsJson),
    templates: z.array(Template).parse(templatesJson),
    glossary: z.array(GlossaryTerm).parse(glossaryJson),
    sessions: [s1, s2, s3, s4, s5, s6, s7, s8].map((s) => SessionFixture.parse(s)),
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
    db = saved ? { ...seed(), ...(JSON.parse(saved) as MockDb) } : seed();
  } catch {
    db = seed();
  }
  return db;
}

/** Ghi thay đổi: gọi sau mỗi lần sửa kho. */
export function commit() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // localStorage đầy hoặc bị chặn: thay đổi chỉ còn đến khi tải lại.
    // Không im lặng nữa: báo dải "Bộ nhớ đầy" (PR #22, lỗi 3).
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
