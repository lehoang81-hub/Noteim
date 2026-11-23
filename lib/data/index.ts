"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { mockSource, MOCK_NOW } from "./mock";
import { serverNow } from "./vn-time";
import { subscribeFlags } from "@/lib/debug/flags";
import { resetDb, subscribeDb } from "./mock/store";
import type { DataSource } from "./repository";
import { DataError } from "./errors";

/*
 * Nơi DUY NHẤT chọn bản cài đặt dữ liệu.
 * Giao diện import { data, useData, ... } từ "@/lib/data", không import lib/data/mock
 * hay fixtures (luật ESLint chặn). Khi có database: thêm lib/data/supabase,
 * chọn theo NEXT_PUBLIC_DATA_SOURCE ở đây.
 *
 * PR 02: chỉ bật sẵn nguồn chọn cho dataNow() — nguồn đọc/ghi remote là việc
 * của PR 03; DATA_SOURCE khác "mock" thì dataNow() trả giờ máy chủ (§1.3).
 */

export const DATA_SOURCE: "mock" | "remote" =
  process.env.NEXT_PUBLIC_DATA_SOURCE === "remote" ? "remote" : "mock";

export const data: DataSource = mockSource;

/**
 * "Bây giờ" theo nguồn dữ liệu.
 * - mock: cố định ngày để khớp dữ liệu mẫu và e2e (MOCK_NOW).
 * - remote: giờ máy chủ; ngày cắt theo múi giờ Asia/Ho_Chi_Minh qua
 *   vnDayKey() (lib/data/vn-time.ts) — đúng §1.3.
 */
export function dataNow(): Date {
  if (DATA_SOURCE === "remote") return serverNow();
  return MOCK_NOW;
}

/** Đặt lại dữ liệu mẫu về ban đầu (bảng thử nghiệm). */
export const resetData = resetDb;

let version = 0;
function subscribeVersion(cb: () => void) {
  const bump = () => {
    version++;
    cb();
  };
  // Dữ liệu đổi, hoặc cờ bảng thử nghiệm đổi (ví dụ bật "Hết hạn mức"): tải lại
  const offDb = subscribeDb(bump);
  const offFlags = subscribeFlags(bump);
  return () => {
    offDb();
    offFlags();
  };
}

/** Tăng mỗi khi dữ liệu thay đổi, để các màn hình tải lại. */
export function useDataVersion() {
  return useSyncExternalStore(subscribeVersion, () => version, () => 0);
}

export { DataError } from "./errors";
// Chỉ re-export kiểu từ types.ts (M5, sửa review PR #41 mục 2): types.ts dựng
// schema Zod lúc nạp module; re-export dạng type bị xóa khi biên dịch nên
// chunk khởi tạo không mang Zod. DataError là giá trị nên re-export riêng
// từ errors.ts (không phụ thuộc Zod).
export type * from "./types";
export type * from "./repository";

/* ---------- Hook đọc dữ liệu ---------- */

type State<T> = { key: string; data?: T; error?: DataError };

/**
 * Gọi một hàm đọc dữ liệu và theo dõi trạng thái.
 * - loading: đang tải lần đầu hoặc đang tải lại
 * - data giữ giá trị cũ trong lúc tải lại (không nháy khung chờ)
 * - Tự tải lại khi dữ liệu thay đổi ở nơi khác hoặc khi gọi reload()
 */
export function useData<T>(fetcher: () => Promise<T>, deps: unknown[]) {
  const dataVersion = useDataVersion();
  const [manual, setManual] = useState(0);
  const key = JSON.stringify(deps) + ":" + dataVersion + ":" + manual;
  const [state, setState] = useState<State<T>>({ key: "" });

  useEffect(() => {
    let alive = true;
    fetcher().then(
      (d) => alive && setState({ key, data: d }),
      (e: unknown) =>
        alive && setState((s) => ({ key, data: s.data, error: e instanceof DataError ? e : new DataError("server") })),
    );
    return () => {
      alive = false;
    };
    // fetcher thay đổi mỗi lần vẽ; key đã bao gồm deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = useCallback(() => setManual((n) => n + 1), []);
  const settled = state.key === key;
  return {
    data: state.data,
    error: settled ? state.error : undefined,
    loading: !settled,
    /** Lần tải đầu tiên chưa xong: hiện khung chờ */
    initialLoading: !settled && state.data === undefined,
    reload,
  };
}
