"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AiBlock } from "@/components/session/ai-block";
import { SessionRow } from "@/components/session/session-row";
import { SummaryBullet } from "@/components/session/summary-bullet";
import { Button } from "@/components/ui/button";
import { RecordButton } from "@/components/ui/record-button";
import { sampleRibbon } from "./sample-ribbon";

/*
 * Khối "Xem nhanh": một mẩu màn hình ghép từ component dùng chung,
 * để nhìn bảng màu "sống" ra sao trước khi đọc từng token.
 * Có thể bị ép sáng hoặc tối bằng class .light/.dark, độc lập với trang.
 */
export function Preview({ scheme }: { scheme?: "light" | "dark" }) {
  const t = useTranslations("styleguide.preview");
  const [playing, setPlaying] = useState(true);

  return (
    <div className={`${scheme ?? ""} rounded-block border border-line bg-bg px-4 pb-4 pt-3 text-ink sm:px-5`}>
      <p className="text-caption font-medium text-ink-3">{t("today")}</p>
      <SessionRow
        href="#preview"
        className="pt-1"
        title={t("sessionTitle")}
        duration={t("duration")}
        template={t("template")}
        peaks={sampleRibbon.peaks}
        speakers={sampleRibbon.speakers}
        tag={{ tag: "pending", label: t("tagPending") }}
      />

      <div className="mt-3">
        <SummaryBullet
          text={t("bullet")}
          time={t("bulletTime")}
          speakerColorIndex={1}
          playing={playing}
          seekLabel={t("seek")}
          onSeek={() => setPlaying((p) => !p)}
        />
      </div>

      <div className="mt-3">
        <AiBlock state="done" label={t("aiLabel")} text={t("aiAnswer")} citations={[t("cite1"), t("cite2")]} citationLabel={t("seek")} />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button variant="primary">{t("primary")}</Button>
        <Button variant="ai" icon={Sparkles}>
          {t("secondary")}
        </Button>
        <RecordButton label={t("record")} className="ml-auto" />
      </div>
    </div>
  );
}
