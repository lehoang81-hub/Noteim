import { defineConfig, devices } from "@playwright/test";

/**
 * Bộ kiểm thử trình duyệt (từ M7). Chạy trên bản build:
 *   pnpm build && pnpm start -p 3100   (một cửa sổ)
 *   pnpm e2e                           (cửa sổ khác)
 * Máy không có trình duyệt của Playwright thì đặt PW_CHROMIUM_PATH tới chrome có sẵn.
 * Ảnh chụp, báo cáo nằm trong test-results/ và playwright-report/ (không commit).
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1, // máy agent yếu, chạy tuần tự cho ổn định
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3100",
    locale: "vi-VN",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath, args: ["--disable-dev-shm-usage"] },
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
  ],
});
