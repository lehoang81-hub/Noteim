"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SkeletonRow } from "@/components/ui/feedback";
import { MembersContent } from "./members-content";
import { NoAccess } from "./no-access";
import { useTeamWorkspace } from "./use-team";

/*
 * Trang /team/members (M7-03, docs/08 phần B): mời, đổi vai trò, gỡ, thu hồi
 * lời mời. Nội dung dùng chung với bảng trượt M7-01. Thành viên mở bằng đường
 * dẫn thì thấy màn không có quyền; quyền chặn ở repository.
 */
export function MembersScreen() {
  const t = useTranslations("team");
  const tw = useTranslations("workspace");
  const router = useRouter();
  const { workspace, isTeam, role, loading } = useTeamWorkspace();

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
        <h1 className="text-h2 font-semibold text-ink">{t("empty")}</h1>
        <p className="mt-2 max-w-[40ch] text-small text-ink-2">{t("emptyNote")}</p>
        <div className="mt-5">
          <Button variant="secondary" onClick={() => router.push("/settings")}>
            {t("back")}
          </Button>
        </div>
      </div>
    );
  }

  if (role !== "owner" && role !== "admin") return <NoAccess />;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="px-page pt-2 lg:px-8 lg:pt-6">
        <Link
          href="/team"
          className="inline-flex min-h-11 items-center gap-1.5 text-small font-medium text-ink-2 transition-colors hover:text-ink"
        >
          <ArrowLeft aria-hidden={true} className="size-4" strokeWidth={1.75} />
          {t("infoTitle")}
        </Link>
        <h1 className="mt-1 font-display text-h1 font-semibold text-ink">{tw("membersTitle")}</h1>
        <p className="mt-1 text-small text-ink-2">{tw("membersHint")}</p>
      </div>
      <div className="px-page pb-40 pt-4 lg:px-8 lg:pt-5">
        <MembersContent workspaceId={workspace.id} />
      </div>
    </div>
  );
}
