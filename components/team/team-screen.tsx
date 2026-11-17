"use client";

import { ArrowLeft, Building2, LogOut, Pencil, ShieldCheck, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SkeletonRow } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { data, useData, type Member, type Profession, type Lang } from "@/lib/data";
import { useTeamWorkspace } from "./use-team";

/*
 * Trang /team (M7-03, docs/08 phần B): thông tin nhóm (tên, nghề chính, ngôn
 * ngữ báo cáo mặc định), vào các trang quản trị con, rời nhóm, chuyển quyền
 * Chủ và xóa nhóm (gõ tên nhóm). Thành viên xem được thông tin và rời nhóm;
 * các phần quản trị chỉ Chủ và Quản trị thấy, quyền chặn ở repository.
 */

const PROFESSIONS: Profession[] = ["realestate_sales", "business_owner", "doctor", "lawyer", "architect", "notary", "other"];
const REPORT_LANGS: Lang[] = ["vi", "en", "ko"];

const LANG_KEY: Record<Lang, "langVi" | "langEn" | "langKo"> = {
  vi: "langVi",
  en: "langEn",
  ko: "langKo",
};

export function TeamScreen() {
  const t = useTranslations("team");
  const td = useTranslations("debug");
  const ts = useTranslations("settings");
  const tw = useTranslations("workspace");
  const router = useRouter();
  const toast = useToast();
  const { workspace, isTeam, role, isAdmin, loading } = useTeamWorkspace();
  const members = useData(
    () => (workspace && workspace.kind === "team" ? data.workspaces.members(workspace.id) : Promise.resolve([])),
    [workspace?.id],
  );

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [profession, setProfession] = useState<Profession>("realestate_sales");
  const [reportLang, setReportLang] = useState<Lang>("vi");
  const [saveBusy, setSaveBusy] = useState(false);
  // Hộp xác nhận: rời nhóm, chuyển quyền Chủ, xóa nhóm
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTo, setTransferTo] = useState<string>("");
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeTyped, setRemoveTyped] = useState("");

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-page pt-6 lg:px-8" aria-busy={true}>
        <SkeletonRow />
        <div className="mt-3">
          <SkeletonRow />
        </div>
      </div>
    );
  }

  if (!isTeam || !workspace) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-page pb-24 text-center">
        <Building2 aria-hidden={true} className="size-10 text-ink-3" strokeWidth={1.5} />
        <h1 className="mt-3 text-h2 font-semibold text-ink">{t("empty")}</h1>
        <p className="mt-2 max-w-[40ch] text-small text-ink-2">{t("emptyNote")}</p>
        <div className="mt-5">
          <Button variant="secondary" onClick={() => router.push("/settings")}>
            {t("back")}
          </Button>
        </div>
      </div>
    );
  }

  const list = members.data ?? [];
  const activeMembers = list.filter((m) => m.status === "active" && m.user_id && m.user_id !== workspace.owner_user_id);

  function startEdit() {
    if (!workspace) return;
    setName(workspace.name);
    setProfession(workspace.profession ?? "realestate_sales");
    setReportLang(workspace.default_report_language);
    setEditing(true);
  }

  async function save() {
    if (!workspace || saveBusy || !name.trim()) return;
    setSaveBusy(true);
    try {
      await data.workspaces.update(workspace.id, {
        name: name.trim(),
        profession,
        default_report_language: reportLang,
      });
      toast.show({ tone: "success", message: t("saved") });
      setEditing(false);
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
    } finally {
      setSaveBusy(false);
    }
  }

  async function leave() {
    setLeaveOpen(false);
    if (!workspace) return;
    try {
      await data.workspaces.leave(workspace.id);
      toast.show({ tone: "success", message: t("leaveDone", { name: workspace.name }) });
      router.push("/");
    } catch {
      toast.show({ tone: "error", message: t("leaveError") });
    }
  }

  async function transfer() {
    setTransferOpen(false);
    const target = transferTo;
    setTransferTo("");
    if (!workspace || !target) return;
    try {
      await data.workspaces.transferOwnership(workspace.id, target);
      const m = list.find((x) => x.user_id === target);
      toast.show({ tone: "success", message: t("transferDone", { name: m?.display_name ?? "" }) });
    } catch {
      toast.show({ tone: "error", message: t("transferError") });
    }
  }

  async function removeWorkspace() {
    setRemoveOpen(false);
    setRemoveTyped("");
    if (!workspace) return;
    const wsName = workspace.name;
    try {
      await data.workspaces.remove(workspace.id);
      toast.show({ tone: "success", message: t("removeDone", { name: wsName }) });
      router.push("/");
    } catch {
      toast.show({ tone: "error", message: t("removeError") });
    }
  }

  const canLeave = role !== "owner";
  const transferTarget = list.find((m) => m.user_id === transferTo);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="px-page pt-2 lg:px-8 lg:pt-6">
        <Link
          href="/settings"
          className="inline-flex min-h-11 items-center gap-1.5 text-small font-medium text-ink-2 transition-colors hover:text-ink"
        >
          <ArrowLeft aria-hidden={true} className="size-4" strokeWidth={1.75} />
          {ts("title")}
        </Link>
        <h1 className="mt-1 font-display text-h1 font-semibold text-ink">{t("infoTitle")}</h1>
      </div>

      <div className="flex flex-col gap-4 px-page pb-40 pt-4 lg:px-8 lg:pt-5">
        {/* Thông tin nhóm */}
        <section aria-label={t("infoTitle")} className="rounded-block border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {editing ? (
                <div className="flex flex-col gap-3">
                  <TextField label={t("name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
                  <label className="block">
                    <span className="mb-1.5 block text-small font-medium text-ink">{t("profession")}</span>
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
                    <span className="mb-1.5 block text-small font-medium text-ink">{t("reportLang")}</span>
                    <select
                      value={reportLang}
                      onChange={(e) => setReportLang(e.target.value as Lang)}
                      className="h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
                    >
                      {REPORT_LANGS.map((l) => (
                        <option key={l} value={l}>
                          {ts(LANG_KEY[l])}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={() => void save()} disabled={saveBusy || !name.trim()}>
                      {t("save")}
                    </Button>
                    <Button variant="ghost" icon={X} onClick={() => setEditing(false)}>
                      {t("back")}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-h2 font-semibold text-ink">{workspace.name}</h2>
                  <dl className="mt-2 flex flex-col gap-1 text-small text-ink-2">
                    <div className="flex gap-2">
                      <dt>{t("profession")}:</dt>
                      <dd className="text-ink">{workspace.profession ? td(`prof.${workspace.profession}`) : ""}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt>{t("reportLang")}:</dt>
                      <dd className="text-ink">{ts(LANG_KEY[workspace.default_report_language])}</dd>
                    </div>
                  </dl>
                </>
              )}
            </div>
            {!editing && isAdmin ? (
              <Button variant="ghost" icon={Pencil} iconOnly aria-label={t("edit")} onClick={startEdit} />
            ) : null}
          </div>
          <p className="mt-3 text-small text-ink-2">
            {t("memberCount", { count: list.filter((m) => m.status === "active").length })}
          </p>
        </section>

        {/* Trang quản trị con */}
        <nav aria-label={t("infoTitle")} className="flex flex-col divide-y divide-line rounded-block border border-line bg-surface">
          <Link href="/team/members" className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2">
            <UserPlus aria-hidden={true} className="size-5 shrink-0 text-ink-2" strokeWidth={1.75} />
            <span className="min-w-0 flex-1">
              <span className="block text-body font-medium text-ink">{t("menuMembers")}</span>
              <span className="block text-caption text-ink-3">{t("menuMembersNote")}</span>
            </span>
          </Link>
          <Link href="/team/usage" className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2">
            <span className="min-w-0 flex-1">
              <span className="block text-body font-medium text-ink">{t("menuUsage")}</span>
              <span className="block text-caption text-ink-3">{t("menuUsageNote")}</span>
            </span>
          </Link>
          <Link href="/team/audit" className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2">
            <span className="min-w-0 flex-1">
              <span className="block text-body font-medium text-ink">{t("menuAudit")}</span>
              <span className="block text-caption text-ink-3">{t("menuAuditNote")}</span>
            </span>
          </Link>
          <Link href="/team/templates" className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2">
            <span className="min-w-0 flex-1">
              <span className="block text-body font-medium text-ink">{t("menuTemplates")}</span>
              <span className="block text-caption text-ink-3">{t("menuTemplatesNote")}</span>
            </span>
          </Link>
          <Link href="/team/billing" className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2">
            <span className="min-w-0 flex-1">
              <span className="block text-body font-medium text-ink">{t("menuBilling")}</span>
              <span className="block text-caption text-ink-3">{t("menuBillingNote")}</span>
            </span>
          </Link>
        </nav>

        {/* Quyền riêng tư: điểm bán hàng với bác sĩ, luật sư (docs/08 phần B) */}
        <section
          aria-label={t("noAccess")}
          className="flex items-start gap-3 rounded-block border border-line bg-surface-2/60 p-4"
        >
          <ShieldCheck aria-hidden={true} className="mt-0.5 size-5 shrink-0 text-tag-ok" strokeWidth={1.75} />
          <p className="text-small text-ink-2">{tw("privacyNote")}</p>
        </section>

        {/* Hành động nhóm */}
        <div className="flex flex-col gap-2">
          {isAdmin ? (
            <Button variant="secondary" onClick={() => setTransferOpen(true)}>
              {t("transfer")}
            </Button>
          ) : null}
          {canLeave ? (
            <Button variant="ghost" icon={LogOut} onClick={() => setLeaveOpen(true)}>
              {t("leave")}
            </Button>
          ) : null}
          {isAdmin ? (
            <Button variant="ghost" className="text-tag-risk" onClick={() => setRemoveOpen(true)}>
              {t("remove")}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Rời nhóm */}
      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title={t("leaveTitle", { name: workspace.name })}
        cancelLabel={ts("cancel")}
        confirmLabel={t("leaveConfirm")}
        confirmVariant="danger"
        onConfirm={() => void leave()}
      >
        {t("leaveBody")}
      </ConfirmDialog>

      {/* Chuyển quyền Chủ: chọn thành viên ngay trong hộp xác nhận */}
      <ConfirmDialog
        open={transferOpen}
        onOpenChange={(o) => {
          setTransferOpen(o);
          if (!o) setTransferTo("");
        }}
        title={transferTarget ? t("transferTitle", { name: transferTarget.display_name }) : t("transfer")}
        cancelLabel={ts("cancel")}
        confirmLabel={t("transferConfirm")}
        confirmVariant="danger"
        confirmDisabled={!transferTo}
        onConfirm={() => void transfer()}
      >
        {transferTarget ? (
          t("transferBody")
        ) : (
          <label className="mt-1 block">
            <span className="mb-1.5 block text-small font-medium text-ink">{t("transferPick")}</span>
            <select
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              className="h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
            >
              <option value="">{"\u00A0"}</option>
              {activeMembers.map((m: Member) => (
                <option key={m.user_id} value={m.user_id!}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </label>
        )}
      </ConfirmDialog>

      {/* Xóa nhóm: phải gõ đúng tên nhóm */}
      <ConfirmDialog
        open={removeOpen}
        onOpenChange={(o) => {
          setRemoveOpen(o);
          if (!o) setRemoveTyped("");
        }}
        title={t("removeTitle", { name: workspace.name })}
        cancelLabel={ts("cancel")}
        confirmLabel={t("removeConfirm")}
        confirmVariant="danger"
        confirmDisabled={removeTyped !== workspace.name}
        onConfirm={() => void removeWorkspace()}
      >
        {t("removeBody")}
        <label className="mt-3 block text-left">
          <span className="mb-1.5 block text-small font-medium text-ink">{t("removeConfirmHint")}</span>
          <input
            type="text"
            value={removeTyped}
            onChange={(e) => setRemoveTyped(e.target.value)}
            placeholder={workspace.name}
            aria-label={t("removeConfirmHint")}
            className="h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
          />
        </label>
      </ConfirmDialog>
    </div>
  );
}
