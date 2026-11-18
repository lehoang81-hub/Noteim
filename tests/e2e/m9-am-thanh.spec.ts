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

/* ---------- Bước 3/6: Nghe sạch qua Web Audio ---------- */

/** Bật Nghe sạch của người dùng mẫu (nhớ theo người dùng, M8-01). */
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

// Lượt nói của chị Lan (SPK_02) bắt đầu ở giây 17,01 và kéo dài tới 63,63 —
// kim đặt ở 20 giây (4 nấc tua 5 giây) nằm giữa lượt nói, gain bản đồ là +5 dB
test("Nghe sạch qua Web Audio: đoạn chị Lan áp đúng gain +5 dB theo người nói đang phát", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await enableClean(page);
  await page.goto("/s/s-bds-lan");
  await expect(page.locator(PLAYER)).toHaveAttribute("data-listening", "on");

  // Đặt kim vào lượt nói của chị Lan (chưa phát): gain bản đồ đã áp dụng
  const slider = page.getByRole("slider", { name: "Vị trí phát" });
  await slider.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight"); // 0 → 20 giây
  await expect(page.locator(PLAYER)).toHaveAttribute("data-gain-db", "5");

  // Phát: tiếng thật đi qua GainNode, gain giữ đúng trong khi đang phát lượt chị Lan
  await page.getByRole("button", { name: "Phát", exact: true }).click();
  await page.waitForTimeout(1500);
  await expect(page.locator(PLAYER)).toHaveAttribute("data-gain-db", "5");
  const now = Number(await slider.getAttribute("aria-valuenow"));
  expect(now).toBeGreaterThanOrEqual(20);
  expect(errors).toEqual([]);
});

test("Tắt Nghe sạch: tiếng đi thẳng (không cân âm lượng) và vẫn phát tiếp không giật", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await enableClean(page);
  await page.goto("/s/s-bds-lan");
  await expect(page.locator(PLAYER)).toHaveAttribute("data-listening", "on");
  const slider = page.getByRole("slider", { name: "Vị trí phát" });
  await slider.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight"); // 0 → 20 giây
  await page.getByRole("button", { name: "Phát", exact: true }).click();
  await expect(page.locator(PLAYER)).toHaveAttribute("data-gain-db", "5");

  // Tắt Nghe sạch: gain về đi thẳng, bản đồ ngừng áp dụng, tiếng vẫn chạy
  await page.getByRole("button", { name: "Mở rộng trình phát" }).click();
  await page.getByRole("button", { name: "Nghe sạch đang bật" }).click();
  await expect(page.locator(PLAYER)).toHaveAttribute("data-gain-db", "");
  await expect(page.locator(PLAYER)).toHaveAttribute("data-listening", "off");
  const before = Number(await slider.getAttribute("aria-valuenow"));
  await page.waitForTimeout(1500);
  const after = Number(await slider.getAttribute("aria-valuenow"));
  expect(after).toBeGreaterThan(before);
  await expect(page.getByText("Không phát được âm thanh.")).toHaveCount(0);
  expect(errors).toEqual([]);
});

/* ---------- Bước 4/6: Khớp nội dung ---------- */

/** Giây hiện tại của thẻ audio thật; -1 khi buổi chưa có tiếng đang phát. */
async function audioTime(page: import("@playwright/test").Page) {
  return page.evaluate(() => (document.querySelector("audio") as HTMLAudioElement)?.currentTime ?? -1);
}

/** Chờ kim vào đúng khoảng mốc: đúng câu đáp án; với mốc chính xác thì lệch dưới 0,5 giây. */
async function expectLandsIn(page: import("@playwright/test").Page, lo: number, hi: number) {
  await expect
    .poll(
      async () => {
        const t = await audioTime(page);
        return t >= lo && t <= hi;
      },
      { timeout: 8000, intervals: [80] },
    )
    .toBe(true);
}

// Mốc chờ (truth.json + audio-attach.json, buổi chị Lan — 383,5 giây):
//   ý b1 20,2 giây (câu g2 "Ờ... ừ em, nhà chị là bốn người…" 17,01–27,79)
//   việc a1 307,5 giây ("Nghe từ 05:07", câu g14 "Em gửi chị bảng tính…" 306,78–310,86)
//   trích dẫn b7 145,0 giây ("Giá này cao hơn bên Imperia…" câu g8 144,53–148,64)
//   dải giọng bấm giữa = 191,75 giây (383,5/2)
test("Bấm ý tóm tắt, việc, trích dẫn, chữ, dải giọng: nghe đúng câu đó (sai lệch < 0,5 giây)", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);

  // Ý tóm tắt b1 -> 20,2 giây, lệch dưới 0,5 giây
  await page.goto("/s/s-bds-lan?tab=summary");
  await page.getByRole("button", { name: /Nghe từ.*Cần căn 2 phòng ngủ/ }).click();
  await expectLandsIn(page, 20.2 - 0.5, 20.2 + 0.5);

  // Việc a1 -> 307,5 giây, lệch dưới 0,5 giây
  await page.goto("/s/s-bds-lan?tab=tasks");
  await page.getByRole("button", { name: "Nghe từ 05:07" }).click();
  await expectLandsIn(page, 307.5 - 0.5, 307.5 + 0.5);

  // Câu trích dẫn b7 -> 145,0 giây, lệch dưới 0,5 giây
  await page.goto("/s/s-bds-lan?tab=summary");
  await page.getByRole("button", { name: /Nghe từ.*Giá này cao hơn bên Imperia/ }).click();
  await expectLandsIn(page, 145.0 - 0.5, 145.0 + 0.5);

  // Chữ ở tab Lời: bấm một chữ giữa đoạn g2 (17,01–27,79) — nghe đúng câu đó
  await page.goto("/s/s-bds-lan?tab=transcript");
  const seg2 = page.locator('[data-seg="g2"]');
  await seg2.scrollIntoViewIfNeeded();
  await seg2.locator("button").first().click();
  await expect(seg2.locator("[data-word]").first()).toBeVisible({ timeout: 15000 });
  await seg2.locator("[data-word]").nth(10).click();
  await expectLandsIn(page, 17.01, 27.79);

  // Dải giọng: bấm giữa trình phát thu gọn = giữa buổi (191,75 giây; bấm bằng
  // chuột chỉ chính xác tới từng điểm ảnh nên cho lệch tới 1,5 giây)
  const ribbon = page.getByRole("slider", { name: "Vị trí phát" });
  const box = await ribbon.boundingBox();
  if (!box) throw new Error("Không thấy dải giọng");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expectLandsIn(page, 191.75 - 1.5, 191.75 + 1.5);

  // Tiếng vẫn phát tiếp sau các lần tua
  const t1 = await audioTime(page);
  await page.waitForTimeout(1200);
  const t2 = await audioTime(page);
  expect(t2).toBeGreaterThan(t1);
  expect(errors).toEqual([]);
});

// Buổi họp Hàn (464,4 giây): đoạn tiếng Hàn s02 10,77–24,11, tiếng Anh s03 25,09–32,84
test("Buổi họp Hàn: bấm đoạn tiếng Hàn và tiếng Anh phát đúng chỗ đó", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.goto("/s/s-hop-han?tab=transcript");
  await expect(page.locator('[data-seg="s02"]')).toBeVisible();

  // Đoạn tiếng Hàn (Park Ji-ho): phát từ đầu đoạn, kim trong khoảng đáp án
  const koSeg = page.locator('[data-seg="s02"]');
  await koSeg.scrollIntoViewIfNeeded();
  await koSeg.locator("button").first().click();
  await expectLandsIn(page, 10.77, 24.11);

  // Bấm một chữ giữa đoạn tiếng Hàn: vẫn trong đúng câu đó
  await expect(koSeg.locator("[data-word]").first()).toBeVisible({ timeout: 15000 });
  await koSeg.locator("[data-word]").nth(6).click();
  await expectLandsIn(page, 10.77, 24.11);

  // Đoạn tiếng Anh (Kim Min-ji, giọng Hàn): phát đúng chỗ của câu tiếng Anh
  const enSeg = page.locator('[data-seg="s03"]');
  await enSeg.scrollIntoViewIfNeeded();
  await enSeg.locator("button").first().click();
  await expectLandsIn(page, 25.09, 32.84);
  const t = await audioTime(page);
  expect(t).toBeGreaterThanOrEqual(25.09);
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
