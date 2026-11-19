// GC-02 (b4/gc-02-api) — Kiểu dữ liệu Gap Check theo đặc tả v1.1 §2–§3.
// Đặc tả: docs/gap-check-spec-v1.1.md

export type SlotConfidence = "high" | "medium" | "low";

/** Một ô dữ liệu sau khi rà: filled true bắt buộc kèm evidence trích nguyên văn. */
export interface SlotStatus {
  key: string;
  filled: boolean;
  confidence: SlotConfidence;
  evidence: string;
}

/** Ô còn thiếu quan trọng nhất, kèm câu hỏi lái hội thoại (tối đa 3 mục). */
export interface MissingPriority {
  key: string;
  why_missing: string;
  question: string;
}

/** Đầu ra chuẩn của một lần rà (đặc tả §2 — đã parse + validate). */
export interface GapCheckResult {
  ready_to_close: boolean;
  slots_status: SlotStatus[];
  missing_priorities: MissingPriority[];
  one_line_bridge: string;
}

/**
 * Một dòng của "bảng" SessionGapCheck (đặc tả §3). Ở mockup bảng nằm trong bộ nhớ
 * máy chủ (lib/gap-check/store.ts); khi nối database thật sẽ giữ đúng các cột này
 * (id, sessionId, templateId, checkedAt, transcriptUntilMs, resultJson — String chứa JSON).
 */
export interface SessionGapCheckRow {
  id: string;
  sessionId: string;
  templateId: string;
  checkedAt: string;
  transcriptUntilMs: number;
  resultJson: string;
}
