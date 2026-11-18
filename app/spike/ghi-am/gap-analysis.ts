"use client";

/*
 * Đo thời lượng từng khúc và tính khoảng trống (B0-02 bước 2, docs/10-B).
 * - Giải mã bằng OfflineAudioContext.decodeAudioData để lấy thời lượng chính
 *   xác (metadata webm thô hay ra Infinity), đồng thời không dựng AudioContext
 *   "running" nào (bài học M9, không lẫn vào nhật ký AudioContext.state).
 * - Khúc webm từ lần thứ hai không tự giải mã được vì thiếu EBML header:
 *   nối lại phần đầu của khúc đầu tiên (mọi byte trước phần tử Cluster
 *   0x1F43B675) rồi giải mã tiếp.
 * - Không giải mã được từng khúc (Safari mp4) thì chuyển cách tính tổng: thời
 *   gian thực trôi trừ tổng thời lượng của cả bản ghép, báo một dòng tổng.
 */

import type { SpikeChunk, SpikeGap } from "./chunk-store";

const CLUSTER_ID = [0x1f, 0x43, 0xb6, 0x75];
const GAP_MIN_SEC = 1; // bỏ qua hụt dưới 1 giây (nhiễu lượng tử hoá opus)

let decodeCtx: OfflineAudioContext | null = null;
function decodeContext(): OfflineAudioContext {
  if (!decodeCtx) decodeCtx = new OfflineAudioContext(1, 1, 44100);
  return decodeCtx;
}

async function decodeDuration(data: ArrayBuffer): Promise<number | null> {
  try {
    const buf = await decodeContext().decodeAudioData(data);
    return Number.isFinite(buf.duration) && buf.duration > 0 ? buf.duration : null;
  } catch {
    return null;
  }
}

/** Độ dài phần đầu file webm (mọi byte trước Cluster đầu tiên); null là không tìm thấy. */
function webmHeaderLength(firstChunk: ArrayBuffer): number | null {
  const bytes = new Uint8Array(firstChunk);
  const limit = Math.min(bytes.length, 16384);
  for (let i = 0; i + CLUSTER_ID.length <= limit; i++) {
    if (CLUSTER_ID.every((b, k) => bytes[i + k] === b)) return i;
  }
  return null;
}

export interface ChunkMeasure {
  /** Thời lượng từng khúc theo thứ tự mảng; null khi không đo được. */
  durs: (number | null)[];
  /** Tổng thời lượng của cả bản ghép; null khi không giải mã được. */
  total: number | null;
}

export async function measureChunks(chunks: SpikeChunk[]): Promise<ChunkMeasure> {
  const blobs = chunks.map((c) => c.blob);
  const total = blobs.length > 0 ? await decodeDuration(await new Blob(blobs).arrayBuffer()) : null;
  const headerLen = blobs.length > 0 ? webmHeaderLength(await blobs[0].arrayBuffer()) : null;
  const durs: (number | null)[] = [];
  for (let i = 0; i < blobs.length; i++) {
    let dur = await decodeDuration(await blobs[i].arrayBuffer());
    if (dur === null && i > 0 && headerLen !== null && headerLen > 0) {
      const head = new Uint8Array(await blobs[0].arrayBuffer()).slice(0, headerLen);
      dur = await decodeDuration(await new Blob([head, blobs[i]]).arrayBuffer());
    }
    durs.push(dur);
  }
  return { durs, total };
}

export interface GapResult {
  gaps: SpikeGap[];
  mode: "none" | "chunk" | "total" | "unknown";
  wallSec: number;
}

/**
 * So thời lượng khúc với thời gian thực. Khúc i phát gần đúng từ
 * (ts_i - dur_i) đến ts_i, vì ondataavailable phát ra ngay khi vừa encode
 * xong đúng khúc đó. Hụt là chỗ không khúc nào phủ được.
 */
export function computeGaps(
  startedAt: number,
  stoppedAt: number,
  chunks: SpikeChunk[],
  durs: (number | null)[],
  total: number | null,
): GapResult {
  const wallSec = Math.max(0, (stoppedAt - startedAt) / 1000);
  const gaps: SpikeGap[] = [];
  const allKnown = chunks.length > 0 && durs.length === chunks.length && durs.every((d) => d !== null);
  if (allKnown) {
    const leadMs = chunks[0].ts - (durs[0] as number) * 1000 - startedAt;
    if (leadMs > GAP_MIN_SEC * 1000) gaps.push({ ts: startedAt, sec: leadMs / 1000, kind: "lead" });
    for (let i = 1; i < chunks.length; i++) {
      const holeMs = chunks[i].ts - (durs[i] as number) * 1000 - chunks[i - 1].ts;
      if (holeMs > GAP_MIN_SEC * 1000) {
        gaps.push({ ts: chunks[i - 1].ts, sec: holeMs / 1000, kind: "between" });
      }
    }
    const tailMs = stoppedAt - chunks[chunks.length - 1].ts;
    if (tailMs > GAP_MIN_SEC * 1000) {
      gaps.push({ ts: chunks[chunks.length - 1].ts, sec: tailMs / 1000, kind: "tail" });
    }
    return { gaps, mode: gaps.length > 0 ? "chunk" : "none", wallSec };
  }
  if (total !== null) {
    const sec = wallSec - total;
    if (sec > GAP_MIN_SEC) gaps.push({ ts: startedAt, sec, kind: "total" });
    return { gaps, mode: gaps.length > 0 ? "total" : "none", wallSec };
  }
  return { gaps: [], mode: "unknown", wallSec };
}
