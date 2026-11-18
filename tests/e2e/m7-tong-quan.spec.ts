import { expect, test } from "@playwright/test";
import { collectErrors, onboard, setDebugFlags } from "./helpers";

/**
 * Tổng quan cá nhân và nhóm (M7-02, issue #48).
 * Bài của từng bước viết cùng bước đó; chạy lại toàn bộ ở bước 5.
 * Số liệu đếm tay từ fixture (bản giả cố định "bây giờ" 14/11/2026 19:00):
 * M9-01 (issue #65): 3 buổi mẫu đổi sang âm thanh thật nên thời lượng ngắn lại
 * (s-bds-lan 2530→383,5 giây, s-hop-han 2980→464,4 giây):
 * Tuần này: 8 buổi, 211 phút (cũ 288), 17 quyết định, xong 3 trên 19 việc.
 * Tháng này: 9 buổi, 227 phút (cũ 304), 19 quyết định, xong 4 trên 20 việc.
 * Theo mẫu (tuần): Họp điều hành 76 (cũ 118, gồm cả s-hop-han), Gặp khách 40 (cũ 76).
 * Nhóm (w-hp-land, tuần): 3 buổi chia sẻ, 103 phút — chỉ tính buổi nhóm, không đổi.
 * (M7-04: bỏ nhãn "Đã chốt" khỏi phần nhu cầu, yêu cầu, giấy tờ trong dữ
 * liệu mẫu — cũ: tuần 21, tháng 23, nhóm 5.)
 */

/* ---------- Bước 2/5: Điều hướng ---------- */

// Hai thanh cùng nhãn "Điều hướng chính" nhưng mỗi bề ngang chỉ một thanh nằm
// trong cây tiếp cận (thanh kia display:none): điện thoại thấy thanh dưới,
// máy tính thấy thanh bên — locator "navigation" trúng đúng thanh đó.
const NAV = "Điều hướng chính";

test("thanh dưới điện thoại: đủ năm mục, Ghi âm ở giữa", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "Chỉ có thanh dưới trên điện thoại");
  const errors = collectErrors(page);
  await onboard(page);
  const bottom = page.getByRole("navigation", { name: NAV });
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

test("thanh bên máy tính: Thư viện, Tổng quan, Việc, Cài đặt", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Thanh bên chỉ có trên máy tính");
  const errors = collectErrors(page);
  await onboard(page);
  const side = page.getByRole("navigation", { name: NAV });
  const hrefs = await side
    .locator("ul a")
    .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")));
  expect(hrefs).toEqual(["/", "/dashboard", "/tasks", "/settings"]);
  expect(errors).toEqual([]);
});

test("Ghi âm vẫn 2 lần chạm: thanh dưới dẫn tới màn ghi, chưa ghi ngay", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  const bottom = page.getByRole("navigation", { name: NAV });
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
  await page.getByRole("navigation", { name: NAV }).getByRole("link", { name: DASH }).click();
  await expect(page.getByRole("heading", { name: "Cần xử lý" })).toBeVisible();
  // Việc quá hạn (3) và đến hạn hôm nay (1) — đếm tay từ fixture
  for (const label of [
    "Việc quá hạn, Gửi bảng tính vay 50% cho chị Lan",
    "Việc quá hạn, Gửi bản vẽ điều chỉnh cầu thang",
    "Việc quá hạn, Lập kế hoạch ca tối cho xưởng",
    "Đến hạn hôm nay, Xử lý vết nứt dầm bo tầng 3",
  ]) {
    await expect(page.getByRole("link", { name: `${ATTN}: ${label}` })).toBeVisible();
  }
  // Người nói chưa đặt tên: 3 buổi (buổi khám, chị Lan, công chứng)
  await expect(page.getByRole("link", { name: /Người nói chưa đặt tên, Buổi khám nội tổng quát/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Người nói chưa đặt tên, Gặp chị Lan/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Người nói chưa đặt tên, Phiên công chứng/ })).toBeVisible();
  // Bản gốc sắp tự xóa: buổi công chứng hết hạn 15/11 (còn dưới 48 giờ)
  await expect(page.getByRole("link", { name: /Bản gốc sắp tự xóa, Phiên công chứng/ })).toBeVisible();
  // Buổi ghi xử lý lỗi
  await expect(page.getByRole("link", { name: /Buổi ghi xử lý lỗi, Gặp anh Tuấn/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Cần xử lý: dòng việc quá hạn đi thẳng tới tab Việc của buổi ghi", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.getByRole("navigation", { name: NAV }).getByRole("link", { name: DASH }).click();
  await page.getByRole("link", { name: `${ATTN}: Việc quá hạn, Gửi bảng tính vay 50% cho chị Lan` }).click();
  await expect(page).toHaveURL(/\/s\/s-bds-lan\?tab=tasks/);
  // Đúng chỗ sửa việc: chính việc đó nằm trong tab Việc
  await expect(page.getByText("Gửi bảng tính vay 50% cho chị Lan").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("Cần xử lý: dòng đến hạn hôm nay đi tới đúng buổi, dòng lỗi đi tới màn chạy lại", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.getByRole("navigation", { name: NAV }).getByRole("link", { name: DASH }).click();
  // Đến hạn hôm nay
  await page.getByRole("link", { name: `${ATTN}: Đến hạn hôm nay, Xử lý vết nứt dầm bo tầng 3` }).click();
  await expect(page).toHaveURL(/\/s\/s-kts-lachtray\?tab=tasks/);
  await expect(page.getByText("Xử lý vết nứt dầm bo tầng 3").first()).toBeVisible();
  // Buổi ghi xử lý lỗi: mở buổi ở trạng thái lỗi, có nút Thử lại
  await page.goto("/dashboard");
  await page.getByRole("link", { name: /Buổi ghi xử lý lỗi, Gặp anh Tuấn/ }).click();
  await expect(page).toHaveURL(/\/s\/s-loi/);
  await expect(page.getByText("Chưa tóm tắt được buổi ghi này. Bản ghi âm vẫn an toàn.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Cần xử lý: dòng người nói chưa đặt tên mở thẳng bảng đặt tên", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.getByRole("navigation", { name: NAV }).getByRole("link", { name: DASH }).click();
  await page.getByRole("link", { name: /Người nói chưa đặt tên, Gặp chị Lan/ }).click();
  await expect(page).toHaveURL(/\/s\/s-bds-lan\?sheet=speakers/);
  // Bảng "Ai là ai?" mở sẵn
  await expect(page.getByRole("dialog").getByText("Đặt tên cho từng người nói")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Tuần này: câu tổng kết khớp số đếm tay; Tháng này đổi đúng số", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.getByRole("navigation", { name: NAV }).getByRole("link", { name: DASH }).click();
  await expect(page.getByText("8 buổi ghi, 3 giờ 31, 17 quyết định, xong 3 trên 19 việc")).toBeVisible();
  await page.getByRole("button", { name: "Tháng này" }).click();
  await expect(page.getByText("9 buổi ghi, 3 giờ 47, 19 quyết định, xong 4 trên 20 việc")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Dải giọng theo ngày: bấm Hôm nay dẫn về thư viện lọc đúng ngày, bỏ lọc được", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.getByRole("navigation", { name: NAV }).getByRole("link", { name: DASH }).click();
  // Năm ngày có buổi trong tuần (11/08, 11/11, 11/12, 11/13, 11/14)
  await expect(page.getByRole("button", { name: "Lọc thư viện theo Hôm nay" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lọc thư viện theo Hôm qua" })).toBeVisible();
  await page.getByRole("button", { name: "Lọc thư viện theo Hôm nay" }).click();
  await expect(page).toHaveURL(/\/\?day=2026-11-14$/);
  // Thư viện còn 3 buổi của hôm nay, chip ngày hiện ở đầu bộ lọc
  // (chờ danh sách tải xong rồi mới đọc href)
  await expect(page.locator("a[href^='/s/']")).toHaveCount(3);
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
  await page.getByRole("navigation", { name: NAV }).getByRole("link", { name: DASH }).click();
  // Tuần này chỉ tính 3 buổi được đọc (của mình + chia sẻ): 103 phút
  await expect(page.getByText("3 buổi ghi, 1 giờ 43, 3 quyết định, xong 1 trên 7 việc")).toBeVisible();
  // Việc của buổi riêng tư người khác không xuất hiện
  await expect(page.getByText("Nhắc chủ nhà giải chấp thế chấp trước 18/11")).toHaveCount(0);
  await expect(page.getByText("Soạn phụ lục phân phối độc quyền gửi chủ đầu tư")).toHaveCount(0);
  await expect(page.getByText("Đàm phán lại giá Sông Hồng theo phương án giảm 5%")).toHaveCount(0);
  // Việc của buổi được đọc vẫn hiện (đến hạn hôm nay)
  await expect(page.getByRole("link", { name: /Đến hạn hôm nay, Gửi anh Khánh bản dự thảo hợp đồng đặt cọc/ })).toBeVisible();
  expect(errors).toEqual([]);
});

/* ---------- Bước 4/5: Các phần còn lại ---------- */

test("Quyết định đã chốt: bấm một dòng nghe lại đúng mốc trong buổi", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.getByRole("navigation", { name: NAV }).getByRole("link", { name: DASH }).click();
  await expect(page.getByRole("heading", { name: "Quyết định đã chốt" })).toBeVisible();
  // Ý chốt của buổi chị Lan có trong danh sách
  await expect(page.getByText("Bên bán giữ căn 18.06 đến hết thứ Bảy 16/11")).toBeVisible();
  // Bấm đúng dòng quyết định của buổi chị Lan: "Bên bán giữ căn 18.06..." (t=1600)
  const row = page.locator("li").filter({ hasText: "Bên bán giữ căn 18.06 đến hết thứ Bảy 16/11" });
  await row.locator("a").click();
  // Buổi mở, ?t được dùng để tua rồi dọn về tab Tóm tắt (trình phát tua tới mốc)
  await expect(page).toHaveURL(/\/s\/s-bds-lan/);
  await expect(page).toHaveURL(/\?tab=summary$/, { timeout: 15000 });
  expect(errors).toEqual([]);
});

test("Người gặp nhiều: đúng liên hệ và số buổi, không có chính mình", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.getByRole("navigation", { name: NAV }).getByRole("link", { name: DASH }).click();
  await expect(page.getByRole("heading", { name: "Người gặp nhiều" })).toBeVisible();
  // Đếm tay: chị Thảo 2 buổi; các người gặp 1 buổi xếp theo lần gặp gần nhất:
  // Ông Phước (14/11 13:40), chị Lan (14/11 09:05), anh Hùng, anh Nam (13/11 16:10)
  await expect(page.getByText("Chị Thảo").first()).toBeVisible();
  await expect(page.getByText("2 buổi").first()).toBeVisible();
  for (const name of ["Ông Phước", "Chị Lan", "Anh Hùng", "Anh Nam"]) {
    await expect(page.getByText(name).first()).toBeVisible();
  }
  // Chính người dùng không nằm trong danh sách người gặp (liên hệ c-me bị loại)
  await expect(page.locator("section[aria-labelledby='dash-contacts']")).not.toContainText("Hoàng");
  expect(errors).toEqual([]);
});

test("Theo mẫu: biểu đồ thanh ngang đúng mẫu và thời lượng, nạp chậm", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.getByRole("navigation", { name: NAV }).getByRole("link", { name: DASH }).click();
  await expect(page.getByRole("heading", { name: "Theo mẫu" })).toBeVisible();
  // Cuộn tới biểu đồ để nạp chậm
  await page.getByRole("heading", { name: "Theo mẫu" }).scrollIntoViewIfNeeded();
  const chart = page.getByRole("img", { name: "Thời lượng ghi theo từng mẫu tóm tắt" });
  await expect(chart).toBeVisible();
  // Đếm tay (tuần): Họp điều hành 76 (gồm cả s-hop-han sau khi gắn âm thanh
  // thật), Gặp khách 40, Họp thiết kế và công trường 37, Tư vấn pháp lý 33,
  // Phiên công chứng 25 phút
  await expect(chart.getByText("Họp điều hành")).toBeVisible();
  await expect(chart.getByText("76 phút")).toBeVisible();
  await expect(chart.getByText("Gặp khách")).toBeVisible();
  await expect(chart.getByText("40 phút")).toBeVisible();
  await expect(chart.getByText("Phiên công chứng")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Hạn mức: đúng số phút đã dùng và ngày làm mới; cờ hết hạn mức hiện nút nâng gói", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.getByRole("navigation", { name: NAV }).getByRole("link", { name: DASH }).click();
  await expect(page.getByRole("heading", { name: "Hạn mức" })).toBeVisible();
  // quota.json: đã dùng 124 trên 180, làm mới từ 01/12
  await expect(page.getByText("Đã dùng 124 trên 180 phút")).toBeVisible();
  await expect(page.getByText("Còn 56 phút, làm mới từ ngày 01/12")).toBeVisible();
  // Dưới ngưỡng 80%: chưa có nút nâng gói
  await expect(page.getByRole("button", { name: "Nâng gói" })).toHaveCount(0);
  expect(errors).toEqual([]);
  // Ép hết hạn mức: hiện cảnh báo và nút nâng gói dẫn tới /upgrade
  await setDebugFlags(page, { quotaOut: true });
  await page.getByRole("navigation", { name: NAV }).getByRole("link", { name: DASH }).click();
  await expect(page.getByText("Sắp hết hạn mức tháng này.")).toBeVisible();
  await page.getByRole("button", { name: "Nâng gói" }).click();
  await expect(page).toHaveURL(/\/upgrade$/);
  expect(errors).toEqual([]);
});

test("Thư viện rỗng (người mới): Tổng quan hiện hướng dẫn, không hiện số 0", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await setDebugFlags(page, { emptyLibrary: true });
  await page.getByRole("navigation", { name: NAV }).getByRole("link", { name: DASH }).click();
  // Hướng dẫn ghi buổi đầu tiên thay cho các phần số liệu
  await expect(page.getByRole("heading", { name: "Chào bạn đến Noteim" })).toBeVisible();
  await expect(page.getByText("Tổng quan sẽ hiện ở đây sau buổi đầu tiên.", { exact: false })).toBeVisible();
  // Không còn phần số liệu và câu tổng kết 0
  await expect(page.getByRole("heading", { name: "Cần xử lý" })).toHaveCount(0);
  await expect(page.getByText(/0 buổi ghi/)).toHaveCount(0);
  await expect(page.getByText("Không có việc gì cần xử lý")).toHaveCount(0);
  // Nút hướng dẫn dẫn tới màn ghi
  await page.getByRole("button", { name: "Ghi buổi đầu tiên" }).click();
  await expect(page).toHaveURL(/\/record$/);
  expect(errors).toEqual([]);
});

test("Tab Nhóm: chỉ Chủ và Quản trị thấy; bảng mức dùng theo người, việc quá hạn, buổi chia sẻ", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  // Vào không gian nhóm (Chủ: người dùng mẫu là Chủ của w-hp-land)
  await page.getByRole("button", { name: "Đổi không gian làm việc" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Sàn BĐS Hải Phòng Land/ }).click();
  await page.getByRole("navigation", { name: NAV }).getByRole("link", { name: DASH }).click();
  await expect(page.getByRole("tab", { name: "Nhóm" })).toBeVisible();
  await page.getByRole("tab", { name: "Nhóm" }).click();
  // Đếm tay mức dùng tuần (tính cả buổi riêng tư của từng người):
  // Hoàng 41, Trâm 85, Dũng 29, Hùng 26, Mai Anh 30 → cả nhóm 211 phút
  await expect(page.getByRole("heading", { name: "Cả nhóm đã dùng 211 phút" })).toBeVisible();
  await expect(page.getByText("Hạn mức chung 900 phút")).toBeVisible();
  await expect(page.getByText("Việc quá hạn của nhóm: 0")).toBeVisible();
  // Bảng theo người: đủ 5 thành viên đang hoạt động, đúng vai trò
  for (const name of ["Hoàng", "Phạm Thùy Trâm", "Võ Quốc Dũng", "Lê Công Hùng", "Đỗ Mai Anh"]) {
    await expect(page.getByRole("cell", { name }).first()).toBeVisible();
  }
  await expect(page.getByRole("cell", { name: "Chủ" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "Quản trị" }).first()).toBeVisible();
  await expect(page.getByRole("row", { name: /Phạm Thùy Trâm/ })).toContainText("85");
  // Việc mở theo người phụ trách (cột cuối): Dũng 3, Hùng 2
  // Buổi chia sẻ gần đây: Marina C của mình, Họp giao việc tuần 45 của Trâm
  await expect(page.getByRole("heading", { name: "Buổi ghi được chia sẻ với nhóm gần đây" })).toBeVisible();
  await expect(page.getByText("Khách chốt căn góc Marina C").first()).toBeVisible();
  await expect(page.getByText("Họp giao việc tuần 45").first()).toBeVisible();
  await expect(page.getByText(/Ghi bởi Phạm Thùy Trâm/).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("Thành viên thường không thấy tab Nhóm (cờ ép vai trò)", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await page.getByRole("button", { name: "Đổi không gian làm việc" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Sàn BĐS Hải Phòng Land/ }).click();
  // Ép vai trò Thành viên bằng bảng thử nghiệm
  await setDebugFlags(page, { debugRole: "member" });
  await page.getByRole("navigation", { name: NAV }).getByRole("link", { name: DASH }).click();
  await expect(page.getByRole("tab", { name: "Nhóm" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Cá nhân" })).toHaveCount(0);
  // Phần cá nhân vẫn hiện bình thường trong không gian nhóm
  await expect(page.getByRole("heading", { name: "Cần xử lý" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Quyết định đã chốt hiện 5 ý, mở được hết (review PR #56)", async ({ page }) => {
  await onboard(page);
  await page.goto("/dashboard");
  const sec = page.locator("section", { has: page.getByRole("heading", { name: "Quyết định đã chốt" }) });
  await expect(sec.locator("li")).toHaveCount(5);
  await sec.getByRole("button", { name: "Xem tất cả 17 quyết định" }).click();
  await expect(sec.locator("li")).toHaveCount(17);
  await sec.getByRole("button", { name: "Thu gọn" }).click();
  await expect(sec.locator("li")).toHaveCount(5);
  // Chữ cái đầu bỏ cách xưng hô: "Chị Thảo" thành "T"
  const contacts = page.locator("section", { has: page.getByRole("heading", { name: "Người gặp nhiều" }) });
  await expect(contacts.locator("li").first()).toContainText("T");
});
