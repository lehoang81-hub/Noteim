import { expect, test, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";

/*
 * C1-09 — sửa lời, sửa người nói, tóm tắt lại, mẹo ghi âm.
 *
 * Máy chủ chạy GEMINI_FAKE=1 + SONIOX_FAKE=1 + R2_FAKE=1 + AUTH_FAKE +
 * DATABASE_URL (đọc /api/data/mode để tự bỏ qua khi thiếu cấu hình). Bản
 * chữ giả 5 đoạn xen kẽ SPK_01/SPK_02 (lib/data/server/soniox.ts) nên bài
 * "đổi các đoạn liền sau" tự dựng tình huống có đoạn liền kề cùng người
 * cũ bằng một lần đổi người nói qua API trước.
 *
 * Ghi rõ phần KHÔNG kiểm chứng được ở đây: Telex thật trên máy Android
 * (e2e giả lập chuỗi composition như c1-ime) và Gemini thật — xem docs/LOG.md.
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

/** Buổi đã xử lý xong (bản chữ giả 5 đoạn SPK_01/SPK_02 xen kẽ). */
async function taoBuoiDaXong(page: Page, title: string): Promise<string> {
  const sessionId = await taoBuoi(page.request, title);
  await taiLen(page.request, sessionId);
  const state = await dayLuong(page.request, sessionId);
  expect(state.status).toBe("ready");
  return sessionId;
}

type Segment = { id: string; speaker_id: string; start_sec: number; text: string; text_clean: string };

async function docTranscript(request: APIRequestContext, sessionId: string): Promise<Segment[]> {
  const res = await request.get(`/api/data/sessions/${sessionId}/transcript`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { transcript: Segment[] }).transcript.sort((a, b) => a.start_sec - b.start_sec);
}

type Detail = {
  status: string;
  asr_stage: string | null;
  transcript_stale?: boolean;
  resummarize_count?: number;
  speakers: Array<{ id: string; talk_ratio_percent: number; display_name: string | null; is_me: boolean }>;
};

async function docDetail(request: APIRequestContext, sessionId: string): Promise<Detail> {
  const res = await request.get(`/api/data/sessions/${sessionId}`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { detail: Detail }).detail;
}

/** Gọi action trên buổi; trả mã HTTP để kiểm quyền/hạn mức. */
async function goiAction(request: APIRequestContext, sessionId: string, action: unknown): Promise<APIResponse> {
  return request.post(`/api/data/sessions/${sessionId}/actions`, { data: action });
}

/** Chờ buổi ready (máy chủ tự hoàn tất lười khi có người hỏi). */
async function choReady(request: APIRequestContext, sessionId: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await request.post(`/api/sessions/${sessionId}/process`, { data: {} }).catch(() => undefined);
    const d = await docDetail(request, sessionId);
    if (d.status === "ready") return;
    await new Promise((r) => setTimeout(r, 1500));
  }
  expect((await docDetail(request, sessionId)).status).toBe("ready");
}

test.describe("C1-09 — sửa lời, sửa người nói, tóm tắt lại", () => {
  test.skip(
    () => !canRun(),
    "Cần server chạy với R2_FAKE=1 + SONIOX_FAKE=1 + GEMINI_FAKE=1 + AUTH_FAKE + DATABASE_URL",
  );

  test("nút ⋯ thấy được trên mọi màn hình, menu có Sửa lời và Đổi người nói, gợi ý sửa lời đóng được", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoiDaXong(page, "Buổi sửa lời nút menu");

    await page.goto(`/s/${sessionId}?tab=transcript`);
    await expect(page.getByText("bảng tính vay 50%").first()).toBeVisible({ timeout: 15_000 });

    // Dòng gợi ý lần đầu (buổi thật): kèm link Xem mẹo tới /help, đóng được
    // và ẩn vĩnh viễn (localStorage)
    const hint = page.getByTestId("edit-hint");
    await expect(hint).toBeVisible();
    await expect(hint.getByRole("link", { name: "Xem mẹo" })).toHaveAttribute("href", "/help");
    await hint.getByRole("button", { name: "Đóng gợi ý" }).click();
    await expect(hint).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("bảng tính vay 50%").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("edit-hint")).toHaveCount(0);

    // Nút ⋯ hiện trên MỌI màn hình (cũ bị hidden lg:flex — điện thoại không
    // tìm ra chỗ sửa): từng đoạn có nút, vùng chạm đủ 44px
    const menuBtn = page.getByRole("button", { name: "Thao tác với đoạn lời lúc 00:00" }).first();
    await expect(menuBtn).toBeVisible();
    const box = await menuBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);

    // Menu: Sửa lời, Đổi người nói đứng trước các mục cũ (so thứ tự trong DOM
    // của hộp thoại, tránh so vị trí lúc bảng đang trượt)
    await menuBtn.click();
    const suaLoi = page.getByRole("button", { name: "Sửa lời" });
    const doiNguoiNoi = page.getByRole("button", { name: "Đổi người nói" });
    await expect(suaLoi).toBeVisible();
    await expect(doiNguoiNoi).toBeVisible();
    const domOrder = await page.evaluate(() => {
      const text = document.querySelector('[role="dialog"]')?.textContent ?? "";
      const sua = text.indexOf("Sửa lời");
      const doi = text.indexOf("Đổi người nói");
      const sao = text.indexOf("Sao chép");
      return sua >= 0 && doi > sua && sao > doi;
    });
    expect(domOrder).toBe(true);

    await page.request.delete(`/api/data/sessions/${sessionId}`);
  });

  test("thêm người nói mới: đoạn chuyển Người nói 3, đầu buổi 3 người, tỉ lệ nói đổi, tải lại vẫn đúng", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoiDaXong(page, "Buổi thêm người nói");

    // Dựng tình huống: sg-2 đổi về SPK_01 để có đoạn liền kề cùng người cũ
    const res = await goiAction(page.request, sessionId, { type: "reassignSegment", segmentId: "sg-2", speakerId: "SPK_01" });
    expect(res.status()).toBe(200);

    await page.goto(`/s/${sessionId}?tab=transcript`);
    await expect(page.getByText("bảng tính vay 50%").first()).toBeVisible({ timeout: 15_000 });

    // Mở menu đoạn 1 → Đổi người nói → Người nói mới
    await page.getByRole("button", { name: "Thao tác với đoạn lời lúc 00:00" }).first().click();
    await page.getByRole("button", { name: "Đổi người nói" }).click();
    await page.getByRole("button", { name: "Người nói mới", exact: true }).click();
    await expect(page.getByText("Đã thêm người nói mới")).toBeVisible();

    // Hỏi thêm một lần (không bắt buộc): sg-2 và sg-3 liền sau cùng người cũ SPK_01
    await expect(page.getByText("Đổi luôn 2 đoạn liền sau của cùng người nói?")).toBeVisible();
    await page.getByRole("button", { name: "Để nguyên" }).click();
    await expect(page.getByText("Đổi luôn 2 đoạn liền sau của cùng người nói?")).toHaveCount(0);

    // Đoạn 1 mang nhãn người nói mới; đầu buổi hiện 3 người (Bạn, Người nói 2, Người nói 3)
    await expect(page.getByText("Người nói 3").first()).toBeVisible({ timeout: 15_000 });
    const chuBan = page.getByRole("button", { name: "Đổi tên người nói: Bạn" });
    await expect(chuBan).toBeVisible();
    await expect(page.getByRole("button", { name: "Đổi tên người nói: Người nói 2" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Đổi tên người nói: Người nói 3" })).toBeVisible();

    // Tỉ lệ nói đổi: visuals trả 3 người, người mới có tỉ lệ > 0
    const visuals = (await (await page.request.get(`/api/data/sessions/${sessionId}/visuals`)).json()) as {
      visuals: { talk_share: Array<{ speaker_id: string; percent: number }> };
    };
    expect(visuals.visuals.talk_share.length).toBe(3);
    const spk3 = visuals.visuals.talk_share.find((s) => s.speaker_id === "SPK_03");
    expect(spk3).toBeDefined();
    expect(spk3!.percent).toBeGreaterThan(0);

    // Tải lại trang vẫn đúng
    await page.reload();
    await expect(page.getByRole("button", { name: "Đổi tên người nói: Người nói 3" })).toBeVisible({ timeout: 15_000 });
    const detail = await docDetail(page.request, sessionId);
    expect(detail.speakers.length).toBe(3);

    await page.request.delete(`/api/data/sessions/${sessionId}`);
  });

  test("đổi các đoạn liền sau: chỉ đoạn liền kề cùng người cũ bị đổi, người khác giữ nguyên", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoiDaXong(page, "Buổi đổi đoạn liền sau");

    // Bản chữ giả: sg-1 SPK_01, sg-2 SPK_02, sg-3 SPK_01, sg-4 SPK_02, sg-5 SPK_01.
    // Đổi sg-2 về SPK_01 → sg-1, sg-2, sg-3 liền nhau cùng SPK_01, sg-4 là người khác.
    expect((await goiAction(page.request, sessionId, { type: "reassignSegment", segmentId: "sg-2", speakerId: "SPK_01" })).status()).toBe(200);

    // Thêm người nói mới gán sg-1: máy chủ trả các đoạn LIỀN SAU cùng SPK_01
    // = [sg-2, sg-3], dừng ở sg-4 (SPK_02)
    const res = await goiAction(page.request, sessionId, { type: "addSpeakerAndReassign", segmentId: "sg-1" });
    expect(res.status()).toBe(200);
    const added = (await res.json()) as { speaker_id: string; following_ids: string[] };
    expect(added.speaker_id).toBe("SPK_03");
    expect(added.following_ids).toEqual(["sg-2", "sg-3"]);

    // Chỉ đổi đoạn liền kề: sg-4 (người khác) không bị kéo theo
    expect((await goiAction(page.request, sessionId, { type: "reassignSegments", segmentIds: added.following_ids, speakerId: added.speaker_id })).status()).toBe(200);
    const segs = await docTranscript(page.request, sessionId);
    expect(segs.find((s) => s.id === "sg-1")!.speaker_id).toBe("SPK_03");
    expect(segs.find((s) => s.id === "sg-2")!.speaker_id).toBe("SPK_03");
    expect(segs.find((s) => s.id === "sg-3")!.speaker_id).toBe("SPK_03");
    expect(segs.find((s) => s.id === "sg-4")!.speaker_id).toBe("SPK_02");
    expect(segs.find((s) => s.id === "sg-5")!.speaker_id).toBe("SPK_01");

    // Người hết đoạn: đổi luôn sg-4 (đoạn cuối của SPK_02) sang SPK_01 thì
    // SPK_02 không còn đoạn nào → tỉ lệ 0 và bị ẨN khỏi tỉ lệ nói (visuals
    // không trả SPK_02), dữ liệu người nói vẫn giữ trong detail
    expect((await goiAction(page.request, sessionId, { type: "reassignSegment", segmentId: "sg-4", speakerId: "SPK_01" })).status()).toBe(200);
    const visuals = (await (await page.request.get(`/api/data/sessions/${sessionId}/visuals`)).json()) as {
      visuals: { talk_share: Array<{ speaker_id: string; percent: number }> };
    };
    const ids = visuals.visuals.talk_share.map((s) => s.speaker_id);
    expect(ids).not.toContain("SPK_02");
    expect(ids).toContain("SPK_03");
    expect(ids).toContain("SPK_01");
    const detail = await docDetail(page.request, sessionId);
    expect(detail.speakers.length).toBe(3); // dữ liệu SPK_02 vẫn giữ, không xóa

    await page.request.delete(`/api/data/sessions/${sessionId}`);
  });

  test("sửa lời lưu xong tải lại vẫn còn; ô sửa không đảo chữ khi bộ gõ soạn dấu", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoiDaXong(page, "Buổi sửa lời lưu lại");

    await page.goto(`/s/${sessionId}?tab=transcript`);
    await expect(page.getByText("bảng tính vay 50%").first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Thao tác với đoạn lời lúc 00:00" }).first().click();
    await page.getByRole("button", { name: "Sửa lời" }).click();

    // Ô sửa tự quản giá trị (uncontrolled): giả lập chuỗi soạn dấu — giá trị
    // đặt giữa lúc soạn KHÔNG bị React ghi đè ngược, xong soạn chữ nguyên vẹn
    const editBox = page.locator("textarea[aria-label='Sửa lời']");
    await editBox.fill("Dạ em chào anh, em gửi lại bảng tính vay 50% giá trị căn hộ cho anh nhé.");
    await page.evaluate(() => {
      const el = document.querySelector<HTMLTextAreaElement>("textarea[aria-label='Sửa lời']");
      if (!el) throw new Error("thiếu ô sửa lời");
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      el.focus();
      el.dispatchEvent(new Event("compositionstart", { bubbles: true }));
      for (const partial of ["Ch", "Cha", "Chana", "Chanaa"]) {
        setter.call(el, partial);
        el.dispatchEvent(new InputEvent("input", { bubbles: true, data: partial.slice(-1), isComposing: true }));
      }
      setter.call(el, "Chân");
      el.dispatchEvent(new Event("compositionend", { bubbles: true }));
    });
    await expect(editBox).toHaveValue("Chân");

    // Lưu: máy chủ nhận đúng chữ, tải lại trang vẫn còn (nút Lưu trong form sửa)
    await page.locator("form").getByRole("button", { name: "Lưu" }).click();
    await expect(page.getByText("Đã lưu bản ghi lời")).toBeVisible();
    const segs = await docTranscript(page.request, sessionId);
    expect(segs.find((s) => s.id === "sg-1")!.text_clean).toBe("Chân");

    await page.reload();
    await expect(page.getByText("Chân", { exact: true }).first()).toBeVisible({ timeout: 15_000 });

    // Sửa xong: buổi đánh dấu cần tóm tắt lại (mục 4 dùng bài riêng kiểm băng)
    const detail = await docDetail(page.request, sessionId);
    expect(detail.transcript_stale).toBe(true);

    await page.request.delete(`/api/data/sessions/${sessionId}`);
  });

  test("băng Tóm tắt lại: hiện sau khi sửa, tóm tắt lại xong gỡ băng, bản dịch lỗi thời, việc đã tick và tự thêm được giữ", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoiDaXong(page, "Buổi tóm tắt lại");

    // Có bản dịch tóm tắt (bản thật bằng AI giả) + đã tick một việc + tự thêm một việc
    const verRes = await page.request.post(`/api/data/sessions/${sessionId}/summaries`, { data: { lang: "en" } });
    expect(verRes.status()).toBe(200);
    expect(((await verRes.json()) as { version: { stale: boolean } }).version.stale).toBe(false);
    const tickRes = await page.request.post("/api/data/tasks", { data: { id: "a-1" } });
    expect(tickRes.status()).toBe(200);
    const addRes = await page.request.put("/api/data/tasks", {
      data: {
        id: "a-user-e2e",
        session_id: sessionId,
        task: "Việc tự thêm của e2e",
        assignee_contact_id: null,
        due_date: null,
        priority: "medium",
        done: false,
        done_at: null,
        source_quote: null,
        timestamp_sec: null,
      },
    });
    expect(addRes.status()).toBe(200);

    // Sửa lời → tab Tóm tắt hiện băng kèm nút Tóm tắt lại
    expect((await goiAction(page.request, sessionId, { type: "updateSegment", segmentId: "sg-1", text: "Dạ em chào lại cho đúng.", field: "text_clean" })).status()).toBe(200);
    await page.goto(`/s/${sessionId}?tab=summary`);
    const banner = page.getByTestId("resummarize-banner");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner.getByText("Bạn đã sửa lời. Tóm tắt lại để cập nhật tóm tắt và việc cần làm.")).toBeVisible();
    await banner.getByRole("button", { name: "Tóm tắt lại" }).click();

    // Luồng asr_stage sẵn có đẩy tới xong (màn xử lý + ProcessingWatcher tự
    // đẩy; bài chủ động gọi process để không phụ thuộc nhịp 3,5 giây)
    await choReady(page.request, sessionId);

    // Xong: gỡ băng, đếm 1 lượt, bản dịch chuyển lỗi thời, việc giữ nguyên
    await page.reload();
    await expect(page.getByTestId("resummarize-banner")).toHaveCount(0);
    const detail = await docDetail(page.request, sessionId);
    expect(detail.transcript_stale).toBe(false);
    expect(detail.resummarize_count).toBe(1);
    const en = (await (await page.request.get(`/api/data/sessions/${sessionId}/summaries?lang=en`)).json()) as { version: { stale: boolean } };
    expect(en.version.stale).toBe(true);
    const tasks = (await (await page.request.get("/api/data/tasks")).json()) as { items: Array<{ id: string; done: boolean; task: string }> };
    expect(tasks.items.find((t) => t.id === "a-1")!.done).toBe(true);
    expect(tasks.items.find((t) => t.id === "a-user-e2e")!.task).toBe("Việc tự thêm của e2e");

    await page.request.delete(`/api/data/sessions/${sessionId}`);
    await page.request.delete("/api/data/tasks", { data: { id: "a-user-e2e" } }).catch(() => undefined);
  });

  test("gói Free: lần thứ 4 bị chặn 429 TRƯỚC khi gọi AI, lỗi giả không trừ lượt", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoiDaXong(page, "Buổi hạn mức tóm tắt lại");
    expect((await goiAction(page.request, sessionId, { type: "updateSegment", segmentId: "sg-1", text: "sửa lần đầu", field: "text_clean" })).status()).toBe(200);

    // Lỗi giả (mốc [failsum] trong tiêu đề): 502, KHÔNG đổi trạng thái,
    // KHÔNG trừ lượt
    expect((await page.request.patch(`/api/data/sessions/${sessionId}`, { data: { title: "Buổi hạn mức [failsum]" } })).status()).toBe(200);
    const failRes = await goiAction(page.request, sessionId, { type: "resummarize" });
    expect(failRes.status()).toBe(502);
    expect(((await failRes.json()) as { error: string }).error).toBe("resummarize_failed");
    expect((await docDetail(page.request, sessionId)).status).toBe("ready");
    expect((await docDetail(page.request, sessionId)).resummarize_count).toBe(0);

    // Gỡ mốc lỗi: 3 lần tóm tắt lại thành công (Free được 3)
    expect((await page.request.patch(`/api/data/sessions/${sessionId}`, { data: { title: "Buổi hạn mức tóm tắt lại" } })).status()).toBe(200);
    for (let lan = 1; lan <= 3; lan++) {
      const r = await goiAction(page.request, sessionId, { type: "resummarize" });
      expect(r.status()).toBe(200);
      await choReady(page.request, sessionId);
      // Sửa lại lời để lần sau còn băng (không bắt buộc cho máy chủ, giữ đúng tình huống)
      await goiAction(page.request, sessionId, { type: "updateSegment", segmentId: "sg-1", text: `sửa lần ${lan}`, field: "text_clean" });
    }
    expect((await docDetail(page.request, sessionId)).resummarize_count).toBe(3);

    // Lần thứ 4: 429 quota_exceeded, buổi KHÔNG vào xử lý (chặn trước khi gọi AI)
    const overRes = await goiAction(page.request, sessionId, { type: "resummarize" });
    expect(overRes.status()).toBe(429);
    expect(((await overRes.json()) as { error: string }).error).toBe("quota_exceeded");
    const detail = await docDetail(page.request, sessionId);
    expect(detail.status).toBe("ready");
    expect(detail.asr_stage).toBe("done");

    await page.request.delete(`/api/data/sessions/${sessionId}`);
  });

  test("Gemini lỗi giữa lúc tóm tắt lại: buổi giữ trạng thái xong, lời đã sửa còn nguyên, không đếm lượt, Thử lại không chép lời lại", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoiDaXong(page, "Buổi lỗi giữa chừng");
    const EDITED = "Lời đã sửa không được mất.";
    expect((await goiAction(page.request, sessionId, { type: "updateSegment", segmentId: "sg-1", text: EDITED, field: "text" })).status()).toBe(200);
    // Mốc [failrun]: lỗi AI xảy ra TRONG luồng (sau khi nhận yêu cầu)
    expect((await page.request.patch(`/api/data/sessions/${sessionId}`, { data: { title: "Buổi lỗi giữa chừng [failrun]" } })).status()).toBe(200);
    expect((await goiAction(page.request, sessionId, { type: "resummarize" })).status()).toBe(200);
    await choReady(page.request, sessionId);

    const after = await docDetail(page.request, sessionId);
    expect(after.status).toBe("ready");
    expect(after.resummarize_count).toBe(0);
    expect(after.transcript_stale).toBe(true);
    const segs = await docTranscript(page.request, sessionId);
    expect(segs.find((x) => x.id === "sg-1")!.text).toBe(EDITED);

    await page.request.delete(`/api/data/sessions/${sessionId}`);
  });

  test("quyền: người khác 403 với mọi action sửa lời/người nói/tóm tắt lại, chưa đăng nhập 401", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await dangNhapDemo(pageA);
    const sessionA = await taoBuoiDaXong(pageA, "Buổi quyền sửa lời");

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await dangNhapNguoiB(pageB);
    for (const action of [
      { type: "updateSegment", segmentId: "sg-1", text: "sửa trộm", field: "text_clean" },
      { type: "reassignSegment", segmentId: "sg-1", speakerId: "SPK_02" },
      { type: "addSpeakerAndReassign", segmentId: "sg-1" },
      { type: "resummarize" },
    ]) {
      expect((await goiAction(pageB.request, sessionA, action)).status()).toBe(403);
    }

    const anon = await browser.newContext();
    const pageAnon = await anon.newPage();
    for (const action of [
      { type: "addSpeakerAndReassign", segmentId: "sg-1" },
      { type: "resummarize" },
    ]) {
      expect((await goiAction(pageAnon.request, sessionA, action)).status()).toBe(401);
    }

    await pageA.request.delete(`/api/data/sessions/${sessionA}`);
    await ctxA.close();
    await ctxB.close();
    await anon.close();
  });

  test("trang /help mở được bằng cả 3 ngôn ngữ, có mục dẫn trong Cài đặt", async ({ page }) => {
    // Tiếng Việt (mặc định e2e)
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: "Mẹo ghi âm và câu hỏi thường gặp" })).toBeVisible();
    await expect(page.getByText("Đặt máy giữa bàn, gần người nói.")).toBeVisible();
    await expect(page.getByText(/Sửa xong bấm Tóm tắt lại/)).toBeVisible();

    // Cài đặt có mục dẫn tới trang
    await page.goto("/settings");
    await expect(page.getByRole("link", { name: "Mẹo ghi âm và câu hỏi thường gặp" })).toBeVisible();

    // Tiếng Hàn
    await page.context().addCookies([{ name: "noteim-locale", value: "ko", url: "http://localhost:3100" }]);
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: "녹음 팁과 자주 묻는 질문" })).toBeVisible();

    // Tiếng Anh
    await page.context().addCookies([{ name: "noteim-locale", value: "en", url: "http://localhost:3100" }]);
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: "Recording tips and FAQ" })).toBeVisible();
    await expect(page.getByText("Put the phone in the middle of the table", { exact: false })).toBeVisible();
  });
});
