import { expect, test } from "@playwright/test";
import { collectErrors, onboard, setDebugFlags } from "./helpers";

/**
 * Nghe sạch và chữ chạy theo tiếng (M8-01, issue #60).
 * Bài của từng bước viết cùng bước đó; chạy lại toàn bộ ở bước 6.
 * M9-01 (issue #65): buổi chị Lan có âm thanh thật, mốc đổi theo truth.json.
 * Các bài này ép cờ "Âm thanh giả" để dùng đồng hồ giả — nhanh và ổn định;
 * các bài phát tiếng thật nằm ở m9-am-thanh.spec.ts.
 * Bản đồ nghe mới của buổi chị Lan: khoảng lặng 139,8→144,5 giây giữa hai
 * lượt nói, tiếng đệm ("Ờ...", "ừ") ở 17,01→27,79 (đoạn g2), "thì là" ở g4;
 * bỏ khoảng lặng còn 360 giây = 06:00.
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

test.beforeEach(async ({ page }) => {
  await onboard(page);
  // M9-01: ép đồng hồ giả cho bộ bài cũ (nhanh, không phụ thuộc tải âm thanh)
  await setDebugFlags(page, { audioMock: true });
});

const PLAYER = "[data-listening]";

/* ---------- Bước 2/6: Đồng hồ phát biết nhảy ---------- */

test("Bỏ qua khoảng lặng: tua hoặc phát chạm khoảng 139,8→144,5 giây đều nhảy đúng", async ({ page }) => {
  const errors = collectErrors(page);
  await enableClean(page);
  await page.goto("/s/s-bds-lan");
  // Chờ bản đồ nghe áp dụng xong (không có trạng thái sai thoáng qua)
  await expect(page.locator(PLAYER)).toHaveAttribute("data-listening", "on");
  const slider = page.getByRole("slider", { name: "Vị trí phát" });
  await slider.focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 4; i++) await page.keyboard.press("PageUp"); // 0 → 120 giây
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight"); // → 140 giây (trong khoảng lặng)
  // Tua vào khoảng lặng 139,8–144,5: kim nhảy thẳng tới 144,5, không dừng trong im lặng
  await expect(slider).toHaveAttribute("aria-valuenow", "145");
  // Phát băng qua khoảng lặng: về 135, phát 6 giây — đủ vượt 139,8 nhờ nhảy
  await page.keyboard.press("Home");
  for (let i = 0; i < 4; i++) await page.keyboard.press("PageUp"); // 0 → 120 giây
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight"); // → 135 giây
  await expect(slider).toHaveAttribute("aria-valuenow", "135");
  await page.getByRole("button", { name: "Phát", exact: true }).click();
  await page.waitForTimeout(6000);
  const now = Number(await slider.getAttribute("aria-valuenow"));
  // Nếu không nhảy, kim chỉ tới 140; có nhảy thì đã qua 144,5
  expect(now).toBeGreaterThanOrEqual(144);
  expect(now).toBeLessThanOrEqual(153);
  expect(errors).toEqual([]);
});

test("Tắt Nghe sạch: phát đúng theo thời gian gốc, không nhảy", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/s/s-bds-lan");
  await expect(page.locator(PLAYER)).toHaveAttribute("data-listening", "off");
  const slider = page.getByRole("slider", { name: "Vị trí phát" });
  await slider.focus();
  for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight"); // 0 → 35s
  await expect(slider).toHaveAttribute("aria-valuenow", "35");
  await page.getByRole("button", { name: "Phát", exact: true }).click();
  // Phát thường: sau 3 giây kim ở khoảng 36-40, chưa chạm khoảng lặng 139,8
  await page.waitForTimeout(3000);
  const now = Number(await slider.getAttribute("aria-valuenow"));
  expect(now).toBeGreaterThanOrEqual(36);
  expect(now).toBeLessThanOrEqual(42);
  expect(errors).toEqual([]);
});

/* ---------- Bước 3/6: Nút và bảng Nghe sạch ---------- */

async function expandPlayer(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Mở rộng trình phát" }).click();
}

test("Nút Nghe sạch: bấm bật được, nhớ lựa chọn sau khi tải lại trang", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/s/s-bds-lan");
  await expandPlayer(page);
  const cleanBtn = page.getByRole("button", { name: "Nghe sạch đang tắt" });
  await expect(cleanBtn).toBeVisible();
  await cleanBtn.click();
  // Bật: nút đổi trạng thái nhấn, bản đồ nghe áp dụng; thời lượng "nghe sạch
  // còn" khớp clean_duration_sec của bản đồ (chỉ bỏ khoảng lặng: 360 giây = 06:00)
  const onBtn = page.getByRole("button", { name: "Nghe sạch đang bật" });
  await expect(onBtn).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(PLAYER)).toHaveAttribute("data-listening", "on");
  await expect(page.getByText("nghe sạch còn 06:00")).toBeVisible();
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
  // Ghi xuống kho có độ trễ giả: chờ lựa chọn thực sự được lưu
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("noteim-mock-db-v1") || "{}").user?.listening_prefs?.skip_fillers),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});

test("Buổi không có bản đồ nghe (cờ debug): nút tắt, có dòng giải thích", async ({ page }) => {
  const errors = collectErrors(page);
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
  await page.goto("/s/s-bds-lan?tab=transcript");
  await expect(page.locator('[data-seg]').first()).toBeVisible();
  // Chưa phát: không có chữ mốc nào
  await expect(page.locator('[data-word]')).toHaveCount(0);

  // Bấm đoạn thứ hai (g2, 17,01→27,79 giây) để phát, chờ chữ mốc hiện, rồi bấm
  // một chữ giữa câu: kim phải dừng ở mốc của chữ đó, không về đầu đoạn
  const seg2 = page.locator('[data-seg]').nth(2);
  await seg2.scrollIntoViewIfNeeded();
  await seg2.locator("button").first().click();
  await expect(seg2.locator("[data-word]").first()).toBeVisible({ timeout: 15000 });
  const word = seg2.locator("[data-word]").nth(10);
  await word.click();
  const slider = page.getByRole("slider", { name: "Vị trí phát" });
  const now = Number(await slider.getAttribute("aria-valuenow"));
  // Mốc của chữ thứ 10 trong câu g2 (17,01→27,79), vẫn trong đoạn
  expect(now).toBeGreaterThan(17);
  expect(now).toBeLessThanOrEqual(28);
  expect(errors).toEqual([]);
});

/* ---------- Bước 5/6: Bản gọn và Nguyên văn ---------- */

test("Bản gọn và Nguyên văn: cùng một đoạn khác nhau, tiếng đệm màu phụ, tìm theo chế độ", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/s/s-bds-lan?tab=transcript");
  await expect(page.locator('[data-seg]').first()).toBeVisible();
  const seg = page.locator('[data-seg]').nth(2); // đoạn g2 17,01→27,79 có tiếng đệm "Ờ... ừ"

  // Bản gọn là mặc định: đoạn hiển thị câu đã bỏ tiếng đệm
  await expect(page.getByRole("button", { name: "Bản gọn" })).toHaveAttribute("aria-pressed", "true");
  await expect(seg).toContainText("Nhà chị là bốn người");
  await expect(seg).not.toContainText("Ờ");

  // Nguyên văn: đủ từng chữ, tiếng đệm màu chữ phụ
  await page.getByRole("button", { name: "Nguyên văn" }).click();
  await expect(seg).toContainText("Ờ");
  const fillerWord = seg.locator("[data-word]").filter({ hasText: "Ờ" }).first();
  await expect(fillerWord).toHaveClass(/text-ink-3/);
  // Từ thường vẫn màu chữ chính
  const normalWord = seg.locator("[data-word]").filter({ hasText: "bốn" }).first();
  await expect(normalWord).not.toHaveClass(/text-ink-3/);

  // Tìm kiếm theo chế độ đang xem: "ừm" chỉ có ở Nguyên văn (đoạn vấp tự sửa)
  // — đang ở Nguyên văn thì thấy chỗ khớp tô sáng, quay về Bản gọn thì không còn
  await page.getByPlaceholder("Tìm trong lời…").fill("ừm");
  const g5seg = page.locator("[data-seg]").filter({ hasText: "Còn lại chị định vay" });
  await expect(g5seg.locator('[class*="bg-tag-pending"]').first()).toBeVisible();
  await page.getByRole("button", { name: "Bản gọn" }).click();
  await expect(page.getByText('Không có đoạn nào chứa “ừm”.')).toBeVisible();
  await page.getByRole("button", { name: "Nguyên văn" }).click();
  await expect(g5seg.locator('[class*="bg-tag-pending"]').first()).toBeVisible();
  await page.getByPlaceholder("Tìm trong lời…").fill("");
  expect(errors).toEqual([]);
});

test("Sửa lời theo chế độ đang xem: bản gọn sửa text_clean, câu Nguyên văn giữ nguyên; thẻ trích dẫn luôn Nguyên văn", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Menu ⋯ chỉ hiện máy tính; điện thoại nhấn giữ");
  const errors = collectErrors(page);
  await page.goto("/s/s-bds-lan?tab=transcript");
  await expect(page.locator('[data-seg]').first()).toBeVisible();
  const seg = page.locator('[data-seg]').nth(2);

  // Sửa ở Bản gọn: thêm ghi chú gọn vào câu
  await seg.locator("button[aria-label^='Thao tác với đoạn lời']").click();
  const menu = page.getByRole("dialog");
  await menu.getByRole("button", { name: "Sửa lời" }).click();
  const box = page.getByRole("textbox", { name: "Sửa lời" });
  await expect(box).toHaveValue(/Nhà chị là bốn người/); // bản gọn, không có "Ờ"
  await box.fill("Nhà chị là bốn người, hai bé đang học cấp 1 (gọn).");
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(page.getByText("Đã lưu bản ghi lời")).toBeVisible();

  // Bản gọn hiện câu đã sửa; Nguyên văn vẫn giữ câu gốc đầy đủ tiếng đệm
  await expect(seg).toContainText("(gọn)");
  await page.getByRole("button", { name: "Nguyên văn" }).click();
  await expect(seg).toContainText("Ờ");
  await expect(seg).not.toContainText("(gọn)");

  // Thẻ trích dẫn luôn lấy Nguyên văn dù đang xem Bản gọn
  await page.getByRole("button", { name: "Bản gọn" }).click();
  await seg.locator("button[aria-label^='Thao tác với đoạn lời']").click();
  await menu.getByRole("button", { name: "Tạo thẻ trích dẫn" }).click();
  const card = page.locator("[role='dialog']").last();
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card.getByText("Ờ", { exact: false }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
