import type { ListeningMap, ListeningPrefs } from "@/lib/data/types";

/*
 * Tiện ích nghe sạch (M8-01, docs/09-nghe-sach.md).
 * Bản đồ nghe tính trước một lần; lúc nghe chỉ đọc bản đồ để biết nhảy đâu
 * và chỉnh âm lượng bao nhiêu. File gốc không bị cắt sửa — skipping chỉ là
 * cách di chuyển kim phát.
 */

/** Khoảng cần bỏ qua khi phát (giây). */
export type SkipRange = { start: number; end: number };

/**
 * Danh sách khoảng bỏ qua theo lựa chọn của người dùng:
 * - Bỏ qua khoảng lặng: các khoảng trong bản đồ (dài hơn 1,5 giây).
 * - Bỏ qua "à, ừ": các tiếng đệm trong bản đồ.
 * Chưa bật Nghe sạch (enabled) thì không bỏ qua gì — phát đúng file gốc.
 * Các khoảng chồng lấp được gộp lại để đồng hồ chỉ nhảy một lần.
 */
export function skipsFromMap(map: ListeningMap | null | undefined, prefs: ListeningPrefs | null | undefined): SkipRange[] {
  if (!map || !prefs?.enabled) return [];
  const raw: SkipRange[] = [];
  if (prefs.skip_silence) for (const s of map.silences) raw.push({ start: s.start_sec, end: s.end_sec });
  if (prefs.skip_fillers) for (const f of map.fillers) raw.push({ start: f.start_sec, end: f.end_sec });
  raw.sort((a, b) => a.start - b.start);
  const out: SkipRange[] = [];
  for (const r of raw) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** Thời lượng nghe sạch: toàn bộ buổi trừ các khoảng đã bỏ qua. */
export function cleanDurationOf(duration: number, skips: SkipRange[]): number {
  return Math.max(0, Math.round(duration - skips.reduce((s, r) => s + (r.end - r.start), 0)));
}
