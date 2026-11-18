"use client";

/*
 * Giữ màn hình sáng cho trang thử ghi âm (B0-02 bước 2, docs/10-B).
 * Khác lib/record/wake-lock của app: trang spike cần nhật ký từng lần mất và
 * lấy lại khoá sáng, và công tắc dùng được cả khi chưa bắt đầu ghi.
 * Trình duyệt tự thả khoá sáng khi trang bị ẩn và xin lại được khi quay lại:
 * hai trường hợp đó là đúng điều cần thử ở G1, G2.
 */

type SentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: "release", listener: () => void) => void;
};

export interface SpikeWakeLockHandlers {
  /** Bị mất khi còn muốn giữ và trang vẫn hiện (hệ điều hành lấy). */
  onLost: () => void;
  /** Xin lại thành công sau khi trang hiện lại. */
  onReacquired: () => void;
  /** Xin mà bị từ chối, kèm câu lỗi gốc của trình duyệt. */
  onFail: (msg: string) => void;
}

export interface SpikeWakeLock {
  supported: boolean;
  /** Bật hoặc tắt theo công tắc; trả về true khi giữ màn hình thành công. */
  setOn: (on: boolean) => Promise<boolean>;
  /** Thả khoá sáng và gỡ trình nghe khi rời trang, không log. */
  dispose: () => void;
}

export function createSpikeWakeLock(handlers: SpikeWakeLockHandlers): SpikeWakeLock {
  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;
  let sentinel: SentinelLike | null = null;
  let wanted = false;

  async function acquire(reportBack: boolean): Promise<boolean> {
    if (!supported || !wanted || sentinel) return sentinel !== null;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<SentinelLike> };
    };
    try {
      const s = await nav.wakeLock?.request("screen");
      sentinel = s ?? null;
      s?.addEventListener?.("release", () => {
        if (sentinel !== s) return;
        sentinel = null;
        // Trang bị ẩn thì trình duyệt tự thả, khi quay lại sẽ xin lại và báo
        // onReacquired; còn mất khoá sáng khi trang vẫn hiện thì báo onLost
        if (wanted && document.visibilityState === "visible") handlers.onLost();
      });
      if (reportBack) handlers.onReacquired();
      return sentinel !== null;
    } catch (e) {
      sentinel = null;
      handlers.onFail(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      sentinel = null; // trình duyệt tự thả, không coi là lỗi
    } else if (wanted && !sentinel) {
      void acquire(true);
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
  }

  return {
    supported,
    async setOn(on) {
      wanted = on;
      if (!on) {
        const s = sentinel;
        sentinel = null;
        try {
          await s?.release();
        } catch {
          /* đã thả rồi */
        }
        return true;
      }
      return acquire(false);
    },
    dispose() {
      wanted = false;
      const s = sentinel;
      sentinel = null;
      void s?.release().catch(() => undefined);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    },
  };
}
