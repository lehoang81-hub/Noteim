"use client";

import { useTranslations } from "next-intl";
import { ComingSoon } from "@/components/shell/coming-soon";

/* Mức dùng theo người (M7-03): nội dung đầy đủ ở bước 3. */
export function UsageScreen() {
  const t = useTranslations("team");
  return <ComingSoon title={t("menuUsage")} />;
}
