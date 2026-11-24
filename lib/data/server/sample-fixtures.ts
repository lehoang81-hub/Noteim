/**
 * Đọc buổi mẫu từ fixture tĩnh phía máy chủ (C1-03b): dùng khi người dùng
 * mở trực tiếp một buổi mẫu chưa nhập vào tài khoản (`s-sample-*`) và khi
 * nhập buổi mẫu vào tài khoản mới. Nội dung demo tĩnh — không phải dữ liệu
 * người dùng; không ghi DB ở file này.
 */
import { SessionFixture } from "../types";

import type { SessionFixture as SessionFixtureShape } from "../types";

type LoadedSample = SessionFixtureShape & { id: string };

type SampleLoader = () => Promise<{ default: unknown }>;

const SAMPLES: Record<string, SampleLoader> = {
  "s-sample-realestate_sales": () => import("@/fixtures/samples/realestate_sales.json"),
  "s-sample-business_owner": () => import("@/fixtures/samples/business_owner.json"),
  "s-sample-doctor": () => import("@/fixtures/samples/doctor.json"),
  "s-sample-lawyer": () => import("@/fixtures/samples/lawyer.json"),
  "s-sample-architect": () => import("@/fixtures/samples/architect.json"),
  "s-sample-notary": () => import("@/fixtures/samples/notary.json"),
};

export function listSampleIds(): string[] {
  return Object.keys(SAMPLES);
}

const cache = new Map<string, LoadedSample | null>();

/** Đọc + kiểm cấu trúc một buổi mẫu; sai cấu trúc hoặc không có → null. */
export async function loadSampleFixture(id: string): Promise<LoadedSample | null> {
  const cached = cache.get(id);
  if (cached !== undefined) return cached;
  const loader = SAMPLES[id];
  if (!loader) {
    cache.set(id, null);
    return null;
  }
  try {
    const mod = await loader();
    const parsed = SessionFixture.safeParse(mod.default);
    if (!parsed.success) {
      // Không log nội dung fixture; chỉ log danh sách lỗi cấu trúc
      console.error("[sample-fixture] cấu trúc không đúng:", id);
      cache.set(id, null);
      return null;
    }
    const value: LoadedSample = { ...parsed.data, id };
    cache.set(id, value);
    return value;
  } catch {
    cache.set(id, null);
    return null;
  }
}
