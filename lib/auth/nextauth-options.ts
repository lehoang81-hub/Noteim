import type { NextAuthOptions } from "next-auth";
import type { DefaultSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

import { ensureUserAndAccount } from "@/lib/auth/persist";

// Bổ sung kiểu: session.user.id theo đặc tả C1 (users.id là khóa chính
// mọi bảng về sau).
declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id?: string };
  }
}

/**
 * Cấu hình next-auth v4 — chốt ở bước 1 PR 01 (đặc tả C1 §1.1): cài
 * thử chạy được với Next 16.4.6 + React 19.3.0 nên chọn next-auth v4,
 * không cần module tự dựng.
 *
 * Phiên: JWT trong cookie `noteim.session` (httpOnly, SameSite=Lax,
 * 30 ngày) — không cần bảng phiên trong DB; chỉ lần đăng nhập là ghi
 * `users` + `accounts` (lib/auth/persist.ts), không truy vấn mỗi
 * request.
 */
export const SESSION_COOKIE_NAME = "noteim.session";

const isProd = process.env.NODE_ENV === "production";
// Quy ước next-auth: cookie Secure khi URL gốc là https. Chạy thử
// localhost (NEXTAUTH_URL=http://…) dùng cookie thường để trình duyệt
// nhận được.
const baseUrl = process.env.NEXTAUTH_URL ?? "";
const useSecureCookies = baseUrl
  ? baseUrl.startsWith("https://")
  : isProd;
const sessionCookieName = useSecureCookies
  ? `__Secure-${SESSION_COOKIE_NAME}`
  : SESSION_COOKIE_NAME;

/** Bật cho e2e: nhà cung cấp credentials cố định, không cần khóa Google. */
export const isAuthFakeEnabled = () => process.env.AUTH_FAKE === "1";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    ...(isAuthFakeEnabled()
      ? [
          CredentialsProvider({
            id: "demo",
            name: "Người dùng thử",
            credentials: {},
            async authorize() {
              // Người dùng demo cố định — chỉ tồn tại khi AUTH_FAKE=1.
              return {
                id: "11111111-1111-4111-8111-111111111111",
                email: "demo@noteim.app",
                name: "Người dùng thử",
              };
            },
          }),
        ]
      : []),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 ngày; gia hạn trượt xử lý ở bước 3
  },
  cookies: {
    sessionToken: {
      name: sessionCookieName,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  secret:
    process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? undefined,
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      // Chỉ lần đăng nhập (có user + account) là đụng DB — upsert
      // users theo email + nối accounts, lấy users.id vào token.sub.
      // Request sau chỉ đi qua đây với token sẵn có, không chạm DB.
      if (user && account) {
        try {
          const userId = await ensureUserAndAccount(user, account);
          if (!userId) {
            throw new Error("AUTH_NO_USER_ID");
          }
          token.sub = userId;
        } catch (error) {
          // Không ghi nội dung nhạy cảm vào log (§5).
          console.error(
            "[auth] không ghi được người dùng vào DB:",
            error instanceof Error ? error.message : String(error),
          );
          throw new Error("AUTH_DB_WRITE_FAILED");
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
};
