import { expect, test } from "@playwright/test";
import { collectErrors, onboard, setDebugFlags } from "./helpers";

/**
 * Âm thanh thật cho 3 buổi mẫu (M9-01, issue #65).
 * Bài của từng bước viết cùng bước đó; chạy lại toàn bộ ở bước 6.
 * Chromium chạy với --autoplay-policy=no-user-gesture-required (playwright.config.ts).
 * Trình phát thật chạy theo thời gian thực nên mọi bài chờ theo điều kiện,
 * không chờ cố định ngoài phần đợi âm thanh phát.
 */

const PLAYER = "[data-listening]";

/* ---------- Bước 2/6: Trình phát thật ---------- */

test("Phát 5 giây: thẻ audio có currentTime tăng, chữ đang đọc đổi theo", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.goto("/s/s-bds-lan");
  await expect(page.locator(PLAYER)).toBeVisible();

  // Trình phát thật: có thẻ audio trỏ đúng file buổi (bấm Phát mới nạp — không tự phát)
  await expect(page.locator("audio")).toHaveCount(0);
  await page.getByRole("button", { name: "Phát", exact: true }).click();
  const audio = page.locator("audio");
  await expect(audio).toHaveCount(1);
  await expect(audio).toHaveAttribute("src", /01-bds-gap-chi-lan\.m4a$/);

  // Kim và thẻ audio cùng chạy: currentTime của thẻ tăng thật (theo thời gian thực)
  await expect
    .poll(async () => page.evaluate(() => (document.querySelector("audio") as HTMLAudioElement)?.currentTime ?? 0), {
      timeout: 8000,
    })
    .toBeGreaterThan(1.5);
  const kimPlayer = page.getByRole("slider", { name: "Vị trí phát" });
  const now = Number(await kimPlayer.getAttribute("aria-valuenow"));
  expect(now).toBeGreaterThanOrEqual(1);

  // Chữ đang đọc đổi theo tiếng: ghi 2 lần cách nhau 3 giây, phải khác nhau.
  // Đoạn đầu tiên của buổi bắt đầu ở giây 1,39 — chờ đủ vào lời rồi mới ghi
  await page.goto("/s/s-bds-lan?tab=transcript");
  await expect(page.locator("[data-seg]").first()).toBeVisible();
  await page.getByRole("button", { name: "Phát", exact: true }).click();
  await page.waitForTimeout(2500);
  const reading1 = (await page.locator('[data-state="reading"]').first().textContent()) ?? "";
  expect(reading1.length).toBeGreaterThan(0);
  await page.waitForTimeout(3000);
  const reading2 = (await page.locator('[data-state="reading"]').first().textContent()) ?? "";
  expect(reading2).not.toBe(reading1);
  expect(errors).toEqual([]);
});

test("Buổi không có âm thanh (họp điều hành s-hop-t11) vẫn phát giả: không có thẻ audio, kim chạy", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.goto("/s/s-hop-t11");
  await expect(page.locator(PLAYER)).toBeVisible();
  await expect(page.locator("audio")).toHaveCount(0);
  await page.getByRole("button", { name: "Phát", exact: true }).click();
  const slider = page.getByRole("slider", { name: "Vị trí phát" });
  await expect.poll(async () => Number(await slider.getAttribute("aria-valuenow")), { timeout: 8000 }).toBeGreaterThan(2);
  await expect(page.locator("audio")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Cờ "Âm thanh giả": buổi chị Lan quay lại đồng hồ giả, không có thẻ audio', async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await setDebugFlags(page, { audioMock: true });
  await page.goto("/s/s-bds-lan");
  await expect(page.locator(PLAYER)).toBeVisible();
  await expect(page.locator("audio")).toHaveCount(0);
  await page.getByRole("button", { name: "Phát", exact: true }).click();
  const slider = page.getByRole("slider", { name: "Vị trí phát" });
  await expect.poll(async () => Number(await slider.getAttribute("aria-valuenow")), { timeout: 8000 }).toBeGreaterThan(2);
  await expect(page.locator("audio")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Cờ "Lỗi tải âm thanh": hiện câu lỗi và Thử lại, tắt cờ thì phát được', async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await setDebugFlags(page, { audioFail: true });
  await page.goto("/s/s-bds-lan");
  await expect(page.locator(PLAYER)).toBeVisible();
  await page.getByRole("button", { name: "Phát", exact: true }).click();
  // Lỗi hiện rõ, nút Phát bị chặn
  await expect(page.getByText("Không phát được âm thanh.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Phát", exact: true })).toBeDisabled();
  // Thử lại chạy được: cờ còn bật thì lỗi hiện lại (trình phát có thử nạp lại thật)
  await page.locator(PLAYER).getByRole("button", { name: "Thử lại" }).click();
  await page.getByRole("button", { name: "Phát", exact: true }).click();
  await expect(page.getByText("Không phát được âm thanh.")).toBeVisible();
  // Tắt cờ rồi thử lại: phát được bình thường
  await page.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("noteim-debug") || "{}");
    localStorage.setItem("noteim-debug", JSON.stringify({ ...cur, audioFail: false }));
  });
  await page.reload();
  await expect(page.locator(PLAYER)).toBeVisible();
  await page.getByRole("button", { name: "Phát", exact: true }).click();
  await expect(page.locator("audio")).toHaveCount(1);
  await expect
    .poll(async () => page.evaluate(() => (document.querySelector("audio") as HTMLAudioElement)?.currentTime ?? 0), {
      timeout: 8000,
    })
    .toBeGreaterThan(1);
  await expect(page.getByText("Không phát được âm thanh.")).toHaveCount(0);
  expect(errors).toEqual([]);
});
