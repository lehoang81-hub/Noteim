"use client";

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
}
