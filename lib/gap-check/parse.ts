// GC-02 (b4/gc-02-api) — Parse chặt đầu ra model (đặc tả v1.1 §2 "CHỈ TRẢ VỀ JSON HỢP LỆ").
// Sai một luật cũng loại toàn bộ kết quả: tuyệt đối không hiện dữ liệu bịa (đặc tả §8).

import { z } from "zod";
import type { GapCheckResult } from "./types";
import type { IntakeTemplate } from "@/lib/intake-templates";

export type GapCheckParseErrorCode =
  | "not_json"
  | "bad_shape"
  | "missing_slot"
  | "unknown_slot"
  | "duplicate_slot"
  | "missing_evidence"
  | "evidence_when_unfilled"
  | "bad_missing_key"
  | "close_mismatch";

export class GapCheckParseError extends Error {
  code: GapCheckParseErrorCode;
  constructor(code: GapCheckParseErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = "GapCheckParseError";
  }
}

const slotStatusSchema = z.object({
  key: z.string(),
  filled: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
  evidence: z.string(),
});

const gapCheckResultSchema = z.object({
  ready_to_close: z.boolean(),
  slots_status: z.array(slotStatusSchema),
  missing_priorities: z
    .array(
      z.object({
        key: z.string(),
        why_missing: z.string(),
        question: z.string(),
      }),
    )
    .max(3),
  one_line_bridge: z.string(),
});

/** Gỡ bọc markdown ```json nếu model vẫn viết ra, rồi parse JSON. */
function extractJsonText(raw: string): string {
  let text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) text = fenced[1].trim();
  try {
    JSON.parse(text);
    return text;
  } catch {
    // Model thêm chữ quanh JSON: lấy khối từ "{" đầu tới "}" cuối.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new GapCheckParseError("not_json", "đầu ra không chứa JSON nào");
    }
    const candidate = text.slice(start, end + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      throw new GapCheckParseError("not_json", "JSON sau khi gỡ bọc vẫn hỏng");
    }
  }
}

/** Kiểm chéo với mẫu nghiệp vụ: đủ ô, đúng luật evidence, đúng luật chốt buổi. */
function crossValidateWithTemplate(
  result: GapCheckResult,
  template: IntakeTemplate,
): void {
  const templateKeys = template.gap_slots.map((slot) => slot.key);
  const seen = new Set<string>();
  for (const status of result.slots_status) {
    if (!templateKeys.includes(status.key)) {
      throw new GapCheckParseError("unknown_slot", `ô "${status.key}" không có trong mẫu`);
    }
    if (seen.has(status.key)) {
      throw new GapCheckParseError("duplicate_slot", `ô "${status.key}" bị lặp`);
    }
    seen.add(status.key);
    if (status.filled && status.evidence.trim().length === 0) {
      throw new GapCheckParseError(
        "missing_evidence",
        `ô "${status.key}" filled=true nhưng thiếu evidence`,
      );
    }
    if (!status.filled && status.evidence.length > 0) {
      throw new GapCheckParseError(
        "evidence_when_unfilled",
        `ô "${status.key}" filled=false nhưng vẫn có evidence`,
      );
    }
  }
  for (const key of templateKeys) {
    if (!seen.has(key)) {
      throw new GapCheckParseError("missing_slot", `thiếu trạng thái ô "${key}"`);
    }
  }

  const filledByKey = new Map(result.slots_status.map((status) => [status.key, status.filled]));
  for (const missing of result.missing_priorities) {
    if (filledByKey.get(missing.key) !== false) {
      throw new GapCheckParseError(
        "bad_missing_key",
        `missing_priorities có ô "${missing.key}" không thuộc nhóm filled=false`,
      );
    }
  }

  const allFilled = templateKeys.every((key) => filledByKey.get(key) === true);
  if (allFilled && (!result.ready_to_close || result.missing_priorities.length > 0)) {
    throw new GapCheckParseError(
      "close_mismatch",
      "mọi ô đã filled nhưng ready_to_close sai luật (quy tắc 10)",
    );
  }
  if (!allFilled && result.ready_to_close) {
    throw new GapCheckParseError(
      "close_mismatch",
      "còn ô thiếu nhưng ready_to_close=true",
    );
  }
}

/** Đầu ra thô của model → GapCheckResult tin được. Sai luật → GapCheckParseError. */
export function parseGapCheckOutput(raw: string, template: IntakeTemplate): GapCheckResult {
  const parsed = gapCheckResultSchema.safeParse(JSON.parse(extractJsonText(raw)));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new GapCheckParseError(
      "bad_shape",
      `${issue.path.join(".") || "(gốc)"}: ${issue.message}`,
    );
  }
  const result = parsed.data as GapCheckResult;
  crossValidateWithTemplate(result, template);
  return result;
}
