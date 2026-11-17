"use client";

import { ArrowRight, Building2, ClipboardList, FileSpreadsheet, Gem, LayoutTemplate, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { SkeletonRow } from "@/components/ui/feedback";
import { useTeamWorkspace } from "@/components/team/use-team";

/*
 * Mục "Nhóm" trong Cài đặt (M7-03, docs/08 phần B): chỉ hiện khi đang dùng
 * không gian Nhóm; dẫn tới các trang quản trị /team/*. Mục này ẩn trong
 * không gian Cá nhân (lọc ở SectionMenu).
 */
export function TeamSection() {
  const t = useTranslations("team");
  const { workspace, isTeam, loading } = useTeamWorkspace();

  const items = [
    { href: "/team", label: t("menuInfo"), note: t("menuInfoNote"), icon: Building2 },
    { href: "/team/members", label: t("menuMembers"), note: t("menuMembersNote"), icon: Users },
    { href: "/team/usage", label: t("menuUsage"), note: t("menuUsageNote"), icon: FileSpreadsheet },
    { href: "/team/audit", label: t("menuAudit"), note: t("menuAuditNote"), icon: ClipboardList },
    { href: "/team/templates", label: t("menuTemplates"), note: t("menuTemplatesNote"), icon: LayoutTemplate },
    { href: "/team/billing", label: t("menuBilling"), note: t("menuBillingNote"), icon: Gem },
  ];

  if (loading || !workspace) {
    return (
      <div aria-busy={true}>
        <SkeletonRow />
      </div>
    );
  }

  if (!isTeam) {
    return (
      <div>
        <p className="text-small text-ink-2">{t("emptyNote")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-small text-ink-2">{t("settingsIntro", { name: workspace.name })}</p>
      <nav aria-label={t("settingsIntro", { name: workspace.name })} className="flex flex-col divide-y divide-line rounded-block border border-line bg-surface">
        {items.map(({ href, label, note, icon: Icon }) => (
          <Link key={href} href={href} className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2">
            <Icon aria-hidden={true} className="size-5 shrink-0 text-ink-2" strokeWidth={1.75} />
            <span className="min-w-0 flex-1">
              <span className="block text-body font-medium text-ink">{label}</span>
              <span className="block text-caption text-ink-3">{note}</span>
            </span>
            <ArrowRight aria-hidden={true} className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
          </Link>
        ))}
      </nav>
    </div>
  );
}
