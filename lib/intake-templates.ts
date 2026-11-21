// PR 01 (b4/gc-01-templates) — Khung mẫu nghiệp vụ cho Gap Check "Kiểm tra thiếu"
// Đặc tả: docs/gap-check-spec-v1.1.md (commit kèm PR này)
// Không phụ thuộc thư viện ngoài; đọc cấu hình tĩnh từ src/config/intake-templates.json

import rawCatalog from "../config/intake-templates.json";

export interface GapSlot {
  /** Định danh ô dữ liệu, duy nhất trong mỗi mẫu */
  key: string;
  label: string;
  /** Ô nhạy cảm: chỉ filled=true khi evidence rõ ràng; không tự xanh khi confidence < high */
  sensitive?: boolean;
  /** Gợi ý nhận dạng nội dung cho AI */
  extraction_hint: string;
  /** Câu hỏi gốc; AI điều chỉnh theo mạch hội thoại khi rà thiếu */
  fallback_question: string;
}

export type QuestionMode = "refocus" | "takeaway";

export interface IntakeTemplate {
  id: string;
  role_name: string;
  /** true → bắt buộc biên nhận đồng ý ghi âm trước khi ghi (góp ý #4) */
  requires_consent: boolean;
  tone_guideline: string;
  /** Lớp 1: khung tóm tắt cuối buổi (vd SOAP cho bác sĩ) */
  summary_structure: string[];
  /** Lớp 2: các ô rà thiếu thông tin trong buổi */
  gap_slots: GapSlot[];
  /** refocus = câu lái hội thoại cho chuyên gia; takeaway = câu hỏi mang về (mẫu học sinh) */
  question_mode?: QuestionMode;
}

export interface IntakeTemplateCatalog {
  version: string;
  templates: IntakeTemplate[];
}

function validateCatalog(catalog: IntakeTemplateCatalog): void {
  if (!Array.isArray(catalog.templates) || catalog.templates.length === 0) {
    throw new Error("intake-templates: danh sách mẫu rỗng hoặc sai cấu trúc");
  }
  const seenIds = new Set<string>();
  for (const template of catalog.templates) {
    if (seenIds.has(template.id)) {
      throw new Error(`intake-templates: id mẫu bị trùng "${template.id}"`);
    }
    seenIds.add(template.id);
    if (!Array.isArray(template.gap_slots) || template.gap_slots.length === 0) {
      throw new Error(`intake-templates: mẫu "${template.id}" chưa có ô dữ liệu nào`);
    }
    const seenSlotKeys = new Set<string>();
    for (const slot of template.gap_slots) {
      if (seenSlotKeys.has(slot.key)) {
        throw new Error(
          `intake-templates: key ô dữ liệu bị trùng "${slot.key}" trong mẫu "${template.id}"`,
        );
      }
      seenSlotKeys.add(slot.key);
    }
  }
}

const catalog = rawCatalog as unknown as IntakeTemplateCatalog;
validateCatalog(catalog);

export function getTemplateCatalog(): IntakeTemplateCatalog {
  return catalog;
}

export function listIntakeTemplates(): IntakeTemplate[] {
  return catalog.templates;
}

export function getIntakeTemplate(id: string): IntakeTemplate | undefined {
  return catalog.templates.find((template) => template.id === id);
}

/** Mẫu mặc định khi buổi/thư mục không chọn nghề (đặc tả v1.1 — mẫu "Tổng quát") */
export function getDefaultIntakeTemplate(): IntakeTemplate {
  return (
    catalog.templates.find((template) => template.id === "general_meeting") ??
    catalog.templates[0]
  );
}
