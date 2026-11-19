// GC-02 (b4/gc-02-api) — Nhà cung cấp model cho Gap Check (đặc tả v1.1 §3).
// "Model tốc độ cao trong SDK": z-ai-web-dev-sdk, thinking tắt (không suy luận nặng),
// temperature 0.1, max_tokens 600, bắt buộc trả JSON thuần.
// Máy chủ không cấu hình được AI → trả null, route báo lỗi rõ, tuyệt đối không bịa kết quả.

import type { GapCheckResult } from "./types";
import type { IntakeTemplate } from "@/lib/intake-templates";

export interface GapCheckProvider {
  name: "zai" | "stub";
  /** Trả về chuỗi thô của model (chưa parse). */
  run(input: { system: string; user: string; template: IntakeTemplate; transcript: string }): Promise<string>;
}

export type ProviderMode = "auto" | "stub" | "zai";

function getProviderMode(): ProviderMode {
  if (process.env.GAP_CHECK_FAKE === "1") return "stub";
  const mode = (process.env.GAP_CHECK_PROVIDER as ProviderMode | undefined) ?? "auto";
  return mode === "stub" || mode === "zai" ? mode : "auto";
}

/**
 * Stub kiểm thử (bật bằng GAP_CHECK_FAKE=1): trả kết quả xác định, đúng shape, không
 * bịa evidence — chỉ để chạy e2e và ép các trạng thái lỗi/đủ mà không tốn tiền API.
 * - mặc định: mọi ô filled=false (khớp quy tắc 4 với transcript rỗng/rác).
 * - GAP_CHECK_FAKE=filled: mọi ô filled=true, evidence là nhãn stub, ready_to_close=true.
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

const stubProvider: GapCheckProvider = {
  name: "stub",
  async run({ template, transcript }) {
    const filled =
      process.env.GAP_CHECK_FAKE === "filled" ||
      (process.env.GAP_CHECK_FAKE === "1" && transcript.trim().length > 200);
    return JSON.stringify(buildStubResult(template, filled));
  },
};

let cachedZaiProvider: GapCheckProvider | null | undefined;

const zaiProvider: GapCheckProvider = {
  name: "zai",
  async run({ system, user }) {
    // Import động: máy chủ không có SDK thì hỏng ở đây và route trả 503 rõ ràng.
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      // GAP_CHECK_MODEL: đặt tên model nhanh nếu backend SDK hỗ trợ; bỏ trống thì
      // backend tự chọn model mặc định.
      model: process.env.GAP_CHECK_MODEL || undefined,
      messages: [
        { role: "assistant", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.1,
      max_tokens: 600,
      thinking: { type: "disabled" },
    });
    return completion.choices[0]?.message?.content ?? "";
  },
};

/** null = chưa cấu hình AI → route phải trả 503, không được tự chế kết quả. */
export async function getGapCheckProvider(): Promise<GapCheckProvider | null> {
  const mode = getProviderMode();
  if (mode === "stub") return stubProvider;
  if (mode === "zai") {
    if (cachedZaiProvider === undefined) {
      cachedZaiProvider = (await probeZai()) ? zaiProvider : null;
    }
    return cachedZaiProvider;
  }
  // auto: thử SDK trước, hỏng thì không rà được (không fallback sang dữ liệu bịa).
  if (cachedZaiProvider === undefined) {
    cachedZaiProvider = (await probeZai()) ? zaiProvider : null;
  }
  return cachedZaiProvider;
}

async function probeZai(): Promise<boolean> {
  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    await ZAI.create();
    return true;
  } catch (error) {
    console.warn(
      "[gap-check] SDK AI chưa dùng được, lượt rà sẽ báo 503:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
