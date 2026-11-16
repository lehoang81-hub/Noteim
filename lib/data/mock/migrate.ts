"use client";

import type { Contact, GlossaryTerm, Lang, LocalizedText, SessionDetail, Template, TranscriptSegment, User } from "../types";
import type { MockDb } from "./store";

/*
 * Tự chuyển dữ liệu cũ trong localStorage khi nạp:
 * - M6-01 (issue #43): mẫu name/_en -> LocalizedText; buổi ghi language ->
 *   primary_language, output_language -> original_report_language; người dùng
 *   thêm các trường M6; liên hệ, từ điển thêm trường mới.
 * - M7-01 (issue #47): buổi cũ thuộc không gian Cá nhân (workspace_id null
 *   giữ nguyên), riêng tư, người ghi là người dùng hiện tại; người dùng thêm
 *   current_workspace_id (mặc định không gian Cá nhân).
 * Hàm thuần, sửa tại chỗ, trả true nếu có đổi để caller commit.
 */

/** Id không gian Cá nhân của người dùng mẫu (trùng fixtures/workspaces.json). */
const PERSONAL_WORKSPACE_ID = "w-hoang";

function toLocalized(vi: string, en?: string): LocalizedText {
  const out: LocalizedText = { vi };
  if (en) out.en = en;
  return out;
}

function migrateTemplate(tpl: Template): boolean {
  let changed = false;
  const raw = tpl as unknown as Record<string, unknown>;
  if (typeof raw.name === "string") {
    tpl.name = toLocalized(raw.name, raw.name_en as string | undefined);
    changed = true;
  }
  for (const sec of tpl.sections ?? []) {
    const sr = sec as unknown as Record<string, unknown>;
    if (typeof sr.title === "string") {
      sec.title = toLocalized(sr.title as string, sr.title_en as string | undefined);
      changed = true;
    }
  }
  if (Array.isArray(raw.suggested_questions) && raw.suggested_questions.some((q) => typeof q === "string")) {
    const enList = (raw.suggested_questions_en as string[] | undefined) ?? [];
    tpl.suggested_questions = (raw.suggested_questions as string[]).map((q, i) => toLocalized(q, enList[i]));
    changed = true;
  }
  if (typeof raw.footer_note === "string") {
    tpl.footer_note = toLocalized(raw.footer_note as string, raw.footer_note_en as string | undefined);
    changed = true;
  }
  // Dọn các trường _en cũ sau khi đã gộp
  for (const key of ["name_en", "footer_note_en", "suggested_questions_en"] as const) {
    if (key in raw) {
      delete raw[key];
      changed = true;
    }
  }
  for (const sec of tpl.sections ?? []) {
    if ("title_en" in (sec as unknown as Record<string, unknown>)) {
      delete (sec as unknown as Record<string, unknown>).title_en;
      changed = true;
    }
  }
  return changed;
}

function migrateSessionDetail(detail: SessionDetail): boolean {
  let changed = false;
  const raw = detail as unknown as Record<string, unknown>;
  if (typeof raw.language === "string") {
    detail.primary_language = raw.language as Lang;
    delete raw.language;
    changed = true;
  }
  if (typeof raw.output_language === "string") {
    detail.original_report_language = raw.output_language as Lang;
    delete raw.output_language;
    changed = true;
  }
  if (!raw.detected_languages) {
    detail.detected_languages = [detail.primary_language];
    changed = true;
  }
  if (!raw.report_languages) {
    detail.report_languages = [detail.original_report_language];
    changed = true;
  }
  // M7-01: buổi cũ thuộc không gian Cá nhân, riêng tư, người ghi là chủ buổi
  if (!raw.visibility) {
    detail.visibility = "private";
    changed = true;
  }
  if (!raw.owner_user_id) {
    detail.owner_user_id = detail.user_id;
    changed = true;
  }
  return changed;
}

function migrateSegments(segments: TranscriptSegment[] | undefined, fallbackLang: Lang): boolean {
  if (!segments?.length) return false;
  let changed = false;
  for (const seg of segments) {
    const raw = seg as unknown as Record<string, unknown>;
    if (!raw.lang) {
      seg.lang = fallbackLang;
      changed = true;
    }
    if (!raw.translations) {
      seg.translations = {};
      changed = true;
    }
  }
  return changed;
}

export function migrateStored(db: MockDb): boolean {
  let changed = false;

  for (const tpl of db.templates ?? []) changed = migrateTemplate(tpl) || changed;

  const user = db.user as unknown as Partial<User> & Record<string, unknown>;
  if (user) {
    const ui = (user.ui_language as Lang) ?? "vi";
    if (!user.default_speech_language) {
      user.default_speech_language = ui;
      changed = true;
    }
    if (user.auto_detect_languages === undefined) {
      user.auto_detect_languages = true;
      changed = true;
    }
    if (!user.default_report_language) {
      user.default_report_language = ui;
      changed = true;
    }
    if (user.auto_translate_on_send === undefined) {
      user.auto_translate_on_send = true;
      changed = true;
    }
    // M7-01: kho cũ chưa có khái niệm không gian — mặc định không gian Cá nhân
    if (!user.current_workspace_id) {
      user.current_workspace_id = PERSONAL_WORKSPACE_ID;
      changed = true;
    }
  }

  for (const c of db.contacts ?? []) {
    if ((c as Contact).preferred_language === undefined) {
      c.preferred_language = null;
      changed = true;
    }
  }

  for (const g of db.glossary ?? []) {
    if ((g as GlossaryTerm).variants === undefined) {
      g.variants = {};
      changed = true;
    }
  }

  // Buổi ghi trong cả ba danh sách: thư viện, xóa gần đây, mẫu theo nghề
  for (const fx of [...(db.sessions ?? []), ...(db.removed ?? []), ...(db.samples ?? [])]) {
    if (migrateSessionDetail(fx.detail)) changed = true;
    const primary = fx.detail.primary_language;
    if (migrateSegments(fx.transcript, primary)) changed = true;
    if ("summary_versions" in fx && !(fx as { summary_versions?: unknown }).summary_versions) {
      delete (fx as { summary_versions?: unknown }).summary_versions;
      changed = true;
    }
  }

  return changed;
}
