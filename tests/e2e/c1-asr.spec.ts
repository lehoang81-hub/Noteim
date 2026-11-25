import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/*
 * C1-05 — nội dung thật cho buổi có băng: Soniox (giả) → bản chữ có người
 * nói, Gemini (giả) → tóm tắt/việc cần làm đúng cấu trúc màn chi tiết.
 *
 * Máy chủ phải chạy với R2_FAKE=1 + SONIOX_FAKE=1 + GEMINI_FAKE=1 + AUTH_FAKE
 * + DATABASE_URL. Đọc /api/data/mode để tự bỏ qua khi thiếu cấu hình — phần
 * chưa kiểm chứng được ghi rõ ở docs/LOG.md, không bịa kết quả.
 *
 * Kết quả giả là CỐ ĐỊNH (lib/data/server/soniox.ts FAKE_LINES + summarize.ts
 * fakeSummaryPlan) nên bài kiểm tra đối chiếu được: tóm tắt phải nhắc đúng
 * số liệu có trong bản chữ giả (4,2 tỷ, 15/11, 7 phần trăm) — không bịa thêm.
 *
 * Nhóm bài:
 * - Quyền: người B không đẩy được luồng của người A (403), ẩn danh 401.
 * - Luồng done: complete → process từng bước → bản chữ + tóm tắt + việc cần
 *   làm đúng hình dạng màn chi tiết, mốc thời gian bấm nghe lại được.
 * - Quota: buổi 91 phút với gói Free bị chặn rõ, không gọi nhận dạng.
 * - failed → Thử lại: buổi tiêu đề có [fail] lỗi lần đầu, thử lại thì xong.
 * - Cron asr-retry: sai bí mật 401, đúng bí mật trả báo cáo quét.
 * - Luồng UI ghi thật: sau processing màn chi tiết hiện tóm tắt từ kho giả.
 */

type Mode = {
  dataSource: string;
  databaseConfigured: boolean;
  authFake: boolean;
  r2: boolean;
  r2Fake: boolean;
  sonioxFake: boolean;
  geminiFake: boolean;
};

const CRON_SECRET = process.env.E2E_CRON_SECRET || "cron-thu-e2e";

/* Micro giả của Chromium cho luồng ghi thật (nhóm cuối file) */
test.use({
  launchOptions: {
    executablePath: process.env.PW_CHROMIUM_PATH || undefined,
    args: [
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  },
});

let mode: Mode;

test.beforeAll(async ({ request }) => {
  const res = await request.get("/api/data/mode");
  mode = (await res.json()) as Mode;
});

function canRun(): boolean {
  return mode.dataSource === "remote" && mode.databaseConfigured && mode.authFake && mode.r2 && mode.sonioxFake && mode.geminiFake;
}

async function dangNhapDemo(page: Page) {
  await page.goto("/login");
  const btn = page.getByRole("button", { name: /Đăng nhập thử/ }).first();
  await expect(btn).toBeVisible();
  await Promise.all([page.waitForURL((u) => u.pathname === "/"), btn.click()]);
  await page.goto("/welcome");
  const skip = page.getByRole("button", { name: /Bỏ qua|Skip|건너뛰기/ });
  await expect(skip).toBeVisible();
  await Promise.all([page.waitForURL((u) => u.pathname === "/"), skip.click()]);
}

async function dangNhapNguoiB(page: Page) {
  await page.goto("/login");
  const btn = page.getByTestId("login-demo-b");
  await expect(btn).toBeVisible();
  await Promise.all([page.waitForURL((u) => u.pathname === "/"), btn.click()]);
  await page.goto("/welcome");
  const skip = page.getByRole("button", { name: /Bỏ qua|Skip|건너뛰기/ });
  await expect(skip).toBeVisible();
  await Promise.all([page.waitForURL((u) => u.pathname === "/"), skip.click()]);
}

/** Tạo buổi qua API (kiểu nhập file — tiêu đề lấy từ tên file bỏ đuôi). */
async function taoBuoi(request: APIRequestContext, title: string, durationSec = 65): Promise<string> {
  const res = await request.post("/api/data/sessions", {
    data: {
      kind: "import",
      input: { file_name: `${title}.m4a`, duration_sec: durationSec, template_id: "tpl-realestate", language: "vi" },
    },
  });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { id: string }).id;
}

/** Luồng tải lên đúng như trình duyệt làm: presign → PUT thẳng → complete. */
async function taiLen(request: APIRequestContext, sessionId: string, size = 1200): Promise<void> {
  const presign = await request.post("/api/audio/presign", {
    data: { session_id: sessionId, content_type: "audio/webm", size },
  });
  expect(presign.status()).toBe(200);
  const { upload_url: uploadUrl } = (await presign.json()) as { upload_url: string };
  const put = await request.put(uploadUrl, {
    data: Buffer.alloc(size, 7),
    headers: { "Content-Type": "audio/webm" },
  });
  expect(put.status()).toBe(200);
  const complete = await request.post("/api/audio/complete", {
    data: { session_id: sessionId, content_type: "audio/webm", size },
  });
  expect(complete.status()).toBe(200);
}

type ProcessState = { status: string; step: number; asr_stage: string | null; asr_error: string | null };

/** Đẩy luồng tới khi rời khỏi trạng thái processing (mỗi lần gọi MỘT bước). */
async function dayLuong(request: APIRequestContext, sessionId: string): Promise<ProcessState> {
  let state: ProcessState | null = null;
  for (let i = 0; i < 12; i++) {
    const res = await request.post(`/api/sessions/${sessionId}/process`, { data: {} });
    expect(res.status()).toBe(200);
    state = (await res.json()) as ProcessState;
    if (state.status !== "processing") return state;
  }
  return state as ProcessState;
}

test.describe("kho giả ASR + Gemini — luồng nội dung thật qua API", () => {
  test.skip(
    () => !canRun(),
    "Cần server chạy với R2_FAKE=1 + SONIOX_FAKE=1 + GEMINI_FAKE=1 + AUTH_FAKE + DATABASE_URL",
  );

  test("người B không đẩy được luồng buổi của người A (403), ẩn danh 401", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await dangNhapDemo(pageA);
    const sessionA = await taoBuoi(pageA.request, "Buổi luồng của A");
    await taiLen(pageA.request, sessionA);

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await dangNhapNguoiB(pageB);
    const pushB = await pageB.request.post(`/api/sessions/${sessionA}/process`, { data: {} });
    expect(pushB.status()).toBe(403);

    const anon = await browser.newContext();
    const pageAnon = await anon.newPage();
    const pushAnon = await pageAnon.request.post(`/api/sessions/${sessionA}/process`, { data: {} });
    expect(pushAnon.status()).toBe(401);

    // Người A đẩy được (200), phản hồi có trạng thái luồng
    const pushA = await pageA.request.post(`/api/sessions/${sessionA}/process`, { data: {} });
    expect(pushA.status()).toBe(200);
    const stateA = (await pushA.json()) as ProcessState;
    expect(stateA.asr_stage).toBeTruthy();

    // Dọn buổi TRƯỚC khi đóng context (dùng request của A)
    const del = await pageA.request.delete(`/api/data/sessions/${sessionA}`);
    expect(del.status()).toBe(200);
    await ctxA.close();
    await ctxB.close();
    await anon.close();
  });

  test("complete → process từng bước → done: bản chữ + tóm tắt đúng cấu trúc, số liệu khớp bản chữ giả", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoi(page.request, "Buổi nội dung thật");
    await taiLen(page.request, sessionId);

    const state = await dayLuong(page.request, sessionId);
    expect(state.status).toBe("ready");
    expect(state.asr_stage).toBe("done");

    // Chi tiết: tóm tắt nhắc đúng số liệu có trong bản chữ giả — không bịa
    const detailRes = await page.request.get(`/api/data/sessions/${sessionId}`);
    expect(detailRes.status()).toBe(200);
    const detail = (await detailRes.json()) as {
      detail: {
        status: string;
        executive_summary: string;
        topics: Array<{ id: string; section_id: string; title: string; tag: string; start_sec: number; end_sec: number; bullets: Array<{ text: string; timestamp_sec: number; speaker_id: string }> }>;
        speakers: Array<{ id: string; is_me: boolean; talk_ratio_percent: number }>;
        action_items: Array<{ id: string; task: string; timestamp_sec: number | null; source_quote: string | null }>;
        open_task_count: number;
        headline_tag: { tag: string; count: number } | null;
      };
    };
    const d = detail.detail;
    expect(d.status).toBe("ready");
    expect(d.executive_summary).toContain("4,2 tỷ");
    expect(d.executive_summary).toContain("15/11");
    // Phân ý đúng theo phần của mẫu bất động sản
    expect(d.topics.length).toBeGreaterThanOrEqual(2);
    for (const topic of d.topics) {
      expect(topic.section_id).toMatch(/^tpl-realestate-s\d$/);
      expect(topic.bullets.length).toBeGreaterThanOrEqual(1);
      for (const bullet of topic.bullets) {
        expect(bullet.timestamp_sec).toBeGreaterThanOrEqual(0);
        expect(bullet.timestamp_sec).toBeLessThanOrEqual(65);
        expect(bullet.speaker_id).toMatch(/^SPK_\d{2}$/);
      }
    }
    // Việc cần làm dẫn được về bản chữ (mốc + câu gốc)
    expect(d.action_items.length).toBeGreaterThanOrEqual(2);
    expect(d.open_task_count).toBe(d.action_items.length);
    for (const task of d.action_items) {
      expect(task.timestamp_sec === null || task.timestamp_sec <= 65).toBe(true);
    }
    expect(d.headline_tag).toBeTruthy();

    // Người nói: hai người, người đầu là "Bạn"
    expect(d.speakers.length).toBe(2);
    expect(d.speakers[0].is_me).toBe(true);

    // Bản chữ: có đoạn, đúng người nói và mốc tăng dần
    const trRes = await page.request.get(`/api/data/sessions/${sessionId}/transcript`);
    expect(trRes.status()).toBe(200);
    const transcript = (await trRes.json()) as { transcript: Array<{ id: string; speaker_id: string; start_sec: number; text: string }> };
    expect(transcript.transcript.length).toBeGreaterThanOrEqual(1);
    expect(transcript.transcript[0].text).toContain("bảng tính vay 50%");
    const starts = transcript.transcript.map((s) => s.start_sec);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);

    await page.request.delete(`/api/data/sessions/${sessionId}`);
  });

  test("quota: buổi vượt trần phút gói Free bị chặn rõ, không gọi nhận dạng", async ({ page }) => {
    await dangNhapDemo(page);
    // Trần thật bị chặn NGAY Ở presign (413 — e2e c1-audio kiểm); gate phút
    // của pipeline là lưới phòng thủ. Kho giả mô phỏng đường đó bằng marker
    // "[quota]" trong tiêu đề (chỉ hiệu lực khi SONIOX_FAKE bật).
    const sessionId = await taoBuoi(page.request, "Buổi [quota] vượt trần");
    await taiLen(page.request, sessionId);

    // complete đã kích luồng lần đầu — chờ tới khi failed
    let state: ProcessState | null = null;
    for (let i = 0; i < 20; i++) {
      const res = await page.request.get(`/api/data/sessions/${sessionId}/processing`);
      const s = (await res.json()) as ProcessState;
      if (s.status !== "processing") {
        state = s;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(state?.status).toBe("failed");
    expect(state?.asr_error).toBe("quota_exceeded");

    // Bản chữ không hề được sinh (không gọi nhà cung cấp); thử lại vẫn failed
    const trRes = await page.request.get(`/api/data/sessions/${sessionId}/transcript`);
    const transcript = (await trRes.json()) as { transcript: unknown[] };
    expect(transcript.transcript.length).toBe(0);
    const retry = await page.request.post(`/api/data/sessions/${sessionId}/processing`, {
      data: { action: "retry" },
    });
    expect(retry.status()).toBe(200);
    const after = await dayLuong(page.request, sessionId);
    expect(after.status).toBe("failed");
    expect(after.asr_error).toBe("quota_exceeded");

    await page.request.delete(`/api/data/sessions/${sessionId}`);
  });

  test("failed → Thử lại: lỗi lần đầu là đúng kịch bản, thử lại thì xong", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoi(page.request, "Buổi [fail] thử lại");
    await taiLen(page.request, sessionId);

    // Lần đầu: complete đã kích luồng (fire-and-forget) — chờ tới khi failed
    let first: ProcessState | null = null;
    for (let i = 0; i < 20; i++) {
      const res = await page.request.get(`/api/data/sessions/${sessionId}/processing`);
      const s = (await res.json()) as ProcessState;
      if (s.status !== "processing") {
        first = s;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(first?.status).toBe("failed");
    expect(first?.asr_error).toBe("fake_fail_once");

    // Nút Thử lại gọi đúng retryProcessing (POST processing action retry)
    const retry = await page.request.post(`/api/data/sessions/${sessionId}/processing`, {
      data: { action: "retry" },
    });
    expect(retry.status()).toBe(200);

    const second = await dayLuong(page.request, sessionId);
    expect(second.status).toBe("ready");
    expect(second.asr_stage).toBe("done");

    await page.request.delete(`/api/data/sessions/${sessionId}`);
  });

  test("cron asr-retry: sai bí mật 401, đúng bí mật trả báo cáo quét", async ({ page }) => {
    await dangNhapDemo(page);
    const noSecret = await page.request.get("/api/cron/asr-retry", {
      headers: { Authorization: `Bearer sai-roi` },
    });
    expect(noSecret.status()).toBe(401);

    const cron = await page.request.get("/api/cron/asr-retry", {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(cron.status()).toBe(200);
    const report = (await cron.json()) as { checked: number; pushed: number; done: number; failed: number };
    expect(typeof report.checked).toBe("number");
    expect(typeof report.pushed).toBe("number");
  });
});

test.describe("kho giả ASR + Gemini — luồng ghi trên màn ghi âm", () => {
  test.skip(
    () => !(canRun() && mode.r2Fake),
    "Cần R2_FAKE=1 + micro giả của Chromium (chạy trên máy có Playwright chromium)",
  );

  test("ghi vài giây rồi lưu: màn processing ra done, chi tiết hiện tóm tắt và lời từ kho giả", async ({ page }) => {
    test.info().setTimeout(120_000);
    await dangNhapDemo(page);

    await page.goto("/record");
    await page.getByRole("button", { name: "Cho phép micro" }).click();
    await page.getByRole("button", { name: "Đã đồng ý, ghi" }).click();
    await expect(page.getByRole("button", { name: "Kiểm tra thiếu" })).toBeVisible();
    await page.waitForTimeout(2500);

    const ketThuc = page.getByRole("button", { name: "Kết thúc buổi ghi" });
    const box = (await ketThuc.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1200);
    await page.mouse.up();
    await page.getByRole("button", { name: "Lưu luôn" }).click();
    await page.waitForURL(/\/s\/.+\/processing$/);

    // Luồng thật: tải băng xong là các bước chạy tới xong và TỰ chuyển chi tiết
    await page.waitForURL((u) => /\/s\/[^/]+$/.test(u.pathname), { timeout: 90_000 });
    const sessionId = new URL(page.url()).pathname.split("/")[2];

    // Tab Tóm tắt hiện nội dung từ kho giả (khớp số liệu trong bản chữ giả)
    await page.getByRole("tab", { name: "Tóm tắt" }).click();
    await expect(page.getByText("4,2 tỷ").first()).toBeVisible({ timeout: 15_000 });

    // Tab Lời hiện bản chữ giả có người nói
    await page.getByRole("tab", { name: "Lời", exact: true }).click();
    await expect(page.getByText("bảng tính vay 50%").first()).toBeVisible({ timeout: 15_000 });

    await page.request.delete(`/api/data/sessions/${sessionId}`);
  });
});
