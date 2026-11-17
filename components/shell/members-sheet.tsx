"use client";

import { useTranslations } from "next-intl";
import { Sheet } from "@/components/ui/sheet";
import { MembersContent } from "@/components/team/members-content";

/*
 * Bảng trượt "Thành viên và lời mời" của không gian nhóm (M7-01). Từ M7-03
 * nội dung chuyển sang MembersContent dùng chung với trang /team/members.
 */
export function MembersSheet({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("workspace");
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t("membersTitle")} description={t("membersHint")} size="half">
      <MembersContent workspaceId={workspaceId} />
    </Sheet>
  );
}
