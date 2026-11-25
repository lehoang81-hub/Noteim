"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { data, DataError, type SessionDetail } from "@/lib/data";

/*
 * Băng "Tóm tắt lại" (C1-09 mục 4): buổi có sửa lời hoặc đổi người nói sau
 * lần tóm tắt gần nhất (transcript_stale, máy chủ đặt) thì tab Tóm tắt và
 * tab Việc hiện băng kèm nút Tóm tắt lại. Bấm thì máy chủ đặt asr_stage
 * "summarizing" theo luồng xử lý sẵn có, màn xử lý và ProcessingWatcher tự
 * đẩy tới khi xong. Hết lượt gói Free thì báo đúng thông tin, không hiện
 * như lỗi máy.
 */
export function ResummarizeBanner({ detail, className }: { detail: SessionDetail; className?: string }) {
  const t = useTranslations("session");
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (!detail.transcript_stale) return null;

  async function resummarize() {
    setBusy(true);
    try {
      await data.sessions.resummarize(detail.id);
      // Thành công: buổi chuyển sang đang xử lý, màn chi tiết tự đổi sang
      // màn xử lý (StatusBlock) và theo dõi tới khi xong
    } catch (error) {
      if (error instanceof DataError && error.code === "quota_exceeded") {
        // Hết lượt: nói rõ đã dùng hết 3 lượt của gói Free, không hiện như lỗi máy
        toast.show({ tone: "error", message: t("resummarizeQuota") });
      } else {
        toast.show({ tone: "error", message: t("resummarizeError") });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="resummarize-banner" className={className}>
      <Banner
        kind="expiring"
        icon={RefreshCw}
        action={
          <Button variant="secondary" className="h-9 shrink-0" loading={busy} onClick={() => void resummarize()}>
            {t("resummarizeButton")}
          </Button>
        }
      >
        {t("resummarizeBanner")}
      </Banner>
    </div>
  );
}
