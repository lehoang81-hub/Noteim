"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

/*
 * Cung cấp phiên cho toàn app (đặc tả C1 §1.1). Bọc ở root layout:
 * màn hình chỉ cần `useNoteimSession()` từ lib/auth/use-session.
 * Không tự hỏi lại khi cửa sổ lấy lại nét để giảm lọc lặp request;
 * sau đăng nhập/đăng xuất next-auth tự làm mới.
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
