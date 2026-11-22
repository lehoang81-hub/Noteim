import { NoteimSessionProvider } from "@/components/auth/session-provider";
import { LoginScreen } from "@/components/auth/login-screen";

/*
 * Đăng nhập (đặc tả C1 §1.1, bước 3 PR 01). Ngoài khung ứng dụng.
 *
 * Provider phiên chỉ bọc trang này (nơi duy nhất dùng hook phiên ở
 * PR 01): bọc toàn app thì mỗi trang đều hỏi /api/auth/session lúc
 * mở, reload nhanh bị hủy giữa chừng thành lỗi console nhiễu trong
 * hồi quy. Các PR sau cần phiên ở trang khác thì bọc riêng trang đó.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <NoteimSessionProvider>
      <LoginScreen initialError={error} />
    </NoteimSessionProvider>
  );
}
