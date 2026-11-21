import { expect, test } from "@playwright/test";

/**
 * Nhịp 2 — chuỗi nhà cung cấp Gap Check (GAP_CHECK_PROVIDERS, đặc tả C1 §5).
 * Server phải chạy với biến môi trường kiểm thử:
 *   GAP_CHECK_FAKE=1 GAP_CHECK_FREE_DAILY=3 GAP_CHECK_PROVIDERS=gemini,anthropic
 *   GAP_CHECK_PROVIDER_TIMEOUT_MS=2000 pnpm start -p 3100
 * Chuỗi chạy qua stub nên không tốn tiền API; bên lỗi ép bằng header
 * `x-noteim-fake-plan` (chỉ nhận khi GAP_CHECK_FAKE bật):
 *   "gemini:500"          → bên gemini trả HTTP 500 → chuyển bên kế
 *   "anthropic:429"       → bên anthropic trả HTTP 429 → chuyển bên kế
 *   "gemini:unconfigured" → bên gemini coi như chưa cấu hình → bỏ qua
 *   "gemini:slow"         → bên gemini treo quá thời hạn → timeout, chuyển bên kế
 * API spec chạy đúng một project (phone) để không đếm lượt hai lần.
 */

test.beforeEach(() => {
  test.skip(test.info().project.name !== "phone", "API spec chỉ chạy một project");
});

const TEMPLATE_ID = "general_meeting";
const TRANSCRIPT_DAI = "Bác: Em chào chị, mình chốt kế hoạch quý này nhé. ".repeat(10);

function clientMoi(): string {
  return `e2e-chain-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface GapCheckAttempt {
  provider: string;
  outcome: "ok" | "unconfigured" | "status" | "timeout" | "parse_error";
  status?: number;
  ms: number;
}

/** Server chưa đặt GAP_CHECK_PROVIDERS thì chuỗi còn một bên "stub" như cũ —
 * spec này chỉ chạy khi chuỗi đã bật (bên đầu là gemini). */
let chuoiDaBat = false;
test.beforeAll(async ({ request }) => {
  const res = await request.post("/api/sessions/e2e-gc-chain-probe/gap-check", {
    headers: { "x-noteim-client": clientMoi() },
    data: { templateId: TEMPLATE_ID, transcript: TRANSCRIPT_DAI },
  });
  if (res.ok()) {
    const json = await res.json();
    chuoiDaBat = json.meta?.provider === "gemini";
  }
});
test.beforeEach(() => {
  test.skip(!chuoiDaBat, "Server chưa đặt GAP_CHECK_PROVIDERS=gemini,anthropic — spec chuỗi nhà cung cấp bỏ qua");
});

function raCua(request: import("@playwright/test").APIRequestContext, sessionId: string, plan?: string) {
  return request.post(`/api/sessions/${sessionId}/gap-check`, {
    headers: { "x-noteim-client": clientMoi(), ...(plan ? { "x-noteim-fake-plan": plan } : {}) },
    data: { templateId: TEMPLATE_ID, transcript: TRANSCRIPT_DAI },
  });
}

test("không ép lỗi: bên đầu chuỗi thành công, meta.provider là bên đầu", async ({ request }) => {
  const res = await raCua(request, `e2e-gc-chain-dau-${Date.now()}`);
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json.meta.provider).toBe("gemini");
  const attempts: GapCheckAttempt[] = json.meta.attempts;
  expect(attempts).toHaveLength(1);
  expect(attempts[0]).toMatchObject({ provider: "gemini", outcome: "ok" });
});

test("bên đầu lỗi HTTP 500 → chuyển bên kế, kết quả là của bên kế", async ({ request }) => {
  const res = await raCua(request, `e2e-gc-chain-500-${Date.now()}`, "gemini:500");
  expect(res.status()).toBe(200);
  const json = await res.json();
  // Kết quả vẫn đúng shape, không phải dữ liệu bịa từ bên lỗi
  expect(json.result.slots_status.length).toBeGreaterThan(0);
  expect(json.meta.provider).toBe("anthropic");
  const attempts: GapCheckAttempt[] = json.meta.attempts;
  expect(attempts).toEqual([
    { provider: "gemini", outcome: "status", status: 500, ms: expect.any(Number) },
    { provider: "anthropic", outcome: "ok", ms: expect.any(Number) },
  ]);
});

test("bên đầu chưa cấu hình → bỏ qua không gọi, bên kế chạy", async ({ request }) => {
  const res = await raCua(request, `e2e-gc-chain-chua-cau-hinh-${Date.now()}`, "gemini:unconfigured");
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json.meta.provider).toBe("anthropic");
  const attempts: GapCheckAttempt[] = json.meta.attempts;
  expect(attempts).toEqual([
    { provider: "gemini", outcome: "unconfigured", ms: expect.any(Number) },
    { provider: "anthropic", outcome: "ok", ms: expect.any(Number) },
  ]);
});

test("bên đầu quá thời hạn → bị cắt đúng luật, chuyển bên kế", async ({ request }) => {
  const t0 = Date.now();
  const res = await raCua(request, `e2e-gc-chain-slow-${Date.now()}`, "gemini:slow");
  const elapsed = Date.now() - t0;
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json.meta.provider).toBe("anthropic");
  const attempts: GapCheckAttempt[] = json.meta.attempts;
  expect(attempts[0]).toMatchObject({ provider: "gemini", outcome: "timeout" });
  expect(attempts[1]).toMatchObject({ provider: "anthropic", outcome: "ok" });
  // Bên chậm bị cắt tại thời hạn của server (2 s) thay vì chờ hết 5 s của stub
  expect(elapsed).toBeLessThan(4500);
});

test("mọi bên trong chuỗi đều lỗi 429/5xx → 503 provider_unavailable, không bịa kết quả", async ({ request }) => {
  const res = await raCua(request, `e2e-gc-chain-het-${Date.now()}`, "gemini:500,anthropic:429");
  expect(res.status()).toBe(503);
  const json = await res.json();
  expect(json.error).toBe("provider_unavailable");
  expect(json.message).toBe("Chưa rà được, thử lại");
  const attempts: GapCheckAttempt[] = json.attempts;
  expect(attempts).toEqual([
    { provider: "gemini", outcome: "status", status: 500, ms: expect.any(Number) },
    { provider: "anthropic", outcome: "status", status: 429, ms: expect.any(Number) },
  ]);
  expect(json.result).toBeUndefined();
});
