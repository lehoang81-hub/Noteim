"use client";

import { useSyncExternalStore } from "react";
import { getFlags } from "@/lib/debug/flags";
import type { Lang, SemanticTag } from "@/lib/data/types";
import { savePhoto } from "@/lib/record/photo-store";
import { markStorageFull } from "@/lib/storage-full";

/*
 * Kho buổi ghi đang diễn ra (docs/03-screens.md mục 2, 3; issue M2-01).
 * - Một kho duy nhất cho cả ứng dụng, ngoài React: component đọc qua
 *   useRecording() (useSyncExternalStore, máy chủ luôn thấy trạng thái idle).
 * - Thời lượng đã ghi KHÔNG tính lúc tạm dừng; đồng hồ ghi chạy theo đồng hồ
 *   thật của kho (đừng dùng dataNow() — đó là ngày mẫu cố định của mockup).
 * - Âm lượng lấy mẫu mỗi 250ms do màn hình ghi đẩy vào (pushRecordingLevel)
 *   để M2-03 dựng lại dải giọng của buổi ghi.
 * - Lưu localStorage ngay khi có thay đổi (ghi chú, điểm nóng, ảnh, mẫu,
 *   trạng thái) và định kỳ mỗi 5 giây (gồm cả mảng âm lượng), để M2-03
 *   khôi phục buổi ghi dang dở sau khi tải lại trang.
 */

export type RecordingStatus = "idle" | "recording" | "paused";

export type RecordingNote = { id: string; timestamp_sec: number; text: string };
/** Góp ý vòng 1 (#75): điểm nóng gắn thêm ghi chú một dòng, rỗng là chưa gõ */
export type RecordingBookmark = { id: string; timestamp_sec: number; tag: SemanticTag | null; note: string };
export type RecordingPhoto = { id: string; timestamp_sec: number; url: string };

export type RecordingConsent = { confirmed: boolean; announced: boolean };

/** Ngôn ngữ chọn ở bảng "Bắt đầu ghi" (M6-02, issue #44) */
export type RecordingSpeech = { primary_language: Lang; auto_detect: boolean };

export type RecordingSnapshot = {
  status: RecordingStatus;
  /** Buổi ghi bị gián đoạn (tải lại hoặc đóng trang). Chỉ hiện dải báo
   * "chưa lưu xong" ở thư viện khi đúng đang bị gián đoạn, không hiện khi
   * buổi ghi đang chạy trong tab hiện tại (PR #22, lỗi 2). */
  interrupted: boolean;
  templateId: string | null;
  consent: RecordingConsent;
  /** Ngôn ngữ chính và công tắc "Có thể có tiếng khác" chọn lúc bắt đầu (M6-02) */
  speech: RecordingSpeech;
  /** Epoch ms lúc bắt đầu ghi, để đặt tên "Buổi ghi lúc 14:05". */
  startedAtClock: number | null;
  notes: RecordingNote[];
  bookmarks: RecordingBookmark[];
  photos: RecordingPhoto[];
  /** Âm lượng lấy mẫu 4 giá trị mỗi giây, 0 đến 1. */
  levels: number[];
};

const STORAGE_KEY = "noteim-recording-v1";
const LEVEL_CAP = 60_000; // khoảng 4 giờ 10 phút ở 4 mẫu/giây

const INITIAL: RecordingSnapshot = {
  status: "idle",
  interrupted: false,
  templateId: null,
  consent: { confirmed: false, announced: false },
  speech: { primary_language: "vi", auto_detect: true },
  startedAtClock: null,
  notes: [],
  bookmarks: [],
  photos: [],
  levels: [],
};

type Persisted = RecordingSnapshot & { elapsed_ms: number };

let state: RecordingSnapshot = INITIAL;
/** Thời lượng đã chốt trước đoạn đang ghi (không tính tạm dừng). */
let elapsedMs = 0;
/** Epoch ms của đoạn đang ghi; null khi tạm dừng hoặc sau khi tải lại trang. */
let segmentStart: number | null = null;
/** Âm lượng thay đổi nhưng chưa kịp lưu định kỳ. */
let levelsDirty = false;
let loaded = false;
const listeners = new Set<() => void>();

function speed(): number {
  // Cờ bảng thử nghiệm: tua nhanh đồng hồ ghi x30 (M2-02, dùng cho M2-04)
  return getFlags().recordSpeed30 ? 30 : 1;
}

function nowMs(): number {
  return typeof window === "undefined" ? 0 : Date.now();
}

function emit() {
  listeners.forEach((l) => l());
}

function setState(patch: Partial<RecordingSnapshot>) {
  state = { ...state, ...patch };
  emit();
}

function load(): void {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const parsed = JSON.parse(saved) as Persisted;
    if (!parsed || typeof parsed !== "object" || !parsed.status) return;
    elapsedMs = Math.max(0, Number(parsed.elapsed_ms) || 0);
    segmentStart = null; // tải lại trang: đoạn đang ghi bị ngắt, sang trạng thái tạm dừng
    const wasActive = parsed.status === "recording" || parsed.status === "paused";
    state = {
      status: wasActive ? "paused" : "idle",
      // Nạp lại từ localStorage nghĩa là buổi ghi đã bị gián đoạn (PR #22, lỗi 2)
      interrupted: wasActive,
      templateId: parsed.templateId ?? null,
      consent: parsed.consent ?? INITIAL.consent,
      speech: parsed.speech ?? { primary_language: "vi", auto_detect: true },
      startedAtClock: parsed.startedAtClock ?? null,
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      // Buổi ghi lưu trước khi có ghi chú điểm nóng: điền rỗng cho phần thiếu
      bookmarks: Array.isArray(parsed.bookmarks)
        ? parsed.bookmarks.map((b) => ({ ...b, note: typeof b.note === "string" ? b.note : "" }))
        : [],
      photos: Array.isArray(parsed.photos) ? parsed.photos : [],
      levels: Array.isArray(parsed.levels) ? parsed.levels : [],
    };
  } catch {
    // Dữ liệu hỏng thì bỏ, coi như chưa ghi gì
  }
}

function persist(): void {
  if (typeof window === "undefined" || state.status === "idle") return;
  try {
    // Gồm cả đoạn đang ghi, để tải lại trang không mất thời gian đã ghi.
    // Ảnh chỉ giữ id: pixel nằm ở IndexedDB (lib/record/photo-store.ts),
    // data URL cỡ trăm KB đưa vào localStorage là làm đầy bộ nhớ và mất
    // buổi ghi âm thầm (PR #22, lỗi 3).
    const payload: Persisted = {
      ...state,
      photos: state.photos.map(({ id, timestamp_sec }) => ({ id, timestamp_sec, url: "" })),
      elapsed_ms: Math.round(recordedMs()),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    levelsDirty = false;
  } catch {
    // localStorage đầy hoặc bị chặn: thay đổi chỉ còn trong bộ nhớ, báo dải
    // "Bộ nhớ đầy" thay vì mất dữ liệu im lặng (PR #22, lỗi 3)
    markStorageFull();
  }
}

/** Tổng thời lượng đã ghi tới thời điểm hiện tại (ms), không tính tạm dừng. */
function recordedMs(): number {
  const extra = segmentStart ? (nowMs() - segmentStart) * speed() : 0;
  return Math.max(0, elapsedMs + extra);
}

/** Tổng thời lượng đã ghi tới thời điểm hiện tại (giây), không tính tạm dừng. */
export function recordedSec(): number {
  return recordedMs() / 1000;
}

/* ---------- Hành động ---------- */

export function startRecording(opts: { templateId: string | null; consent: RecordingConsent; speech: RecordingSpeech }) {
  load();
  const now = nowMs();
  elapsedMs = 0;
  segmentStart = now;
  state = {
    status: "recording",
    interrupted: false,
    templateId: opts.templateId,
    consent: opts.consent,
    speech: opts.speech,
    startedAtClock: now,
    notes: [],
    bookmarks: [],
    photos: [],
    levels: [],
  };
  persist();
  emit();
}

export function pauseRecording() {
  load();
  if (state.status !== "recording") return;
  elapsedMs += segmentStart ? (nowMs() - segmentStart) * speed() : 0;
  segmentStart = null;
  setState({ status: "paused" });
  persist();
}

export function resumeRecording() {
  load();
  if (state.status !== "paused") return;
  segmentStart = nowMs();
  setState({ status: "recording" });
  persist();
}

export function setRecordingTemplate(templateId: string) {
  load();
  if (state.templateId === templateId) return;
  setState({ templateId });
  persist();
}

export function setRecordingConsent(consent: RecordingConsent) {
  load();
  setState({ consent });
  persist();
}

export function addRecordingNote(text: string) {
  load();
  const clean = text.trim();
  if (!clean) return;
  const note: RecordingNote = {
    id: `rn-${nowMs()}-${state.notes.length}`,
    timestamp_sec: Math.round(recordedSec()),
    text: clean,
  };
  setState({ notes: [...state.notes, note] });
  persist();
}

export function addRecordingBookmark(tag: SemanticTag | null) {
  load();
  const bookmark: RecordingBookmark = {
    id: `rb-${nowMs()}-${state.bookmarks.length}`,
    timestamp_sec: Math.round(recordedSec()),
    tag,
    note: "",
  };
  setState({ bookmarks: [...state.bookmarks, bookmark] });
  persist();
  return bookmark;
}

/** Ghi chú nhanh một dòng vào điểm nóng (góp ý vòng 1, #75): Enter lưu,
 * bấm vào chữ để sửa. Xóa hết chữ là bỏ ghi chú. */
export function setRecordingBookmarkNote(id: string, text: string) {
  load();
  const note = text.trim();
  if (!state.bookmarks.some((b) => b.id === id)) return;
  setState({ bookmarks: state.bookmarks.map((b) => (b.id === id ? { ...b, note } : b)) });
  persist();
}

export function addRecordingPhoto(url: string) {
  load();
  const photo: RecordingPhoto = {
    id: `rp-${nowMs()}-${state.photos.length}`,
    timestamp_sec: Math.round(recordedSec()),
    url,
  };
  setState({ photos: [...state.photos, photo] });
  // Pixel của ảnh nằm ở IndexedDB theo id; localStorage chỉ giữ id
  // (PR #22, lỗi 3). Lưu xong hay lỗi đều không cản buổi ghi.
  void savePhoto(photo.id, url);
  persist();
}

/** Màn hình ghi đẩy âm lượng vào kho mỗi 250ms; lưu định kỳ lo phần ghi đĩa. */
export function pushRecordingLevel(level: number) {
  load();
  if (state.status !== "recording") return;
  const value = Math.round(Math.min(1, Math.max(0, level)) * 100) / 100;
  state = { ...state, levels: [...state.levels, value] };
  if (state.levels.length > LEVEL_CAP) state = { ...state, levels: state.levels.slice(-LEVEL_CAP) };
  levelsDirty = true;
  emit();
}

/** Đọc dữ liệu buổi ghi đang diễn ra mà không kết thúc (dùng khi kết thúc ghi). */
export function snapshotRecording(): RecordingSnapshot & { duration_sec: number } {
  load();
  return { ...state, duration_sec: Math.round(recordedSec()) };
}

/** Dữ liệu đưa vào data.sessions.createFromRecording khi kết thúc (M2-03). */
export function endRecording(): RecordingSnapshot & { duration_sec: number } {
  load();
  const durationSec = Math.round(recordedSec());
  const finished = { ...state, duration_sec: durationSec };
  state = INITIAL;
  elapsedMs = 0;
  segmentStart = null;
  levelsDirty = false;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // bỏ qua
  }
  emit();
  return finished;
}

/** Bỏ buổi ghi dang dở (nút "Bỏ" của dải báo khôi phục). */
export function discardRecording() {
  load();
  state = INITIAL;
  elapsedMs = 0;
  segmentStart = null;
  levelsDirty = false;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // bỏ qua
  }
  emit();
}

/** Mở lại buổi ghi dang dở ở trạng thái tạm dừng, dữ liệu còn nguyên.
 * Sau khi khôi phục, buổi ghi chạy lại trong tab hiện tại nên không còn
 * coi là bị gián đoạn (PR #22, lỗi 2). */
export function restoreRecording() {
  load();
  if (state.status === "idle") return;
  segmentStart = null;
  setState({ status: "paused", interrupted: false });
  persist();
}

/** Có buổi ghi dang dở nào không (kể cả đang ghi): để thư viện hiện dải báo. */
export function hasUnfinishedRecording(): boolean {
  load();
  return state.status !== "idle";
}

/* ---------- Đăng ký ---------- */

export function subscribeRecording(listener: () => void) {
  load();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getClientSnapshot(): RecordingSnapshot {
  load();
  return state;
}

const getServerSnapshot = (): RecordingSnapshot => INITIAL;

/** Đọc trạng thái buổi ghi đang diễn ra trong component. */
export function useRecording(): RecordingSnapshot {
  return useSyncExternalStore(subscribeRecording, getClientSnapshot, getServerSnapshot);
}

/** Lưu định kỳ mỗi 5 giây và trước khi rời trang. */
if (typeof window !== "undefined") {
  load();
  window.setInterval(() => {
    if (state.status !== "idle" && (levelsDirty || segmentStart)) persist();
  }, 5000);
  window.addEventListener("pagehide", () => {
    if (state.status !== "idle") persist();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && state.status !== "idle") persist();
  });
}
