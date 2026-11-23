import { expect, test } from "@playwright/test";

import { collectErrors, onboard } from "./helpers";

/**
 * Sau PR #87 — ba việc nhỏ:
 *
 * A. Lối vào đăng nhập: đầu trang chủ và mục "Tài khoản" trong Cài đặt
 *    dẫn tới /login; đã đăng nhập hiện tên + "Đăng xuất"
 *    (useNoteimSession). Luồng người dùng ẩn danh giữ nguyên.
 *
 * B. Hết nhầm buổi mẫu và buổi thật: buổi mẫu (is_sample) có huy hiệu
 *    "Mẫu"; buổi không có audio_url ẩn nút nghe và hiện "Chưa có âm
 *    thanh"; buổi tạo từ màn ghi âm hiện nhãn "Bản ghi thử: chưa lưu
 *    âm thanh" (chưa thu tiếng thật, chờ PR 04).
 *
 * Server phải chạy như spec c1-auth (AUTH_FAKE=1 + NEXT_PUBLIC_AUTH_FAKE=1
 * khi build, GAP_CHECK_FAKE=1 khi start). Bài giao diện chạy cả phone lẫn
 * desktop; bài màn ghi âm chạy một project (phone).
 */

const DEMO_EMAIL = "demo@noteim.app";
const DEMO_NAME = "Người dùng thử";

function collectAuthErrors(page: import("@playwright/test").Page) {
  return collectErrors(page).filter(
    (e) => !e.includes("CLIENT_FETCH_ERROR") || !e.includes("Failed to fetch"),
  );
}

async function dangNhapDemo(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /Đăng nhập thử/ })).toBeVisible();
  await Promise.all([
    page.waitForURL((u) => u.pathname === "/"),
    page.getByRole("button", { name: /Đăng nhập thử/ }).click(),
  ]);
  await onboard(page);
}

test.describe("A — lối vào đăng nhập cho người ẩn danh", () => {
  test("đầu trang chủ có lời mời và nút Đăng nhập dẫn tới /login, luồng ẩn danh giữ nguyên", async ({ page }) => {
    const errors = collectAuthErrors(page);
    await onboard(page);
    await page.locator("a[href^='/s/']").first().waitFor();

    // Lời mời + nút Đăng nhập ở đầu trang chủ
    await expect(page.getByText("Đăng nhập để lưu buổi ghi và đồng bộ theo lại mọi máy.")).toBeVisible();
    await Promise.all([
      page.waitForURL((u) => u.pathname === "/login"),
      page.getByRole("button", { name: "Đăng nhập", exact: true }).click(),
    ]);
    await expect(page.getByRole("button", { name: /Tiếp tục bằng Google/ })).toBeVisible();

    // Luồng ẩn danh giữ nguyên: quay lại trang chủ vẫn thấy danh sách buổi như cũ
    await page.goto("/");
    await page.locator("a[href^='/s/']").first().waitFor();
    await expect(page.locator("a[href='/s/s-hop-t11']")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("Cài đặt có mục Tài khoản: vào là nút Đăng nhập dẫn tới /login", async ({ page }) => {
    const errors = collectAuthErrors(page);
    await onboard(page);
    await page.goto("/settings");

    // Cài đặt vẽ khối mục/nội dung hai lần cho điện thoại và máy tính (một lần
    // ẩn CSS) — lấy đúng phần tử đang hiện ở bề ngang của project đang chạy.
    const visible = <T extends import("@playwright/test").Locator>(loc: T) => loc.filter({ visible: true });
    const menu = visible(page.getByRole("navigation"));
    await expect(menu.getByRole("link", { name: "Tài khoản" }).first()).toBeVisible();
    await Promise.all([
      page.waitForURL((u) => u.pathname === "/settings/tai-khoan"),
      menu.getByRole("link", { name: "Tài khoản" }).first().click(),
    ]);
    await expect(visible(page.getByText("Đăng nhập để lưu buổi ghi và đồng bộ theo lại mọi máy.")).first()).toBeVisible();

    await Promise.all([
      page.waitForURL((u) => u.pathname === "/login"),
      visible(page.getByRole("button", { name: "Đăng nhập", exact: true })).first().click(),
    ]);
    await expect(page.getByRole("button", { name: /Tiếp tục bằng Google/ })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("A — đã đăng nhập: tên và Đăng xuất", () => {
  test("đầu trang chủ hiện tên người dùng và nút Đăng xuất", async ({ page }) => {
    const errors = collectAuthErrors(page);
    await dangNhapDemo(page);

    await expect(page.getByText(`Đang dùng tài khoản ${DEMO_NAME}`)).toBeVisible();
    await expect(page.getByText(DEMO_EMAIL)).toBeVisible();
    await page.getByRole("button", { name: "Đăng xuất" }).click();
    // Đăng xuất xong: trở lại lời mời đăng nhập ở trang chủ
    await expect(page.getByText("Đăng nhập để lưu buổi ghi và đồng bộ theo lại mọi máy.")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("Cài đặt → Tài khoản: hiện tên, email và nút Đăng xuất", async ({ page }) => {
    const errors = collectAuthErrors(page);
    await dangNhapDemo(page);
    await page.goto("/settings/tai-khoan");

    // Khối nội dung vẽ hai lần (điện thoại/máy tính, một lần ẩn CSS) — lấy phần đang hiện
    const visible = <T extends import("@playwright/test").Locator>(loc: T) => loc.filter({ visible: true });
    await expect(visible(page.getByText(`Đang dùng tài khoản ${DEMO_NAME}`)).first()).toBeVisible();
    await expect(visible(page.getByText(DEMO_EMAIL)).first()).toBeVisible();
    await visible(page.getByRole("button", { name: "Đăng xuất" })).first().click();
    // Đăng xuất dẫn về trang chủ: trở lại lời mời đăng nhập
    await expect(page.getByText("Đăng nhập để lưu buổi ghi và đồng bộ theo lại mọi máy.")).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("B — huy hiệu Mẫu và buổi không có âm thanh", () => {
  test("buổi mẫu bác sĩ có huy hiệu Mẫu và vẫn nghe được (có file âm thanh)", async ({ page }) => {
    const errors = collectErrors(page);
    await onboard(page);
    await page.goto("/s/s-sample-doctor");

    // Huy hiệu "Mẫu" cạnh dòng meta
    await expect(page.getByText("Mẫu", { exact: true })).toBeVisible();
    // Buổi mẫu này có file âm thanh thật: trình phát còn, dòng chi tiết
    // "Chưa có âm thanh" không hiện (các hàng Thư viện ở cột máy tính là chuyện khác)
    await expect(page.locator("[data-listening]")).toBeVisible();
    await expect(page.getByTestId("no-audio-note")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("buổi mẫu không có âm thanh hiện huy hiệu Mẫu kèm dòng Chưa có âm thanh, không có trình phát", async ({ page }) => {
    const errors = collectErrors(page);
    await onboard(page);
    await page.goto("/s/s-sample-realestate_sales");

    await expect(page.getByText("Mẫu", { exact: true })).toBeVisible();
    await expect(page.getByTestId("no-audio-note")).toBeVisible();
    await expect(page.locator("[data-listening]")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("thư viện: hàng buổi không âm thanh có dòng Chưa có âm thanh, hàng có âm thanh thì không", async ({ page }) => {
    const errors = collectErrors(page);
    await onboard(page);
    await page.locator("a[href^='/s/']").first().waitFor();

    // Buổi "Họp điều hành T11" không có file âm thanh — lấy cả hàng
    // (data-session-row), dòng giải thích nằm ngoài phần liên kết tiêu đề
    const rowNoAudio = page.locator('[data-session-row="/s/s-hop-t11"]');
    await expect(rowNoAudio).toBeVisible();
    await expect(rowNoAudio.getByText("Chưa có âm thanh")).toBeVisible();
    // Buổi chị Lan có file âm thanh: không hiện dòng
    const rowAudio = page.locator('[data-session-row="/s/s-bds-lan"]');
    await expect(rowAudio).toBeVisible();
    await expect(rowAudio.getByText("Chưa có âm thanh")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("màn ghi âm hiện nhãn Bản ghi thử, buổi tạo ra cũng hiện nhãn đó (phone)", async ({ page }) => {
    test.skip(test.info().project.name !== "phone", "Màn ghi âm chỉ chạy trên project phone");
    const errors = collectErrors(page);
    await onboard(page);

    // Trình duyệt kiểm thử không có micro: bị chối → dùng âm thanh mẫu để bắt đầu ghi
    await page.goto("/record");
    await page.getByRole("button", { name: "Cho phép micro" }).click();
    await page.getByRole("button", { name: "Dùng thử với âm thanh mẫu" }).click();
    await expect(page.getByRole("button", { name: "Kết thúc buổi ghi" })).toBeVisible();
    await expect(page.getByTestId("trial-recording-note")).toHaveText("Bản ghi thử: chưa lưu âm thanh");

    // Kết thúc bằng cách nhấn giữ (nút giữ 0,8 giây mới nhả — như bài GC-03)
    const ketThuc = page.getByRole("button", { name: "Kết thúc buổi ghi" });
    const box = await ketThuc.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1200);
    await page.mouse.up();
    await page.getByRole("button", { name: "Lưu luôn" }).click();
    await page.waitForURL(/\/s\/s-new-.*\/processing$/);
    // Xử lý giả xong (5 bước × 1,6 s) về trang chi tiết: hiện nhãn bản ghi thử
    await page.waitForURL((u) => u.pathname.startsWith("/s/s-new-") && !u.pathname.endsWith("/processing"), { timeout: 20_000 });
    await expect(page.getByTestId("no-audio-note")).toHaveText("Bản ghi thử: chưa lưu âm thanh");
    // Không có trình phát vì chưa có âm thanh
    await expect(page.locator("[data-listening]")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
