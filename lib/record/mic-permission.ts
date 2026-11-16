"use client";

import { useSyncExternalStore } from "react";

/*
 * Ghi nhớ "đã từng cấp quyền micro" (docs/03-screens.md mục 2):
 * lần đầu hiện bảng xin quyền, các lần sau bỏ qua bảng này.
 */

const KEY = "noteim-mic-granted";

export function micGrantedOnce(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function markMicGranted() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // localStorage bị chặn: lần sau lại hỏi, không sao
  }
  emit();
}

/* ---- Trạng thái "đã cấp quyền" cho React (M5-04) ---- */

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type MicGateSeed = "boot" | "permission";

/**
 * Quyết định ban đầu của màn ghi:
 * - Máy chủ: "permission" — bảng xin quyền được dựng sẵn trong HTML nên nội
 *   dung lớn nhất hiện cùng lần vẽ đầu (LCP không chờ hydrate, M5-04).
 * - Máy đã từng cấp quyền: "boot" — bỏ qua bảng, ghi luôn; React đổi sang giá
 *   trị máy sau khi hydrate, không gây lỗi khớp.
 */
export function useMicGateSeed(): MicGateSeed {
  return useSyncExternalStore(
    subscribe,
    () => (micGrantedOnce() ? "boot" : "permission"),
    () => "permission",
  );
}
