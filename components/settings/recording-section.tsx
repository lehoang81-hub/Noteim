"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Switch, TextField } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { data, useData, type Lang } from "@/lib/data";
import { cn } from "@/lib/cn";

/*
 * Ghi âm (M4-03): nhắc xin đồng ý (dùng thật ở M2), câu thông báo ghi âm
 * (sửa được), tự lọc khoảng lặng. M6-04 (issue #46): thêm ngôn ngữ ghi âm
 * mặc định và công tắc "Tự nhận tiếng khác" — dùng khi bắt đầu ghi (M6-02).
 */

const SPEECH_LANGS: readonly Lang[] = ["vi", "en", "ko"];
const LANG_NAME_KEY: Record<Lang, string> = { vi: "langVi", en: "langEn", ko: "langKo" };

export function RecordingSection() {
  const t = useTranslations("settings");
  const toast = useToast();
  const me = useData(() => data.account.me(), []);
  const [initialized, setInitialized] = useState(false);
  const [reminder, setReminder] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const [filterSilence, setFilterSilence] = useState(false);
  const [speechLang, setSpeechLang] = useState<Lang>("vi");
  const [autoDetect, setAutoDetect] = useState(true);
  const [saving, setSaving] = useState(false);

  if (me.data && !initialized) {
    setInitialized(true);
    setReminder(me.data.consent_reminder);
    setAnnouncement(me.data.consent_announcement ?? "");
    setFilterSilence(me.data.auto_filter_silence ?? false);
    setSpeechLang(me.data.default_speech_language);
    setAutoDetect(me.data.auto_detect_languages);
  }

  async function patch(value: Parameters<typeof data.account.updateMe>[0], okMessage?: string) {
    setSaving(true);
    try {
      await data.account.updateMe(value);
      if (okMessage) toast.show({ tone: "success", message: okMessage });
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset>
        <legend className="mb-2 text-small font-medium text-ink">{t("speechLanguage")}</legend>
        <div role="radiogroup" aria-label={t("speechLanguage")} className="flex flex-wrap gap-2">
          {SPEECH_LANGS.map((lg) => (
            <button
              key={lg}
              type="button"
              role="radio"
              aria-checked={speechLang === lg}
              onClick={() => {
                setSpeechLang(lg);
                void patch({ default_speech_language: lg });
              }}
              className={cn(
                "h-11 rounded-control border px-3 text-small font-medium transition-colors ease-noteim duration-(--t-quick)",
                speechLang === lg ? "border-sen bg-sen/10 text-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
              )}
            >
              <span lang={lg === "ko" ? "ko" : undefined}>{t(LANG_NAME_KEY[lg])}</span>
            </button>
          ))}
        </div>
        <div className="mt-2">
          <Switch
            checked={autoDetect}
            onCheckedChange={(v) => {
              setAutoDetect(v);
              void patch({ auto_detect_languages: v });
            }}
            label={t("autoDetect")}
          />
        </div>
      </fieldset>

      <Switch
        checked={reminder}
        onCheckedChange={(v) => {
          setReminder(v);
          void patch({ consent_reminder: v });
        }}
        label={t("recordReminder")}
        description={t("recordReminderHint")}
      />

      <TextField
        label={t("recordAnnouncement")}
        hint={t("recordAnnouncementHint")}
        value={announcement}
        onChange={(e) => setAnnouncement(e.target.value)}
        onBlur={() => {
          if (announcement !== (me.data?.consent_announcement ?? "")) void patch({ consent_announcement: announcement }, t("savedProfile"));
        }}
      />

      <Switch
        checked={filterSilence}
        onCheckedChange={(v) => {
          setFilterSilence(v);
          void patch({ auto_filter_silence: v });
        }}
        label={t("recordSilence")}
        description={t("recordSilenceHint")}
      />

      <Button variant="secondary" loading={saving} className="self-start" onClick={() => void patch({ consent_announcement: announcement, consent_reminder: reminder, auto_filter_silence: filterSilence }, t("savedProfile"))}>
        {t("save")}
      </Button>
    </div>
  );
}
