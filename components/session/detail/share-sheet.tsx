"use client";

import {
  ClipboardCopy,
  Copy,
  Eye,
  FileDown,
  FileText,
  Link2,
  Lock,
  Quote,
  Scissors,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatClock, resample, tokenColor, useThemeKey } from "@/components/ribbon/draw";
import { QuoteCardPanel, type QuoteContent } from "./quote-card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SkeletonParagraph } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { data, dataNow, useData, DataError, type Bullet, type SessionDetail, type Template } from "@/lib/data";
import { cn } from "@/lib/cn";

/*
 * Bảng chia sẻ (docs/03-screens.md mục 9, issue M4-01). Bốn lựa chọn:
 * Link xem, Thẻ trích dẫn, Đoạn tinh túy, Xuất file.
 * Mở từ nút chia sẻ ở phần đầu buổi ghi, hoặc từ menu nhấn giữ một ý
 * (tạo thẻ trích dẫn, thêm vào đoạn tinh túy), hoặc từ tab Lời.
 */

type Option = "menu" | "link" | "card" | "highlights" | "export";

export type ShareIntent =
  | { kind: "card"; quote: QuoteContent }
  | { kind: "highlights"; bulletId: string }
  | { kind: "export" }
  | null;

/**
 * Ý mặc định cho thẻ trích dẫn (review PR #35): ý trích dẫn đầu tiên,
 * hoặc điểm chính đầu tiên. Buổi không có ý thì dùng tóm tắt chung.
 */
function defaultQuote(detail: SessionDetail): QuoteContent | null {
  const bullets = detail.topics
    .flatMap((tp) => tp.bullets)
    .sort((a, b) => a.timestamp_sec - b.timestamp_sec);
  const b = bullets.find((x) => x.is_quote) ?? bullets[0];
  if (b) {
    const next = bullets[bullets.findIndex((x) => x.id === b.id) + 1];
    const end = Math.min(Math.max(b.timestamp_sec + 1, next ? next.timestamp_sec : detail.duration_sec), b.timestamp_sec + 20);
    const speaker = detail.speakers.find((s) => s.id === b.speaker_id);
    return {
      text: b.text,
      speakerName: speaker?.display_name ?? "",
      speakerColorIndex: speaker?.color_index ?? 0,
      startSec: b.timestamp_sec,
      endSec: end,
    };
  }
  if (!detail.executive_summary) return null;
  const speaker = detail.speakers[0];
  return {
    text: detail.executive_summary,
    speakerName: speaker?.display_name ?? "",
    speakerColorIndex: speaker?.color_index ?? 0,
    startSec: 0,
    endSec: Math.min(20, Math.max(1, detail.duration_sec)),
  };
}

export function ShareSheet({
  detail,
  template,
  open,
  onOpenChange,
  intent = null,
}: {
  detail: SessionDetail;
  template?: Template;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intent?: ShareIntent;
}) {
  const t = useTranslations("share");
  const [option, setOption] = useState<Option>("menu");
  const [quote, setQuote] = useState<QuoteContent | null>(null);
  const [presetBulletId, setPresetBulletId] = useState<string | null>(null);

  // Mỗi lần mở lại bảng: quay về menu, hoặc vào thẳng lựa chọn được chỉ định.
  // Chỉnh trạng thái lúc vẽ khi (open, intent) đổi — không dùng effect (React 19).
  const [prevState, setPrevState] = useState<{ open: boolean; intent: ShareIntent }>({ open: false, intent: null });
  if (open !== prevState.open || intent !== prevState.intent) {
    setPrevState({ open, intent });
    if (open) {
      if (intent?.kind === "card") {
        setQuote(intent.quote);
        setOption("card");
      } else if (intent?.kind === "highlights") {
        setPresetBulletId(intent.bulletId);
        setOption("highlights");
      } else if (intent?.kind === "export") {
        setOption("export");
      } else {
        setOption("menu");
        setQuote(null);
        setPresetBulletId(null);
      }
    }
  }

  const titleKey: Record<Exclude<Option, "menu">, string> = {
    link: "linkTitle",
    card: "cardTitle",
    highlights: "highlightsTitle",
    export: "exportTitle",
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={option === "menu" ? t("title") : t(titleKey[option])}
      description={option === "menu" ? detail.title : undefined}
      size="full"
    >
      {option === "menu" ? (
        <ul className="divide-y divide-line">
          <OptionRow icon={Link2} label={t("optLink")} hint={t("optLinkHint")} onClick={() => setOption("link")} />
          <OptionRow
            icon={Quote}
            label={t("optCard")}
            hint={t("optCardHint")}
            onClick={() => {
              // Vào từ menu chưa có ý nào: lấy ý mặc định thay vì để bảng trắng
              setQuote((q) => q ?? defaultQuote(detail));
              setOption("card");
            }}
          />
          <OptionRow
            icon={Scissors}
            label={t("optHighlights")}
            hint={t("optHighlightsHint")}
            onClick={() => (setPresetBulletId(null), setOption("highlights"))}
          />
          <OptionRow icon={FileDown} label={t("optExport")} hint={t("optExportHint")} onClick={() => setOption("export")} />
        </ul>
      ) : null}

      {option === "link" ? <LinkPanel detail={detail} onBack={() => setOption("menu")} /> : null}
      {option === "card" && quote ? <QuoteCardPanel detail={detail} quote={quote} onDone={() => setOption("menu")} /> : null}
      {option === "highlights" ? (
        <HighlightsPanel detail={detail} presetBulletId={presetBulletId} onBack={() => setOption("menu")} />
      ) : null}
      {option === "export" ? <ExportPanel detail={detail} template={template} onBack={() => setOption("menu")} /> : null}
    </Sheet>
  );
}

function OptionRow({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: typeof Link2;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 py-2 text-left">
        <Icon aria-hidden={true} className="size-5 shrink-0 text-ink-2" strokeWidth={1.75} />
        <span className="min-w-0 flex-1">
          <span className="block text-body text-ink">{label}</span>
          {hint ? <span className="block text-small text-ink-3">{hint}</span> : null}
        </span>
      </button>
    </li>
  );
}

/* ---------- Link xem ---------- */

const EXPIRY_CHOICES = [null, 7, 30] as const;

function LinkPanel({ detail, onBack }: { detail: SessionDetail; onBack: () => void }) {
  const t = useTranslations("share");
  const toast = useToast();
  const link = useData(() => data.share.getForSession(detail.id), [detail.id]);
  const [scope, setScope] = useState<"summary" | "summary_audio">("summary");
  const [password, setPassword] = useState("");
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const existing = link.data ?? null;

  function absoluteUrl(shareId: string) {
    return `${window.location.origin}/p/${shareId}`;
  }

  async function create() {
    setBusy(true);
    try {
      // Hạn tính từ "bây giờ" của dữ liệu mẫu, không dùng đồng hồ thật
      const now = dataNow();
      await data.share.create(detail.id, {
        scope,
        expires_at: expiryDays ? new Date(now.getTime() + expiryDays * 86400_000).toISOString() : null,
        password: password.trim() || undefined,
      });
      toast.show({ tone: "success", message: t("linkCreated") });
      link.reload();
    } catch {
      toast.show({ tone: "error", message: t("linkError") });
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!existing) return;
    try {
      await data.share.revoke(existing.id);
      toast.show({ tone: "success", message: t("linkRevoked") });
      link.reload();
    } catch {
      toast.show({ tone: "error", message: t("linkError") });
    }
    setConfirmRevoke(false);
  }

  if (link.initialLoading) {
    return (
      <div aria-busy={true}>
        <SkeletonParagraph lines={4} />
      </div>
    );
  }

  if (existing) {
    const urlPath = `/p/${existing.id}`;
    return (
      <div>
        <p className="text-small text-ink-2">{t("existingHint")}</p>
        <div className="mt-3 rounded-block border border-line bg-surface-2 p-3">
          <p dir="ltr" className="break-all text-small text-ink">
            {urlPath}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <Eye aria-hidden={true} className="size-4" strokeWidth={1.75} />
              {t("viewCount", { count: existing.view_count })}
            </span>
            {existing.has_password ? (
              <span className="inline-flex items-center gap-1.5">
                <Lock aria-hidden={true} className="size-4" strokeWidth={1.75} />
                {t("hasPassword")}
              </span>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="primary"
            icon={ClipboardCopy}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(absoluteUrl(existing.id));
                toast.show({ tone: "success", message: t("linkCopied") });
              } catch {
                toast.show({ tone: "error", message: t("linkError") });
              }
            }}
          >
            {t("copyLink")}
          </Button>
          <Button variant="danger" icon={Trash2} onClick={() => setConfirmRevoke(true)}>
            {t("revoke")}
          </Button>
          <Button variant="ghost" onClick={onBack}>
            {t("backToOptions")}
          </Button>
        </div>

        <ConfirmDialog
          open={confirmRevoke}
          onOpenChange={setConfirmRevoke}
          title={t("revokeTitle")}
          cancelLabel={t("cancel")}
          confirmLabel={t("revoke")}
          onConfirm={() => void revoke()}
        >
          {t("revokeBody")}
        </ConfirmDialog>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <fieldset>
        <legend className="text-small font-medium text-ink">{t("scopeLabel")}</legend>
        <div className="mt-2 flex flex-col gap-2">
          <RadioRow
            name="scope"
            checked={scope === "summary"}
            onChange={() => setScope("summary")}
            label={t("scopeSummary")}
            hint={t("scopeSummaryHint")}
          />
          <RadioRow
            name="scope"
            checked={scope === "summary_audio"}
            onChange={() => setScope("summary_audio")}
            label={t("scopeAudio")}
            hint={t("scopeAudioHint")}
          />
        </div>
      </fieldset>

      <TextField
        className="mt-4"
        label={t("passwordLabel")}
        hint={t("passwordHint")}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type="text"
        autoComplete="off"
      />

      <fieldset className="mt-4">
        <legend className="text-small font-medium text-ink">{t("expiryLabel")}</legend>
        <div className="mt-2 flex flex-col gap-2">
          {EXPIRY_CHOICES.map((days) => (
            <RadioRow
              key={String(days)}
              name="expiry"
              checked={expiryDays === days}
              onChange={() => setExpiryDays(days)}
              label={days === null ? t("expiryNever") : t("expiryDays", { count: days })}
            />
          ))}
        </div>
      </fieldset>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="submit" variant="primary" loading={busy}>
          {t("createLink")}
        </Button>
        <Button variant="ghost" onClick={onBack}>
          {t("backToOptions")}
        </Button>
      </div>
    </form>
  );
}

function RadioRow({
  name,
  checked,
  onChange,
  label,
  hint,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="size-5 shrink-0 accent-[var(--sen)]" />
      <span className="min-w-0 flex-1">
        <span className="block text-body text-ink">{label}</span>
        {hint ? <span className="block text-small text-ink-3">{hint}</span> : null}
      </span>
    </label>
  );
}

/* ---------- Đoạn tinh túy ---------- */

const MAX_CHUNK_SEC = 20;

export function highlightsFor(bullets: Bullet[], durationSec: number) {
  // Mỗi ý lấy từ mốc của nó đến đầu ý kế tiếp, tối đa 20 giây; ý cuối đến hết buổi
  return bullets.map((b, i) => {
    const next = bullets[i + 1];
    const end = next ? Math.min(b.timestamp_sec + MAX_CHUNK_SEC, next.timestamp_sec) : Math.min(durationSec, b.timestamp_sec + MAX_CHUNK_SEC);
    return { bullet: b, start: b.timestamp_sec, end: Math.max(b.timestamp_sec + 1, end) };
  });
}

function HighlightsPanel({
  detail,
  presetBulletId,
  onBack,
}: {
  detail: SessionDetail;
  presetBulletId: string | null;
  onBack: () => void;
}) {
  const t = useTranslations("share");
  const allBullets = useMemo(
    () => detail.topics.flatMap((tp) => tp.bullets).sort((a, b) => a.timestamp_sec - b.timestamp_sec),
    [detail.topics],
  );
  const chunks = useMemo(() => highlightsFor(allBullets, detail.duration_sec), [allBullets, detail.duration_sec]);
  const [selected, setSelected] = useState<string[]>(() => (presetBulletId ? [presetBulletId] : []));

  const selectedChunks = chunks.filter((c) => selected.includes(c.bullet.id));
  const totalSec = selectedChunks.reduce((n, c) => n + (c.end - c.start), 0);
  const canCombine = selectedChunks.length >= 3 && selectedChunks.length <= 5;

  function toggle(id: string) {
    setSelected((list) => {
      if (list.includes(id)) return list.filter((x) => x !== id);
      if (list.length >= 5) return list; // tối đa 5 ý
      return [...list, id];
    });
  }

  const [merging, setMerging] = useState(false);
  const [listening, setListening] = useState(false);

  if (listening) {
    return <HighlightsListen detail={detail} chunks={selectedChunks} onClose={() => (setListening(false), setMerging(false))} />;
  }

  return (
    <div>
      <p className="text-small text-ink-2">{t("highlightsHint")}</p>
      <ul className="mt-3 divide-y divide-line">
        {chunks.map((c) => {
          const checked = selected.includes(c.bullet.id);
          return (
            <li key={c.bullet.id}>
              <label className="flex min-h-12 cursor-pointer items-start gap-3 py-2.5">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(c.bullet.id)}
                  className="mt-1 size-5 shrink-0 accent-[var(--sen)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-body text-ink">{c.bullet.text}</span>
                  <span className="mt-0.5 block text-caption tabular-nums text-ink-3">
                    {formatClock(c.start)} – {formatClock(c.end)}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <p aria-live="polite" className="mt-3 text-small font-medium text-ink">
        {selectedChunks.length
          ? t("highlightsTotal", {
              count: selectedChunks.length,
              duration: formatClock(totalSec),
            })
          : t("highlightsPick")}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="primary"
          loading={merging}
          disabled={!canCombine}
          onClick={() => {
            setMerging(true);
            // Giả lập ghép đoạn 2 giây rồi sang màn nghe thử
            window.setTimeout(() => {
              setMerging(false);
              setListening(true);
            }, 2000);
          }}
        >
          {t("combine")}
        </Button>
        {!canCombine && selectedChunks.length > 0 ? (
          <p className="mt-1 w-full text-small text-ink-3">{t("highlightsRange")}</p>
        ) : null}
        <Button variant="ghost" onClick={onBack}>
          {t("backToOptions")}
        </Button>
      </div>
    </div>
  );
}

/** Màn nghe thử: phát lần lượt các đoạn đã ghép, dải giọng của từng đoạn nối nhau. */
function HighlightsListen({
  detail,
  chunks,
  onClose,
}: {
  detail: SessionDetail;
  chunks: Array<{ bullet: Bullet; start: number; end: number }>;
  onClose: () => void;
}) {
  const t = useTranslations("share");
  const tu = useTranslations("ui");
  const [playing, setPlaying] = useState(true);
  // Đồng hồ liền mạch: mỗi đoạn chiếm một khoảng trong tổng thời lượng ghép,
  // đoạn hiện tại và vị trí trong đoạn suy ra từ elapsed (không cần setState trong effect)
  const [elapsed, setElapsed] = useState(0);
  const rafRef = useRef(0);
  const lastRef = useRef(0);

  const slots = useMemo(
    () =>
      chunks.map((c, i) => {
        const from = chunks
          .slice(0, i)
          .reduce((n, x) => n + Math.max(1, x.end - x.start), 0);
        const dur = Math.max(1, c.end - c.start);
        return { chunk: c, from, to: from + dur };
      }),
    [chunks],
  );
  const total = slots.length ? slots[slots.length - 1].to : 0;
  const current = slots.find((s) => elapsed >= s.from && elapsed < s.to) ?? null;
  const finished = elapsed >= total;

  useEffect(() => {
    if (!playing) return;
    lastRef.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      setElapsed((prev) => Math.min(total, prev + dt));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, total]);

  if (!slots.length || !current) {
    const last = slots[slots.length - 1];
    if (!last) return null;
    return <ListenDone chunk={last.chunk} onClose={onClose} doneLabel={t("listenDone")} />;
  }

  const cur = current;
  const within = elapsed - cur.from;
  const speaker = detail.speakers.find((s) => s.id === cur.chunk.bullet.speaker_id);
  const progress = Math.min(1, Math.max(0, within / Math.max(1, cur.to - cur.from)));

  return (
    <div>
      <p className="text-small text-ink-2">{t("listenHint", { index: slots.indexOf(cur) + 1, count: slots.length })}</p>

      {/* Dải giọng của từng đoạn, nối nhau theo thứ tự phát */}
      <ul className="mt-4 flex flex-col gap-2">
        {slots.map((s, i) => (
          <li
            key={s.chunk.bullet.id}
            className={cn(
              "rounded-block border p-3 transition-colors ease-noteim duration-(--t-quick)",
              s === cur ? "border-sen bg-surface-2" : "border-line",
            )}
          >
            <MiniRibbon
              peaks={detail.peaks}
              spans={detail.speaker_spans}
              speakers={detail.speakers}
              start={s.chunk.start}
              end={s.chunk.end}
              durationSec={detail.duration_sec}
              progress={s === cur ? progress : i < slots.indexOf(cur) || finished ? 1 : 0}
            />
            <p className="mt-2 text-small text-ink-2">
              <span className="font-medium tabular-nums text-ink-3">{formatClock(s.chunk.start)}</span> · {s.chunk.bullet.text}
            </p>
          </li>
        ))}
      </ul>

      <p aria-live="polite" className="mt-4 text-body text-ink">
        {speaker ? `${speaker.display_name}: ` : ""}
        {cur.chunk.bullet.text}
      </p>
      <p className="mt-1 text-small tabular-nums text-ink-3">
        {formatClock(within)} / {formatClock(cur.to - cur.from)}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setPlaying((p) => !p)}>
          {playing ? tu("player.pause") : tu("player.play")}
        </Button>
        <Button onClick={onClose}>{t("listenDone")}</Button>
      </div>
    </div>
  );
}

function ListenDone({
  chunk,
  onClose,
  doneLabel,
}: {
  chunk: { bullet: Bullet; start: number; end: number };
  onClose: () => void;
  doneLabel: string;
}) {
  return (
    <div>
      <p className="mt-4 text-body text-ink">{chunk.bullet.text}</p>
      <p className="mt-1 text-small text-ink-3">{formatClock(chunk.end - chunk.start)}</p>
      <div className="mt-4">
        <Button variant="primary" onClick={onClose}>
          {doneLabel}
        </Button>
      </div>
    </div>
  );
}

/** Dải giọng nhỏ của một đoạn, vẽ canvas theo token (đúng sáng/tối). */
function MiniRibbon({
  peaks,
  spans,
  speakers,
  start,
  end,
  durationSec,
  progress,
}: {
  peaks: number[];
  spans: Array<{ speaker_id: string; start_sec: number; end_sec: number }>;
  speakers: Array<{ id: string; color_index: number }>;
  start: number;
  end: number;
  durationSec: number;
  progress: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const themeKey = useThemeKey();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const w = canvas.parentElement?.clientWidth ?? 280;
    const h = 40;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const duration = Math.max(1, durationSec);
    const from = Math.round((start / duration) * peaks.length);
    const to = Math.max(from + 1, Math.round((end / duration) * peaks.length));
    const cols = resample(peaks.slice(from, to), Math.floor((w - 4) / 5));
    const midY = h / 2;
    const playedW = 4 + cols.length * 5 * progress;
    cols.forEach((v, i) => {
      const x = 2 + i * 5;
      const hit = spans.find((s) => start + ((i / cols.length) * (end - start)) >= s.start_sec && start + ((i / cols.length) * (end - start)) < s.end_sec);
      const colorId = speakers.find((s) => s.id === hit?.speaker_id)?.color_index ?? 0;
      ctx.fillStyle = x < playedW ? tokenColor(canvas, `--speaker-${(colorId % 6) + 1}`) : tokenColor(canvas, "--line");
      const barH = Math.max(3, v * h);
      ctx.beginPath();
      ctx.roundRect(x, midY - barH / 2, 3, barH, 1.5);
      ctx.fill();
    });
  }, [peaks, spans, speakers, start, end, durationSec, progress, themeKey]);
  return <canvas ref={ref} aria-hidden={true} className="block w-full" />;
}

/* ---------- Xuất file ---------- */

function ExportPanel({
  detail,
  template,
  onBack,
}: {
  detail: SessionDetail;
  template?: Template;
  onBack: () => void;
}) {
  const t = useTranslations("share");
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const text = useMemo(
    () =>
      buildPlainText(detail, template, {
        tasksHeading: t("exportTasksHeading"),
        due: t("exportDue"),
      }),
    [detail, template, t],
  );

  async function copyText() {
    setBusy(true);
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ tone: "success", message: t("copiedText") });
    } catch (e) {
      toast.show({ tone: "error", message: e instanceof DataError && e.code === "offline" ? t("exportError") : t("exportError") });
    } finally {
      setBusy(false);
    }
  }

  function exportSimulated(kind: "pdf" | "word") {
    toast.show({ tone: "success", message: kind === "pdf" ? t("exportedPdf") : t("exportedWord") });
  }

  return (
    <div>
      <p className="text-small text-ink-2">{t("exportHint")}</p>
      <ul className="mt-3 divide-y divide-line">
        <li>
          <button type="button" onClick={() => void copyText()} className="flex min-h-14 w-full items-center gap-3 py-2 text-left">
            <ClipboardCopy aria-hidden={true} className="size-5 shrink-0 text-ink-2" strokeWidth={1.75} />
            <span className="min-w-0 flex-1">
              <span className="block text-body text-ink">{t("exportText")}</span>
              <span className="block text-small text-ink-3">{t("exportTextHint")}</span>
            </span>
            {busy ? <Copy aria-hidden={true} className="size-4 animate-pulse text-ink-3" /> : null}
          </button>
        </li>
        <li>
          <button type="button" onClick={() => exportSimulated("pdf")} className="flex min-h-14 w-full items-center gap-3 py-2 text-left">
            <FileText aria-hidden={true} className="size-5 shrink-0 text-ink-2" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 text-body text-ink">{t("exportPdf")}</span>
          </button>
        </li>
        <li>
          <button type="button" onClick={() => exportSimulated("word")} className="flex min-h-14 w-full items-center gap-3 py-2 text-left">
            <FileText aria-hidden={true} className="size-5 shrink-0 text-ink-2" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 text-body text-ink">{t("exportWord")}</span>
          </button>
        </li>
      </ul>
      <div className="mt-4">
        <Button variant="ghost" onClick={onBack}>
          {t("backToOptions")}
        </Button>
      </div>
    </div>
  );
}

/** Văn bản xuất thật: tiêu đề, điểm chính, các phần và ý, việc cần làm. */
function buildPlainText(detail: SessionDetail, template: Template | undefined, labels: { tasksHeading: string; due: string }): string {
  const lines: string[] = [];
  lines.push(detail.title);
  lines.push("");
  lines.push(detail.executive_summary);
  const sectionTitle = new Map((template?.sections ?? []).map((s) => [s.id, s.title]));
  const bySection = new Map<string, typeof detail.topics>();
  for (const topic of detail.topics) {
    const list = bySection.get(topic.section_id) ?? [];
    list.push(topic);
    bySection.set(topic.section_id, list);
  }
  for (const [sectionId, topics] of bySection) {
    const title = sectionTitle.get(sectionId);
    if (title) {
      lines.push("");
      lines.push(title);
    }
    for (const topic of topics) {
      lines.push(`${topic.title} (${formatClock(topic.start_sec)})`);
      for (const b of topic.bullets) lines.push(`  • ${b.text} (${formatClock(b.timestamp_sec)})`);
    }
  }
  if (detail.action_items.length) {
    lines.push("");
    lines.push(`=== ${labels.tasksHeading} ===`);
    for (const a of detail.action_items) {
      lines.push(`  ${a.done ? "[x]" : "[ ]"} ${a.task}${a.due_date ? ` ${labels.due.replace("{date}", a.due_date)}` : ""}`);
    }
  }
  return lines.filter((l) => l !== "").join("\n");
}
