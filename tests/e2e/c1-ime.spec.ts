import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/*
 * C1-08 mục 1 — ô tìm kiếm an toàn với bộ gõ có lúc soạn (IME).
 *
 * Lỗi thật trên Android (bộ gõ Telex tiếng Việt): gõ "Lê Chân" thì con trỏ
 * nhảy, chữ bị đảo. Sửa trong components/ui/form.tsx: trong lúc soạn
 * (compositionstart → compositionend) SearchField chỉ giữ giá trị cục bộ,
 * KHÔNG đẩy bộ lọc lên cha; xong soạn mới đẩy một lần. type="text" +
 * inputMode="search" thay type="search".
 *
 * Playwright không gõ được IME thật của Android — bài này giả lập đúng chuỗi
 * sự kiện composition (compositionstart, input với isComposing, compositionend)
 * trên ô nhập thật. Phần CHƯA kiểm chứng trên máy thật (Telex Gboard) được
 * ghi rõ ở docs/LOG.md, không bịa kết quả.
 *
 * Máy chủ phải chạy với R2_FAKE=1 + SONIOX_FAKE=1 + GEMINI_FAKE=1 + AUTH_FAKE
 * + DATABASE_URL (đọc /api/data/mode để tự bỏ qua khi thiếu cấu hình).
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

/** Mở tab Lời của buổi đã xử lý xong và lấy ô tìm kiếm. */
async function moTabLoi(page: Page, sessionId: string) {
  await page.goto(`/s/${sessionId}?tab=transcript`);
  const input = page.locator('input[data-search-input="true"]');
  await expect(input).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("bảng tính vay 50%").first()).toBeVisible({ timeout: 15_000 });
  return input;
}

test.describe("C1-08 mục 1 — ô tìm kiếm an toàn bộ gõ có lúc soạn", () => {
  test.skip(
    () => !canRun(),
    "Cần server chạy với R2_FAKE=1 + SONIOX_FAKE=1 + GEMINI_FAKE=1 + AUTH_FAKE + DATABASE_URL",
  );

  test("gõ thường vẫn lọc ngay từng phím, chỗ khớp và nút xóa hoạt động như cũ", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoi(page.request, "Buổi tìm gõ thường");
    await taiLen(page.request, sessionId);
    const state = await dayLuong(page.request, sessionId);
    expect(state.status).toBe("ready");

    const input = await moTabLoi(page, sessionId);
    await input.click();

    // Gõ từng phím ASCII (không composition): bộ lọc chạy ngay — "18.06" có
    // trong bản chữ giả ("hai căn 18.06") nên có chỗ khớp
    await page.keyboard.type("18.06", { delay: 60 });
    await expect(page.getByRole("button", { name: "Chỗ khớp trước" })).toBeVisible();
    await expect(page.getByText(/Không có đoạn nào chứa/)).toHaveCount(0);

    // Chữ có dấu qua một sự kiện chèn (insertText, đúng cơ chế IME không soạn):
    // bộ lọc nhận nguyên văn và ô giữ nguyên chữ
    await page.keyboard.insertText("Lê Chân");
    await expect(input).toHaveValue("18.06Lê Chân");
    await expect(page.getByText("Không có đoạn nào chứa “18.06Lê Chân”.", { exact: true })).toBeVisible();

    // Nút xóa riêng của app: trống ô + hủy lọc
    await page.getByRole("button", { name: "Xóa từ tìm" }).click();
    await expect(input).toHaveValue("");
    await expect(page.getByRole("button", { name: "Chỗ khớp trước" })).toHaveCount(0);

    // fill (sự kiện input không composition, có dấu): vẫn lọc ngay
    await input.fill("18.06");
    await expect(page.getByRole("button", { name: "Chỗ khớp trước" })).toBeVisible();

    await page.request.delete(`/api/data/sessions/${sessionId}`);
  });

  test("lúc soạn dấu không đẩy bộ lọc giữa chừng, xong soạn bộ lọc nhận nguyên chữ một lần", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoi(page.request, "Buổi tìm soạn dấu");
    await taiLen(page.request, sessionId);
    const state = await dayLuong(page.request, sessionId);
    expect(state.status).toBe("ready");

    const input = await moTabLoi(page, sessionId);
    await input.click();

    // Giả lập bộ gõ bắt đầu soạn "Chân": các lần gõ giữa lúc soạn chưa hoàn
    // chỉnh ("Ch", "Cha", "Chana", "Chanaa") KHÔNG được đẩy lên cha — nếu
    // đẩy, bộ lọc sẽ báo "không có đoạn nào chứa" giữa lúc soạn (hành vi cũ
    // gây nhảy con trỏ trên máy thật)
    await page.evaluate(() => {
      const el = document.querySelector<HTMLInputElement>('input[data-search-input="true"]');
      if (!el) throw new Error("thiếu ô tìm kiếm");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      el.focus();
      el.dispatchEvent(new Event("compositionstart", { bubbles: true }));
      for (const partial of ["Ch", "Cha", "Chana", "Chanaa"]) {
        setter.call(el, partial);
        el.dispatchEvent(new InputEvent("input", { bubbles: true, data: partial.slice(-1), isComposing: true }));
      }
    });
    await expect(page.getByText(/Không có đoạn nào chứa/)).toHaveCount(0);
    await expect(input).toHaveValue("Chanaa");

    // Kết thúc soạn: chữ hoàn chỉnh nguyên vẹn trong ô (không bị đảo, không
    // mất dấu) và bộ lọc nhận đúng một lần
    await page.evaluate(() => {
      const el = document.querySelector<HTMLInputElement>('input[data-search-input="true"]');
      if (!el) throw new Error("thiếu ô tìm kiếm");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(el, "Chân");
      el.dispatchEvent(new Event("compositionend", { bubbles: true }));
    });
    await expect(input).toHaveValue("Chân");
    await expect(page.getByText("Không có đoạn nào chứa “Chân”.", { exact: true })).toBeVisible();

    // Xóa bằng nút app sau khi soạn vẫn hoạt động
    await page.getByRole("button", { name: "Xóa từ tìm" }).click();
    await expect(input).toHaveValue("");

    await page.request.delete(`/api/data/sessions/${sessionId}`);
  });

  test("gõ chữ Hàn qua composition: xong soạn giữ nguyên chữ, bộ lọc chạy đúng", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoi(page.request, "Buổi tìm chữ Hàn");
    await taiLen(page.request, sessionId);
    const state = await dayLuong(page.request, sessionId);
    expect(state.status).toBe("ready");

    const input = await moTabLoi(page, sessionId);
    await input.click();

    // Chữ Hàn gõ bằng IME luôn có lúc soạn: "한" = "ㅎ" + "ㅏ" + "ㄴ" ghép dần
    await page.evaluate(() => {
      const el = document.querySelector<HTMLInputElement>('input[data-search-input="true"]');
      if (!el) throw new Error("thiếu ô tìm kiếm");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      el.focus();
      el.dispatchEvent(new Event("compositionstart", { bubbles: true }));
      for (const partial of ["ㅎ", "하", "한"]) {
        setter.call(el, partial);
        el.dispatchEvent(new InputEvent("input", { bubbles: true, data: partial.slice(-1), isComposing: true }));
      }
      el.dispatchEvent(new Event("compositionend", { bubbles: true }));
    });
    await expect(input).toHaveValue("한");
    await expect(page.getByText("Không có đoạn nào chứa “한”.", { exact: true })).toBeVisible();

    await page.request.delete(`/api/data/sessions/${sessionId}`);
  });
});
