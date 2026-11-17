"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { cn } from "@/lib/cn";
import { LibraryPane } from "./library-pane";

export function LibrarySplit({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onDetail = pathname.startsWith("/s/");
  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[360px_minmax(0,1fr)]">
      {/* Suspense: LibraryPane đọc ?day= (lọc theo ngày từ Tổng quan, M7-02) */}
      <Suspense fallback={null}>
        <LibraryPane
          className={cn(
            "lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:border-r lg:border-line",
            onDetail && "hidden lg:flex",
          )}
        />
      </Suspense>
      <div className={cn("min-w-0", !onDetail && "hidden lg:block")}>{children}</div>
    </div>
  );
}

/** Cột phải trên máy tính khi chưa chọn buổi ghi nào. */
export function PickSession() {
  const t = useTranslations("library");
  return (
    <div className="flex h-dvh items-center justify-center px-8">
      <p className="max-w-[32ch] text-center text-body text-ink-3">{t("pickOne")}</p>
    </div>
  );
}
