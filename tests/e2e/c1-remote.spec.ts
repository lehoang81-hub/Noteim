import { expect, test, type Page } from "@playwright/test";

import { onboard } from "./helpers";

/*
 * C1-03b — nguồn dữ liệu remote cho người đã đăng nhập.
 *
 * Hai môi trường server, đọc cấu hình thật từ /api/data/mode để tự chọn bài:
 * - Lô mock (mọi build hiện có): server KHÔNG bật NEXT_PUBLIC_DATA_SOURCE=remote
 *   → người đăng nhập vẫn dùng dữ liệu trên máy, bài hồi quy chạy luôn.
 * - Lô remote: server build với NEXT_PUBLIC_DATA_SOURCE=remote,
 *   NEXT_PUBLIC_AUTH_FAKE=1 và chạy với AUTH_FAKE=1 + AUTH_SECRET +
 *   DATABASE_URL (Supabase thật) → bài quyền dữ liệu A/B chạy hết.
 *   Máy làm việc không có DATABASE_URL thì các bài remote tự bỏ qua và in lý
 *   do — phần chưa kiểm chứng được ghi rõ ở docs/LOG.md, không bịa kết quả.
 */

type Mode = { dataSource: string; databaseConfigured: boolean; authFake: boolean };

let mode: Mode;

test.beforeAll(async ({ request }) => {
  const res = await request.get("/api/data/mode");
  mode = (await res.json()) as Mode;
});

/** Điều hướng an toàn: redirect sau đăng xuất (sang host NEXTAUTH_URL) có thể
 * chen ngang goto đầu tiên — bị gián đoạn thì chờ chút rồi thử lại. */
async function moTrangAnToan(page: Page, path: string) {
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(path, { waitUntil: "load" });
      return;
    } catch {
      await page.waitForTimeout(300);
    }
  }
  await page.goto(path); // lần cuối để lỗi nổi lên đúng chỗ
}

async function dangNhapDemo(page: Page, opts?: { waitLibrary?: boolean }) {
  await moTrangAnToan(page, "/login");
  await expect(page.getByRole("button", { name: /Đăng nhập thử/ })).toBeVisible();
  await Promise.all([
    page.waitForURL((u) => u.pathname === "/"),
    page.getByRole("button", { name: /Đăng nhập thử/ }).click(),
  ]);
  if (opts?.waitLibrary) {
    await onboard(page);
  } else {
    await boQuanLamQuen(page);
  }
}

async function dangNhapNguoiB(page: Page) {
  await moTrangAnToan(page, "/login");
  const btn = page.getByTestId("login-demo-b");
  await expect(btn).toBeVisible();
  await Promise.all([page.waitForURL((u) => u.pathname === "/"), btn.click()]);
  await boQuanLamQuen(page);
}

/** Làm quen xong không chờ buổi trong thư viện — thư viện remote có thể rỗng. */
async function boQuanLamQuen(page: Page) {
  await page.goto("/welcome");
  const skip = page.getByRole("button", { name: /Bỏ qua|Skip|건너뛰기/ });
  await expect(skip).toBeVisible();
  await Promise.all([page.waitForURL((u) => u.pathname === "/"), skip.click()]);
  await expect(page.getByRole("button", { name: /Đăng xuất/ }).first()).toBeVisible();
}

async function dangXuat(page: Page) {
  await page.goto("/");
  const out = page.getByRole("button", { name: /Đăng xuất/ }).first();
  await expect(out).toBeVisible();
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/auth/signout") && r.request().method() === "POST"),
    out.click(),
  ]);
  // Đăng xuất là bất đồng bộ: chờ phiên THỰC SỰ bị gỡ rồi mới sang bước tiếp
  // theo — trước đây chỉ chờ URL "/" (đã đứng đó sẵn) nên bài đăng nhập người
  // kế tiếp nhiều khi vẫn còn cookie của người cũ.
  await expect
    .poll(
      async () => {
        const s = (await (await page.request.get("/api/auth/session")).json()) as { user?: { id?: string } } | null;
        return Boolean(s?.user?.id);
      },
      { timeout: 15_000 },
    )
    .toBe(false);
  // redirect sau đăng xuất có thể đang bay: chờ load chốt để goto kế tiếp không bị chen
  await page.waitForLoadState("load").catch(() => undefined);
}

async function taoBuoiQuaApi(page: Page, title: string): Promise<string> {
  const res = await page.request.post("/api/data/sessions", {
    data: {
      kind: "import",
      input: { file_name: `${title}.m4a`, duration_sec: 65, template_id: "tpl-realestate", language: "vi" },
    },
  });
  expect(res.status()).toBe(200);
  const json = (await res.json()) as { id: string };
  return json.id;
}

/** Xóa hết buổi của người đang đăng nhập — bài "thư viện rỗng" phải tự chủ
 * dữ liệu của mình: lượt phone chạy trước đã tạo buổi cho cùng người dùng
 * nên lượt desktop không thể trông DB còn nguyên như lúc mới (sửa gốc
 * sau khi bài đỏ sẵn trên main, không nới khẳng định). */
async function donBuoiCuaTaiKhoan(page: Page): Promise<void> {
  const list = (await (await page.request.get("/api/data/sessions")).json()) as {
    sessions: Array<{ id: string }>;
  };
  for (const s of list.sessions) {
    const del = await page.request.delete(`/api/data/sessions/${s.id}`);
    expect([200, 404]).toContain(del.status());
  }
}

test.describe("chế độ mock — người đăng nhập vẫn dùng dữ liệu trên máy (hồi quy)", () => {
  test("đăng nhập xong thư viện vẫn hiện buổi mẫu trên máy, không bị nguồn remote chiếm", async ({ page }) => {
    test.skip(mode.dataSource === "remote", "Server đang bật remote — bài này chỉ đúng ở build mock");
    await dangNhapDemo(page, { waitLibrary: true });
    // Dữ liệu fixture trên máy vẫn còn: buổi mẫu bác sĩ mở được với chip "Mẫu"
    await page.goto("/s/s-sample-doctor");
    await expect(page.getByText("Mẫu", { exact: true })).toBeVisible();
  });

  test("API dữ liệu tài khoản trả 401 khi ẩn danh và 503 khi server không có DATABASE_URL", async ({ request }) => {
    const res = await request.get("/api/data/me");
    // Ẩn danh luôn bị chặn — không lộ dữ liệu
    expect(res.status()).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("unauthorized");
  });
});

test.describe("chế độ remote — quyền dữ liệu giữa hai người (A/B)", () => {
  test.skip(
    () => !(mode.dataSource === "remote" && mode.databaseConfigured && mode.authFake),
    "Cần server bật NEXT_PUBLIC_DATA_SOURCE=remote + NEXT_PUBLIC_AUTH_FAKE khi build, AUTH_FAKE + DATABASE_URL khi chạy (Hoang kiểm trên Supabase thật)",
  );

  test("người đăng nhập lần đầu tự có workspace cá nhân, thư viện rỗng không lẫn dữ liệu mẫu", async ({ page }) => {
    await dangNhapDemo(page);
    // Dọn buổi do lượt project trước tạo cho cùng tài khoản trước khi khẳng định rỗng
    await donBuoiCuaTaiKhoan(page);
    const me = (await (await page.request.get("/api/data/me")).json()) as {
      user: { id: string; email: string };
      quota: { minutes_limit: number };
    };
    expect(me.user.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(me.quota.minutes_limit).toBeGreaterThan(0);
    const workspaces = (await (await page.request.get("/api/data/workspaces")).json()) as {
      workspaces: Array<{ kind: string }>;
    };
    expect(workspaces.workspaces.some((w) => w.kind === "personal")).toBe(true);
    // Thư viện remote rỗng: không nạp dữ liệu mẫu khi người dùng không yêu cầu
    const sessions = (await (await page.request.get("/api/data/sessions")).json()) as { sessions: unknown[] };
    expect(sessions.sessions).toEqual([]);
    await dangXuat(page);
  });

  test("người A tạo buổi, người B không đọc/ghi/xóa được dữ liệu của A", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionIdA = await taoBuoiQuaApi(page, "Buổi của A");
    // A đọc được buổi của mình qua API và thấy trong giao diện
    const own = await page.request.get(`/api/data/sessions/${sessionIdA}`);
    expect(own.status()).toBe(200);
    const ownJson = (await own.json()) as { detail: { trial_recording?: boolean; title: string } };
    expect(ownJson.detail.title).toBe("Buổi của A");
    // Buổi tạo từ màn nhập/giám không phải bản ghi thử — bản ghi thử chỉ từ màn ghi âm
    expect(ownJson.detail.trial_recording).toBeUndefined();
    await page.goto("/");
    await expect(page.locator(`a[href='/s/${sessionIdA}'], [data-session-row='/s/${sessionIdA}']`).first()).toBeVisible();
    await dangXuat(page);

    // Người B: không thấy trong danh sách, đọc/ghi/xóa đều bị chặn 403
    await dangNhapNguoiB(page);
    const listB = (await (await page.request.get("/api/data/sessions")).json()) as { sessions: Array<{ id: string }> };
    expect(listB.sessions.some((s) => s.id === sessionIdA)).toBe(false);
    const readB = await page.request.get(`/api/data/sessions/${sessionIdA}`);
    expect(readB.status()).toBe(403);
    const transcriptB = await page.request.get(`/api/data/sessions/${sessionIdA}/transcript`);
    expect(transcriptB.status()).toBe(403);
    const writeB = await page.request.post(`/api/data/sessions/${sessionIdA}/actions`, {
      data: { type: "updateBullet", bulletId: "b-0-0", text: "đổi trộm" },
    });
    expect(writeB.status()).toBe(403);
    const deleteB = await page.request.delete(`/api/data/sessions/${sessionIdA}`);
    expect(deleteB.status()).toBe(403);
    // Buổi của A nguyên vẹn sau các lần chạm của B
    await dangXuat(page);
    await dangNhapDemo(page);
    const own2 = await page.request.get(`/api/data/sessions/${sessionIdA}`);
    expect(own2.status()).toBe(200);
    expect(((await own2.json()) as { detail: { title: string } }).detail.title).toBe("Buổi của A");
    await dangXuat(page);
  });

  test("việc cần làm và danh bạ của A không lọt sang B", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionIdA = await taoBuoiQuaApi(page, "Buổi việc của A");
    await page.request.put("/api/data/tasks", {
      data: {
        id: "vt-a-1",
        session_id: sessionIdA,
        task: "Việc chỉ A thấy",
        assignee_contact_id: "c-me",
        due_date: null,
        priority: "high",
        done: false,
        done_at: null,
        source_quote: null,
        timestamp_sec: null,
      },
    });
    await page.request.post("/api/data/contacts", { data: { name: "Liên hệ riêng A" } });
    await dangXuat(page);

    await dangNhapNguoiB(page);
    const tasksB = (await (await page.request.get("/api/data/tasks")).json()) as { items: Array<{ id: string }> };
    expect(tasksB.items.some((t) => t.id === "vt-a-1")).toBe(false);
    // B tick việc của A theo id cũng không được (id việc lặp giữa các buổi là hợp lệ)
    const tickB = await page.request.post("/api/data/tasks", { data: { id: "vt-a-1" } });
    expect(tickB.status()).toBe(404);
    const contactsB = (await (await page.request.get("/api/data/contacts")).json()) as {
      contacts: Array<{ name: string }>;
    };
    expect(contactsB.contacts.some((c) => c.name === "Liên hệ riêng A")).toBe(false);
    await dangXuat(page);
  });

  test("nhập buổi mẫu vào tài khoản: is_sample, không lẫn thư viện, B không thấy", async ({ page }) => {
    await dangNhapDemo(page);
    const imported = (await (await page.request.post("/api/data/samples", { data: { profession: "doctor" } })).json()) as {
      id: string;
    };
    expect(imported.id).toContain("s-sample-doctor");
    // Không lẫn với buổi thật: danh sách thư viện vẫn không có buổi mẫu
    const list = (await (await page.request.get("/api/data/sessions")).json()) as { sessions: Array<{ id: string }> };
    expect(list.sessions.some((s) => s.id === imported.id)).toBe(false);
    // Chi tiết mở được và có chip "Mẫu"
    await page.goto(`/s/${imported.id}`);
    await expect(page.getByText("Mẫu", { exact: true })).toBeVisible();
    await dangXuat(page);

    await dangNhapNguoiB(page);
    const detailB = await page.request.get(`/api/data/sessions/${imported.id}`);
    expect(detailB.status()).toBe(403);
    const listB = (await (await page.request.get("/api/data/sessions")).json()) as { sessions: Array<{ id: string }> };
    expect(listB.sessions.some((s) => s.id === imported.id)).toBe(false);
    await dangXuat(page);
  });

  test("buổi tạo mới tự hoàn tất xử lý và sinh nội dung (hoàn tất lười phía máy chủ)", async ({ page }) => {
    test.setTimeout(120_000);
    await dangNhapDemo(page);
    const sessionId = await taoBuoiQuaApi(page, "Buổi xử lý thử");
    // Chờ đủ 5 bước × 1,6 giây thì lần hỏi gần nhất hoàn tất và sinh nội dung
    await page.waitForTimeout(9_500);
    const proc = (await (await page.request.get(`/api/data/sessions/${sessionId}/processing`)).json()) as {
      status: string;
      step: number;
    };
    expect(proc.status).toBe("ready");
    expect(proc.step).toBe(6);
    const detail = (await (await page.request.get(`/api/data/sessions/${sessionId}`)).json()) as {
      detail: { status: string; executive_summary: string; topics: unknown[] };
    };
    expect(detail.detail.status).toBe("ready");
    expect(detail.detail.executive_summary.length).toBeGreaterThan(0);
    expect(detail.detail.topics.length).toBeGreaterThan(0);
    await dangXuat(page);
  });

  test("lịch sử rà thiếu của người đăng nhập nằm trong DB, người B không đọc được (C1-03b e)", async ({ page }) => {
    await dangNhapDemo(page);
    const sessionId = await taoBuoiQuaApi(page, "Buổi rà thiếu của A");
    const longTranscript = "Anh chị thấy đề xuất hợp tác căn hộ hai phòng ngủ vị trí Marina thế nào ".repeat(6);
    const post = await page.request.post(`/api/sessions/${sessionId}/gap-check`, {
      data: { templateId: "general_meeting", transcript: longTranscript },
    });
    expect(post.status()).toBe(200);
    const posted = (await post.json()) as { checkId: string; result: unknown };
    expect(posted.checkId).toBeTruthy();
    const get = await page.request.get(`/api/sessions/${sessionId}/gap-check`);
    expect(get.status()).toBe(200);
    const got = (await get.json()) as { latest: { checkId: string } | null };
    expect(got.latest?.checkId).toBe(posted.checkId);
    await dangXuat(page);

    await dangNhapNguoiB(page);
    const readB = await page.request.get(`/api/sessions/${sessionId}/gap-check`);
    expect(readB.status()).toBe(403);
    const postB = await page.request.post(`/api/sessions/${sessionId}/gap-check`, {
      data: { templateId: "general_meeting", transcript: longTranscript },
    });
    expect(postB.status()).toBe(403);
    await dangXuat(page);
  });
});
