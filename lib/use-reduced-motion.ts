"use client";

import { useSyncExternalStore } from "react";

/*
 * Người dùng có bật "giảm chuyển động" không.
 * Khác useReducedMotion của Motion: lần vẽ đầu luôn trả về false giống máy chủ,
 * rồi mới cập nhật, nên không bao giờ gây lỗi hydrate khi dùng để chọn nội dung.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function useReducedMotionSafe(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
