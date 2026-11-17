import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { collectErrors, onboard, setCurrentWorkspace, setDebugFlags } from "./helpers";

/**
 * Quản trị nhóm (M7-03, issue #49).
 * - Năm thao tác (xem, chia sẻ, xuất, mời, gỡ) ghi đủ trong nhật ký, đúng người, đúng giờ.
 * - Thành viên mở /team/* bằng đường dẫn: không có quyền.
 * - CSV UTF-8 có BOM, mở bằng Excel không lỗi tiếng Việt.
 * - Chuyển Chủ, xóa nhóm (gõ tên nhóm), rời nhóm có hộp xác nhận.
 * - Gói Nhóm ở /upgrade; câu "quản trị không đọc được nội dung buổi riêng tư".
 * Buổi nhóm của mình: s-nhom-marina-c (Khách chốt căn góc Marina C, đã chia sẻ cả nhóm).
 * "Bây giờ" của dữ liệu mẫu là 2026-11-14T19:00:00+07:00: dòng nhật ký mới có giờ "19:00".
 * Hộp xác nhận dùng Radix AlertDialog nên role là alertdialog. Hộp viết bằng
 * tiếng Việt, chạy trên bản build (pnpm build && pnpm start -p 3100).
 */

async function toTeamSpace(page: Page) {
  await onboard(page);
  await setCurrentWorkspace(page, "w-hp-land");
}

test("năm thao tác (xem, chia sẻ, xuất, mời, gỡ) ghi đủ trong nhật ký, đúng người đúng giờ", async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await toTeamSpace(page);

  // 1. Xem: mở buổi chia sẻ cả nhóm của mình
  await page.goto("/s/s-nhom-marina-c");
  await expect(page.getByRole("heading", { name: "Khách chốt căn góc Marina C" })).toBeVisible();

  // 2. Chia sẻ: tạo link xem trong bảng Chia sẻ
  await page.getByRole("button", { name: "Chia sẻ", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Link xem" }).click();
  await page.getByRole("button", { name: "Tạo link" }).click();
  await expect(page.getByText("Đã tạo link xem")).toBeVisible();
  await page.keyboard.press("Escape");

  // 3. Xuất file: Xuất PDF (giả lập) trong bảng Chia sẻ
  await page.getByRole("button", { name: "Chia sẻ", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Xuất file" }).click();
  await page.getByRole("button", { name: "Xuất PDF" }).click();
  await expect(page.getByText("Đã xuất PDF")).toBeVisible();
  await page.keyboard.press("Escape");
  // Nhật ký xuất là lệnh ghi nền (fire-and-forget): đợi kịp commit trước khi rời trang
  await page.waitForTimeout(1200);

  // 4. Mời thành viên mới
  await page.goto("/team/members");
  await page.getByLabel("Email người được mời").fill("linh.pham@hpmland.example.vn");
  await page.getByRole("button", { name: "Gửi lời mời" }).click();
  await expect(page.getByText("linh.pham@hpmland.example.vn").first()).toBeVisible();

  // 5. Gỡ thành viên (hộp xác nhận)
  const dungRow = page.locator("li", { hasText: "Võ Quốc Dũng" });
  await dungRow.getByRole("button", { name: "Gỡ", exact: true }).click();
  await expect(page.getByText("Gỡ Võ Quốc Dũng khỏi nhóm?")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "Gỡ", exact: true }).click();
  await expect(page.getByText("Đã gỡ Võ Quốc Dũng")).toBeVisible();

  // Mở nhật ký: chờ trang tải xong (khung chờ hết, tiêu đề hiện) rồi đếm dòng
  await page.goto("/team/audit");
  await expect(page.getByRole("heading", { name: "Nhật ký truy cập" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("main").getByRole("listitem").filter({ hasText: "19:00" }).first()).toBeVisible({ timeout: 20_000 });
  const log = page.locator("main").getByRole("listitem");
  const check = (action: string, target: string) =>
    expect(
      log
        .filter({ hasText: action })
        .filter({ hasText: target })
        .filter({ hasText: "19:00" }),
    ).toHaveCount(1, { timeout: 20_000 });
  check("Xem buổi ghi", "Khách chốt căn góc Marina C");
  check("Chia sẻ với nhóm", "Khách chốt căn góc Marina C");
  check("Xuất file", "Khách chốt căn góc Marina C");
  check("Mời thành viên", "linh.pham@hpmland.example.vn");
  check("Gỡ thành viên", "Võ Quốc Dũng");
  // Đúng người: dòng mới đều do Hoàng làm
  expect(await log.filter({ hasText: "19:00" }).evaluateAll((els) => els.every((el) => el.textContent!.includes("Hoàng")))).toBe(true);
  expect(errors).toEqual([]);
});

test("thành viên mở /team/audit, /team/usage, /team/billing bằng đường dẫn: không có quyền", async ({ page }) => {
  const errors = collectErrors(page);
  await toTeamSpace(page);
  await setDebugFlags(page, { debugRole: "member" });
  for (const path of ["/team/audit", "/team/usage", "/team/billing", "/team/templates"]) {
    await page.goto(path);
    await expect(page.getByText("Bạn không có quyền mở trang này")).toBeVisible();
  }
  // Thành viên vẫn vào được trang thông tin nhóm để rời nhóm
  await page.goto("/team");
  await expect(page.getByRole("heading", { name: "Thông tin nhóm" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rời nhóm" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Xóa nhóm" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("CSV mức dùng và nhật ký: UTF-8 có BOM, đúng cột", async ({ page }) => {
  test.setTimeout(90_000);
  await toTeamSpace(page);
  await page.goto("/team/usage");
  // Bảng đã có dữ liệu trước khi tải
  await expect(page.getByRole("cell", { name: "Phạm Thùy Trâm" })).toBeVisible({ timeout: 20_000 });
  const usageDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Tải CSV mức dùng" }).click();
  const usage = await usageDownload;
  const usageText = readFileSync(await usage.path(), "utf8");
  expect(usageText.charCodeAt(0)).toBe(0xfeff);
  expect(usageText.replace(/^\uFEFF/, "").split("\r\n")[0]).toBe("Thành viên,Vai trò,Buổi,Phút,Việc mở");
  expect(usageText).toContain("Phạm Thùy Trâm,Quản trị,");

  await page.goto("/team/audit");
  // Chờ danh sách nhật ký có dữ liệu thật (không phải listitem của thanh điều hướng)
  await expect(page.locator("main").getByRole("listitem").filter({ hasText: "Hoàng" }).first()).toBeVisible({ timeout: 20_000 });
  const auditDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Tải CSV nhật ký" }).click();
  const audit = await auditDownload;
  const auditText = readFileSync(await audit.path(), "utf8");
  expect(auditText.charCodeAt(0)).toBe(0xfeff);
  expect(auditText.replace(/^\uFEFF/, "").split("\r\n")[0]).toBe("Thời gian,Người thực hiện,Hành động,Đối tượng");
  expect(auditText).toContain("Hoàng");
});

test("chuyển quyền Chủ qua hộp xác nhận, vai trò người chuyển thành Quản trị", async ({ page }) => {
  const errors = collectErrors(page);
  await toTeamSpace(page);
  await page.goto("/team");
  await expect(page.getByRole("heading", { name: "Thông tin nhóm" })).toBeVisible();
  await page.getByRole("button", { name: "Chuyển quyền Chủ" }).click();
  // Chọn người nhận ngay trong hộp xác nhận
  await page.getByRole("alertdialog").getByLabel("Chọn thành viên nhận quyền Chủ").selectOption({ label: "Phạm Thùy Trâm" });
  await expect(page.getByText("Chuyển quyền Chủ cho Phạm Thùy Trâm?")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "Chuyển quyền Chủ" }).click();
  await expect(page.getByText("Đã chuyển quyền Chủ cho Phạm Thùy Trâm")).toBeVisible();
  // Vai trò của mình trở thành Quản trị, nút Xóa nhóm biến mất
  await expect(page.getByRole("button", { name: "Xóa nhóm" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Chuyển quyền Chủ" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("xóa nhóm phải gõ đúng tên nhóm, xong về không gian Cá nhân", async ({ page }) => {
  const errors = collectErrors(page);
  await toTeamSpace(page);
  await page.goto("/team");
  await expect(page.getByRole("heading", { name: "Thông tin nhóm" })).toBeVisible();
  await page.getByRole("button", { name: "Xóa nhóm" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(page.getByText("Xóa nhóm Sàn BĐS Hải Phòng Land?")).toBeVisible();
  // Sai tên: nút Xóa nhóm khóa
  await dialog.getByLabel("Gõ đúng tên nhóm để mở nút Xóa nhóm").fill("Sàn BĐS Hải Phòng");
  await expect(dialog.getByRole("button", { name: "Xóa nhóm" })).toBeDisabled();
  // Đúng tên: mở nút, bấm xóa
  await dialog.getByLabel("Gõ đúng tên nhóm để mở nút Xóa nhóm").fill("Sàn BĐS Hải Phòng Land");
  await expect(dialog.getByRole("button", { name: "Xóa nhóm" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Xóa nhóm" }).click();
  await expect(page.getByText("Đã xóa nhóm Sàn BĐS Hải Phòng Land")).toBeVisible();
  // Về thư viện không gian Cá nhân: 9 buổi cũ + Marina C (buổi nhóm duy nhất
  // của mình); buổi nhóm của người khác đi về không gian Cá nhân của họ
  await expect(page.locator("a[href^='/s/']")).toHaveCount(10);
  await expect(page.locator("a[href='/s/s-bds-lan']").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("thành viên rời nhóm qua hộp xác nhận, về không gian Cá nhân", async ({ page }) => {
  const errors = collectErrors(page);
  await toTeamSpace(page);
  await setDebugFlags(page, { debugRole: "member" });
  await page.goto("/team");
  await expect(page.getByRole("heading", { name: "Thông tin nhóm" })).toBeVisible();
  await page.getByRole("button", { name: "Rời nhóm" }).click();
  await expect(page.getByText("Rời nhóm Sàn BĐS Hải Phòng Land?")).toBeVisible();
  await expect(page.getByText("Buổi ghi riêng tư của bạn sẽ đi theo bạn về không gian Cá nhân")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "Rời nhóm" }).click();
  await expect(page.getByText("Bạn đã rời nhóm Sàn BĐS Hải Phòng Land")).toBeVisible();
  await expect(page.locator("a[href='/s/s-bds-lan']").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("mục Nhóm trong Cài đặt chỉ hiện trong không gian Nhóm", async ({ page }) => {
  const errors = collectErrors(page);
  await toTeamSpace(page);
  await page.goto("/settings");
  // Nhãn của mục: "Nhóm" đứng trước mô tả "Tên nhóm, nghề chính..."
  await expect(page.getByRole("link", { name: /^Nhóm/ }).filter({ visible: true }).first()).toBeVisible();
  await page.getByRole("link", { name: /^Nhóm/ }).filter({ visible: true }).first().click();
  await expect(page.getByText("Quản trị nhóm Sàn BĐS Hải Phòng Land").filter({ visible: true }).first()).toBeVisible();
  // Sáu trang quản trị (mục con Cài đặt vẽ hai lần, một cái ẩn theo breakpoint)
  for (const label of ["Thông tin nhóm", "Thành viên và lời mời", "Mức dùng", "Nhật ký truy cập", "Mẫu tóm tắt dùng chung", "Gói và hóa đơn"]) {
    await expect(page.getByRole("link", { name: label }).filter({ visible: true }).first()).toBeVisible();
  }
  // Không gian Cá nhân: mục Nhóm không hiện
  await page.goto("/");
  await page.getByRole("button", { name: "Đổi không gian làm việc" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Cá nhân/ }).click();
  await expect(page.locator("a[href='/s/s-bds-lan']").first()).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByRole("link", { name: /^Nhóm/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("màn quản trị ghi rõ quản trị không đọc được nội dung buổi riêng tư", async ({ page }) => {
  await toTeamSpace(page);
  await page.goto("/team");
  await expect(page.getByText("Quản trị không đọc được nội dung buổi ghi riêng tư, kể cả Chủ.")).toBeVisible();
});

test("gói Nhóm ở /upgrade với giá theo người và nhật ký truy cập", async ({ page }) => {
  await onboard(page);
  await page.goto("/upgrade");
  const teamCard = page.locator("section", { hasText: "… đ/người/tháng" }).filter({ hasText: "Không gian làm việc chung cho cả nhóm" });
  await expect(teamCard.getByRole("heading", { name: "Nhóm" })).toBeVisible();
  await expect(teamCard.getByText("Nhật ký truy cập ai làm gì")).toBeVisible();
  await expect(teamCard.getByText("Hạn mức phút dùng chung")).toBeVisible();
  await expect(teamCard.getByText("Mẫu tóm tắt dùng chung")).toBeVisible();
});

test("bằng chứng ảnh trang /team, sáng và tối (gộp 4 tổ hợp qua hai dự án)", async ({ page }, testInfo) => {
  await toTeamSpace(page);
  await page.goto("/team");
  await expect(page.getByRole("heading", { name: "Thông tin nhóm" })).toBeVisible();
  const tag = testInfo.project.name;
  await page.screenshot({ path: `test-results/team-${tag}-light.png`, fullPage: true });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `test-results/team-${tag}-dark.png`, fullPage: true });
});

test("nhật ký Xem buổi ghi còn sau khi tải lại trang (review PR #57)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "chỉ cần chạy một lần");
  await onboard(page);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("noteim-mock-db-v1")!);
    d.user.current_workspace_id = "w-hp-land";
    localStorage.setItem("noteim-mock-db-v1", JSON.stringify(d));
  });
  const views = () =>
    page.evaluate(
      () =>
        (JSON.parse(localStorage.getItem("noteim-mock-db-v1")!).audit as Array<{ action: string; target_id: string }>).filter(
          (a) => a.action === "view" && a.target_id === "s-nhom-marina-c",
        ).length,
    );
  const before = await views();
  await page.goto("/s/s-nhom-marina-c");
  await expect(page.getByRole("heading", { name: /Marina C/ }).first()).toBeVisible();
  await page.goto("/team/audit");
  expect(await views()).toBe(before + 1);
  await expect(page.getByText("Hoàng Xem buổi ghi").first()).toBeVisible();
});
