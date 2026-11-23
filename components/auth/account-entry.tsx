"use client";

import { LoaderCircle, LogIn, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useNoteimSession } from "@/lib/auth/use-session";
import { cn } from "@/lib/cn";
import { NoteimSessionProvider } from "./session-provider";

/*
 * Lối vào tài khoản dùng ở đầu Thư viện (trang chủ) và mục "Tài khoản"
 * trong Cài đặt (sau PR #87 — /login trước đó chưa có lối vào từ app).
 *
 * Bọc riêng NoteimSessionProvider đúng bài học PR 01: chỉ vùng này hỏi
 * /api/auth/session, không bọc cả trang (bọc cả trang làm mọi màn hình
 * hỏi phiên khi mở và reload nhanh bị hủy giữa chừng thành lỗi console
 * nhiễu trong hồi quy).
 *
 * Người ẩn danh giữ nguyên luồng (bấm 2 lần là ghi): chỉ hiện lời mời
 * đăng nhập, không chặn thao tác nào. Đã đăng nhập hiện tên người dùng
 * (useNoteimSession) và nút Đăng xuất.
 */

function EntryInner({ variant }: { variant: "home" | "settings" }) {
  const t = useTranslations("login");
  const { isSignedIn, isLoading, displayName, email, signOut } = useNoteimSession();
  const router = useRouter();

  const framed = variant === "home";

  if (isLoading) {
    return (
      <p
        className={cn("flex items-center gap-2 text-small text-ink-3", framed && "min-h-6")}
        data-testid="account-entry-loading"
      >
        <LoaderCircle aria-hidden={true} className="size-4 animate-spin motion-reduce:animate-none" strokeWidth={2} />
        {t("checking")}
      </p>
    );
  }

  if (!isSignedIn) {
    return (
      <div
        className={cn("flex flex-col items-start gap-2", framed && "rounded-block border border-line bg-surface px-4 py-3")}
        data-testid="account-entry-anonymous"
      >
        <p className="text-small text-ink-2">{t("entryInvite")}</p>
        <Button
          variant={framed ? "secondary" : "primary"}
          icon={LogIn}
          className="self-start"
          onClick={() => router.push("/login")}
        >
          {t("entryGo")}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2",
        framed && "rounded-block border border-line bg-surface px-4 py-3",
      )}
      data-testid="account-entry-signed"
    >
      <p className="min-w-0 text-small text-ink-2">
        <span className="font-medium text-ink">{t("entrySignedIn", { name: displayName ?? email ?? "" })}</span>
        {email ? <span className="mt-0.5 block truncate text-caption text-ink-3">{email}</span> : null}
      </p>
      <Button variant="secondary" icon={LogOut} onClick={() => void signOut("/")}>
        {t("signOut")}
      </Button>
    </div>
  );
}

export function AccountEntry({ variant = "home" }: { variant?: "home" | "settings" }) {
  return (
    <NoteimSessionProvider>
      <EntryInner variant={variant} />
    </NoteimSessionProvider>
  );
}
