/* Dải giọng mẫu cho trang trưng bày: 40 cột, ba người nói. */
export const sampleRibbon = {
  peaks: [
    0.35, 0.6, 0.85, 0.5, 0.7, 0.95, 0.4, 0.55, 0.3, 0.75, 0.9, 0.6, 0.45, 0.8, 0.5, 0.25, 0.65, 0.85, 1, 0.7,
    0.5, 0.35, 0.6, 0.8, 0.55, 0.4, 0.7, 0.9, 0.65, 0.3, 0.5, 0.75, 0.95, 0.6, 0.45, 0.7, 0.55, 0.35, 0.6, 0.4,
  ],
  speakers: Array.from({ length: 40 }, (_, i) => (i < 13 ? 0 : i < 22 ? 1 : i < 26 ? 2 : i < 34 ? 0 : 1)),
};

/* Buổi ghi mẫu cho trình phát: 42 phút 10 giây, ba người nói. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const DURATION = 2530;
const rand = seeded(7);

export const sampleSpans = [
  { speaker: 0, start: 0, end: 180 },
  { speaker: 1, start: 180, end: 520 },
  { speaker: 0, start: 520, end: 700 },
  { speaker: 2, start: 700, end: 860 },
  { speaker: 1, start: 860, end: 1300 },
  { speaker: 0, start: 1300, end: 1620 },
  { speaker: 1, start: 1620, end: 1980 },
  { speaker: 2, start: 1980, end: 2140 },
  { speaker: 0, start: 2140, end: DURATION },
];

/* 600 giá trị, có khoảng lặng ngắn ở chỗ đổi người nói. */
export const samplePeaks = Array.from({ length: 600 }, (_, i) => {
  const t = (i / 600) * DURATION;
  const nearTurn = sampleSpans.some((s) => Math.abs(t - s.start) < 6);
  if (nearTurn) return 0.05;
  const wave = 0.55 + 0.25 * Math.sin(i / 7) + 0.15 * Math.sin(i / 2.3);
  return Math.max(0.08, Math.min(1, wave * (0.6 + rand() * 0.5)));
});

export const sampleBookmarks = [
  { time: 192, tag: null },
  { time: 270, tag: "decided" as const },
  { time: 665, tag: "risk" as const },
  { time: 1660, tag: "idea" as const },
];

export const sampleHeat = [
  { start: 0, end: 520, tag: "decided" as const },
  { start: 520, end: 860, tag: "risk" as const },
  { start: 860, end: 1620, tag: "figure" as const },
  { start: 1620, end: 1980, tag: "idea" as const },
  { start: 1980, end: DURATION, tag: "pending" as const },
];

export const sampleDuration = DURATION;
