/**
 * Lưu trữ file ghi âm trên Cloudflare R2 — C1-04 (docs/12 §0.2 yêu cầu bổ
 * sung 2 + §1.5, docs/04 mục "Bổ sung C1").
 *
 * Nguyên tắc (chốt của Hoang cho PR 04):
 * - Không một băng ghi nào đi qua API Route khi tải lên — trình duyệt PUT
 *   thẳng lên R2 qua Presigned Upload URL (trần thân yêu cầu ~4,5 MB của
 *   Vercel Serverless làm mọi lối đi vòng đều hỏng với băng dài).
 * - Khóa đối tượng do MÁY CHỦ đặt: `u/{userId}/{sessionId}/original.{ext}`
 *   — client không được chỉ định khóa, không được chọn người dùng/buổi khác.
 * - Bucket riêng tư tuyệt đối: đọc cũng phải qua signed GET (302 từ
 *   /api/audio/[sessionId] sau khi kiểm quyền theo phiên).
 * - Không in khóa hay URL có chữ ký ra log; mọi cấu hình qua biến môi trường.
 *
 * Chế độ R2_FAKE=1 (chỉ máy kiểm thử/e2e): kho giả nằm trong bộ nhớ của
 * process, các URL presign trỏ tới /api/audio/fake/... của chính app — nhận
 * PUT/GET/HEAD (GET hỗ trợ Range để tua) giống hình dạng thật, không cần R2.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { ApiError } from "./context";

/* ---------- Loại file cho phép và trần dung lượng ---------- */

/** Danh sách loại file cho phép (chốt yêu cầu 4): chỉ băng ghi âm,
 * chặn cả video hay tài liệu bất kỳ. */
export const AUDIO_MIME_TYPES = ["audio/mp4", "audio/webm", "audio/ogg", "audio/mpeg", "audio/wav"] as const;
export type AudioMime = (typeof AUDIO_MIME_TYPES)[number];

const MIME_TO_EXT: Record<AudioMime, string> = {
  "audio/mp4": "mp4",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

/** MediaRecorder in ra "audio/mp4;codecs=..." hay "audio/webm;codecs=opus":
 * chỉ nhận phần trước dấu chấm phẩy. */
export function normalizeAudioMime(mime: string): AudioMime | null {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  return (AUDIO_MIME_TYPES as readonly string[]).includes(base) ? (base as AudioMime) : null;
}

export function extOfAudioMime(mime: AudioMime): string {
  return MIME_TO_EXT[mime];
}

/** Trần phút/buổi theo gói (chốt yêu cầu 4: Free 90 phút/buổi; Pro rộng hơn,
 * bảng giá không đổi — §0.1 điểm 6). */
export function minuteCapForPlan(plan: string): number {
  return plan === "pro" ? 480 : 90;
}

/** Trần byte phòng thủ (~320 kbps × số phút trần, làm tròn lên). */
export function byteCeilingForPlan(plan: string): number {
  return minuteCapForPlan(plan) * 60 * 40_000;
}

/** Hạn giữ băng theo gói (§1.5 "Giữ băng theo gói": Free 90 ngày, Pro 12 tháng). */
export function audioExpiryDaysForPlan(plan: string): number {
  return plan === "pro" ? 365 : 90;
}

/* ---------- Cấu hình và client ---------- */

export type R2Mode = "fake" | "real";

export function r2Mode(): R2Mode | null {
  if (process.env.R2_FAKE === "1") return "fake";
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET) return "real";
  return null;
}

export function isR2Available(): boolean {
  return r2Mode() !== null;
}

function requireMode(): R2Mode {
  const mode = r2Mode();
  if (!mode) {
    throw new ApiError(503, "storage_not_configured", "Máy chủ chưa cấu hình kho R2 cho băng ghi âm");
  }
  return mode;
}

let client: S3Client | null = null;

function s3(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    },
  });
  return client;
}

function bucket(): string {
  return process.env.R2_BUCKET ?? "";
}

/** Khóa đối tượng do máy chủ đặt (client chỉ gửi content_type/size). */
export function audioKeyFor(userId: string, sessionId: string, mime: AudioMime): string {
  return `u/${userId}/${sessionId}/original.${extOfAudioMime(mime)}`;
}

/** Chỉ khóa của đối tượng băng ghi mới được dùng qua lối này (buổi mẫu giữ
 * đường dẫn tĩnh /audio/…, không đi qua đây). */
export function isAudioObjectKey(key: string | null): boolean {
  return typeof key === "string" && key.startsWith("u/");
}

/* ---------- Kho giả (R2_FAKE=1) ---------- */

type FakeObject = { data: Uint8Array; contentType: string };

/** Kho giả phải sống qua hot reload của dev server: giữ trên globalThis. */
const fakeGlobal = globalThis as typeof globalThis & { __noteimR2Fake?: Map<string, FakeObject> };
const fakeStore: Map<string, FakeObject> = (fakeGlobal.__noteimR2Fake ??= new Map());

/* ---------- Presign / head / delete ---------- */

const PUT_EXPIRES = 600; // presigned PUT sống 10 phút (chốt yêu cầu 2b)
const GET_EXPIRES = 900; // signed GET sống 15 phút (chốt yêu cầu 3)

export async function presignPutUrl(key: string, mime: AudioMime): Promise<string> {
  if (requireMode() === "fake") return `/api/audio/fake/${key}`;
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: mime }),
    { expiresIn: PUT_EXPIRES },
  );
}

export async function presignGetUrl(key: string): Promise<string> {
  if (requireMode() === "fake") return `/api/audio/fake/${key}`;
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: GET_EXPIRES });
}

/** HEAD đối tượng: trả kích thước byte, null là chưa có (hoặc không đọc được). */
export async function headObjectSize(key: string): Promise<number | null> {
  if (requireMode() === "fake") return fakeStore.get(key)?.data.byteLength ?? null;
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return typeof res.ContentLength === "number" ? res.ContentLength : null;
  } catch {
    return null;
  }
}

/** Xóa đối tượng (xóa buổi, purge băng gốc, cron hết hạn). Không nổ khi
 * đối tượng đã mất — xóa là an toàn lặp lại. */
export async function deleteObjectSafe(key: string): Promise<void> {
  if (requireMode() === "fake") {
    fakeStore.delete(key);
    return;
  }
  try {
    await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  } catch {
    // đã mất/không xóa được thì thôi — cron sẽ dọn lại, không chặn luồng chính
  }
}

/* ---------- Kho giả: PUT/GET có Range (giống hình dạng R2 thật) ---------- */

export function fakePutObject(key: string, data: Uint8Array, contentType: string): string {
  fakeStore.set(key, { data, contentType });
  return `"fake-${key.length}-${data.byteLength}"`;
}

export function fakeHeadObject(key: string): { size: number; contentType: string } | null {
  const obj = fakeStore.get(key);
  if (!obj) return null;
  return { size: obj.data.byteLength, contentType: obj.contentType };
}

/** Phản hồi GET của kho giả, hỗ trợ Range "bytes=start-end" để tua nghe lại
 * (chốt yêu cầu 3: trình phát dùng Range). Trả null khi đối tượng không có. */
export function fakeGetObjectResponse(key: string, rangeHeader: string | null): Response | null {
  const obj = fakeStore.get(key);
  if (!obj) return null;
  const { data, contentType } = obj;
  const total = data.byteLength;

  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (match) {
      const [, rawStart, rawEnd] = match;
      let start = rawStart === "" ? null : Number(rawStart);
      let end = rawEnd === "" ? null : Number(rawEnd);
      if (start === null && end !== null) {
        // "bytes=-N": N byte cuối
        start = Math.max(0, total - Number(end));
        end = total - 1;
      }
      if (start === null || start >= total) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${total}` },
        });
      }
      end = end === null || end >= total ? total - 1 : end;
      if (end < start) end = total - 1;
      const slice = data.subarray(start, end + 1);
      return new Response(slice as unknown as BodyInit, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(slice.byteLength),
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Accept-Ranges": "bytes",
        },
      });
    }
  }

  return new Response(data as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(total),
      "Accept-Ranges": "bytes",
      ETag: `"fake-${key.length}-${total}"`,
    },
  });
}
