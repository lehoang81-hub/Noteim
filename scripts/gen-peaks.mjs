// Sinh dữ liệu dải giọng cho fixture từ speaker_spans, để dải giọng trông tự nhiên.
// - peaks: 600 giá trị, có khoảng lặng ngắn ở chỗ đổi người nói
// - peaks_thumb: 40 giá trị (lấy lớn nhất mỗi đoạn)
// - speaker_colors_thumb: màu người nói của 40 cột
// - headline_tag: nhãn quan trọng nhất cho hàng trong thư viện
// Chạy: node scripts/gen-peaks.mjs   (ghi đè các trường trên trong fixtures/sessions/*.json)

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = new URL("../fixtures/sessions/", import.meta.url).pathname;

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function hash(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const path = join(dir, file);
  const fx = JSON.parse(readFileSync(path, "utf8"));
  const d = fx.detail;
  const rand = seeded(hash(d.id));
  const N = 600;
  const spans = d.speaker_spans;
  const colorOf = Object.fromEntries(d.speakers.map((s) => [s.id, s.color_index]));
  const at = (t) => spans.find((s) => t >= s.start_sec && t < s.end_sec) ?? spans[spans.length - 1];

  d.peaks = Array.from({ length: N }, (_, i) => {
    const t = (i / N) * d.duration_sec;
    const near = spans.some((s) => Math.abs(t - s.start_sec) < d.duration_sec / 300);
    if (near) return 0.05;
    const wave = 0.55 + 0.25 * Math.sin(i / 7 + rand()) + 0.15 * Math.sin(i / 2.3);
    return Math.round(Math.max(0.08, Math.min(1, wave * (0.6 + rand() * 0.5))) * 100) / 100;
  });

  d.peaks_thumb = Array.from({ length: 40 }, (_, i) => {
    const slice = d.peaks.slice(Math.floor((i * N) / 40), Math.floor(((i + 1) * N) / 40));
    return Math.max(...slice);
  });
  d.speaker_colors_thumb = Array.from({ length: 40 }, (_, i) => {
    const t = ((i + 0.5) / 40) * d.duration_sec;
    return colorOf[at(t).speaker_id] ?? 0;
  });

  const open = d.action_items.filter((a) => !a.done).length;
  d.open_task_count = open;
  if (d.status !== "ready") delete d.headline_tag;
  else if (open > 0) d.headline_tag = { tag: "pending", count: open };
  else {
    const decided = d.topics.filter((t) => t.tag === "decided").length;
    if (decided > 0) d.headline_tag = { tag: "decided", count: decided };
  }

  writeFileSync(path, JSON.stringify(fx, null, 2) + "\n");
  console.log(file, "peaks", d.peaks.length, "open", open);
}
