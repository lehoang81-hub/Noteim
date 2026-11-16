"use client";

import { Download, Lock, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import { EmptyState, SkeletonParagraph } from "@/components/ui/feedback";
import { formatClock, tokenColor, useThemeKey } from "@/components/ribbon/draw";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { speakerLabel } from "@/lib/data/localize";
import { data, useData, type Photo, type SessionDetail, type SemanticTag } from "@/lib/data";
import { downloadPhotosGrid, downloadSvgAsPng } from "./export-image";
/*
 * Tab Hình (docs/03-screens.md mục 5d, issue M3-03).
 * - Chỉ tạo khi mở tab lần đầu: khung chờ 2 giây giả lập việc dựng hình,
 *   xong thì nhớ lại trong phiên, lần sau mở tab là hiện ngay.
 * - Năm khối: dòng thời gian, ai nói bao nhiêu, biểu đồ số liệu (Recharts),
 *   sơ đồ quy trình (Mermaid), ảnh đã chụp. Recharts và Mermaid tải động
 *   (next/dynamic) — không làm nặng trang khác.
 * - Mỗi khối có "Tải ảnh" (PNG) và "Sao chép" (số liệu dạng văn bản).
 * - Gói Free: biểu đồ số liệu và sơ đồ quy trình bị che mờ kèm nút mở khóa.
 * - Ảnh của buổi ghi mới nằm trong IndexedDB: nạp đúng cách M2 đã làm.
 */

// Hai khối nạp động: không nằm trong bundle của trang khác
const FigureChart = dynamic(() => import("./figure-chart"), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-block bg-surface-2 motion-reduce:animate-none" aria-hidden={true} />,
});
const MermaidFlow = dynamic(() => import("./mermaid-flow"), {
  ssr: false,
  loading: () => <div className="h-40 w-full animate-pulse rounded-block bg-surface-2 motion-reduce:animate-none" aria-hidden={true} />,
});

/** Buổi ghi đã dựng hình ảnh hóa trong phiên này: lần sau mở tab là ra ngay. */
const generated = new Set<string>();

const TAG_KEYS: SemanticTag[] = ["decided", "pending", "risk", "idea", "figure"];
const SVG_W = 350;

type VisualColors = {
  bg: string;
  surface: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  surface2: string;
  tags: Record<SemanticTag, { bg: string; text: string }>;
  speakers: string[];
};

export function VisualTab({
  detail,
  canPlay,
  onSeek,
}: {
  detail: SessionDetail;
  canPlay: boolean;
  onSeek: (time: number) => void;
}) {
  const t = useTranslations("visual");
  const tr = useTranslations(); // nhãn người nói chưa đặt tên ở cấp gốc (review #41 mục 5)
  const ts = useTranslations("session");
  const tl = useTranslations("styleguide.tags");
  const ui = useTranslations("ui");
  const toast = useToast();
  const themeKey = useThemeKey();
  const visuals = useData(() => data.sessions.getVisuals(detail.id), [detail.id]);
  const me = useData(() => data.account.me(), []);
  const isPro = me.data?.plan === "pro";

  // Lần đầu mở tab: dựng 2 giây rồi nhớ lại
  const [generating, setGenerating] = useState(!generated.has(detail.id));
  useEffect(() => {
    if (!generating) return;
    const id = window.setTimeout(() => {
      generated.add(detail.id);
      setGenerating(false);
    }, 2000);
    return () => window.clearTimeout(id);
  }, [generating, detail.id]);

  const rootRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<SVGSVGElement>(null);
  const talkRef = useRef<SVGSVGElement>(null);
  const figureRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const flowRef = useRef<HTMLDivElement | null>(null);

  // Màu token đọc một lần mỗi lần đổi giao diện, sau khi vùng chứa đã gắn
  // (không đọc trong từng khung hình — bài học trong AGENTS.md)
  const [colors, setColors] = useState<VisualColors | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const tag = (name: string) => tokenColor(el, name);
    setColors({
      bg: tag("--bg"),
      surface: tag("--surface"),
      ink: tag("--ink"),
      ink2: tag("--ink-2"),
      ink3: tag("--ink-3"),
      line: tag("--line"),
      surface2: tag("--surface-2"),
      tags: Object.fromEntries(
        TAG_KEYS.map((k) => [k, { bg: tag(`--tag-${k}-bg`), text: tag(`--tag-${k}-text`) }]),
      ) as Record<SemanticTag, { bg: string; text: string }>,
      speakers: Array.from({ length: 6 }, (_, i) => tag(`--speaker-${i + 1}`)),
    });
  }, [themeKey]);

  function copyText(text: string) {
    void navigator.clipboard
      .writeText(text)
      .then(() => toast.show({ tone: "success", message: t("copied") }))
      .catch(() => toast.show({ tone: "error", message: ts("saveError") }));
  }

  async function saveSvg(svg: SVGSVGElement | null, filename: string) {
    if (!svg) return;
    try {
      if (colors) await downloadSvgAsPng(svg, filename, colors.bg);
      toast.show({ tone: "success", message: t("downloaded") });
    } catch {
      toast.show({ tone: "error", message: ts("saveError") });
    }
  }

  async function savePhotos() {
    try {
      const { loadPhoto } = await import("@/lib/record/photo-store");
      const items = await Promise.all(
        detail.photos.map(async (p) => ({
          url: p.url || (await loadPhoto(p.id)) || "",
          time: formatClock(p.timestamp_sec),
        })),
      );
      if (colors) await downloadPhotosGrid(items, `noteim-photos-${detail.id}.png`, colors.bg, colors.ink);
      toast.show({ tone: "success", message: t("downloaded") });
    } catch {
      toast.show({ tone: "error", message: ts("saveError") });
    }
  }

  if (visuals.error && !visuals.data) {
    return (
      <EmptyState
        drawing={<span />}
        message={t("errorLoad")}
        action={<Button onClick={visuals.reload}>{ts("retry")}</Button>}
      />
    );
  }

  const v = visuals.data;
  const topics = v ? [...detail.topics].sort((a, b) => a.start_sec - b.start_sec) : [];
  const speakerOf = Object.fromEntries(detail.speakers.map((s) => [s.id, s]));
  const figureTopics = topics.filter((tp) => tp.figure);

  return (
    <div ref={rootRef} className="max-w-[68ch]">
      {/* Khung chờ: lần đầu mở tab hoặc đang tải visuals */}
      {visuals.initialLoading || generating || !v || !colors ? (
        <div aria-busy={true} aria-label={t("generating")}>
          <p className="text-small font-medium text-ink-2">{t("generating")}</p>
          <div className="mt-4">
            <SkeletonParagraph lines={4} />
            <SkeletonParagraph lines={3} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
      {/* 1. Dòng thời gian buổi ghi: chủ đề xếp theo thời gian, màu theo nhãn */}
      <Block
        title={t("timeline")}
        hint={canPlay ? t("timelineHint") : undefined}
        onDownload={() => void saveSvg(timelineRef.current, `noteim-timeline-${detail.id}.png`)}
        onCopy={() =>
          copyText(
            topics
              .map((tp) => `${formatClock(tp.start_sec)}–${formatClock(tp.end_sec)} ${tp.title} (${tl(tp.tag)})`)
              .join("\n"),
          )
        }
      >
        <svg
          ref={timelineRef}
          viewBox={`0 0 ${SVG_W} ${topics.length * 44 + 8}`}
          className="w-full max-w-[560px]"
          role="img"
          aria-label={t("timeline")}
        >
          {topics.map((tp, i) => {
            const y = i * 44;
            const x = 46 + (tp.start_sec / detail.duration_sec) * (SVG_W - 52);
            const w = Math.max(4, ((tp.end_sec - tp.start_sec) / detail.duration_sec) * (SVG_W - 52));
            const c = colors.tags[tp.tag];
            return (
              <g
                key={tp.id}
                onClick={canPlay ? () => onSeek(tp.start_sec) : undefined}
                className={canPlay ? "cursor-pointer" : undefined}
              >
                {/* Vùng chạm cả hàng cho dễ bấm trên điện thoại */}
                <rect x={0} y={y} width={SVG_W} height={42} fill="transparent" />
                {/* Tên chủ đề nằm ngoài thanh, đọc trọn ở mọi bề ngang */}
                <text x={0} y={y + 13} fontSize={11.5} fill={colors.ink}>
                  {tp.title}
                </text>
                {/* Thanh: chỉ thể hiện vị trí và độ dài theo thời lượng, màu theo nhãn */}
                <rect x={46} y={y + 21} width={SVG_W - 52} height={10} rx={5} fill={colors.surface2} />
                <rect x={x} y={y + 21} width={w} height={10} rx={5} fill={c.bg} stroke={c.text} strokeWidth={1} />
                <text x={0} y={y + 37} fontSize={10.5} fill={colors.ink3}>
                  {formatClock(tp.start_sec)}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="sr-only">{topics.map((tp) => `${formatClock(tp.start_sec)} ${tp.title}`).join(", ")}</p>
      </Block>

      {/* 2. Ai nói bao nhiêu: thanh ngang theo tỷ lệ từng người nói */}
      <Block
        title={t("talkShare")}
        onDownload={() => void saveSvg(talkRef.current, `noteim-talk-${detail.id}.png`)}
        onCopy={() =>
          copyText(
            v.talk_share
              .map((s) => {
                const sp = speakerOf[s.speaker_id];
                return `${sp ? speakerLabel(sp, detail.speakers, tr) : s.speaker_id}: ${s.percent}%`;
              })
              .join("\n"),
          )
        }
      >
        <svg
          ref={talkRef}
          viewBox={`0 0 ${SVG_W} ${v.talk_share.length * 32 + 8}`}
          className="w-full max-w-[560px]"
          role="img"
          aria-label={t("talkShare")}
        >
          {v.talk_share.map((share, i) => {
            const sp = speakerOf[share.speaker_id];
            const y = i * 32;
            const w = (share.percent / 100) * (SVG_W - 140);
            return (
              <g key={share.speaker_id}>
                <text x={0} y={y + 20} fontSize={12} fill={colors.ink2}>
                  {truncate(sp ? speakerLabel(sp, detail.speakers, tr) : share.speaker_id, 13)}
                </text>
                <rect x={100} y={y + 8} width={Math.max(w, 4)} height={14} rx={7} fill={colors.speakers[(sp?.color_index ?? 0) % 6]} />
                <text x={SVG_W - 36} y={y + 20} fontSize={12} fill={colors.ink}>
                  {share.percent}%
                </text>
              </g>
            );
          })}
        </svg>
      </Block>

      {/* 3. Biểu đồ số liệu (Recharts; gói Free bị che mờ) */}
      {figureTopics.map((tp) => (
        <Block
          key={tp.id}
          title={t("figure")}
          locked={!isPro}
          onDownload={
            isPro
              ? () => void saveSvg(figureRefs.current[tp.id]?.querySelector("svg") ?? null, `noteim-figure-${tp.id}.png`)
              : undefined
          }
          onCopy={
            isPro
              ? () => {
                  const f = tp.figure!;
                  copyText(
                    `${f.title} (${f.unit}):\n${f.labels.map((l, i) => `${l}: ${f.values[i]}`).join("\n")}\n${t("source", { time: formatClock(f.source_timestamp_sec) })}`,
                  );
                }
              : undefined
          }
        >
          <div ref={(el) => void (figureRefs.current[tp.id] = el)}>
            <FigureChart
              figure={tp.figure!}
              colors={{ bar: colors.tags.figure.text, line: colors.tags.figure.text, grid: colors.line, tick: colors.ink3, surface: colors.surface, ink: colors.ink }}
            />
            {canPlay ? (
              <button
                type="button"
                onClick={() => onSeek(tp.figure!.source_timestamp_sec)}
                className="mt-1 inline-flex min-h-8 items-center rounded-control text-caption font-medium text-ink-3 hover:underline"
              >
                {t("source", { time: formatClock(tp.figure!.source_timestamp_sec) })}
              </button>
            ) : (
              <p className="mt-1 text-caption text-ink-3">{t("source", { time: formatClock(tp.figure!.source_timestamp_sec) })}</p>
            )}
          </div>
        </Block>
      ))}

      {/* 4. Sơ đồ quy trình (Mermaid; gói Free bị che mờ) */}
      {v.flow_mermaid ? (
        <Block
          title={t("flow")}
          locked={!isPro}
          onDownload={isPro ? () => void saveSvg(flowRef.current?.querySelector("svg") ?? null, `noteim-flow-${detail.id}.png`) : undefined}
          onCopy={isPro ? () => copyText(v.flow_mermaid!) : undefined}
        >
          <div ref={flowRef}>
            <MermaidFlow
              code={v.flow_mermaid}
              colors={{ background: colors.bg, primary: colors.surface2, text: colors.ink, border: colors.line, line: colors.ink3 }}
            />
          </div>
        </Block>
      ) : null}

        {/* 5. Ảnh đã chụp: lưới ảnh kèm mốc, chạm để xem to */}
        <Block
          title={t("photos")}
          onDownload={detail.photos.length ? () => void savePhotos() : undefined}
          onCopy={
            detail.photos.length
              ? () => copyText(detail.photos.map((p) => `${formatClock(p.timestamp_sec)}${p.caption ? ` — ${p.caption}` : ""}`).join("\n"))
              : undefined
          }
        >
          {detail.photos.length ? (
            <div className="grid grid-cols-3 gap-2">
              {detail.photos.map((p) => (
                <PhotoTile key={p.id} photo={p} alt={t("photoAlt", { time: formatClock(p.timestamp_sec) })} closeLabel={ui("close")} />
              ))}
            </div>
          ) : (
            <p className="text-small text-ink-3">{t("photosEmpty")}</p>
          )}
        </Block>
        </div>
      )}
    </div>
  );
}

/* ---------- Một khối nội dung: tiêu đề, tải ảnh, sao chép, khóa Free ---------- */

function Block({
  title,
  hint,
  locked,
  onDownload,
  onCopy,
  children,
}: {
  title: string;
  hint?: string;
  locked?: boolean;
  onDownload?: () => void;
  onCopy?: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("visual");
  return (
    <section aria-label={title} className="rounded-block border border-line bg-surface p-4">
      <div className="flex items-center gap-1">
        <h3 className="min-w-0 flex-1 text-small font-semibold text-ink">{title}</h3>
        {onDownload ? (
          <Button variant="ghost" icon={Download} iconOnly aria-label={`${t("download")}: ${title}`} onClick={onDownload} className="h-9" />
        ) : null}
        {onCopy ? (
          <Button variant="ghost" onClick={onCopy} className="h-9 px-2">
            {t("copy")}
          </Button>
        ) : null}
      </div>
      {hint ? <p className="mt-0.5 text-caption text-ink-3">{hint}</p> : null}
      {locked ? (
        <div className="relative mt-2">
          <div aria-hidden={true} className="pointer-events-none select-none blur-sm">
            {children}
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-block bg-surface/60">
            <Lock aria-hidden={true} className="size-5 text-ink-2" strokeWidth={1.75} />
            <p className="px-4 text-center text-small text-ink-2">{t("locked")}</p>
            <Link
              href="/upgrade"
              className="inline-flex h-11 items-center rounded-control bg-ink px-4 text-small font-semibold text-bg"
            >
              {t("unlock")}
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-2">{children}</div>
      )}
    </section>
  );
}

/* ---------- Ảnh: fixture dùng URL tĩnh, ảnh chụp mới nằm trong IndexedDB ---------- */

function PhotoTile({ photo, alt, closeLabel }: { photo: Photo; alt: string; closeLabel: string }) {
  const src = usePhotoSrc(photo);
  const [open, setOpen] = useState(false);

  if (!src) return <span aria-hidden={true} className="aspect-square w-full rounded-block bg-surface-2" />;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={alt}
        aria-haspopup="dialog"
        className="overflow-hidden rounded-block border border-line"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="aspect-square w-full object-cover" loading="lazy" />
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/60" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[86dvh] w-[calc(100%-40px)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-block border border-line bg-surface p-3 focus:outline-none">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-small font-semibold text-ink">{alt}</Dialog.Title>
              <Dialog.Close
                aria-label={closeLabel}
                className="flex size-9 items-center justify-center rounded-control text-ink-2 hover:bg-surface-2"
              >
                <X aria-hidden={true} className="size-5" strokeWidth={1.75} />
              </Dialog.Close>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className="mt-2 max-h-[70dvh] w-full rounded-block object-contain" />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function usePhotoSrc(photo: Photo) {
  const [src, setSrc] = useState<string | null>(photo.url || null);
  useEffect(() => {
    if (photo.url) return;
    let alive = true;
    void import("@/lib/record/photo-store")
      .then((m) => m.loadPhoto(photo.id))
      .then((found) => {
        if (alive && found) setSrc(found);
      });
    return () => {
      alive = false;
    };
  }, [photo.id, photo.url]);
  return src;
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
