"use client";

import { useTranslations } from "next-intl";
import { ComingSoon } from "@/components/shell/coming-soon";

/* Gói và hóa đơn (M7-03): nội dung đầy đủ ở bước 4. */
export function BillingScreen() {
  const t = useTranslations("team");
  return <ComingSoon title={t("menuBilling")} />;
}
