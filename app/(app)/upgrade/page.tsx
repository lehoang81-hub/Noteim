"use client";

import { useTranslations } from "next-intl";
import { ComingSoon } from "@/components/shell/coming-soon";

/* Trang giữ chỗ: bản mockup chưa nối thanh toán (docs/03-screens.md mục 13, thuộc M4). */
export default function UpgradePage() {
  const t = useTranslations("shell");
  return <ComingSoon title={t("upgrade")} />;
}
