import { expect, test } from "@playwright/test";
import { collectErrors, onboard } from "./helpers";

/**
 * Tổng quan cá nhân và nhóm (M7-02, issue #48).
 * Bài của từng bước viết cùng bước đó; chạy lại toàn bộ ở bước 5.
 */

/* ---------- Bước 2/5: Điều hướng ---------- */

// Hai nav cùng nhãn "Điều hướng chính": thứ nhất là thanh bên máy tính,
// thứ hai là thanh dưới điện thoại.
const NAV = "Điều hướng chính";

test("thanh dưới điện thoại: đủ năm mục, Ghi âm ở giữa", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  const bottom = page.getByRole("navigation", { name: NAV }).nth(1);
  await expect(bottom.locator("a[href='/']")).toBeVisible();
  await expect(bottom.locator("a[href='/dashboard']")).toBeVisible();
  await expect(bottom.locator("a[href='/tasks']")).toBeVisible();
  await expect(bottom.locator("a[href='/settings']")).toBeVisible();
  // Thứ tự: Thư viện, Tổng quan, Ghi âm (giữa), Việc, Cài đặt
  const seq = await bottom
    .locator("ul")
    .evaluate((ul) =>
      Array.from(ul.children).flatMap((li) =>
        Array.from(li.children).map((c) =>
          c.tagName === "A" ? (c as HTMLAnchorElement).getAttribute("href") : c.querySelector("button") ? "record" : "other",
        ),
      ),
    );
  expect(seq).toEqual(["/", "/dashboard", "record", "/tasks", "/settings"]);
  expect(errors).toEqual([]);
});

test("thanh bên máy tính: Thư viện, Tổng quan, Việc, Cài đặt", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  const side = page.getByRole("navigation", { name: NAV }).nth(0);
  const hrefs = await side
    .locator("ul a")
    .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")));
  expect(hrefs).toEqual(["/", "/dashboard", "/tasks", "/settings"]);
  expect(errors).toEqual([]);
});

test("Ghi âm vẫn 2 lần chạm: thanh dưới dẫn tới màn ghi, chưa ghi ngay", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  const bottom = page.getByRole("navigation", { name: NAV }).nth(1);
  await bottom.getByRole("button", { name: "Ghi âm" }).click();
  await expect(page).toHaveURL(/\/record$/);
  // Lần chạm thứ hai mới bắt đầu: màn ghi đang ở bảng xin quyền micro, chưa ghi
  await expect(page.getByText("Cho phép Noteim dùng micro")).toBeVisible();
  expect(errors).toEqual([]);
});
