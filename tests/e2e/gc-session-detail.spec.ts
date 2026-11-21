import { test, expect } from "@playwright/test";

/**
 * GC-04 (b4/gc-04-session-detail) — checklist "Cần bổ sung sau buổi" ở màn
 * chi tiết và luồng Hỏi AI trên thư mục (đặc tả v1.1 §4.3, §4.5).
 * Server phải chạy với stub xác định, như GC-03:
 *   GAP_CHECK_FAKE=1 pnpm start -p 3100
 * Stub với transcript rỗng trả missing_priorities = 2 ô đầu của mẫu bất động
 * sản; câu lái đầu là câu hỏi của ô "Mục đích sử dụng". Chạy một project (phone).
 */

test.beforeEach(() => {
  test.skip(test.info().project.name !== "phone", "Spec màn ghi chỉ chạy một project");
});

const CAUHOI_1 = "Căn này anh/chị ưu tiên để gia đình ở thực hay hướng tới cho thuê";
const CHIP_CAPTION = "Chuyển từ rà thiếu của buổi này, bấm để gửi";

/** Context mới chưa làm quen: bố cục thư viện chuyển tới /welcome nếu chưa.
 * Làm quen bằng "Bỏ qua" trước, sau đó mới ghi và vào chi tiết buổi. */
async function lamQuen(page: import("@playwright/test").Page) {
  await page.goto("/welcome");
  await page.getByRole("button", { name: "Bỏ qua" }).click();
  await page.waitForURL((u) => u.pathname === "/");
}

/** Ghi âm mẫu, rà ngay khi transcript rỗng (thiếu hết, 2 mục ưu tiên từ stub). */
async function ghiVaRaThieu(page: import("@playwright/test").Page) {
  await lamQuen(page);
  await page.goto("/record");
  await page.getByRole("button", { name: "Cho phép micro" }).click();
  await page.getByRole("button", { name: "Dùng thử với âm thanh mẫu" }).click();
  await expect(page.getByRole("button", { name: "Kiểm tra thiếu" })).toBeVisible();
  await page.getByRole("button", { name: "Kiểm tra thiếu" }).click();
  await expect(page.getByText("Còn thiếu 4 thông tin")).toBeVisible({ timeout: 15_000 });
}

/** Rời sheet, giữ nút Dừng và "Lưu luôn", chờ xử lý xong vào màn chi tiết. */
async function luuBuoi(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Rà lại sau khi nói tiếp" }).click();
  const ketThuc = page.getByRole("button", { name: "Kết thúc buổi ghi" });
  const box = await ketThuc.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  await page.getByRole("button", { name: "Lưu luôn" }).click();
  await page.waitForURL(/\/s\/s-new-.*\/processing$/);
  // Xử lý giả 6 bước × 1,6 giây rồi tự vào chi tiết buổi
  await page.waitForURL(/\/s\/s-new-\d+$/, { timeout: 30_000 });
  await expect(page.getByRole("tab", { name: "Tóm tắt" })).toBeVisible({ timeout: 15_000 });
}

test("checklist sinh từ lần rà gần nhất: chép ghi chú, tick mờ dần tự ẩn, tải lại vẫn ẩn", async ({ page }) => {
  await ghiVaRaThieu(page);
  // Đưa câu hỏi đầu sang Hỏi AI (hàng chờ cho bài sau), rồi lưu buổi
  await page.getByRole("button", { name: "Hỏi AI trên thư mục" }).first().click();
  await expect(page.getByText("Đã chuyển câu hỏi sang Hỏi AI")).toBeVisible();
  await luuBuoi(page);

  // Checklist đứng trên các tab với các mục từ lần rà gần nhất
  await expect(page.getByText("Cần bổ sung sau buổi")).toBeVisible();
  await expect(page.getByText(CAUHOI_1).first()).toBeVisible();

  // Chép vào ghi chú nhanh: nút đổi nhãn, ghi chú vào Tóm tắt
  await page.getByRole("button", { name: "Chép vào ghi chú nhanh" }).first().click();
  await expect(page.getByRole("button", { name: "Đã chép vào ghi chú" }).first()).toBeVisible();
  await expect(page.getByText(CAUHOI_1)).toHaveCount(2, { timeout: 15_000 }); // checklist + ghi chú trong Tóm tắt

  // Tick từng mục: mờ dần và tự ẩn; hết mục là cả checklist ẩn
  await page.getByRole("button", { name: "Đã bổ sung xong" }).first().click();
  await page.getByRole("button", { name: "Đã bổ sung xong" }).last().click();
  await expect(page.getByText("Cần bổ sung sau buổi")).not.toBeVisible({ timeout: 3_000 });

  // Tải lại: checklist vẫn ẩn (đã lưu danh sách ô xong), ghi chú vẫn còn
  await page.reload();
  await expect(page.getByText("Cần bổ sung sau buổi")).not.toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(CAUHOI_1)).toHaveCount(1);
});

test("câu hỏi chờ từ sheet thành chip trong Hỏi AI: bấm gửi, chip gỡ, tải lại còn lịch sử", async ({ page }) => {
  await ghiVaRaThieu(page);
  await page.getByRole("button", { name: "Hỏi AI trên thư mục" }).first().click();
  await luuBuoi(page);

  await page.getByRole("tab", { name: "Hỏi AI" }).click();
  await expect(page.getByText(CHIP_CAPTION)).toBeVisible();
  // Bấm chip là gửi: bong bóng hỏi + khối trả lời, chip gỡ khỏi kho
  await page.getByRole("button", { name: CAUHOI_1 }).click();
  await expect(page.getByText(CAUHOI_1).first()).toBeVisible();
  await expect(page.getByText("Bản mockup chỉ trả lời được các câu gợi ý.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: CAUHOI_1 })).toHaveCount(0);

  await page.reload();
  await page.getByRole("tab", { name: "Hỏi AI" }).click();
  await expect(page.getByText(CHIP_CAPTION)).toHaveCount(0);
  await expect(page.getByText(CAUHOI_1).first()).toBeVisible();
});

test("checklist bấm Hỏi AI trên thư mục: chuyển tab và hỏi thẳng", async ({ page }) => {
  await ghiVaRaThieu(page);
  await luuBuoi(page);

  await expect(page.getByText("Cần bổ sung sau buổi")).toBeVisible();
  await page.getByRole("button", { name: "Hỏi AI trên thư mục" }).first().click();
  await page.waitForURL(/tab=ai/);
  await expect(page.getByText(CAUHOI_1).first()).toBeVisible();
  await expect(page.getByText("Bản mockup chỉ trả lời được các câu gợi ý.")).toBeVisible({ timeout: 15_000 });
  // Checklist không có câu chờ nào trong Hỏi AI (chỉ chip mới là câu chờ)
  await expect(page.getByText(CHIP_CAPTION)).toHaveCount(0);
});
