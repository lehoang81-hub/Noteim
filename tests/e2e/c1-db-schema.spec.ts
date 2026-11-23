import { expect, test } from "@playwright/test";
import { collectErrors, onboard } from "./helpers";

/**
 * C1-02 (PR schema database) — hồi quy nền dữ liệu.
 *
 * PR 02 chỉ đụng lib/db, drizzle/, scripts db-check/db-seed và dataNow()
 * của lib/data — giao diện vẫn chạy mock (nguồn remote bật ở PR 03). Bài này
 * chốt hai điều: (1) app mock chạy bình thường sau khi schema đổi, (2) trang
 * đăng nhập của PR 01 không bị ảnh hưởng. Chi tiết thao tác DB thật nằm ở
 * scripts/db-check.mjs / db-seed.mjs (chạy bằng node, không phải trình duyệt).
 */

test("C1-02: thư viện mock vẫn chạy bình thường sau khi thêm schema", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  // Thư viện hiện buổi ghi mẫu như cũ (mô hình dataNow() mock giữ MOCK_NOW)
  await expect(page.locator("a[href^='/s/']").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("C1-02: trang đăng nhập PR 01 vẫn hoạt động", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /Google/ }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
