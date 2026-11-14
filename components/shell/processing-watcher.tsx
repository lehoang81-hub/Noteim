"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { data, useData } from "@/lib/data";

/*
 * Theo dõi xử lý xong khi người dùng đã rời màn hình xử lý (issue M2-03):
 * thư viện tự cập nhật hàng, và khi một buổi ghi chuyển từ "processing" sang
 * "ready" thì hiện thông báo nhanh "Đã tóm tắt xong: <tên>" có nút "Xem".
 * Đang ở đúng màn hình xử lý của buổi đó thì màn hình tự chuyển tiếp, không báo.
 */
export function ProcessingWatcher() {
  const t = useTranslations("processing");
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const list = useData(() => data.sessions.list(), []);
  const prev = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!list.data) return;
    const before = prev.current;
    for (const s of list.data) {
      if (before.get(s.id) === "processing" && s.status === "ready" && pathname !== `/s/${s.id}/processing`) {
        toast.show({
          tone: "success",
          message: t("doneToast", { title: s.title || s.id }),
          action: { label: t("view"), onClick: () => router.push(`/s/${s.id}`) },
        });
      }
    }
    prev.current = new Map(list.data.map((s) => [s.id, s.status]));
  }, [list.data, pathname, router, t, toast]);

  return null;
}
