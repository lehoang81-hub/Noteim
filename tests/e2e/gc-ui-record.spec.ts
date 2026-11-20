import { test, expect } from "@playwright/test";
import { setDebugFlags } from "./helpers";

/**
 * GC-03 (b4/gc-03-ui-recording) — giao diện Gap Check trên màn ghi âm.
 * Server phải chạy với stub xác định:
 *   GAP_CHECK_FAKE=1 pnpm start -p 3100
 * Stub trả theo độ dài transcript (> 200 ký tự → mọi ô filled=true; ngược lại
 * filled=false, không bịa evidence). API spec chạy đúng một project (phone).
 * Trình duyệt không có micro thật: bấm "Cho phép micro" bị chối → trang giải
 * thích → "Dùng thử với âm thanh mẫu" là cách bắt đầu ghi trong kiểm thử.
 */

test.beforeEach(() => {
  test.skip(test.info().project.name !== "phone", "Spec màn ghi âm chỉ chạy một project");
});

async function batDauGhi(page: import("@playwright/test").Page) {
  await page.goto("/record");
  await page.getByRole("button", { name: "Cho phép micro" }).click();
  await page.getByRole("button", { name: "Dùng thử với âm thanh mẫu" }).click();
  // Đang ghi: hàng nút có "Kiểm tra thiếu" cạnh "Kết thúc buổi ghi"
  await expect(page.getByRole("button", { name: "Kiểm tra thiếu" })).toBeVisible();
}
test("rà với transcript rỗng: thiếu hết, gợi ý nói thêm, chép được vào ghi chú", async ({ page }) => {
  await batDauGhi(page);
  // Bấm ngay khi chưa tới câu đầu của kịch bản demo (giây 4) → transcript rỗng
  await page.getByRole("button", { name: "Kiểm tra thiếu" }).click();
  await expect(page.getByRole("heading", { name: "Rà soát điểm thiếu" })).toBeVisible();
  await expect(page.getByText("Còn thiếu 4 thông tin")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Chưa nhận được lời thoại nào để rà")).toBeVisible();
  // Chép câu hỏi lái vào ghi chú nhanh: nút đổi thành "Đã chép" và ghi chú xuất hiện
  const sheet = page.getByRole("dialog", { name: "Rà soát điểm thiếu" });
  await page.getByRole("button", { name: "Chép vào ghi chú nhanh" }).first().click();
  await expect(page.getByRole("button", { name: "Đã chép vào ghi chú" })).toBeVisible();
  await expect(sheet.getByText("Căn này anh/chị ưu tiên để gia đình ở thực hay hướng tới cho thuê")).toBeVisible();
  // Hỏi AI trên thư mục (GC-04): câu hỏi vào hàng chờ, hiện trong Hỏi AI sau khi lưu
  await page.getByRole("button", { name: "Hỏi AI trên thư mục" }).first().click();
  await expect(page.getByText("Đã chuyển câu hỏi sang Hỏi AI")).toBeVisible();
  // "Rà lại sau khi nói tiếp": về màn ghi, không qua cổng chốt
  await page.getByRole("button", { name: "Rà lại sau khi nói tiếp" }).click();
  await expect(page.getByRole("heading", { name: "Rà soát điểm thiếu" })).toHaveCount(0);
  await expect(page.getByText("Kiểm tra thiếu thông tin trước khi lưu?")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Kết thúc buổi ghi" })).toBeVisible();
});

test("rà sau khi nói đủ nội dung demo: băng xanh, chốt buổi chuyển sang xử lý", async ({ page }) => {
  await page.goto("/"); // setDebugFlags cần một trang đã mở
  await setDebugFlags(page, { recordSpeed30: true }); // đồng hồ ghi x30 cho nhanh
  await batDauGhi(page);
  // 6 giây thật = 180 giây ghi: đủ cả 20 câu demo
  await page.waitForTimeout(6_000);
  await page.getByRole("button", { name: "Kiểm tra thiếu" }).click();
  await expect(page.getByText("Đủ dữ liệu, có thể chốt buổi")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Chốt buổi" }).click();
  await page.waitForURL(/\/s\/s-new-.*\/processing$/);
  await expect(page.getByText("Đã lưu bản ghi âm")).toBeVisible();
});

test("cổng chốt buổi: giữ Dừng hiện thanh hỏi, Ghi tiếp hủy, Lưu luôn kết thúc", async ({ page }) => {
  await batDauGhi(page);
  const ketThuc = page.getByRole("button", { name: "Kết thúc buổi ghi" });
  // Giữ 1,2 giây (nút giữ 0,8 giây mới nhả sự kiện)
  const box = await ketThuc.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  await expect(page.getByText("Kiểm tra thiếu thông tin trước khi lưu?")).toBeVisible();
  // Vẫn đang ghi (đồng hồ vẫn hiện); Ghi tiếp hủy cổng
  await page.getByRole("button", { name: "Ghi tiếp" }).click();
  await expect(page.getByText("Kiểm tra thiếu thông tin trước khi lưu?")).toHaveCount(0);
  // Giữ lại và Lưu luôn
  const box2 = await ketThuc.boundingBox();
  await page.mouse.move(box2!.x + box2!.width / 2, box2!.y + box2!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  await expect(page.getByText("Kiểm tra thiếu thông tin trước khi lưu?")).toBeVisible();
  await page.getByRole("button", { name: "Lưu luôn" }).click();
  await page.waitForURL(/\/s\/s-new-.*\/processing$/);
  await expect(page.getByText("Đã lưu bản ghi âm")).toBeVisible();
});

test("cờ thử nghiệm: ép lỗi và ép hết lượt miễn phí đều có hướng dẫn rõ", async ({ page }) => {
  await page.goto("/");
  await setDebugFlags(page, { gapCheckError: true });
  await batDauGhi(page);
  await page.getByRole("button", { name: "Kiểm tra thiếu" }).click();
  await expect(page.getByText("Chưa rà được, thử lại")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Thử lại" }).click();
  await expect(page.getByText("Chưa rà được, thử lại")).toBeVisible();
  await page.getByRole("button", { name: "Đóng" }).click();
  await expect(page.getByRole("button", { name: "Kiểm tra thiếu" })).toBeVisible();

  await setDebugFlags(page, { gapCheckError: false, gapCheckRateLimited: true });
  // Buổi ghi khôi phục ở trạng thái tạm dừng sau khi tải lại trang
  await page.getByRole("button", { name: "Ghi tiếp" }).click();
  await page.getByRole("button", { name: "Kiểm tra thiếu" }).click();
  await expect(page.getByText("Đã hết lượt rà miễn phí trong ngày")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Đóng" }).click();
  await expect(page.getByRole("button", { name: "Kiểm tra thiếu" })).toBeVisible();
});

test("bấm liên tiếp 3 lần vào Kiểm tra thiếu: chỉ gửi 1 lượt rà, nút khóa khi sheet mở (sửa sau dry-run B4)", async ({ page }) => {
  await batDauGhi(page);
  // Đếm lượt gọi API rà thiếu của buổi live
  let gapRequests = 0;
  page.on("request", (req) => {
    if (req.method() === "POST" && /\/api\/sessions\/[^/]+\/gap-check$/.test(req.url())) gapRequests += 1;
  });
  const nut = page.getByRole("button", { name: "Kiểm tra thiếu" });
  await nut.click(); // cú bấm đầu mở sheet và bắt đầu rà
  // Sheet mở: phần nền bị aria-hidden nên định vị nút bằng CSS; 2 cú bấm còn
  // lại của đợt đúp gửi sự kiện thẳng, không chờ giao diện kịp phản hồi — đúng
  // kịch bản người dùng đập nút 3 lần/giây
  const nutCss = page.locator("main button:has-text(\"Kiểm tra thiếu\")");
  await nutCss.dispatchEvent("click");
  await nutCss.dispatchEvent("click");
  await expect(page.getByRole("heading", { name: "Rà soát điểm thiếu" })).toBeVisible();
  // Nút nguồn bị khóa trong khi lượt rà đang chạy (aria-hidden không cản kiểm thuộc tính)
  await expect(nutCss).toHaveAttribute("disabled", "");
  await expect(page.getByText("Còn thiếu 4 thông tin")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500); // nếu còn lỗ hổng, request trùng đã kịp bay ra
  expect(gapRequests).toBe(1);
});
