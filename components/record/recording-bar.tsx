"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatClock } from "@/components/ribbon/draw";
import { cn } from "@/lib/cn";
import { recordedSec, useRecording } from "@/lib/record/recording-store";

/*
 * Thanh đang ghi trên mọi trang khác màn hình ghi (docs/03-screens.md mục 15):
 * "● 12:47 Đang ghi", chạm để quay lại màn hình ghi. Buổi ghi vẫn chạy khi
 * rời màn hình ghi, nên đồng hồ ở đây luôn đúng.
 */

export function RecordingBar() {
  const t = useTranslations("record");
  const recording = useRecording();
  const [sec, setSec] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setSec(recordedSec()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (recording.status === "idle") return null;
  const paused = recording.status === "paused";

  return (
    <Link
      href="/record"
      className="flex min-h-11 items-center gap-2 bg-sen px-page py-1.5 text-caption font-medium text-on-sen"
      aria-label={paused ? t("miniPaused") : t("miniRecording")}
    >
      <span
        aria-hidden={true}
        className={cn("size-2 shrink-0 rounded-pill bg-on-sen", !paused && "animate-pulse motion-reduce:animate-none")}
      />
      <span className="tabular-nums">{formatClock(sec)}</span>
      <span className="min-w-0 truncate">{paused ? t("miniPaused") : t("miniRecording")}</span>
    </Link>
  );
}
