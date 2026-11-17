"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { data, type Lang, type Profession } from "@/lib/data";

/*
 * Tạo không gian nhóm (M7-01, docs/08 phần B): tên, nghề chính, ngôn ngữ
 * báo cáo mặc định của nhóm. Người tạo là Chủ (repository tự thêm).
 */

const PROFESSIONS: Profession[] = ["realestate_sales", "business_owner", "doctor", "lawyer", "architect", "notary", "other"];

export function CreateWorkspaceSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("workspace");
  const td = useTranslations("debug");
  const ts = useTranslations("settings");
  const toast = useToast();
  const [name, setName] = useState("");
  const [profession, setProfession] = useState<Profession>("realestate_sales");
  const [lang, setLang] = useState<Lang>("vi");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      const ws = await data.workspaces.create({ name: clean, profession, default_report_language: lang });
      // create tự chuyển sang không gian vừa tạo
      toast.show({ tone: "success", message: t("createDone", { name: ws.name }) });
      setName("");
      setProfession("realestate_sales");
      setLang("vi");
      onOpenChange(false);
    } catch {
      toast.show({ tone: "error", message: t("createError") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t("createTitle")} description={t("createHint")} size="auto">
      <form
        className="flex flex-col gap-4 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField
          label={t("createName")}
          placeholder={t("createNamePlaceholder")}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <label className="block">
          <span className="mb-1.5 block text-small font-medium text-ink">{t("createProfession")}</span>
          <select
            value={profession}
            onChange={(e) => setProfession(e.target.value as Profession)}
            className="h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
          >
            {PROFESSIONS.map((p) => (
              <option key={p} value={p}>
                {td(`prof.${p}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-small font-medium text-ink">{t("createReportLang")}</span>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            className="h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
          >
            <option value="vi">{ts("langVi")}</option>
            <option value="en">{ts("langEn")}</option>
            <option value="ko">{ts("langKo")}</option>
          </select>
        </label>
        <Button type="submit" variant="primary" className="h-12" disabled={busy || !name.trim()}>
          {t("createSubmit")}
        </Button>
      </form>
    </Sheet>
  );
}
