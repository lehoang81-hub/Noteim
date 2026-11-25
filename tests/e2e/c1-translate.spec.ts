import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/*
 * C1-08 mục 3 — dịch thật bằng Gemini: tóm tắt theo ngôn ngữ (summary_versions)
 * và từng đoạn bản chữ (translateSegments, tab Lời).
 *
 * Máy chủ chạy GEMINI_FAKE=1 (bị chặn khi VERCEL_ENV=production): dịch giả
 * cố định "[ko] "/"[en] " + câu gốc (lib/data/server/translate-ai.ts) nên
 * đối chiếu được; nguồn chứa "[dich-loi]" ép lỗi dịch — dùng để kiểm:
 * - gói Free tạo được 1 bản thêm mỗi buổi, chặn TRƯỚC khi gọi AI (429);
 * - bản dịch thất bại không tạo bản và KHÔNG trừ lượt (lần thử sau vẫn được);
 * - lỗi dịch bản ghi lời không ghi mục nào (không dịch lưng chừng);
 * - sửa bản gốc → bản dịch hiện "Cần dịch lại", dịch lại thành bản thật,
 *   gói Free không bị trừ thêm (bản đã tồn tại).
 * Bản dịch thật không còn nhãn "Bản dịch mẫu"; nhãn mới "Dịch bằng AI từ
 * tiếng Việt" (summary.aiFromVi).
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

async function taoBuoiDaXong(page: Page, title: string): Promise<string> {
  const sessionId = await taoBuoi(page.request, title);
  await taiLen(page.request, sessionId);
  const state = await dayLuong(page.request, sessionId);
  expect(state.status).toBe("ready");
  return sessionId;
}

type DetailShape = {
  detail: {
    topics: Array<{ id: string; bullets: Array<{ id: string }> }>;
    action_items: Array<{ id: string }>;
  };
};

/** Sửa câu gốc của ý đầu (action updateBullet) — mọi bản dịch chuyển lỗi thời. */
async function suaYgoc(page: Page, sessionId: string, text: string): Promise<void> {
  const detailRes = await page.request.get(`/api/data/sessions/${sessionId}`);
  expect(detailRes.status()).toBe(200);
  const detail = (await detailRes.json()) as DetailShape;
  const bulletId = detail.detail.topics[0]?.bullets[0]?.id;
  expect(bulletId).toBeTruthy();
  const res = await page.request.post(`/api/data/sessions/${sessionId}/actions`, {
    data: { type: "updateBullet", bulletId, text },
  });
  expect(res.status()).toBe(200);
}

test.describe("C1-08 mục 3 — dịch tóm tắt và bản ghi lời thật (kho giả Gemini)", () => {
  test.skip(
    () => !canRun(),
    "Cần server chạy với R2_FAKE=1 + SONIOX_FAKE=1 + GEMINI_FAKE=1 + AUTH_FAKE + DATABASE_URL",
  );

  test("dịch tóm tắt thật: bản ko/en có nội dung dịch, giữ câu gốc, hết nhãn 'mẫu'; Free 1 bản/buổi", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoiDaXong(page, "Buổi dịch tóm tắt");

    // Tạo bản Hàn: nội dung bắt đầu bằng nhãn dịch giả, nguồn là tiếng Việt,
    // từng ý còn giữ "Câu gốc"; không còn là bản mẫu
    const koRes = await page.request.post(`/api/data/sessions/${sessionId}/summaries`, {
      data: { lang: "ko" },
    });
    expect(koRes.status()).toBe(200);
    const ko = (await koRes.json()) as {
      version: {
        lang: string;
        source: string;
        translated_from: string | null;
        sample?: boolean;
        executive_summary: string;
        topics: Array<{ title: string; bullets: Array<{ text: string; original_text?: string; original_lang?: string }> }>;
        task_texts: Record<string, string>;
      };
    };
    expect(ko.version.lang).toBe("ko");
    expect(ko.version.source).toBe("translated");
    expect(ko.version.translated_from).toBe("vi");
    expect(ko.version.sample).toBeFalsy();
    expect(ko.version.executive_summary.startsWith("[ko] ")).toBe(true);
    expect(ko.version.topics.length).toBeGreaterThanOrEqual(1);
    for (const topic of ko.version.topics) {
      expect(topic.title.startsWith("[ko] ")).toBe(true);
      for (const b of topic.bullets) {
        expect(b.text.startsWith("[ko] ")).toBe(true);
        expect(b.original_text).toBeTruthy();
        expect(b.original_text?.startsWith("[ko] ")).toBe(false);
        expect(b.original_lang).toBe("vi");
      }
    }

    // Đọc lại bản Hàn từ máy chủ vẫn khớp
    const getKo = await page.request.get(`/api/data/sessions/${sessionId}/summaries?lang=ko`);
    expect(getKo.status()).toBe(200);
    expect(((await getKo.json()) as { version: { executive_summary: string } }).version.executive_summary).toBe(
      ko.version.executive_summary,
    );

    // Gói Free: bản thứ hai bị chặn TRƯỚC khi gọi AI → 429, bản en không tồn tại
    const enRes = await page.request.post(`/api/data/sessions/${sessionId}/summaries`, {
      data: { lang: "en" },
    });
    expect(enRes.status()).toBe(429);
    expect(((await enRes.json()) as { error: string }).error).toBe("quota_exceeded");
    expect((await page.request.get(`/api/data/sessions/${sessionId}/summaries?lang=en`)).status()).toBe(404);

    await page.request.delete(`/api/data/sessions/${sessionId}`);
  });

  test("dịch thất bại không tạo bản và không trừ lượt: sửa lỗi xong dịch lại được", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoiDaXong(page, "Buổi dịch lỗi thử lại");

    // Nhồi dấu hiệu lỗi dịch vào câu gốc của ý đầu
    await suaYgoc(page, sessionId, "Kiểm tra [dich-loi] dịch thất bại");

    // Lần dịch đầu thất bại (502) — bản chưa tồn tại, lượt hạn mức không mất
    const failRes = await page.request.post(`/api/data/sessions/${sessionId}/summaries`, {
      data: { lang: "en" },
    });
    expect(failRes.status()).toBe(502);
    expect(((await failRes.json()) as { error: string }).error).toBe("translate_failed");
    expect((await page.request.get(`/api/data/sessions/${sessionId}/summaries?lang=en`)).status()).toBe(404);

    // Sửa câu gốc trở lại bình thường thì dịch lại thành công — chứng tỏ lần
    // thất bại trước không ăn lượt (gói Free vẫn còn 1 bản thêm)
    await suaYgoc(page, sessionId, "Sửa lại câu bình thường không có dấu hiệu lỗi");
    const okRes = await page.request.post(`/api/data/sessions/${sessionId}/summaries`, {
      data: { lang: "en" },
    });
    expect(okRes.status()).toBe(200);
    const ok = (await okRes.json()) as { version: { executive_summary: string; stale: boolean } };
    expect(ok.version.executive_summary.startsWith("[en] ")).toBe(true);
    expect(ok.version.stale).toBe(false);

    await page.request.delete(`/api/data/sessions/${sessionId}`);
  });

  test("sửa bản gốc → bản dịch hiện 'lỗi thời', Dịch lại ra bản thật không mất lượt Free", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoiDaXong(page, "Buổi dịch lại sau sửa");

    const koRes = await page.request.post(`/api/data/sessions/${sessionId}/summaries`, { data: { lang: "ko" } });
    expect(koRes.status()).toBe(200);

    // Sửa bản gốc: bản Hàn chuyển lỗi thời
    await suaYgoc(page, sessionId, "Câu gốc đã được chỉnh sau khi dịch");
    const staleGet = await page.request.get(`/api/data/sessions/${sessionId}/summaries?lang=ko`);
    expect(((await staleGet.json()) as { version: { stale: boolean } }).version.stale).toBe(true);

    // Dịch lại (bản đã tồn tại — gói Free không bị trừ thêm): thành bản thật mới
    const again = await page.request.post(`/api/data/sessions/${sessionId}/summaries`, { data: { lang: "ko" } });
    expect(again.status()).toBe(200);
    const againJson = (await again.json()) as { version: { stale: boolean; executive_summary: string; topics: Array<{ bullets: Array<{ text: string }> }> } };
    expect(againJson.version.stale).toBe(false);
    expect(againJson.version.executive_summary.startsWith("[ko] ")).toBe(true);
    // Bản dịch phản ánh câu gốc đã sửa (không còn câu cũ)
    expect(againJson.version.topics[0].bullets[0].text).toBe("[ko] Câu gốc đã được chỉnh sau khi dịch");

    // Bản thứ hai của gói Free vẫn bị chặn (hạn mức 1 bản thêm mỗi buổi)
    const enRes = await page.request.post(`/api/data/sessions/${sessionId}/summaries`, { data: { lang: "en" } });
    expect(enRes.status()).toBe(429);

    await page.request.delete(`/api/data/sessions/${sessionId}`);
  });

  test("dịch bản ghi lời thật: bật Xem bản dịch dịch toàn bộ, sửa câu → dịch lại từng đoạn", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoiDaXong(page, "Buổi dịch lời");
    const trRes = await page.request.get(`/api/data/sessions/${sessionId}/transcript`);
    const transcript = (await trRes.json()) as { transcript: Array<{ id: string; lang: string; translations: Record<string, { text: string; stale: boolean; sample?: boolean }> }> };
    expect(transcript.transcript.length).toBeGreaterThanOrEqual(1);
    const firstId = transcript.transcript[0].id;

    // Bật "Xem bản dịch" (không kèm segmentIds): mọi đoạn khác ngôn ngữ được dịch thật
    const bulk = await page.request.post(`/api/data/sessions/${sessionId}/actions`, {
      data: { type: "translateSegments", lang: "ko" },
    });
    expect(bulk.status()).toBe(200);
    const bulkJson = (await bulk.json()) as { transcript: Array<{ id: string; translations: Record<string, { text: string; stale: boolean; sample?: boolean }> }> };
    for (const seg of bulkJson.transcript) {
      expect(seg.translations.ko?.text.startsWith("[ko] ")).toBe(true);
      expect(seg.translations.ko?.stale).toBe(false);
      expect(seg.translations.ko?.sample).toBeFalsy();
    }

    // Gọi lại lần nữa: không đổi gì (không dịch đè bừa)
    const again = await page.request.post(`/api/data/sessions/${sessionId}/actions`, {
      data: { type: "translateSegments", lang: "ko" },
    });
    expect(again.status()).toBe(200);
    const againJson = (await again.json()) as typeof bulkJson;
    expect(againJson.transcript.find((s) => s.id === firstId)?.translations.ko?.text).toBe(
      bulkJson.transcript.find((s) => s.id === firstId)?.translations.ko?.text,
    );

    // Sửa câu gốc của đoạn đầu → bản dịch của đoạn đó lỗi thời; dịch lại TỪNG
    // ĐOẠN (kèm segmentIds) ra bản thật, không đụng đoạn khác
    const sua = await page.request.post(`/api/data/sessions/${sessionId}/actions`, {
      data: { type: "updateSegment", segmentId: firstId, text: "Đã sửa câu gốc của đoạn này", field: "text" },
    });
    expect(sua.status()).toBe(200);
    const re = await page.request.post(`/api/data/sessions/${sessionId}/actions`, {
      data: { type: "translateSegments", lang: "ko", segmentIds: [firstId] },
    });
    expect(re.status()).toBe(200);
    const reJson = (await re.json()) as typeof bulkJson;
    const reSeg = reJson.transcript.find((s) => s.id === firstId);
    expect(reSeg?.translations.ko?.text).toBe("[ko] Đã sửa câu gốc của đoạn này");
    expect(reSeg?.translations.ko?.stale).toBe(false);

    // Dịch đoạn chứa dấu hiệu lỗi → 502, nội dung dịch cũ GIỮ NGUYÊN (không ghi lưng chừng)
    const suaLoi = await page.request.post(`/api/data/sessions/${sessionId}/actions`, {
      data: { type: "updateSegment", segmentId: firstId, text: "Đoạn [dich-loi] hỏng dịch", field: "text" },
    });
    expect(suaLoi.status()).toBe(200);
    const fail = await page.request.post(`/api/data/sessions/${sessionId}/actions`, {
      data: { type: "translateSegments", lang: "ko", segmentIds: [firstId] },
    });
    expect(fail.status()).toBe(502);
    const afterFail = (await (await page.request.get(`/api/data/sessions/${sessionId}/transcript`)).json()) as typeof bulkJson;
    const failSeg = afterFail.transcript.find((s) => s.id === firstId);
    expect(failSeg?.translations.ko?.stale).toBe(true);
    expect(failSeg?.translations.ko?.text).not.toContain("[dich-loi]");

    await page.request.delete(`/api/data/sessions/${sessionId}`);
  });

  test("quyền dịch: người B không dịch được buổi của A (403), ẩn danh 401; UI hiện nhãn 'Dịch bằng AI từ tiếng Việt'", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await dangNhapDemo(pageA);
    const sessionA = await taoBuoiDaXong(pageA, "Buổi dịch quyền");
    const koRes = await pageA.request.post(`/api/data/sessions/${sessionA}/summaries`, { data: { lang: "ko" } });
    expect(koRes.status()).toBe(200);

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.goto("/login");
    const btnB = pageB.getByTestId("login-demo-b");
    await expect(btnB).toBeVisible();
    await Promise.all([pageB.waitForURL((u) => u.pathname === "/"), btnB.click()]);
    await pageB.goto("/welcome");
    const skipB = pageB.getByRole("button", { name: /Bỏ qua|Skip|건너뛰기/ });
    await expect(skipB).toBeVisible();
    await Promise.all([pageB.waitForURL((u) => u.pathname === "/"), skipB.click()]);
    expect((await pageB.request.post(`/api/data/sessions/${sessionA}/summaries`, { data: { lang: "en" } })).status()).toBe(403);

    const anon = await browser.newContext();
    const pageAnon = await anon.newPage();
    expect((await pageAnon.request.post(`/api/data/sessions/${sessionA}/summaries`, { data: { lang: "en" } })).status()).toBe(401);

    // UI tab Tóm tắt của A: chọn bản Hàn trong bộ chọn "Tóm tắt bằng" → nhãn
    // "Dịch bằng AI từ tiếng Việt", không còn nhãn "Bản dịch mẫu"
    await pageA.goto(`/s/${sessionA}`);
    await pageA.getByRole("tab", { name: "Tóm tắt" }).click();
    await pageA.getByRole("radio", { name: "tiếng Hàn" }).click();
    await expect(pageA.getByText("Dịch bằng AI từ tiếng Việt")).toBeVisible({ timeout: 15_000 });
    await expect(pageA.getByText("Bản dịch mẫu")).toHaveCount(0);

    await pageA.request.delete(`/api/data/sessions/${sessionA}`);
    await ctxA.close();
    await ctxB.close();
    await anon.close();
  });
});
