import { test, expect } from "@playwright/test";

/**
 * GC-02 (b4/gc-02-api) — kiểm e2e endpoint Gap Check bằng provider stub.
 * Server phải chạy với biến môi trường kiểm thử:
 *   GAP_CHECK_FAKE=1 GAP_CHECK_FREE_DAILY=3 pnpm start -p 3100
 * Stub trả kết quả xác định theo đặc tả v1.1 §2: transcript dài (> 200 ký tự) →
 * mọi ô filled=true; rỗng/rác (≤ 200 ký tự) → mọi ô filled=false, không bịa evidence.
 * API spec chạy đúng một project (phone) để không đếm lượt hai lần.
 */

test.beforeEach(() => {
  test.skip(test.info().project.name !== "phone", "API spec chỉ chạy một project");
});

const TEMPLATE_ID = "general_meeting";
const TEMPLATE_KEYS = ["main_purpose", "next_action", "agreed_timeline", "open_items"];
const TRANSCRIPT_DAI = "Bác: Em chào chị, mình chốt kế hoạch quý này nhé. ".repeat(10);
const TRANSCRIPT_RAC = "ksjf ăsđ ơưe ~~~ 0123 /*- err kwe";

function clientMoi(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

test("rà với transcript dài (stub) trả đủ ô, đúng shape và meta", async ({ request }) => {
  const res = await request.post(`/api/sessions/e2e-gc-ok/gap-check`, {
    headers: { "x-noteim-client": clientMoi() },
    data: { templateId: TEMPLATE_ID, transcript: TRANSCRIPT_DAI, transcriptUntilMs: 125000 },
  });
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json.templateId).toBe(TEMPLATE_ID);
  expect(json.meta.provider).toBe("stub");
  expect(json.meta.limit).toBe(3); // server chạy với GAP_CHECK_FREE_DAILY=3
  expect(json.meta.remaining).toBe(2);
  expect(json.checkId).toBeTruthy();
  const keys = json.result.slots_status.map((slot: { key: string }) => slot.key).sort();
  expect(keys).toEqual([...TEMPLATE_KEYS].sort());
  expect(json.result.ready_to_close).toBe(true);
  for (const slot of json.result.slots_status) {
    expect(slot.filled).toBe(true);
    expect(slot.confidence).toBe("high");
    expect(slot.evidence.length).toBeGreaterThan(0);
  }
  expect(json.result.missing_priorities).toEqual([]);
});

test("transcript rỗng → mọi ô filled=false, không bịa dữ liệu", async ({ request }) => {
  const res = await request.post(`/api/sessions/e2e-gc-rong-${Date.now()}/gap-check`, {
    headers: { "x-noteim-client": clientMoi() },
    data: { templateId: TEMPLATE_ID, transcript: "" },
  });
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json.result.ready_to_close).toBe(false);
  for (const slot of json.result.slots_status) {
    expect(slot.filled).toBe(false);
    expect(slot.evidence).toBe("");
  }
  expect(json.result.missing_priorities.length).toBeGreaterThan(0);
  expect(json.result.missing_priorities.length).toBeLessThanOrEqual(3);
  for (const missing of json.result.missing_priorities) {
    expect(TEMPLATE_KEYS).toContain(missing.key);
    expect(missing.question.length).toBeGreaterThan(0);
    expect(missing.why_missing.length).toBeGreaterThan(0);
  }
});

test("transcript rác từ ghi xa micro → shape hợp lệ, không bịa evidence", async ({ request }) => {
  const res = await request.post(`/api/sessions/e2e-gc-rac-${Date.now()}/gap-check`, {
    headers: { "x-noteim-client": clientMoi() },
    data: { templateId: TEMPLATE_ID, transcript: TRANSCRIPT_RAC },
  });
  expect(res.status()).toBe(200);
  const json = await res.json();
  for (const slot of json.result.slots_status) {
    expect(slot.filled).toBe(false);
    expect(slot.evidence).toBe("");
  }
});

test("template lạ → 400 template_not_found", async ({ request }) => {
  const res = await request.post(`/api/sessions/e2e-gc-sai/gap-check`, {
    headers: { "x-noteim-client": clientMoi() },
    data: { templateId: "khong ton tai", transcript: TRANSCRIPT_DAI },
  });
  expect(res.status()).toBe(400);
  const json = await res.json();
  expect(json.error).toBe("template_not_found");
});

test("thân yêu cầu sai cấu trúc → 400 bad_request", async ({ request }) => {
  const res = await request.post(`/api/sessions/e2e-gc-sai/gap-check`, {
    headers: { "x-noteim-client": clientMoi() },
    data: { transcript: TRANSCRIPT_DAI }, // thiếu templateId
  });
  expect(res.status()).toBe(400);
  const json = await res.json();
  expect(json.error).toBe("bad_request");
});

test("free vượt lượt trong ngày → 429 sau đủ lượt", async ({ request }) => {
  const client = `e2e-gioi-han-${Date.now()}`;
  const statuses: number[] = [];
  for (let lan = 1; lan <= 5; lan += 1) {
    const res = await request.post(`/api/sessions/e2e-gc-limit-${lan}/gap-check`, {
      headers: { "x-noteim-client": client },
      data: { templateId: TEMPLATE_ID, transcript: TRANSCRIPT_DAI },
    });
    statuses.push(res.status());
  }
  expect(statuses.slice(0, 3)).toEqual([200, 200, 200]); // GAP_CHECK_FREE_DAILY=3
  expect(statuses[3]).toBe(429);
  expect(statuses[4]).toBe(429);
  const json = await (await request.post(`/api/sessions/e2e-gc-limit-x/gap-check`, {
    headers: { "x-noteim-client": client },
    data: { templateId: TEMPLATE_ID, transcript: TRANSCRIPT_DAI },
  })).json();
  expect(json.error).toBe("rate_limited");
  expect(json.limit).toBe(3);
  expect(json.remaining).toBe(0);
});

test("pro header không bị giới hạn lượt", async ({ request }) => {
  const client = `e2e-pro-${Date.now()}`;
  for (let lan = 1; lan <= 5; lan += 1) {
    const res = await request.post(`/api/sessions/e2e-gc-pro-${lan}/gap-check`, {
      headers: { "x-noteim-client": client, "x-noteim-plan": "pro" },
      data: { templateId: TEMPLATE_ID, transcript: TRANSCRIPT_DAI },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.meta.remaining).toBeNull();
    expect(json.meta.limit).toBeNull();
  }
});

test("GET buổi chưa rà → latest null, history rỗng", async ({ request }) => {
  const res = await request.get(`/api/sessions/e2e-gc-trang-${Date.now()}/gap-check`);
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json.latest).toBeNull();
  expect(json.history).toEqual([]);
});

test("history tối đa 10 lần/buổi, latest là lần gần nhất", async ({ request }) => {
  const sessionId = `e2e-gc-lich-su-${Date.now()}`;
  for (let lan = 1; lan <= 12; lan += 1) {
    const res = await request.post(`/api/sessions/${sessionId}/gap-check`, {
      headers: { "x-noteim-client": clientMoi() },
      data: { templateId: TEMPLATE_ID, transcript: TRANSCRIPT_DAI, transcriptUntilMs: lan * 10000 },
    });
    expect(res.status()).toBe(200);
  }
  const res = await request.get(`/api/sessions/${sessionId}/gap-check`);
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json.history.length).toBe(10); // đặc tả §3: giữ tối đa 10 lần/buổi
  expect(json.latest.result.ready_to_close).toBe(true);
  expect(json.latest.transcriptUntilMs).toBe(120000); // lần 12 là lần gần nhất
  expect(json.latest.templateId).toBe(TEMPLATE_ID);
});
