import { AppShell } from "@/components/shell/app-shell";

/* Mọi màn hình của ứng dụng nằm trong khung này. /styleguide nằm ngoài. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
