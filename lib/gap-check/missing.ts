// GC-04 — Sinh danh sách ô còn thiếu dùng chung cho bottom sheet rà thiếu ở màn
// ghi (GC-03) và checklist "Cần bổ sung sau buổi" ở màn chi tiết (GC-04, đặc
// tả v1.1 §4.5). Một nơi sinh mục để hai mặt không lệch nhau.
import { getIntakeTemplateOrGeneral } from "@/lib/intake-templates";
import type { GapCheckResult } from "./types";

export type MissingItem = {
  key: string;
  label: string;
  sensitive: boolean;
  why: string;
  question: string;
};

/** Ghép kết quả rà với nhãn ô của mẫu nghiệp vụ. Mẫu không còn trong kho
 * (config đổi phiên bản giữa buổi) thì rơi về mẫu Tổng quát thay vì undefined
 * — sửa sau dry-run B4, nhãn ô luôn giải thích được. missing_priorities rỗng
 * mà vẫn còn ô thiếu (model không chọn được) thì dùng gợi ý ô và câu hỏi gốc
 * của mẫu — nội dung đều có thật trong config, không phải dữ liệu bịa. */
export function deriveMissing(result: GapCheckResult, templateId: string): MissingItem[] {
  const template = getIntakeTemplateOrGeneral(templateId);
  const slots = new Map(template.gap_slots.map((slot) => [slot.key, slot]));
  if (result.missing_priorities.length > 0) {
    return result.missing_priorities.map((m) => ({
      key: m.key,
      label: slots.get(m.key)?.label ?? m.key,
      sensitive: slots.get(m.key)?.sensitive === true,
      why: m.why_missing,
      question: m.question,
    }));
  }
  return result.slots_status
    .filter((slot) => !slot.filled)
    .slice(0, 3)
    .map((slot) => ({
      key: slot.key,
      label: slots.get(slot.key)?.label ?? slot.key,
      sensitive: slots.get(slot.key)?.sensitive === true,
      why: slots.get(slot.key)?.extraction_hint ?? "",
      question: slots.get(slot.key)?.fallback_question ?? "",
    }));
}
