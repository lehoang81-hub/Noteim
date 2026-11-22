"use client";

import { signIn, signOut, useSession } from "next-auth/react";

/*
 * Hook phiên của Noteim (đặc tả C1 §1.1, bước 3 PR 01). Màn hình gọi
 * hook này thay vì `useSession` trực tiếp để sau này đổi cấu hình
 * phiên (thêm vai trò, gói, không gian) chỉ sửa một chỗ.
 *
 * Màn hình dùng hook phải nằm trong `NoteimSessionProvider`
 * (components/auth/session-provider.tsx). Ở PR 01 chỉ trang đăng
 * nhập bọc provider; PR sau cần phiên ở trang khác thì bọc riêng
 * trang đó.
 *
 * Triết lý "bấm 2 lần là ghi": chưa đăng nhập vẫn dùng app ẩn danh,
 * dữ liệu trên máy. `isSignedIn` để màn hình bật tính năng cần tài
 * khoản (nhóm, hạn mức, gói trả phí).
 */
export function useNoteimSession() {
  const { data: session, status, update } = useSession();

  return {
    /** Phiên hiện tại, `null` khi chưa đăng nhập hoặc đang hỏi. */
    session: status === "authenticated" ? session : null,
    /** "loading" | "authenticated" | "unauthenticated" */
    status,
    isSignedIn: status === "authenticated",
    isLoading: status === "loading",
    userId: session?.user?.id ?? null,
    email: session?.user?.email ?? null,
    displayName: session?.user?.name ?? null,
    /** Làm mới phiên phía máy khách (sau đổi hồ sơ ở PR sau). */
    refresh: update,
    /** Đăng nhập Google (cửa chính). */
    signInWithGoogle: (callbackUrl = "/") =>
      signIn("google", { callbackUrl }),
    /** Đăng nhập bằng nhà cung cấp bất kỳ (nhà cung cấp demo của e2e). */
    signInWith: (provider: string, callbackUrl = "/") =>
      signIn(provider, { callbackUrl }),
    /** Đăng xuất: xóa cookie, về Thư viện chế độ ẩn danh (§1.1). */
    signOut: (callbackUrl = "/") => signOut({ callbackUrl }),
  };
}
