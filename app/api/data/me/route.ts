/**
 * Nhóm (a) — user + cài đặt (C1-03b). GET trả người dùng theo phiên (tự tạo
 * workspace cá nhân lần đầu); PATCH sửa cài đặt. Id người dùng lấy từ phiên,
 * không tin body.
 */
import { z } from "zod";

import { routeHandler, requireContext } from "@/lib/data/server/context";
import { getMe, getQuota, updateMe, UPDATABLE_USER_FIELDS } from "@/lib/data/server/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    display_name: z.string().max(200).optional(),
    honorific: z.enum(["anh", "chị"]).nullable().optional(),
    profession: z.string().optional(),
    default_template_id: z.string().optional(),
    ui_language: z.enum(["vi", "en", "ko"]).optional(),
    theme: z.enum(["light", "dark", "system"]).optional(),
    consent_reminder: z.boolean().optional(),
    consent_announcement: z.string().max(500).nullable().optional(),
    auto_filter_silence: z.boolean().optional(),
    default_speech_language: z.enum(["vi", "en", "ko"]).optional(),
    auto_detect_languages: z.boolean().optional(),
    default_report_language: z.enum(["vi", "en", "ko"]).optional(),
    auto_translate_on_send: z.boolean().optional(),
    listening_prefs: z.record(z.string(), z.unknown()).nullable().optional(),
    onboarded_at: z.string().optional(),
  })
  .strict();

/** snake_case (hình dạng User client) → camelCase (cột users). */
const FIELD_MAP: Record<string, string> = {
  display_name: "displayName",
  honorific: "honorific",
  profession: "profession",
  default_template_id: "defaultTemplateId",
  ui_language: "uiLanguage",
  theme: "theme",
  consent_reminder: "consentReminder",
  consent_announcement: "consentAnnouncement",
  auto_filter_silence: "autoFilterSilence",
  default_speech_language: "defaultSpeechLanguage",
  auto_detect_languages: "autoDetectLanguages",
  default_report_language: "defaultReportLanguage",
  auto_translate_on_send: "autoTranslateOnSend",
  listening_prefs: "listeningPrefs",
  onboarded_at: "onboardedAt",
};

export const GET = routeHandler(async () => {
  const ctx = await requireContext();
  const [user, quota] = await Promise.all([getMe(ctx), getQuota(ctx)]);
  return Response.json({ user, quota });
});

export const PATCH = routeHandler(async (request: Request) => {
  const ctx = await requireContext();
  let body: unknown;
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "bad_request", message: "Thân yêu cầu không đúng cấu trúc" }, { status: 400 });
  }
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    const column = FIELD_MAP[key];
    if (column && (UPDATABLE_USER_FIELDS as readonly string[]).includes(column)) mapped[column] = value;
  }
  await updateMe(ctx, mapped);
  const user = await getMe(ctx);
  return Response.json({ user });
});
