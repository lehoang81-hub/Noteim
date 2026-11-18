"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Mic, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { intlLocale } from "@/lib/format";
import { clearAll, loadChunks, loadSession, saveChunk, type SpikeChunk } from "./chunk-store";

/*
 * Màn hình thử ghi âm theo khúc (B0-02 bước 1, docs/10-B phần B):
 * - Ghi thật bằng MediaRecorder, mỗi 10 giây một khúc, mỗi khúc lưu NGAY vào
 *   kho IndexedDB riêng (mất trang vẫn còn các khúc đã ghi).
 * - Đồng hồ đếm giây thực đã trôi và nút dừng.
 * - Trang spike nền luôn tối (thêm class dark cho vùng trang theo AGENTS.md),
 *   không dùng tiện ích dark:, mọi màu qua token.
 */

const CHUNK_MS = 10_000;

type Phase = "idle" | "starting" | "recording" | "stopping";

/** WebKit (Safari, iOS) mới ghi được mp4; Chromium chỉ ra khúc lúc dừng nên dùng webm. */
function isWebKitBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return ua.includes("Safari") && !ua.includes("Chrome") && !ua.includes("Firefox");
}

/** Chọn định dạng ghi theo MediaRecorder.isTypeSupported. */
function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return null;
  }
  const candidates = isWebKitBrowser()
    ? ["audio/mp4", "audio/mp4;codecs=mp4a.40.2"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

/* Định dạng đọc một lần trên máy khách: useSyncExternalStore an toàn khi
 * hydrate (máy chủ trả undefined, không gây lệch giao diện). */
let cachedMime: string | null | undefined;
const noopSubscribe = () => () => undefined;
function useMimeSupport(): string | null | undefined {
  return useSyncExternalStore(
    noopSubscribe,
    () => {
      if (cachedMime === undefined) cachedMime = pickMime();
      return cachedMime;
    },
    () => undefined,
  );
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Đồng hồ mm:ss (quá một giờ thì h:mm:ss), số dùng tabular-nums ở nơi hiển thị. */
function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function GhiAmSpikeScreen() {
  const t = useTranslations("spikeGhiAm");
  const locale = useLocale();
  const localeTag = intlLocale(locale);

  const [phase, setPhase] = useState<Phase>("idle");
  const mime = useMimeSupport();
  const [error, setError] = useState<string | null>(null);
  const [idbError, setIdbError] = useState<string | null>(null);
  const [chunks, setChunks] = useState<SpikeChunk[]>([]);
  const [durMap, setDurMap] = useState<Record<number, number | null>>({});
  const [clockSec, setClockSec] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const clockTimerRef = useRef<number | null>(null);
  const startWallRef = useRef(0);
  const nextIndexRef = useRef(0);
  const pendingSavesRef = useRef<Set<Promise<void>>>(new Set());

  const fmtTime = useCallback(
    (ts: number) =>
      new Intl.DateTimeFormat(localeTag, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(
        new Date(ts),
      ),
    [localeTag],
  );

  const fmtDur = useCallback(
    (sec: number) => {
      const whole = Math.round(sec);
      const m = Math.floor(whole / 60);
      const s = whole % 60;
      return m > 0 ? t("durMinSec", { m, s }) : t("durSec", { s });
    },
    [t],
  );

  const fmtSize = useCallback(
    (n: number) => {
      const nf = new Intl.NumberFormat(localeTag, { maximumFractionDigits: 1 });
      return n >= 1_048_576 ? `${nf.format(n / 1_048_576)} MB` : `${nf.format(n / 1024)} KB`;
    },
    [localeTag],
  );

  /* Nạp khúc đã lưu và kết quả phiên trước khi mở trang (bền qua lần tải lại). */
  useEffect(() => {
    let alive = true;
    loadChunks()
      .then(async (list) => {
        if (!alive) return;
        setChunks(list);
        nextIndexRef.current = list.length > 0 ? list[list.length - 1].index + 1 : 0;
        const session = await loadSession();
        if (!alive || !session) return;
        setDurMap(
          Object.fromEntries(Object.entries(session.chunkDurs ?? {}).map(([k, v]) => [Number(k), v])),
        );
      })
      .catch((e) => {
        if (alive) setIdbError(t("idbBanner", { msg: errText(e) }));
      });
    return () => {
      alive = false;
    };
  }, [t]);

  /* Dọn dẹp khi rời trang: dừng recorder, thả micro. */
  useEffect(() => {
    return () => {
      if (clockTimerRef.current !== null) window.clearInterval(clockTimerRef.current);
      try {
        recorderRef.current?.stop();
      } catch {
        /* đã dừng rồi thì bỏ qua */
      }
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  const handleChunk = useCallback(
    (blob: Blob) => {
      if (!blob || blob.size === 0) return;
      const index = nextIndexRef.current;
      nextIndexRef.current += 1;
      const chunk: SpikeChunk = {
        id: newId(),
        index,
        ts: Date.now(),
        mime: blob.type || recorderRef.current?.mimeType || "",
        size: blob.size,
        blob,
      };
      setChunks((cur) => [...cur, chunk]);
      // Lưu NGAY từng khúc vào kho riêng; lỗi hiện lên giao diện, không im lặng
      const saving = saveChunk(chunk).catch((e) => {
        setIdbError(t("idbBanner", { msg: errText(e) }));
      });
      pendingSavesRef.current.add(saving);
      void saving.finally(() => {
        pendingSavesRef.current.delete(saving);
      });
    },
    [t],
  );

  const startGhi = useCallback(async () => {
    setError(null);
    setIdbError(null);
    setPhase("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const m = pickMime();
      const rec = new MediaRecorder(stream, m ? { mimeType: m } : undefined);
      recorderRef.current = rec;
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) handleChunk(ev.data);
      };
      rec.onerror = () => {
        setError(t("recError"));
      };
      startWallRef.current = Date.now();
      setClockSec(0);
      rec.start(CHUNK_MS);
      setPhase("recording");
      clockTimerRef.current = window.setInterval(() => {
        setClockSec((Date.now() - startWallRef.current) / 1000);
      }, 250);
    } catch (e) {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      setPhase("idle");
      if (e instanceof DOMException && e.name === "NotAllowedError") setError(t("micDenied"));
      else setError(t("micError", { msg: errText(e) }));
    }
  }, [handleChunk, t]);

  const stopGhi = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;
    setPhase("stopping");
    rec.onstop = () => {
      if (clockTimerRef.current !== null) {
        window.clearInterval(clockTimerRef.current);
        clockTimerRef.current = null;
      }
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setClockSec((Date.now() - startWallRef.current) / 1000);
      setPhase("idle");
    };
    try {
      rec.stop();
    } catch {
      setPhase("idle");
      setError(t("recError"));
    }
  }, [t]);

  const clearGhi = useCallback(async () => {
    if (!window.confirm(t("clearConfirm"))) return;
    try {
      await clearAll();
      nextIndexRef.current = 0;
      setChunks([]);
      setDurMap({});
      setError(null);
      setIdbError(null);
    } catch (e) {
      setIdbError(t("idbBanner", { msg: errText(e) }));
    }
  }, [t]);

  const recorderUnsupported = mime === null;
  const recording = phase === "recording" || phase === "stopping" || phase === "starting";

  return (
    <div className="dark min-h-dvh bg-bg text-ink">
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-5 pb-16 pt-8">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-h1 font-semibold">{t("title")}</h1>
          <p className="text-small text-ink-2">{t("subtitle")}</p>
        </header>

        {error ? (
          <p role="alert" className="rounded-control border border-tag-risk bg-tag-risk-bg px-3 py-2 text-small text-tag-risk">
            {error}
          </p>
        ) : null}
        {idbError ? (
          <p role="alert" className="rounded-control border border-tag-risk bg-tag-risk-bg px-3 py-2 text-small text-tag-risk">
            {idbError}
          </p>
        ) : null}
        {recorderUnsupported ? (
          <p role="alert" className="rounded-control border border-tag-risk bg-tag-risk-bg px-3 py-2 text-small text-tag-risk">
            {t("mimeUnsupported")}
          </p>
        ) : null}

        <section className="flex flex-col gap-4" aria-labelledby="spike-ghi-title">
          <h2 id="spike-ghi-title" className="text-h2 font-semibold">
            {t("sectionGhi")}
          </h2>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-caption text-ink-3">{t("clockLabel")}</p>
              <p className="font-display text-display font-semibold tabular-nums" data-clock-sec={Math.floor(clockSec)}>
                {fmtClock(clockSec)}
              </p>
            </div>
            <p className={cn("flex items-center gap-2 text-small", recording ? "text-sen" : "text-ink-3")}>
              <span
                aria-hidden={true}
                className={cn("inline-block size-2.5 rounded-pill", recording ? "bg-sen animate-pulse" : "bg-ink-3")}
              />
              {recording ? t("stateRecording") : t("stateIdle")}
            </p>
          </div>
          <p className="text-small text-ink-3">
            {t("mimeLabel")} <span className="text-ink-2">{mime ?? "?"}</span>
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" icon={Mic} onClick={() => void startGhi()} disabled={recording || recorderUnsupported}>
              {t("startGhi")}
            </Button>
            <Button
              variant="secondary"
              icon={Square}
              onClick={stopGhi}
              disabled={phase !== "recording"}
              loading={phase === "stopping"}
            >
              {t("stopGhi")}
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="spike-khuc-title">
          <h2 id="spike-khuc-title" className="text-h2 font-semibold">
            {t("sectionKhuc")}
          </h2>
          <p className="text-small text-ink-2 tabular-nums" data-chunk-count={chunks.length}>
            {t("chunkCount", { count: chunks.length })}
          </p>
          {chunks.length === 0 ? (
            <p className="text-small text-ink-3">{t("chunkEmpty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-block border border-line">
              {chunks.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-body font-medium tabular-nums">{t("chunkIndex", { index: c.index + 1 })}</p>
                    <p className="text-small text-ink-3 tabular-nums">{t("chunkSavedAt", { time: fmtTime(c.ts) })}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-small tabular-nums">{fmtSize(c.size)}</p>
                    <p className="text-small text-ink-3 tabular-nums">
                      {durMap[c.index] != null ? t("chunkDur", { dur: fmtDur(durMap[c.index] as number) }) : t("chunkDurUnknown")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div>
            <Button variant="ghost" icon={Trash2} onClick={() => void clearGhi()} disabled={chunks.length === 0 || recording}>
              {t("clearChunks")}
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
