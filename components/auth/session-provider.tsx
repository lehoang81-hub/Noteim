"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

/*
 * Cung cấp phiên cho các màn hình cần nó (đặc tả C1 §1.1). Ở PR 01
 * chỉ trang đăng nhập bọc provider này: bọc toàn app làm mọi trang
 * đều hỏi /api/auth/session khi mở, và reload nhanh (hồi quy) bị hủy
 * giữa chừng thành lỗi console nhiễu. Trang cần phiên bọc riêng,
 * dùng `useNoteimSession()` từ lib/auth/use-session.
 */
export function NoteimSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NextAuthSessionProvider
      refetchOnWindowFocus={false}
      refetchInterval={0}
    >
      {children}
    </NextAuthSessionProvider>
  );
}
