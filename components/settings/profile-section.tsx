"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { data, useData, type Profession } from "@/lib/data";
import { cn } from "@/lib/cn";

/*
 * Hồ sơ (M4-03): tên, cách xưng hô, nghề (đổi nghề thì đổi mẫu mặc định), email.
 */

const HONORIFICS = ["anh", "chị", ""] as const;

export function ProfileSection() {
  const t = useTranslations("settings");
  const tp = useTranslations("debug");
  const toast = useToast();
  const router = useRouter();
  const me = useData(() => data.account.me(), []);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [honorific, setHonorific] = useState<string>("");
  const [profession, setProfession] = useState<Profession>("realestate_sales");
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Dữ liệu về tới lần đầu thì điền vào ô nhập (chỉnh trạng thái lúc vẽ)
  if (me.data && !initialized) {
    setInitialized(true);
    setName(me.data.display_name);
    setEmail(me.data.email);
    setHonorific(me.data.honorific ?? "");
    setProfession(me.data.profession);
  }

  async function save(patch: Parameters<typeof data.account.updateMe>[0], okMessage: string) {
    setSaving(true);
    try {
      await data.account.updateMe(patch);
      toast.show({ tone: "success", message: okMessage });
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
    } finally {
      setSaving(false);
    }
  }

  const professions: Profession[] = ["business_owner", "doctor", "lawyer", "realestate_sales", "architect", "notary", "other"];

  return (
    <div className="flex flex-col gap-6">
      <TextField
        label={t("profileName")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const next = name.trim();
          if (next && next !== me.data?.display_name) void save({ display_name: next }, t("savedProfile"));
        }}
      />

      <fieldset>
        <legend className="mb-2 text-small font-medium text-ink">{t("profileHonorific")}</legend>
        <div className="flex flex-wrap gap-2">
          {HONORIFICS.map((h) => (
            <button
              key={h || "none"}
              type="button"
              aria-pressed={honorific === h}
              onClick={() => {
                setHonorific(h);
                void save({ honorific: h === "" ? null : (h as "anh" | "chị") }, t("savedProfile"));
              }}
              className={cn(
                "h-11 rounded-control border px-4 text-small font-medium transition-colors ease-noteim duration-(--t-quick)",
                honorific === h ? "border-sen bg-sen/10 text-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
              )}
            >
              {h === "" ? t("honorificNone") : h}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-small font-medium text-ink">{t("profileProfession")}</legend>
        <p className="mb-2 text-caption text-ink-3">{t("professionHint")}</p>
        <div className="flex flex-col gap-1">
          {professions.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={profession === p}
              onClick={() => {
                setProfession(p);
                void save({ profession: p }, t("savedProfile"));
              }}
              className={cn(
                "flex min-h-11 items-center rounded-control px-3 text-left text-body transition-colors ease-noteim duration-(--t-quick)",
                profession === p ? "bg-sen/10 font-semibold text-ink" : "text-ink-2 hover:bg-surface-2",
              )}
            >
              {tp(`prof.${p}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <TextField
        label={t("profileEmail")}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onBlur={() => {
          if (email.trim() && email.trim() !== me.data?.email) void save({ email: email.trim() }, t("savedProfile"));
        }}
      />

      <Button
        variant="secondary"
        loading={saving}
        onClick={() =>
          void save(
            {
              display_name: name.trim(),
              email: email.trim(),
              honorific: honorific === "" ? null : (honorific as "anh" | "chị"),
              profession,
            },
            t("savedProfile"),
          )
        }
        className="self-start"
      >
        {t("save")}
      </Button>

      {/* Xem lại buổi ghi mẫu của nghề hiện tại (M4-04) */}
      <Button
        variant="secondary"
        className="self-start"
        disabled={!me.data}
        onClick={() => {
          void data.sessions
            .getSample(me.data?.profession ?? profession)
            .then((s) => router.push(`/s/${s.id}?tour=0`))
            .catch(() => toast.show({ tone: "error", message: t("saveError") }));
        }}
      >
        {t("profileSample")}
      </Button>
    </div>
  );
}
