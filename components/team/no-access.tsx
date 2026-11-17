"use client";

import { ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/*
 * Màn không có quyền của trang quản trị nhóm (M7-03): Thành viên mở /team/*
 * bằng đường dẫn thì thấy thông báo này, không lộ nội dung quản trị.
 * Quyền chặn ở repository; màn này chỉ là thông báo giao diện.
 */
export function NoAccess() {
  const t = useTranslations("team");
  const router = useRouter();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-page pb-24 text-center">
      <ShieldAlert aria-hidden={true} className="size-10 text-ink-3" strokeWidth={1.5} />
      <h1 className="mt-3 text-h2 font-semibold text-ink">{t("noAccess")}</h1>
      <p className="mt-2 max-w-[40ch] text-small text-ink-2">{t("noAccessNote")}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button variant="secondary" onClick={() => router.push("/settings")}>
          {t("back")}
        </Button>
        <Button variant="ghost" onClick={() => router.push("/")}>
          {t("backHome")}
        </Button>
      </div>
    </div>
  );
}
