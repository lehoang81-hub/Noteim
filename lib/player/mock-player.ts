"use client";

import { useSyncExternalStore } from "react";

/*
 * Đồng hồ phát giả lập cho mockup: chạy thời gian, không phát âm thanh.
 * Interface giữ đúng docs/04-data-contract.md mục "Nối database sau này", bước 4:
 * play, pause, seek, currentTime, rate. Khi có âm thanh thật, viết một bản cài đặt
 * khác cùng interface này, giao diện không phải sửa.
 */

export type PlayerState = {
  currentTime: number;
  duration: number;
  playing: boolean;
  rate: number;
  /** Đang đợi âm thanh đệm (trình phát thật, M9-01): hiện trạng thái chờ trên nút */
  waiting?: boolean;
  /** Lỗi tải âm thanh (trình phát thật, M9-01): hiện câu lỗi và Thử lại */
  error?: "load" | null;
};

/** Khoảng cần bỏ qua khi phát (nghe sạch, M8-01): [bắt đầu, kết thúc] giây. */
export type SkipRange = { start: number; end: number };

export interface Player {
  getState(): PlayerState;
  subscribe(listener: () => void): () => void;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(time: number): void;
  skip(seconds: number): void;
  setRate(rate: number): void;
  /** Đặt các khoảng cần bỏ qua (khoảng lặng, tiếng đệm — M8-01). Khi phát,
   * đồng hồ nhảy thẳng tới cuối khoảng thay vì phát qua. Danh sách rỗng là
   * phát thường: file gốc không bị cắt sửa, đây chỉ là cách di chuyển kim. */
  setSkips(skips: SkipRange[]): void;
  /** Thử tải lại âm thanh sau lỗi (trình phát thật, M9-01); bản giả không có */
  retry?(): void;
  /** Dọn tài nguyên (thẻ audio, Web Audio) khi màn đóng; bản giả không cần */
  destroy?(): void;
}

export const PLAYBACK_RATES = [1, 1.25, 1.5, 2] as const;

export function createMockPlayer(duration: number, startAt = 0): Player {
  let state: PlayerState = { currentTime: startAt, duration, playing: false, rate: 1 };
  const listeners = new Set<() => void>();
  let raf = 0;
  let last = 0;
  let skips: SkipRange[] = [];

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

  function tick(now: number) {
    const dt = (now - last) / 1000;
    last = now;
    const next = state.currentTime + dt * state.rate;
    if (next >= state.duration) {
      set({ currentTime: state.duration, playing: false });
      return;
    }
    // Nghe sạch: nhảy qua khoảng lặng/tiếng đệm trong bản đồ nghe (M8-01)
    const jump = skipEndAt(next);
    set({ currentTime: jump ?? next });
    raf = requestAnimationFrame(tick);
  }

  const player: Player = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    play() {
      if (state.playing) return;
      if (state.currentTime >= state.duration) state = { ...state, currentTime: 0 };
      // Bật phát từ trong khoảng bỏ qua: nhảy tới cuối khoảng ngay
      const jump = skipEndAt(state.currentTime);
      if (jump !== null) state = { ...state, currentTime: jump };
      last = performance.now();
      set({ playing: true });
      raf = requestAnimationFrame(tick);
    },
    pause() {
      cancelAnimationFrame(raf);
      set({ playing: false });
    },
    toggle() {
      if (state.playing) player.pause();
      else player.play();
    },
    seek(time) {
      const t = Math.min(state.duration, Math.max(0, time));
      const jump = skipEndAt(t);
      set({ currentTime: jump ?? t });
    },
    skip(seconds) {
      player.seek(state.currentTime + seconds);
    },
    setRate(rate) {
      set({ rate });
    },
    setSkips(list) {
      skips = [...list].sort((a, b) => a.start - b.start);
      // Vừa nhận bản đồ nghe mà kim đang nằm trong khoảng bỏ qua: nhảy ngay,
      // không phát tiếp phần im lặng (tránh trạng thái sai thoáng qua)
      if (state.playing) {
        const jump = skipEndAt(state.currentTime);
        if (jump !== null) set({ currentTime: jump });
      }
    },
  };
  return player;
}

/** Đọc trạng thái trình phát trong component, tự vẽ lại khi thay đổi. */
export function usePlayerState(player: Player): PlayerState {
  return useSyncExternalStore(player.subscribe, player.getState, player.getState);
}
