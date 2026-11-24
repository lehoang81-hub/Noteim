"use client";

/*
 * Bộ đếm thay đổi dữ liệu dùng chung (C1-03b): bản giả tự báo khi commit()
 * kho localStorage; bản remote gọi bumpVersion() sau mỗi lần ghi thành công
 * qua API. Tách file riêng để remote import mà không tạo vòng phụ thuộc
 * lib/data/index.ts ↔ lib/data/remote/index.ts.
 */

let version = 0;
const listeners = new Set<() => void>();

export function bumpVersion() {
  version++;
  listeners.forEach((l) => l());
}

export function getVersion(): number {
  return version;
}

export function subscribeVersionChanges(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
