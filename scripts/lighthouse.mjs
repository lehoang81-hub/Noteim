#!/usr/bin/env node
/**
 * Đo Lighthouse mobile đúng cách cho Noteim (bài học M5, M6):
 * - người dùng ĐÃ làm quen (hồ sơ Chrome riêng, bấm Bỏ qua ở /welcome một lần);
 * - cùng origin với lúc làm quen (đừng trộn localhost và 127.0.0.1);
 * - xóa cache HTTP thật trước MỖI lần (Network.clearBrowserCache qua CDP);
 * - lấy trung vị N lần; báo lỗi nếu finalDisplayedUrl khác route đang đo.
 *
 * Cách dùng (server bản build đang chạy ở BASE):
 *   pnpm lh --base http://localhost:3100 --lang vi --runs 3 / /s/s-bds-lan /record
 * Kết quả in bảng Markdown, kèm dung lượng font và JS.
 * Máy yếu: chạy từng lần một, không chạy song song, không để tiến trình nền.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const BASE = opt("base", "http://localhost:3100");
const LANG = opt("lang", "vi");
const RUNS = Number(opt("runs", "3"));
const CATS = opt("cats", "performance").split(",");
const routes = args.length ? args : ["/"];

const chromePath = process.env.PW_CHROMIUM_PATH || process.env.CHROME_PATH || chromium.executablePath();
const userDataDir = mkdtempSync(path.join(tmpdir(), "noteim-lh-"));
const chrome = await chromeLauncher.launch({
  chromePath,
  userDataDir,
  chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", `--lang=${LANG}`],
});

// Làm quen một lần trong hồ sơ này.
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${chrome.port}`);
const ctx = browser.contexts()[0];
await ctx.addCookies([{ name: "noteim-locale", value: LANG, url: BASE }]);
const warm = await ctx.newPage();
await warm.goto(`${BASE}/welcome`);
await warm.getByRole("button", { name: /^(Bỏ qua|Skip|건너뛰기)$/ }).first().click();
await warm.waitForURL((u) => u.pathname === "/");
await warm.locator("a[href^='/s/']").first().waitFor();
const cdp = await ctx.newCDPSession(warm);

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const rows = [];
for (const route of routes) {
  const res = [];
  for (let i = 0; i < RUNS; i++) {
    await cdp.send("Network.clearBrowserCache");
    const r = await lighthouse(`${BASE}${route}`, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: CATS,
      disableStorageReset: true,
    });
    const lhr = r.lhr;
    const final = new URL(lhr.finalDisplayedUrl).pathname;
    if (final !== route.split("?")[0]) throw new Error(`Đo nhầm màn: ${route} thành ${final}`);
    const reqs = lhr.audits["network-requests"].details.items;
    const kb = (t) => Math.round(reqs.filter((x) => x.resourceType === t).reduce((s, x) => s + x.transferSize, 0) / 1024);
    res.push({
      perf: Math.round((lhr.categories.performance?.score ?? 0) * 100),
      a11y: lhr.categories.accessibility ? Math.round(lhr.categories.accessibility.score * 100) : null,
      lcp: lhr.audits["largest-contentful-paint"].numericValue / 1000,
      tbt: lhr.audits["total-blocking-time"].numericValue,
      cls: lhr.audits["cumulative-layout-shift"].numericValue,
      font: kb("Font"),
      js: kb("Script"),
    });
    process.stderr.write(`${route} lần ${i + 1}: ${res.at(-1).perf}\n`);
  }
  const m = (k) => median(res.map((x) => x[k]));
  rows.push(`| ${route} | ${m("perf")} | ${CATS.includes("accessibility") ? m("a11y") : "-"} | ${m("lcp").toFixed(2)} s | ${Math.round(m("tbt"))} ms | ${m("cls").toFixed(3)} | ${m("font")} KB | ${m("js")} KB |`);
}

console.log(`Lighthouse mobile, giao diện ${LANG}, trung vị ${RUNS} lần, đã làm quen, xóa cache mỗi lần\n`);
console.log("| Route | Perf | A11y | LCP | TBT | CLS | Font | JS |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const r of rows) console.log(r);

await browser.close();
await chrome.kill();
