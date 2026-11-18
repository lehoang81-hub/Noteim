"use client";

import { useSyncExternalStore } from "react";
import type { Profession, WorkspaceRole } from "@/lib/data/types";

/*
 * Cờ của bảng thử nghiệm (?debug=1), để người duyệt ép từng trạng thái
 * trên điện thoại. Lưu trong localStorage. Không dùng trong bản thật.
 */

export type DebugFlags = {
  /** Bảng đang mở (bật bằng ?debug=1, tắt bằng ?debug=0) */
  panel: boolean;
  offline: boolean;
  /** Mọi lần tải dữ liệu chậm 3 giây */
  slow: boolean;
  /** Mọi lần tải dữ liệu đều lỗi */
  failLoad: boolean;
  /** Đã dùng hết hạn mức tháng */
  quotaOut: boolean;
  /** Thư viện rỗng */
  emptyLibrary: boolean;
  /** Tua nhanh đồng hồ ghi x30 (kiểm gợi ý im lặng, hạn mức phiên) */
  recordSpeed30: boolean;
  /** Ép trạng thái micro bị từ chối */
  micDenied: boolean;
  /** Ép trạng thái micro bị chiếm sau 10 giây */
  micTaken: boolean;
  /** Ép cảnh báo bộ nhớ trình duyệt đã đầy */
  storageFull: boolean;
  /** Ép gửi email lỗi đúng một người (M3-04) */
  mailFailOne: boolean;
  /** Ép trang công khai báo link hết hạn (M4-01) */
  shareExpired: boolean;
  /** Ép dịch bản ghi lời lỗi, có Thử lại (M6-02) */
  translateFail: boolean;
  /** Ép dịch bản ghi lời chậm 10 giây (M6-02) */
  translateSlow: boolean;
  /** Ép "Không có bản đồ nghe" — buổi cũ chưa xử lý, nút Nghe sạch tắt (M8-01) */
  noListeningMap: boolean;
  /** Ép dùng đồng hồ phát giả cho cả 3 buổi có âm thanh thật (M9-01, để bộ kiểm thử cũ chạy nhanh) */
  audioMock: boolean;
  /** Ép tải âm thanh lỗi, hiện "Không phát được âm thanh" và Thử lại (M9-01) */
  audioFail: boolean;
  /** Ép vai trò của tôi trong không gian Nhóm để kiểm bảng quyền (M7-01); null là theo dữ liệu */
  debugRole: WorkspaceRole | null;
  /** Ép lời mời hết hạn khi mở /join/[token] (M7-01) */
  inviteExpired: boolean;
  /** Ép nhóm hết chỗ (khóa nút Mời kèm lý do, M7-01) */
  seatsFull: boolean;
  profession: Profession | null;
  plan: "free" | "pro" | null;
};

const KEY = "noteim-debug";
const DEFAULTS: DebugFlags = {
  panel: false,
  offline: false,
  slow: false,
  failLoad: false,
  quotaOut: false,
  emptyLibrary: false,
  recordSpeed30: false,
  micDenied: false,
  micTaken: false,
  storageFull: false,
  mailFailOne: false,
  shareExpired: false,
  translateFail: false,
  translateSlow: false,
  noListeningMap: false,
  audioMock: false,
  audioFail: false,
  debugRole: null,
  inviteExpired: false,
  seatsFull: false,
  profession: null,
  plan: null,
};

let flags: DebugFlags = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) flags = { ...DEFAULTS, ...JSON.parse(saved) };
  } catch {
    // localStorage không dùng được thì giữ mặc định
  }
  const param = new URLSearchParams(window.location.search).get("debug");
  if (param === "1") flags = { ...flags, panel: true };
  if (param === "0") flags = { ...flags, panel: false };
}

export function getFlags(): DebugFlags {
  load();
  return flags;
}

export function setFlags(patch: Partial<DebugFlags>) {
  load();
  flags = { ...flags, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(flags));
  } catch {
    // bỏ qua
  }
  listeners.forEach((l) => l());
}

export function resetFlags() {
  setFlags({ ...DEFAULTS, panel: flags.panel });
}

export function subscribeFlags(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Đọc cờ trong component. Máy chủ luôn thấy giá trị mặc định. */
export function useDebugFlags(): DebugFlags {
  return useSyncExternalStore(subscribeFlags, getFlags, () => DEFAULTS);
}
