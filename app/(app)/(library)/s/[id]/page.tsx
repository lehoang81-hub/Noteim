import { Suspense } from "react";
import { SessionDetailScreen } from "@/components/session/detail/session-detail";

/* Chi tiết buổi ghi. Dữ liệu tải ở trình duyệt qua lib/data. */
export default function SessionPage() {
  return (
    <Suspense fallback={null}>
      <SessionDetailScreen />
    </Suspense>
  );
}
