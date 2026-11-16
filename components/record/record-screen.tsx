"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState } from "react";
import { Camera, ChevronDown, HardDrive, Mic, MicVocal } from "lucide-react";
import { AnimatePresence, LayoutGroup, m } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { RibbonLive } from "@/components/ribbon/ribbon-live";
import { RibbonThumb } from "@/components/ribbon/ribbon-thumb";
import { formatClock, resample } from "@/components/ribbon/draw";
// Phần chỉ hiện khi đang ghi: nạp chậm để màn chuẩn bị nhẹ hơn (M5-04)
const BookmarkButton = dynamic(() => import("@/components/record/bookmark-button").then((m) => m.BookmarkButton), { ssr: false });
const RecordFeed = dynamic(() => import("@/components/record/record-feed").then((m) => m.RecordFeed), { ssr: false });
const HoldToEndButton = dynamic(() => import("@/components/record/hold-to-end-button").then((m) => m.HoldToEndButton), { ssr: false });
const TemplateSheet = dynamic(() => import("@/components/record/sheets").then((m) => m.TemplateSheet), { ssr: false });
import { ConsentSheet, MicPermissionSheet } from "@/components/record/sheets";
import { Button } from "@/components/ui/button";
import { Banner, MicDrawing } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import { RecordButton } from "@/components/ui/record-button";
import { useToast } from "@/components/ui/toast";
import { useMicLevel } from "@/lib/audio/use-mic-level";
import { cn } from "@/lib/cn";
import { data, useData } from "@/lib/data";
import { useDebugFlags } from "@/lib/debug/flags";
import { shortDate } from "@/lib/format";
import { templateName } from "@/lib/data/localize";
import { markMicGranted, useMicGateSeed } from "@/lib/record/mic-permission";
import { fileToDataUrl } from "@/lib/record/photo";
import { useStorageFull } from "@/lib/storage-full";
import {
  addRecordingBookmark,
  addRecordingNote,
  addRecordingPhoto,
  endRecording,
  pauseRecording,
  pushRecordingLevel,
  recordedSec,
  resumeRecording,
  setRecordingTemplate,
  snapshotRecording,
  startRecording,
  useRecording,
} from "@/lib/record/recording-store";
import { keepScreenAwake, letScreenSleep } from "@/lib/record/wake-lock";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import { useOffline } from "@/components/shell/app-shell";
import type { SemanticTag } from "@/components/ui/chips";

/*
 * Màn hình ghi âm /record (docs/03-screens.md mục 2, 3; M2-01 + M2-02).
 * - Luôn nền chàm đêm (class .dark), không có khung ứng dụng.
 * - Dải giọng sống theo micro thật; dưới là ô ghi chú và danh sách ghi chú,
 *   điểm nóng, ảnh gắn mốc thời gian (M2-02).
 * - Đánh dấu: chạm tạo điểm nóng không nhãn (gợn sóng + rung nhẹ), nhấn giữ
 *   chọn nhãn màu. Chụp: ảnh thu nhỏ 1280px lưu vào kho buổi ghi.
 * - Gợi ý im lặng: dưới ngưỡng 60 giây thì gợi ý tạm dừng (cờ x30 để kiểm nhanh).
 * - Nút thu nhỏ góc trên trái: về trang khác, thanh sen "Đang ghi" trên mọi
 *   trang đưa quay lại đây.
 */

const EASE = [0.2, 0.8, 0.2, 1] as const;
const SCENE = { duration: 0.7, ease: EASE };
const FADE = { duration: 0.22, ease: EASE };
const MOMENT_MS = 700;
const SILENCE_SEC = 60;
const SILENCE_LEVEL = 0.07;

type Gate = "boot" | "permission" | "consent" | "quota" | "denied";

/** "14:05" theo đồng hồ máy, để đặt tên "Buổi ghi lúc 14:05". */
function clockTime(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Đồng hồ ghi âm, tự chạy mỗi 250ms. Tạm dừng thì nhấp nháy chậm. */
function RecordClock({ paused }: { paused: boolean }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setSec(recordedSec()), 250);
    return () => window.clearInterval(id);
  }, []);
  return (
    <p
      className={cn(
        "font-display text-display font-bold tabular-nums text-ink",
        paused && "animate-pulse motion-reduce:animate-none",
      )}
    >
      {formatClock(sec)}
    </p>
  );
}

export function RecordScreen() {
  const t = useTranslations("record");
  const locale = useLocale();
  // Tiêu đề buổi ghi tự sinh nằm ở namespace library (sessionAt) — dùng bộ
  // dịch đúng namespace, không thì English hiện nguyên chữ "record.sessionAt"
  // (review PR #41 mục 5: nhãn hệ thống sinh lúc chạy phải theo ngôn ngữ)
  const tLib = useTranslations("library");
  const tl = useTranslations("styleguide.tags");
  const router = useRouter();
  const toast = useToast();
  const flags = useDebugFlags();
  const offline = useOffline();
  const recording = useRecording();
  const me = useData(() => data.account.me(), []);
  const quota = useData(() => data.account.quota(), []);
  const templates = useData(() => data.account.templates(), []);
  const reduce = useReducedMotionSafe();
  const storageReallyFull = useStorageFull();
  const storageAlert = storageReallyFull || flags.storageFull;
  const micTakenRef = useRef<() => void>(() => {});
  const mic = useMicLevel({ onEnded: () => micTakenRef.current() });
  /* Ba nhánh dải giọng (khoảnh khắc bắt đầu, thẻ gấp, dải sống) cùng là
   * m.div ở cùng một vị trí: nếu không có key, React giữ nguyên instance
   * khi đổi nhánh và hộp dải sống thừa hưởng trạng thái width/height đang dở
   * của khoảnh khắc trước, kẹt ở width: 32px (PR #22, lỗi 1). Key khác nhau
   * buộc React gắn phần tử mới cho từng nhánh. layoutId dùng useId để hai nhánh
   * "thẻ gấp" và "dải sống" trong cùng lần mở vẫn ghép cặp cho khoảnh khắc
   * gấp, mà không ghép nhầm với lần mở trước. */
  const ribbonBoxId = useId();

  /** Bảng đang chờ trước khi ghi; null là không chờ gì (đang ghi hoặc đã xong luồng). */
  // Màn chủ dựng sẵn bảng xin quyền (M5-04); máy đã cấp quyền thì đổi về
  // "boot" sau khi hydrate, không gây lệch khớp.
  const seed = useMicGateSeed();
  const [gate, setGate] = useState<Gate | null>(seed);
  useEffect(() => {
    if (!decided.current) setGate(seed);
  }, [seed]);
  const [momentOn, setMomentOn] = useState(false);
  const [folding, setFolding] = useState(false);
  const [showAnnounce, setShowAnnounce] = useState(false);
  const [templateSheet, setTemplateSheet] = useState(false);
  const [ripple, setRipple] = useState(0);
  const [silence, setSilence] = useState(false);
  const [sampleVoice, setSampleVoice] = useState(false);
  const [fakeLevel, setFakeLevel] = useState(0);
  const [micTaken, setMicTaken] = useState(false);
  const [quotaSecondsLeft, setQuotaSecondsLeft] = useState<number | null>(null);
  const momentTimer = useRef(0);
  const announceTimer = useRef(0);
  const decided = useRef(false);
  const startingMic = useRef(false);
  const levelRef = useRef(0);
  const beginRef = useRef<(announce: boolean) => void>(() => {});
  const finishRef = useRef<() => void>(() => {});
  const lastVoiceRef = useRef(0);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const autoEnded = useRef(false);

  const active = recording.status !== "idle";
  const paused = recording.status === "paused";
  const templateLabel =
    templates.data?.find((tp) => tp.id === recording.templateId) === undefined
      ? ""
      : templateName(templates.data!.find((tp) => tp.id === recording.templateId)!, locale);
  const level = sampleVoice ? fakeLevel : mic.level;
  const maxSessionMin = quota.data?.max_session_minutes ?? 45;
  const planName = me.data?.plan === "pro" ? "Pro" : "Free";
  const planLimitLabel =
    maxSessionMin >= 60 && maxSessionMin % 60 === 0
      ? t("hours", { h: Math.round(maxSessionMin / 60) })
      : t("minutes", { m: maxSessionMin });
  const tagLabels: Record<SemanticTag, string> = {
    decided: tl("decided"),
    pending: tl("pending"),
    risk: tl("risk"),
    idea: tl("idea"),
    figure: tl("figure"),
  };

  /* ----- Luồng bắt đầu ghi (M2-01) ----- */

  function beginRecording(announce: boolean) {
    if (recording.status !== "idle") return;
    const templateId =
      recording.templateId ?? me.data?.default_template_id ?? templates.data?.[0]?.id ?? null;
    startRecording({ templateId, consent: { confirmed: true, announced: announce } });
    keepScreenAwake();
    setGate(null);
    setMomentOn(true);
    if (announce) {
      setShowAnnounce(true);
      window.clearTimeout(announceTimer.current);
      announceTimer.current = window.setTimeout(() => setShowAnnounce(false), 2000);
    }
    window.clearTimeout(momentTimer.current);
    momentTimer.current = window.setTimeout(() => setMomentOn(false), reduce ? 220 : MOMENT_MS);
  }
  // Cập nhật sau mỗi lần vẽ để effect và bảng đồng ý luôn gọi bản mới nhất
  useEffect(() => {
    beginRef.current = beginRecording;
    finishRef.current = finishRecording;
  });

  // Quyết định một lần duy nhất khi mở màn hình: đang ghi dở, hết hạn mức
  // tháng, micro bị chối, cần xin quyền, cần hỏi đồng ý, hay ghi luôn
  useEffect(() => {
    if (decided.current) return;
    if (recording.status !== "idle") {
      decided.current = true;
      const id = window.setTimeout(() => setGate(null), 0);
      return () => window.clearTimeout(id);
    }
    if (flags.micDenied) {
      decided.current = true;
      const id = window.setTimeout(() => setGate("denied"), 0);
      return () => window.clearTimeout(id);
    }
    if (seed === "permission") return; // lần đầu: bảng xin quyền đang hiện
    if (!me.data) return; // chờ hồ sơ để biết có bật nhắc đồng ý hay không
    if (!quota.data && !quota.error) return; // chờ hạn mức (lỗi thì bỏ qua kiểm)
    decided.current = true;
    const quotaUsedOut = !!quota.data && quota.data.minutes_used >= quota.data.minutes_limit;
    if (quotaUsedOut) {
      // Nút ghi âm vẫn bấm được: mở bảng giải thích và mời xem gói Pro (M2-04)
      const id = window.setTimeout(() => setGate("quota"), 0);
      return () => window.clearTimeout(id);
    }
    if (me.data.consent_reminder) {
      const id = window.setTimeout(() => setGate("consent"), 0);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => beginRef.current(false), 0);
    return () => window.clearTimeout(id);
  }, [seed, me.data, quota.data, quota.error, recording.status, flags.micDenied]);

  // Được cấp quyền micro: ghi nhớ để lần sau bỏ qua bảng xin quyền, rồi hỏi
  // đồng ý (nếu bật) hoặc ghi luôn. Bị từ chối thật thì sang trang giải thích.
  useEffect(() => {
    if (gate !== "permission") return;
    if (mic.status === "denied" || mic.status === "unsupported") {
      const id = window.setTimeout(() => setGate("denied"), 0);
      return () => window.clearTimeout(id);
    }
    if (mic.status !== "on") return;
    markMicGranted();
    const remind = !!me.data?.consent_reminder;
    const id = window.setTimeout(() => {
      if (remind) setGate("consent");
      else beginRef.current(false);
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate, mic.status]);

  // Đang ghi mà micro chưa mở (vào lại màn hình, ghi tiếp sau khôi phục): mở lại
  useEffect(() => {
    if (!active || paused || mic.status !== "idle" || startingMic.current) return;
    startingMic.current = true;
    void mic.start().finally(() => {
      startingMic.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, paused, mic.status]);

  // Lấy mẫu âm lượng mỗi 250ms; kho tự bỏ qua khi không ghi
  useEffect(() => {
    levelRef.current = level;
  }, [level]);
  useEffect(() => {
    const id = window.setInterval(() => pushRecordingLevel(levelRef.current), 250);
    return () => window.clearInterval(id);
  }, []);

  // Âm thanh mẫu (micro bị từ chối): dải giọng chạy bằng âm lượng giả
  useEffect(() => {
    if (!sampleVoice) return;
    let phase = 0;
    const id = window.setInterval(() => {
      phase += 1;
      const speaking = Math.sin(phase / 9) > -0.4;
      setFakeLevel(speaking ? 0.35 + Math.random() * 0.55 : 0.05 + Math.random() * 0.08);
    }, 120);
    return () => window.clearInterval(id);
  }, [sampleVoice]);

  // Gợi ý im lặng: dưới ngưỡng liên tục 60 giây (đồng hồ ghi, cờ x30 kiểm nhanh)
  useEffect(() => {
    const id = window.setInterval(() => {
      if (recording.status !== "recording") {
        setSilence(false);
        lastVoiceRef.current = recordedSec();
        return;
      }
      if (levelRef.current >= SILENCE_LEVEL) {
        lastVoiceRef.current = recordedSec();
        setSilence(false);
      } else if (recordedSec() - lastVoiceRef.current >= SILENCE_SEC) {
        setSilence(true);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [recording.status]);

  // Hạn mức phiên: còn 5 phút thì cảnh báo hổ phách, hết là tự kết thúc (M2-04)
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!active || folding || autoEnded.current) return;
      const remaining = maxSessionMin * 60 - recordedSec();
      setQuotaSecondsLeft(remaining);
      if (remaining <= 0 && recording.status === "recording") {
        autoEnded.current = true;
        toast.show({
          tone: "success",
          message: t("sessionQuotaOut", { limit: planLimitLabel, plan: planName }),
        });
        void finishRef.current();
      }
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, folding, recording.status, maxSessionMin, planName, planLimitLabel]);

  // Micro bị nơi khác chiếm (M2-04): thật thì nghe sự kiện ended của track,
  // thử nghiệm thì ép sau 10 giây. Tự tạm dừng, buổi ghi vẫn còn nguyên.
  useEffect(() => {
    micTakenRef.current = () => {
      if (recording.status !== "recording") return;
      pauseRecording();
      setMicTaken(true);
    };
  });
  useEffect(() => {
    if (!active || paused || !flags.micTaken) return;
    const id = window.setTimeout(() => micTakenRef.current(), 10_000);
    return () => window.clearTimeout(id);
  }, [active, paused, flags.micTaken]);

  useEffect(
    () => () => {
      window.clearTimeout(momentTimer.current);
      window.clearTimeout(announceTimer.current);
    },
    [],
  );

  /* ----- Hành động ----- */

  function togglePause() {
    if (recording.status === "recording") pauseRecording();
    else if (recording.status === "paused") {
      resumeRecording();
      setMicTaken(false); // ghi tiếp sau khi micro bị chiếm: xóa dải báo
    }
  }

  /* Kết thúc ghi (M2-03): tạo buổi ghi, dải giọng gấp thành thẻ rồi sang màn
   * hình xử lý. Tạo thất bại thì giữ nguyên buổi ghi để không mất dữ liệu. */
  const ending = useRef(false);

  async function finishRecording() {
    if (ending.current || folding) return;
    ending.current = true;
    const snapshot = snapshotRecording();
    if (snapshot.status === "idle") {
      ending.current = false;
      return;
    }
    const templateId = snapshot.templateId ?? me.data?.default_template_id ?? templates.data?.[0]?.id;
    if (!templateId) {
      ending.current = false;
      toast.show({ tone: "error", message: t("endError") });
      return;
    }
    const title = tLib("sessionAt", { time: clockTime(snapshot.startedAtClock ?? Date.now()) });
    setFolding(true); // khoảnh khắc "Kết thúc ghi": dải giọng gấp thành thẻ
    try {
      const [created] = await Promise.all([
        data.sessions.createFromRecording({
          title,
          template_id: templateId,
          duration_sec: snapshot.duration_sec,
          notes: snapshot.notes.map(({ timestamp_sec, text }) => ({ timestamp_sec, text })),
          bookmarks: snapshot.bookmarks.map(({ timestamp_sec, tag }) => ({ timestamp_sec, tag })),
          photos: snapshot.photos.map(({ id, timestamp_sec, url }) => ({ id, timestamp_sec, url })),
          levels: snapshot.levels,
          consent: snapshot.consent,
        }),
        new Promise((r) => window.setTimeout(r, reduce ? 220 : 900)),
      ]);
      mic.stop();
      letScreenSleep();
      endRecording();
      router.push(`/s/${created.id}/processing`);
    } catch {
      setFolding(false);
      ending.current = false;
      toast.show({ tone: "error", message: t("endError") });
    }
  }

  function bookmarkFeedback() {
    setRipple((n) => n + 1);
    navigator.vibrate?.(10);
  }

  function onBookmark(tag: SemanticTag | null) {
    addRecordingBookmark(tag);
    bookmarkFeedback();
  }

  async function onPhotoPicked(file: File | undefined) {
    if (!file) return;
    try {
      const url = await fileToDataUrl(file);
      addRecordingPhoto(url);
    } catch {
      // Không đọc được ảnh: bỏ qua, buổi ghi vẫn chạy
    }
  }

  const showMoment = active && momentOn;
  const showControls = active && !momentOn && !folding;

  /* Thẻ buổi ghi trong khoảnh khắc "Kết thúc ghi" */
  const foldPeaks = resample(recording.levels.length ? recording.levels : [0.4], 40);
  const foldSpeakers = Array.from({ length: 40 }, () => 0);
  const foldTitle = recording.startedAtClock ? tLib("sessionAt", { time: clockTime(recording.startedAtClock) }) : "";

  return (
    <div className="dark flex min-h-dvh flex-col bg-bg text-ink">
      <header className="flex min-h-14 items-center gap-2 px-page pt-2">
        <button
          type="button"
          onClick={() => router.push("/")}
          disabled={!showControls}
          aria-label={t("minimize")}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-control text-ink-2",
            "transition-colors ease-noteim duration-(--t-quick) hover:bg-surface-2 hover:text-ink",
            !showControls && "pointer-events-none opacity-0",
          )}
        >
          <ChevronDown aria-hidden={true} className="size-5" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => active && setTemplateSheet(true)}
          disabled={!active}
          aria-label={t("changeTemplate")}
          className={cn(
            "mx-auto flex min-h-11 items-center gap-1 rounded-control px-3 text-body-strong font-semibold text-ink",
            "transition-colors ease-noteim duration-(--t-quick) hover:bg-surface-2",
            !showControls && "pointer-events-none opacity-0",
          )}
        >
          <span className="max-w-[38vw] truncate sm:max-w-64">{templateLabel || " "}</span>
          <ChevronDown aria-hidden={true} className="size-4 shrink-0 text-ink-3" strokeWidth={2} />
        </button>
        <span
          className="flex size-11 shrink-0 items-center justify-end gap-1.5 whitespace-nowrap text-caption font-medium text-ink-2"
          aria-live="polite"
        >
          {showControls ? (
            <>
              <span
                aria-hidden={true}
                className={cn("size-2 rounded-pill bg-sen", !paused && "animate-pulse motion-reduce:animate-none")}
              />
              {paused ? t("statusPaused") : t("statusRecording")}
            </>
          ) : null}
        </span>
      </header>

      {sampleVoice && showControls ? (
        <p role="status" className="px-page pb-1 text-center text-caption font-medium text-dien">
          {t("sampleBadge")}
        </p>
      ) : null}

      {/* Dải báo của màn hình ghi (M2-04): mất mạng, sắp hết hạn mức phiên,
          micro bị nơi khác chiếm, bộ nhớ trình duyệt đầy (PR #22, lỗi 3).
          Ghi vẫn chạy trong mọi trường hợp. */}
      {showControls && (offline || micTaken || storageAlert || (quotaSecondsLeft !== null && quotaSecondsLeft > 0 && quotaSecondsLeft <= 300)) ? (
        <div className="flex flex-col gap-px">
          {offline ? <Banner kind="offline">{t("offlineRecording")}</Banner> : null}
          {storageAlert ? <Banner kind="expiring" icon={HardDrive}>{t("storageFull")}</Banner> : null}
          {quotaSecondsLeft !== null && quotaSecondsLeft > 0 && quotaSecondsLeft <= 300 ? (
            <Banner kind="quota">
              {t("sessionQuotaLow", {
                minutes: Math.max(1, Math.ceil(quotaSecondsLeft / 60)),
                plan: planName,
                limit: planLimitLabel,
              })}
            </Banner>
          ) : null}
          {micTaken ? <Banner kind="offline" icon={MicVocal}>{t("micTakenBanner")}</Banner> : null}
        </div>
      ) : null}

      {gate === "denied" ? (
        <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-page pb-10">
          <MicDrawing className="size-24 text-ink-3" />
          <h1 className="mt-4 text-center font-display text-h1 font-semibold text-ink">{t("deniedTitle")}</h1>
          <p className="mt-2 max-w-[40ch] text-center text-body text-ink-2">{t("deniedHint")}</p>
          <div className="mt-5 w-full max-w-md rounded-block border border-line p-4">
            <p className="text-small text-ink">{t("deniedIphone")}</p>
            <p className="mt-3 text-small text-ink">{t("deniedAndroid")}</p>
          </div>
          <div className="mt-6 flex w-full max-w-md flex-col gap-2">
            <Button
              variant="primary"
              block
              onClick={() => {
                setSampleVoice(true);
                beginRef.current(false);
              }}
            >
              {t("trySample")}
            </Button>
            <Button variant="secondary" block onClick={() => router.push("/")}>
              {t("backToLibrary")}
            </Button>
          </div>
        </main>
      ) : (
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-page">
        <div className={cn("mt-6 flex min-h-[52px] items-start", !showControls && "invisible")}>
          {showControls ? <RecordClock paused={paused} /> : null}
        </div>

        {showAnnounce && showControls ? (
          <p role="status" className="mt-2 text-center text-small font-medium text-ink-2">
            {t("announcing")}
          </p>
        ) : null}

        {/* Dải giọng sống; khoảnh khắc bắt đầu ghi nở thành chính dải này;
            kết thúc ghi thì gấp lại thành thẻ buổi ghi (M2-03) */}
        <LayoutGroup id="record-ribbon">
          <div className="relative flex w-full flex-1 items-center justify-center py-6">
            {showMoment ? (
              <m.div
                key="moment"
                className="relative flex items-center justify-center overflow-hidden"
                style={{ background: "var(--gradient-dawn)" }}
                initial={{ width: 72, height: 72, borderRadius: 999, opacity: 1 }}
                animate={{ width: "100%", height: 160, borderRadius: 16, opacity: reduce ? 0 : 1 }}
                transition={reduce ? FADE : SCENE}
              >
                <m.span
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="text-on-dawn"
                >
                  <Mic aria-hidden={true} className="size-8" strokeWidth={1.75} />
                </m.span>
              </m.div>
            ) : folding ? (
              <m.div
                key="fold"
                className="w-full"
                initial={reduce ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={FADE}
              >
                <div className="mx-auto w-full max-w-sm">
                  <p className="text-caption font-medium text-ink-3">{t("foldToday")}</p>
                  <m.div layoutId={ribbonBoxId} transition={reduce ? FADE : SCENE} className="overflow-hidden" style={{ borderRadius: 4 }}>
                    <RibbonThumb peaks={foldPeaks} speakers={foldSpeakers} muted />
                  </m.div>
                  <div className="mt-1.5 flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-body-strong font-semibold text-ink">{foldTitle}</p>
                    <span className="shrink-0 text-small tabular-nums text-ink-3">{t("foldProcessing")}</span>
                  </div>
                </div>
              </m.div>
            ) : (
              <m.div
                key="live"
                /* Chỉ ghép cặp layoutId khi buổi ghi đang chạy: hộp dải sống
                 * trong lúc chờ bảng (chưa ghi) không cần tham gia khoảnh khắc
                 * gấp, tránh morph thừa khi hộp gắn lại sau khoảnh khắc bắt đầu. */
                layoutId={active ? ribbonBoxId : undefined}
                transition={reduce ? FADE : SCENE}
                className="w-full overflow-hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ borderRadius: 16 }}
              >
                <RibbonLive level={level} paused={paused} height={160} />
              </m.div>
            )}
            {/* Gợn sóng khi tạo điểm nóng: tại vị trí hiện tại của dải giọng */}
            <AnimatePresence>
              {ripple > 0 ? (
                <m.span
                  key={ripple}
                  aria-hidden={true}
                  className="pointer-events-none absolute right-3 top-1/2 size-10 -translate-y-1/2 rounded-pill border-2 border-on-dawn"
                  initial={{ scale: 0.3, opacity: 0.7 }}
                  animate={{ scale: 1.9, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={reduce ? FADE : { duration: 0.6, ease: EASE }}
                  onAnimationComplete={() => setRipple(0)}
                />
              ) : null}
            </AnimatePresence>
          </div>
        </LayoutGroup>

        {/* Gợi ý im lặng (M2-02) */}
        <div className="flex min-h-10 w-full items-center justify-center">
          {silence && showControls ? (
            <p role="status" className="flex items-center gap-3 rounded-pill bg-surface-2 px-4 py-1.5 text-small text-ink-2">
              {t("silenceHint")}
              <button
                type="button"
                onClick={togglePause}
                className="inline-flex min-h-11 items-center rounded-control px-2 font-semibold text-sen-text underline underline-offset-2"
              >
                {t("pause")}
              </button>
            </p>
          ) : null}
        </div>

        {/* Ô ghi chú và danh sách ghi chú, điểm nóng, ảnh (M2-02) */}
        {showControls ? (
          <RecordFeed recording={recording} tagLabels={tagLabels} onAddNote={addRecordingNote} />
        ) : (
          <div className="h-10" aria-hidden={true} />
        )}

        {/* Hàng điều khiển: Đánh dấu — Tạm dừng/Ghi tiếp — Chụp */}
        <div className={cn("flex w-full items-center justify-between gap-4 py-4", !showControls && "invisible")}>
          {showControls ? (
            <>
              <BookmarkButton
                onBookmark={onBookmark}
                className="flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-control px-3 text-ink-2 transition-colors ease-noteim duration-(--t-quick) hover:bg-surface-2 hover:text-ink select-none [-webkit-touch-callout:none]"
              />
              <RecordButton
                state={paused ? "paused" : "recording"}
                size={88}
                label={paused ? t("resume") : t("pause")}
                onClick={togglePause}
              />
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                aria-label={t("addPhoto")}
                className="flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-control px-3 text-ink-2 transition-colors ease-noteim duration-(--t-quick) hover:bg-surface-2 hover:text-ink"
              >
                <Camera aria-hidden={true} className="size-6" strokeWidth={1.75} />
                <span className="text-caption font-medium">{t("photoLabel")}</span>
              </button>
            </>
          ) : null}
        </div>

        <div className={cn("w-full max-w-sm pb-[max(24px,env(safe-area-inset-bottom))] pt-2", !showControls && "invisible")}>
          {showControls ? <HoldToEndButton label={t("end")} onHold={finishRecording} className="w-full" /> : null}
        </div>
        </main>
      )}

      {/* Chụp ảnh: mockup dùng input capture, ảnh gắn mốc thời gian (M2-02) */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label={t("addPhoto")}
        tabIndex={-1}
        className="hidden"
        onChange={(e) => {
          void onPhotoPicked(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <MicPermissionSheet
        open={gate === "permission"}
        micStatus={mic.status}
        onCancel={() => router.push("/")}
        onAllowed={() => void mic.start()}
      />
      <ConsentSheet
        open={gate === "consent"}
        onConfirm={(announced) => beginRecording(announced)}
        onCancel={() => router.push("/")}
      />
      {/* Hết hạn mức tháng: nút ghi âm vẫn bấm được, bảng giải thích + gói Pro (M2-04) */}
      <Sheet
        open={gate === "quota"}
        onOpenChange={(next) => !next && router.push("/")}
        title={t("quotaOutTitle")}
        size="half"
      >
        <p className="py-2 text-body text-ink-2">
          {t("quotaOutBody", {
            limit: quota.data?.minutes_limit ?? 180,
            date: quota.data ? shortDate(new Date(Date.parse(quota.data.period_end) + 86400_000), locale) : "",
          })}
        </p>
        <Button variant="primary" block onClick={() => router.push("/upgrade")} className="mt-3">
          {t("viewPro")}
        </Button>
      </Sheet>
      <TemplateSheet
        open={templateSheet}
        onOpenChange={setTemplateSheet}
        selectedId={recording.templateId}
        onSelect={(id) => {
          setRecordingTemplate(id);
          setTemplateSheet(false);
        }}
      />
    </div>
  );
}
