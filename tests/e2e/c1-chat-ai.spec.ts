import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/*
 * C1-08 mục 2 — Hỏi AI thật cho buổi và thư mục (chế độ tài khoản).
 *
 * Máy chủ chạy GEMINI_FAKE=1 (bị chặn tuyệt đối khi VERCEL_ENV=production —
 * cùng cơ chế geminiFakeActive đã có từ C1-05): câu trả lời giả CỐ ĐỊNH khớp
 * giọng giả soniox (lib/data/server/chat-ai.ts) nên đối chiếu được không bịa:
 * - câu chứa "[khong]" → trả đúng câu "Buổi này không nhắc tới nội dung đó."
 *   (khóa ai.notMentioned) với citations rỗng;
 * - câu chứa "[that-bai]" → máy chủ trả 502 và KHÔNG ghi lịch sử (không trừ
 *   lượt hạn mức);
 * - câu thường → câu trả lời giả nhắc đúng số liệu trong bản chữ giả
 *   (50%, 4,2 tỷ, 7 phần trăm, 15/11) kèm citations là mốc giây.
 *
 * Hạn mức 10 câu mỗi buổi gói Free đếm PHÍA MÁY CHỦ từ lịch sử chat; hỏi
 * người khác bị chặn 403; ẩn danh 401; gói Free hỏi thư mục bị chặn 429
 * (người demo-b là gói Pro khi AUTH_FAKE để duyệt luồng thư mục).
 *
 * Máy chủ phải chạy với R2_FAKE=1 + SONIOX_FAKE=1 + GEMINI_FAKE=1 + AUTH_FAKE
 * + DATABASE_URL (đọc /api/data/mode để tự bỏ qua khi thiếu cấu hình).
 */

type Mode = {
  dataSource: string;
  databaseConfigured: boolean;
  authFake: boolean;
  r2: boolean;
  sonioxFake: boolean;
  geminiFake: boolean;
};

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

async function taiLen(request: APIRequestContext, sessionId: string, size = 1200): Promise<void> {
  const presign = await request.post("/api/audio/presign", {
    data: { session_id: sessionId, content_type: "audio/webm", size },
  });
  expect(presign.status()).toBe(200);
  const { upload_url: uploadUrl } = (await presign.json()) as { upload_url: string };
  const put = await request.put(uploadUrl.startsWith("http") ? uploadUrl : `http://localhost:3100${uploadUrl}`, {
    data: Buffer.alloc(size, 7),
    headers: { "Content-Type": "audio/webm" },
  });
  expect(put.status()).toBe(200);
  const complete = await request.post("/api/audio/complete", {
    data: { session_id: sessionId, content_type: "audio/webm", size },
  });
  expect(complete.status()).toBe(200);
}

async function dayLuong(request: APIRequestContext, sessionId: string): Promise<{ status: string }> {
  let state: { status: string } | null = null;
  for (let i = 0; i < 12; i++) {
    const res = await request.post(`/api/sessions/${sessionId}/process`, { data: {} });
    expect(res.status()).toBe(200);
    state = (await res.json()) as { status: string };
    if (state.status !== "processing") return state;
  }
  return state as { status: string };
}

/** Buổi đã xử lý xong của người demo (A) — có bản chữ + tóm tắt để hỏi AI. */
async function taoBuoiDaXong(page: Page, title: string): Promise<string> {
  const sessionId = await taoBuoi(page.request, title);
  await taiLen(page.request, sessionId);
  const state = await dayLuong(page.request, sessionId);
  expect(state.status).toBe("ready");
  return sessionId;
}

const FAKE_ANSWER_VI =
  "Buổi này nhắc tới: khách muốn vay 50% giá trị căn hộ, ngân sách tối đa 4,2 tỷ; lãi suất đàm phán lại còn 7 phần trăm; hai bên chốt đặt cọc trước ngày 15/11 và hẹn sáng thứ Bảy xem nhà.";
const NOT_FOUND_VI = "Buổi này không nhắc tới nội dung đó.";
const NOT_FOUND_KO = "이 녹음에서는 그 내용을 언급하지 않았습니다.";
const FAKE_FOLDER_ANSWER_VI_HEAD = "Trên 1 buổi của hồ sơ";

test.describe("C1-08 mục 2 — hỏi AI thật (kho giả Gemini)", () => {
  test.skip(
    () => !canRun(),
    "Cần server chạy với R2_FAKE=1 + SONIOX_FAKE=1 + GEMINI_FAKE=1 + AUTH_FAKE + DATABASE_URL",
  );

  test("hạn mức 10 câu phía máy chủ: lỗi không trừ, đủ 10 câu thành công mới chặn 429", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoiDaXong(page, "Buổi hỏi AI hạn mức");

    // Lỗi AI (mốc kiểm thử [that-bai]): máy chủ trả 502, KHÔNG ghi lịch sử
    // → không trừ lượt
    const failRes = await page.request.post(`/api/data/sessions/${sessionId}/chat`, {
      data: { question: "[that-bai] kiểm tra không trừ lượt" },
    });
    expect(failRes.status()).toBe(502);
    let hist = (await (await page.request.get(`/api/data/sessions/${sessionId}/chat`)).json()) as { messages: Array<{ role: string }> };
    expect(hist.messages.length).toBe(0);

    // Câu không có trong bản chữ ([khong]): trả đúng câu "không nhắc tới",
    // citations rỗng — không bịa
    const notFoundRes = await page.request.post(`/api/data/sessions/${sessionId}/chat`, {
      data: { question: "[khong] giá nhà gỗ lim ở Ba Vì năm 1998?" },
    });
    expect(notFoundRes.status()).toBe(200);
    const notFoundJson = (await notFoundRes.json()) as { message: { text: string; citations: unknown[] } };
    expect(notFoundJson.message.text).toBe(NOT_FOUND_VI);
    expect(notFoundJson.message.citations).toEqual([]);

    // Câu thường: trả lời giả cố định đúng số liệu trong bản chữ + có dẫn chứng mốc giây
    const okRes = await page.request.post(`/api/data/sessions/${sessionId}/chat`, {
      data: { question: "Buổi này chốt giá thế nào?" },
    });
    expect(okRes.status()).toBe(200);
    const okJson = (await okRes.json()) as { message: { text: string; citations: Array<{ timestamp_sec: number }> } };
    expect(okJson.message.text).toBe(FAKE_ANSWER_VI);
    expect(okJson.message.citations.length).toBeGreaterThanOrEqual(1);
    for (const c of okJson.message.citations) {
      expect(c.timestamp_sec).toBeGreaterThanOrEqual(0);
      expect(c.timestamp_sec).toBeLessThanOrEqual(65);
    }

    // Hỏi thêm tới đủ 10 câu thành công (hiện có 2) rồi câu thứ 11 bị chặn 429
    for (let lan = 3; lan <= 10; lan++) {
      const res = await page.request.post(`/api/data/sessions/${sessionId}/chat`, {
        data: { question: `Câu hỏi thứ ${lan} của buổi này là gì?` },
      });
      expect(res.status()).toBe(200);
    }
    const overRes = await page.request.post(`/api/data/sessions/${sessionId}/chat`, {
      data: { question: "Câu thứ 11 vượt hạn mức?" },
    });
    expect(overRes.status()).toBe(429);
    const overJson = (await overRes.json()) as { error: string };
    expect(overJson.error).toBe("quota_exceeded");

    // Lịch sử chỉ có 10 câu hỏi thành công (câu lỗi và câu bị chặn không có)
    hist = (await (await page.request.get(`/api/data/sessions/${sessionId}/chat`)).json()) as { messages: Array<{ role: string }> };
    expect(hist.messages.filter((m) => m.role === "user").length).toBe(10);

    await page.request.delete(`/api/data/sessions/${sessionId}`);
  });

  test("quyền: người B không hỏi/đọc được buổi của A (403), ẩn danh 401", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await dangNhapDemo(pageA);
    const sessionA = await taoBuoiDaXong(pageA, "Buổi hỏi AI quyền");

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await dangNhapNguoiB(pageB);
    expect((await pageB.request.post(`/api/data/sessions/${sessionA}/chat`, { data: { question: "Đây là buổi của ai?" } })).status()).toBe(403);
    expect((await pageB.request.get(`/api/data/sessions/${sessionA}/chat`)).status()).toBe(403);

    const anon = await browser.newContext();
    const pageAnon = await anon.newPage();
    expect((await pageAnon.request.post(`/api/data/sessions/${sessionA}/chat`, { data: { question: "Ẩn danh hỏi?" } })).status()).toBe(401);

    expect((await pageA.request.get(`/api/data/sessions/${sessionA}/chat`)).status()).toBe(200);

    await pageA.request.delete(`/api/data/sessions/${sessionA}`);
    await ctxA.close();
    await ctxB.close();
    await anon.close();
  });

  test("trả lời theo ngôn ngữ giao diện (cookie noteim-locale)", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoiDaXong(page, "Buổi hỏi AI ngôn ngữ");

    // Đổi ngôn ngữ giao diện bằng cookie (gộp vào jar — giữ nguyên phiên)
    await page.context().addCookies([{ name: "noteim-locale", value: "ko", url: "http://localhost:3100" }]);
    const koRes = await page.request.post(`/api/data/sessions/${sessionId}/chat`, {
      data: { question: "Buổi này nói về gì?" },
    });
    expect(koRes.status()).toBe(200);
    const koJson = (await koRes.json()) as { message: { text: string } };
    expect(koJson.message.text).toContain("대출");

    // "không nhắc tới" cũng theo ngôn ngữ giao diện
    const koNotFound = await page.request.post(`/api/data/sessions/${sessionId}/chat`, {
      data: { question: "[khong] câu ngoài lề?" },
    });
    expect((await koNotFound.json()) as { message: { text: string } }).toHaveProperty("message.text", NOT_FOUND_KO);

    // Đổi sang tiếng Anh (ghi đè cookie ko)
    await page.context().addCookies([{ name: "noteim-locale", value: "en", url: "http://localhost:3100" }]);
    const enRes = await page.request.post(`/api/data/sessions/${sessionId}/chat`, {
      data: { question: "Buổi này nói về gì?" },
    });
    expect(enRes.status()).toBe(200);
    const enJson = (await enRes.json()) as { message: { text: string } };
    expect(enJson.message.text).toContain("50% LTV");

    await page.request.delete(`/api/data/sessions/${sessionId}`);
  });

  test("thư mục: gói Free bị chặn 429 trước khi gọi AI, Pro hỏi được kèm dẫn nguồn buổi", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await dangNhapDemo(pageA);
    const sessionA = await taoBuoiDaXong(pageA, "Buổi thư mục của A");

    // Gói Free (A): tạo thư mục rồi hỏi → 429 quota_exceeded, không tạo lịch sử
    const folderRes = await pageA.request.post("/api/data/folders", {
      data: { kind: "client", name: "Hồ sơ A", session_ids: [sessionA] },
    });
    expect(folderRes.status()).toBe(200);
    const folderA = ((await folderRes.json()) as { folder: { id: string } }).folder.id;
    const freeAsk = await pageA.request.post(`/api/data/folders/${folderA}/chat`, {
      data: { question: "Hồ sơ này nói gì?" },
    });
    expect(freeAsk.status()).toBe(429);
    expect(((await freeAsk.json()) as { error: string }).error).toBe("quota_exceeded");
    const freeHist = (await (await pageA.request.get(`/api/data/folders/${folderA}/chat`)).json()) as { messages: unknown[] };
    expect(freeHist.messages.length).toBe(0);

    // Pro (B — demo-b là Pro khi AUTH_FAKE): hỏi được, trả lời giả kèm dẫn
    // nguồn buổi của B + mốc giây; câu lỗi không ghi lịch sử
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await dangNhapNguoiB(pageB);
    const sessionB = await taoBuoiDaXong(pageB, "Buổi thư mục của B");
    const folderBRes = await pageB.request.post("/api/data/folders", {
      data: { kind: "client", name: "Hồ sơ B", session_ids: [sessionB] },
    });
    expect(folderBRes.status()).toBe(200);
    const folderB = ((await folderBRes.json()) as { folder: { id: string } }).folder.id;

    const proAsk = await pageB.request.post(`/api/data/folders/${folderB}/chat`, {
      data: { question: "Hồ sơ này chốt điều gì?" },
    });
    expect(proAsk.status()).toBe(200);
    const proJson = (await proAsk.json()) as { message: { text: string; citations: Array<{ session_id: string; timestamp_sec: number }> } };
    expect(proJson.message.text.startsWith(FAKE_FOLDER_ANSWER_VI_HEAD)).toBe(true);
    expect(proJson.message.citations.length).toBe(1);
    expect(proJson.message.citations[0].session_id).toBe(sessionB);
    expect(proJson.message.citations[0].timestamp_sec).toBeLessThanOrEqual(65);

    const failAsk = await pageB.request.post(`/api/data/folders/${folderB}/chat`, {
      data: { question: "[that-bai] kiểm tra lỗi thư mục" },
    });
    expect(failAsk.status()).toBe(502);
    const bHist = (await (await pageB.request.get(`/api/data/folders/${folderB}/chat`)).json()) as { messages: Array<{ role: string }> };
    expect(bHist.messages.filter((m) => m.role === "user").length).toBe(1);

    await pageB.request.delete(`/api/data/sessions/${sessionB}`);
    await pageB.request.delete(`/api/data/folders/${folderB}`);
    await pageA.request.delete(`/api/data/sessions/${sessionA}`);
    await pageA.request.delete(`/api/data/folders/${folderA}`);
    await ctxA.close();
    await ctxB.close();
  });

  test("UI tab Hỏi AI: hỏi được, hiện đáp án + dẫn chứng bấm nghe được, bộ đếm hạn mức giảm", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoiDaXong(page, "Buổi hỏi AI UI");

    await page.goto(`/s/${sessionId}?tab=ai`);
    await expect(page.getByRole("tab", { name: "Hỏi AI" })).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
    await expect(page.getByText("Còn 10/10 câu hỏi cho buổi này")).toBeVisible({ timeout: 15_000 });

    // Bấm một câu gợi ý theo nội dung buổi (chủ đề/việc cần làm/số liệu); chip
    // phạm vi "Buổi này" nằm riêng ở trên, không phải câu gợi ý
    await page.getByRole("button", { name: /^(Chi tiết về “|Tôi cần làm gì sau buổi này|Có số liệu hay mốc thời gian)/ }).first().click();

    // Đáp án giả hiện dần rồi đủ chữ; có chip dẫn chứng mốc giây
    await expect(page.getByText(FAKE_ANSWER_VI, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "00:00" }).first()).toBeVisible();

    // Bộ đếm hạn mức giảm sau câu hỏi thành công
    await expect(page.getByText("Còn 9/10 câu hỏi cho buổi này")).toBeVisible();

    // Bấm dẫn chứng không gây lỗi trang
    await page.getByRole("button", { name: "00:00" }).first().click();
    await expect(page.getByText(FAKE_ANSWER_VI, { exact: true })).toBeVisible();

    await page.request.delete(`/api/data/sessions/${sessionId}`);
  });
});
