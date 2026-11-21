// GC-02 (b4/gc-02-api) — Dựng prompt cho Gap Check đúng đặc tả v1.1 §2.
// Không thay chữ trong SYSTEM_PROMPT_TEMPLATE: đây là prompt đã duyệt, chỉ điền placeholder.

import type { GapCheckResult, SlotStatus } from "./types";
import type { IntakeTemplate } from "@/lib/intake-templates";

/** Bản ghi gửi cho AI bị cắt còn ký tự gần nhất (đặc tả §3 — B4 ~8.000 ký tự). */
export const TRANSCRIPT_MAX_CHARS = 8000;

/**
 * System prompt đã duyệt (đặc tả §2). Placeholder: {{role_name}}, {{tone_guideline}},
 * {{slots_json}}, {{transcript}}, {{previous_slots_status}}.
 */
const SYSTEM_PROMPT_TEMPLATE = `Bạn là trợ lý nghiệp vụ thầm lặng của ứng dụng Noteim, hỗ trợ chuyên gia ({{role_name}})
kiểm soát chất lượng thông tin thu thập trong cuộc trao đổi trực tiếp.

NHIỆM VỤ
Đối chiếu bản ghi hội thoại hiện tại với danh sách trường thông tin bắt buộc (Required Slots)
bên dưới, phát hiện thông tin cốt lõi còn thiếu trước khi buổi trao đổi kết thúc.

DỮ LIỆU
- Mẫu nghiệp vụ: {{role_name}} — giọng điệu: {{tone_guideline}} (đúng cách xưng hô quy định).
- Danh sách trường bắt buộc (JSON): {{slots_json}}
- Bản ghi hội thoại hiện tại: {{transcript}}
- Kết quả rà trước đó (nếu có): {{previous_slots_status}}

QUY TẮC XỬ LÝ NGHIÊM NGẶT
1. Chỉ đánh dấu filled: true khi hội thoại có thông tin cụ thể, rõ ràng tương ứng
   extraction_hint; thông tin mơ hồ, qua loa, thiếu số liệu/mốc cụ thể phải là filled: false.
2. Mỗi ô filled: true bắt buộc kèm evidence — trích nguyên văn tối đa 1 dòng từ transcript;
   không trích được thì hạ thành filled: false.
3. Không suy diễn, không bịa đặt thông tin không có trong transcript.
4. Nếu transcript quá ngắn (dưới khoảng 1 phút nói) hoặc rỗng: toàn bộ ô là filled: false,
   missing_priorities tối đa 3 ô quan trọng nhất, không suy diễn.
5. Ô có "sensitive": true (dị ứng thuốc, tình trạng sức khỏe, nguy cơ tự hại...) chỉ được
   filled: true khi evidence rõ ràng, không mơ hồ; trường hợp nghi ngờ → filled: false.
6. Chấp nhận tiếng Việt tự nhiên, phương ngữ, thuật ngữ chuyên ngành tiếng Anh xen kẽ
   (code-switching).
7. Chọn tối đa 3 trường filled: false quan trọng nhất vào missing_priorities, ưu tiên trường
   quyết định quy trình phía sau (dị ứng/thuốc với bác sĩ, thời hiệu với luật sư, ngân sách
   với kiến trúc sư, hạn nộp với học sinh...).
8. Câu hỏi trong missing_priorities điều chỉnh từ fallback_question để nối tiếp mạch chuyện
   vừa diễn ra, đúng giọng điệu và cách xưng hô của mẫu; tối đa 2 câu; không hỏi lại thông
   tin đã filled: true. Thay placeholder [...] bằng nội dung thật từ transcript.
9. one_line_bridge: 1 câu tóm tắt mạch khách đang nói để chuyên gia ngắt lời khéo; rỗng nếu
   không cần. Không áp dụng khi question_mode là "takeaway" (thay bằng câu hỏi mang về).
10. Nếu mọi ô đều filled: true → ready_to_close: true, missing_priorities là mảng rỗng.
11. Trả lời đúng ngôn ngữ của buổi ghi (tiếng Việt thuần hoặc tiếng Việt pha tiếng Anh
    theo đúng kiểu người dùng vừa nói).

ĐỊNH DẠT ĐẦU RA — CHỈ TRẢ VỀ JSON HỢP LỆ, KHÔNG GIẢI THÍCH, KHÔNG MARKDOWN:
{
  "ready_to_close": false,
  "slots_status": [
    { "key": "<slot_key>", "filled": true, "confidence": "high", "evidence": "trích nguyên văn ngắn" }
  ],
  "missing_priorities": [
    { "key": "<slot_key>", "why_missing": "tối đa 1 dòng", "question": "tối đa 2 câu, đúng tone" }
  ],
  "one_line_bridge": "1 câu hoặc chuỗi rỗng"
}
Lưu ý: slots_status phải đủ mọi ô trong slots_json; confidence là high/medium/low;
evidence là chuỗi rỗng khi filled: false.`;

/** Giữ phần cuối của transcript (nội dung mới nhất là cái đang cần rà). */
export function truncateTranscript(transcript: string, maxChars = TRANSCRIPT_MAX_CHARS): string {
  const trimmed = transcript.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `[đã cắt, giữ ${maxChars} ký tự gần nhất]\n${trimmed.slice(-maxChars)}`;
}

/** Danh sách ô gửi cho AI: đủ ngữ cảnh nhận dạng, không mang theo thứ gì khác. */
export function buildSlotsJson(template: IntakeTemplate): string {
  return JSON.stringify(
    template.gap_slots.map((slot) => ({
      key: slot.key,
      label: slot.label,
      extraction_hint: slot.extraction_hint,
      ...(slot.sensitive ? { sensitive: true } : {}),
      fallback_question: slot.fallback_question,
    })),
  );
}

/** Kết quả lần rà trước chuyển thành trạng thái gọn để AI biết ô nào đã có. */
export function buildPreviousSlotsStatus(previous: GapCheckResult | null): string {
  if (!previous || previous.slots_status.length === 0) {
    return "(chưa có — đây là lần rà đầu)";
  }
  const statuses: SlotStatus[] = previous.slots_status;
  return JSON.stringify(statuses.map((slot) => ({ key: slot.key, filled: slot.filled })));
}

export function buildSystemPrompt(
  template: IntakeTemplate,
  transcript: string,
  previous: GapCheckResult | null,
): string {
  return SYSTEM_PROMPT_TEMPLATE.replaceAll("{{role_name}}", template.role_name)
    .replaceAll("{{tone_guideline}}", template.tone_guideline)
    .replaceAll("{{slots_json}}", buildSlotsJson(template))
    .replaceAll("{{transcript}}", truncateTranscript(transcript) || "(rỗng)")
    .replaceAll("{{previous_slots_status}}", buildPreviousSlotsStatus(previous));
}

export function buildUserPrompt(): string {
  return "Rà thiếu thông tin cho bản ghi trên và trả lời đúng định dạng JSON quy định. Không giải thích.";
}
