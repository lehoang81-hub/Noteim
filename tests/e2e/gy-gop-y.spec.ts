import { expect, test } from "@playwright/test";
import { collectErrors, onboard, setDebugFlags } from "./helpers";

/*
 * Góp ý vòng 1 (issue #75, PR #76): kiểm các tính năng mới ở mức mockup.
 * - G1: tab Hồ sơ trong Thư viện, danh sách hồ sơ theo loại nghề.
 * - G2: chi tiết hồ sơ /f/[id], đếm buổi, tab Hỏi AI của gói Free bị khóa.
 * - G3: Hỏi AI hồ sơ (Pro): trả lời ghép từ các buổi, dẫn chứng kèm tên buổi
 *   và mốc giây, bấm nhảy tới buổi đó đúng mốc (tab Lời).
 * - G4: biên nhận đồng ý ghi âm lưu trong buổi, xem được đầy đủ ai, lúc nào,
 *   cách nào, câu thông báo đã phát.
 * - G5: mẫu "Khám theo SOAP" hiện trong Cài đặt, đủ bốn phần S, O, A, P.
 */

test.describe("góp ý vòng 1: hồ sơ theo nghề", () => {
  test("G1: tab Hồ sơ hiện danh sách hồ sơ, mở hồ sơ thấy đủ buổi", async ({ page }) => {
    const errors = collectErrors(page);
    await onboard(page);

    await page.getByRole("button", { name: "Hồ sơ" }).first().click();
    await page.getByRole("heading", { name: "Hồ sơ" }).waitFor();

    // Hồ sơ mẫu theo bốn loại nghề, kể cả hồ sơ gom hai buổi
    await expect(page.getByText("Khách cần chốt tháng 12")).toBeVisible();
    await expect(page.getByText("Bà Nguyễn Thị Hòa")).toBeVisible();
    // Nhãn loại nghề trùng chữ trong dòng giải thích của trang nên lấy kết quả đầu
    await expect(page.getByText("Vụ việc").first()).toBeVisible();
    await expect(page.getByText("Công trình").first()).toBeVisible();

    // Mở hồ sơ hai buổi: đầu trang đếm đúng, danh sách đủ hai buổi
    await page.getByText("Khách cần chốt tháng 12").first().click();
    await expect(page.getByRole("heading", { name: "Khách cần chốt tháng 12" })).toBeVisible();
    await expect(page.getByText("Gặp chị Lan, căn 2PN Vinhomes Marina")).toBeVisible();
    await expect(page.getByText("Gặp anh Tuấn, kế hoạch tháng 12")).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("G2: Hỏi AI hồ sơ với gói Free hiện khóa và lời mời nâng cấp", async ({ page }) => {
    const errors = collectErrors(page);
    await onboard(page);
    await page.goto("/f/f-khach-chot");
    await page.getByRole("tab", { name: "Hỏi AI" }).click();

    await expect(page.getByText(/Hỏi xuyên mọi buổi ghi có ở gói Pro/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Xem gói Pro" })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("G3: Hỏi AI hồ sơ (Pro) trả lời xuyên buổi, dẫn chứng nhảy đúng mốc", async ({ page }) => {
    const errors = collectErrors(page);
    await onboard(page);
    await setDebugFlags(page, { plan: "pro" });
    await page.goto("/f/f-khach-chot");
    await page.getByRole("tab", { name: "Hỏi AI" }).click();

    await page.getByRole("button", { name: "Tổng hợp tình trạng hồ sơ đến nay" }).click();
    // Câu trả lời ghép từ các buổi của hồ sơ, có chip dẫn chứng kèm mốc
    await expect(page.getByText(/tìm thấy .* đoạn khớp ở .* buổi/)).toBeVisible({ timeout: 15_000 });
    const cite = page.getByRole("button", { name: /Mở buổi/ }).first();
    await expect(cite).toBeVisible();

    // Bấm dẫn chứng: nhảy tới buổi đó đúng mốc, mở tab Lời
    await cite.click();
    await page.waitForURL((u) => u.pathname.startsWith("/s/s-"));
    await expect(page.getByRole("heading", { name: /Gặp chị Lan|Gặp anh Tuấn/ })).toBeVisible();

    expect(errors).toEqual([]);
  });
});

test.describe("góp ý vòng 1: biên nhận đồng ý và mẫu SOAP", () => {
  test("G4: buổi mẫu hiện biên nhận đồng ý, mở xem đủ ai, lúc nào, cách nào", async ({ page }) => {
    const errors = collectErrors(page);
    // Làm quen trước: chưa làm quen thì mọi trang dẫn về /welcome
    await onboard(page);
    await page.goto("/s/s-kts-lachtray");

    // Dòng biên nhận dưới thông tin buổi
    const line = page.getByRole("button", { name: /đồng ý ghi âm lúc/ });
    await expect(line).toBeVisible();

    // Mở bảng biên nhận: đủ bốn dữ kiện, kể cả câu thông báo đã phát.
    // Thu phạm vi vào hộp thoại vì dòng nền của buổi cũng chứa cùng chữ.
    await line.click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name: "Biên nhận đồng ý ghi âm" })).toBeVisible();
    await expect(sheet.getByText("Anh Hùng, Anh Nam")).toBeVisible();
    await expect(sheet.getByText("bấm nút đồng ý trước khi ghi")).toBeVisible();
    await expect(sheet.getByText(/Buổi làm việc này được ghi âm để lập biên bản/)).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("G5: mẫu Khám theo SOAP có trong Cài đặt, đủ bốn phần S, O, A, P", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/settings/mau-tom-tat");

    const soap = page.getByRole("button", { name: /Khám theo SOAP/ });
    await expect(soap).toBeVisible();
    await soap.click();
    await expect(page.getByText("S. Bệnh nhân kể (chủ quan)")).toBeVisible();
    await expect(page.getByText("O. Thăm khám (khách quan)")).toBeVisible();
    await expect(page.getByText("A. Đánh giá")).toBeVisible();
    await expect(page.getByText("P. Kế hoạch xử trí")).toBeVisible();

    expect(errors).toEqual([]);
  });
});
