"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/feedback";
import { TopBar } from "./app-shell";

/** Màn hình giữ chỗ cho các phần thuộc mốc sau. */
export function ComingSoon({ title }: { title: string }) {
  const t = useTranslations("shell");
  return (
    <>
      <TopBar
        title={title}
        leading={
          <Link
            href="/"
            aria-label={t("back")}
            className="-ml-2 flex size-11 items-center justify-center rounded-control text-ink hover:bg-surface-2"
          >
            <ArrowLeft aria-hidden={true} className="size-5" strokeWidth={1.75} />
          </Link>
        }
        actions={<span />}
      />
      <EmptyState
        message={t("soon")}
        action={
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-control border border-line bg-surface px-4 text-small font-semibold text-ink hover:bg-surface-2"
          >
            {t("toLibrary")}
          </Link>
        }
      />
    </>
  );
}
