/**
 * Mẫu nghiệp vụ (Template) phía máy chủ — đọc fixture tĩnh
 * fixtures/templates.json. Mẫu là nội dung dùng chung cho mọi người dùng
 * (không có bảng templates trong §1.4); việc người dùng tự bật/tắt phần của
 * mẫu (account.updateTemplate) vẫn là của bản giả — C1-03b chưa lưu được.
 */
import rawTemplates from "@/fixtures/templates.json";

import type { Profession, Template } from "../types";

export const ALL_TEMPLATES = rawTemplates as unknown as Template[];

export function templatesOfProfession(profession: Profession | null): Template | undefined {
  if (!profession) return undefined;
  return ALL_TEMPLATES.find((t) => t.profession === profession);
}

export function templateById(id: string): Template | undefined {
  return ALL_TEMPLATES.find((t) => t.id === id);
}
