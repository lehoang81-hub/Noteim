"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Copy, Download, EyeOff, Mic, Pause, Play, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { intlLocale } from "@/lib/format";
import { CleanAudioChain } from "@/lib/player/clean-audio";
import {
  clearAll,
  clearSession,
  loadChunks,
  loadSession,
  saveChunk,
  saveSession,
  type SpikeChunk,
  type SpikeGap,
  type SpikeSession,
} from "./chunk-store";
import { computeGaps, measureChunks } from "./gap-analysis";
import { createSpikeWakeLock, type SpikeWakeLock } from "./wake-lock";

/*
 * Màn hình thử ghi âm theo khúc (B0-02, docs/10-B phần B):
 * - Ghi thật bằng MediaRecorder, mỗi 10 giây một khúc, mỗi khúc lưu NGAY vào
 *   kho IndexedDB riêng (mất trang vẫn còn các khúc đã ghi).
 * - Đồng hồ đếm giây thực đã trôi, nút dừng, nhật ký sự kiện có giờ địa phương,
 *   công tắc giữ màn hình sáng, bảng khoảng trống sau khi dừng và nút
 *   "Giả lập ẩn trang 30 giây" để kiểm logic khoảng trống trên máy tính.
 * - Trang spike nền luôn tối (thêm class dark cho vùng trang theo AGENTS.md),
 *   không dùng tiện ích dark:, mọi màu qua token.
 */

const CHUNK_MS = 10_000;
const HIDE_SIM_MS = 30_000;

/** Danh sách bài Hoang thử trên điện thoại thật (docs/10-B phần B). */
const GUIDE_CODES = ["G1", "G2", "G3", "G4", "G5", "G6", "N1", "N2", "N3"] as const;
type GuideCode = (typeof GUIDE_CODES)[number];

type Phase = "idle" | "starting" | "recording" | "stopping";

interface LogEntry {
  id: number;
  ts: number;
  text: string;
}

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

function extFromMime(mime: string): string {
  if (mime.includes("mp4") || mime.includes("aac")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

/** Nhận tên trình duyệt từ user agent cho bản xuất JSON. */
function detectBrowser(ua: string): { name: string; version: string } {
  const grab = (re: RegExp) => re.exec(ua)?.[1] ?? "";
  if (ua.includes("Edg/")) return { name: "Edge", version: grab(/Edg\/([\d.]+)/) };
  if (ua.includes("OPR/")) return { name: "Opera", version: grab(/OPR\/([\d.]+)/) };
  if (ua.includes("CriOS/")) return { name: "Chrome iOS", version: grab(/CriOS\/([\d.]+)/) };
  if (ua.includes("FxiOS/")) return { name: "Firefox iOS", version: grab(/FxiOS\/([\d.]+)/) };
  if (ua.includes("Firefox/")) return { name: "Firefox", version: grab(/Firefox\/([\d.]+)/) };
  if (ua.includes("Chrome/") || ua.includes("Chromium/")) {
    return { name: "Chrome", version: grab(/Chrom(?:e|ium)\/([\d.]+)/) };
  }
  if (ua.includes("Safari/")) return { name: "Safari", version: grab(/Version\/([\d.]+)/) };
  return { name: "Other", version: "" };
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
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [wakeOn, setWakeOn] = useState(false);
  const [wakeSupported, setWakeSupported] = useState<boolean | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [gaps, setGaps] = useState<SpikeGap[]>([]);
  const [gapMode, setGapMode] = useState<SpikeSession["gapMode"]>("idle");
  const [wallSec, setWallSec] = useState<number | null>(null);
  const [totalSec, setTotalSec] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [cleanOn, setCleanOn] = useState(false);
  const [samplePlaying, setSamplePlaying] = useState(false);
  const [recPlaying, setRecPlaying] = useState(false);
  const [copyState, setCopyState] = useState<"ok" | "fail" | null>(null);
  const [activeTask, setActiveTask] = useState<GuideCode | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const clockTimerRef = useRef<number | null>(null);
  const startWallRef = useRef(0);
  const stopWallRef = useRef(0);
  const sessionStartIndexRef = useRef(0);
  const nextIndexRef = useRef(0);
  const pendingSavesRef = useRef<Set<Promise<void>>>(new Set());
  const hideTimerRef = useRef<number | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const wakeRef = useRef<SpikeWakeLock | null>(null);
  const logSeqRef = useRef(0);
  const chainRef = useRef<CleanAudioChain | null>(null);
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);
  const recAudioRef = useRef<HTMLAudioElement | null>(null);
  const jsonAreaRef = useRef<HTMLTextAreaElement | null>(null);

  /* Bản dịch đọc qua ref trong các trình nghe gắn lâu (sự kiện trang, track,
   * wake lock) để không phải gỡ gắn lại mỗi lần đổi ngôn ngữ. */
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  });

  const addLog = useCallback((text: string) => {
    logSeqRef.current += 1;
    const entry: LogEntry = { id: logSeqRef.current, ts: Date.now(), text };
    setLogs((cur) => (cur.length >= 500 ? [entry, ...cur.slice(0, 499)] : [entry, ...cur]));
  }, []);

  /* Nhật ký AudioContext.state: CleanAudioChain tự dựng AudioContext riêng bên
   * trong nên trang bọc window.AudioContext (chỉ trong trang này) để ghi mỗi
   * lần state đổi. Chỉ ghi các AudioContext thật, phân tích khoảng trống dùng
   * OfflineAudioContext nên không lẫn vào đây. */
  const ctxLogRef = useRef<(state: string) => void>(() => undefined);
  useEffect(() => {
    ctxLogRef.current = (state: string) => addLog(tRef.current("logCtxState", { state }));
  });
  useEffect(() => {
    const Orig = window.AudioContext;
    if (!Orig) return;
    const Wrapped = class extends Orig {
      constructor(...args: ConstructorParameters<typeof AudioContext>) {
        super(...args);
        const self = this as unknown as AudioContext;
        ctxLogRef.current(self.state);
        self.addEventListener("statechange", () => ctxLogRef.current(self.state));
      }
    };
    window.AudioContext = Wrapped as unknown as typeof AudioContext;
    return () => {
      window.AudioContext = Orig;
    };
  }, []);

  /* Bộ lọc Nghe sạch của app: chỉ dựng đồ thị Web Audio KHI BẬT Nghe sạch
   * (bài học M9), dựng trong cử chỉ bấm công tắc rồi resume trong cử chỉ
   * bấm Phát. */
  useEffect(() => {
    chainRef.current = new CleanAudioChain();
    if (sampleAudioRef.current) chainRef.current.bind(sampleAudioRef.current);
    return () => {
      chainRef.current?.destroy();
      chainRef.current = null;
    };
  }, []);

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
        setGaps(session.gaps ?? []);
        setGapMode(session.gapMode ?? "idle");
        setWallSec(session.wallSec ?? null);
        setTotalSec(session.totalDurSec ?? null);
      })
      .catch((e) => {
        if (alive) setIdbError(t("idbBanner", { msg: errText(e) }));
      });
    return () => {
      alive = false;
    };
  }, [t]);

  /* Dọn dẹp khi rời trang: dừng recorder, thả micro và khoá sáng. */
  useEffect(() => {
    return () => {
      if (clockTimerRef.current !== null) window.clearInterval(clockTimerRef.current);
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
      try {
        recorderRef.current?.stop();
      } catch {
        /* đã dừng rồi thì bỏ qua */
      }
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      wakeRef.current?.dispose();
    };
  }, []);

  /* Giữ màn hình sáng: bật ngay khi mở trang (nếu trình duyệt hỗ trợ), log
   * từng lần mất và lấy lại qua handlers. */
  useEffect(() => {
    const wl = createSpikeWakeLock({
      onLost: () => addLog(tRef.current("logWakeLost")),
      onReacquired: () => addLog(tRef.current("logWakeBack")),
      onFail: (msg) => addLog(tRef.current("logWakeFail", { msg })),
    });
    wakeRef.current = wl;
    setWakeSupported(wl.supported);
    if (wl.supported) {
      void wl.setOn(true).then((ok) => {
        setWakeOn(ok);
        if (ok) addLog(tRef.current("logWakeOn"));
      });
    }
    return () => {
      wl.dispose();
      wakeRef.current = null;
    };
  }, [addLog]);

  /* Sự kiện trang theo đặc tả: visibilitychange, pagehide, freeze, resume. */
  useEffect(() => {
    const onVisibility = () =>
      addLog(tRef.current(document.visibilityState === "hidden" ? "logHidden" : "logVisible"));
    const onPageHide = () => addLog(tRef.current("logPagehide"));
    const onFreeze = () => addLog(tRef.current("logFreeze"));
    const onResume = () => addLog(tRef.current("logResume"));
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("freeze", onFreeze);
    document.addEventListener("resume", onResume);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("freeze", onFreeze);
      document.removeEventListener("resume", onResume);
    };
  }, [addLog]);

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
      const saving = saveChunk(chunk)
        .then(() => addLog(tRef.current("logChunk", { index: index + 1, size: fmtSize(chunk.size) })))
        .catch((e) => {
          setIdbError(tRef.current("idbBanner", { msg: errText(e) }));
        });
      pendingSavesRef.current.add(saving);
      void saving.finally(() => {
        pendingSavesRef.current.delete(saving);
      });
    },
    [addLog, fmtSize],
  );

  const resetSessionView = useCallback(() => {
    setDurMap({});
    setGaps([]);
    setGapMode("idle");
    setWallSec(null);
    setTotalSec(null);
  }, []);

  const startGhi = useCallback(async () => {
    setError(null);
    setIdbError(null);
    setPhase("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // Track micro: mất tiếng, tắt tiếng (cuộc gọi đến hay báo qua mute)
      for (const track of stream.getAudioTracks()) {
        track.addEventListener("ended", () => addLog(tRef.current("logTrackEnded")));
        track.addEventListener("mute", () => addLog(tRef.current("logMute")));
        track.addEventListener("unmute", () => addLog(tRef.current("logUnmute")));
      }
      const m = pickMime();
      const rec = new MediaRecorder(stream, m ? { mimeType: m } : undefined);
      recorderRef.current = rec;
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) handleChunk(ev.data);
      };
      rec.onerror = (ev) => {
        const err = (ev as Event & { error?: DOMException }).error;
        setError(tRef.current("recError"));
        addLog(tRef.current("logRecError", { msg: err?.message || err?.name || "MediaRecorder" }));
      };
      startWallRef.current = Date.now();
      stopWallRef.current = 0;
      sessionStartIndexRef.current = nextIndexRef.current;
      setClockSec(0);
      resetSessionView();
      void clearSession().catch(() => undefined);
      rec.start(CHUNK_MS);
      setPhase("recording");
      addLog(t("logStart", { mime: m || "?" }));
      clockTimerRef.current = window.setInterval(() => {
        setClockSec((Date.now() - startWallRef.current) / 1000);
      }, 250);
    } catch (e) {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      setPhase("idle");
      if (e instanceof DOMException && e.name === "NotAllowedError") setError(t("micDenied"));
      else setError(t("micError", { msg: errText(e) }));
      addLog(t("logRecError", { msg: errText(e) }));
    }
  }, [addLog, handleChunk, resetSessionView, t]);

  /* Đo thời lượng từng khúc, tính khoảng trống và giữ lại kết quả phiên. */
  const analyzeSession = useCallback(async () => {
    setAnalyzing(true);
    try {
      await Promise.allSettled([...pendingSavesRef.current]);
      const all = await loadChunks();
      const sessionChunks = all.filter((c) => c.index >= sessionStartIndexRef.current);
      const startedAt = startWallRef.current;
      const stoppedAt = stopWallRef.current || Date.now();
      const measured = await measureChunks(sessionChunks);
      sessionChunks.forEach((c, i) => {
        if (measured.durs[i] === null) addLog(tRef.current("logDurUnknown", { index: c.index + 1 }));
      });
      const result = computeGaps(startedAt, stoppedAt, sessionChunks, measured.durs, measured.total);
      setDurMap((cur) => {
        const next = { ...cur };
        sessionChunks.forEach((c, i) => {
          next[c.index] = measured.durs[i];
        });
        return next;
      });
      setGaps(result.gaps);
      setGapMode(result.mode);
      setWallSec(result.wallSec);
      setTotalSec(measured.total);
      await saveSession({
        key: "hien-tai",
        startedAt,
        stoppedAt,
        mime: recorderRef.current?.mimeType ?? "",
        gapMode: result.mode,
        gaps: result.gaps,
        wallSec: result.wallSec,
        totalDurSec: measured.total,
        chunkDurs: Object.fromEntries(
          sessionChunks.map((c, i) => [String(c.index), measured.durs[i]]),
        ),
      });
    } catch (e) {
      setIdbError(tRef.current("idbBanner", { msg: errText(e) }));
    } finally {
      setAnalyzing(false);
    }
  }, [addLog]);

  const endHideSim = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    const rec = recorderRef.current;
    if (rec?.state === "paused") {
      try {
        rec.resume();
      } catch {
        /* đã chạy lại rồi thì bỏ qua */
      }
    }
    setSimulating(false);
    addLog(tRef.current("logHideSimEnd"));
  }, [addLog]);

  const endHideSimRef = useRef(endHideSim);
  useEffect(() => {
    endHideSimRef.current = endHideSim;
  });

  /* Nút "Giả lập ẩn trang 30 giây": tạm ngưng recorder đúng 30 giây rồi ghi
   * tiếp, mô phỏng trang bị ẩn để kiểm bảng khoảng trống trên máy tính. */
  const startHideSim = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== "recording") return;
    try {
      rec.pause();
    } catch (e) {
      addLog(t("logRecError", { msg: errText(e) }));
      return;
    }
    setSimulating(true);
    addLog(t("logHideSimStart", { sec: 30 }));
    hideTimerRef.current = window.setTimeout(() => endHideSimRef.current(), HIDE_SIM_MS);
  }, [addLog, t]);

  const stopGhi = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;
    setPhase("stopping");
    stopWallRef.current = Date.now();
    if (rec.state === "paused") endHideSimRef.current();
    rec.onstop = () => {
      if (clockTimerRef.current !== null) {
        window.clearInterval(clockTimerRef.current);
        clockTimerRef.current = null;
      }
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setClockSec(Math.max(0, (stopWallRef.current - startWallRef.current) / 1000));
      setPhase("idle");
      addLog(tRef.current("logStop"));
      void analyzeSession();
    };
    try {
      rec.stop();
    } catch {
      setPhase("idle");
      setError(t("recError"));
    }
  }, [addLog, analyzeSession, t]);

  const toggleWake = useCallback(
    async (on: boolean) => {
      const wl = wakeRef.current;
      if (!wl) return;
      const ok = await wl.setOn(on);
      setWakeOn(on && ok);
      if (ok) addLog(tRef.current(on ? "logWakeOn" : "logWakeOff"));
    },
    [addLog],
  );

  const clearGhi = useCallback(async () => {
    if (!window.confirm(t("clearConfirm"))) return;
    try {
      await clearAll();
      nextIndexRef.current = 0;
      setChunks([]);
      resetSessionView();
      setError(null);
      setIdbError(null);
      addLog(t("logCleared"));
    } catch (e) {
      setIdbError(t("idbBanner", { msg: errText(e) }));
    }
  }, [addLog, resetSessionView, t]);

  const recorderUnsupported = mime === null;
  const recording = phase === "recording" || phase === "stopping" || phase === "starting";

  /* Ghép các khúc theo thứ tự index để phát lại và tải về. */
  const mergedExt = useMemo(() => extFromMime(chunks[0]?.mime ?? ""), [chunks]);
  const mergedUrl = useMemo(() => {
    if (chunks.length === 0) return null;
    const type = chunks[0].mime || chunks[0].blob.type;
    return URL.createObjectURL(new Blob(chunks.map((c) => c.blob), type ? { type } : undefined));
  }, [chunks]);
  useEffect(() => {
    return () => {
      if (mergedUrl) URL.revokeObjectURL(mergedUrl);
    };
  }, [mergedUrl]);

  /* Kết quả xuất ra: JSON mô tả thiết bị, trình duyệt, định dạng ghi, nhật ký,
   * khoảng trống và metadata từng khúc. */
  const jsonOut = useMemo(() => {
    const nav = navigator as Navigator & { deviceMemory?: number };
    const payload = {
      schema: "noteim-spike-ghi-am-v1",
      exportedAt: new Date().toISOString(),
      device: {
        userAgent: navigator.userAgent,
        platform: navigator.platform ?? "",
        languages: Array.from(navigator.languages ?? []),
        hardwareConcurrency: navigator.hardwareConcurrency ?? null,
        deviceMemory: nav.deviceMemory ?? null,
        screen: { width: screen.width, height: screen.height, pixelRatio: window.devicePixelRatio },
      },
      browser: detectBrowser(navigator.userAgent),
      recordMime: mime ?? null,
      recording: {
        wallSec: wallSec,
        totalAudioSec: totalSec,
        gapMode: gapMode,
        chunkCount: chunks.length,
      },
      gaps: gaps.map((g) => ({
        kind: g.kind,
        sec: Math.round(g.sec * 10) / 10,
        atIso: new Date(g.ts).toISOString(),
        atLocal: fmtTime(g.ts),
      })),
      chunks: chunks.map((c) => ({
        index: c.index + 1,
        savedAtIso: new Date(c.ts).toISOString(),
        sizeBytes: c.size,
        mime: c.mime,
        durSec: durMap[c.index] != null ? Math.round((durMap[c.index] as number) * 100) / 100 : null,
      })),
      logs: [...logs].reverse().map((l) => ({ ts: l.ts, iso: new Date(l.ts).toISOString(), text: l.text })),
    };
    return JSON.stringify(payload, null, 2);
  }, [chunks, durMap, fmtTime, gapMode, gaps, logs, mime, totalSec, wallSec]);

  const toggleSample = useCallback(async () => {
    const el = sampleAudioRef.current;
    if (!el) return;
    if (el.paused) {
      // resume trong cử chỉ bấm: AudioContext chỉ chạy được sau cử chỉ trên iPhone
      chainRef.current?.resume();
      try {
        await el.play();
      } catch {
        setError(tRef.current("samplePlayFail"));
      }
    } else {
      el.pause();
    }
  }, []);

  const toggleRecAudio = useCallback(async () => {
    const el = recAudioRef.current;
    if (!el) return;
    try {
      if (el.paused) await el.play();
      else el.pause();
    } catch {
      setError(tRef.current("samplePlayFail"));
    }
  }, []);

  const downloadGhi = useCallback(() => {
    if (!mergedUrl) return;
    const stamp = new Date().toISOString().slice(0, 19).replace("T", "-").replace(/:/g, "-");
    const a = document.createElement("a");
    a.href = mergedUrl;
    a.download = `noteim-ghi-am-${stamp}.${mergedExt}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [mergedExt, mergedUrl]);

  const toggleClean = useCallback(
    (on: boolean) => {
      setCleanOn(on);
      chainRef.current?.setClean(on);
      addLog(tRef.current(on ? "logCleanOn" : "logCleanOff"));
    },
    [addLog],
  );

  /* Sao chép kết quả cho Hoang dán gửi lại; trình duyệt chặn clipboard thì
   * chép thủ công từ ô hiển thị. */
  const copyJson = useCallback(async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(jsonOut);
      ok = true;
    } catch {
      const ta = jsonAreaRef.current;
      if (ta) {
        ta.focus();
        ta.select();
        try {
          ok = document.execCommand("copy");
        } catch {
          ok = false;
        }
      }
    }
    setCopyState(ok ? "ok" : "fail");
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopyState(null), 4000);
  }, [jsonOut]);

  /* Bấm bài nào trong danh sách G1 đến N3 thì nhật ký đánh dấu đang thử bài đó. */
  const startTask = useCallback(
    (code: GuideCode) => {
      setActiveTask(code);
      addLog(tRef.current("logTask", { code }));
    },
    [addLog],
  );

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
            <Button variant="secondary" icon={EyeOff} onClick={startHideSim} disabled={phase !== "recording" || simulating}>
              {t("hideSim")}
            </Button>
          </div>
          <p className="text-small text-ink-3">{simulating ? t("hideSimActive") : t("hideSimHint")}</p>
          {wakeSupported === false ? (
            <p className="text-small text-ink-3">{t("wakeUnsupported")}</p>
          ) : wakeSupported ? (
            <Switch
              checked={wakeOn}
              onCheckedChange={(v) => void toggleWake(v)}
              label={t("wakeLabel")}
              description={t("wakeDescription")}
            />
          ) : null}
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

        <section className="flex flex-col gap-3" aria-labelledby="spike-gap-title">
          <h2 id="spike-gap-title" className="text-h2 font-semibold">
            {t("sectionGap")}
          </h2>
          {analyzing ? <p className="text-small text-ink-3">{t("gapAnalyzing")}</p> : null}
          {gapMode !== "idle" && !analyzing ? (
            <div className="flex flex-col gap-2">
              {gaps.length > 0 ? (
                <ul className="flex flex-col divide-y divide-line rounded-block border border-line">
                  {gaps.map((g, i) => (
                    <li key={`${g.ts}-${i}`} data-gap-sec={Math.round(g.sec)} className="px-4 py-3 text-small">
                      {g.kind === "total"
                        ? t("gapTotal", { dur: fmtDur(g.sec) })
                        : t("gapRow", { dur: fmtDur(g.sec), time: fmtTime(g.ts) })}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-small text-ink-3">{gapMode === "unknown" ? t("gapUnknown") : t("gapNone")}</p>
              )}
              <div className="flex flex-col gap-0.5 text-small text-ink-2 tabular-nums">
                {wallSec != null ? <p>{t("wallLabel", { dur: fmtDur(wallSec) })}</p> : null}
                {totalSec != null ? <p>{t("totalLabel", { dur: fmtDur(totalSec) })}</p> : <p>{t("totalUnknown")}</p>}
              </div>
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="spike-nghe-title">
          <h2 id="spike-nghe-title" className="text-h2 font-semibold">
            {t("sectionNgheLai")}
          </h2>
          {mergedUrl ? (
            <div className="flex flex-col gap-3">
              <audio
                ref={recAudioRef}
                src={mergedUrl}
                controls={true}
                data-rec-audio="true"
                className="w-full"
                onPlay={() => setRecPlaying(true)}
                onPause={() => setRecPlaying(false)}
                onEnded={() => setRecPlaying(false)}
              />
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" icon={recPlaying ? Pause : Play} onClick={() => void toggleRecAudio()}>
                  {recPlaying ? t("pauseBtn") : t("playBtn")}
                </Button>
                <Button variant="secondary" icon={Download} onClick={downloadGhi}>
                  {t("download")}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-small text-ink-3">{t("ngheLaiEmpty")}</p>
          )}
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="spike-mau-title">
          <h2 id="spike-mau-title" className="text-h2 font-semibold">
            {t("sectionMau")}
          </h2>
          <p className="text-small text-ink-3">{t("sampleNote")}</p>
          <audio
            ref={sampleAudioRef}
            src="/audio/01-bds-gap-chi-lan.m4a"
            controls={true}
            preload="none"
            data-sample-audio="true"
            className="w-full"
            onPlay={() => {
              setSamplePlaying(true);
              chainRef.current?.resume();
            }}
            onPause={() => setSamplePlaying(false)}
            onEnded={() => setSamplePlaying(false)}
          />
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" icon={samplePlaying ? Pause : Play} onClick={() => void toggleSample()}>
                {samplePlaying ? t("pauseBtn") : t("playBtn")}
              </Button>
            </div>
            <Switch checked={cleanOn} onCheckedChange={toggleClean} label={t("cleanLabel")} />
          </div>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="spike-huong-dan-title">
          <h2 id="spike-huong-dan-title" className="text-h2 font-semibold">
            {t("sectionHuongDan")}
          </h2>
          <p className="text-small text-ink-3">{t("guideIntro")}</p>
          <ul className="flex flex-col divide-y divide-line rounded-block border border-line">
            {GUIDE_CODES.map((code) => (
              <li key={code}>
                <button
                  type="button"
                  onClick={() => startTask(code)}
                  aria-pressed={activeTask === code}
                  data-guide-code={code}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ease-noteim duration-(--t-quick) hover:bg-surface-2",
                    activeTask === code && "bg-surface-2",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex min-w-9 justify-center rounded-pill border px-2 py-0.5 text-caption",
                      activeTask === code ? "border-sen bg-sen text-on-sen" : "border-line text-ink-3",
                    )}
                  >
                    {code}
                  </span>
                  <span className="min-w-0 text-small text-ink-2">{t(`guide${code}`)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="spike-log-title">
          <h2 id="spike-log-title" className="text-h2 font-semibold">
            {t("sectionNhatKy")}
          </h2>
          {logs.length === 0 ? (
            <p className="text-small text-ink-3">{t("logEmpty")}</p>
          ) : (
            <ul
              data-logs="true"
              className="flex max-h-72 flex-col gap-1.5 overflow-y-auto rounded-block border border-line px-4 py-3"
            >
              {logs.map((l) => (
                <li key={l.id} data-log={l.text} className="flex gap-3 text-small">
                  <span className="shrink-0 text-ink-3 tabular-nums">{fmtTime(l.ts)}</span>
                  <span className="min-w-0 text-ink-2">{l.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="spike-ket-qua-title">
          <h2 id="spike-ket-qua-title" className="text-h2 font-semibold">
            {t("sectionKetQua")}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={Copy} onClick={() => void copyJson()}>
              {t("copyBtn")}
            </Button>
            {copyState ? (
              <p role="status" className={cn("text-small", copyState === "ok" ? "text-ink-2" : "text-tag-risk")}>
                {copyState === "ok" ? t("copied") : t("copyFail")}
              </p>
            ) : null}
          </div>
          <textarea
            ref={jsonAreaRef}
            readOnly={true}
            value={jsonOut}
            rows={10}
            aria-label={t("sectionKetQua")}
            data-json-out="true"
            className="w-full rounded-block border border-line bg-surface p-3 text-small text-ink-2"
          />
        </section>
      </main>
    </div>
  );
}
