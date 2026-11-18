"use client";

import { getFlags } from "@/lib/debug/flags";
import type { Player, PlayerState, SkipRange } from "./mock-player";

/*
 * Trình phát âm thanh thật cho buổi có file (M9-01, issue #65): dùng
 * HTMLAudioElement, cùng interface Player với đồng hồ giả — giao diện không
 * phải sửa (docs/04 mục "Nối database sau này", bước 4).
 *
 * - Vị trí cập nhật bằng requestAnimationFrame khi đang phát để chữ chạy
 *   theo mượt; thời lượng giữ giá trị buổi ghi báo trước (khớp đáp án), không
 *   đợi metadata — không có trạng thái sai thoáng qua.
 * - Chạm Phát mới nạp file và bắt đầu (iPhone chặn tự phát; không tự play
 *   lúc dựng giao diện).
 * - Đang đệm hiện trạng thái chờ trên nút (waiting); lỗi tải hiện câu lỗi
 *   và Thử lại (retry) — cờ thử nghiệm "Lỗi tải âm thanh" ép vào lỗi này.
 * - Nghe sạch (M8-01): kim nhảy qua các khoảng cần bỏ qua như đồng hồ giả;
 *   bộ lọc Web Audio nối ở lib/player/clean-audio.ts.
 */

export function createAudioPlayer(url: string, duration: number, startAt = 0): Player {
  let state: PlayerState = { currentTime: startAt, duration, playing: false, rate: 1, waiting: false, error: null };
  const listeners = new Set<() => void>();
  let raf = 0;
  let skips: SkipRange[] = [];
  let audio: HTMLAudioElement | null = null;

  const emit = () => listeners.forEach((l) => l());
  const set = (patch: Partial<PlayerState>) => {
    state = { ...state, ...patch };
    emit();
  };

  /** Kim đang nằm trong khoảng cần bỏ qua thì trả về điểm cuối của khoảng. */
  const skipEndAt = (t: number): number | null => {
    for (const s of skips) if (t >= s.start && t < s.end) return s.end;
    return null;
  };

  /** Thẻ audio dựng muộn: chạm Phát lần đầu mới nạp file. Gắn vào cuối trang
   * (ẩn) để kiểm thử và tiện ích đọc được vị trí thật của tiếng đang phát. */
  function ensureAudio(): HTMLAudioElement {
    if (audio) return audio;
    const el = new Audio();
    el.preload = "none"; // không tải trước — bấm Phát mới bắt đầu
    el.src = url;
    el.setAttribute("data-noteim-audio", url);
    el.style.display = "none";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    el.addEventListener("waiting", () => set({ waiting: true }));
    el.addEventListener("playing", () => set({ waiting: false, error: null }));
    el.addEventListener("canplay", () => set({ waiting: false }));
    el.addEventListener("seeked", () => set({ waiting: false }));
    el.addEventListener("ended", () => {
      cancelAnimationFrame(raf);
      set({ playing: false, currentTime: duration, waiting: false });
    });
    el.addEventListener("error", () => {
      cancelAnimationFrame(raf);
      set({ playing: false, waiting: false, error: "load" });
    });
    audio = el;
    return el;
  }

  function tick() {
    if (!audio) return;
    const t = audio.currentTime;
    // Nghe sạch: nhảy qua khoảng lặng/tiếng đệm trong bản đồ nghe (M8-01)
    const jump = skipEndAt(t);
    if (jump !== null) {
      audio.currentTime = jump;
      set({ currentTime: jump });
    } else if (t >= duration) {
      cancelAnimationFrame(raf);
      set({ currentTime: duration, playing: false });
      return;
    } else {
      set({ currentTime: t });
      raf = requestAnimationFrame(tick);
    }
  }

  const player: Player = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    play() {
      if (state.playing || state.error) return;
      if (state.currentTime >= duration) state = { ...state, currentTime: 0 };
      const el = ensureAudio();
      // Bật phát từ trong khoảng bỏ qua: nhảy tới cuối khoảng ngay
      const jump = skipEndAt(state.currentTime);
      if (jump !== null) state = { ...state, currentTime: jump };
      el.playbackRate = state.rate;
      set({ playing: true, waiting: true });
      // Lỗi tải ép bằng cờ thử nghiệm (bảng ?debug=1): báo lỗi ngay, không đợi mạng
      if (getFlags().audioFail) {
        set({ playing: false, waiting: false, error: "load" });
        return;
      }
      void el
        .play()
        .then(() => {
          if (!state.playing) el.pause();
          else raf = requestAnimationFrame(tick);
        })
        .catch(() => {
          // Tải thất bại thật (mạng, file hỏng) mới báo lỗi — pause chen ngang
          // chỉ là hủy lần chơi, không phải lỗi
          if (!state.playing) return;
          set({ playing: false, waiting: false, error: "load" });
        });
    },
    pause() {
      cancelAnimationFrame(raf);
      audio?.pause();
      set({ playing: false, waiting: false });
    },
    toggle() {
      if (state.playing) player.pause();
      else player.play();
    },
    seek(time) {
      const t = Math.min(duration, Math.max(0, time));
      const jump = skipEndAt(t);
      const target = jump ?? t;
      set({ currentTime: target });
      if (audio) audio.currentTime = target; // giữ vị trí thẻ audio khớp kim để phát tiếp từ đó
    },
    skip(seconds) {
      player.seek(state.currentTime + seconds);
    },
    setRate(rate) {
      set({ rate });
      if (audio) audio.playbackRate = rate;
    },
    setSkips(list) {
      skips = [...list].sort((a, b) => a.start - b.start);
      // Vừa nhận bản đồ nghe mà kim đang nằm trong khoảng bỏ qua: nhảy ngay,
      // không phát tiếp phần im lặng (tránh trạng thái sai thoáng qua)
      const jump = skipEndAt(state.currentTime);
      if (jump !== null && state.playing) {
        set({ currentTime: jump });
        if (audio) audio.currentTime = jump;
      }
    },
    retry() {
      set({ error: null });
      const el = ensureAudio();
      el.load(); // nạp lại từ đầu; play() sẽ gọi khi người dùng bấm
    },
    destroy() {
      cancelAnimationFrame(raf);
      if (audio) {
        audio.pause();
        audio.remove();
        audio.removeAttribute("src");
        audio.load();
        audio = null;
      }
    },
  };
  return player;
}
