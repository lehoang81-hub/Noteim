import type { BrowserContext, Page } from "@playwright/test";

/**
 * Tiện ích dùng chung cho kiểm thử. Viết thêm ở đây thay vì chép vào từng file.
 * Độ trễ giả của dữ liệu là 300 đến 800ms: luôn chờ theo điều kiện (expect, waitFor),
 * không chờ cố định trừ khi đang đợi hiệu ứng.
 */

export type Lang = "vi" | "en" | "ko";

/** Đặt ngôn ngữ giao diện bằng cookie, trước lần tải trang đầu. */
export async function setLocale(context: BrowserContext, baseURL: string, lang: Lang) {
  await context.addCookies([{ name: "noteim-locale", value: lang, url: baseURL }]);
}

/** Người dùng đã làm quen: mở /welcome, bấm Bỏ qua, chờ về thư viện. */
export async function onboard(page: Page) {
  await page.goto("/welcome");
  await page.getByRole("button", { name: /^(Bỏ qua|Skip|건너뛰기)$/ }).first().click();
  await page.waitForURL((u) => u.pathname === "/");
  await page.locator("a[href^='/s/']").first().waitFor();
}

/** Bật cờ thử nghiệm (giống bảng ?debug=1) rồi tải lại. */
export async function setDebugFlags(page: Page, flags: Record<string, unknown>) {
  await page.evaluate((f) => {
    const cur = JSON.parse(localStorage.getItem("noteim-debug") || "{}");
    localStorage.setItem("noteim-debug", JSON.stringify({ ...cur, ...f }));
  }, flags);
  await page.reload();
}

/**
 * Đặt không gian đang dùng của bản giả rồi tải lại (M7-01).
 * Dùng ở bước 2 khi chưa có giao diện đổi không gian; sau bước 3 bài cũ
 * vẫn dùng được vì ghi thẳng vào kho như switchTo của repository.
 */
export async function setCurrentWorkspace(page: Page, id: string) {
  await page.evaluate((wid) => {
    const raw = localStorage.getItem("noteim-mock-db-v1");
    if (!raw) throw new Error("Kho dữ liệu mẫu chưa có — hãy mở trang trước khi đổi không gian");
    const db = JSON.parse(raw);
    if (!db.user) throw new Error("Kho chưa nạp người dùng");
    db.user.current_workspace_id = wid;
    localStorage.setItem("noteim-mock-db-v1", JSON.stringify(db));
  }, id);
  await page.reload();
}

/** Vuốt ngang bằng sự kiện chạm thật (CDP). Không dùng chuột cho cử chỉ. */
export async function touchSwipe(page: Page, x: number, y: number, dx: number, steps = 14) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * i) / steps, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/** Nhấn giữ bằng chạm thật. */
export async function touchHold(page: Page, x: number, y: number, ms = 700) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await page.waitForTimeout(ms);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/** Chạm một lần vào giữa phần tử. */
export async function touchTap(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`Không thấy ${selector}`);
  const cdp = await page.context().newCDPSession(page);
  const p = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/** Ghi lỗi console và lỗi trang; cuối bài kiểm gọi expect(errors).toEqual([]). */
export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

/** Chiều rộng tài liệu, để kiểm tràn ngang. */
export async function scrollWidth(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth);
}
