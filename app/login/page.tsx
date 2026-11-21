import { LoginScreen } from "@/components/auth/login-screen";

/* Đăng nhập (đặc tả C1 §1.1, bước 3 PR 01). Ngoài khung ứng dụng. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <LoginScreen initialError={error} />;
}
