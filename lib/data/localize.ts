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
 * Mã lỗi của luồng ASR (C1-05 lưu trong sessions.asr_error) → khóa dịch
 * tiếng Việt dễ hiểu (C1-06). Giao diện KHÔNG bao giờ hiện mã thô:
 * hết quota, lỗi mạng, file hỏng, lỗi tóm tắt, kẹt nhiều lần thử.
 * Khóa dịch nằm ở namespace `session` (asrErrorQuota…).
 */
export function asrErrorKey(code: string | null | undefined): string {
  if (!code) return "asrErrorUnknown";
  if (code === "quota_exceeded") return "asrErrorQuota";
  // Băng mất trên kho, bản chữ trống/hỏng — nhóm "file"
  if (
    code === "audio_missing" ||
    code === "transcription_id_missing" ||
    code === "empty_transcript" ||
    code === "transcript_missing"
  ) {
    return "asrErrorFile";
  }
  // Lỗi khi gọi nhà cung cấp nhận dạng
  if (code.startsWith("soniox_") || code === "asr_start_failed") return "asrErrorNetwork";
  // Lỗi khi tạo tóm tắt
  if (code.startsWith("gemini_") || code === "summarize_failed") return "asrErrorSummary";
  if (code === "attempts_exhausted") return "asrErrorStuck";
  return "asrErrorUnknown";
}

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
