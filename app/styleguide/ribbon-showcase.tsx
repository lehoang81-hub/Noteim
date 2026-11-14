"use client";

import { Mic, MicOff, Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { RibbonLive } from "@/components/ribbon/ribbon-live";
import { RibbonPlayback } from "@/components/ribbon/ribbon-playback";
import { RibbonThumb } from "@/components/ribbon/ribbon-thumb";
import { FloatingPlayer } from "@/components/session/floating-player";
import { Button } from "@/components/ui/button";
import { useMicLevel } from "@/lib/audio/use-mic-level";
import { createMockPlayer, usePlayerState } from "@/lib/player/mock-player";
import { Moments } from "./moments";
import {
  sampleBookmarks,
  sampleDuration,
  sampleHeat,
  samplePeaks,
  sampleRibbon,
  sampleSpans,
} from "./sample-ribbon";

/*
 * Mục "Dải giọng" trên /styleguide: ba dạng dải giọng, trình phát nổi,
 * ba khoảnh khắc đặc trưng. Dữ liệu là mẫu cho trang trưng bày.
 */

function Block({ name, desc, children }: { name: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line pb-2 pt-6 first:border-t-0 first:pt-0">
      <h3 className="text-body-strong font-semibold text-ink">{name}</h3>
      <p className="mt-0.5 max-w-[62ch] text-small text-ink-2">{desc}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function RibbonShowcase() {
  const t = useTranslations("styleguide.ribbon");
  const [player] = useState(() => createMockPlayer(sampleDuration, 612));
  const state = usePlayerState(player);
  const [manual, setManual] = useState(0.55);
  const [livePaused, setLivePaused] = useState(false);
  const mic = useMicLevel();
  const [expanded, setExpanded] = useState(true);
  const [firstExpanded, setFirstExpanded] = useState(false);

  // Dừng đồng hồ khi rời trang
  useEffect(() => () => player.pause(), [player]);

  const level = mic.status === "on" ? mic.level : manual;

  return (
    <div className="flex flex-col gap-6">
      <Block name={t("thumb")} desc={t("thumbDesc")}>
        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <figure>
            <RibbonThumb peaks={sampleRibbon.peaks} speakers={sampleRibbon.speakers} />
            <figcaption className="mt-1.5 text-caption text-ink-3">{t("normal")}</figcaption>
          </figure>
          <figure>
            <RibbonThumb peaks={sampleRibbon.peaks} speakers={sampleRibbon.speakers} muted />
            <figcaption className="mt-1.5 text-caption text-ink-3">{t("muted")}</figcaption>
          </figure>
        </div>
      </Block>

      <Block name={t("playback")} desc={t("playbackDesc")}>
        <RibbonPlayback
          peaks={samplePeaks}
          spans={sampleSpans}
          duration={state.duration}
          currentTime={state.currentTime}
          onSeek={player.seek}
          bookmarks={sampleBookmarks}
          heat={sampleHeat}
          label={t("position")}
        />
      </Block>

      <Block name={t("live")} desc={t("liveDesc")}>
        <div className="dark overflow-hidden rounded-block border border-line bg-bg px-4 py-2">
          <RibbonLive level={level} paused={livePaused} />
        </div>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          <label className="flex min-h-11 flex-1 items-center gap-3 text-small text-ink-2">
            <span className="shrink-0">{t("level")}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(level * 100)}
              disabled={mic.status === "on"}
              onChange={(e) => setManual(Number(e.target.value) / 100)}
              className="h-11 min-w-0 flex-1 accent-sen disabled:opacity-50"
            />
            <span className="w-9 shrink-0 text-right tabular-nums text-ink">{Math.round(level * 100)}</span>
          </label>
          <div className="flex gap-2">
            <Button icon={livePaused ? Play : Pause} onClick={() => setLivePaused((p) => !p)}>
              {livePaused ? t("resume") : t("pause")}
            </Button>
            {mic.status === "on" ? (
              <Button icon={MicOff} onClick={mic.stop}>
                {t("micOff")}
              </Button>
            ) : (
              <Button icon={Mic} loading={mic.status === "asking"} onClick={mic.start}>
                {mic.status === "asking" ? t("micAsking") : t("micOn")}
              </Button>
            )}
          </div>
        </div>
        <p role="status" className="mt-2 text-small text-ink-2">
          {mic.status === "denied"
            ? t("micDenied")
            : mic.status === "unsupported"
              ? t("micUnsupported")
              : t("micPrivacy")}
        </p>
      </Block>

      <Block name={t("player")} desc={t("playerDesc")}>
        <div className="grid gap-6 lg:grid-cols-2">
          <figure>
            <FloatingPlayer
              player={player}
              peaks={samplePeaks}
              spans={sampleSpans}
              bookmarks={sampleBookmarks}
              heat={sampleHeat}
              expanded={firstExpanded}
              onExpandedChange={setFirstExpanded}
            />
            <figcaption className="mt-1.5 text-caption text-ink-3">{t("collapsed")}</figcaption>
          </figure>
          <figure>
            <FloatingPlayer
              player={player}
              peaks={samplePeaks}
              spans={sampleSpans}
              bookmarks={sampleBookmarks}
              heat={sampleHeat}
              expanded={expanded}
              onExpandedChange={setExpanded}
            />
            <figcaption className="mt-1.5 text-caption text-ink-3">{t("expanded")}</figcaption>
          </figure>
        </div>
      </Block>

      <Block name={t("moments")} desc={t("momentsDesc")}>
        <Moments />
      </Block>
    </div>
  );
}
