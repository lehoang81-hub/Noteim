/* ---------- Lỗi ---------- */

// Tách khỏi types.ts (M5, sửa review PR #41 mục 2): types.ts dựng schema Zod
// lúc nạp module, còn DataError được nhiều nơi import dạng giá trị. Tách ra
// để chunk khởi tạo không phải kéo theo Zod.

export type DataErrorCode = "offline" | "not_found" | "quota_exceeded" | "server";

export class DataError extends Error {
  constructor(public code: DataErrorCode, message?: string) {
    super(message ?? code);
    this.name = "DataError";
  }
}
