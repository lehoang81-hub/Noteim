"use client";

import { CircleHelp } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

/*
 * Trang "Mẹo ghi âm và câu hỏi thường gặp" (C1-09 mục 5): nội dung ngắn,
 * dễ đọc trên điện thoại, đủ vi/en/ko qua next-intl. Mở từ Cài đặt và từ
 * dòng gợi ý sửa lời ở tab Lời của buổi thật.
 */
const TIP_KEYS = ["place", "turn", "merge", "wrongSpeaker", "wrongWord", "translation"] as const;

export function HelpScreen() {
  const t = useTranslations("help");
  const ts = useTranslations("settings");
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="px-page pt-2 lg:px-8">
        <Link href="/settings" className="inline-flex min-h-11 items-center text-small font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
          {ts("backToList")}
        </Link>
        <h1 className="mt-2 font-display text-h1 font-semibold text-ink lg:mt-0">{t("title")}</h1>
      </div>
      <div className="px-page pb-40 pt-4 lg:px-8 lg:pt-6">
        <ul className="flex max-w-[60ch] flex-col divide-y divide-line rounded-block border border-line">
          {TIP_KEYS.map((key) => (
            <li key={key} className="flex gap-3 px-4 py-3">
              <CircleHelp aria-hidden={true} className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
              <p className="text-body text-ink">{t(key)}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
