import type { Metadata } from "next";
import { Be_Vietnam_Pro, Bricolage_Grotesque } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { NoteimSessionProvider } from "@/components/auth/session-provider";
import { MotionProvider } from "@/components/motion-provider";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["vietnamese", "latin"],
  weight: ["600", "700"],
  variable: "--font-bricolage",
  display: "swap",
});

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  // 400-600 là những trọng lượng chữ thân dùng thật; 700 chỉ có trên font-display
  weight: ["400", "500", "600"],
  variable: "--font-bevietnam",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  // Mô tả trang lấy từ file ngôn ngữ, không viết cứng.
  const messages = await getMessages();
  const metadata = messages.metadata as { title?: string; description?: string };

  return {
    title: metadata?.title ?? "Noteim",
    description: metadata?.description,
  };
}

/*
 * Chống chớp giao diện: áp giao diện đã lưu trước khi trang kịp vẽ.
 * Lựa chọn nằm trong localStorage ("noteim-theme"); chưa chọn thì theo hệ điều hành.
 */
const themeInitScript = `(function(){try{var t=localStorage.getItem("noteim-theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      // Biến phông phải nằm trên <html> để token --font-display/--font-body
      // khai báo ở :root (styles/tokens.css) nhìn thấy được.
      className={`${bricolage.variable} ${beVietnamPro.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-bg font-body text-ink antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <NoteimSessionProvider>
            <MotionProvider>
              <ToastProvider>{children}</ToastProvider>
            </MotionProvider>
          </NoteimSessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
