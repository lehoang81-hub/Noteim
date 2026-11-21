import { test, expect } from "@playwright/test";

/**
 * GC-05 (b4/gc-05-folder-template) — gắn mẫu theo thư mục (đặc tả v1.1 §4.7)
 * và luồng requires_consent (đặc tả v1.1 §4.6). Server chạy stub như GC-03:
 *   GAP_CHECK_FAKE=1 GAP_CHECK_FREE_DAILY=3 pnpm start -p 3100
 * Mẫu nhạy cảm (requires_consent) trong app là Buổi khám (bác sĩ) và Tư vấn
 * pháp lý (luật sư). Chạy một project (phone).
 */

test.beforeEach(() => {
  test.skip(test.info().project.name !== "phone", "Spec màn ghi chỉ chạy một project");
});

/** Context mới chưa làm quen: bố cục thư viện chuyển tới /welcome nếu chưa. */
async function lamQuen(page: import("@playwright/test").Page) {
  await page.goto("/welcome");
  await page.getByRole("button", { name: "Bỏ qua" }).click();
  await page.waitForURL((u) => u.pathname === "/");
}

/** Đến màn ghi với bảng đồng ý đang mở: đặt cờ "đã từng cấp micro" để màn
 * ghi bỏ qua bảng xin quyền và mở bảng đồng ý (máy kiểm thử không có micro). */
async function toiBangDongY(page: import("@playwright/test").Page) {
  await lamQuen(page);
  await page.evaluate(() => localStorage.setItem("noteim-mic-granted", "1"));
  await page.goto("/record");
  await expect(page.getByRole("heading", { name: "Mọi người đã đồng ý ghi âm?" })).toBeVisible({ timeout: 15_000 });
}

async function luuBuoi(page: import("@playwright/test").Page) {
  const ketThuc = page.getByRole("button", { name: "Kết thúc buổi ghi" });
  const box = await ketThuc.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  await page.getByRole("button", { name: "Lưu luôn" }).click();
  await page.waitForURL(/\/s\/s-new-.*\/processing$/);
  await page.waitForURL(/\/s\/s-new-\d+$/, { timeout: 30_000 });
  await expect(page.getByRole("tab", { name: "Tóm tắt" })).toBeVisible({ timeout: 15_000 });
}

test("tạo thư mục chọn nghề: danh sách hiện mẫu kế thừa", async ({ page }) => {
  await lamQuen(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Thư mục" }).click();
  await expect(page.getByRole("heading", { name: "Thư mục" })).toBeVisible();
  // Thư mục mẫu có sẵn: gắn mẫu nghề, đếm buổi
  await expect(page.getByText("Kế thừa mẫu Buổi khám")).toBeVisible();

  await page.getByRole("button", { name: "Tạo thư mục" }).click();
  await page.getByRole("textbox", { name: "Tên thư mục" }).fill("Căn hộ 12A của anh Tú");
  await page.getByRole("textbox", { name: "Mã hồ sơ (không bắt buộc)" }).fill("12A");
  await page.getByRole("radio", { name: "Buổi khám" }).click();
  await page.getByRole("button", { name: "Lưu thư mục" }).click();
  await expect(page.getByText("Đã lưu thư mục")).toBeVisible();
  await expect(page.getByText("Căn hộ 12A của anh Tú")).toBeVisible();
  await expect(page.getByText("Kế thừa mẫu Buổi khám")).toHaveCount(2);
});

test("mẫu nhạy cảm chặn ghi đến khi có biên nhận; biên nhận hiện ở chi tiết buổi", async ({ page }) => {
  await toiBangDongY(page);
  // Chọn thư mục nghề bác sĩ: mẫu kế thừa là Buổi khám (requires_consent)
  await page.getByRole("radio", { name: "Bệnh nhân Trần Văn B" }).click();
  await expect(page.getByText("Mẫu này cho nghề nhạy cảm")).toBeVisible();
  const batDau = page.getByRole("button", { name: "Đã đồng ý, ghi" });
  await expect(batDau).toBeDisabled(); // chưa ghi ai đồng ý
  // Tự đóng 3 giây phải tắt với mẫu nhạy cảm: chờ 4 giây vẫn còn bảng
  await page.waitForTimeout(4000);
  await expect(page.getByRole("heading", { name: "Mọi người đã đồng ý ghi âm?" })).toBeVisible();
  await page.getByRole("textbox", { name: "Ai đồng ý" }).fill("bệnh nhân Trần Văn B");
  await batDau.click();
  // Đang ghi: mẫu kế thừa hiện ở đầu màn
  await expect(page.getByRole("button", { name: "Đổi mẫu ghi âm" })).toHaveText(/Buổi khám/);
  await luuBuoi(page);
  await expect(page.getByText("Biên nhận đồng ý: bệnh nhân Trần Văn B")).toBeVisible();
});

test("đổi mẫu giữa buổi sang mẫu nhạy cảm: Bỏ giữ mẫu cũ, đồng ý là đổi", async ({ page }) => {
  await toiBangDongY(page);
  // Không chọn thư mục, mẫu mặc định là Gặp khách (không nhạy cảm): tự đóng sau 3 giây
  await page.waitForTimeout(3500);
  await expect(page.getByRole("button", { name: "Kết thúc buổi ghi" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Đổi mẫu ghi âm" })).toHaveText(/Gặp khách/);

  await page.getByRole("button", { name: "Đổi mẫu ghi âm" }).click();
  await page.getByRole("button", { name: "Buổi khám" }).click();
  await expect(page.getByRole("heading", { name: "Biên nhận đồng ý ghi âm" })).toBeVisible();
  await page.getByRole("textbox", { name: "Ai đồng ý" }).fill("bệnh nhân Trần Văn B");
  await page.getByRole("button", { name: "Bỏ" }).click();
  // Giữ mẫu cũ, mẫu chưa đổi
  await expect(page.getByRole("button", { name: "Đổi mẫu ghi âm" })).toHaveText(/Gặp khách/);

  await page.getByRole("button", { name: "Đổi mẫu ghi âm" }).click();
  await page.getByRole("button", { name: "Buổi khám" }).click();
  await page.getByRole("textbox", { name: "Ai đồng ý" }).fill("bệnh nhân Trần Văn B");
  await page.getByRole("button", { name: "Đồng ý và dùng mẫu này" }).click();
  await expect(page.getByRole("button", { name: "Đổi mẫu ghi âm" })).toHaveText(/Buổi khám/);
  // Đổi qua mẫu thường rồi về mẫu nhạy cảm lần nữa không hỏi lại (đã có biên nhận)
  await page.getByRole("button", { name: "Đổi mẫu ghi âm" }).click();
  await page.getByRole("button", { name: "Gặp khách" }).click();
  await expect(page.getByRole("button", { name: "Đổi mẫu ghi âm" })).toHaveText(/Gặp khách/);
  await page.getByRole("button", { name: "Đổi mẫu ghi âm" }).click();
  await page.getByRole("button", { name: "Buổi khám" }).click();
  await expect(page.getByRole("button", { name: "Đổi mẫu ghi âm" })).toHaveText(/Buổi khám/);
});
