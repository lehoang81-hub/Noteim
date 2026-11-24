"use client";

import { useSyncExternalStore } from "react";

/*
 * Trạng thái tải băng lên R2 của một buổi (C1-04 yêu cầu 2c): phần trăm tiến
 * độ cho dải "Đang tải lên" ở màn xử lý. Nằm ngoài React vì upload chạy
 * xuyên màn hình (ghi âm → xử lý → chi tiết) — component đọc qua
 * useAudioUpload(), máy chủ luôn thấy null.
 */

export type UploadStatus = "uploading" | "complete" | "failed";

export type UploadSnapshot = {
  sessionId: string;
  percent: number; // 0..100
  status: UploadStatus;
} | null;

let state: UploadSnapshot = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function setUpload(snapshot: NonNullable<UploadSnapshot>) {
  state = snapshot;
  emit();
}

export function clearUpload() {
  if (state === null) return;
  state = null;
  emit();
}

export function subscribeUpload(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Component đọc trạng thái tải lên (null là không có gì đang tải). */
export function useAudioUpload(): UploadSnapshot {
  return useSyncExternalStore(subscribeUpload, () => state, () => null);
}
