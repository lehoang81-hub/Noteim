"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ChevronDown, Mic } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { RibbonLive } from "@/components/ribbon/ribbon-live";
import { formatClock } from "@/components/ribbon/draw";
import { BookmarkButton } from "@/components/record/bookmark-button";
import { HoldToEndButton } from "@/components/record/hold-to-end-button";
import { RecordFeed } from "@/components/record/record-feed";
import { ConsentSheet, MicPermissionSheet, TemplateSheet } from "@/components/record/sheets";
import { RecordButton } from "@/components/ui/record-button";
import { useMicLevel } from "@/lib/audio/use-mic-level";
import { cn } from "@/lib/cn";
import { data, useData } from "@/lib/data";
import { micGrantedOnce, markMicGranted } from "@/lib/record/mic-permission";
import { fileToDataUrl } from "@/lib/record/photo";
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
  startRecording,
  useRecording,
} from "@/lib/record/recording-store";
import { keepScreenAwake, letScreenSleep } from "@/lib/record/wake-lock";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
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

type Gate = "boot" | "permission" | "consent";

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
  const tl = useTranslations("styleguide.tags");
  const router = useRouter();
  const recording = useRecording();
  const mic = useMicLevel();
  const me = useData(() => data.account.me(), []);
  const templates = useData(() => data.account.templates(), []);
  const reduce = useReducedMotionSafe();

  /** Bảng đang chờ trước khi ghi; null là không chờ gì (đang ghi hoặc đã xong luồng). */
  const [gate, setGate] = useState<Gate | null>("boot");
  const [momentOn, setMomentOn] = useState(false);
  const [showAnnounce, setShowAnnounce] = useState(false);
  const [templateSheet, setTemplateSheet] = useState(false);
  const [ripple, setRipple] = useState(0);
  const [silence, setSilence] = useState(false);
  const momentTimer = useRef(0);
  const announceTimer = useRef(0);
  const decided = useRef(false);
  const startingMic = useRef(false);
  const levelRef = useRef(0);
  const beginRef = useRef<(announce: boolean) => void>(() => {});
  const lastVoiceRef = useRef(0);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const active = recording.status !== "idle";
  const paused = recording.status === "paused";
  const templateName = templates.data?.find((tp) => tp.id === recording.templateId)?.name ?? "";
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
  });

  // Quyết định một lần duy nhất khi mở màn hình: đang ghi dở, cần xin quyền,
  // cần hỏi đồng ý, hay ghi luôn
  useEffect(() => {
    if (decided.current) return;
    if (recording.status !== "idle") {
      decided.current = true;
      const id = window.setTimeout(() => setGate(null), 0);
      return () => window.clearTimeout(id);
    }
    if (!me.data) return; // chờ hồ sơ để biết có bật nhắc đồng ý hay không
    decided.current = true;
    if (!micGrantedOnce()) {
      const id = window.setTimeout(() => setGate("permission"), 0);
      return () => window.clearTimeout(id);
    }
    if (me.data.consent_reminder) {
      const id = window.setTimeout(() => setGate("consent"), 0);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => beginRef.current(false), 0);
    return () => window.clearTimeout(id);
  }, [me.data, recording.status]);

  // Được cấp quyền micro: ghi nhớ để lần sau bỏ qua bảng xin quyền, rồi hỏi
  // đồng ý (nếu bật) hoặc ghi luôn
  useEffect(() => {
    if (gate !== "permission" || mic.status !== "on") return;
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
    levelRef.current = mic.level;
  }, [mic.level]);
  useEffect(() => {
    const id = window.setInterval(() => pushRecordingLevel(levelRef.current), 250);
    return () => window.clearInterval(id);
  }, []);

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
    else if (recording.status === "paused") resumeRecording();
  }

  // Ở issue này kết thúc chỉ cần dừng và về thư viện (M2-03 tạo buổi ghi)
  function handleEnd() {
    mic.stop();
    letScreenSleep();
    endRecording();
    router.push("/");
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
  const showControls = active && !momentOn;

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
          <span className="max-w-[38vw] truncate sm:max-w-64">{templateName || " "}</span>
          <ChevronDown aria-hidden={true} className="size-4 shrink-0 text-ink-3" strokeWidth={2} />
        </button>
        <span
          className="flex size-11 shrink-0 items-center justify-end gap-1.5 text-caption font-medium text-ink-2"
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

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-page">
        <div className={cn("mt-6 flex min-h-[52px] items-start", !showControls && "invisible")}>
          {showControls ? <RecordClock paused={paused} /> : null}
        </div>

        {showAnnounce && showControls ? (
          <p role="status" className="mt-2 text-center text-small font-medium text-ink-2">
            {t("announcing")}
          </p>
        ) : null}

        {/* Dải giọng sống; khoảnh khắc bắt đầu ghi nở thành chính dải này */}
        <div className="relative flex w-full flex-1 items-center justify-center py-6">
          {showMoment ? (
            <motion.div
              className="relative flex items-center justify-center overflow-hidden"
              style={{ background: "var(--gradient-dawn)" }}
              initial={{ width: 72, height: 72, borderRadius: 999, opacity: 1 }}
              animate={{ width: "100%", height: 160, borderRadius: 16, opacity: reduce ? 0 : 1 }}
              transition={reduce ? FADE : SCENE}
            >
              <motion.span
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="text-on-dawn"
              >
                <Mic aria-hidden={true} className="size-8" strokeWidth={1.75} />
              </motion.span>
            </motion.div>
          ) : (
            <motion.div className="w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={FADE}>
              <RibbonLive level={mic.level} paused={paused} height={160} />
            </motion.div>
          )}
          {/* Gợn sóng khi tạo điểm nóng: tại vị trí hiện tại của dải giọng */}
          <AnimatePresence>
            {ripple > 0 ? (
              <motion.span
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

        {/* Gợi ý im lặng (M2-02) */}
        <div className="flex min-h-10 w-full items-center justify-center">
          {silence && showControls ? (
            <p role="status" className="flex items-center gap-3 rounded-pill bg-surface-2 px-4 py-1.5 text-small text-ink-2">
              {t("silenceHint")}
              <button
                type="button"
                onClick={togglePause}
                className="inline-flex h-8 items-center rounded-control px-2 font-semibold text-sen-text underline underline-offset-2"
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
          {showControls ? <HoldToEndButton label={t("end")} onHold={handleEnd} className="w-full" /> : null}
        </div>
      </main>

      {/* Chụp ảnh: mockup dùng input capture, ảnh gắn mốc thời gian (M2-02) */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
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
