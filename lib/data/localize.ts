import type { Speaker, Template } from "./types";

/*
 * Dịch dữ liệu hệ thống theo ngôn ngữ giao diện (M5-02, issue #37).
 * Dữ liệu hệ thống (mẫu, tên phần, gợi ý câu hỏi, dòng lưu ý) có hai bản
 * tiếng Việt và tiếng Anh trong fixture; thiếu bản tiếng Anh thì rơi về
 * tiếng Việt. Dữ liệu người dùng (tiêu đề buổi, lời nói, tóm tắt) giữ nguyên.
 *
 * Quyết định cách làm được ghi ở docs/DECISIONS.md (ngày 2026-11-15):
 * thêm trường _en vào fixture thay vì map khóa sang messages/, vì mẫu do
 * người dùng bật/tắt và sắp xếp lại theo id, không phải khóa dịch tĩnh.
 */

export function templateName(tpl: Pick<Template, "name" | "name_en">, locale: string): string {
  return locale === "en" && tpl.name_en ? tpl.name_en : tpl.name;
}

export function sectionTitle(
  sec: Pick<Template["sections"][number], "title" | "title_en">,
  locale: string,
): string {
  return locale === "en" && sec.title_en ? sec.title_en : sec.title;
}

export function suggestedQuestions(
  tpl: Pick<Template, "suggested_questions" | "suggested_questions_en"> | undefined,
  locale: string,
): string[] {
  if (!tpl) return [];
  return locale === "en" && tpl.suggested_questions_en?.length ? tpl.suggested_questions_en : tpl.suggested_questions;
}

export function footerNote(
  tpl: Pick<Template, "footer_note" | "footer_note_en"> | undefined,
  locale: string,
): string | undefined {
  if (!tpl) return undefined;
  return locale === "en" && tpl.footer_note_en ? tpl.footer_note_en : tpl.footer_note;
}

type LabelTranslate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Nhãn hiển thị của người nói (M5, sửa review PR #41 mục 5).
 * Người nói chưa đặt tên (display_name null) là nhãn hệ thống: "Bạn" với
 * chính người dùng (is_me), "Người nói N" với người khác — N tính theo vị
 * trí trong danh sách người nói của buổi. Nhãn sinh lúc vẽ theo ngôn ngữ
 * giao diện, không lưu vào dữ liệu; `t` là bộ dịch ở cấp gốc (useTranslations()
 * không kèm namespace) vì các khóa speakerYou/speakerN nằm ở gốc messages.
 */
export function speakerLabel(
  sp: Pick<Speaker, "id" | "display_name" | "is_me">,
  speakers: ReadonlyArray<Pick<Speaker, "id">>,
  t: LabelTranslate,
): string {
  if (sp.display_name) return sp.display_name;
  if (sp.is_me) return t("speakerYou");
  const n = speakers.findIndex((s) => s.id === sp.id) + 1;
  return t("speakerN", { n: n > 0 ? n : speakers.length + 1 });
}
