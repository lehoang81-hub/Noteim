import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/*
 * C1-04 — âm thanh thật lưu Cloudflare R2 (kho giả R2_FAKE=1 cho e2e).
 *
 * Máy chủ phải chạy với R2_FAKE=1 (kho giả trong bộ nhớ, PUT/GET/Range ngay
 * trong app) + AUTH_FAKE + DATABASE_URL. Đọc /api/data/mode để tự bỏ qua khi
 * thiếu cấu hình — phần chưa kiểm chứng được ghi rõ ở docs/LOG.md, không bịa
 * kết quả.
 *
 * Các nhóm bài:
 * - Quyền A/B: người B không xin được URL tải lên/nghe lại của người A (403);
 *   chưa đăng nhập 401.
 * - Chặn loại file không cho phép (400) và vượt trần dung lượng gói (413).
 * - Luồng presign → PUT thẳng → complete → nghe lại 302 (kho giả hỗ trợ
 *   Range để tua) → xóa buổi là mất băng.
 * - Cron hết hạn: sai bí mật 401; đúng bí mật quét băng quá hạn về
 *   essence_only nhưng giữ bản chữ.
 * - Luồng UI ghi thật (micro giả của Chromium): buổi ghi không còn nhãn
 *   "Bản ghi thử" sau khi băng tải xong.
 */

type Mode = {
  dataSource: string;
  databaseConfigured: boolean;
  authFake: boolean;
  r2: boolean;
  r2Fake: boolean;
};

const CRON_SECRET = process.env.E2E_CRON_SECRET || "cron-thu-e2e";

/* Micro giả của Chromium cho luồng ghi thật (nhóm cuối file); đặt cấp đầu
 * file vì Playwright không cho test.use trong describe có test.skip(). Các
 * bài API không dùng micro nên không ảnh hưởng. */
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

function canRunRemote(): boolean {
  return mode.dataSource === "remote" && mode.databaseConfigured && mode.authFake;
}

async function dangNhapDemo(page: Page) {
  await page.goto("/login");
  const btn = page.getByRole("button", { name: /Đăng nhập thử/ }).first();
  await expect(btn).toBeVisible();
  await Promise.all([page.waitForURL((u) => u.pathname === "/"), btn.click()]);
  // Làm quen xong về thư viện (không chờ buổi — thư viện remote có thể rỗng)
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

/** Tạo buổi qua API (kiểu nhập file, 65 giây — đủ nhỏ so với trần gói). */
async function taoBuoi(request: APIRequestContext, title: string): Promise<string> {
  const res = await request.post("/api/data/sessions", {
    data: {
      kind: "import",
      input: { file_name: `${title}.m4a`, duration_sec: 65, template_id: "tpl-realestate", language: "vi" },
    },
  });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { id: string }).id;
}

/** Luồng tải lên đúng như trình duyệt làm: presign → PUT thẳng → complete. */
async function taiLen(request: APIRequestContext, sessionId: string, size: number) {
  const presign = await request.post("/api/audio/presign", {
    data: { session_id: sessionId, content_type: "audio/webm", size },
  });
  const presignJson = (await presign.json()) as { upload_url: string; key: string };
  const putRes = await request.put(presignJson.upload_url, {
    data: Buffer.alloc(size, 7),
    headers: { "Content-Type": "audio/webm" },
  });
  const complete = await request.post("/api/audio/complete", {
    data: { session_id: sessionId, content_type: "audio/webm", size },
  });
  return { presignStatus: presign.status(), presignJson, putStatus: putRes.status(), complete };
}

test.describe("kho giả R2 — quyền và luồng API", () => {
  test.skip(
    () => !(canRunRemote() && mode.r2),
    "Cần server chạy với R2_FAKE=1 + AUTH_FAKE + DATABASE_URL (kho R2 thật được kiểm riêng bằng scripts/r2-smoke.mjs)",
  );

  test("người B không xin được URL tải lên và không nghe được băng của người A (403)", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await dangNhapDemo(pageA);
    const sessionA = await taoBuoi(pageA.request, "Buổi băng của A");

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await dangNhapNguoiB(pageB);

    const presignB = await pageB.request.post("/api/audio/presign", {
      data: { session_id: sessionA, content_type: "audio/webm", size: 1000 },
    });
    expect(presignB.status()).toBe(403);

    const listenB = await pageB.request.get(`/api/audio/${sessionA}`);
    expect(listenB.status()).toBe(403);

    await ctxA.close();
    await ctxB.close();
  });

  test("chặn loại file không cho phép (400) và vượt trần dung lượng gói Free (413)", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoi(page.request, "Buổi chặn loại file");

    const wrongType = await page.request.post("/api/audio/presign", {
      data: { session_id: sessionId, content_type: "video/mp4", size: 1000 },
    });
    expect(wrongType.status()).toBe(400);

    // Trần byte Free: 90 phút × 60 s × ~320 kbps ≈ 216 triệu byte
    const tooBig = await page.request.post("/api/audio/presign", {
      data: { session_id: sessionId, content_type: "audio/webm", size: 300_000_000 },
    });
    expect(tooBig.status()).toBe(413);

    const tooLong = await page.request.post("/api/data/sessions", {
      data: {
        kind: "import",
        // 91 phút — vượt trần 90 phút/buổi của Free
        input: { file_name: "dai.m4a", duration_sec: 5460, template_id: "tpl-realestate", language: "vi" },
      },
    });
    expect(tooLong.status()).toBe(200);
    const longId = ((await tooLong.json()) as { id: string }).id;
    const presignLong = await page.request.post("/api/audio/presign", {
      data: { session_id: longId, content_type: "audio/webm", size: 1000 },
    });
    expect(presignLong.status()).toBe(413);
    // Xóa buổi dài ngay: 91 phút còn tính vào hạn mức tháng (180 phút) của
    // người A — nếu không, các bài sau bị cổng "Hết hạn mức tháng này" chặn.
    await page.request.delete(`/api/data/sessions/${longId}`);
  });

  test("presign → PUT thẳng → complete → nghe lại 302 có Range; khóa là u/{user}/{session}/original.webm", async ({ page }) => {
    await dangNhapDemo(page);
    const me = (await (await page.request.get("/api/data/me")).json()) as { user: { id: string } };
    const sessionId = await taoBuoi(page.request, "Buổi băng đầy đủ");
    const size = 1000;

    const presign = await page.request.post("/api/audio/presign", {
      data: { session_id: sessionId, content_type: "audio/webm", size },
    });
    expect(presign.status()).toBe(200);
    const { upload_url: uploadUrl, key } = (await presign.json()) as { upload_url: string; key: string };
    // Khóa đối tượng do MÁY CHỦ đặt, đúng khuôn và gắn với người chủ
    expect(key).toBe(`u/${me.user.id}/${sessionId}/original.webm`);

    // PUT thẳng lên URL presign (kho giả: /api/audio/fake/…)
    const put = await page.request.put(uploadUrl, {
      data: Buffer.alloc(size, 7),
      headers: { "Content-Type": "audio/webm" },
    });
    expect(put.status()).toBe(200);

    const complete = await page.request.post("/api/audio/complete", {
      data: { session_id: sessionId, content_type: "audio/webm", size },
    });
    expect(complete.status()).toBe(200);
    const completeJson = (await complete.json()) as { size_bytes: number; audio_expires_at: string };
    expect(completeJson.size_bytes).toBe(size);
    expect(completeJson.audio_expires_at).toBeTruthy();

    // Xong complete: chi tiết buổi có băng, hết nhãn bản ghi thử
    const detail = (await (await page.request.get(`/api/data/sessions/${sessionId}`)).json()) as {
      detail: { audio_url: string; trial_recording?: boolean; storage_status: string };
    };
    expect(detail.detail.audio_url).toBe(`/api/audio/${sessionId}`);
    expect(detail.detail.trial_recording).toBeFalsy();
    expect(detail.detail.storage_status).toBe("full");

    // Nghe lại: 302 tới URL signed (kho giả)
    const listen = await page.request.get(`/api/audio/${sessionId}`, { maxRedirects: 0 });
    expect(listen.status()).toBe(302);
    const location = listen.headers()["location"] ?? "";
    expect(location).toContain(`/api/audio/fake/u/${me.user.id}/${sessionId}/original.webm`);

    // Range để tua: 206 + đúng độ dài
    const range = await page.request.get(location, { headers: { Range: "bytes=0-9" } });
    expect(range.status()).toBe(206);
    expect(range.headers()["content-range"]).toContain(`${size}`);

    // Kích thước lệch thì complete từ chối (409)
    const badComplete = await page.request.post("/api/audio/complete", {
      data: { session_id: sessionId, content_type: "audio/webm", size: size + 1 },
    });
    expect(badComplete.status()).toBe(409);
  });

  test("buổi chưa đăng nhập không dùng được (401)", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await dangNhapDemo(pageA);
    const sessionA = await taoBuoi(pageA.request, "Buổi ẩn danh thử");
    await ctxA.close();

    const anon = await browser.newContext();
    const page = await anon.newPage();
    const presign = await page.request.post("/api/audio/presign", {
      data: { session_id: sessionA, content_type: "audio/webm", size: 1000 },
    });
    expect(presign.status()).toBe(401);
    const listen = await page.request.get(`/api/audio/${sessionA}`);
    expect(listen.status()).toBe(401);
    await anon.close();
  });

  test("xóa buổi thì băng trên kho cũng mất", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoi(page.request, "Buổi xóa kèm băng");
    const { presignJson } = await taiLen(page.request, sessionId, 500);

    const del = await page.request.delete(`/api/data/sessions/${sessionId}`);
    expect(del.status()).toBe(200);

    const listen = await page.request.get(`/api/audio/${sessionId}`, { maxRedirects: 0 });
    expect(listen.status()).toBe(404);
    // Đối tượng thật sự biến mất khỏi kho (kho giả phục vụ trực tiếp theo khóa)
    const object = await page.request.get(`/api/audio/fake/${presignJson.key}`);
    expect(object.status()).toBe(404);
  });

  test("cron sai bí mật bị chặn (401), đúng bí mật xóa băng quá hạn nhưng giữ bản chữ", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoi(page.request, "Buổi hết hạn");
    const { complete } = await taiLen(page.request, sessionId, 600);
    expect(complete.status()).toBe(200);

    // Lùi audio_expires_at về quá khứ qua PATCH hợp lệ
    const patch = await page.request.patch(`/api/data/sessions/${sessionId}`, {
      data: { audio_expires_at: new Date(Date.now() - 86_400_000).toISOString() },
    });
    expect(patch.status()).toBe(200);

    const noSecret = await page.request.get("/api/cron/audio-expiry", {
      headers: { Authorization: `Bearer sai-roi` },
    });
    expect(noSecret.status()).toBe(401);

    const cron = await page.request.get("/api/cron/audio-expiry", {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(cron.status()).toBe(200);
    const cronJson = (await cron.json()) as { swept: number };
    expect(cronJson.swept).toBeGreaterThanOrEqual(1);

    // storage_status = essence_only, băng không còn nghe được, bản chữ vẫn còn
    const detail = (await (await page.request.get(`/api/data/sessions/${sessionId}`)).json()) as {
      detail: { storage_status: string; audio_url: string | null; executive_summary: string };
    };
    expect(detail.detail.storage_status).toBe("essence_only");
    expect(detail.detail.audio_url).toBeNull();
    const listen = await page.request.get(`/api/audio/${sessionId}`, { maxRedirects: 0 });
    expect(listen.status()).toBe(404);
  });
});

test.describe("kho giả R2 — luồng ghi trên màn ghi âm", () => {
  test.skip(
    () => !(canRunRemote() && mode.r2 && mode.r2Fake),
    "Cần R2_FAKE=1 + micro giả của Chromium (chạy trên máy có Playwright chromium)",
  );

  test("ghi vài giây rồi lưu: buổi không còn nhãn Bản ghi thử, trình phát dùng /api/audio", async ({ page }) => {
    test.info().setTimeout(90_000);
    await dangNhapDemo(page);

    await page.goto("/record");
    await page.getByRole("button", { name: "Cho phép micro" }).click();
    // Micro giả được cấp: bảng đồng ý hiện, xác nhận để bắt đầu
    await page.getByRole("button", { name: "Đã đồng ý, ghi" }).click();
    await expect(page.getByRole("button", { name: "Kiểm tra thiếu" })).toBeVisible();
    await page.waitForTimeout(2500); // đủ cho đồng hồ ghi vài giây

    // Giữ nút kết thúc 1,2 giây (nút giữ 0,8 giây mới nhả sự kiện) → cổng chốt
    const ketThuc = page.getByRole("button", { name: "Kết thúc buổi ghi" });
    const box = (await ketThuc.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1200);
    await page.mouse.up();
    await page.getByRole("button", { name: "Lưu luôn" }).click();
    await page.waitForURL(/\/s\/.+\/processing$/);

    // Băng đang tải lên: dải trạng thái hiện rồi tự ẩn khi xong (tải quá
    // nhanh thì dải chuyển sang "Đã lưu băng ghi an toàn" rồi ẩn)
    await expect(page.getByText(/Đang tải lên \d+%|Đã lưu băng ghi an toàn/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Đang tải lên \d+%|Đã lưu băng ghi an toàn/)).toHaveCount(0, { timeout: 30_000 });

    // Xử lý xong màn hình TỰ chuyển tới chi tiết (máy chủ hoàn tất lười khi
    // có người hỏi — dò /processing mỗi 1,6 giây): ở lại tới khi URL là
    // /s/{id} không còn đuôi /processing.
    await page.waitForURL((u) => /\/s\/[^/]+$/.test(u.pathname), { timeout: 60_000 });
    const sessionId = new URL(page.url()).pathname.split("/")[2];

    // Chi tiết buổi: nhãn "Bản ghi thử" và "Chưa có âm thanh" không xuất hiện;
    // trình phát dùng lối kiểm quyền /api/audio/{id}
    await expect(page.getByText("Bản ghi thử: chưa lưu âm thanh")).toHaveCount(0);
    await expect(page.getByText("Chưa có âm thanh")).toHaveCount(0);
    // Trình phát thật dựng thẻ audio muộn khi bấm Phát lần đầu (preload none);
    // thẻ gắn data-noteim-audio = lối /api/audio/{id} để kiểm thử đọc được.
    const play = page.getByRole("button", { name: "Phát", exact: true }).first();
    await expect(play).toBeVisible({ timeout: 15_000 });
    // Bắt request nghe lại TRƯỚC khi bấm: preload none nghĩa là thẻ chỉ nạp
    // khi bấm Phát — request tới lối kiểm quyền phải xảy ra ngay sau click.
    const audioRequest = page.waitForRequest((req) => req.url().includes(`/api/audio/${sessionId}`), { timeout: 15_000 });
    await play.click();
    const audioEl = page.locator("[data-noteim-audio]");
    await expect(audioEl).toBeAttached({ timeout: 15_000 });
    await expect(audioEl).toHaveAttribute("data-noteim-audio", `/api/audio/${sessionId}`);
    await audioRequest; // lối nghe lại được gọi (302 sang signed URL bên dưới)
  });
});
