"use client";

import { Library, ListChecks, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { Banner } from "@/components/ui/feedback";
import { RecordButton } from "@/components/ui/record-button";
import { RecordingBar } from "@/components/record/recording-bar";
import { ProcessingWatcher } from "./processing-watcher";
import { cn } from "@/lib/cn";
import { useDebugFlags } from "@/lib/debug/flags";
import { DebugPanel } from "./debug-panel";

/*
 * Khung ứng dụng (docs/02-design-system.md, "Bố cục").
 * - Điện thoại: thanh điều hướng dưới có đúng ba mục: Thư viện, nút ghi âm ở giữa
 *   (nhô lên), Việc. Tìm kiếm và Cài đặt ở góc trên phải của từng trang (TopBar).
 * - Máy tính (từ 1024px): cột trái 88px gồm logo, Thư viện, Việc, Cài đặt, nút ghi âm.
 * - Dải báo mất mạng nằm trên cùng.
 * - /record không có khung ứng dụng; nút ghi âm ở mọi trang đi tới /record và
 *   bắt đầu ghi luôn (luồng start nằm ở màn hình ghi).
 */

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Mất mạng thật, hoặc bị ép bằng bảng thử nghiệm. */
export function useOffline() {
  const flags = useDebugFlags();
  const browserOffline = useSyncExternalStore(subscribeOnline, () => !navigator.onLine, () => false);
  return flags.offline || browserOffline;
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/s/");
  return pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("shell");
  const pathname = usePathname();
  const router = useRouter();
  const offline = useOffline();

  // Màn hình ghi âm và màn hình xử lý không có khung ứng dụng
  // (docs/03-screens.md mục 3, 4): tự lo nền, trạng thái và dải báo của riêng
  // chúng. Bảng thử nghiệm và trình theo dõi xử lý vẫn sẵn.
  if (pathname === "/record" || pathname.endsWith("/processing")) {
    return (
      <div className="min-h-dvh">
        {children}
        <ProcessingWatcher />
        <DebugPanel />
      </div>
    );
  }

  const items = [
    { href: "/", label: t("library"), icon: Library },
    { href: "/tasks", label: t("tasks"), icon: ListChecks },
  ];

  return (
    <div className="min-h-dvh lg:pl-[88px]">
      {/* Đang ghi ở nơi khác: thanh sen trên cùng, chạm để về màn hình ghi (M2-02) */}
      <RecordingBar />

      {/* Cột trái trên máy tính */}
      <nav
        aria-label={t("nav")}
        className="fixed inset-y-0 left-0 z-30 hidden w-[88px] flex-col items-center border-r border-line bg-surface py-5 lg:flex"
      >
        <Link href="/" aria-label={t("brand")} className="flex size-11 items-center justify-center rounded-control">
          <span aria-hidden={true} className="size-7 rounded-pill" style={{ background: "var(--gradient-dawn)" }} />
        </Link>
        <ul className="mt-6 flex flex-col gap-1">
          {[...items, { href: "/settings", label: t("settings"), icon: Settings }].map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex w-[72px] flex-col items-center gap-1 rounded-control py-2.5 text-caption font-medium transition-colors ease-noteim duration-(--t-quick)",
                    active ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink",
                  )}
                >
                  <Icon aria-hidden={true} className="size-6" strokeWidth={1.75} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto flex flex-col items-center gap-1.5">
          <RecordButton label={t("record")} onClick={() => router.push("/record")} />
          <span className="text-caption font-medium text-ink-2">{t("record")}</span>
        </div>
      </nav>

      {offline ? (
        <div className="sticky top-0 z-20">
          <Banner kind="offline">{t("offline")}</Banner>
        </div>
      ) : null}

      <div className="pb-[calc(88px+env(safe-area-inset-bottom))] lg:pb-0">{children}</div>

      <ProcessingWatcher />

      {/* Thanh điều hướng dưới trên điện thoại */}
      <nav
        aria-label={t("nav")}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-md grid-cols-3 items-center">
          {items.map(({ href, label, icon: Icon }, i) => {
            const active = isActive(pathname, href);
            const link = (
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-0.5 text-caption font-medium",
                  active ? "text-ink" : "text-ink-3",
                )}
              >
                <Icon aria-hidden={true} className="size-6" strokeWidth={active ? 2 : 1.75} />
                {label}
              </Link>
            );
            return i === 0 ? (
              <li key={href} className="contents">
                <span>{link}</span>
                <span className="flex justify-center">
                  <RecordButton label={t("record")} className="-mt-9" onClick={() => router.push("/record")} />
                </span>
              </li>
            ) : (
              <li key={href}>{link}</li>
            );
          })}
        </ul>
      </nav>

      <DebugPanel />
    </div>
  );
}

/** Thanh tiêu đề trên điện thoại: tiêu đề trang bên trái, Tìm kiếm và Cài đặt bên phải. */
export function TopBar({ title, leading, actions }: { title?: string; leading?: React.ReactNode; actions?: React.ReactNode }) {
  const t = useTranslations("shell");
  return (
    <header className="flex min-h-14 items-center gap-1 px-page pt-2 lg:pt-4">
      {leading}
      {title ? <p className="min-w-0 flex-1 truncate text-body-strong font-semibold text-ink">{title}</p> : <span className="flex-1" />}
      {actions ?? (
        <>
          <Link
            href="/search"
            aria-label={t("search")}
            className="flex size-11 items-center justify-center rounded-control text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <Search aria-hidden={true} className="size-5" strokeWidth={1.75} />
          </Link>
          <Link
            href="/settings"
            aria-label={t("settings")}
            className="flex size-11 items-center justify-center rounded-control text-ink-2 hover:bg-surface-2 hover:text-ink lg:hidden"
          >
            <Settings aria-hidden={true} className="size-5" strokeWidth={1.75} />
          </Link>
        </>
      )}
    </header>
  );
}
