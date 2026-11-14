"use client";

import { Mic } from "lucide-react";
import { AnimatePresence, LayoutGroup, animate, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { RibbonLive } from "@/components/ribbon/ribbon-live";
import { RibbonPlayback } from "@/components/ribbon/ribbon-playback";
import { RibbonThumb } from "@/components/ribbon/ribbon-thumb";
import { SummaryBullet } from "@/components/session/summary-bullet";
import { Button } from "@/components/ui/button";
import { TagChip } from "@/components/ui/chips";
import { cn } from "@/lib/cn";
import { samplePeaks, sampleRibbon, sampleSpans, sampleDuration } from "./sample-ribbon";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";

/*
 * Ba khoảnh khắc đặc trưng (docs/02-design-system.md, "Chuyển động").
 * Thời lượng --t-scene (700ms), đường cong --ease.
 * Giảm chuyển động: cả ba chỉ mờ dần 220ms.
 */

const EASE = [0.2, 0.8, 0.2, 1] as const;
const SCENE = { duration: 0.7, ease: EASE };
const FADE = { duration: 0.22, ease: EASE };

/** Âm lượng giả của một người đang nói, để dải giọng sống có nhịp. */
function useFakeVoice(active: boolean) {
  const [level, setLevel] = useState(0.3);
  useEffect(() => {
    if (!active) return;
    let phase = 0;
    const id = window.setInterval(() => {
      phase += 1;
      const speaking = Math.sin(phase / 9) > -0.4;
      setLevel(speaking ? 0.35 + Math.random() * 0.55 : 0.05 + Math.random() * 0.08);
    }, 120);
    return () => window.clearInterval(id);
  }, [active]);
  return level;
}

function Stage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative h-72 overflow-hidden rounded-block border border-line bg-bg", className)}>{children}</div>
  );
}

function MomentFrame({
  title,
  desc,
  ran,
  onRun,
  children,
}: {
  title: string;
  desc: string;
  ran: boolean;
  onRun: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("styleguide.ribbon");
  return (
    <figure className="min-w-0">
      {children}
      <figcaption className="mt-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-small font-semibold text-ink">{title}</p>
          <p className="text-small text-ink-2">{desc}</p>
        </div>
        <Button onClick={onRun}>{ran ? t("again") : t("run")}</Button>
      </figcaption>
    </figure>
  );
}

/* ---------- 1. Bắt đầu ghi ---------- */

function StartRecording() {
  const t = useTranslations("styleguide.ribbon");
  const reduce = useReducedMotionSafe();
  const [live, setLive] = useState(false);
  const [run, setRun] = useState(0);
  const level = useFakeVoice(live);

  function onRun() {
    setLive(false);
    setRun((n) => n + 1);
    window.setTimeout(() => setLive(true), 350);
  }

  return (
    <MomentFrame title={t("m1")} desc={t("m1Desc")} ran={run > 0} onRun={onRun}>
      <Stage>
        <motion.div
          aria-hidden={true}
          className="dark absolute inset-0 bg-bg"
          initial={false}
          animate={{ opacity: live ? 1 : 0 }}
          transition={reduce ? FADE : SCENE}
        />
        <div className={cn("relative flex h-full flex-col items-center px-4", live && "dark")}>
          <AnimatePresence>
            {live ? (
              <motion.p
                key="clock"
                className="mt-6 flex items-center gap-2 font-display text-h1 font-semibold tabular-nums text-ink"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ ...FADE, delay: reduce ? 0 : 0.35 }}
              >
                <span className="size-2.5 rounded-pill bg-sen" />
                00:03
              </motion.p>
            ) : null}
          </AnimatePresence>
          <LayoutGroup id={`m1-${run}`}>
            {reduce ? (
              <AnimatePresence mode="wait" initial={false}>
                {live ? (
                  <motion.div key="r" className="mt-auto mb-12 w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE}>
                    <RibbonLive level={level} height={120} />
                  </motion.div>
                ) : (
                  <motion.div key="b" className="mt-auto mb-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE}>
                    <RecordGlyph />
                  </motion.div>
                )}
              </AnimatePresence>
            ) : live ? (
              <motion.div
                layoutId="shape"
                transition={SCENE}
                className="relative mb-12 mt-auto h-[120px] w-full overflow-hidden"
                style={{ borderRadius: 16 }}
              >
                <motion.div
                  className="absolute inset-0"
                  style={{ background: "var(--gradient-dawn)" }}
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 }}
                />
                <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.4 }}>
                  <RibbonLive level={level} height={120} />
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                layoutId="shape"
                transition={SCENE}
                className="mb-6 mt-auto flex size-18 items-center justify-center text-on-dawn shadow-record"
                style={{ borderRadius: 999, background: "var(--gradient-dawn)" }}
              >
                <Mic aria-hidden={true} className="size-7" strokeWidth={1.75} />
              </motion.div>
            )}
          </LayoutGroup>
        </div>
      </Stage>
    </MomentFrame>
  );
}

function RecordGlyph() {
  return (
    <span
      className="flex size-18 items-center justify-center rounded-pill text-on-dawn shadow-record"
      style={{ background: "var(--gradient-dawn)" }}
    >
      <Mic aria-hidden={true} className="size-7" strokeWidth={1.75} />
    </span>
  );
}

/* ---------- 2. Kết thúc ghi ---------- */

function StopRecording() {
  const t = useTranslations("styleguide.ribbon");
  const reduce = useReducedMotionSafe();
  const [folded, setFolded] = useState(false);
  const [run, setRun] = useState(0);
  const level = useFakeVoice(!folded);

  function onRun() {
    if (folded) {
      setFolded(false);
      window.setTimeout(() => {
        setRun((n) => n + 1);
        setFolded(true);
      }, 900);
    } else {
      setRun((n) => n + 1);
      setFolded(true);
    }
  }

  const row = (
    <div className="border-b border-line py-3">
      <p className="text-body-strong font-semibold text-ink">{t("newTitle")}</p>
      <div className="mt-1.5 flex items-center gap-3 overflow-hidden">
        {reduce ? (
          <RibbonThumb peaks={sampleRibbon.peaks} speakers={sampleRibbon.speakers} muted />
        ) : (
          <motion.div layoutId="box" transition={SCENE} className="overflow-hidden" style={{ borderRadius: 4 }}>
            <RibbonThumb peaks={sampleRibbon.peaks} speakers={sampleRibbon.speakers} muted />
          </motion.div>
        )}
        <span className="shrink-0 whitespace-nowrap text-small tabular-nums text-ink-3">{t("duration")}</span>
      </div>
      <p className="mt-1.5 text-small text-ink-2">{t("processing")}</p>
    </div>
  );

  return (
    <MomentFrame title={t("m2")} desc={t("m2Desc")} ran={run > 0} onRun={onRun}>
      <Stage>
        <motion.div
          aria-hidden={true}
          className="dark absolute inset-0 bg-bg"
          initial={false}
          animate={{ opacity: folded ? 0 : 1 }}
          transition={reduce ? FADE : { ...SCENE, delay: 0.15 }}
        />
        <LayoutGroup id={`m2-${run}`}>
          <div className={cn("relative h-full px-4", !folded && "dark")}>
            {!folded ? (
              <div className="flex h-full flex-col items-center">
                <p className="mt-6 flex items-center gap-2 font-display text-h1 font-semibold tabular-nums text-ink">
                  <span className="size-2.5 rounded-pill bg-sen" />
                  42:10
                </p>
                {reduce ? (
                  <div className="mb-12 mt-auto w-full">
                    <RibbonLive level={level} height={120} />
                  </div>
                ) : (
                  <motion.div layoutId="box" transition={SCENE} className="mb-12 mt-auto w-full overflow-hidden" style={{ borderRadius: 16 }}>
                    <RibbonLive level={level} height={120} />
                  </motion.div>
                )}
              </div>
            ) : (
              <motion.div
                className="pt-4"
                initial={reduce ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={FADE}
              >
                <p className="text-caption font-medium text-ink-3">{t("today")}</p>
                <motion.div
                  initial={reduce ? false : { y: -8 }}
                  animate={{ y: 0 }}
                  transition={{ ...SCENE, delay: 0.2 }}
                >
                  {row}
                </motion.div>
                <motion.div
                  className="border-b border-line py-3"
                  initial={reduce ? false : { y: -72 }}
                  animate={{ y: 0 }}
                  transition={{ ...SCENE, delay: 0.1 }}
                >
                  <p className="text-body-strong font-semibold text-ink">{t("older")}</p>
                  <div className="mt-1.5 flex items-center gap-3 overflow-hidden">
                    <RibbonThumb peaks={[...sampleRibbon.peaks].reverse()} speakers={sampleRibbon.speakers.map((s) => (s + 1) % 4)} />
                    <span className="shrink-0 whitespace-nowrap text-small tabular-nums text-ink-3">{t("olderDuration")}</span>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </div>
        </LayoutGroup>
      </Stage>
    </MomentFrame>
  );
}

/* ---------- 3. Xử lý xong ---------- */

function ProcessingDone() {
  const t = useTranslations("styleguide.ribbon");
  const reduce = useReducedMotionSafe();
  const [dye, setDye] = useState(0);
  const [showPoints, setShowPoints] = useState(false);
  const [run, setRun] = useState(0);
  const anim = useRef<{ stop: () => void } | null>(null);

  function onRun() {
    anim.current?.stop();
    setShowPoints(false);
    setDye(0);
    setRun((n) => n + 1);
    if (reduce) {
      window.setTimeout(() => {
        setDye(1);
        setShowPoints(true);
      }, 220);
      return;
    }
    anim.current = animate(0, 1, {
      duration: 0.7,
      ease: EASE,
      delay: 0.25,
      onUpdate: setDye,
      onComplete: () => setShowPoints(true),
    });
  }

  useEffect(() => () => anim.current?.stop(), []);

  const bullets = [
    ["b2", "04:30", 1],
    ["b3", "18:40", 2],
  ] as const;

  return (
    <MomentFrame title={t("m3")} desc={t("m3Desc")} ran={run > 0} onRun={onRun}>
      <Stage className="px-4 pt-4">
        <p className="text-body-strong font-semibold text-ink">{t("newTitle")}</p>
        <div className="mt-1 flex h-6 items-center gap-2">
          <AnimatePresence mode="wait" initial={false}>
            {showPoints ? (
              <motion.span key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={FADE}>
                <TagChip size="sm" tag="pending" label={t("template")} />
              </motion.span>
            ) : (
              <motion.span key="wait" className="text-small text-ink-2" exit={{ opacity: 0 }} transition={FADE}>
                {t("processing")}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <RibbonPlayback
          className="mt-2"
          peaks={samplePeaks}
          spans={sampleSpans}
          duration={sampleDuration}
          currentTime={sampleDuration}
          dye={dye}
          height={40}
          interactive={false}
          label={t("position")}
        />
        <motion.div
          className="mt-3"
          initial={false}
          animate={showPoints ? "shown" : "hidden"}
          variants={{ shown: { transition: { staggerChildren: reduce ? 0 : 0.09 } }, hidden: {} }}
        >
          {bullets.map(([id, time, speaker]) => (
            <motion.div
              key={id}
              variants={{
                hidden: { opacity: 0, y: reduce ? 0 : 6 },
                shown: { opacity: 1, y: 0, transition: reduce ? FADE : { duration: 0.34, ease: EASE } },
              }}
            >
              <SummaryBullet text={t(id)} time={time} speakerColorIndex={speaker} seekLabel={t("seek")} />
            </motion.div>
          ))}
        </motion.div>
      </Stage>
    </MomentFrame>
  );
}

export function Moments() {
  return (
    <div className="grid gap-8 lg:grid-cols-3 lg:gap-6">
      <StartRecording />
      <StopRecording />
      <ProcessingDone />
    </div>
  );
}
