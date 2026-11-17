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

test("Bỏ qua khoảng lặng: phát qua khoảng 40→45 giây, đồng hồ nhảy đúng", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await enableClean(page);
  await page.goto("/s/s-bds-lan");
  // Chờ bản đồ nghe áp dụng xong (không có trạng thái sai thoáng qua)
  await expect(page.locator(PLAYER)).toHaveAttribute("data-listening", "on");
  const slider = page.getByRole("slider", { name: "Vị trí phát" });
  await slider.focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowRight"); // 0 → 40s
  await expect(slider).toHaveAttribute("aria-valuenow", "40");
  await page.getByRole("button", { name: "Phát", exact: true }).click();
  // Kim nhảy thẳng qua khoảng lặng 40→45 rồi chạy tiếp
  await expect(slider).not.toHaveAttribute("aria-valuenow", "40", { timeout: 8000 });
  const now = Number(await slider.getAttribute("aria-valuenow"));
  expect(now).toBeGreaterThanOrEqual(45);
  expect(now).toBeLessThanOrEqual(52);
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

test("Thời lượng nghe sạch: buổi chị Lan còn 34 phút 12 giây khi bỏ hết khoảng lặng", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await enableClean(page);
  await page.goto("/s/s-bds-lan");
  await expect(page.locator(PLAYER)).toHaveAttribute("data-listening", "on");
  // clean_duration_sec = 2052 (bản đồ nghe), gốc 2530 = 42:10
  // (hiển thị số "nghe sạch còn" dựng ở bước 3; bài này khoá số liệu bản đồ)
  const value = await page.evaluate(async () => {
    const mod = await import("@/lib/data");
    return mod.data.sessions.getListeningMap("s-bds-lan");
  });
  expect(value?.clean_duration_sec).toBe(2052);
  expect(value?.silences.length).toBe(59);
  expect(errors).toEqual([]);
});
