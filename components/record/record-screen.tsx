"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Mic } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { RibbonLive } from "@/components/ribbon/ribbon-live";
import { formatClock } from "@/components/ribbon/draw";
import { HoldToEndButton } from "@/components/record/hold-to-end-button";
import { ConsentSheet, MicPermissionSheet, TemplateSheet } from "@/components/record/sheets";
import { RecordButton } from "@/components/ui/record-button";
import { useMicLevel } from "@/lib/audio/use-mic-level";
import { cn } from "@/lib/cn";
import { data, useData } from "@/lib/data";
import { micGrantedOnce, markMicGranted } from "@/lib/record/mic-permission";
import {
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

/*
 * Màn hình ghi âm /record (docs/03-screens.md mục 2, 3; issue M2-01).
 * - Luôn nền chàm đêm: bọc vùng bằng class .dark, không phụ thuộc giao diện
 *   đang mở. Khung ứng dụng ẩn trên đường dẫn này (components/shell/app-shell.tsx).
 * - Luồng bắt đầu: lần đầu xin quyền micro → hỏi đồng ý ghi âm (nếu bật nhắc)
 *   → khoảnh khắc "Bắt đầu ghi" → đang ghi. Từ lần thứ hai tối đa 2 lần chạm.
 * - Khoảnh khắc "Bắt đầu ghi": nút ghi âm nở thành dải giọng, --t-scene,
 *   giảm chuyển động thì mờ dần 220ms.
 * - Kết thúc: nhấn giữ 0,8 giây (HoldToEndButton). Ở issue này dừng và về
 *   thư viện; tạo buổi ghi và màn hình xử lý là M2-03.
 */

const EASE = [0.2, 0.8, 0.2, 1] as const;
const SCENE = { duration: 0.7, ease: EASE };
const FADE = { duration: 0.22, ease: EASE };
const MOMENT_MS = 700;

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
  const momentTimer = useRef(0);
  const announceTimer = useRef(0);
  const decided = useRef(false);
  const startingMic = useRef(false);
  const levelRef = useRef(0);
  const beginRef = useRef<(announce: boolean) => void>(() => {});

  const active = recording.status !== "idle";
  const paused = recording.status === "paused";
  const templateName = templates.data?.find((tp) => tp.id === recording.templateId)?.name ?? "";

  /* ----- Luồng bắt đầu ghi ----- */

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
    // beginRecording luôn qua beginRef, không cần vào deps
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

  const showMoment = active && momentOn;
  const showControls = active && !momentOn;

  return (
    <div className="dark flex min-h-dvh flex-col bg-bg text-ink">
      <header className="flex min-h-14 items-center gap-2 px-page pt-2">
        {/* M2-02: nút thu nhỏ màn hình ghi nằm ở đây */}
        <span className="size-11 shrink-0" aria-hidden={true} />
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

      <main className="flex flex-1 flex-col items-center px-page">
        <div className={cn("mt-6 flex min-h-[52px] items-start", !showControls && "invisible")}>
          {showControls ? <RecordClock paused={paused} /> : null}
        </div>

        {showAnnounce && showControls ? (
          <p role="status" className="mt-2 text-center text-small font-medium text-ink-2">
            {t("announcing")}
          </p>
        ) : null}

        {/* Dải giọng sống; khoảnh khắc bắt đầu ghi nở thành chính dải này */}
        <div className="flex w-full flex-1 items-center justify-center py-6">
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
        </div>

        {/* Hàng điều khiển: M2-02 thêm Đánh dấu và Chụp hai bên nút giữa */}
        <div className={cn("flex w-full items-center justify-center gap-6 pb-4", !showControls && "invisible")}>
          {showControls ? (
            <RecordButton
              state={paused ? "paused" : "recording"}
              size={88}
              label={paused ? t("resume") : t("pause")}
              onClick={togglePause}
            />
          ) : null}
        </div>

        <div className={cn("w-full max-w-sm pb-[max(24px,env(safe-area-inset-bottom))] pt-2", !showControls && "invisible")}>
          {showControls ? <HoldToEndButton label={t("end")} onHold={handleEnd} className="w-full" /> : null}
        </div>
      </main>

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
