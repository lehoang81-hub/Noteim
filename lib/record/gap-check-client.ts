"use client";

import type { GapCheckResult } from "@/lib/gap-check/types";

/*
 * Client gọi endpoint Gap Check (GC-02) từ màn hình ghi âm (GC-03, đặc tả v1.1 §3).
 * B4 gửi transcript cắt tối đa 8.000 ký tự gần nhất (đặc tả §3); lỗi luôn trả
 * mã máy + lời nhắn ngắn, giao diện tuyệt đối không hiện dữ liệu model bịa.
 * Mọi chuỗi hiển thị nằm ở nơi gọi (messages/*.json) — client chỉ trả mã lỗi.
 */

export const GAP_CHECK_TRANSCRIPT_CHARS = 8000;
const GAP_CHECK_TIMEOUT_MS = 12000;

/** Đầu vào của một lượt rà từ màn ghi âm (GC-03). */
export type GapCheckInput = {
  sessionId: string;
  templateId: string;
  transcript: string;
  transcriptUntilMs: number;
};

export type GapCheckOutcome =
  | { ok: true; result: GapCheckResult; latencyMs: number; remaining: number | null }
  | { ok: false; error: string; message: string };

/** Cắt transcript giữ 8.000 ký tự gần nhất, đứt tại ranh giới đoạn để không cụt giữa câu. */
export function transcriptTail(segments: Array<{ text: string }>, maxChars = GAP_CHECK_TRANSCRIPT_CHARS): string {
  const tail: string[] = [];
  let total = 0;
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const text = segments[i].text.trim();
    if (!text) continue;
    if (tail.length > 0 && total + text.length > maxChars) break;
    tail.unshift(text);
    total += text.length + 1;
  }
  return tail.join("\n");
}

export async function runGapCheck(input: {
  sessionId: string;
  templateId: string;
  transcript: string;
  transcriptUntilMs: number;
}): Promise<GapCheckOutcome> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), GAP_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(input.sessionId)}/gap-check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        templateId: input.templateId,
        transcript: input.transcript,
        transcriptUntilMs: input.transcriptUntilMs,
      }),
    });
    const json = (await res.json().catch(() => null)) as {
      result?: GapCheckResult;
      meta?: { latencyMs?: number; remaining?: number | null };
      error?: string;
      message?: string;
    } | null;
    if (res.ok && json?.result) {
      return {
        ok: true,
        result: json.result,
        latencyMs: json.meta?.latencyMs ?? 0,
        remaining: json.meta?.remaining ?? null,
      };
    }
    return { ok: false, error: json?.error ?? "network", message: json?.message ?? "" };
  } catch {
    return { ok: false, error: "network", message: "" };
  } finally {
    window.clearTimeout(timer);
  }
}
