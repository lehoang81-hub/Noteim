// GC-02 (b4/gc-02-api) — Rate limit lượt rà miễn phí (đặc tả v1.1 §3).
// Free tối đa GAP_CHECK_FREE_DAILY lượt/ngày (mặc định 10, đã chốt duyệt), Pro không giới hạn.
// Đếm trong bộ nhớ máy chủ, chia theo ngày UTC và mã khách (header x-noteim-client).
// Khi có đăng nhập thật thì thay mã khách bằng user id.

const DEFAULT_FREE_DAILY = 10;

export type GapCheckPlan = "free" | "pro";

export interface QuotaState {
  ok: boolean;
  limit: number;
  /** Số lượt còn lại trong ngày; null nghĩa là không giới hạn (Pro). */
  remaining: number | null;
}

function getDayKey(now = new Date()): string {
  // Ngày chia theo UTC: đủ nhất cho mockup, thống nhất giữa các instance.
  return now.toISOString().slice(0, 10);
}

export function getFreeDailyLimit(): number {
  const raw = Number.parseInt(process.env.GAP_CHECK_FREE_DAILY ?? "", 10);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_FREE_DAILY;
}

const counters = new Map<string, number>();

export function consumeQuota(clientId: string, plan: GapCheckPlan, now = new Date()): QuotaState {
  if (plan === "pro") {
    return { ok: true, limit: Number.POSITIVE_INFINITY, remaining: null };
  }
  const day = getDayKey(now);
  // Dọn đếm của ngày cũ để Map không phình vô hạn.
  for (const key of counters.keys()) {
    if (!key.startsWith(day)) counters.delete(key);
  }
  const key = `${day}|${clientId}`;
  const used = (counters.get(key) ?? 0) + 1;
  counters.set(key, used);
  const limit = getFreeDailyLimit();
  if (used > limit) {
    counters.set(key, limit);
    return { ok: false, limit, remaining: 0 };
  }
  return { ok: true, limit, remaining: limit - used };
}
