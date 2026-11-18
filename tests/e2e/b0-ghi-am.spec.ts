import { expect, test } from "@playwright/test";
import { collectErrors } from "./helpers";

/**
 * Trang thử ghi âm và nghe dài trên điện thoại (B0-02, issue #70, docs/10-B
 * phần B). Chromium chạy với micro giả (--use-fake-device-for-media-stream)
 * nên ghi âm thật được: giả lập tiếng beep, decodeAudioData đọc được.
 * test.use ghi đè mảng args của playwright.config.ts nên phải giữ lại các
 * args cũ (autoplay) và thêm các args giả lập micro.
 */
test.use({
  launchOptions: {
    // Giữ PW_CHROMIUM_PATH như playwright.config.ts (test.use ghi đè cả launchOptions)
    executablePath: process.env.PW_CHROMIUM_PATH || undefined,
    args: [
      "--disable-dev-shm-usage",
      // M9-01: trình phát cần phát được trong kiểm thử mà không có cử chỉ người dùng
      "--autoplay-policy=no-user-gesture-required",
      // B0-02: cấp quyền micro tự động và dùng micro giả của Chromium
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  },
});

const PAGE = "/spike/ghi-am";
const CHUNK_COUNT = "[data-chunk-count]";

/** Số khúc trong kho IndexedDB riêng của trang thử, đọc trực tiếp từ kho. */
async function dbChunkCount(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(async () => {
    const req = indexedDB.open("noteim-spike-ghi-am");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const r = db.transaction("chunks").objectStore("chunks").count();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return count;
  });
}

test("Ghi 25 giây ra 3 khúc, tải lại trang vẫn còn, nghe lại được", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(PAGE);
  await expect(page.locator(CHUNK_COUNT)).toHaveAttribute("data-chunk-count", "0");
  await page.getByRole("button", { name: "Bắt đầu ghi" }).click();

  // Đồng hồ đếm giây thực: chờ đủ 25 giây rồi dừng (10 + 10 + 5)
  await expect
    .poll(async () => Number(await page.locator("[data-clock-sec]").getAttribute("data-clock-sec")), {
      timeout: 40_000,
    })
    .toBeGreaterThanOrEqual(25);
  await page.getByRole("button", { name: "Dừng", exact: true }).click();

  // 3 khúc hiện trên trang và nằm trong kho IndexedDB riêng
  await expect(page.locator(CHUNK_COUNT)).toHaveAttribute("data-chunk-count", "3", { timeout: 15_000 });
  expect(await dbChunkCount(page)).toBe(3);

  // Tải lại trang: khúc nằm trong kho nên vẫn còn đủ 3
  await page.reload();
  await expect(page.locator(CHUNK_COUNT)).toHaveAttribute("data-chunk-count", "3", { timeout: 15_000 });

  // Nghe lại bản ghép: thẻ audio phát thật, currentTime tăng theo thời gian thực
  const ngheLai = page.locator('section[aria-labelledby="spike-nghe-title"]');
  await ngheLai.getByRole("button", { name: "Phát", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (document.querySelector("[data-rec-audio]") as HTMLAudioElement | null)?.currentTime ?? -1), {
      timeout: 8000,
    })
    .toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test("Giả lập ẩn trang 30 giây: bảng khoảng trống báo đúng một khoảng khoảng 30 giây", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(PAGE);
  await page.getByRole("button", { name: "Bắt đầu ghi" }).click();

  // Chờ khúc đầu lưu xong (10 giây) rồi mới giả lập ẩn: khoảng trống rơi vào giữa hai khúc
  await expect(page.locator(CHUNK_COUNT)).toHaveAttribute("data-chunk-count", "1", { timeout: 20_000 });
  await page.getByRole("button", { name: "Giả lập ẩn trang 30 giây" }).click();

  // Sau 30 giây trang "hiện lại" và ghi tiếp: chờ khúc kế tiếp xuất hiện rồi dừng
  await expect
    .poll(async () => Number(await page.locator(CHUNK_COUNT).getAttribute("data-chunk-count")), {
      timeout: 45_000,
    })
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Dừng", exact: true }).click();

  // Đúng MỘT khoảng hụt, dài khoảng 30 giây
  const gapRows = page.locator("[data-gap-sec]");
  await expect(gapRows).toHaveCount(1, { timeout: 20_000 });
  const sec = Number(await gapRows.first().getAttribute("data-gap-sec"));
  expect(sec).toBeGreaterThanOrEqual(28);
  expect(sec).toBeLessThanOrEqual(40);
  expect(errors).toEqual([]);
});

test("JSON xuất ra có thiết bị, trình duyệt, định dạng ghi, nhật ký, khoảng trống", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop", "cấu trúc JSON không phụ thuộc bề ngang màn hình, chạy một lần cho gọn");
  const errors = collectErrors(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(PAGE);
  await page.getByRole("button", { name: "Bắt đầu ghi" }).click();
  await expect(page.locator(CHUNK_COUNT)).toHaveAttribute("data-chunk-count", "1", { timeout: 20_000 });
  await page.getByRole("button", { name: "Dừng", exact: true }).click();

  // Vùng hiển thị JSON cùng nội dung với bản sao chép, đọc được từ kiểm thử
  const json = JSON.parse(await page.locator("[data-json-out]").inputValue());
  expect(json.schema).toBe("noteim-spike-ghi-am-v1");
  expect(json.device.userAgent).toContain("Chrome");
  expect(json.browser.name).toBe("Chrome");
  expect(json.recordMime).toContain("audio/");
  expect(json.chunks.length).toBeGreaterThanOrEqual(1);
  expect(json.chunks[0].sizeBytes).toBeGreaterThan(0);
  expect(json.logs.length).toBeGreaterThanOrEqual(3);
  expect(Array.isArray(json.gaps)).toBe(true);

  // Nút "Sao chép kết quả" đưa cùng JSON đó vào clipboard
  await page.getByRole("button", { name: "Sao chép kết quả" }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(JSON.parse(clip).recordMime).toBe(json.recordMime);
  expect(errors).toEqual([]);
});

test("Nghe sạch bật tắt: nhật ký có AudioContext.state, tắt thì không dựng Web Audio", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "chạy một lần cho gọn (không phụ thuộc bề ngang màn hình)");
  const errors = collectErrors(page);
  // Đếm AudioContext được dựng trên trang (không tính OfflineAudioContext
  // dùng để phân tích khoảng trống)
  await page.addInitScript(() => {
    const Orig = window.AudioContext;
    (window as unknown as { __ctxCount: number }).__ctxCount = 0;
    window.AudioContext = class extends Orig {
      constructor(...a: ConstructorParameters<typeof AudioContext>) {
        super(...a);
        (window as unknown as { __ctxCount: number }).__ctxCount++;
      }
    } as typeof AudioContext;
  });
  await page.goto(PAGE);
  await expect(page.locator("[data-sample-audio]")).toBeVisible();

  // Bài học M9: chưa bật Nghe sạch thì không dựng đồ thị Web Audio
  expect(await page.evaluate(() => (window as unknown as { __ctxCount: number }).__ctxCount)).toBe(0);

  const ngheMau = page.locator('section[aria-labelledby="spike-mau-title"]');
  await ngheMau.getByRole("switch").click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __ctxCount: number }).__ctxCount))
    .toBe(1);

  // Phát file mẫu: tiếng chạy qua AudioContext, state được ghi nhật ký
  await ngheMau.getByRole("button", { name: "Phát", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (document.querySelector("[data-sample-audio]") as HTMLAudioElement | null)?.currentTime ?? -1), {
      timeout: 8000,
    })
    .toBeGreaterThan(1);
  const logs = await page.locator("[data-log]").allTextContents();
  expect(logs.filter((l) => l.includes("AudioContext.state")).length).toBeGreaterThanOrEqual(1);

  // Tắt Nghe sạch: không dựng thêm AudioContext, file vẫn phát tiếp
  await ngheMau.getByRole("switch").click();
  const before = await page.evaluate(() => (document.querySelector("[data-sample-audio]") as HTMLAudioElement | null)?.currentTime ?? 0);
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => (document.querySelector("[data-sample-audio]") as HTMLAudioElement | null)?.currentTime ?? 0);
  expect(after).toBeGreaterThan(before);
  expect(await page.evaluate(() => (window as unknown as { __ctxCount: number }).__ctxCount)).toBe(1);
  expect(errors).toEqual([]);
});

test("Hướng dẫn G1 đến N3: bấm bài nào nhật ký đánh dấu bài đó", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "chạy một lần cho gọn (không phụ thuộc bề ngang màn hình)");
  const errors = collectErrors(page);
  await page.goto(PAGE);
  await page.locator('[data-guide-code="G2"]').click();
  await page.locator('[data-guide-code="N2"]').click();
  const logs = await page.locator("[data-log]").allTextContents();
  expect(logs.some((l) => l.includes("G2"))).toBe(true);
  expect(logs.some((l) => l.includes("N2"))).toBe(true);
  await expect(page.locator('[data-guide-code="N2"]')).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});
