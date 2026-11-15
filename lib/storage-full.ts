"use client";

import { useSyncExternalStore } from "react";

/*
 * Cảnh báo "Bộ nhớ trình duyệt đã đầy" (PR #22, lỗi 3).
 * - Đặt khi một lần ghi localStorage thất bại (kho dữ liệu mẫu hoặc kho buổi
 *   ghi đang diễn ra). Từ đó dải báo hiện cho tới khi đặt lại dữ liệu mẫu,
 *   không tự tắt: đã đầy một lần thì người dùng cần xử lý.
 * - Bảng thử nghiệm ép bằng cờ "Bộ nhớ đầy" (?debug=1); cờ ép và cảnh báo
 *   thật lắp với nhau bằng phép "hoặc" ở nơi hiển thị.
 * - Dữ liệu đang ghi vẫn giữ trong bộ nhớ của phiên, không mất đi âm thầm.
 */

let full = false;
const listeners = new Set<() => void>();

/** Gọi khi ghi localStorage thất bại (QuotaExceeded hoặc bị chặn). */
export function markStorageFull() {
  if (full) return;
  full = true;
  listeners.forEach((l) => l());
}

/** Chỉ dùng khi đặt lại dữ liệu mẫu: bộ nhớ trống trở lại. */
export function clearStorageFull() {
  if (!full) return;
  full = false;
  listeners.forEach((l) => l());
}

export function isStorageFull(): boolean {
  return full;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getServerSnapshot = () => false;

/** Đọc cảnh báo bộ nhớ đầy trong component. Máy chủ luôn thấy false. */
export function useStorageFull(): boolean {
  return useSyncExternalStore(subscribe, isStorageFull, getServerSnapshot);
}
