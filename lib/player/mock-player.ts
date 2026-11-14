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
};

export interface Player {
  getState(): PlayerState;
  subscribe(listener: () => void): () => void;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(time: number): void;
  skip(seconds: number): void;
  setRate(rate: number): void;
}

export const PLAYBACK_RATES = [1, 1.25, 1.5, 2] as const;

export function createMockPlayer(duration: number, startAt = 0): Player {
  let state: PlayerState = { currentTime: startAt, duration, playing: false, rate: 1 };
  const listeners = new Set<() => void>();
  let raf = 0;
  let last = 0;

  const emit = () => listeners.forEach((l) => l());
  const set = (patch: Partial<PlayerState>) => {
    state = { ...state, ...patch };
    emit();
  };

  function tick(now: number) {
    const dt = (now - last) / 1000;
    last = now;
    const next = state.currentTime + dt * state.rate;
    if (next >= state.duration) {
      set({ currentTime: state.duration, playing: false });
      return;
    }
    set({ currentTime: next });
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
      set({ currentTime: Math.min(state.duration, Math.max(0, time)) });
    },
    skip(seconds) {
      player.seek(state.currentTime + seconds);
    },
    setRate(rate) {
      set({ rate });
    },
  };
  return player;
}

/** Đọc trạng thái trình phát trong component, tự vẽ lại khi thay đổi. */
export function usePlayerState(player: Player): PlayerState {
  return useSyncExternalStore(player.subscribe, player.getState, player.getState);
}
