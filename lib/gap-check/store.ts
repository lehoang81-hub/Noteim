// GC-02 (b4/gc-02-api) — "Bảng" SessionGapCheck trong bộ nhớ máy chủ (đặc tả v1.1 §3).
// Mockup chưa nối database: bảng nằm trong Map của tiến trình Node, shape đúng các cột
// sẽ dùng khi chuyển sang DB thật (id, sessionId, templateId, checkedAt, transcriptUntilMs,
// resultJson). Chạy trên nền serverless thì dữ liệu sống theo từng instance — đủ cho
// giai đoạn duyệt mockup và đo p95; lịch sử tối đa 10 lần/buổi theo đặc tả.

import type { GapCheckResult, SessionGapCheckRow } from "./types";

/** Đặc tả §3: history giữ tối đa 10 lần rà/buổi. */
export const MAX_HISTORY_PER_SESSION = 10;

const table = new Map<string, SessionGapCheckRow[]>();

export function addSessionGapCheck(input: {
  sessionId: string;
  templateId: string;
  transcriptUntilMs: number;
  result: GapCheckResult;
}): SessionGapCheckRow {
  const row: SessionGapCheckRow = {
    id: crypto.randomUUID(),
    sessionId: input.sessionId,
    templateId: input.templateId,
    checkedAt: new Date().toISOString(),
    transcriptUntilMs: input.transcriptUntilMs,
    resultJson: JSON.stringify(input.result),
  };
  const rows = table.get(input.sessionId) ?? [];
  rows.push(row);
  table.set(input.sessionId, rows.slice(-MAX_HISTORY_PER_SESSION));
  return row;
}

export function listSessionGapChecks(sessionId: string): SessionGapCheckRow[] {
  return [...(table.get(sessionId) ?? [])];
}

function safeParseResult(row: SessionGapCheckRow): GapCheckResult | null {
  try {
    return JSON.parse(row.resultJson) as GapCheckResult;
  } catch {
    return null;
  }
}

/** Kết quả gần nhất (nguồn cho checklist "Cần bổ sung sau buổi" — đặc tả §3). */
export function getLatestSessionGapCheck(sessionId: string): SessionGapCheckRow | null {
  const rows = table.get(sessionId) ?? [];
  const latest = rows.at(-1);
  return latest ?? null;
}

export function getLatestGapCheckResult(sessionId: string): GapCheckResult | null {
  const latest = getLatestSessionGapCheck(sessionId);
  return latest ? safeParseResult(latest) : null;
}
