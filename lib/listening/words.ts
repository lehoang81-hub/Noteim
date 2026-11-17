/*
 * Mốc thời gian từng chữ cho "chữ chạy theo tiếng" (M8-01, docs/09).
 * Mockup chưa có mốc thật từ AI: chia đều thời lượng đoạn theo số ký tự
 * (mỗi từ chiếm phần thời gian tỉ lệ với độ dài của nó, kể một dấu cách).
 * Hàm riêng để sau này thay bằng mốc thật (`TranscriptSegment.words`) mà
 * không phải sửa giao diện.
 */

export type WordTiming = {
  w: string;
  /** Giây bắt đầu/kết thúc của từ, trỏ về file gốc */
  start: number;
  end: number;
  /** Vị trí ký tự trong câu, để ghép với tô sáng tìm kiếm và tiếng đệm */
  charStart: number;
  charEnd: number;
};

/** Trạng thái của một từ so với thời điểm đang phát. */
export type WordState = "read" | "reading" | "unread";

export function wordTimings(text: string, startSec: number, endSec: number): WordTiming[] {
  if (endSec <= startSec) return [];
  const matches = [...text.matchAll(/\S+/g)];
  if (!matches.length) return [];
  const total = Math.max(1, text.length);
  const span = endSec - startSec;
  const out: WordTiming[] = [];
  for (const m of matches) {
    const charStart = m.index;
    const charEnd = m.index + m[0].length;
    // Khối lượng của từ gồm cả dấu cách phía sau để liền mạch, không hở thời gian
    const weight = charEnd - charStart + (charEnd < text.length ? 1 : 0);
    const start = startSec + (charStart / total) * span;
    const end = startSec + ((charStart + weight) / total) * span;
    out.push({ w: m[0], start, end, charStart, charEnd });
  }
  return out;
}

export function wordStateAt(w: WordTiming, t: number): WordState {
  if (t >= w.end) return "read";
  if (t >= w.start) return "reading";
  return "unread";
}
