"use client";

import { useSyncExternalStore } from "react";
import type { Profession } from "@/lib/data/types";

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
