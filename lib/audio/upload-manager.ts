"use client";

import { baseContentType } from "./recorder";
import {
  blobFromEntry,
  listPendingKeys,
  readEntry,
  removeEntry,
  sessionKey,
} from "./chunk-store";
import { clearUpload, setUpload } from "./upload-store";
import { bumpVersion } from "@/lib/data/changes";

/*
 * Điều phối tải băng lên R2 (C1-04 yêu cầu 2b/2c): trình duyệt PUT thẳng lên
 * kho qua Presigned Upload URL — thân băng KHÔNG đi qua API route (trần ~4,5
 * MB của Vercel Serverless). Thứ tự bắt buộc:
 *   POST /api/audio/presign {session_id, content_type, size}
 *   PUT thẳng theo upload_url (tiến độ phần trăm cho dải "Đang tải lên")
 *   POST /api/audio/complete {session_id}  ← xong bước này mới bỏ nhãn
 *                                            "Bản ghi thử: chưa lưu âm thanh"
 *
 * Thử lại: lỗi mạng thì chờ trở lại mạng rồi thử lại (tối đa 4 lượt trong
 * một lần gọi); hết lượt thì giữ băng trong IndexedDB + danh sách chờ — lần
 * mở app sau hoặc khi mạng quay lại tự tải tiếp (yêu cầu 2a/2c).
 * Chỉ băng CHỐT xong (complete thành công) mới xóa khỏi IndexedDB.
 *
 * Bảo mật: khóa đối tượng do máy chủ đặt; client không gửi khóa, không gửi
 * user_id. Người ẩn danh (mock) không tải lên gì — buổi ghi vẫn "Bản ghi thử".
 */

const PENDING_KEY = "noteim-audio-pending";
const RETRY_DELAYS_MS = [400, 1500, 4000];
const MAX_ATTEMPTS = 4;

/** Kết quả dò hỗ trợ (đã đăng nhập + máy chủ có kho) — dò một lần mỗi lần tải app. */
let supportPromise: Promise<boolean> | null = null;

function ensureSupport(): Promise<boolean> {
  supportPromise ??= (async () => {
    try {
      const [session, mode] = await Promise.all([
        fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch("/api/data/mode", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      return Boolean((session as { user?: { id?: string } } | null)?.user?.id) && Boolean((mode as { r2?: boolean } | null)?.r2);
    } catch {
      return false;
    }
  })();
  return supportPromise;
}

function readPending(): string[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writePending(ids: string[]) {
  try {
    if (ids.length) localStorage.setItem(PENDING_KEY, JSON.stringify(ids));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // localStorage đầy/bị chặn: chỉ còn retry trong phiên này
  }
}

function addToPending(sessionId: string) {
  const ids = readPending().filter((id) => id !== sessionId);
  ids.push(sessionId);
  writePending(ids);
}

function removeFromPending(sessionId: string) {
  writePending(readPending().filter((id) => id !== sessionId));
}

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

/** Chờ mạng quay lại (sự kiện online); quá 2 phút thì thử lại dù sao. */
function waitOnline(): Promise<void> {
  if (navigator.onLine) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      window.removeEventListener("online", done);
      resolve();
    };
    window.addEventListener("online", done);
    window.setTimeout(done, 120_000);
  });
}

/** PUT thẳng lên presigned URL với tiến độ phần trăm (XHR — fetch chưa có
 * sự kiện tiến độ của phần thân tải lên). */
function putWithProgress(url: string, blob: Blob, contentType: string, onPercent: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onPercent(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`put_http_${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("put_network"));
    xhr.ontimeout = () => reject(new Error("put_timeout"));
    xhr.send(blob);
  });
}

/** Tải băng của một buổi lên R2. An toàn gọi nhiều lần (đang tải buổi khác
 * thì buổi này vào danh sách chờ). */
export async function uploadSessionAudio(sessionId: string): Promise<void> {
  const supported = await ensureSupport();
  const key = sessionKey(sessionId);
  if (!supported) {
    // Không đăng nhập / không có kho: không có gì để tải — dọn phần chờ
    removeFromPending(sessionId);
    await removeEntry(key).catch(() => undefined);
    return;
  }

  const entry = await readEntry(key);
  if (!entry || entry.chunks.length === 0) {
    removeFromPending(sessionId);
    return;
  }
  const blob = await blobFromEntry(entry);
  const contentType = baseContentType(entry.mime);
  if (!contentType) {
    removeFromPending(sessionId);
    return;
  }

  setUpload({ sessionId, percent: 0, status: "uploading" });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const presignRes = await fetch("/api/audio/presign", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, content_type: contentType, size: blob.size }),
      });
      if (presignRes.status === 409 || presignRes.status >= 500) {
        throw new Error("presign_retryable");
      }
      if (!presignRes.ok) {
        // 400 loại file, 403 không phải chủ, 413 vượt trần, 503 chưa cấu hình:
        // thử lại vô ích — dừng, băng vẫn nằm trong IndexedDB, buổi vẫn Bản ghi thử
        setUpload({ sessionId, percent: 0, status: "failed" });
        removeFromPending(sessionId);
        return;
      }
      const { upload_url: uploadUrl } = (await presignRes.json()) as { upload_url: string };

      await putWithProgress(uploadUrl, blob, contentType, (percent) => {
        setUpload({ sessionId, percent, status: "uploading" });
      });

      const completeRes = await fetch("/api/audio/complete", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, content_type: contentType, size: blob.size }),
      });
      if (completeRes.ok) {
        // Chốt xong: bỏ nhãn Bản ghi thử phía máy chủ đã xong — báo màn hình
        // đang mở tải lại để nhãn biến mất mà không cần tải lại trang.
        await removeEntry(key).catch(() => undefined);
        removeFromPending(sessionId);
        setUpload({ sessionId, percent: 100, status: "complete" });
        bumpVersion();
        window.setTimeout(() => clearUpload(), 3000);
        return;
      }
      if (completeRes.status === 409 || completeRes.status >= 500) {
        // Kho thiếu/lệch băng: PUT lại từ đầu
        throw new Error("complete_retryable");
      }
      // 4xx khác (không phải chủ, vượt trần…): thử lại vô ích
      setUpload({ sessionId, percent: 0, status: "failed" });
      removeFromPending(sessionId);
      return;
    } catch {
      // Lỗi mạng/PUT đứt giữa chừng: chờ mạng rồi thử lại; hết lượt thì
      // giữ băng + danh sách chờ — mở lại app tự tải tiếp.
      await waitOnline();
      if (attempt >= MAX_ATTEMPTS) {
        setUpload({ sessionId, percent: 0, status: "failed" });
        addToPending(sessionId);
        return;
      }
      await delay(RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]);
    }
  }
}

/** Đưa buổi vào hàng tải ngay sau khi tạo buổi xong (màn ghi gọi). */
export function schedulePendingUpload(sessionId: string): void {
  addToPending(sessionId);
  void uploadSessionAudio(sessionId).catch(() => undefined);
}

/** Tải lại các buổi còn chờ (mở app lần sau / mạng quay lại). Chạy tuần tự
 * để không dồn băng lớn nhiều buổi cùng lúc. */
export async function retryPendingUploads(): Promise<void> {
  const ids = readPending();
  if (!ids.length) return;
  if (!(await ensureSupport())) return;
  for (const id of ids) {
    await uploadSessionAudio(id).catch(() => undefined);
  }
}

/** Mạng quay lại hoặc mở app: tự dò phần chờ. */
if (typeof window !== "undefined") {
  window.addEventListener("online", () => void retryPendingUploads());
  window.setTimeout(() => void retryPendingUploads(), 4000);
}

/** Danh sách khóa băng còn chờ (dùng để hiện tình trạng khi mở lại app). */
export function pendingUploadKeys(): Promise<string[]> {
  return listPendingKeys();
}
