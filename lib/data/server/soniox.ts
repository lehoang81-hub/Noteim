/**
 * C1-05 — client Soniox async phía máy chủ (nhận dạng giọng nói → chữ có
 * người nói và ngôn ngữ từng đoạn).
 *
 * Nguồn API (ngày xem 25/11/2026, ghi ở docs/LOG.md):
 * - Đặc tả chính thức docs.soniox.com/openapi.yaml: POST /v1/transcriptions
 *   nhận JSON body `CreateTranscriptionPayload` — chỉ bắt buộc `model`;
 *   `audio_url` (≤ 4096 ký tự, http(s)) là URL công khai của băng — DỤNG RIÊNG
 *   khi không có `file_id` (hai trường loại nhau).
 * - Flow đã gọi thật ở B0-01 (scripts/b0-asr/providers/soniox.mjs,
 *   docs/11-b0-ket-qua.md): poll GET /v1/transcriptions/{id} tới
 *   `completed` (lỗi thì error_type/error_message), lấy chữ tại
 *   GET /v1/transcriptions/{id}/transcript → { text, tokens }, token có
 *   text (TỰ MANG dấu cách — ghép nối chuỗi trực tiếp), start_ms, end_ms,
 *   speaker, language; sau đó DELETE cả việc nhận dạng lẫn file (chính sách
 *   dữ liệu: không lưu băng/chữ — xóa ngay sau khi lấy kết quả).
 * - Model async hiện hành `stt-async-v6` (liệt kê từ /v1/models, đo thật
 *   B0 ngày 19/11); đổi bằng biến môi trường SONIOX_MODEL.
 *
 * Chế độ SONIOX_FAKE=1 (chỉ máy kiểm thử/e2e): trả kết quả giả cố định,
 * KHÔNG gọi API — bị chặn tuyệt đối khi VERCEL_ENV=production.
 *
 * Quy tắc nhật ký: không ghi URL presigned, không ghi transcript; chỉ ghi
 * sự kiện ngắn (bước, mã lỗi, độ trễ).
 */
import { ApiError } from "./context";

const BASE = "https://api.soniox.com/v1";
/** Ngôn ngữ hay gặp của Noteim (docs khuyến nghị đặt hints để tăng chính xác). */
export const SONIOX_LANG_HINTS = ["vi", "ko", "en"];
/** Mặc định model async hiện hành (đo thật B0 19/11; đổi bằng SONIOX_MODEL). */
export const SONIOX_MODEL_DEFAULT = "stt-async-v6";
/** Nghỉ giữa hai từ quá ngưỡng này (giây) thì tách đoạn — kinh nghiệm B0. */
const GAP_SEC = 0.8;

export type SonioxToken = {
  text: string;
  start_sec: number | null;
  end_sec: number | null;
  speaker: string | null;
  lang: string | null;
};

export type SonioxSegment = {
  speaker: string | null;
  lang: string | null;
  start_sec: number;
  end_sec: number;
  text: string;
};

export type SonioxStatus = "queued" | "processing" | "completed" | "error";

/** Lỗi gọi Soniox: thông điệp ngắn an toàn (không mang nội dung băng/chữ). */
export class SonioxError extends Error {
  constructor(
    public step: "start" | "status" | "transcript" | "cleanup",
    public status: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = "SonioxError";
  }
}

/** SONIOX_FAKE chỉ có hiệu lực ngoài production — sai quy định thì bỏ qua. */
export function sonioxFakeActive(): boolean {
  if (process.env.SONIOX_FAKE !== "1") return false;
  if (process.env.VERCEL_ENV === "production") {
    console.warn("[asr] SONIOX_FAKE bị bỏ qua trên production");
    return false;
  }
  return true;
}

/** Máy chủ có khóa Soniox hay chưa (không fake). */
export function sonioxConfigured(): boolean {
  return Boolean(process.env.SONIOX_API_KEY);
}

function authHeaders(): HeadersInit {
  const key = process.env.SONIOX_API_KEY;
  if (!key) throw new ApiError(503, "asr_not_configured", "Máy chủ chưa cấu hình khóa nhận dạng giọng nói");
  return { Authorization: `Bearer ${key}` };
}

async function sonioxFetch(path: string, init?: RequestInit, step: SonioxError["step"] = "status"): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    throw new SonioxError(step, undefined, error instanceof Error ? error.message.slice(0, 120) : "lỗi mạng");
  }
  if (!res.ok) {
    // 401/403: khóa sai — mã hóa an toàn, không kèm thân phản hồi của hãng
    throw new SonioxError(step, res.status, `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  try {
    return (await res.json()) as unknown;
  } catch {
    throw new SonioxError(step, res.status, "phản hồi không đọc được");
  }
}

/** Tạo việc nhận dạng từ URL công khai của băng (presigned GET R2 hạn 1 giờ). */
export async function sonioxStart(audioUrl: string): Promise<{ id: string }> {
  const started = Date.now();
  const body = {
    model: process.env.SONIOX_MODEL || SONIOX_MODEL_DEFAULT,
    audio_url: audioUrl,
    language_hints: SONIOX_LANG_HINTS,
    enable_language_identification: true,
    enable_speaker_diarization: true,
  };
  const created = (await sonioxFetch(
    "/transcriptions",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    "start",
  )) as { id?: string };
  if (!created?.id) throw new SonioxError("start", undefined, "không trả id việc nhận dạng");
  console.log(`[asr] soniox start ${JSON.stringify({ ms: Date.now() - started, ts: new Date().toISOString() })}`);
  return { id: created.id };
}

/** Hỏi trạng thái việc nhận dạng (status enum theo đặc tả). */
export async function sonioxStatus(id: string): Promise<{ status: SonioxStatus; fileId: string | null }> {
  const job = (await sonioxFetch(`/transcriptions/${encodeURIComponent(id)}`, { method: "GET" }, "status")) as {
    status?: SonioxStatus;
    file_id?: string | null;
    error_type?: string | null;
    error_message?: string | null;
  };
  const status = job.status ?? "queued";
  if (status === "error") {
    // Mã lỗi của hãng là an toàn (không mang nội dung) — giữ ngắn
    throw new SonioxError("status", undefined, `${job.error_type ?? "asr_error"}`.slice(0, 120));
  }
  return { status, fileId: job.file_id ?? null };
}

/** Lấy tokens (chưa ghép đoạn) từ việc đã completed. */
export async function sonioxFetchTokens(id: string): Promise<SonioxToken[]> {
  const started = Date.now();
  const transcript = (await sonioxFetch(`/transcriptions/${encodeURIComponent(id)}/transcript`, { method: "GET" }, "transcript")) as {
    tokens?: Array<{ text?: string; start_ms?: number | null; end_ms?: number | null; speaker?: number | string | null; language?: string | null }>;
    text?: string;
  };
  console.log(`[asr] soniox transcript ${JSON.stringify({ ms: Date.now() - started, ts: new Date().toISOString() })}`);
  const raw = Array.isArray(transcript.tokens) ? transcript.tokens : [];
  return raw.map((t) => ({
    text: t.text ?? "",
    start_sec: t.start_ms == null ? null : t.start_ms / 1000,
    end_sec: t.end_ms == null ? null : t.end_ms / 1000,
    speaker: t.speaker === undefined || t.speaker === null ? null : String(t.speaker),
    lang: t.language ?? null,
  }));
}

/** Dọn dẹp phía Soniox: xóa việc nhận dạng và file (nếu có) — lỗi bỏ qua. */
export async function sonioxCleanup(id: string, fileId: string | null): Promise<void> {
  try {
    await sonioxFetch(`/transcriptions/${encodeURIComponent(id)}`, { method: "DELETE" }, "cleanup");
  } catch {
    // bỏ qua — việc tự hết hạn theo chính sách của hãng
  }
  if (fileId) {
    try {
      await sonioxFetch(`/files/${encodeURIComponent(fileId)}`, { method: "DELETE" }, "cleanup");
    } catch {
      // bỏ qua
    }
  }
}

/** Ghép token thành đoạn: đổi người nói, đổi ngôn ngữ hay nghỉ quá GAP_SEC thì tách. */
export function groupSonioxTokens(tokens: SonioxToken[]): SonioxSegment[] {
  const segs: SonioxSegment[] = [];
  let cur: SonioxSegment | null = null;
  for (const t of tokens) {
    if (!t.text) continue;
    const start: number = t.start_sec ?? cur?.end_sec ?? 0;
    const end: number = t.end_sec ?? t.start_sec ?? start;
    const same =
      cur &&
      cur.speaker === t.speaker &&
      cur.lang === t.lang &&
      end - cur.end_sec <= GAP_SEC;
    if (same && cur) {
      cur.text += t.text;
      cur.end_sec = end;
    } else {
      cur = { speaker: t.speaker, lang: t.lang, start_sec: start, end_sec: end, text: t.text };
      segs.push(cur);
    }
  }
  for (const s of segs) s.text = s.text.trim();
  return segs.filter((s) => s.text.length > 0);
}

/* ---------- Chế độ giả (e2e) ---------- */

/** Giọng giả cố định: hai người nói, có số liệu + ngày để e2e khớp với tóm tắt giả. */
const FAKE_LINES: Array<{ speaker: string; text: string }> = [
  { speaker: "0", text: "Dạ em chào anh, em gửi lại bảng tính vay 50% giá trị căn hộ cho anh nhé." },
  { speaker: "1", text: "Ừ em, anh thấy lãi suất 8 phần trăm năm còn cao quá, ngân sách nhà anh tối đa 4,2 tỷ thôi." },
  { speaker: "0", text: "Dạ em sẽ đàm phán lại lãi suất còn 7 phần trăm, tuần này em gửi anh bảng so sánh hai căn 18.06 và Imperia." },
  { speaker: "1", text: "Anh muốn đặt cọc trước ngày 15/11, anh bận họp cả tuần sau nên hẹn em sáng thứ Bảy xem nhà." },
  { speaker: "0", text: "Dạ em chốt với anh: ngày 15/11 đặt cộc, phí quản lý 1,2 triệu một tháng đã gồm phần của xe." },
];

/** Sinh đoạn giả trải đều theo thời lượng buổi (dùng cho e2e, không gọi API). */
export function fakeSonioxSegments(durationSec: number): SonioxSegment[] {
  const total = Math.max(5, durationSec);
  const n = Math.min(FAKE_LINES.length, Math.max(1, Math.round(total / 10)));
  const segs: SonioxSegment[] = [];
  for (let i = 0; i < n; i++) {
    const start = Math.round((total / n) * i);
    const end = Math.min(total, Math.round((total / n) * (i + 1)) - 1);
    const line = FAKE_LINES[i % FAKE_LINES.length];
    segs.push({
      speaker: line.speaker,
      lang: "vi",
      start_sec: start,
      end_sec: Math.max(start + 1, end),
      text: line.text,
    });
  }
  return segs;
}
