"use client";

import { useTranslations } from "next-intl";
import { ComingSoon } from "@/components/shell/coming-soon";

/* Nhật ký truy cập (M7-03): nội dung đầy đủ ở bước 2. */
export function AuditScreen() {
  const t = useTranslations("team");
  return <ComingSoon title={t("menuAudit")} />;
}
