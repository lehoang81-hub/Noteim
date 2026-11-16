"use client";

import { m } from "motion/react";
import { Building2, Briefcase, Gavel, HeartPulse, PenTool, Scale, UserRound, ArrowLeft, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form";
import { data, dataNow, useData, type Profession } from "@/lib/data";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

/*
 * Làm quen lần đầu /welcome (docs/03-screens.md mục 14, issue M4-04).
 * Ba bước, mỗi bước một màn hình, có thể bỏ qua:
 * 1. Bạn làm nghề gì? (chọn nghề đặt mẫu mặc định)
 * 2. Noteim nên gọi bạn là gì? (xem trước lời chào)
 * 3. Nghe thử một buổi ghi mẫu (mở chi tiết buổi mẫu kèm 3 chú thích nổi)
 * Màn chào dùng khoảnh khắc số 1: logo Hừng đông duỗi thành dải giọng.
 */

const PROFESSIONS: Array<{ id: Profession; icon: typeof Briefcase }> = [
  { id: "business_owner", icon: Building2 },
  { id: "doctor", icon: HeartPulse },
  { id: "lawyer", icon: Scale },
  { id: "realestate_sales", icon: Briefcase },
  { id: "architect", icon: PenTool },
  { id: "notary", icon: Gavel },
];

export function WelcomeScreen() {
  const t = useTranslations("welcome");
  const tp = useTranslations("debug");
  const tl = useTranslations("library");
  const router = useRouter();
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [profession, setProfession] = useState<Profession | null>(null);
  const [name, setName] = useState("");
  const [honorific, setHonorific] = useState<"anh" | "chị" | "">("");
  const [saving, setSaving] = useState(false);

  async function markOnboarded() {
    try {
      await data.account.updateMe({ onboarded_at: dataNow().toISOString() });
    } catch {
      // Không lưu được thì lần sau lại hiện làm quen, không chặn người dùng
    }
  }

  function skip() {
    void markOnboarded().then(() => router.push("/"));
  }

  /* Bước 0: màn chào Hừng đông */
  if (step === 0) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-center">
        <DawnMoment />
        <h1 className="mt-8 font-display text-h1 font-semibold text-ink">{t("brandLine")}</h1>
        <p className="mt-2 max-w-xs text-small text-ink-2">{t("momentHint")}</p>
        <div className="mt-8 flex flex-col gap-2">
          <Button variant="primary" onClick={() => setStep(1)}>
            {t("start")}
          </Button>
          <Button variant="ghost" onClick={skip}>
            {t("skip")}
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col px-page pb-10 pt-3 lg:mx-auto lg:max-w-xl">
      <header className="flex min-h-12 items-center gap-1">
        <button
          type="button"
          onClick={() => (step === 1 ? setStep(0) : setStep((s) => (s === 3 ? 2 : 1)))}
          disabled={saving}
          className="-ml-2 flex size-11 items-center justify-center rounded-control text-ink hover:bg-surface-2 disabled:opacity-40"
          aria-label={t("back")}
        >
          <ArrowLeft aria-hidden={true} className="size-5" strokeWidth={1.75} />
        </button>
        <span className="flex-1" />
        <Button variant="ghost" className="h-11" disabled={saving} onClick={skip}>
          {t("skip")}
        </Button>
      </header>

      {/* Chỉ báo 3 bước */}
      <div className="mx-auto flex gap-2 pt-1" role="img" aria-label={t("stepOf", { step, total: 3 })}>
        {[1, 2, 3].map((n) => (
          <span key={n} aria-hidden={true} className={cn("h-1.5 w-8 rounded-pill", n <= step ? "bg-sen" : "bg-surface-2")} />
        ))}
      </div>

      {step === 1 ? (
        <section className="mt-6 flex flex-1 flex-col">
          <h1 className="font-display text-h1 font-semibold text-ink">{t("step1Title")}</h1>
          <p className="mt-1 text-small text-ink-2">{t("step1Hint")}</p>
          <ul className="mt-5 flex flex-col gap-1.5">
            {PROFESSIONS.map(({ id, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  aria-pressed={profession === id}
                  onClick={() => {
                    setProfession(id);
                    void (async () => {
                      try {
                        const tpl = await data.account
                          .templates()
                          .then((list) => list.find((x) => x.profession === id));
                        await data.account.updateMe({ profession: id, default_template_id: tpl?.id ?? "" });
                      } catch {
                        // Không lưu được thì vẫn cho đi tiếp
                      }
                    })();
                  }}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-control border px-4 text-left text-body transition-colors ease-noteim duration-(--t-quick)",
                    profession === id ? "border-sen bg-sen/10 font-semibold text-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
                  )}
                >
                  <Icon aria-hidden={true} className="size-5 shrink-0" strokeWidth={1.75} />
                  {tp(`prof.${id}`)}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                aria-pressed={profession === "other"}
                onClick={() => {
                  setProfession("other");
                  void data.account.updateMe({ profession: "other" }).catch(() => undefined);
                }}
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 rounded-control border px-4 text-left text-body transition-colors ease-noteim duration-(--t-quick)",
                  profession === "other" ? "border-sen bg-sen/10 font-semibold text-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
                )}
              >
                <UserRound aria-hidden={true} className="size-5 shrink-0" strokeWidth={1.75} />
                {tp("prof.other")}
              </button>
            </li>
          </ul>
          <div className="mt-auto pt-6">
            <Button variant="primary" block disabled={!profession} onClick={() => setStep(2)}>
              {t("continue")}
            </Button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="mt-6 flex flex-1 flex-col">
          <h1 className="font-display text-h1 font-semibold text-ink">{t("step2Title")}</h1>
          <div className="mt-5 flex flex-col gap-4">
            <TextField label={t("step2Name")} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("step2NamePlaceholder")} autoFocus />
            <fieldset>
              <legend className="mb-2 text-small font-medium text-ink">{t("step2Honorific")}</legend>
              <div className="flex flex-wrap gap-2">
                {(["anh", "chị", ""] as const).map((h) => (
                  <button
                    key={h || "none"}
                    type="button"
                    aria-pressed={honorific === h}
                    onClick={() => setHonorific(h)}
                    className={cn(
                      "h-11 rounded-control border px-4 text-small font-medium transition-colors ease-noteim duration-(--t-quick)",
                      honorific === h ? "border-sen bg-sen/10 text-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
                    )}
                  >
                    {h === "" ? t("honorificNone") : h === "chị" ? tl("honorificChi") : tl("honorificAnh")}
                  </button>
                ))}
              </div>
            </fieldset>
            {/* Xem trước lời chào */}
            <div className="rounded-block border border-line bg-surface-2 p-4">
              <p className="text-caption font-medium text-ink-3">{t("step2Preview")}</p>
              <p aria-live="polite" className="mt-1 font-display text-h2 font-semibold text-ink">
                {name.trim()
                  ? honorific
                    ? tl("greeting", { honorific: honorific === "chị" ? tl("honorificChi") : tl("honorificAnh"), name: name.trim() })
                    : tl("greetingPlain", { name: name.trim() })
                  : t("step2PreviewEmpty")}
              </p>
            </div>
          </div>
          <div className="mt-auto pt-6">
            <Button variant="primary" block onClick={() => setStep(3)}>
              {t("continue")}
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <SampleStep profession={profession} onDone={() => void finish()} onOpenSample={() => saveAndOpenSample()} saving={saving} />
      ) : null}
    </main>
  );

  /** Lưu tên và cách xưng hô người dùng vừa nhập (dùng cho cả Hoàn tất lẫn mở buổi mẫu). */
  async function saveProfile() {
    const patch: Parameters<typeof data.account.updateMe>[0] = {};
    if (name.trim()) patch.display_name = name.trim();
    patch.honorific = honorific === "" ? null : honorific;
    try {
      await data.account.updateMe(patch);
    } catch {
      // bỏ qua: bản mẫu vẫn chạy tiếp
    }
  }

  async function finish() {
    setSaving(true);
    await saveProfile();
    await markOnboarded();
    router.push("/");
  }

  /** Mở buổi mẫu cũng phải lưu hồ sơ trước (review PR #35: trước đây chỉ ghi onboarded_at). */
  async function saveAndOpenSample() {
    await saveProfile();
    await markOnboarded();
  }
}

/** Bước 3: nghe thử buổi ghi mẫu của nghề đã chọn. */
function SampleStep({
  profession,
  onDone,
  onOpenSample,
  saving,
}: {
  profession: Profession | null;
  onDone: () => void;
  onOpenSample: () => Promise<void>;
  saving: boolean;
}) {
  const t = useTranslations("welcome");
  const tp = useTranslations("debug");
  const router = useRouter();
  const sample = useData(() => data.sessions.getSample(profession ?? "realestate_sales"), [profession]);

  function openSample() {
    if (!sample.data) return;
    const sid = sample.data.id;
    // Lưu tên + xưng hô + cờ làm quen như bấm "Hoàn tất", xong mới mở buổi mẫu
    void onOpenSample().then(() => router.push(`/s/${sid}?tour=1`));
  }

  return (
    <section className="mt-6 flex flex-1 flex-col">
      <h1 className="font-display text-h1 font-semibold text-ink">{t("step3Title")}</h1>
      <p className="mt-1 text-small text-ink-2">{t("step3Hint")}</p>

      <div className="mt-5 rounded-block border border-line bg-surface p-4">
        <p className="text-caption font-medium text-ink-3">
          {sample.loading || !sample.data ? t("step3Loading") : tp(`prof.${profession ?? "realestate_sales"}`)}
        </p>
        <p className="mt-1 text-body font-semibold text-ink">{sample.data?.title ?? " "}</p>
        <Button variant="ai" icon={Play} className="mt-3" disabled={!sample.data} onClick={openSample}>
          {t("step3Open")}
        </Button>
      </div>

      <p className="mt-3 text-caption text-ink-3">{t("step3TourHint")}</p>

      <div className="mt-auto pt-6">
        <Button variant="primary" block loading={saving} onClick={onDone}>
          {t("finish")}
        </Button>
      </div>
    </section>
  );
}

/** Khoảnh khắc số 1: logo Hừng đông duỗi thành dải giọng. */
function DawnMoment() {
  const reduce = useReducedMotionSafe();
  const BARS = 24;
  return (
    <div className="flex h-16 items-center justify-center gap-1.5" aria-hidden={true}>
      {Array.from({ length: BARS }, (_, i) => {
        const h = 10 + 38 * Math.abs(Math.sin(i / 2.4));
        return (
          <m.span
            key={i}
            className="w-2 rounded-pill"
            style={{ background: "var(--gradient-dawn)" }}
            initial={reduce ? { opacity: 0 } : { height: 8, opacity: 0.4 }}
            animate={reduce ? { opacity: 1 } : { height: h, opacity: 1 }}
            transition={reduce ? { duration: 0.4, delay: i * 0.02 } : { duration: 0.7, delay: i * 0.045, ease: [0.2, 0.8, 0.2, 1] }}
          />
        );
      })}
    </div>
  );
}
