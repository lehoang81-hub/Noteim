"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Switch, TextField } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { data, useData } from "@/lib/data";

/*
 * Ghi âm (M4-03): nhắc xin đồng ý (dùng thật ở M2), câu thông báo ghi âm
 * (sửa được), tự lọc khoảng lặng.
 */

export function RecordingSection() {
  const t = useTranslations("settings");
  const toast = useToast();
  const me = useData(() => data.account.me(), []);
  const [initialized, setInitialized] = useState(false);
  const [reminder, setReminder] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const [filterSilence, setFilterSilence] = useState(false);
  const [saving, setSaving] = useState(false);

  if (me.data && !initialized) {
    setInitialized(true);
    setReminder(me.data.consent_reminder);
    setAnnouncement(me.data.consent_announcement ?? "");
    setFilterSilence(me.data.auto_filter_silence ?? false);
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
