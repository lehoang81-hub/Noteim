import { Hourglass, Mic, Play, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

/*
 * Khối "Xem nhanh": một mẩu màn hình dựng hoàn toàn bằng token, để nhìn
 * bảng màu "sống" ra sao trước khi đọc từng token.
 * Đây chưa phải component chính thức (M0-03), nên nằm trong app/styleguide.
 * Không dùng tiện ích dark: ở đây, vì khối này có thể bị ép sáng hoặc tối
 * bằng class .light/.dark, độc lập với giao diện của trang.
 */

/* Dải giọng thu nhỏ: 40 cột, cao 28, tô theo người nói. Dữ liệu tĩnh. */
const BARS = [
  0.35, 0.6, 0.85, 0.5, 0.7, 0.95, 0.4, 0.55, 0.3, 0.75, 0.9, 0.6, 0.45, 0.8, 0.5, 0.25,
  0.65, 0.85, 1, 0.7, 0.5, 0.35, 0.6, 0.8, 0.55, 0.4, 0.7, 0.9, 0.65, 0.3, 0.5, 0.75, 0.95,
  0.6, 0.45, 0.7, 0.55, 0.35, 0.6, 0.4,
];
const SPEAKER_OF_BAR = (i: number) => (i < 13 ? 1 : i < 22 ? 2 : i < 26 ? 3 : i < 34 ? 1 : 2);

function RibbonThumb() {
  return (
    <span aria-hidden={true} className="flex h-7 items-center gap-0.5">
      {BARS.map((h, i) => (
        <span
          key={i}
          className="w-[3px] shrink-0 rounded-pill"
          style={{ height: `${Math.round(h * 28)}px`, backgroundColor: `var(--speaker-${SPEAKER_OF_BAR(i)})` }}
        />
      ))}
    </span>
  );
}

export function Preview({ scheme }: { scheme?: "light" | "dark" }) {
  const t = useTranslations("styleguide.preview");

  return (
    <div className={`${scheme ?? ""} rounded-block border border-line bg-bg p-4 text-ink sm:p-5`}>
      {/* Hàng buổi ghi trong thư viện */}
      <p className="text-caption font-medium text-ink-3">{t("today")}</p>
      <div className="mt-1 border-b border-line pb-4">
        <p className="text-body-strong font-semibold">{t("sessionTitle")}</p>
        <div className="mt-2 flex items-center gap-3">
          <RibbonThumb />
          <span className="text-small tabular-nums text-ink-3">{t("duration")}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1 rounded-pill bg-tag-pending-bg px-2 py-0.5 text-caption font-medium text-tag-pending">
            <Hourglass aria-hidden={true} className="size-3.5" strokeWidth={2} />
            {t("tagPending")}
          </span>
          <span className="text-small text-ink-2">{t("template")}</span>
        </div>
      </div>

      {/* Ý tóm tắt đang phát */}
      <div className="mt-4 flex items-start gap-3 border-l-2 border-sen pl-3">
        <span aria-hidden={true} className="mt-2 size-2 shrink-0 rounded-pill" style={{ backgroundColor: "var(--speaker-2)" }} />
        <p className="min-w-0 flex-1 text-body">{t("bullet")}</p>
        <span className="pt-0.5 text-caption font-medium tabular-nums text-sen-text">{t("bulletTime")}</span>
      </div>

      {/* Khối AI */}
      <div className="mt-4 rounded-block bg-dien-tint p-4">
        <p className="flex items-center gap-1.5 text-caption font-medium text-dien">
          <Sparkles aria-hidden={true} className="size-4" strokeWidth={1.75} />
          {t("aiLabel")}
        </p>
        <p className="mt-1.5 text-body">{t("aiAnswer")}</p>
        <div className="mt-3 flex gap-2">
          {[t("cite1"), t("cite2")].map((time) => (
            <span
              key={time}
              className="inline-flex items-center gap-1 rounded-pill bg-surface px-2.5 py-1 text-caption font-medium tabular-nums text-dien"
            >
              <Play aria-hidden={true} className="size-3" strokeWidth={2.25} />
              {time}
            </span>
          ))}
        </div>
      </div>

      {/* Hành động */}
      <div className="mt-5 flex items-center gap-2">
        <span className="inline-flex h-11 items-center rounded-control bg-sen px-4 text-small font-semibold text-on-sen">
          {t("primary")}
        </span>
        <span className="inline-flex h-11 items-center gap-1.5 rounded-control border border-line bg-surface px-3.5 text-small font-semibold text-dien">
          <Sparkles aria-hidden={true} className="size-4" strokeWidth={1.75} />
          {t("secondary")}
        </span>
        <span
          role="img"
          aria-label={t("record")}
          className="ml-auto flex size-16 shrink-0 items-center justify-center rounded-pill text-on-dawn shadow-record sm:size-18"
          style={{ background: "var(--gradient-dawn)" }}
        >
          <Mic aria-hidden={true} className="size-7" strokeWidth={1.75} />
        </span>
      </div>
    </div>
  );
}
