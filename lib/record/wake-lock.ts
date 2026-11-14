"use client";

/*
 * Giữ màn hình sáng khi đang ghi bằng Wake Lock API
 * (docs/03-screens.md mục 3). Trình duyệt không hỗ trợ hoặc từ chối thì bỏ qua.
 */

type WakeLockSentinelLike = { released: boolean; release: () => Promise<void> };

let sentinel: WakeLockSentinelLike | null = null;
let wanted = false;

async function acquire() {
  if (!wanted || sentinel) return;
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
    };
    sentinel = (await nav.wakeLock?.request("screen")) ?? null;
  } catch {
    sentinel = null; // hệ điều hành từ chối: cứ ghi tiếp bình thường
  }
}

/** Bật giữ màn hình sáng (gọi khi bắt đầu ghi). */
export function keepScreenAwake() {
  wanted = true;
  void acquire();
}

/** Thả giữ màn hình sáng (gọi khi kết thúc ghi). */
export function letScreenSleep() {
  wanted = false;
  void sentinel?.release().catch(() => undefined);
  sentinel = null;
}

if (typeof window !== "undefined") {
  // Quay lại tab là xin lại, vì trình duyệt tự thả khi ẩn trang
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      if (wanted && !sentinel) void acquire();
    } else {
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
    }
  });
}
