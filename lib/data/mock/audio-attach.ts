"use client";

/*
 * Chuyển kho localStorage cũ sang mốc thời gian của âm thanh thật (M9-01,
 * issue #65): ba buổi s-bds-lan, s-hop-han, s-sample-doctor được script
 * scripts/attach-test-audio.mjs đổi mốc theo truth.json của file âm thanh;
 * kho lưu trước M9 vẫn giữ mốc cũ — tự cập nhật khi nạp, giữ nguyên phần
 * người dùng đã sửa (chữ đã sửa, việc done, tên người nói...), chỉ đổi mốc
 * và dữ liệu tính từ âm thanh (peaks, bản đồ nghe).
 *
 * Ánh xạ thời gian cũ -> mới là gấp khúc tuyến tính theo keyframes sinh sẵn
 * trong fixtures/audio-attach.json (mốc đầu/cuối từng đoạn lời + biên buổi):
 * mốc trong đoạn nén theo độ dài đọc thật của đoạn đó, khoảng trống giữa hai
 * đoạn nén theo khoảng trống âm thanh, phần đuôi ngoài đoạn lời nén về hết
 * file. Cùng luật với script — tự kiểm ở script đảm bảo biên đoạn khớp.
 */

import type { SessionFixture } from "../types";

type AttachEntry = {
  audio_url: string;
  duration_sec: number;
  size_bytes: number;
  old_duration: number;
  keyframes: Array<[number, number]>;
  segments: Record<string, [number, number]>;
  speaker_spans: Array<{ speaker_id: string; start_sec: number; end_sec: number }>;
  talk_ratio: Record<string, number>;
  sample_start: Record<string, number>;
  peaks: number[];
  peaks_thumb: number[];
  speaker_colors_thumb: number[];
  listening_map: NonNullable<SessionFixture["listening_map"]>;
};

/** Nội suy gấp khúc tuyến tính: thời điểm cũ -> thời điểm trong file âm thanh. */
function mapTime(kf: Array<[number, number]>, t: number): number {
  if (t <= kf[0][0]) return kf[0][1];
  const last = kf[kf.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < kf.length; i++) {
    const [x0, y0] = kf[i - 1];
    const [x1, y1] = kf[i];
    if (t <= x1) {
      // Hai đoạn liền nhau cho hai keyframe trùng mốc cũ — mốc đó trúng cuối đoạn trước
      if (x1 === x0) return y1;
      return y0 + ((t - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return last[1];
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Áp cho một buổi: trả true nếu có đổi. */
function applyOne(fx: SessionFixture, entry: AttachEntry): boolean {
  const detail = fx.detail as SessionFixture["detail"] & { audio_url?: string | null };
  if (detail.audio_url) return false; // đã là dữ liệu M9

  detail.audio_url = entry.audio_url;
  detail.duration_sec = entry.duration_sec;
  detail.size_bytes = entry.size_bytes;
  detail.peaks = [...entry.peaks];
  detail.peaks_thumb = [...entry.peaks_thumb];
  detail.speaker_colors_thumb = [...entry.speaker_colors_thumb];
  fx.listening_map = structuredClone(entry.listening_map);

  // Mốc từng đoạn lời: khớp theo id
  for (const seg of fx.transcript ?? []) {
    const range = entry.segments[seg.id];
    if (range) {
      seg.start_sec = range[0];
      seg.end_sec = range[1];
    }
  }

  detail.speaker_spans = structuredClone(entry.speaker_spans);
  for (const sp of detail.speakers) {
    if (entry.talk_ratio[sp.id] !== undefined) sp.talk_ratio_percent = entry.talk_ratio[sp.id];
    if (entry.sample_start[sp.id] !== undefined) sp.sample_start_sec = entry.sample_start[sp.id];
  }

  const mapBulletTs = <T extends { timestamp_sec: number }>(list: T[]) =>
    list.map((b) => ({ ...b, timestamp_sec: r1(mapTime(entry.keyframes, b.timestamp_sec)) }));
  for (const tp of detail.topics) {
    tp.start_sec = r1(mapTime(entry.keyframes, tp.start_sec));
    tp.end_sec = r1(mapTime(entry.keyframes, tp.end_sec));
    tp.bullets = mapBulletTs(tp.bullets);
    if (tp.figure) tp.figure = { ...tp.figure, source_timestamp_sec: r1(mapTime(entry.keyframes, tp.figure.source_timestamp_sec)) };
  }
  for (const a of detail.action_items) {
    if (a.timestamp_sec != null) a.timestamp_sec = r1(mapTime(entry.keyframes, a.timestamp_sec));
  }
  for (const n of detail.notes) n.timestamp_sec = r1(mapTime(entry.keyframes, n.timestamp_sec));
  for (const b of detail.bookmarks) b.timestamp_sec = r1(mapTime(entry.keyframes, b.timestamp_sec));
  for (const p of detail.photos) p.timestamp_sec = r1(mapTime(entry.keyframes, p.timestamp_sec));

  // Trích dẫn Hỏi AI: cả lịch sử trong fixture lẫn log phát sinh khi dùng
  for (const ch of (fx as { chat?: Array<{ citations: number[] }> }).chat ?? []) {
    ch.citations = ch.citations.map((c) => r1(mapTime(entry.keyframes, c)));
  }
  for (const ch of (fx as { chat_log?: Array<{ citations: Array<{ timestamp_sec: number }> }> }).chat_log ?? []) {
    for (const c of ch.citations) c.timestamp_sec = r1(mapTime(entry.keyframes, c.timestamp_sec));
  }

  // Các bản tóm tắt dịch (M6-03): ý và mốc trong bản dịch cũng đổi theo
  for (const v of (fx as { summary_versions?: SessionFixture["summary_versions"] }).summary_versions ?? []) {
    for (const tp of v.topics) {
      tp.start_sec = r1(mapTime(entry.keyframes, tp.start_sec));
      tp.end_sec = r1(mapTime(entry.keyframes, tp.end_sec));
      tp.bullets = mapBulletTs(tp.bullets);
    }
  }
  return true;
}

/**
 * Chạy một lần khi nạp kho (store.ensureDb): chuyển 3 buổi có âm thanh thật
 * trong thư viện, bản đã xóa và buổi mẫu theo nghề. Trả true nếu kho đổi.
 */
export async function applyAudioAttach(db: { sessions: SessionFixture[]; removed?: SessionFixture[]; samples?: SessionFixture[] }): Promise<boolean> {
  const mod = await import("@/fixtures/audio-attach.json");
  const attach = mod.default as unknown as Record<string, AttachEntry>;
  let changed = false;
  for (const fx of [...(db.sessions ?? []), ...(db.removed ?? []), ...(db.samples ?? [])]) {
    const entry = attach[(fx.detail as { id?: string }).id ?? ""];
    if (entry && applyOne(fx, entry)) changed = true;
  }
  return changed;
}
