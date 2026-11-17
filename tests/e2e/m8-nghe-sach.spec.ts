import { expect, test } from "@playwright/test";
import { collectErrors, onboard } from "./helpers";

/**
 * Nghe sạch và chữ chạy theo tiếng (M8-01, issue #60).
 * Bài của từng bước viết cùng bước đó; chạy lại toàn bộ ở bước 6.
 * Bản đồ nghe của buổi chị Lan (fixture): khoảng lặng 40→45 giây giữa hai
 * đoạn đầu, tiếng đệm ("Ờ...", "ừ") ở 80→82, "thì là" ở 155→157.
 * Trình phát giả chạy 1 giây mỗi giây nên mốc đọc được từ aria-valuenow.
 */

/** Bật Nghe sạch của người dùng mẫu (lựa chọn được nhớ, M8-01). */
async function enableClean(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const raw = localStorage.getItem("noteim-mock-db-v1");
    if (!raw) throw new Error("Kho dữ liệu mẫu chưa có");
    const db = JSON.parse(raw);
    db.user.listening_prefs = { enabled: true, denoise: true, level: true, skip_silence: true, skip_fillers: false };
    localStorage.setItem("noteim-mock-db-v1", JSON.stringify(db));
  });
  await page.reload();
}

const PLAYER = "[data-listening]";

/* ---------- Bước 2/6: Đồng hồ phát biết nhảy ---------- */

test("Bỏ qua khoảng lặng: tua hoặc phát chạm khoảng 40→45 giây đều nhảy đúng", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await enableClean(page);
  await page.goto("/s/s-bds-lan");
  // Chờ bản đồ nghe áp dụng xong (không có trạng thái sai thoáng qua)
  await expect(page.locator(PLAYER)).toHaveAttribute("data-listening", "on");
  const slider = page.getByRole("slider", { name: "Vị trí phát" });
  await slider.focus();
  for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight"); // 0 → 35s (trong lời)
  await expect(slider).toHaveAttribute("aria-valuenow", "35");
  // Tua vào khoảng lặng 40-45: kim nhảy thẳng tới 45, không dừng trong im lặng
  await page.keyboard.press("ArrowRight"); // 35 → 40 → nhảy 45
  await expect(slider).toHaveAttribute("aria-valuenow", "45");
  // Phát băng qua khoảng lặng: về 35, phát 6 giây — đủ vượt 40 nhờ nhảy
  await page.keyboard.press("Home");
  for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight"); // 0 → 35s
  await expect(slider).toHaveAttribute("aria-valuenow", "35");
  await page.getByRole("button", { name: "Phát", exact: true }).click();
  await page.waitForTimeout(6000);
  const now = Number(await slider.getAttribute("aria-valuenow"));
  // Nếu không nhảy, kim chỉ tới 41; có nhảy thì đã qua 45
  expect(now).toBeGreaterThanOrEqual(45);
  expect(now).toBeLessThanOrEqual(53);
  expect(errors).toEqual([]);
});

test("Tắt Nghe sạch: phát đúng theo thời gian gốc, không nhảy", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.goto("/s/s-bds-lan");
  await expect(page.locator(PLAYER)).toHaveAttribute("data-listening", "off");
  const slider = page.getByRole("slider", { name: "Vị trí phát" });
  await slider.focus();
  for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight"); // 0 → 35s
  await expect(slider).toHaveAttribute("aria-valuenow", "35");
  await page.getByRole("button", { name: "Phát", exact: true }).click();
  // Phát thường: sau 3 giây kim ở khoảng 36-40, chưa chạm khoảng lặng 40-45
  await page.waitForTimeout(3000);
  const now = Number(await slider.getAttribute("aria-valuenow"));
  expect(now).toBeGreaterThanOrEqual(36);
  expect(now).toBeLessThanOrEqual(44);
  expect(errors).toEqual([]);
});
