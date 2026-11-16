import type { LocalizedText, Speaker, Template } from "./types";

/*
 * Dịch dữ liệu hệ thống theo ngôn ngữ giao diện (M5-02, M6-01).
 * Dữ liệu hệ thống (mẫu, tên phần, gợi ý câu hỏi, dòng lưu ý) là
 * LocalizedText — map theo ngôn ngữ, bắt buộc có vi (M6-01, thay các trường
 * _en của M5). Thiếu ngôn ngữ nào thì rơi về tiếng Anh rồi tiếng Việt.
 * Dữ liệu người dùng (tiêu đề buổi, lời nói, tóm tắt) giữ nguyên.
 */

/** Đọc LocalizedText theo ngôn ngữ: lang -> en -> vi. */
export function localized(text: LocalizedText | undefined | null, lang: string): string {
  if (!text) return "";
  if (lang !== "vi" && lang !== "en") {
    const other = text[lang as keyof LocalizedText];
    if (other) return other;
  }
  if (lang === "vi" && text.vi) return text.vi;
  return text.en || text.vi || "";
}

export function templateName(tpl: Pick<Template, "name">, locale: string): string {
  return localized(tpl.name, locale);
}

export function sectionTitle(sec: Pick<Template["sections"][number], "title">, locale: string): string {
  return localized(sec.title, locale);
}

export function suggestedQuestions(tpl: Pick<Template, "suggested_questions"> | undefined, locale: string): string[] {
  if (!tpl) return [];
  return (tpl.suggested_questions ?? []).map((q) => localized(q, locale));
}

export function footerNote(tpl: Pick<Template, "footer_note"> | undefined, locale: string): string | undefined {
  const note = localized(tpl?.footer_note, locale);
  return note || undefined;
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
