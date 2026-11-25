// GC-02 (b4/gc-02-api) — Endpoint Gap Check (đặc tả v1.1 §3, §7).
// POST: rà thiếu thông tin của buổi → model tốc độ cao → parse chặt → lưu SessionGapCheck.
// GET : kết quả rà gần nhất + lịch sử (nguồn cho checklist "Cần bổ sung sau buổi").
// Mọi lỗi đều trả mã máy + lời nhắn ngắn; không bao giờ trả dữ liệu model bịa.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getIntakeTemplate } from "@/lib/intake-templates";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/gap-check/prompt";
import { parseGapCheckOutput } from "@/lib/gap-check/parse";
import {
  addSessionGapCheck,
  assertSessionAccess,
  getLatestGapCheckResult,
  listSessionGapChecks,
} from "@/lib/gap-check/store";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/nextauth-options";
import { consumeQuota, type GapCheckPlan } from "@/lib/gap-check/rate-limit";
import { runGapCheckChain, GapCheckChainError, parseFakePlanHeader, type GapCheckAttempt } from "@/lib/gap-check/provider";
import { DataError } from "@/lib/data/errors";
import type { GapCheckResult, SessionGapCheckRow } from "@/lib/gap-check/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // Kiểm quyền TRƯỚC khi trừ lượt miễn phí: người B chạm buổi của A phải
  // nhận 403 kể cả khi đã hết lượt — trước đây route trừ lượt trước nên B
  // hết lượt nhận 429 thay vì 403 (e2e c1-remote bắt được).
  try {
    await assertSessionAccess(sessionId);
  } catch (error) {
    if (error instanceof DataError) {
      return jsonError(error.code === "forbidden" ? 403 : 500, error.code, "Không có quyền rà buổi này");
    }
    throw error;
  }

  // Chưa có đăng nhập thật: không tin gói do trình duyệt tự khai (ai cũng gửi được "pro").
  // Chỉ chấp nhận header này khi chạy AI giả lập để kiểm thử. Khi có C1 thì lấy gói từ tài khoản.
  const trustPlanHeader = process.env.GAP_CHECK_FAKE !== undefined && process.env.GAP_CHECK_FAKE !== "";
  const plan: GapCheckPlan =
    trustPlanHeader && request.headers.get("x-noteim-plan") === "pro" ? "pro" : "free";
  // Lượt miễn phí chia theo người đã đăng nhập (khung giờ đổi khi có C1);
  // ẩn danh vẫn theo mã khách trên header — hai người đăng nhập không đủ lượt của nhau.
  const session = await getServerSession(authOptions);
  const clientId = session?.user?.id ?? request.headers.get("x-noteim-client") ?? "anon";
  const quota = consumeQuota(clientId, plan);
  if (!quota.ok) {
    logGapCheck({ event: "gap_check", sessionId, templateId: body.templateId, outcome: "rate_limited", ts: new Date().toISOString() });
    return jsonError(429, "rate_limited", "Đã hết lượt rà miễn phí trong ngày", {
      limit: quota.limit,
      remaining: 0,
    });
  }

  let previous: GapCheckResult | undefined;
  if (body.previous) {
    previous = toPreviousResult(body.previous);
  } else {
    // Kết quả gần nhất: bảng DB cho người đăng nhập (buổi là của mình),
    // Map bộ nhớ cho ẩn danh; buổi người khác bị chặn 403 (C1-03b)
    try {
      previous = (await getLatestGapCheckResult(sessionId)) ?? undefined;
    } catch (error) {
      if (error instanceof DataError) {
        return jsonError(error.code === "forbidden" ? 403 : 500, error.code, "Không đọc được lịch sử rà của buổi này");
      }
      throw error;
    }
  }

  // Kế hoạch ép lỗi của stub (chỉ nhận khi GAP_CHECK_FAKE bật) để e2e giả lập
  // chuyển bên: "gemini:500,anthropic:429"…
  const fakePlan = trustPlanHeader ? parseFakePlanHeader(request.headers.get("x-noteim-fake-plan")) : null;

  const startedAt = Date.now();
  let outcome: { result: GapCheckResult; provider: string; attempts: GapCheckAttempt[] } | null = null;
  try {
    outcome = await runGapCheckChain<GapCheckResult>(
      {
        system: buildSystemPrompt(template, body.transcript, previous ?? null),
        user: buildUserPrompt(),
        template,
        transcript: body.transcript,
        fakePlan,
      },
      (raw) => parseGapCheckOutput(raw, template),
    );
  } catch (error) {
    if (!(error instanceof GapCheckChainError)) throw error;
    const latencyMs = Date.now() - startedAt;
    const attempts = error.attempts;
    const tried = attempts.filter((a) => a.outcome !== "unconfigured");
    const outcomeName = tried.length === 0 ? "not_configured" : "chain_exhausted";
    logGapCheck({
      event: "gap_check",
      sessionId,
      templateId: body.templateId,
      attempts,
      latencyMs,
      outcome: outcomeName,
      ts: new Date().toISOString(),
    });
    // Toàn bộ bên chưa cấu hình → mã cũ ai_not_configured; có bên chạy nhưng hét
    // chuỗi (429/5xx/timeout/parse sai) → provider_unavailable. Cả hai trả 503.
    return jsonError(503, tried.length === 0 ? "ai_not_configured" : "provider_unavailable", "Chưa rà được, thử lại", {
      attempts,
    });
  }
  if (!outcome) {
    return jsonError(503, "ai_not_configured", "Chưa rà được, thử lại");
  }
  const { result, provider, attempts } = outcome;
  const latencyMs = Date.now() - startedAt;

  let row: SessionGapCheckRow;
  try {
    row = await addSessionGapCheck({
      sessionId,
      templateId: body.templateId,
      transcriptUntilMs: body.transcriptUntilMs ?? 0,
      result,
    });
  } catch (error) {
    if (error instanceof DataError) {
      return jsonError(error.code === "forbidden" ? 403 : 500, error.code, "Không ghi được lịch sử rà thiếu");
    }
    throw error;
  }
  logGapCheck({
    event: "gap_check",
    sessionId,
    templateId: body.templateId,
    provider,
    attempts,
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
      // Tên bên đã dùng cho lượt rà này (zai | gemini | anthropic | stub).
      provider,
      attempts,
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
  let rows;
  try {
    rows = await listSessionGapChecks(sessionId);
  } catch (error) {
    if (error instanceof DataError) {
      return jsonError(403, error.code, "Không có quyền xem lịch sử rà của buổi này");
    }
    throw error;
  }
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
