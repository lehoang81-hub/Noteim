import { chromium, devices } from "@playwright/test";

const base = process.env.E2E_BASE_URL || "http://localhost:3100";
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ["--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });

async function main() {
  const ctx = await browser.newContext({ ...devices["Pixel 7"], locale: "vi-VN" });
  const page = await ctx.newPage();
  await page.goto(base + "/login", { timeout: 30000 });
  const btn = page.getByRole("button", { name: /Đăng nhập thử/ }).first();
  await btn.waitFor({ timeout: 20000 });
  await Promise.all([page.waitForURL((u) => u.pathname === "/"), btn.click()]);
  await page.goto(base + "/welcome", { timeout: 30000 });
  const skip = page.getByRole("button", { name: /Bỏ qua|Skip|건너뛰기/ });
  await skip.waitFor({ timeout: 20000 });
  await Promise.all([page.waitForURL((u) => u.pathname === "/"), skip.click()]);

  const r = await page.request.post(base + "/api/data/sessions", { data: { kind: "import", input: { file_name: "probe.m4a", duration_sec: 65, template_id: "tpl-realestate", language: "vi" } } });
  const sessionId = (await r.json()).id;
  const presign = await page.request.post(base + "/api/audio/presign", { data: { session_id: sessionId, content_type: "audio/webm", size: 1200 } });
  const { upload_url } = await presign.json();
  await page.request.put(upload_url.startsWith("http") ? upload_url : base + upload_url, { data: Buffer.alloc(1200, 7), headers: { "Content-Type": "audio/webm" } });
  await page.request.post(base + "/api/audio/complete", { data: { session_id: sessionId, content_type: "audio/webm", size: 1200 } });
  for (let i = 0; i < 12; i++) {
    const pr = await page.request.post(`${base}/api/sessions/${sessionId}/process`, { data: {} });
    const st = await pr.json();
    if (st.status !== "processing") break;
  }

  const inputSel = "input[type=search], input[data-search-input=true]";
  await page.goto(`${base}/s/${sessionId}?tab=transcript`, { timeout: 30000 });
  const input = page.locator(inputSel).first();
  await input.waitFor({ timeout: 20000 });
  await page.getByText("bảng tính vay 50%").first().waitFor({ timeout: 20000 });

  for (const word of ["căn", "Lê Chân", "lãi suất 8"]) {
    await input.click();
    await page.keyboard.type(word, { delay: 60 });
    await page.waitForTimeout(300);
    console.log("type", JSON.stringify(word), "→ dom =", JSON.stringify(await input.inputValue()));
    const clearBtn = page.getByRole("button", { name: /Xóa từ tìm/ });
    if (await clearBtn.count()) await clearBtn.click(); else await input.fill("");
    await page.waitForTimeout(150);
  }
  await page.request.delete(`${base}/api/data/sessions/${sessionId}`);
  await ctx.close();
}
await main();
await browser.close();
