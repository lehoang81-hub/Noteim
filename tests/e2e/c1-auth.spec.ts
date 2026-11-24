import { expect, test } from "@playwright/test";

import { collectErrors, onboard } from "./helpers";

/**
 * C1-01 — nền đăng nhập (đặc tả C1 §1.1, PR 01 bước 4).
 *
 * Server phải chạy với biến môi trường (build lần lượt):
 *   NEXT_PUBLIC_AUTH_FAKE=1 pnpm build          # nút đăng nhập thử cho e2e
 *   AUTH_FAKE=1 AUTH_SECRET=<bí mật thử> \
 *   NEXTAUTH_URL=http://localhost:3100 \
 *   GAP_CHECK_FAKE=1 GAP_CHECK_FREE_DAILY=3 pnpm start -p 3100
 *
 * AUTH_FAKE=1 là nhà cung cấp đăng nhập demo (người dùng thử cố định,
 * không cần khóa Google, không đụng DB) — chỉ bật trên máy kiểm thử.
 * Mọi bài đăng nhập/đăng xuất chạy cả phone lẫn desktop; bài API chạy
 * một project (phone) để không nhân lượt.
 */

const DEMO_USER_ID = "11111111-1111-4111-8111-111111111111";
const TRANSCRIPT_DAI = "Bác: Em chào chị, mình chốt kế hoạch quý này nhé. ".repeat(10);

/**
 * Lọc nhiễu đã biết của next-auth v4: khi trang điều hướng ngay trong
 * lúc hỏi phiên, request /api/auth/session bị hủy và console ghi
 * CLIENT_FETCH_ERROR "Failed to fetch" — server vẫn trả 200 (đã thử
 * trực tiếp trong cùng lần chạy). Những lỗi khác giữ nguyên để bắt.
 */
function collectAuthErrors(page: import("@playwright/test").Page) {
  return collectErrors(page).filter(
    (e) => !e.includes("CLIENT_FETCH_ERROR") || !e.includes("Failed to fetch"),
  );
}

async function dangNhapDemo(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /Đăng nhập thử/ })).toBeVisible();
  await Promise.all([
    page.waitForURL((u) => u.pathname === "/"),
    page.getByRole("button", { name: /Đăng nhập thử/ }).click(),
  ]);
  // Ngữ cảnh mới chưa onboard: bỏ qua màn làm quen để tới Thư viện.
  await onboard(page);
}

test.describe("ẩn danh giữ nguyên (bấm 2 lần là ghi)", () => {
  test("mở app không đăng nhập vẫn dùng được thư viện", async ({ page }) => {
    const errors = collectErrors(page);
    await onboard(page);
    const probe = await page.evaluate(async () => {
      const res = await fetch("/api/auth-probe");
      return (await res.json()) as { hasSession: boolean; userId: string | null };
    });
    expect(probe.hasSession).toBe(false);
    expect(probe.userId).toBeNull();
    expect(errors).toEqual([]);
  });
});

test.describe("đăng nhập bằng nhà cung cấp demo", () => {
  test("đăng nhập thử: có cookie phiên, /api/auth-probe thấy id", async ({ page, context }) => {
    const errors = collectAuthErrors(page);
    await dangNhapDemo(page);

    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name === "noteim.session");
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie?.httpOnly).toBe(true);

    const probe = await page.evaluate(async () => {
      const res = await fetch("/api/auth-probe");
      return (await res.json()) as { hasSession: boolean; userId: string | null };
    });
    expect(probe.hasSession).toBe(true);
    expect(probe.userId).toBe(DEMO_USER_ID);
    expect(errors).toEqual([]);
  });

  test("trang đăng nhập ở trạng thái đã đăng nhập có nút đăng xuất", async ({ page }) => {
    await dangNhapDemo(page);
    await page.goto("/login");
    await expect(page.getByText("Bạn đang đăng nhập bằng")).toBeVisible();
    await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
  });

  test("đăng xuất: xóa phiên, về thư viện chế độ ẩn danh (§1.1)", async ({ page }) => {
    await dangNhapDemo(page);
    await page.goto("/login");
    await expect(page.getByText("Bạn đang đăng nhập bằng")).toBeVisible();

    await Promise.all([
      page.waitForURL((u) => u.pathname === "/"),
      page.getByRole("button", { name: "Đăng xuất" }).click(),
    ]);
    // Nguồn remote không ghi cờ làm quen trên máy như bản giả: sau đăng xuất
    // người ẩn danh được đưa qua /welcome — bỏ qua để về thư viện ẩn danh.
    await onboard(page);
    await page.locator("a[href^='/s/']").first().waitFor();

    const probe = await page.evaluate(async () => {
      const res = await fetch("/api/auth-probe");
      return (await res.json()) as { hasSession: boolean };
    });
    expect(probe.hasSession).toBe(false);
  });

  test("trang đăng nhập hiện thông báo khi có mã lỗi", async ({ page }) => {
    await page.goto("/login?error=Configuration");
    await expect(page.getByText(/cấu hình/)).toBeVisible();
  });
});

test.describe("proxy kiểm phiên API (đặc tả §1.1)", () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "phone", "API spec chỉ chạy một project");
  });

  test("GHI chưa đăng nhập bị chặn 401", async ({ request }) => {
    const res = await request.post("/api/e2e-khong-ton-tai", { data: {} });
    expect(res.status()).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("unauthorized");
  });

  test("GET không bị chặn khi chưa đăng nhập", async ({ request }) => {
    const res = await request.get("/api/auth-probe");
    expect(res.status()).toBe(200);
  });

  test("gap-check ẩn danh vẫn được gọi với mã khách như hiện tại", async ({ request }) => {
    const res = await request.post("/api/sessions/e2e-auth-gap/gap-check", {
      headers: { "x-noteim-client": `e2e-auth-${Date.now()}` },
      data: { templateId: "general_meeting", transcript: TRANSCRIPT_DAI },
    });
    // Qua proxy là chính (không 401); route trả gì do bài GC chốt.
    expect(res.status()).not.toBe(401);
  });
});
