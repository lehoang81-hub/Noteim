import { expect, test } from "@playwright/test";
import { collectErrors, onboard, setCurrentWorkspace } from "./helpers";

/**
 * Quyền theo không gian làm việc (M7-01, issue #47).
 * Bước 2 chưa có giao diện đổi không gian: bài dùng helper setCurrentWorkspace
 * (ghi thẳng vào kho như switchTo của repository) để gọi qua giao diện tối thiểu
 * — thư viện và trang chi tiết.
 * Buổi nhóm mẫu: s-nhom-marina-c (của mình, đã chia sẻ), s-nhom-hop-tuan-45 và
 * s-nhom-legend-ha-phong (của người khác, đã chia sẻ), s-nhom-chu-dau-tu-le-hong
 * / s-nhom-van-phong-song-hong / s-nhom-chot-can-12a (riêng tư của người khác).
 */

const TEAM_ONLY = ["s-nhom-chu-dau-tu-le-hong", "s-nhom-van-phong-song-hong", "s-nhom-chot-can-12a"];

test("không gian cá nhân: chỉ còn buổi của mình sau khi dữ liệu tự chuyển", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  const hrefs = await page.locator("a[href^='/s/']").evaluateAll((els) => els.map((el) => el.getAttribute("href")));
  // Chín buổi cá nhân giữ nguyên; không buổi nhóm nào lẫn vào
  expect(hrefs.length).toBe(9);
  for (const h of hrefs) expect(h).not.toContain("s-nhom-");
  expect(errors).toEqual([]);
});

test("không gian nhóm: hiện buổi chia sẻ, ẩn buổi riêng tư của người khác", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await setCurrentWorkspace(page, "w-hp-land");
  // Ba buổi chia sẻ cả nhóm (một của mình, hai của người khác)
  for (const id of ["s-nhom-marina-c", "s-nhom-hop-tuan-45", "s-nhom-legend-ha-phong"]) {
    await expect(page.locator(`a[href='/s/${id}']`)).toBeVisible();
  }
  // Ba buổi riêng tư của người khác không xuất hiện
  for (const id of TEAM_ONLY) {
    await expect(page.locator(`a[href='/s/${id}']`)).toHaveCount(0);
  }
  // Buổi cá nhân cũng không hiện trong không gian nhóm
  await expect(page.locator("a[href='/s/s-bds-lan']")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("mở thẳng buổi riêng tư của người khác: không lộ nội dung", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await setCurrentWorkspace(page, "w-hp-land");
  await page.goto("/s/s-nhom-chu-dau-tu-le-hong");
  // Nội dung buổi không được lộ (tóm tắt, chủ đề, việc)
  await expect(page.getByText("phân phối độc quyền", { exact: false })).toHaveCount(0);
  await expect(page.getByText("chiết khấu cho sàn", { exact: false })).toHaveCount(0);
  // Thay vào đó là thông báo lỗi (bước 5 sẽ thay bằng thông báo không có quyền riêng)
  await expect(page.getByText("Chưa tải được buổi ghi này.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("mở buổi chia sẻ cả nhóm của người khác: đọc được nội dung", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await setCurrentWorkspace(page, "w-hp-land");
  await page.goto("/s/s-nhom-hop-tuan-45");
  // Tiêu đề trên chi tiết (h1) — không phải hàng trong thư viện bị ẩn trên điện thoại
  await expect(page.getByRole("heading", { name: "Họp giao việc tuần 45" })).toBeVisible();
  // Tóm tắt hiện (nội dung đã tải xong, không phải khung chờ)
  await expect(page.getByText("còn thiếu 800 triệu so với kế hoạch", { exact: false }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("đổi không gian bằng giao diện: thư viện và việc theo không gian", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  // Mở bộ chọn ở đầu thư viện (nút có nhãn "Đổi không gian làm việc")
  const trigger = page.getByRole("button", { name: "Đổi không gian làm việc" });
  await expect(trigger).toBeVisible();
  await trigger.click();
  // Chuyển sang không gian nhóm "Sàn BĐS Hải Phòng Land"
  await page.getByRole("dialog").getByRole("button", { name: /Sàn BĐS Hải Phòng Land/ }).click();
  await expect(page.locator("a[href='/s/s-nhom-marina-c']")).toBeVisible();
  await expect(page.locator("a[href='/s/s-bds-lan']")).toHaveCount(0);
  // Trang Việc theo không gian: có việc giao cho thành viên nhóm (buổi họp tuần 45)
  await page.goto("/tasks");
  await expect(page.getByText("Đàm phán lại giá Sông Hồng theo phương án giảm 5%").first()).toBeVisible();
  await expect(page.getByText("Gửi bảng tính vay 50% cho chị Lan", { exact: false }).first()).toHaveCount(0);
  // Đổi lại về Cá nhân: bộ chọn nằm ở thư viện, quay lại trang chủ trước
  await page.goto("/");
  await page.getByRole("button", { name: "Đổi không gian làm việc" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Cá nhân/ }).click();
  await expect(page.locator("a[href='/s/s-bds-lan']").first()).toBeVisible();
  await expect(page.locator("a[href='/s/s-nhom-marina-c']")).toHaveCount(0);
  expect(errors).toEqual([]);
});
