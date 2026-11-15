"use client";

import { Download, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatClock, resample, tokenColor, useThemeKey } from "@/components/ribbon/draw";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { SessionDetail } from "@/lib/data";

/*
 * Thẻ trích dẫn (docs/03-screens.md mục 9, issue M4-01):
 * ảnh dọc 1080 x 1350 vẽ bằng canvas: câu nói, tên người nói, dải giọng của
 * đúng đoạn đó, logo nhỏ. Ba kiểu nền: sứ, chàm đêm, Hừng đông.
 * Màu đọc từ token, không viết cứng: kiểu "chàm đêm" đọc token từ một phần tử
 * ẩn mang class .dark để đúng bộ màu ban đêm.
 */

export type QuoteCardStyle = "porcelain" | "midnight" | "dawn";

export type QuoteContent = {
  text: string;
  speakerName: string;
  speakerColorIndex: number;
  startSec: number;
  endSec: number;
};

const CARD_W = 1080;
const CARD_H = 1350;

/** Phần tử ẩn ép .dark để đọc token ban đêm cho kiểu "chàm đêm". */
function probeEl(dark: boolean): HTMLElement {
  const el = document.createElement("div");
  if (dark) el.className = "dark";
  el.style.position = "absolute";
  el.style.visibility = "hidden";
  document.body.appendChild(el);
  return el;
}

/** "--gradient-dawn: linear-gradient(100deg, #ff8a4c 0%, ...)" -> ba mã màu. */
function gradientStops(value: string): string[] {
  return [...value.matchAll(/#[0-9a-fA-F]{3,8}/g)].map((m) => m[0]);
}

type Palette = {
  bg: string | CanvasGradient;
  ink: string;
  sub: string;
  accent: string;
  bar: (i: number) => string;
};

function paletteFor(style: QuoteCardStyle, host: Element): Palette {
  if (style === "dawn") {
    // Nền gradient Hừng đông: dựng canvas tạm để tạo CanvasGradient cùng kích thước thẻ
    const stops = gradientStops(tokenColor(host, "--gradient-dawn"));
    const probe = document.createElement("canvas");
    probe.width = CARD_W;
    probe.height = CARD_H;
    const pctx = probe.getContext("2d");
    let bg: string | CanvasGradient = stops[0] ?? tokenColor(host, "--dawn-pink");
    if (pctx && stops.length >= 2) {
      const lg = pctx.createLinearGradient(0, 0, CARD_W, CARD_H);
      stops.forEach((c, i) => lg.addColorStop(i / (stops.length - 1), c));
      bg = lg;
    }
    const onDawn = tokenColor(host, "--on-dawn");
    return { bg, ink: onDawn, sub: onDawn, accent: onDawn, bar: () => onDawn };
  }
  if (style === "midnight") {
    const el = probeEl(true);
    try {
      return {
        bg: tokenColor(el, "--bg"),
        ink: tokenColor(el, "--ink"),
        sub: tokenColor(el, "--ink-2"),
        accent: tokenColor(el, "--sen"),
        bar: (i) => tokenColor(el, `--speaker-${(i % 6) + 1}`),
      };
    } finally {
      el.remove();
    }
  }
  return {
    bg: tokenColor(host, "--bg"),
    ink: tokenColor(host, "--ink"),
    sub: tokenColor(host, "--ink-2"),
    accent: tokenColor(host, "--sen"),
    bar: (i) => tokenColor(host, `--speaker-${(i % 6) + 1}`),
  };
}

/** Gói văn bản thành các dòng theo bề ngang cho trước. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Cắt peaks theo mốc giây của buổi ghi. */
function slicePeaks(peaks: number[], startSec: number, endSec: number, durationSec: number): number[] {
  if (!peaks.length) return [];
  const duration = Math.max(1, durationSec);
  const from = Math.min(peaks.length - 1, Math.max(0, Math.round((startSec / duration) * peaks.length)));
  const to = Math.min(peaks.length, Math.max(from + 1, Math.round((endSec / duration) * peaks.length)));
  return peaks.slice(from, to);
}

export function drawQuoteCard(
  canvas: HTMLCanvasElement,
  opts: {
    quote: QuoteContent;
    peaks: number[];
    speakerSpans: Array<{ speaker_id: string; start_sec: number; end_sec: number }>;
    speakers: Array<{ id: string; color_index: number }>;
    sessionDurationSec: number;
    style: QuoteCardStyle;
    shareLabel: string;
    quoteLabel: string;
  },
) {
  const { quote, peaks, speakerSpans, speakers, sessionDurationSec, style, shareLabel, quoteLabel } = opts;
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const palette = paletteFor(style, canvas);
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const M = 96; // lề

  /* Nhãn nhỏ phía trên */
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = "600 28px 'Be Vietnam Pro', sans-serif";
  ctx.fillStyle = palette.accent;
  ctx.fillText(quoteLabel, M, 168);

  /* Bố cục đáy thẻ: dải giọng -> mốc thời gian -> tên người nói -> logo */
  const RIBBON_MID = CARD_H - 430;
  const SPEAKER_Y = CARD_H - 218;
  const LOGO_MID = CARD_H - 118;

  /* Dải giọng của đúng đoạn: cắt peaks theo mốc, màu theo người nói */
  const ribbons = resample(slicePeaks(peaks, quote.startSec, quote.endSec, sessionDurationSec), 44);
  const colorIdAt = (t: number) => {
    const hit = speakerSpans.find((s) => t >= s.start_sec && t < s.end_sec);
    return speakers.find((s) => s.id === hit?.speaker_id)?.color_index ?? 0;
  };
  const BAR_W = 8;
  const STEP = BAR_W + 6;
  ribbons.forEach((v, i) => {
    const h = Math.max(BAR_W, v * 96);
    ctx.fillStyle = palette.bar(colorIdAt(quote.startSec + (i / ribbons.length) * (quote.endSec - quote.startSec)));
    ctx.beginPath();
    ctx.roundRect(M + i * STEP, RIBBON_MID - h / 2, BAR_W, h, BAR_W / 2);
    ctx.fill();
  });

  /* Mốc thời gian của đoạn, dưới dải giọng */
  ctx.font = "500 30px 'Be Vietnam Pro', sans-serif";
  ctx.fillStyle = palette.sub;
  ctx.fillText(`${formatClock(quote.startSec)} – ${formatClock(quote.endSec)}`, M, RIBBON_MID + 88);

  /* Tên người nói */
  ctx.font = "600 34px 'Be Vietnam Pro', sans-serif";
  ctx.fillStyle = palette.accent;
  ctx.fillText(quote.speakerName, M, SPEAKER_Y);

  /* Logo nhỏ + nhãn ứng dụng ở đáy thẻ */
  const lg = ctx.createLinearGradient(M, LOGO_MID - 24, M + 48, LOGO_MID + 24);
  const dawnStops = gradientStops(tokenColor(canvas, "--gradient-dawn"));
  dawnStops.forEach((c, i) => lg.addColorStop(i / Math.max(1, dawnStops.length - 1), c));
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.roundRect(M, LOGO_MID - 24, 48, 48, 24);
  ctx.fill();
  ctx.font = "600 30px 'Bricolage Grotesque', 'Be Vietnam Pro', sans-serif";
  ctx.fillStyle = palette.sub;
  ctx.fillText(shareLabel, M + 66, LOGO_MID + 11);

  /* Câu nói: tự xuống dòng, tự giảm cỡ, canh giữa khối trống phía trên dải giọng */
  const maxTextW = CARD_W - M * 2;
  const blockTop = 240;
  const blockBottom = RIBBON_MID - 140;
  let size = 76;
  let lines: string[] = [];
  for (; size >= 40; size -= 4) {
    ctx.font = `600 ${size}px 'Be Vietnam Pro', sans-serif`;
    lines = wrapText(ctx, quote.text, maxTextW);
    if (lines.length * size * 1.32 <= blockBottom - blockTop) break;
  }
  ctx.font = `600 ${size}px 'Be Vietnam Pro', sans-serif`;
  const lh = size * 1.32;
  const startY = blockTop + Math.max(0, (blockBottom - blockTop - lines.length * lh) / 2);
  ctx.fillStyle = palette.ink;
  ctx.textBaseline = "top";
  let y = startY;
  for (const line of lines) {
    ctx.fillText(line, M, y);
    y += lh;
  }
  ctx.textBaseline = "alphabetic";
}

export function QuoteCardPanel({
  detail,
  quote,
  onDone,
}: {
  detail: SessionDetail;
  quote: QuoteContent;
  onDone?: () => void;
}) {
  const t = useTranslations("share");
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [style, setStyle] = useState<QuoteCardStyle>("porcelain");
  // Ý đang dùng trên thẻ: mở từ menu thì là ý mặc định, đổi được trong bảng (review PR #35)
  const [current, setCurrent] = useState<QuoteContent>(quote);
  const themeKey = useThemeKey(); // đổi giao diện thì vẽ lại theo token

  // Danh sách ý để đổi: theo mốc thời gian
  const bullets = useMemo(
    () => detail.topics.flatMap((tp) => tp.bullets).sort((a, b) => a.timestamp_sec - b.timestamp_sec),
    [detail.topics],
  );

  function pickBullet(id: string) {
    const b = bullets.find((x) => x.id === id);
    if (!b) return;
    const next = bullets[bullets.findIndex((x) => x.id === id) + 1];
    const end = Math.min(Math.max(b.timestamp_sec + 1, next ? next.timestamp_sec : detail.duration_sec), b.timestamp_sec + 20);
    const speaker = detail.speakers.find((s) => s.id === b.speaker_id);
    setCurrent({
      text: b.text,
      speakerName: speaker?.display_name ?? "",
      speakerColorIndex: speaker?.color_index ?? 0,
      startSec: b.timestamp_sec,
      endSec: end,
    });
  }

  const styles: Array<{ id: QuoteCardStyle; label: string }> = [
    { id: "porcelain", label: t("stylePorcelain") },
    { id: "midnight", label: t("styleMidnight") },
    { id: "dawn", label: t("styleDawn") },
  ];

  const draw = useMemo(
    () => () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      drawQuoteCard(canvas, {
        quote: current,
        peaks: detail.peaks,
        speakerSpans: detail.speaker_spans,
        speakers: detail.speakers,
        sessionDurationSec: detail.duration_sec,
        style,
        shareLabel: t("madeWith"),
        quoteLabel: t("quoteLabel"),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [detail, current, style, t, themeKey],
  );

  useEffect(() => {
    const id = window.setTimeout(draw, 60); // đợi phông tải xong
    return () => window.clearTimeout(id);
  }, [draw]);

  function toBlob(): Promise<Blob | null> {
    const canvas = canvasRef.current;
    if (!canvas) return Promise.resolve(null);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  }

  async function download() {
    const blob = await toBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "the-trich-dan.png";
    a.click();
    URL.revokeObjectURL(url);
    toast.show({ tone: "success", message: t("downloaded") });
  }

  async function share() {
    const blob = await toBlob();
    if (!blob) return;
    const file = new File([blob], "the-trich-dan.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: current.text.slice(0, 60) });
      } catch {
        // Người dùng bấm hủy bảng chia sẻ của máy: không phải lỗi
      }
    }
  }

  const canShareFile = typeof navigator !== "undefined" && typeof navigator.canShare === "function";
  // Ý hiện tại có nằm trong danh sách ý không (tóm tắt chung thì không có)
  const currentId = bullets.find((b) => b.timestamp_sec === current.startSec)?.id ?? "";

  return (
    <div>
      {bullets.length ? (
        <label className="block text-small font-medium text-ink">
          {t("pickQuoteLabel")}
          <select
            value={currentId}
            onChange={(e) => pickBullet(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-control border border-line bg-surface px-2 text-small text-ink"
          >
            {!currentId ? <option value="">{current.text}</option> : null}
            {bullets.map((b) => (
              <option key={b.id} value={b.id}>
                {formatClock(b.timestamp_sec)}, {b.text}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div role="radiogroup" aria-label={t("styleLabel")} className="mt-4 flex flex-wrap gap-2">
        {styles.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={style === s.id}
            onClick={() => setStyle(s.id)}
            className={cn(
              "h-11 rounded-control border px-3 text-small font-medium transition-colors ease-noteim duration-(--t-quick)",
              style === s.id ? "border-sen bg-sen/10 text-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Xem trước thu nhỏ: canvas nội bộ vẫn 1080 x 1350 */}
      <div className="mt-4 flex justify-center rounded-block border border-line bg-surface-2 p-4">
        <canvas ref={canvasRef} aria-label={t("previewLabel")} className="h-auto w-full max-w-[270px] rounded-control shadow-float" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" icon={Download} onClick={() => void download()}>
          {t("downloadCard")}
        </Button>
        {canShareFile ? (
          <Button icon={Share2} onClick={() => void share()}>
            {t("shareCard")}
          </Button>
        ) : null}
        {onDone ? (
          <Button variant="ghost" onClick={onDone}>
            {t("backToOptions")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
