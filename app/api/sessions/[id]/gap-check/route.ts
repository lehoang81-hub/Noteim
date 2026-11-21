// GC-02 (b4/gc-02-api) — Endpoint Gap Check (đặc tả v1.1 §3, §7).
// POST: rà thiếu thông tin của buổi → model tốc độ cao → parse chặt → lưu SessionGapCheck.
// GET : kết quả rà gần nhất + lịch sử (nguồn cho checklist "Cần bổ sung sau buổi").
// Mọi lỗi đều trả mã máy + lời nhắn ngắn; không bao giờ trả dữ liệu model bịa.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getIntakeTemplate } from "@/lib/intake-templates";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/gap-check/prompt";
import { GapCheckParseError, parseGapCheckOutput } from "@/lib/gap-check/parse";
import {
  addSessionGapCheck,
  getLatestGapCheckResult,
  listSessionGapChecks,
} from "@/lib/gap-check/store";
import { consumeQuota, type GapCheckPlan } from "@/lib/gap-check/rate-limit";
import { getGapCheckProvider } from "@/lib/gap-check/provider";
import type { GapCheckResult } from "@/lib/gap-check/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUEST_TIMEOUT_MS = 15000;
const TRANSCRIPT_INPUT_MAX_CHARS = 100000;

const previousSchema = z.object({
  slots_status: z.array(z.object({ key: z.string(), filled: z.boolean() })),
});

const postBodySchema = z.object({
  templateId: z.string().min(1),
  transcript: z.string().max(TRANSCRIPT_INPUT_MAX_CHARS),
  previous: previousSchema.optional(),
  transcriptUntilMs: z.number().nonnegative().optional(),
});

class GapCheckTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new GapCheckTimeoutError("model vượt quá thời gian chờ"));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function jsonError(status: number, error: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, message, ...extra }, { status });
}

/** Log một dòng cho đo p95 — không bao giờ ghi nội dung transcript (dữ liệu nhạy cảm). */
function logGapCheck(fields: Record<string, unknown>): void {
  console.log(`[gap-check] ${JSON.stringify(fields)}`);
}

function toPreviousResult(previous: z.infer<typeof previousSchema>): GapCheckResult {
  return {
    ready_to_close: false,
    slots_status: previous.slots_status.map((slot) => ({
      key: slot.key,
      filled: slot.filled,
      confidence: "low" as const,
      evidence: "",
    })),
    missing_priorities: [],
    one_line_bridge: "",
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await context.params;

  let body: z.infer<typeof postBodySchema>;
  try {
    body = postBodySchema.parse(await request.json());
  } catch {
    return jsonError(400, "bad_request", "Thân yêu cầu không đúng cấu trúc (cần templateId, transcript)");
  }

  const template = getIntakeTemplate(body.templateId);
  if (!template) {
    return jsonError(400, "template_not_found", `Không có mẫu nghiệp vụ "${body.templateId}"`);
  }

  // Chưa có đăng nhập thật: không tin gói do trình duyệt tự khai (ai cũng gửi được "pro").
  // Chỉ chấp nhận header này khi chạy AI giả lập để kiểm thử. Khi có C1 thì lấy gói từ tài khoản.
  const trustPlanHeader = process.env.GAP_CHECK_FAKE !== undefined && process.env.GAP_CHECK_FAKE !== "";
  const plan: GapCheckPlan =
    trustPlanHeader && request.headers.get("x-noteim-plan") === "pro" ? "pro" : "free";
  const clientId = request.headers.get("x-noteim-client") || "anon";
  const quota = consumeQuota(clientId, plan);
  if (!quota.ok) {
    logGapCheck({ event: "gap_check", sessionId, templateId: body.templateId, outcome: "rate_limited", ts: new Date().toISOString() });
    return jsonError(429, "rate_limited", "Đã hết lượt rà miễn phí trong ngày", {
      limit: quota.limit,
      remaining: 0,
    });
  }

  const previous = body.previous
    ? toPreviousResult(body.previous)
    : getLatestGapCheckResult(sessionId);

  const provider = await getGapCheckProvider();
  if (!provider) {
    return jsonError(503, "ai_not_configured", "Chưa rà được, thử lại");
  }

  const startedAt = Date.now();
  let raw: string;
  try {
    raw = await withTimeout(
      provider.run({
        system: buildSystemPrompt(template, body.transcript, previous),
        user: buildUserPrompt(),
        template,
        transcript: body.transcript,
      }),
      REQUEST_TIMEOUT_MS,
    );
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const outcome = error instanceof GapCheckTimeoutError ? "timeout" : "provider_error";
    logGapCheck({
      event: "gap_check",
      sessionId,
      templateId: body.templateId,
      provider: provider.name,
      latencyMs,
      outcome,
      ts: new Date().toISOString(),
    });
    return jsonError(502, outcome, "Chưa rà được, thử lại");
  }

  const latencyMs = Date.now() - startedAt;
  let result: GapCheckResult;
  try {
    result = parseGapCheckOutput(raw, template);
  } catch (error) {
    if (error instanceof GapCheckParseError) {
      logGapCheck({
        event: "gap_check",
        sessionId,
        templateId: body.templateId,
        provider: provider.name,
        latencyMs,
        outcome: "parse_error",
        detail: error.code,
        ts: new Date().toISOString(),
      });
      return jsonError(502, "bad_model_output", "Chưa rà được, thử lại", { detail: error.code });
    }
    throw error;
  }

  const row = addSessionGapCheck({
    sessionId,
    templateId: body.templateId,
    transcriptUntilMs: body.transcriptUntilMs ?? 0,
    result,
  });
  logGapCheck({
    event: "gap_check",
    sessionId,
    templateId: body.templateId,
    provider: provider.name,
    latencyMs,
    outcome: "ok",
    ts: new Date().toISOString(),
  });

  return NextResponse.json({
    checkId: row.id,
    sessionId,
    templateId: body.templateId,
    result,
    meta: {
      provider: provider.name,
      latencyMs,
      checkedAt: row.checkedAt,
      remaining: quota.remaining,
      limit: Number.isFinite(quota.limit) ? quota.limit : null,
    },
  });
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await context.params;
  const rows = listSessionGapChecks(sessionId);
  const latest = rows.at(-1) ?? null;
  return NextResponse.json({
    sessionId,
    latest: latest
      ? {
          checkId: latest.id,
          templateId: latest.templateId,
          checkedAt: latest.checkedAt,
          transcriptUntilMs: latest.transcriptUntilMs,
          result: JSON.parse(latest.resultJson) as GapCheckResult,
        }
      : null,
    history: rows.map((row) => ({
      checkId: row.id,
      templateId: row.templateId,
      checkedAt: row.checkedAt,
    })),
  });
}
