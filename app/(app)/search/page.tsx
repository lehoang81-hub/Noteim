"use client";

import { useTranslations } from "next-intl";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function Page() {
  const t = useTranslations("shell");
  return <ComingSoon title={t("search")} />;
}
