import { useTranslations } from "next-intl";
import { TagChip } from "@/components/ui/chips";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Contrast, Duration, Hex, Raw, SizeLine } from "./live";
import {
  actionColors,
  baseColors,
  dawnVars,
  motionVars,
  radii,
  spacingVars,
  speakerVars,
  tagIds,
  typeScale,
  type ColorRow,
  type SectionId,
} from "./palette-data";
import { ComponentsShowcase } from "./components-showcase";
import { Preview } from "./preview";
import { SectionNavDesktop, SectionNavMobile } from "./section-nav";

/* ---------- Khung ---------- */

function Section({
  id,
  title,
  hint,
  children,
}: {
  id: SectionId;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-16 pt-9 lg:scroll-mt-8 lg:pt-12">
      <h2 id={`${id}-title`} className="text-h2 font-semibold text-ink">
        {title}
      </h2>
      {hint ? <p className="mt-1 max-w-[62ch] text-small text-ink-2">{hint}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1 mt-8 text-small font-semibold text-ink first:mt-0">{children}</h3>;
}

/* ---------- Màu ---------- */

function Swatch({ row }: { row: ColorRow }) {
  const base = "flex size-14 shrink-0 items-center justify-center rounded-control text-h2 font-semibold";
  if (row.swatch === "fill") {
    return <span aria-hidden={true} className={`${base} border border-line`} style={{ backgroundColor: `var(${row.cssVar})` }} />;
  }
  if (row.swatch === "onFill") {
    return (
      <span aria-hidden={true} className={base} style={{ backgroundColor: `var(${row.cssVar})`, color: "var(--on-sen)" }}>
        Aa
      </span>
    );
  }
  return (
    <span aria-hidden={true} className={`${base} border border-line bg-surface`} style={{ color: `var(${row.cssVar})` }}>
      Aa
    </span>
  );
}

function ColorList({ rows }: { rows: ColorRow[] }) {
  const t = useTranslations("styleguide.tokens");
  return (
    <ul className="grid lg:grid-cols-2 lg:gap-x-8">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center gap-4 border-b border-line py-3">
          <Swatch row={row} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-body-strong font-semibold text-ink">{t(`${row.key}.name`)}</span>
              <span className="text-caption text-ink-3">{row.cssVar}</span>
            </p>
            <p className="text-small text-ink-2">{t(`${row.key}.usage`)}</p>
            <p className="mt-0.5 flex flex-wrap gap-x-3 text-caption font-medium text-ink-3">
              <Hex cssVar={row.cssVar} />
              {row.contrast ? <Contrast fg={row.contrast.fg} bgs={row.contrast.bgs} /> : null}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Trang ---------- */

export default function StyleguidePage() {
  const t = useTranslations("styleguide");

  return (
    <div className="mx-auto w-full max-w-[1180px] px-page pb-24">
      <header className="flex items-start justify-between gap-4 pb-4 pt-6 lg:pb-10 lg:pt-12">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-small font-semibold text-ink">
            <span aria-hidden={true} className="size-4 rounded-pill" style={{ background: "var(--gradient-dawn)" }} />
            {t("brand")}
          </p>
          <h1 className="mt-3 font-display text-display font-bold text-ink">{t("title")}</h1>
          <p className="mt-2 max-w-[56ch] text-body text-ink-2">{t("intro")}</p>
        </div>
        <ThemeToggle />
      </header>

      <SectionNavMobile />

      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
        <SectionNavDesktop />

        <main className="min-w-0 max-w-[880px]">
          {/* Xem nhanh */}
          <section id="preview" aria-labelledby="preview-title" className="scroll-mt-16 pt-4 lg:scroll-mt-8 lg:pt-0">
            <h2 id="preview-title" className="sr-only">
              {t("nav.preview")}
            </h2>
            <div className="lg:hidden">
              <Preview />
            </div>
            <div className="hidden gap-6 lg:grid lg:grid-cols-2">
              <figure>
                <figcaption className="mb-2 text-caption font-medium text-ink-3">{t("previewLight")}</figcaption>
                <Preview scheme="light" />
              </figure>
              <figure>
                <figcaption className="mb-2 text-caption font-medium text-ink-3">{t("previewDark")}</figcaption>
                <Preview scheme="dark" />
              </figure>
            </div>
            <p className="mt-3 max-w-[62ch] text-small text-ink-2">{t("previewNote")}</p>
          </section>

          {/* Component */}
          <Section id="components" title={t("components.title")} hint={t("components.hint")}>
            <ComponentsShowcase />
          </Section>

          {/* Màu */}
          <Section id="colors" title={t("colorsTitle")} hint={t("colorsHint")}>
            <SubHeading>{t("colorsBase")}</SubHeading>
            <ColorList rows={baseColors} />
            <SubHeading>{t("colorsAction")}</SubHeading>
            <ColorList rows={actionColors} />
            <SubHeading>{t("dawnTitle")}</SubHeading>
            <p className="max-w-[62ch] text-small text-ink-2">{t("dawnHint")}</p>
            <div aria-hidden={true} className="mt-3 h-12 rounded-block" style={{ background: "var(--gradient-dawn)" }} />
            <p className="mt-2 flex justify-between text-caption font-medium text-ink-3">
              {dawnVars.map((v) => (
                <Hex key={v} cssVar={v} />
              ))}
            </p>
          </Section>

          {/* Nhãn */}
          <Section id="tags" title={t("tagsTitle")} hint={t("tagsHint")}>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
              {tagIds.map((tag) => {
                return (
                  <li key={tag}>
                    <TagChip tag={tag} label={t(`tags.${tag}`)} />
                    <p className="mt-1.5 text-caption font-medium text-ink-3">
                      <Contrast fg={`--tag-${tag}-text`} bgs={[`--tag-${tag}-bg`]} />
                    </p>
                  </li>
                );
              })}
            </ul>
          </Section>

          {/* Người nói */}
          <Section id="speakers" title={t("speakersTitle")} hint={t("speakersHint")}>
            <div aria-hidden={true} className="flex h-3 overflow-hidden rounded-pill">
              {speakerVars.map((v) => (
                <span key={v} className="flex-1" style={{ backgroundColor: `var(${v})` }} />
              ))}
            </div>
            <ul className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3">
              {speakerVars.map((v, i) => (
                <li key={v} className="flex items-start gap-2">
                  <span aria-hidden={true} className="mt-1.5 size-3 shrink-0 rounded-pill" style={{ backgroundColor: `var(${v})` }} />
                  <span className="min-w-0">
                    <span className="block text-small text-ink">{t("speaker", { index: i + 1 })}</span>
                    <span className="block text-caption font-medium text-ink-3">
                      <Hex cssVar={v} />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          {/* Chữ */}
          <Section id="type" title={t("typeTitle")} hint={t("typeHint")}>
            <ul>
              {typeScale.map((step) => (
                <li key={step.key} className="border-b border-line py-4 first:pt-0">
                  <p className="flex flex-wrap gap-x-3 text-caption font-medium text-ink-3">
                    <span className="text-ink-2">{t(`typeScale.${step.key}.name`)}</span>
                    <SizeLine sizeVar={step.sizeVar} lineVar={step.lineVar} />
                    <span>{t(`typeScale.${step.key}.use`)}</span>
                  </p>
                  {step.compareFonts ? (
                    <div className="mt-3 grid gap-4 xl:grid-cols-2">
                      <div>
                        <p className={`font-display ${step.className} text-ink`}>{t("sample")}</p>
                        <p className="mt-1 text-caption text-ink-3">{t("fontDisplay")}</p>
                      </div>
                      <div>
                        <p className={`font-body ${step.className} text-ink`}>{t("sample")}</p>
                        <p className="mt-1 text-caption text-ink-3">{t("fontBody")}</p>
                      </div>
                    </div>
                  ) : (
                    <p className={`mt-2 max-w-[62ch] font-body ${step.className} text-ink`}>{t("sample")}</p>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-4 hidden text-small text-ink-2 md:block">{t("typeDesktopNote")}</p>
          </Section>

          {/* Hình khối */}
          <Section id="shape" title={t("shapeTitle")}>
            <SubHeading>{t("spacingTitle")}</SubHeading>
            <p className="max-w-[62ch] text-small text-ink-2">{t("spacingHint")}</p>
            <ul className="mt-3 flex flex-col gap-2">
              {spacingVars.map((v) => (
                <li key={v} className="flex items-center gap-3">
                  <span className="w-12 shrink-0 text-caption font-medium text-ink-3">
                    <Raw cssVar={v} />
                  </span>
                  <span aria-hidden={true} className="h-2 rounded-pill bg-dien" style={{ width: `calc(var(${v}) * 3)` }} />
                </li>
              ))}
            </ul>

            <SubHeading>{t("radiusTitle")}</SubHeading>
            <p className="max-w-[62ch] text-small text-ink-2">{t("radiusHint")}</p>
            <ul className="mt-3 grid grid-cols-4 gap-3 sm:gap-4">
              {radii.map((r) => (
                <li key={r.key} className="min-w-0">
                  <span aria-hidden={true} className={`block h-14 border border-line bg-surface-2 sm:h-16 ${r.className}`} />
                  <p className="mt-2 text-caption font-medium text-ink sm:text-small">{t(`radius.${r.key}.name`)}</p>
                  <p className="text-caption text-ink-3">
                    <Raw cssVar={r.cssVar} />
                  </p>
                  <p className="hidden text-caption text-ink-2 sm:block">{t(`radius.${r.key}.use`)}</p>
                </li>
              ))}
            </ul>

            <SubHeading>{t("shadowTitle")}</SubHeading>
            <p className="max-w-[62ch] text-small text-ink-2">{t("shadowHint")}</p>
            <ul className="mt-4 grid grid-cols-2 gap-4 sm:max-w-md">
              <li>
                <span aria-hidden={true} className="block h-16 rounded-block border border-line bg-surface shadow-float" />
                <p className="mt-2 text-small font-medium text-ink">{t("shadow.float.name")}</p>
                <p className="text-caption text-ink-2">{t("shadow.float.use")}</p>
              </li>
              <li>
                <span aria-hidden={true} className="block h-16 rounded-pill shadow-record" style={{ background: "var(--gradient-dawn)" }} />
                <p className="mt-2 text-small font-medium text-ink">{t("shadow.record.name")}</p>
                <p className="text-caption text-ink-2">{t("shadow.record.use")}</p>
              </li>
            </ul>
          </Section>

          {/* Chuyển động */}
          <Section id="motion" title={t("motionTitle")} hint={t("motionHint")}>
            <ul>
              {motionVars.map((m) => (
                <li key={m.key} className="flex items-baseline gap-4 border-b border-line py-2.5">
                  <span className="w-16 shrink-0 text-body-strong font-semibold tabular-nums text-ink">
                    <Duration cssVar={m.cssVar} />
                  </span>
                  <span className="text-small text-ink-2">{t(`motion.${m.key}`)}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-5 inline-flex h-11 items-center rounded-control bg-sen px-4 text-small font-semibold text-on-sen transition-transform ease-noteim"
              style={{ transitionDuration: "var(--t-quick)" }}
            >
              {t("motionTry")}
            </button>
            <p className="mt-2 text-caption text-ink-3">{t("motionTryHint")}</p>
          </Section>
        </main>
      </div>
    </div>
  );
}
