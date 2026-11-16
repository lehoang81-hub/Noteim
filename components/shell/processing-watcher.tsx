"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { data, useData } from "@/lib/data";
import { useOffline } from "@/components/shell/app-shell";

/*
 * Theo dõi xử lý xong và tải lên khi có mạng lại (issue M2-03, M2-04):
 * - Buổi ghi chuyển từ "processing" sang "ready" khi người dùng đã rời màn
 *   hình xử lý: hiện thông báo nhanh "Đã tóm tắt xong: <tên>" có nút "Xem".
 *   Đang ở đúng màn hình xử lý của buổi đó thì màn hình tự chuyển tiếp, không báo.
 * - Có mạng lại (hoặc tắt "Mất mạng" trong bảng thử nghiệm): buổi ghi đang
 *   chờ tải lên tự chuyển sang xử lý, kèm thông báo "Đã có mạng. Đang tải lên…".
 */
let watcherWarmed = false;

export function ProcessingWatcher() {
  const t = useTranslations("processing");
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const offline = useOffline();
  // Lần đọc đầu chờ 4 giây (M5-04): người theo dõi không cần dữ liệu buổi ghi
  // ngay khi mở màn hình, trì hoãn để không giành băng thông/CPU với lần vẽ đầu.
  // Các lần đọc sau (dữ liệu đổi) chạy ngay nên thông báo không trễ.
  const list = useData(() => {
    if (watcherWarmed) return data.sessions.list();
    watcherWarmed = true;
    return new Promise<Awaited<ReturnType<typeof data.sessions.list>>>((resolve) => setTimeout(resolve, 4000)).then(
      () => data.sessions.list(),
    );
  }, []);
  const prev = useRef<Map<string, string>>(new Map());

  /* Xử lý xong khi đã rời màn hình xử lý */
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

  /* Có mạng: các buổi ghi chờ tải lên bắt đầu xử lý (kể cả sau khi tải lại trang) */
  useEffect(() => {
    if (offline || !list.data) return;
    const waiting = list.data.filter((s) => s.status === "unsynced" && s.id.startsWith("s-new-"));
    if (!waiting.length) return;
    for (const s of waiting) void data.sessions.retryProcessing(s.id);
    toast.show({ tone: "success", message: t("backOnline", { count: waiting.length }) });
  }, [offline, list.data, t, toast]);

  return null;
}
