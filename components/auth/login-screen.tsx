"use client";

import { ArrowRight, LoaderCircle, LogOut, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useNoteimSession } from "@/lib/auth/use-session";

/*
 * Trang đăng nhập (đặc tả C1 §1.1, §2.1; bước 3 PR 01).
 *
 * Cửa chính là Google OAuth, một chạm. Chưa đăng nhập vẫn dùng app
 * ẩn danh (bấm 2 lần là ghi, dữ liệu trên máy) nên trang luôn có lối
 * thoát vào thư viện. Khi AUTH_FAKE=1 (e2e, không bật production)
 * hiện thêm nút đăng nhập thử để chạy e2e không cần khóa Google.
 */

const isAuthFake = process.env.NEXT_PUBLIC_AUTH_FAKE === "1";

export function LoginScreen({ initialError }: { initialError?: string }) {
  const t = useTranslations("login");
  const {
    isSignedIn,
    isLoading,
    email,
    signInWith,
    signOut,
  } = useNoteimSession();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function enter(provider: "google" | "demo") {
    setBusy(provider);
    try {
      await signInWith(provider, "/");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 py-10 text-center">
      <div className="flex w-full max-w-xs flex-col items-center">
        <p className="font-display text-h1 font-semibold text-ink">Noteim</p>
        <h1 className="mt-2 text-body font-medium text-ink">
          {t("title")}
        </h1>
        <p className="mt-2 text-small text-ink-2">{t("subtitle")}</p>

        {initialError ? (
          <p
            role="alert"
            className="mt-4 w-full rounded-lg bg-tag-risk/10 px-3 py-2 text-small text-tag-risk"
          >
            {initialError === "Configuration"
              ? t("errorConfig")
              : t("errorGeneric")}
          </p>
        ) : null}

        {isLoading ? (
          <div className="mt-8 flex w-full items-center justify-center gap-2 text-small text-ink-2">
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
            <span>{t("checking")}</span>
          </div>
        ) : isSignedIn ? (
          <>
            <p className="mt-8 text-small text-ink-2">{t("signedInAs")}</p>
            <p className="mt-1 text-body font-medium text-ink">{email}</p>
            <div className="mt-6 flex w-full flex-col gap-2">
              <Button
                variant="primary"
                icon={ArrowRight}
                onClick={() => router.push("/")}
              >
                {t("continue")}
              </Button>
              <Button
                variant="ghost"
                icon={LogOut}
                onClick={() => {
                  void signOut("/");
                }}
              >
                {t("signOut")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-8 flex w-full flex-col gap-2">
              <Button
                variant="primary"
                loading={busy === "google"}
                disabled={busy !== null}
                onClick={() => {
                  void enter("google");
                }}
              >
                {t("googleButton")}
              </Button>
              {isAuthFake ? (
                <Button
                  variant="secondary"
                  loading={busy === "demo"}
                  disabled={busy !== null}
                  onClick={() => {
                    void enter("demo");
                  }}
                >
                  {t("demoButton")}
                </Button>
              ) : null}
              <Button variant="ghost" onClick={() => router.push("/")}>
                {t("anonymousContinue")}
              </Button>
            </div>
            <p className="mt-6 flex items-start gap-2 text-left text-small text-ink-2">
              <ShieldCheck
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-ink-2"
              />
              <span>{t("anonymousNote")}</span>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
