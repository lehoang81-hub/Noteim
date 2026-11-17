"use client";

import { useTranslations } from "next-intl";
import { SkeletonRow } from "@/components/ui/feedback";
import { TemplatesSection } from "@/components/settings/templates-section";
import { NoAccess } from "./no-access";
import { useTeamWorkspace } from "./use-team";

/*
 * Trang /team/templates (M7-03, docs/08 phần B): mẫu tóm tắt dùng chung của
 * nhóm. Thành viên dùng mẫu khi ghi; chỉ Chủ và Quản trị mở trang này để sửa
 * các phần (bảng quyền M7-01, chặn ở repository qua updateTemplate).
 */
export function TemplatesScreen() {
  const t = useTranslations("team");
  const { workspace, isTeam, isAdmin, loading: wsLoading } = useTeamWorkspace();

  if (wsLoading) {
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
        <h1 className="text-h2 font-semibold text-ink">{t("empty")}</h1>
        <p className="mt-2 max-w-[40ch] text-small text-ink-2">{t("emptyNote")}</p>
      </div>
    );
  }

  if (!isAdmin) return <NoAccess />;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="px-page pt-2 lg:px-8 lg:pt-6">
        <h1 className="font-display text-h1 font-semibold text-ink">{t("menuTemplates")}</h1>
        <p className="mt-1 text-small text-ink-2">{t("templatesIntro")}</p>
      </div>
      <div className="px-page pb-40 pt-4 lg:px-8 lg:pt-5">
        <TemplatesSection />
      </div>
    </div>
  );
}
