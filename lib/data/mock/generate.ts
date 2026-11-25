import type { RecordingDraft } from "../repository";
import type { ActionItem, Note, SemanticTag, Speaker, Template, Topic, BookmarkData, Photo } from "../types";

type SpeakerSpan = { speaker_id: string; start_sec: number; end_sec: number };

/*
 * Sinh nội dung cho buổi ghi mới khi xử lý xong (issue M2-03):
 * - peaks lấy từ mảng âm lượng đã ghi, gom về 600 cột cho trình phát và 40
 *   cột cho hàng thư viện; chưa đủ dữ liệu thì sinh dải sóng giống
 *   scripts/gen-peaks.mjs.
 * - Hai người nói: "Bạn" và "Người nói 2" chưa đặt tên (display_name null —
 *   nhãn hiển thị sinh lúc vẽ theo ngôn ngữ, M5 sửa review #41 mục 5),
 *   lượt nói xen kẽ.
 * - executive_summary và chủ đề lấy theo mẫu đã chọn, mỗi phần đang bật của
 *   mẫu có một chủ đề với hai ý, mốc thời gian rải đều trên thời lượng.
 *   Góp ý vòng 1 (#75): có điểm nóng thì mỗi điểm nóng chèn một ý tại đúng
 *   mốc của nó vào chủ đề chứa mốc, chủ đề mang nhãn màu của điểm nóng —
 *   điểm nóng và ghi chú nhanh làm khung cho tóm tắt.
 * - Ghi chú tay gắn vào ý có mốc gần nhất (note_ids); ghi chú nhanh của
 *   điểm nóng cũng là ghi chú tay.
 */

type GeneratedProfession = {
  executive_summary: string;
  sections: Record<string, { tag: string; title: string; bullets: string[] }>;
  tasks: Array<{ task: string; priority: string }>;
};

/* Nội dung theo nghề nạp bằng import() động (M5, sửa review PR #41 mục 2):
 * JSON sinh nội dung không nằm trong chunk khởi tạo, chỉ tải khi một buổi ghi
 * mới xử lý xong lần đầu. */
type GeneratedProfessionLoader = () => Promise<{ default: GeneratedProfession }>;

const BY_PROFESSION_SOURCE: Record<string, GeneratedProfessionLoader> = {
  business_owner: () => import("@/fixtures/generated/business_owner.json"),
  doctor: () => import("@/fixtures/generated/doctor.json"),
  lawyer: () => import("@/fixtures/generated/lawyer.json"),
  realestate_sales: () => import("@/fixtures/generated/realestate_sales.json"),
  architect: () => import("@/fixtures/generated/architect.json"),
  notary: () => import("@/fixtures/generated/notary.json"),
};

const generatedCache = new Map<string, GeneratedProfession>();

async function professionData(key: string): Promise<GeneratedProfession> {
  const cached = generatedCache.get(key);
  if (cached) return cached;
  const mod = await (BY_PROFESSION_SOURCE[key] ?? BY_PROFESSION_SOURCE.realestate_sales)();
  generatedCache.set(key, mod.default);
  return mod.default;
}

const PEAK_COUNT = 600;
const THUMB_COUNT = 40;
// C1-05: luồng nội dung thật tái dùng hai hàm thuần này cho dải giọng của
// băng trên R2 (không đổi hành vi của luồng mockup).
export { PEAK_COUNT, THUMB_COUNT, resampleMax, fallbackPeaks };

function seeded(seedText: string): () => number {
  let s = 2166136261;
  for (const c of seedText) s = Math.imul(s ^ c.charCodeAt(0), 16777619);
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Gom mảng về đúng số cột, lấy giá trị lớn nhất mỗi đoạn. */
function resampleMax(values: number[], count: number): number[] {
  if (count <= 0 || values.length === 0) return [];
  const out = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    const from = Math.floor((i * values.length) / count);
    const to = Math.max(from + 1, Math.floor(((i + 1) * values.length) / count));
    let max = 0;
    for (let j = from; j < to; j++) max = Math.max(max, values[j] ?? 0);
    out[i] = max;
  }
  return out;
}

/** Dải sóng dự phòng khi không ghi được đủ âm lượng (giống gen-peaks.mjs). */
function fallbackPeaks(durationSec: number, seedText: string): number[] {
  const rand = seeded(seedText);
  return Array.from({ length: PEAK_COUNT }, (_, i) => {
    const wave = 0.55 + 0.25 * Math.sin(i / 7 + rand()) + 0.15 * Math.sin(i / 2.3);
    return Math.round(Math.max(0.08, Math.min(1, wave * (0.6 + rand() * 0.5))) * 100) / 100;
  });
}

/** Lượt nói xen kẽ giữa người dùng và người nói 2 chưa đặt tên, mỗi lượt 18 đến 45 giây. */
function buildSpans(durationSec: number, seedText: string): SpeakerSpan[] {
  const rand = seeded("spans:" + seedText);
  const spans: SpeakerSpan[] = [];
  let t = 0;
  let turn = 0;
  while (t < durationSec) {
    const len = Math.min(durationSec - t, 18 + rand() * 27);
    spans.push({ speaker_id: turn % 2 === 0 ? "SPK_01" : "SPK_02", start_sec: Math.round(t), end_sec: Math.round(t + len) });
    t += len;
    turn++;
  }
  if (spans.length && spans[spans.length - 1].end_sec < durationSec) {
    spans[spans.length - 1].end_sec = Math.round(durationSec);
  }
  return spans;
}

export type BuiltContent = {
  executive_summary: string;
  speakers: Speaker[];
  speaker_spans: SpeakerSpan[];
  topics: Topic[];
  action_items: ActionItem[];
  notes: Note[];
  bookmarks: BookmarkData[];
  photos: Photo[];
  peaks: number[];
  peaks_thumb: number[];
  speaker_colors_thumb: number[];
  headline_tag?: { tag: SemanticTag; count: number };
  open_task_count: number;
};

export async function buildSessionContent(opts: {
  sessionId: string;
  draft: RecordingDraft;
  template?: Template;
  /** Ngày tạo buổi ghi, để tính hạn của việc cần làm */
  createdAt: string;
}): Promise<BuiltContent> {
  const { sessionId, draft, template } = opts;
  const duration = Math.max(1, Math.round(draft.duration_sec));

  /* Dải giọng theo âm lượng đã ghi; thiếu dữ liệu thì sinh dự phòng */
  const peaks =
    draft.levels.length >= 12 ? resampleMax(draft.levels, PEAK_COUNT) : fallbackPeaks(duration, sessionId);
  const peaksThumb = resampleMax(peaks, THUMB_COUNT);

  /* Hai người nói */
  const speakers: Speaker[] = [
    { id: "SPK_01", contact_id: "c-me", display_name: null, is_me: true, color_index: 0, talk_ratio_percent: 56, sample_start_sec: Math.min(5, duration) },
    { id: "SPK_02", contact_id: null, display_name: null, is_me: false, color_index: 1, talk_ratio_percent: 44, sample_start_sec: Math.min(Math.round(duration * 0.35), duration) },
  ];
  const spans = buildSpans(duration, sessionId);
  const colorAt = (t: number) => {
    const span = spans.find((s) => t >= s.start_sec && t < s.end_sec) ?? spans[spans.length - 1];
    return span && span.speaker_id === "SPK_02" ? 1 : 0;
  };
  const speakerColorsThumb = Array.from({ length: THUMB_COUNT }, (_, i) => colorAt(((i + 0.5) / THUMB_COUNT) * duration));

  /* Nội dung theo mẫu của nghề */
  const generated = await professionData(template?.profession ?? "realestate_sales");
  const enabled = (template?.sections ?? []).filter((s) => s.enabled);
  const sections = enabled.length ? enabled : (template?.sections ?? []).slice(0, 3);

  const topics: Topic[] = sections.map((section, i) => {
    const content = generated.sections[section.id];
    const slotStart = (duration / sections.length) * i;
    const slotEnd = (duration / sections.length) * (i + 1);
    const start = Math.round(slotStart + (slotEnd - slotStart) * 0.08);
    const end = Math.round(slotEnd - (slotEnd - slotStart) * 0.08);
    const bullets = (content?.bullets ?? [section.title]).slice(0, 2).map((text, j) => ({
      id: `b-${i}-${j}`,
      text,
      timestamp_sec: Math.min(duration, Math.round(start + (end - start) * (j === 0 ? 0.25 : 0.7))),
      speaker_id: j % 2 === 0 ? "SPK_01" : "SPK_02",
      is_quote: false,
      edited: false,
      note_ids: [] as string[],
    }));
    return {
      id: `t-${i}`,
      section_id: section.id,
      title: content?.title ?? section.title,
      start_sec: start,
      end_sec: end,
      tag: (content?.tag ?? "pending") as SemanticTag,
      bullets,
    };
  });

  /* Ghi chú tay: gắn vào ý có mốc gần nhất */
  const notes: Note[] = draft.notes.map((n, i) => ({ id: `n-${i}`, timestamp_sec: n.timestamp_sec, text: n.text }));
  for (const note of notes) {
    let best: { bullet: Topic["bullets"][number]; dist: number } | null = null;
    for (const topic of topics) {
      for (const bullet of topic.bullets) {
        const dist = Math.abs(bullet.timestamp_sec - note.timestamp_sec);
        if (!best || dist < best.dist) best = { bullet, dist };
      }
    }
    best?.bullet.note_ids.push(note.id);
  }

  /* Điểm nóng và ảnh giữ nguyên mốc; ghi chú nhanh của điểm nóng đi cùng */
  const bookmarks: BookmarkData[] = draft.bookmarks.map((b, i) => ({
    id: `m-${i}`,
    timestamp_sec: b.timestamp_sec,
    tag: (b.tag as SemanticTag | null) ?? null,
    note: b.note ?? "",
  }));

  /* Góp ý vòng 1 (#75): điểm nóng và ghi chú nhanh làm khung tóm tắt.
   * Mỗi điểm nóng gắn vào chủ đề chứa mốc của nó: chủ đề mang nhãn màu của
   * điểm nóng, dải thời gian ôm cả mốc, và chữ ghi chú nhanh trở thành một ý
   * tại đúng mốc đó (kèm ghi chú tay như ghi chú thường). Buổi không có
   * điểm nóng thì tóm tắt giữ nguyên theo mẫu như trước. */
  const markerNotes: Note[] = [];
  draft.bookmarks.forEach((b, i) => {
    const text = (b.note ?? "").trim();
    if (text) markerNotes.push({ id: `n-m-${i}`, timestamp_sec: b.timestamp_sec, text });
  });
  for (const bookmark of bookmarks) {
    let target = topics.find((tp) => bookmark.timestamp_sec >= tp.start_sec && bookmark.timestamp_sec <= tp.end_sec);
    if (!target && topics.length) {
      target = topics.reduce((best, tp) => {
        const distOf = (topic: Topic) =>
          Math.min(Math.abs(bookmark.timestamp_sec - topic.start_sec), Math.abs(bookmark.timestamp_sec - topic.end_sec));
        return distOf(tp) < distOf(best) ? tp : best;
      });
    }
    if (!target) continue;
    if (bookmark.tag) target.tag = bookmark.tag;
    target.start_sec = Math.min(target.start_sec, bookmark.timestamp_sec);
    target.end_sec = Math.max(target.end_sec, bookmark.timestamp_sec);
    const markerNote = markerNotes.find((n) => n.timestamp_sec === bookmark.timestamp_sec);
    if (markerNote) {
      const bullet = {
        id: `b-m-${markerNote.id}`,
        text: markerNote.text,
        timestamp_sec: bookmark.timestamp_sec,
        speaker_id: "SPK_01",
        is_quote: false,
        edited: false,
        note_ids: [markerNote.id],
      };
      // Chèn đúng chỗ giữ các ý xếp theo mốc thời gian tăng dần
      const at = target.bullets.findIndex((x) => x.timestamp_sec > bookmark.timestamp_sec);
      if (at === -1) target.bullets.push(bullet);
      else target.bullets.splice(at, 0, bullet);
    }
  }
  // Ghi chú của điểm nóng cũng là ghi chú tay của buổi: hiện ở mọi chỗ ghi chú hiện
  notes.push(...markerNotes);
  const photos: Photo[] = draft.photos.map((p) => ({ id: p.id, timestamp_sec: p.timestamp_sec, url: p.url }));

  /* Một đến hai việc cần làm, một việc "Chưa giao" */
  const actionItems: ActionItem[] = generated.tasks.slice(0, 2).map((task, i) => {
    const assigned = i === 1;
    const dueMs = Date.parse(opts.createdAt) + 2 * 86400_000;
    return {
      id: `a-${i}`,
      session_id: sessionId,
      task: task.task,
      assignee_contact_id: assigned ? "c-me" : null,
      due_date: assigned ? new Date(dueMs).toISOString().slice(0, 10) : null,
      priority: (task.priority === "high" || task.priority === "low" ? task.priority : "medium") as "high" | "medium" | "low",
      done: false,
      done_at: null,
      source_quote: null,
      timestamp_sec: Math.min(duration, Math.round((duration / (generated.tasks.length + 1)) * (i + 1))),
    };
  });

  const openTaskCount = actionItems.filter((a) => !a.done).length;
  const headlineTag =
    openTaskCount > 0
      ? ({ tag: "pending", count: openTaskCount } as { tag: SemanticTag; count: number })
      : topics.some((t) => t.tag === "decided")
        ? ({ tag: "decided", count: topics.filter((t) => t.tag === "decided").length } as { tag: SemanticTag; count: number })
        : undefined;

  return {
    executive_summary: generated.executive_summary,
    speakers,
    speaker_spans: spans,
    topics,
    action_items: actionItems,
    notes,
    bookmarks,
    photos,
    peaks,
    peaks_thumb: peaksThumb,
    speaker_colors_thumb: speakerColorsThumb,
    headline_tag: headlineTag,
    open_task_count: openTaskCount,
  };
}
