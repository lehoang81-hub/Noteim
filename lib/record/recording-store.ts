"use client";

import { useSyncExternalStore } from "react";
import { getFlags } from "@/lib/debug/flags";
import type { Lang, SemanticTag } from "@/lib/data/types";
import { savePhoto } from "@/lib/record/photo-store";
import { markStorageFull } from "@/lib/storage-full";
import type { GapCheckResult } from "@/lib/gap-check/types";

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
export type RecordingBookmark = { id: string; timestamp_sec: number; tag: SemanticTag | null };
export type RecordingPhoto = { id: string; timestamp_sec: number; url: string };

export type RecordingConsent = { confirmed: boolean; announced: boolean };

/** Ngôn ngữ chọn ở bảng "Bắt đầu ghi" (M6-02, issue #44) */
export type RecordingSpeech = { primary_language: Lang; auto_detect: boolean };

/** Thư mục chọn lúc bắt đầu ghi (GC-05, đặc tả v1.1 §4.7): buổi lưu xong
 * được ghi vào session_ids của thư mục này. */
type RecordingFolder = string | null;

/** Đoạn lời thoại nhận dạng được gắn mốc thời gian của buổi đang ghi (GC-03).
 * Nguồn nối vào bằng addRecordingTranscript: hiện tại là kịch bản demo B4,
 * sau này là ASR sống (B0) — giao diện Gap Check không cần đổi. */
export type RecordingTranscriptSegment = { id: string; timestamp_sec: number; text: string };

/** Kết quả rà thiếu gần nhất của buổi đang ghi (GC-04, đặc tả v1.1 §4.5).
 * Mỗi lượt rà mới đè kết quả cũ; kết thúc ghi đi kèm buổi để màn chi tiết
 * dựng checklist "Cần bổ sung sau buổi". */
export type RecordingGapCheck = { templateId: string; checkedAtMs: number; result: GapCheckResult };

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
  /** Thư mục chọn lúc bắt đầu ghi (GC-05); null là không thuộc thư mục nào */
  folderId: RecordingFolder;
  /** Epoch ms lúc bắt đầu ghi, để đặt tên "Buổi ghi lúc 14:05". */
  startedAtClock: number | null;
  notes: RecordingNote[];
  bookmarks: RecordingBookmark[];
  photos: RecordingPhoto[];
  /** Lời thoại nhận dạng được trong buổi (GC-03 — Gap Check rà thiếu);
   * không hiện lên màn hình ghi, chỉ phục vụ rà thiếu và lưu kèm buổi. */
  transcript: RecordingTranscriptSegment[];
  /** Kết quả rà thiếu gần nhất (GC-04) — lưu kèm buổi khi kết thúc ghi. */
  gapCheck: RecordingGapCheck | null;
  /** Câu hỏi bấm "Hỏi AI trên thư mục" từ sheet rà thiếu (GC-04, đặc tả
   * v1.1 §4.3, §4.5); sau khi lưu buổi nằm chờ trong tab Hỏi AI của buổi. */
  askAiQuestions: string[];
  /** Âm lượng lấy mẫu 4 giá trị mỗi giây, 0 đến 1. */
  levels: number[];
};

const STORAGE_KEY = "noteim-recording-v1";
const LEVEL_CAP = 60_000; // khoảng 4 giờ 10 phút ở 4 mẫu/giây
const TRANSCRIPT_CAP = 800; // đủ cho 8.000 ký tự gần nhất (đặc tả Gap Check §3)

const INITIAL: RecordingSnapshot = {
  status: "idle",
  interrupted: false,
  templateId: null,
  consent: { confirmed: false, announced: false },
  speech: { primary_language: "vi", auto_detect: true },
  folderId: null,
  startedAtClock: null,
  notes: [],
  bookmarks: [],
  photos: [],
  transcript: [],
  gapCheck: null,
  askAiQuestions: [],
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
      folderId: typeof parsed.folderId === "string" ? parsed.folderId : null,
      startedAtClock: parsed.startedAtClock ?? null,
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
      photos: Array.isArray(parsed.photos) ? parsed.photos : [],
      transcript: Array.isArray(parsed.transcript) ? parsed.transcript : [],
      gapCheck: parsed.gapCheck ?? null,
      askAiQuestions: Array.isArray(parsed.askAiQuestions) ? parsed.askAiQuestions : [],
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

export function startRecording(opts: {
  templateId: string | null;
  consent: RecordingConsent;
  speech: RecordingSpeech;
  /** Thư mục chọn ở bảng bắt đầu ghi (GC-05) */
  folderId?: string | null;
}) {
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
    folderId: opts.folderId ?? null,
    startedAtClock: now,
    notes: [],
    bookmarks: [],
    photos: [],
    transcript: [],
    gapCheck: null,
    askAiQuestions: [],
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
  };
  setState({ bookmarks: [...state.bookmarks, bookmark] });
  persist();
  return bookmark;
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

/** Nối đoạn lời thoại mới nhận dạng được (GC-03, đặc tả v1.1 §3).
 * Mỗi đoạn gắn mốc thời gian của đồng hồ ghi lúc gọi; giữ tối đa 800 đoạn
 * gần nhất để localStorage không phình to. Ghi chú, điểm nóng không đụng tới. */
export function addRecordingTranscript(segments: string[]) {
  load();
  if (state.status === "idle") return;
  const clean = segments.map((text) => text.trim()).filter(Boolean);
  if (!clean.length) return;
  const sec = Math.round(recordedSec());
  const base = state.transcript.length;
  const fresh: RecordingTranscriptSegment[] = clean.map((text, i) => ({
    id: `rt-${nowMs()}-${base + i}`,
    timestamp_sec: sec,
    text,
  }));
  const next = [...state.transcript, ...fresh];
  setState({ transcript: next.length > TRANSCRIPT_CAP ? next.slice(-TRANSCRIPT_CAP) : next });
  persist();
}

/** Ghi nhận kết quả của một lượt rà vừa xong (GC-04); lượt rà mới đè lượt cũ
 * — checklist ở màn chi tiết sinh từ lần rà gần nhất (đặc tả v1.1 §4.5). */
export function setRecordingGapCheck(gc: RecordingGapCheck) {
  load();
  if (state.status === "idle") return;
  setState({ gapCheck: gc });
  persist();
}

/** Đưa một câu hỏi vào hàng chờ Hỏi AI trên thư mục (GC-04). Trùng thì bỏ
 * qua; giữ tối đa 9 câu gần nhất để không phình localStorage. */
export function addRecordingAskAiQuestion(question: string) {
  load();
  if (state.status === "idle") return;
  const clean = question.trim();
  if (!clean || state.askAiQuestions.includes(clean)) return;
  const next = [...state.askAiQuestions, clean];
  setState({ askAiQuestions: next.length > 9 ? next.slice(-9) : next });
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
