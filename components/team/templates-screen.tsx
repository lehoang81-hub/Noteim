"use client";

import { useTranslations } from "next-intl";
import { ComingSoon } from "@/components/shell/coming-soon";

/* Mẫu tóm tắt dùng chung (M7-03): nội dung đầy đủ ở bước 4. */
export function TemplatesScreen() {
  const t = useTranslations("team");
  return <ComingSoon title={t("menuTemplates")} />;
}
