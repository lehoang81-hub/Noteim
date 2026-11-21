import type { NextAuthOptions } from "next-auth";
import type { DefaultSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

// Bổ sung kiểu: session.user.id theo đặc tả C1 (user id là khóa chính mọi bảng).
declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id?: string };
  }
}

/**
 * Thử nghiệm bước 1 PR 01 (đặc tả C1 §1.1): next-auth v4 với Next 16.
 *
 * Mục đích của cấu hình này là buộc next-auth v4 đi qua các đường dễ gãy nhất
 * của Next 16: route handler `app/api/auth/[...nextauth]`, `getServerSession`
 * (dùng `cookies()`/`headers()` bất đồng bộ), và cookie phiên tùy biến
 * `noteim.session` theo đặc tả (httpOnly, SameSite=Lax, JWT sống 30 ngày).
 */
export const SESSION_COOKIE_NAME = "noteim.session";

const isProd = process.env.NODE_ENV === "production";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  // Đặc tả §1.1: JWT trong cookie, không cần bảng phiên trong DB.
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 ngày; gia hạn trượt xử lý ở bước 3
  },
  cookies: {
    sessionToken: {
      name: isProd ? `__Secure-${SESSION_COOKIE_NAME}` : SESSION_COOKIE_NAME,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
      },
    },
  },
  secret:
    process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? undefined,
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
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
