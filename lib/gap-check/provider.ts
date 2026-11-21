// Nhịp 2 — chuỗi nhà cung cấp cho Gap Check (yêu cầu nhịp 2; đặc tả C1 §5 mục
// "Nhà cung cấp AI"). GAP_CHECK_PROVIDERS (mặc định "zai,gemini,anthropic") liệt kê
// bên theo thứ tự ưu tiên: bên nào không cấu hình được (thiếu khóa, SDK lỗi),
// lỗi HTTP 429/5xx, hay quá thời hạn 8 giây thì chuyển bên kế tiếp. Parse sai
// (model trả không đúng luật) cũng chuyển bên kế tiếp. Hết chuỗi → GapCheckChainError
// → route trả 503. Tuyệt đối không tự chế kết quả. Log mỗi lượt chỉ ghi tên bên,
// mã lỗi và thời gian — không bao giờ ghi transcript hay evidence.
//
// Stub kiểm thử (GAP_CHECK_FAKE=1) đi qua đúng logic chuỗi: GAP_CHECK_PROVIDERS
// không đặt → một bên "stub" như cũ (specs cũ không đổi); đặt thì mỗi tên là một
// bên stub, ép lỗi từng bên bằng header `x-noteim-fake-plan` (chỉ nhận khi FAKE bật):
//   "gemini:500"           → bên gemini trả HTTP 500 (chuyển bên kế)
//   "gemini:429"           → bên gemini trả HTTP 429 (chuyển bên kế)
//   "gemini:unconfigured"  → bên gemini bị coi là chưa cấu hình (bỏ qua, không đếm lượt gọi)
//   "gemini:slow"          → bên gemini treo quá thời hạn → timeout, chuyển bên kế

import type { GapCheckResult } from "./types";
import type { IntakeTemplate } from "@/lib/intake-templates";

export interface GapCheckProviderInput {
  system: string;
  user: string;
  template: IntakeTemplate;
  transcript: string;
  /** Chỉ dùng khi GAP_CHECK_FAKE bật: ép lỗi từng bên để e2e giả lập chuyển bên. */
  fakePlan?: Record<string, number | "unconfigured" | "slow"> | null;
}

/** Một lượt gọi một bên: log + meta đều dùng hình dạng này, không có nội dung transcript. */
export interface GapCheckAttempt {
  provider: string;
  outcome: "ok" | "unconfigured" | "status" | "timeout" | "parse_error";
  /** Mã HTTP nếu có (lỗi status); không có thì bỏ qua khi log. */
  status?: number;
  ms: number;
}

/** Lỗi của một bên: chain bắt lại để chuyển bên kế; route không bao giờ thấy lỗi này. */
export class GapCheckProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly outcome: "unconfigured" | "status" | "timeout",
    readonly status: number | undefined,
    message?: string,
  ) {
    super(message ?? `provider ${provider} ${outcome}`);
    this.name = "GapCheckProviderError";
  }
}

/** Hết chuỗi mà không có bên nào trả kết quả parse được → route trả 503. */
export class GapCheckChainError extends Error {
  constructor(readonly attempts: GapCheckAttempt[], message: string) {
    super(message);
    this.name = "GapCheckChainError";
  }
}

interface GapCheckProvider {
  code: string;
  run(input: GapCheckProviderInput): Promise<string>;
}

/** Thời hạn một bên (mặc định 8 giây theo yêu cầu nhịp 2); e2e chỉnh ngắn qua env. */
function providerTimeoutMs(): number {
  const n = Number(process.env.GAP_CHECK_PROVIDER_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 8000;
}

function asProviderError(code: string, error: unknown): GapCheckProviderError {
  if (error instanceof GapCheckProviderError) return error;
  // AbortSignal.timeout ném TimeoutError (DOMException) khi quá hạn.
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return new GapCheckProviderError(code, "timeout", undefined, "quá thời hạn một bên");
  }
  // Lỗi lạ (mạng đứt, DNS…) — coi như lỗi bên để chuyển bên kế, không làm route 500.
  return new GapCheckProviderError(code, "status", undefined, error instanceof Error ? error.message : String(error));
}

function isHttpFatal(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Ghi log một lượt gọi một bên — một dòng, không có transcript. */
function logAttempt(attempt: GapCheckAttempt): void {
  console.log(
    `[gap-check-provider] ${JSON.stringify({
      provider: attempt.provider,
      outcome: attempt.outcome,
      ...(attempt.status !== undefined ? { status: attempt.status } : {}),
      ms: attempt.ms,
      ts: new Date().toISOString(),
    })}`,
  );
}

/* ---------- zai (bên chính, giữ nguyên từ GC-02) ---------- */

const zaiProvider: GapCheckProvider = {
  code: "zai",
  async run({ system, user }) {
    let zai: unknown;
    try {
      // Import động: máy chủ không có SDK thì coi như chưa cấu hình, chuyển bên kế.
      const { default: ZAI } = await import("z-ai-web-dev-sdk");
      zai = await ZAI.create();
    } catch (error) {
      throw new GapCheckProviderError("zai", "unconfigured", undefined, error instanceof Error ? error.message : String(error));
    }
    try {
      // Thời hạn do chain áp dụng chung (Promise.race một lớp ở runGapCheckChain),
      // ở đây chỉ gọi SDK: GAP_CHECK_MODEL đặt tên model nhanh nếu backend SDK
      // hỗ trợ; bỏ trống thì backend tự chọn model mặc định.
      const completion = await (zai as {
        chat: { completions: { create: (body: Record<string, unknown>) => Promise<{ choices?: Array<{ message?: { content?: string } }> }> } };
      }).chat.completions.create({
        model: process.env.GAP_CHECK_MODEL || undefined,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.1,
        max_tokens: 600,
        thinking: { type: "disabled" },
      });
      return completion.choices?.[0]?.message?.content ?? "";
    } catch (error) {
      throw asProviderError("zai", error);
    }
  },
};

/* ---------- gemini (dự phòng 1) — REST, Flash-Lite ---------- */

const geminiProvider: GapCheckProvider = {
  code: "gemini",
  async run({ system, user }) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new GapCheckProviderError("gemini", "unconfigured", undefined, "thiếu GEMINI_API_KEY");
    // GEMINI_BASE_URL chỉ để kiểm thử (trỏ máy giả lập); mặc định là điểm cuối chính thức.
    const base = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
    let res: Response;
    try {
      res = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 600 },
        }),
        signal: AbortSignal.timeout(providerTimeoutMs()),
      });
    } catch (error) {
      throw asProviderError("gemini", error);
    }
    if (!res.ok) {
      // 401/403 là khóa sai → "không cấu hình được"; 429/5xx là lỗi tạm thời → chuyển bên.
      const outcome: "unconfigured" | "status" = res.status === 401 || res.status === 403 ? "unconfigured" : "status";
      throw new GapCheckProviderError("gemini", outcome, res.status, `HTTP ${res.status}`);
    }
    const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = (json.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("").trim();
    if (!text) throw new GapCheckProviderError("gemini", "status", undefined, "phản hồi trống");
    return text;
  },
};

/* ---------- anthropic (dự phòng 2) — REST, claude-haiku ---------- */

const anthropicProvider: GapCheckProvider = {
  code: "anthropic",
  async run({ system, user }) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new GapCheckProviderError("anthropic", "unconfigured", undefined, "thiếu ANTHROPIC_API_KEY");
    const base = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, "");
    const model = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
    let res: Response;
    try {
      res = await fetch(`${base}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 600,
          temperature: 0.1,
          system,
          messages: [{ role: "user", content: user }],
        }),
        signal: AbortSignal.timeout(providerTimeoutMs()),
      });
    } catch (error) {
      throw asProviderError("anthropic", error);
    }
    if (!res.ok) {
      const outcome: "unconfigured" | "status" = res.status === 401 || res.status === 403 ? "unconfigured" : "status";
      throw new GapCheckProviderError("anthropic", outcome, res.status, `HTTP ${res.status}`);
    }
    const json = (await res.json()) as { content?: Array<{ text?: string }> };
    const text = (json.content ?? []).map((block) => block.text ?? "").join("").trim();
    if (!text) throw new GapCheckProviderError("anthropic", "status", undefined, "phản hồi trống");
    return text;
  },
};

/* ---------- stub kiểm thử ---------- */

/**
 * Stub kiểm thử (GC-02 giữ nguyên hành vi trả kết quả): trả kết quả xác định, đúng
 * shape, không bịa evidence — chỉ để chạy e2e và ép các trạng thái lỗi/đủ mà không
 * tốn tiền API. Mặc định: mọi ô filled=false; GAP_CHECK_FAKE=filled hoặc transcript
 * dài (> 200 ký tự) → mọi ô filled=true.
 */
function buildStubResult(template: IntakeTemplate, filled: boolean): GapCheckResult {
  return {
    ready_to_close: filled,
    slots_status: template.gap_slots.map((slot) => ({
      key: slot.key,
      filled,
      confidence: filled ? "high" : "low",
      evidence: filled ? "(stub kiểm thử — không phải dữ liệu thật)" : "",
    })),
    missing_priorities: filled
      ? []
      : template.gap_slots.slice(0, 2).map((slot) => ({
          key: slot.key,
          why_missing: "(stub kiểm thử) chưa có dữ liệu trong bản ghi",
          question: slot.fallback_question,
        })),
    one_line_bridge: "",
  };
}

function fakeSlowMs(): number {
  const n = Number(process.env.GAP_CHECK_FAKE_SLOW_MS);
  return Number.isFinite(n) && n > 0 ? n : 5000;
}

function fakeProvider(code: string): GapCheckProvider {
  return {
    code,
    async run({ template, transcript, fakePlan }) {
      const plan = fakePlan?.[code];
      if (plan === "unconfigured") {
        throw new GapCheckProviderError(code, "unconfigured", undefined, "(stub) ép chưa cấu hình");
      }
      if (plan === "slow") {
        // Treo lâu hơn thời hạn thật để chain cắt đúng luật (thời gian đo được trong attempts)
        await new Promise((resolve) => setTimeout(resolve, Math.max(fakeSlowMs(), providerTimeoutMs() + 3000)));
        return "";
      }
      if (typeof plan === "number") {
        throw new GapCheckProviderError(code, "status", plan, `(stub) ép HTTP ${plan}`);
      }
      const filled =
        process.env.GAP_CHECK_FAKE === "filled" ||
        (process.env.GAP_CHECK_FAKE === "1" && transcript.trim().length > 200);
      return JSON.stringify(buildStubResult(template, filled));
    },
  };
}

/* ---------- danh sách bên theo GAP_CHECK_PROVIDERS ---------- */

function parseProviderList(): string[] {
  const env = process.env.GAP_CHECK_PROVIDERS?.trim();
  if (!env) return [];
  const unknown: string[] = [];
  const list = env
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const known = list.filter((code) => {
    if (code === "zai" || code === "gemini" || code === "anthropic") return true;
    unknown.push(code);
    return false;
  });
  if (unknown.length) {
    console.warn(`[gap-check] bỏ qua bên không biết trong GAP_CHECK_PROVIDERS: ${unknown.join(", ")}`);
  }
  return known;
}

function providerList(): GapCheckProvider[] {
  if (process.env.GAP_CHECK_FAKE) {
    const list = parseProviderList();
    // Không đặt GAP_CHECK_PROVIDERS: một bên "stub" như cũ — specs cũ không đổi.
    return list.length ? list.map(fakeProvider) : [fakeProvider("stub")];
  }
  const list = parseProviderList();
  if (list.length) {
    const map: Record<string, GapCheckProvider> = { zai: zaiProvider, gemini: geminiProvider, anthropic: anthropicProvider };
    return list.map((code) => map[code]);
  }
  // Mặc định: zai trước, hai bên dự phòng sau (yêu cầu nhịp 2).
  return [zaiProvider, geminiProvider, anthropicProvider];
}

/** Đọc kế hoạch ép lỗi của stub từ header (chỉ hợp lệ khi GAP_CHECK_FAKE bật). */
export function parseFakePlanHeader(raw: string | null): Record<string, number | "unconfigured" | "slow"> | null {
  if (!raw) return null;
  const plan: Record<string, number | "unconfigured" | "slow"> = {};
  for (const part of raw.split(",")) {
    const [provider, action] = part.trim().split(":");
    if (!provider || !action) continue;
    if (action === "unconfigured" || action === "slow") {
      plan[provider] = action;
      continue;
    }
    const status = Number(action);
    if (Number.isFinite(status)) plan[provider] = status;
  }
  return Object.keys(plan).length ? plan : null;
}

/**
 * Chạy chuỗi bên theo GAP_CHECK_PROVIDERS: mỗi bên gọi model → parse ngay tại chỗ
 * (parse sai coi như lỗi bên, chuyển bên kế). Trả về kết quả + tên bên đã dùng +
 * nhật ký từng lượt. Hết chuỗi mà không thành công → GapCheckChainError (route 503).
 */
export async function runGapCheckChain<T>(
  input: GapCheckProviderInput,
  parse: (raw: string) => T,
): Promise<{ result: T; provider: string; attempts: GapCheckAttempt[] }> {
  const attempts: GapCheckAttempt[] = [];
  for (const provider of providerList()) {
    const startedAt = Date.now();
    let raw: string;
    try {
      // Thời hạn một bên áp dụng cho MỌI bên (kể cả stub): bên nào quá hạn
      // (mặc định 8 giây) đều bị cắt và chuyển bên kế.
      raw = await Promise.race([
        provider.run(input),
        new Promise<never>((_, reject) => setTimeout(() => reject(new GapCheckProviderError(provider.code, "timeout", undefined)), providerTimeoutMs())),
      ]);
    } catch (error) {
      const err = asProviderError(provider.code, error);
      const attempt: GapCheckAttempt = {
        provider: provider.code,
        outcome: err.outcome,
        ...(err.status !== undefined ? { status: err.status } : {}),
        ms: Date.now() - startedAt,
      };
      attempts.push(attempt);
      logAttempt(attempt);
      continue;
    }
    try {
      const result = parse(raw);
      const attempt: GapCheckAttempt = { provider: provider.code, outcome: "ok", ms: Date.now() - startedAt };
      attempts.push(attempt);
      logAttempt(attempt);
      return { result, provider: provider.code, attempts };
    } catch {
      const attempt: GapCheckAttempt = { provider: provider.code, outcome: "parse_error", ms: Date.now() - startedAt };
      attempts.push(attempt);
      logAttempt(attempt);
      continue;
    }
  }
  throw new GapCheckChainError(attempts, "hết chuỗi nhà cung cấp mà không có kết quả");
}
