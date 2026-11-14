import {
  ChartColumn,
  Check,
  Hourglass,
  Lightbulb,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { formatRatio } from "@/lib/contrast";
import {
  actionColors,
  baseColors,
  dawnStops,
  pageMargins,
  pairRatio,
  radii,
  spacingScale,
  speakerColors,
  tagColors,
  tagDarkBg,
  tagRatio,
  type RatioPair,
  type TagId,
} from "./palette-data";

function formatVN(ratio: number): string {
  return formatRatio(ratio).replace(".", ",");
}

type Translations = Awaited<ReturnType<typeof getTranslations>>;

function RatioBadge({ ratio, t }: { ratio: RatioPair; t: Translations }) {
  return (
    <p className="text-caption text-ink-3 tabular-nums">
      {t("contrastRatio", { ratio: formatVN(ratio.light) })} ({t("lightLabel")})
      {" · "}
      {t("contrastRatio", { ratio: formatVN(ratio.dark) })} ({t("darkLabel")})
    </p>
  );
}

function Section({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-12">
      <h2 id={id} className="text-h2 font-semibold text-ink">
        {title}
      </h2>
      {hint ? <p className="mt-1 max-w-[68ch] text-small text-ink-2">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({
  children,
}: {
  children: React.ReactNode;
}) {
  return <li className="flex flex-wrap items-center gap-4 py-4">{children}</li>;
}

function RowText({
  cssVar,
  name,
  usage,
  codes,
  children,
}: {
  cssVar: string;
  name?: string;
  usage?: string;
  codes?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-body-strong tabular-nums">{cssVar}</p>
      {name ? <p className="text-small text-ink-2">{name}</p> : null}
      {usage ? <p className="text-caption text-ink-3">{usage}</p> : null}
      {codes ? <p className="text-caption text-ink-3 tabular-nums">{codes}</p> : null}
      {children}
    </div>
  );
}

/* Thang chữ: cỡ/dòng ghi ở đây để in ra màn hình, nguồn sự thật vẫn là tokens.css. */
const typeTokens = [
  { id: "typeDisplay", textClass: "text-display", roleFont: "display", weight: 700, size: 32, line: 40 },
  { id: "typeH1", textClass: "text-h1", roleFont: "display", weight: 600, size: 24, line: 32 },
  { id: "typeH2", textClass: "text-h2", roleFont: "body", weight: 600, size: 19, line: 26 },
  { id: "typeBody", textClass: "text-body", roleFont: "body", weight: 400, size: 16, line: 25 },
  { id: "typeBodyStrong", textClass: "text-body-strong", roleFont: "body", weight: 600, size: 16, line: 25 },
  { id: "typeSmall", textClass: "text-small", roleFont: "body", weight: 400, size: 14, line: 21 },
  { id: "typeCaption", textClass: "text-caption", roleFont: "body", weight: 500, size: 12, line: 17 },
] as const;

const weightClasses: Record<number, string> = {
  400: "font-normal",
  500: "font-medium",
  600: "font-semibold",
  700: "font-bold",
};

const tagIcons: Record<TagId, LucideIcon> = {
  decided: Check,
  pending: Hourglass,
  risk: TriangleAlert,
  idea: Lightbulb,
  figure: ChartColumn,
};

const tagClassNames: Record<TagId, string> = {
  decided: "bg-tag-decided-bg text-tag-decided",
  pending: "bg-tag-pending-bg text-tag-pending",
  risk: "bg-tag-risk-bg text-tag-risk",
  idea: "bg-tag-idea-bg text-tag-idea",
  figure: "bg-tag-figure-bg text-tag-figure",
};

const tagMessageKeys: Record<TagId, string> = {
  decided: "tagDecided",
  pending: "tagPending",
  risk: "tagRisk",
  idea: "tagIdea",
  figure: "tagFigure",
};

function codesLine(t: Translations, light: string, dark: string): string {
  return `${t("lightLabel")}: ${light.toUpperCase()} · ${t("darkLabel")}: ${dark.toUpperCase()}`;
}

export default async function StyleguidePage() {
  const t = await getTranslations("styleguide");

  const inkOnBg = pairRatio(baseColors.ink, baseColors.bg);
  const inkOnSurface = pairRatio(baseColors.ink, baseColors.surface);
  const inkOnSurface2 = pairRatio(baseColors.ink, baseColors.surface2);
  const ink2OnBg = pairRatio(baseColors.ink2, baseColors.bg);
  const ink2OnSurface = pairRatio(baseColors.ink2, baseColors.surface);
  const ink3OnBg = pairRatio(baseColors.ink3, baseColors.bg);
  const ink3OnSurface = pairRatio(baseColors.ink3, baseColors.surface);
  const onSenOnSen = pairRatio(actionColors.onSen, actionColors.sen);
  const senTextOnBg = pairRatio(actionColors.senText, baseColors.bg);
  const senTextOnSurface = pairRatio(actionColors.senText, baseColors.surface);
  const dienOnBg = pairRatio(actionColors.dien, baseColors.bg);
  const dienOnSurface = pairRatio(actionColors.dien, baseColors.surface);
  const dienOnTint = pairRatio(actionColors.dien, actionColors.dienTint);

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-page pb-16">
      <header className="flex items-start justify-between gap-4 pt-8">
        <div className="min-w-0">
          <p className="text-caption font-medium text-ink-3">{t("brand")}</p>
          <h1 className="text-display font-display font-bold text-ink">{t("title")}</h1>
        </div>
        <ThemeToggle />
      </header>
      <p className="mt-3 max-w-[68ch] text-body text-ink-2">{t("intro")}</p>

      {/* ================= Màu nền và chữ ================= */}
      <Section id="colors-base" title={t("colorsBaseSection")} hint={t("colorsBaseHint")}>
        <ul className="divide-y divide-line">
          <Row>
            <span aria-hidden={true} className="size-12 shrink-0 rounded-control border border-line bg-bg" />
            <RowText
              cssVar="--bg"
              name={t("tokenBg.name")}
              usage={t("tokenBg.usage")}
              codes={codesLine(t, baseColors.bg.light, baseColors.bg.dark)}
            />
          </Row>
          <Row>
            <span aria-hidden={true} className="size-12 shrink-0 rounded-control border border-line bg-surface" />
            <RowText
              cssVar="--surface"
              name={t("tokenSurface.name")}
              usage={t("tokenSurface.usage")}
              codes={codesLine(t, baseColors.surface.light, baseColors.surface.dark)}
            />
          </Row>
          <Row>
            <span aria-hidden={true} className="size-12 shrink-0 rounded-control border border-line bg-surface-2" />
            <RowText
              cssVar="--surface-2"
              name={t("tokenSurface2.name")}
              usage={t("tokenSurface2.usage")}
              codes={codesLine(t, baseColors.surface2.light, baseColors.surface2.dark)}
            />
          </Row>
          <Row>
            <span aria-hidden={true} className="size-12 shrink-0 rounded-control border border-line bg-line" />
            <RowText
              cssVar="--line"
              name={t("tokenLine.name")}
              usage={t("tokenLine.usage")}
              codes={codesLine(t, baseColors.line.light, baseColors.line.dark)}
            />
          </Row>
          <Row>
            <span
              aria-hidden={true}
              className="flex size-12 shrink-0 items-center justify-center rounded-control border border-line bg-bg text-ink text-body-strong"
            >
              Aa
            </span>
            <RowText
              cssVar="--ink"
              name={t("tokenInk.name")}
              usage={t("tokenInk.usage")}
              codes={codesLine(t, baseColors.ink.light, baseColors.ink.dark)}
            >
              <RatioBadge ratio={inkOnBg} t={t} />
              <RatioBadge ratio={inkOnSurface} t={t} />
            </RowText>
          </Row>
          <Row>
            <span
              aria-hidden={true}
              className="flex size-12 shrink-0 items-center justify-center rounded-control border border-line bg-bg text-ink-2 text-body-strong"
            >
              Aa
            </span>
            <RowText
              cssVar="--ink-2"
              name={t("tokenInk2.name")}
              usage={t("tokenInk2.usage")}
              codes={codesLine(t, baseColors.ink2.light, baseColors.ink2.dark)}
            >
              <RatioBadge ratio={ink2OnBg} t={t} />
              <RatioBadge ratio={ink2OnSurface} t={t} />
            </RowText>
          </Row>
          <Row>
            <span
              aria-hidden={true}
              className="flex size-12 shrink-0 items-center justify-center rounded-control border border-line bg-bg text-ink-3 text-body-strong"
            >
              Aa
            </span>
            <RowText
              cssVar="--ink-3"
              name={t("tokenInk3.name")}
              usage={t("tokenInk3.usage")}
              codes={codesLine(t, baseColors.ink3.light, baseColors.ink3.dark)}
            >
              <RatioBadge ratio={ink3OnBg} t={t} />
              <RatioBadge ratio={ink3OnSurface} t={t} />
            </RowText>
          </Row>
          <Row>
            <span
              aria-hidden={true}
              className="flex size-12 shrink-0 items-center justify-center rounded-control bg-surface-2 text-ink text-body-strong"
            >
              Aa
            </span>
            <RowText
              cssVar={t("tokenPairInkSurface2")}
              usage={t("tokenSurface2.usage")}
            >
              <RatioBadge ratio={inkOnSurface2} t={t} />
            </RowText>
          </Row>
        </ul>
      </Section>

      {/* ================= Màu hành động ================= */}
      <Section id="colors-action" title={t("colorsActionSection")} hint={t("colorsActionConvention")}>
        <ul className="divide-y divide-line">
          <Row>
            <span
              aria-hidden={true}
              className="flex size-12 shrink-0 items-center justify-center rounded-control bg-sen text-on-sen text-body-strong"
            >
              Aa
            </span>
            <RowText
              cssVar="--sen / --on-sen"
              name={t("tokenSen.name")}
              usage={t("tokenSen.usage")}
              codes={`${codesLine(t, actionColors.sen.light, actionColors.sen.dark)} · ${codesLine(t, actionColors.onSen.light, actionColors.onSen.dark)}`}
            >
              <RatioBadge ratio={onSenOnSen} t={t} />
            </RowText>
          </Row>
          <Row>
            <span
              aria-hidden={true}
              className="flex size-12 shrink-0 items-center justify-center rounded-control border border-line bg-bg text-sen-text text-body-strong"
            >
              Aa
            </span>
            <RowText
              cssVar="--sen-text"
              name={t("tokenSenText.name")}
              usage={t("tokenSenText.usage")}
              codes={codesLine(t, actionColors.senText.light, actionColors.senText.dark)}
            >
              <RatioBadge ratio={senTextOnBg} t={t} />
              <RatioBadge ratio={senTextOnSurface} t={t} />
            </RowText>
          </Row>
          <Row>
            <span
              aria-hidden={true}
              className="flex size-12 shrink-0 items-center justify-center rounded-control border border-line bg-bg text-dien text-body-strong"
            >
              Aa
            </span>
            <RowText
              cssVar="--dien"
              name={t("tokenDien.name")}
              usage={t("tokenDien.usage")}
              codes={codesLine(t, actionColors.dien.light, actionColors.dien.dark)}
            >
              <RatioBadge ratio={dienOnBg} t={t} />
              <RatioBadge ratio={dienOnSurface} t={t} />
            </RowText>
          </Row>
          <Row>
            <span
              aria-hidden={true}
              className="flex size-12 shrink-0 items-center justify-center rounded-control bg-dien-tint text-dien text-body-strong"
            >
              Aa
            </span>
            <RowText
              cssVar="--dien-tint"
              name={t("tokenDienTint.name")}
              usage={t("tokenDienTint.usage")}
              codes={codesLine(t, actionColors.dienTint.light, actionColors.dienTint.dark)}
            >
              <RatioBadge ratio={dienOnTint} t={t} />
            </RowText>
          </Row>
        </ul>
      </Section>

      {/* ================= Dải Hừng đông ================= */}
      <Section id="dawn" title={t("dawnSection")} hint={t("dawnHint")}>
        <div
          aria-hidden={true}
          className="h-12 w-full rounded-block"
          style={{ background: "var(--gradient-dawn)" }}
        />
        <p className="mt-3 text-caption text-ink-3 tabular-nums">
          {dawnStops
            .map((stop, i) => `${i === 0 ? "0%" : i === 1 ? "45%" : "100%"} ${stop}`)
            .join(" · ")}
        </p>
      </Section>

      {/* ================= Nhãn ngữ nghĩa ================= */}
      <Section id="tags" title={t("tagsSection")} hint={t("tagsHint")}>
        <ul className="divide-y divide-line">
          {(Object.keys(tagColors) as TagId[]).map((tag) => {
            const Icon = tagIcons[tag];
            return (
              <Row key={tag}>
                <span
                  className={`inline-flex items-center gap-2 rounded-pill px-3 py-1 text-small font-medium ${tagClassNames[tag]}`}
                >
                  <Icon aria-hidden={true} className="size-5" />
                  {t(tagMessageKeys[tag])}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-caption text-ink-3 tabular-nums">
                    {t("lightLabel")}: {tagColors[tag].lightText.toUpperCase()} /{" "}
                    {tagColors[tag].lightBg.toUpperCase()} · {t("darkLabel")}:{" "}
                    {tagColors[tag].darkText.toUpperCase()} / {tagDarkBg(tag).toUpperCase()}
                  </p>
                  <RatioBadge ratio={tagRatio(tag)} t={t} />
                </div>
              </Row>
            );
          })}
        </ul>
      </Section>

      {/* ================= Màu người nói ================= */}
      <Section id="speakers" title={t("speakersSection")} hint={t("speakersHint")}>
        <ul className="divide-y divide-line">
          {speakerColors.map((color, index) => (
            <li key={color} className="flex items-center gap-4 py-4">
              <span
                aria-hidden={true}
                className="size-6 shrink-0 rounded-full border border-line"
                style={{ backgroundColor: `var(--speaker-${index + 1})` }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-body-strong">{t("speaker", { index: index + 1 })}</p>
                <p className="text-caption text-ink-3 tabular-nums">
                  --speaker-{index + 1}: {color.toUpperCase()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {/* ================= Thang chữ ================= */}
      <Section id="typography" title={t("typographySection")} hint={t("typographyHint")}>
        <ul className="divide-y divide-line">
          {typeTokens.map((token) => (
            <li key={token.id} className="py-6">
              <p className="text-caption font-medium text-ink-3 tabular-nums">
                {token.id.replace("type", "")} · {token.size}/{token.line} · {t(`${token.id}.weight`)} ·{" "}
                {t(`${token.id}.desc`)}
              </p>
              {/* Bricolage Grotesque chỉ tải 600 và 700, nên cỡ nào cũng tối thiểu 600. */}
              <p
                className={`${token.textClass} font-display ${weightClasses[Math.max(token.weight, 600)]} mt-3 max-w-[68ch] text-ink`}
              >
                {t("testString")}
              </p>
              <p className="text-caption text-ink-3">{t("inDisplayFont", { font: t("fontBricolage") })}</p>
              <p className={`${token.textClass} font-body ${weightClasses[token.weight]} mt-4 max-w-[68ch] text-ink`}>
                {t("testString")}
              </p>
              <p className="text-caption text-ink-3">{t("inDisplayFont", { font: t("fontBeVietnam") })}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-small text-ink-2">{t("typographyDesktopNote")}</p>
        <p className="mt-1 text-caption text-ink-3">{t("testStringLabel")}</p>
      </Section>

      {/* ================= Khoảng cách ================= */}
      <Section id="spacing" title={t("spacingSection")} hint={t("spacingHint")}>
        <ul className="divide-y divide-line">
          {spacingScale.map((value) => (
            <li key={value} className="flex items-center gap-4 py-3">
              <span className="w-14 shrink-0 text-caption text-ink-3 tabular-nums">
                {t("spacingUnit", { value })}
              </span>
              <span
                aria-hidden={true}
                className="h-2 rounded-pill bg-surface-2"
                style={{ width: value * 3 }}
              />
            </li>
          ))}
          <li className="flex items-center gap-4 py-3">
            <span className="w-14 shrink-0 text-caption text-ink-3 tabular-nums">
              {pageMargins.mobile}/{pageMargins.desktop}
            </span>
            <span
              aria-hidden={true}
              className="h-2 rounded-pill bg-sen"
              style={{ width: pageMargins.mobile * 3 }}
            />
            <span
              aria-hidden={true}
              className="h-2 rounded-pill bg-sen"
              style={{ width: pageMargins.desktop * 3 }}
            />
            <span className="text-caption text-ink-3">{t("spacingMargin")}</span>
          </li>
        </ul>
      </Section>

      {/* ================= Bo góc ================= */}
      <Section id="radius" title={t("radiusSection")} hint={t("radiusHint")}>
        <ul className="flex flex-wrap gap-6">
          {radii.map((radius) => (
            <li key={radius.id} className="w-24">
              <span
                aria-hidden={true}
                className={`flex size-20 items-center justify-center border border-line bg-surface-2 text-caption text-ink-3 ${radius.className}`}
              >
                {radius.px}
              </span>
              <p className="mt-2 text-caption font-medium text-ink-2">{t(`${radius.id}.name`)}</p>
              <p className="text-caption text-ink-3">{t(`${radius.id}.usage`)}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* ================= Bóng đổ ================= */}
      <Section id="shadow" title={t("shadowSection")} hint={t("shadowHint")}>
        <ul className="flex flex-wrap gap-6">
          <li className="w-full max-w-60">
            <span
              aria-hidden={true}
              className="flex size-20 items-center justify-center rounded-block border border-line bg-surface text-caption text-ink-3 shadow-float"
            >
              float
            </span>
            <p className="mt-2 text-caption font-medium text-ink-2">{t("shadowFloat.name")}</p>
            <p className="text-caption text-ink-3">{t("shadowFloat.usage")}</p>
          </li>
          <li className="w-full max-w-60">
            <span
              aria-hidden={true}
              className="flex size-20 items-center justify-center rounded-block bg-sen text-caption text-on-sen shadow-record"
            >
              record
            </span>
            <p className="mt-2 text-caption font-medium text-ink-2">{t("shadowRecord.name")}</p>
            <p className="text-caption text-ink-3">{t("shadowRecord.usage")}</p>
          </li>
        </ul>
        <p className="mt-4 text-small text-ink-2">{t("shadowDarkNote")}</p>
      </Section>

      {/* ================= Chuyển động ================= */}
      <Section id="motion" title={t("motionSection")} hint={t("motionHint")}>
        <ul className="divide-y divide-line">
          {(["motionQuick", "motionBase", "motionSheet", "motionScene", "motionEase"] as const).map((key) => (
            <li key={key} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
              <span className="text-body-strong tabular-nums">{t(`${key}.name`)}</span>
              <span className="text-small text-ink-2">{t(`${key}.usage`)}</span>
            </li>
          ))}
        </ul>
        <p
          className="mt-4 inline-flex rounded-pill border border-line bg-surface px-4 py-2 text-small text-ink-2 transition-colors hover:bg-dien-tint hover:text-dien"
          style={{ transitionDuration: "var(--t-quick)", transitionTimingFunction: "var(--ease)" }}
        >
          {t("motionQuick.name")}
        </p>
      </Section>
    </main>
  );
}
