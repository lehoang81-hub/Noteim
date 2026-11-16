import { expect, test } from "@playwright/test";
import { collectErrors, onboard } from "./helpers";

/**
 * Tổng quan cá nhân và nhóm (M7-02, issue #48).
 * Bài của từng bước viết cùng bước đó; chạy lại toàn bộ ở bước 5.
 * Số liệu đếm tay từ fixture (bản giả cố định "bây giờ" 14/11/2026 19:00):
 * Tuần này: 8 buổi, 288 phút, 21 quyết định, xong 3 trên 19 việc.
 * Tháng này: 9 buổi, 304 phút, 23 quyết định, xong 4 trên 20 việc.
 * Nhóm (w-hp-land, tuần): 3 buổi chia sẻ, 103 phút, 5 quyết định, xong 1 trên 7 việc.
 */

/* ---------- Bước 2/5: Điều hướng ---------- */

// Hai nav cùng nhãn "Điều hướng chính": thứ nhất là thanh bên máy tính,
// thứ hai là thanh dưới điện thoại.
const NAV = "Điều hướng chính";

test("thanh dưới điện thoại: đủ năm mục, Ghi âm ở giữa", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  const bottom = page.getByRole("navigation", { name: NAV }).nth(1);
  await expect(bottom.locator("a[href='/']")).toBeVisible();
  await expect(bottom.locator("a[href='/dashboard']")).toBeVisible();
  await expect(bottom.locator("a[href='/tasks']")).toBeVisible();
  await expect(bottom.locator("a[href='/settings']")).toBeVisible();
  // Thứ tự: Thư viện, Tổng quan, Ghi âm (giữa), Việc, Cài đặt
  const seq = await bottom
    .locator("ul")
    .evaluate((ul) =>
      Array.from(ul.children).flatMap((li) =>
        Array.from(li.children).map((c) =>
          c.tagName === "A" ? (c as HTMLAnchorElement).getAttribute("href") : c.querySelector("button") ? "record" : "other",
        ),
      ),
    );
  expect(seq).toEqual(["/", "/dashboard", "record", "/tasks", "/settings"]);
  expect(errors).toEqual([]);
});

test("thanh bên máy tính: Thư viện, Tổng quan, Việc, Cài đặt", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  const side = page.getByRole("navigation", { name: NAV }).nth(0);
  const hrefs = await side
    .locator("ul a")
    .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")));
  expect(hrefs).toEqual(["/", "/dashboard", "/tasks", "/settings"]);
  expect(errors).toEqual([]);
});

test("Ghi âm vẫn 2 lần chạm: thanh dưới dẫn tới màn ghi, chưa ghi ngay", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  const bottom = page.getByRole("navigation", { name: NAV }).nth(1);
  await bottom.getByRole("button", { name: "Ghi âm" }).click();
  await expect(page).toHaveURL(/\/record$/);
  // Lần chạm thứ hai mới bắt đầu: màn ghi đang ở bảng xin quyền micro, chưa ghi
  await expect(page.getByText("Cho phép Noteim dùng micro")).toBeVisible();
  expect(errors).toEqual([]);
});

/* ---------- Bước 3/5: Cần xử lý và Tuần này ---------- */

const DASH = "Tổng quan";
const ATTN = "Mở chỗ xử lý";

test("Cần xử lý: đủ các loại có trong dữ liệu mẫu, mỗi loại một dòng", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.getByRole("navigation", { name: NAV }).nth(1).getByRole("link", { name: DASH }).click();
  await expect(page.getByRole("heading", { name: "Cần xử lý" })).toBeVisible();
  // Việc quá hạn (3) và đến hạn hôm nay (1) — đếm tay từ fixture
  for (const label of [
    "Việc quá hạn — Gửi bảng tính vay 50% cho chị Lan",
    "Việc quá hạn — Gửi bản vẽ điều chỉnh cầu thang",
    "Việc quá hạn — Lập kế hoạch ca tối cho xưởng",
    "Đến hạn hôm nay — Xử lý vết nứt dầm bo tầng 3",
  ]) {
    await expect(page.getByRole("link", { name: `${ATTN}: ${label}` })).toBeVisible();
  }
  // Người nói chưa đặt tên: 3 buổi (buổi khám, chị Lan, công chứng)
  await expect(page.getByRole("link", { name: /Người nói chưa đặt tên — Buổi khám nội tổng quát/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Người nói chưa đặt tên — Gặp chị Lan/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Người nói chưa đặt tên — Phiên công chứng/ })).toBeVisible();
  // Bản gốc sắp tự xóa: buổi công chứng hết hạn 15/11 (còn dưới 48 giờ)
  await expect(page.getByRole("link", { name: /Bản gốc sắp tự xóa — Phiên công chứng/ })).toBeVisible();
  // Buổi ghi xử lý lỗi
  await expect(page.getByRole("link", { name: /Buổi ghi xử lý lỗi — Gặp anh Tuấn/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Cần xử lý: dòng việc quá hạn đi thẳng tới tab Việc của buổi ghi", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.getByRole("navigation", { name: NAV }).nth(1).getByRole("link", { name: DASH }).click();
  await page.getByRole("link", { name: `${ATTN}: Việc quá hạn — Gửi bảng tính vay 50% cho chị Lan` }).click();
  await expect(page).toHaveURL(/\/s\/s-bds-lan\?tab=tasks/);
  // Đúng chỗ sửa việc: chính việc đó nằm trong tab Việc
  await expect(page.getByText("Gửi bảng tính vay 50% cho chị Lan").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("Cần xử lý: dòng đến hạn hôm nay đi tới đúng buổi, dòng lỗi đi tới màn chạy lại", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.getByRole("navigation", { name: NAV }).nth(1).getByRole("link", { name: DASH }).click();
  // Đến hạn hôm nay
  await page.getByRole("link", { name: `${ATTN}: Đến hạn hôm nay — Xử lý vết nứt dầm bo tầng 3` }).click();
  await expect(page).toHaveURL(/\/s\/s-kts-lachtray\?tab=tasks/);
  await expect(page.getByText("Xử lý vết nứt dầm bo tầng 3").first()).toBeVisible();
  // Buổi ghi xử lý lỗi: mở buổi ở trạng thái lỗi, có nút Thử lại
  await page.goto("/dashboard");
  await page.getByRole("link", { name: /Buổi ghi xử lý lỗi — Gặp anh Tuấn/ }).click();
  await expect(page).toHaveURL(/\/s\/s-loi/);
  await expect(page.getByText("Chưa tóm tắt được buổi ghi này. Bản ghi âm vẫn an toàn.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Cần xử lý: dòng người nói chưa đặt tên mở thẳng bảng đặt tên", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.getByRole("navigation", { name: NAV }).nth(1).getByRole("link", { name: DASH }).click();
  await page.getByRole("link", { name: /Người nói chưa đặt tên — Gặp chị Lan/ }).click();
  await expect(page).toHaveURL(/\/s\/s-bds-lan\?sheet=speakers/);
  // Bảng "Ai là ai?" mở sẵn
  await expect(page.getByRole("dialog").getByText("Đặt tên cho từng người nói")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Tuần này: câu tổng kết khớp số đếm tay; Tháng này đổi đúng số", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.getByRole("navigation", { name: NAV }).nth(1).getByRole("link", { name: DASH }).click();
  await expect(page.getByText("8 buổi ghi, 4 giờ 48, 21 quyết định, xong 3 trên 19 việc")).toBeVisible();
  await page.getByRole("button", { name: "Tháng này" }).click();
  await expect(page.getByText("9 buổi ghi, 5 giờ 04, 23 quyết định, xong 4 trên 20 việc")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Dải giọng theo ngày: bấm Hôm nay dẫn về thư viện lọc đúng ngày, bỏ lọc được", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.getByRole("navigation", { name: NAV }).nth(1).getByRole("link", { name: DASH }).click();
  // Năm ngày có buổi trong tuần (11/08, 11/11, 11/12, 11/13, 11/14)
  await expect(page.getByRole("button", { name: "Lọc thư viện theo Hôm nay" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lọc thư viện theo Hôm qua" })).toBeVisible();
  await page.getByRole("button", { name: "Lọc thư viện theo Hôm nay" }).click();
  await expect(page).toHaveURL(/\/\?day=2026-11-14$/);
  // Thư viện còn 3 buổi của hôm nay, chip ngày hiện ở đầu bộ lọc
  const hrefs = await page.locator("a[href^='/s/']").evaluateAll((els) => els.map((el) => el.getAttribute("href")));
  expect(hrefs.sort()).toEqual(["/s/s-bds-lan", "/s/s-chua-tai-len", "/s/s-luat-phuoc"]);
  await expect(page.getByRole("button", { name: "Bỏ lọc theo ngày" })).toBeVisible();
  // Bỏ lọc: đủ 9 buổi trở lại
  await page.getByRole("button", { name: "Bỏ lọc theo ngày" }).click();
  await expect(page.locator("a[href^='/s/']")).toHaveCount(9);
  expect(errors).toEqual([]);
});

test("Không gian nhóm: Tổng quan không đếm nội dung buổi riêng tư của người khác", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  // Vào không gian nhóm trước khi mở Tổng quan
  await page.getByRole("button", { name: "Đổi không gian làm việc" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Sàn BĐS Hải Phòng Land/ }).click();
  await page.getByRole("navigation", { name: NAV }).nth(1).getByRole("link", { name: DASH }).click();
  // Tuần này chỉ tính 3 buổi được đọc (của mình + chia sẻ): 103 phút
  await expect(page.getByText("3 buổi ghi, 1 giờ 43, 5 quyết định, xong 1 trên 7 việc")).toBeVisible();
  // Việc của buổi riêng tư người khác không xuất hiện
  await expect(page.getByText("Nhắc chủ nhà giải chấp thế chấp trước 18/11")).toHaveCount(0);
  await expect(page.getByText("Soạn phụ lục phân phối độc quyền gửi chủ đầu tư")).toHaveCount(0);
  await expect(page.getByText("Đàm phán lại giá Sông Hồng theo phương án giảm 5%")).toHaveCount(0);
  // Việc của buổi được đọc vẫn hiện (đến hạn hôm nay)
  await expect(page.getByRole("link", { name: /Đến hạn hôm nay — Gửi anh Khánh bản dự thảo hợp đồng đặt cọc/ })).toBeVisible();
  expect(errors).toEqual([]);
});
