import { expect, test } from "@playwright/test";
import { collectErrors, onboard, setCurrentWorkspace, setDebugFlags } from "./helpers";

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
  // Thay vào đó là thông báo không có quyền, rõ ràng
  await expect(page.getByText("Bạn không có quyền xem buổi ghi này.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Về thư viện" }).first()).toBeVisible();
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

const HUONG_TOKEN = "inv-huong-bui-hpmland-example-vn";

test("/join: lời mời hợp lệ, bấm Tham gia được", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`/join/${HUONG_TOKEN}`);
  await expect(page.getByRole("heading", { name: "Sàn BĐS Hải Phòng Land" })).toBeVisible();
  // Người mời hiện tên (dòng nhật ký mời cuối trùng email)
  await expect(page.getByText(/Hoàng mời bạn tham gia/)).toBeVisible();
  await page.getByRole("button", { name: "Tham gia" }).click();
  await expect(page.getByText("Bạn đã tham gia nhóm Sàn BĐS Hải Phòng Land")).toBeVisible();
  expect(errors).toEqual([]);
});

test("/join: lời mời hết hạn (ép bằng cờ) và không tìm thấy", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`/join/${HUONG_TOKEN}`);
  await setDebugFlags(page, { inviteExpired: true });
  await expect(page.getByText("Lời mời đã hết hạn")).toBeVisible();
  await page.goto("/join/inv-khong-co-trong-du-lieu");
  await expect(page.getByText("Không tìm thấy lời mời")).toBeVisible();
  expect(errors).toEqual([]);
});

test("mời thành viên mới: hiện hàng đang chờ kèm link mời", async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  // Chuyển sang không gian nhóm rồi mở "Thành viên và lời mời"
  await page.getByRole("button", { name: "Đổi không gian làm việc" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Sàn BĐS Hải Phòng Land/ }).click();
  await page.getByRole("button", { name: "Đổi không gian làm việc" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Thành viên và lời mời" }).click();
  // Lời mời đang chờ có sẵn trong dữ liệu mẫu
  await expect(page.getByText("Bùi Thu Hương")).toBeVisible();
  await expect(page.getByText("huong.bui@hpmland.example.vn").first()).toBeVisible();
  // Mời thêm một email
  await page.getByLabel("Email người được mời").fill("linh.tran@hpmland.example.vn");
  await page.getByRole("button", { name: "Gửi lời mời" }).click();
  await expect(page.getByText("linh.tran@hpmland.example.vn").first()).toBeVisible();
  await expect(page.getByText("Đang chờ").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("cờ Nhóm hết chỗ: nút mời khóa kèm lý do", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Đổi không gian làm việc" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Sàn BĐS Hải Phòng Land/ }).click();
  await page.getByRole("button", { name: "Đổi không gian làm việc" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Thành viên và lời mời" }).click();
  await page.getByLabel("Email người được mời").fill("linh.tran@hpmland.example.vn");
  await expect(page.getByRole("button", { name: "Gửi lời mời" })).toBeEnabled();
  // Bật cờ: bảng thử nghiệm tải lại trang nên mở lại bảng thành viên
  await setDebugFlags(page, { seatsFull: true });
  await page.getByRole("button", { name: "Đổi không gian làm việc" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Thành viên và lời mời" }).click();
  await page.getByLabel("Email người được mời").fill("linh.tran@hpmland.example.vn");
  await expect(page.getByRole("button", { name: "Gửi lời mời" })).toBeDisabled();
  await expect(page.getByText("Nhóm đã dùng hết số chỗ của gói")).toBeVisible();
});

const TEAM_SESSIONS = ["s-nhom-marina-c", "s-nhom-hop-tuan-45", "s-nhom-legend-ha-phong"];

async function toTeamLibrary(page: import("@playwright/test").Page) {
  await onboard(page);
  await page.getByRole("button", { name: "Đổi không gian làm việc" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Sàn BĐS Hải Phòng Land/ }).click();
  await expect(page.locator("a[href='/s/s-nhom-marina-c']")).toBeVisible();
}

test("thư viện nhóm: chip Của tôi / Cả nhóm và tên người ghi", async ({ page }) => {
  const errors = collectErrors(page);
  await toTeamLibrary(page);
  // Hàng buổi của người khác hiện tên người ghi; hàng của mình không hiện
  await expect(page.getByText("Ghi bởi Phạm Thùy Trâm").first()).toBeVisible();
  await expect(page.getByText("Ghi bởi Võ Quốc Dũng").first()).toBeVisible();
  const marinaRow = page.locator("a[href='/s/s-nhom-marina-c']").locator("xpath=ancestor::div[contains(@class,'border-b')]");
  await expect(marinaRow.getByText("Ghi bởi")).toHaveCount(0);
  // Chip Của tôi: chỉ buổi mình ghi
  await page.getByRole("button", { name: "Của tôi" }).click();
  await expect(page.locator("a[href='/s/s-nhom-marina-c']")).toBeVisible();
  for (const id of ["s-nhom-hop-tuan-45", "s-nhom-legend-ha-phong"]) {
    await expect(page.locator(`a[href='/s/${id}']`)).toHaveCount(0);
  }
  // Chip Cả nhóm: ba buổi đã chia sẻ, không có buổi riêng tư của ai
  await page.getByRole("button", { name: "Cả nhóm" }).click();
  for (const id of TEAM_SESSIONS) {
    await expect(page.locator(`a[href='/s/${id}']`)).toBeVisible();
  }
  for (const id of TEAM_ONLY) {
    await expect(page.locator(`a[href='/s/${id}']`)).toHaveCount(0);
  }
  // Bỏ chip: thư viện trở lại đủ 3 buổi chia sẻ
  await page.getByRole("button", { name: "Cả nhóm" }).click();
  await expect(page.locator("a[href='/s/s-nhom-marina-c']")).toBeVisible();
  expect(errors).toEqual([]);
});

test("menu ⋯: đổi Riêng tư sang Cả nhóm rồi trở lại", async ({ page }) => {
  const errors = collectErrors(page);
  await toTeamLibrary(page);
  // Buổi của mình (s-nhom-marina-c) đang là Cả nhóm: menu có mục đặt lại Riêng tư
  await page.locator("a[href='/s/s-nhom-marina-c']").locator("xpath=ancestor::div[contains(@class,'border-b')]").getByRole("button", { name: "Thao tác với buổi ghi" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Đặt lại Riêng tư" }).click();
  // Ẩn khỏi lọc Cả nhóm nhưng vẫn thấy trong thư viện của mình
  await expect(page.getByText("Đã đổi chế độ chia sẻ")).toBeVisible();
  await page.getByRole("button", { name: "Cả nhóm" }).click();
  await expect(page.locator("a[href='/s/s-nhom-marina-c']")).toHaveCount(0);
  // Đặt lại như cũ qua menu
  await page.getByRole("button", { name: "Cả nhóm" }).click();
  await page.locator("a[href='/s/s-nhom-marina-c']").locator("xpath=ancestor::div[contains(@class,'border-b')]").getByRole("button", { name: "Thao tác với buổi ghi" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Chia sẻ với cả nhóm" }).click();
  await expect(page.getByText("Đã đổi chế độ chia sẻ")).toBeVisible();
  await page.getByRole("button", { name: "Cả nhóm" }).click();
  await expect(page.locator("a[href='/s/s-nhom-marina-c']")).toBeVisible();
  expect(errors).toEqual([]);
});

test("bảng Chia sẻ: công tắc Chia sẻ với cả nhóm", async ({ page }) => {
  const errors = collectErrors(page);
  await toTeamLibrary(page);
  // Buổi của người khác đã chia sẻ: không có công tắc (chỉ người ghi đổi được)
  await page.locator("a[href='/s/s-nhom-hop-tuan-45']").click();
  await expect(page.getByRole("heading", { name: "Họp giao việc tuần 45" })).toBeVisible();
  await page.getByRole("button", { name: "Chia sẻ" }).click();
  // Bảng chia sẻ mở ở menu: vào "Link xem" mới thấy phần công tắc
  await page.getByRole("button", { name: /Link xem/ }).click();
  await expect(page.getByText("Chia sẻ với cả nhóm")).toHaveCount(0);
  // Mở bảng Chia sẻ của buổi của mình: có công tắc, bật tắt được
  await page.keyboard.press("Escape");
  await page.goto("/");
  await page.locator("a[href='/s/s-nhom-marina-c']").click();
  await expect(page.getByRole("heading", { name: "Khách chốt căn góc Marina C" })).toBeVisible();
  await page.getByRole("button", { name: "Chia sẻ" }).click();
  await page.getByRole("button", { name: /Link xem/ }).click();
  const sw = page.getByRole("switch", { name: "Chia sẻ với cả nhóm" });
  await expect(sw).toBeVisible();
  await sw.click();
  await expect(page.getByText("Đã đặt lại Riêng tư")).toBeVisible();
  await sw.click();
  await expect(page.getByText("Đã chia sẻ với cả nhóm")).toBeVisible();
  expect(errors).toEqual([]);
});

test("tìm kiếm chỉ trong không gian đang dùng (review PR #55)", async ({ page }) => {
  await onboard(page);
  const setWs = (id: string) =>
    page.evaluate((w) => {
      const d = JSON.parse(localStorage.getItem("noteim-mock-db-v1")!);
      d.user.current_workspace_id = w;
      localStorage.setItem("noteim-mock-db-v1", JSON.stringify(d));
    }, id);
  const search = async (q: string) => {
    await page.goto("/search");
    await page.getByRole("searchbox").or(page.getByRole("textbox")).first().fill(q);
    await page.waitForTimeout(1500);
    return page.locator("main").innerText();
  };
  expect(await search("Marina C")).not.toContain("Khách chốt căn góc Marina C");
  await setWs("w-hp-land");
  expect(await search("lai suat")).not.toContain("Gặp chị Lan");
  expect(await search("Marina C")).toContain("Khách chốt căn góc Marina C");
});
