/**
 * Nhóm (a) — user + cài đặt (AccountRepository.me/updateMe/quota) phía máy
 * chủ (C1-03b). Trả hình dạng `User` của lib/data/types.ts từ dòng `users`.
 *
 * Điều khác bản giả: người mới chưa làm quen chưa chọn nghề
 * (users.profession null) — trả "other" và mẫu tương ứng để màn hình làm
 * quen tự điền khi người dùng bấm chọn; không ghi đè giá trị null trong DB.
 */
import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import type { Lang, ListeningPrefs, Profession, Quota, User } from "../types";

import { ApiError, type ServerContext } from "./context";
import { templatesOfProfession } from "./templates";

type UserRow = typeof users.$inferSelect;

function defaultTemplateFor(profession: Profession | null): string {
  const tpl = templatesOfProfession(profession);
  return tpl?.id ?? "tpl-general";
}

/** Dòng users → hình dạng User (lib/data/types.ts). */
export function toUser(row: UserRow): User {
  const profession = (row.profession as Profession | null) ?? "other";
  return {
    id: row.id,
    display_name: row.displayName ?? "",
    honorific: (row.honorific as User["honorific"]) ?? null,
    email: row.email,
    profession,
    default_template_id: row.defaultTemplateId || defaultTemplateFor(profession),
    plan: row.plan === "pro" ? "pro" : "free",
    ui_language: (row.uiLanguage as Lang) ?? "vi",
    theme: (row.theme as User["theme"]) ?? "system",
    consent_reminder: row.consentReminder,
    consent_announcement: row.consentAnnouncement ?? undefined,
    auto_filter_silence: row.autoFilterSilence,
    onboarded_at: row.onboardedAt ? row.onboardedAt.toISOString() : undefined,
    default_speech_language: (row.defaultSpeechLanguage as Lang) ?? "vi",
    auto_detect_languages: row.autoDetectLanguages,
    default_report_language: (row.defaultReportLanguage as Lang) ?? "vi",
    auto_translate_on_send: row.autoTranslateOnSend,
    current_workspace_id: row.currentWorkspaceId || "",
    listening_prefs:
      (row.listeningPrefs as ListeningPrefs | null) ?? {
        enabled: false,
        denoise: true,
        level: true,
        skip_silence: true,
        skip_fillers: false,
      },
  };
}

export async function getMe(ctx: ServerContext): Promise<User> {
  const db = getDb();
  const row = (await db.select().from(users).where(eq(users.id, ctx.userId)).limit(1))[0];
  if (!row) throw new ApiError(404, "user_missing", "Không thấy người dùng");
  return toUser(row);
}

/** Các trường cài đặt client được sửa; id/email/plan/current_workspace_id không nằm trong đó. */
export const UPDATABLE_USER_FIELDS = [
  "displayName",
  "honorific",
  "profession",
  "defaultTemplateId",
  "uiLanguage",
  "theme",
  "consentReminder",
  "consentAnnouncement",
  "autoFilterSilence",
  "defaultSpeechLanguage",
  "autoDetectLanguages",
  "defaultReportLanguage",
  "autoTranslateOnSend",
  "listeningPrefs",
  "onboardedAt",
] as const;

export async function updateMe(ctx: ServerContext, patch: Partial<Record<(typeof UPDATABLE_USER_FIELDS)[number], unknown>>): Promise<void> {
  const db = getDb();
  const set: Record<string, unknown> = {};
  if ("displayName" in patch) set.displayName = patch.displayName ?? null;
  if ("honorific" in patch) set.honorific = patch.honorific ?? null;
  if ("profession" in patch) set.profession = patch.profession ?? null;
  if ("defaultTemplateId" in patch) set.defaultTemplateId = patch.defaultTemplateId ?? null;
  if ("uiLanguage" in patch) set.uiLanguage = patch.uiLanguage ?? "vi";
  if ("theme" in patch) set.theme = patch.theme ?? "system";
  if ("consentReminder" in patch) set.consentReminder = Boolean(patch.consentReminder);
  if ("consentAnnouncement" in patch) set.consentAnnouncement = patch.consentAnnouncement ?? null;
  if ("autoFilterSilence" in patch) set.autoFilterSilence = Boolean(patch.autoFilterSilence);
  if ("defaultSpeechLanguage" in patch) set.defaultSpeechLanguage = patch.defaultSpeechLanguage ?? "vi";
  if ("autoDetectLanguages" in patch) set.autoDetectLanguages = Boolean(patch.autoDetectLanguages);
  if ("defaultReportLanguage" in patch) set.defaultReportLanguage = patch.defaultReportLanguage ?? "vi";
  if ("autoTranslateOnSend" in patch) set.autoTranslateOnSend = Boolean(patch.autoTranslateOnSend);
  if ("listeningPrefs" in patch) set.listeningPrefs = patch.listeningPrefs ?? null;
  if ("onboardedAt" in patch && patch.onboardedAt) set.onboardedAt = new Date(patch.onboardedAt as string);
  set.updatedAt = new Date();
  if (Object.keys(set).length === 1) return; // chỉ updatedAt: không có gì sửa
  await db.update(users).set(set).where(eq(users.id, ctx.userId));
}

/**
 * Hạn mức theo gói. Bản giả lấy số cứng từ fixture (fixtures/quota.json);
 * bản remote tính mức dùng thật từ các buổi của tháng hiện tại (múi giờ VN
 * — đúng §1.3). Giới hạn lấy theo gói như bản giả: Free 180 phút/tháng,
 * buổi tối đa 45 phút; Pro 1200 phút, buổi 240 phút.
 */
export async function getQuota(ctx: ServerContext): Promise<Quota> {
  const db = getDb();
  const me = await getMe(ctx);
  const pro = me.plan === "pro";
  const minutesLimit = pro ? 1200 : 180;
  const now = new Date();
  const monthFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
  });
  const monthKey = monthFmt.format(now);
  // Buổi ĐÃ XÓA (xóa mềm còn Hoàn tác) không còn chiếm hạn mức — xóa là
  // trả lại phần đã dùng (khớp nghĩa "mức dùng tháng này").
  const rows = await db
    .select({ durationSec: sessions.durationSec, createdAt: sessions.createdAt })
    .from(sessions)
    .where(and(eq(sessions.userId, ctx.userId), isNull(sessions.deletedAt)));
  const minutesUsed =
    rows.filter((r) => monthFmt.format(r.createdAt) === monthKey).reduce((n, r) => n + r.durationSec, 0) / 60;
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return {
    period_end: end.toISOString(),
    minutes_used: Math.round(minutesUsed * 10) / 10,
    minutes_limit: minutesLimit,
    max_session_minutes: pro ? 240 : 45,
    chat_questions_per_session: pro ? null : 10,
  };
}
