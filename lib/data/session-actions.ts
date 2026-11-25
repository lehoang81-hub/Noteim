/**
 * Các thao tác nhỏ trên buổi ghi — điểm dùng chung cho client (lib/data/remote)
 * và route máy chủ (app/api/data/sessions/[id]/actions). Một schema Zod duy
 * nhất để hai phía luôn khớp. File này KHÔNG đụng lib/db — an toàn cho bundle
 * của trình duyệt (zod + kiểu, không driver).
 */
import { z } from "zod";

import { Lang } from "./types";

export const sessionActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("updateBullet"), bulletId: z.string().min(1), text: z.string().max(2000) }),
  z.object({
    type: z.literal("updateSegment"),
    segmentId: z.string().min(1),
    text: z.string().max(5000),
    field: z.enum(["text", "text_clean"]).optional(),
  }),
  z.object({ type: z.literal("reassignSegment"), segmentId: z.string().min(1), speakerId: z.string().min(1) }),
  // C1-09: tạo người nói mới rồi gán đoạn cho người đó, một thao tác phía máy chủ
  z.object({ type: z.literal("addSpeakerAndReassign"), segmentId: z.string().min(1) }),
  // C1-09: đổi nhiều đoạn sang một người nói (các đoạn liền sau cùng người cũ)
  z.object({
    type: z.literal("reassignSegments"),
    segmentIds: z.array(z.string().min(1)).min(1).max(2000),
    speakerId: z.string().min(1),
  }),
  z.object({ type: z.literal("addQuickNote"), text: z.string().max(1000) }),
  z.object({ type: z.literal("completeGapCheckItem"), key: z.string().min(1).max(200) }),
  z.object({ type: z.literal("consumePendingAiQuestion"), question: z.string().max(1000) }),
  z.object({
    type: z.literal("translateSegments"),
    lang: Lang,
    segmentIds: z.array(z.string().min(1)).max(2000).optional(),
  }),
  z.object({ type: z.literal("nameSpeaker"), speakerId: z.string().min(1), contactId: z.string().min(1) }),
  z.object({ type: z.literal("mergeSpeakers"), fromId: z.string().min(1), intoId: z.string().min(1) }),
  z.object({ type: z.literal("updateVersionBullet"), lang: Lang, bulletId: z.string().min(1), text: z.string().max(2000) }),
  z.object({ type: z.literal("recordExport") }),
  z.object({ type: z.literal("restore") }),
  z.object({ type: z.literal("reprocess"), templateId: z.string().min(1) }),
  z.object({ type: z.literal("purgeRaw") }),
  z.object({ type: z.literal("setVisibility") }),
]);

export type SessionAction = z.infer<typeof sessionActionSchema>;
