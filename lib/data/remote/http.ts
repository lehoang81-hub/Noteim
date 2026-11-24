"use client";

import { DataError, type DataErrorCode } from "../errors";

/*
 * Ống dẫn fetch cho nguồn dữ liệu remote (C1-03b). Client chỉ nói chuyện
 * với API route của app (lib/db/index.ts — DATABASE_URL không bao giờ ra
 * trình duyệt). Mỗi lỗi HTTP được đổi thành DataError đúng mã để màn hình
 * hiển thị như khi bản giả lỗi (docs/04).
 */

export async function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

export async function apiSend<T>(path: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown): Promise<T> {
  return request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    throw new DataError("offline", "Mất mạng, thử lại khi có mạng");
  }
  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
  let message = "Lỗi máy chủ, thử lại";
  try {
    const body = (await res.json()) as { message?: string };
    if (body.message) message = body.message;
  } catch {
    // thân lỗi không phải JSON: giữ thông điệp mặc định
  }
  const mapped: DataErrorCode =
    res.status === 404
      ? "not_found"
      : res.status === 403 || res.status === 401
        ? "forbidden"
        : res.status === 429
          ? "quota_exceeded"
          : "server";
  throw new DataError(mapped, message);
}
