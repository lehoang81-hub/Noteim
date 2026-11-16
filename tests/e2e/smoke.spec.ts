import { expect, test } from "@playwright/test";
import { collectErrors, onboard, scrollWidth, setLocale, touchHold, touchSwipe } from "./helpers";

/**
 * Hồi quy tối thiểu cho các tính năng đã nghiệm thu ở M1 đến M6.
 * Mỗi mốc mới thêm file spec riêng; không sửa bài cũ để cho qua.
 */

test("thư viện, chi tiết, không tràn, không lỗi", async ({ page }, info) => {
  const errors = collectErrors(page);
  await onboard(page);
  expect(await scrollWidth(page)).toBeLessThanOrEqual(info.project.use.viewport!.width);
  await page.goto("/s/s-bds-lan");
  await expect(page.getByText("Ngân sách tối đa 4,2 tỷ", { exact: false }).first()).toBeVisible();
  expect(await scrollWidth(page)).toBeLessThanOrEqual(info.project.use.viewport!.width);
  expect(errors).toEqual([]);
});

test("tìm không dấu ở gói Free", async ({ page }) => {
  await onboard(page);
  await page.goto("/search");
  await page.getByRole("searchbox").or(page.getByRole("textbox")).first().fill("lai suat");
  await expect(page.getByText("Gặp chị Lan, căn 2PN Vinhomes Marina").first()).toBeVisible();
});

test("điện thoại: vuốt xóa rồi hoàn tác", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "cử chỉ chạm chỉ trên điện thoại");
  await onboard(page);
  const rows = page.locator("a[href^='/s/']");
  const before = await rows.count();
  const row = page.locator("a[href='/s/s-hop-t11']");
  await row.scrollIntoViewIfNeeded();
  const b = (await row.boundingBox())!;
  await touchSwipe(page, b.x + b.width - 30, b.y + b.height / 2, -200);
  const open = page.locator("[data-swipe-open='true']");
  await expect(open).toHaveCount(1);
  await page.waitForTimeout(400); // chờ hàng trượt xong rồi mới chạm nút
  await open.getByRole("button", { name: /^Xóa/ }).tap();
  await page.getByRole("alertdialog").getByRole("button", { name: "Xóa" }).tap();
  await expect(rows).toHaveCount(before - 1);
  await page.getByRole("button", { name: "Hoàn tác" }).first().tap();
  await expect(rows).toHaveCount(before);
});

test("điện thoại: nhấn giữ để chọn nhiều", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "cử chỉ chạm chỉ trên điện thoại");
  await onboard(page);
  const b = (await page.locator("a[href^='/s/']").first().boundingBox())!;
  await touchHold(page, 200, b.y + b.height / 2);
  await expect(page.getByText(/Đã chọn 1/)).toBeVisible();
  await page.keyboard.press("Escape");
});

test("đổi ngôn ngữ: tiếng Hàn", async ({ page, context, baseURL }) => {
  await onboard(page);
  await setLocale(context, baseURL!, "ko");
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
});
