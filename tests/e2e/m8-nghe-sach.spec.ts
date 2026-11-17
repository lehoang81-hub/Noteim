import { expect, test } from "@playwright/test";
import { collectErrors, onboard, setDebugFlags } from "./helpers";

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

/* ---------- Bước 3/6: Nút và bảng Nghe sạch ---------- */

async function expandPlayer(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Mở rộng trình phát" }).click();
}

test("Nút Nghe sạch: bấm bật được, nhớ lựa chọn sau khi tải lại trang", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.goto("/s/s-bds-lan");
  await expandPlayer(page);
  const cleanBtn = page.getByRole("button", { name: "Nghe sạch đang tắt" });
  await expect(cleanBtn).toBeVisible();
  await cleanBtn.click();
  // Bật: nút đổi trạng thái nhấn, bản đồ nghe áp dụng
  const onBtn = page.getByRole("button", { name: "Nghe sạch đang bật" });
  await expect(onBtn).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(PLAYER)).toHaveAttribute("data-listening", "on");
  // Nhớ theo người dùng: tải lại vẫn bật
  await page.reload();
  await expandPlayer(page);
  await expect(page.getByRole("button", { name: "Nghe sạch đang bật" })).toHaveAttribute("aria-pressed", "true");
  // Bấm lần nữa tắt được
  await page.getByRole("button", { name: "Nghe sạch đang bật" }).click();
  await expect(page.getByRole("button", { name: "Nghe sạch đang tắt" })).toBeVisible();
  await expect(page.locator(PLAYER)).toHaveAttribute("data-listening", "off");
  expect(errors).toEqual([]);
});

test("Bảng Nghe sạch: đủ 4 công tắc, dòng file gốc, đổi Bỏ qua à,ừ được nhớ", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.goto("/s/s-bds-lan");
  await expandPlayer(page);
  await page.getByRole("button", { name: "Mở bảng Nghe sạch" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Nghe sạch", { exact: true })).toBeVisible();
  for (const name of ["Lọc tiếng ồn", "Cân âm lượng người nói", "Bỏ qua khoảng lặng", 'Bỏ qua "à, ừ"']) {
    await expect(dialog.getByText(name, { exact: true })).toBeVisible();
  }
  // Mặc định khi bật Nghe sạch: lọc ồn/cân âm/bỏ lặng bật, bỏ à,ừ tắt
  await expect(dialog.getByText("Nhảy qua tiếng đệm. Có thể nghe hơi giật")).toBeVisible();
  await expect(dialog.getByText("File gốc giữ nguyên. Tải về và gửi đi luôn là bản gốc.")).toBeVisible();
  // Đổi công tắc Bỏ qua "à, ừ" rồi mở lại: được nhớ (trình phát vẫn đang mở rộng)
  await dialog.getByText('Bỏ qua "à, ừ"').click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Mở bảng Nghe sạch" }).click();
  await expect(dialog.getByText("Nhảy qua tiếng đệm. Có thể nghe hơi giật")).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("noteim-mock-db-v1") || "{}").user?.listening_prefs);
  expect(saved?.skip_fillers).toBe(true);
  expect(errors).toEqual([]);
});

test("Buổi không có bản đồ nghe (cờ debug): nút tắt, có dòng giải thích", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await setDebugFlags(page, { noListeningMap: true });
  await page.goto("/s/s-bds-lan");
  await expandPlayer(page);
  const cleanBtn = page.getByRole("button", { name: "Nghe sạch đang tắt" });
  await expect(cleanBtn).toBeDisabled();
  await expect(page.getByText("Buổi này chưa có dữ liệu nghe sạch.")).toBeVisible();
  await expect(page.locator(PLAYER)).toHaveAttribute("data-listening", "off");
  expect(errors).toEqual([]);
});

/* ---------- Bước 4/6: Chữ chạy theo tiếng ---------- */

test("Chữ chạy theo: chữ đang đọc đổi theo thời gian khi phát 20 giây, sáng và tối", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);

  async function playAndSample(sampleAtMs: number[]): Promise<string[]> {
    await page.goto("/s/s-bds-lan?tab=transcript");
    await expect(page.locator('[data-seg]').first()).toBeVisible();
    await page.getByRole("button", { name: "Phát", exact: true }).click();
    const out: string[] = [];
    let elapsed = 0;
    for (const at of sampleAtMs) {
      await page.waitForTimeout(at - elapsed);
      elapsed = at;
      out.push((await page.locator('[data-state="reading"]').first().textContent()) ?? "");
    }
    return out;
  }

  // Sáng: ghi chữ đang đọc ở giây 5, 10, 15, 20
  const light = await playAndSample([5000, 10000, 15000, 20000]);
  for (const w of light) expect(w?.length).toBeGreaterThan(0);
  expect(new Set(light).size).toBeGreaterThanOrEqual(3);

  // Tối: chữ đang đọc vẫn có và khác giây 5 (token nền đổi theo class dark)
  await page.evaluate(() => localStorage.setItem("noteim-theme", "dark"));
  await page.reload();
  const dark = await playAndSample([5000]);
  expect(dark[0]?.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("Chữ chạy theo: bấm vào một chữ nghe từ chữ đó", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.goto("/s/s-bds-lan?tab=transcript");
  await expect(page.locator('[data-seg]').first()).toBeVisible();
  // Chưa phát: không có chữ mốc nào
  await expect(page.locator('[data-word]')).toHaveCount(0);

  // Bấm đoạn thứ hai (80→130 giây) để phát, chờ chữ mốc hiện, rồi bấm một
  // chữ giữa câu: kim phải dừng ở mốc của chữ đó, không về đầu đoạn
  const seg2 = page.locator('[data-seg]').nth(2);
  await seg2.scrollIntoViewIfNeeded();
  await seg2.locator("button").first().click();
  await expect(seg2.locator("[data-word]").first()).toBeVisible({ timeout: 15000 });
  const word = seg2.locator("[data-word]").nth(10);
  await word.click();
  const slider = page.getByRole("slider", { name: "Vị trí phát" });
  const now = Number(await slider.getAttribute("aria-valuenow"));
  // Mốc của chữ thứ 10 trong câu (khác đầu đoạn 80), vẫn trong đoạn
  expect(now).toBeGreaterThan(81);
  expect(now).toBeLessThanOrEqual(131);
  expect(errors).toEqual([]);
});
