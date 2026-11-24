"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { mockSource, MOCK_NOW } from "./mock";
import { remoteSource } from "./remote";
import { serverNow } from "./vn-time";
import { subscribeFlags } from "@/lib/debug/flags";
import { resetDb, subscribeDb } from "./mock/store";
import { bumpVersion, getVersion, subscribeVersionChanges } from "./changes";
import type { DataSource } from "./repository";
import { DataError } from "./errors";

/*
 * Nơi DUY NHẤT chọn bản cài đặt dữ liệu.
 * Giao diện import { data, useData, ... } từ "@/lib/data", không import lib/data/mock
 * hay fixtures (luật ESLint chặn).
 *
 * C1-03b: người ĐÃ đăng nhập dùng nguồn remote khi NEXT_PUBLIC_DATA_SOURCE=remote;
 * người ẩn danh luôn dùng mock trên máy, không đổi. Mỗi repository được bọc
 * một lớp chọn: lúc gọi hàm, nếu phiên đã đăng nhập và chế độ remote bật thì
 * gọi bản remote (API route — máy chủ kiểm quyền theo phiên), ngược lại gọi
 * bản giả trên máy. Phát hiện phiên bằng GET /api/auth/session (next-auth,
 * không cần SessionProvider quanh cả app); đăng nhập/đăng xuất đều điều
 * hướng lại trang nên phần mềm nhận được thay đổi lúc nạp module.
 */

export const DATA_SOURCE: "mock" | "remote" =
  process.env.NEXT_PUBLIC_DATA_SOURCE === "remote" ? "remote" : "mock";

/**
 * "Bây giờ" theo nguồn dữ liệu.
 * - mock: cố định ngày để khớp dữ liệu mẫu và e2e (MOCK_NOW).
 * - remote: giờ máy chủ; ngày cắt theo múi giờ Asia/Ho_Chi_Minh qua
 *   vnDayKey() (lib/data/vn-time.ts) — đúng §1.3.
 *
 * Chú ý: quyết định theo NGUỒN ĐANG DÙNG chứ không chỉ theo chế độ build.
 * Người ẨN DANH trên build remote vẫn dùng mock (buổi mẫu có ngày cố định)
 * nên phải trả MOCK_NOW — nếu trả giờ thật, dải ngày ở Tổng quan tính lệch
 * hết (m7-tong-quan: không còn nút "Hôm nay"/"Hôm qua").
 */
export function dataNow(): Date {
  if (DATA_SOURCE === "remote" && remoteActive) return serverNow();
  return MOCK_NOW;
}

/* ---------- Chọn nguồn theo phiên ---------- */

let remoteActive = false;

function pickRepo<M extends object, R extends object>(mockPart: M, remotePart: R): M {
  return new Proxy(mockPart, {
    get(_target, prop) {
      const impl = (remoteActive ? remotePart : mockPart) as M;
      return Reflect.get(impl, prop, impl);
    },
  });
}

/**
 * Đặt lại nguồn remote sau khi phiên đổi (đăng nhập/đăng xuất — module được
 * nạp lại nên chạy một lần lúc khởi tạo; hàm này để kiểm thử và gọi thủ công).
 */
export function setRemoteActive(active: boolean) {
  if (remoteActive !== active) {
    remoteActive = active;
    bumpVersion();
  }
}

if (DATA_SOURCE === "remote" && typeof window !== "undefined") {
  void fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((session: { user?: { id?: string } } | null) => {
      setRemoteActive(Boolean(session?.user?.id));
    })
    .catch(() => setRemoteActive(false));
}

export const data: DataSource = {
  sessions: pickRepo(mockSource.sessions, remoteSource.sessions),
  tasks: pickRepo(mockSource.tasks, remoteSource.tasks),
  chat: pickRepo(mockSource.chat, remoteSource.chat),
  share: pickRepo(mockSource.share, remoteSource.share),
  mail: pickRepo(mockSource.mail, remoteSource.mail),
  account: pickRepo(mockSource.account, remoteSource.account),
  workspaces: pickRepo(mockSource.workspaces, remoteSource.workspaces),
  dashboard: pickRepo(mockSource.dashboard, remoteSource.dashboard),
  folders: pickRepo(mockSource.folders, remoteSource.folders),
};

/** Đặt lại dữ liệu mẫu về ban đầu (bảng thử nghiệm). */
export const resetData = resetDb;

/**
 * Báo dữ liệu đã đổi ở nguồn remote (sau mỗi lần ghi thành công) để các màn
 * hình đang mở tải lại. Bản giả tự báo qua commit() của kho localStorage.
 */
export function notifyDataChanged() {
  bumpVersion();
}

function subscribeVersion(cb: () => void) {
  // Bộ đếm phiên bản đặt ở lib/data/changes.ts (một nguồn duy nhất cho mock
  // lẫn remote). Kho bản giả đổi (commit của localStorage) và cờ bảng thử
  // nghiệm đổi (ví dụ bật "Hết hạn mức") đều phải TĂNG PHIÊN BẢN trước khi
  // báo — nếu không React không thấy snapshot đổi và màn hình không tải lại.
  const offChanges = subscribeVersionChanges(cb);
  const offDb = subscribeDb(bumpVersion);
  const offFlags = subscribeFlags(bumpVersion);
  return () => {
    offChanges();
    offDb();
    offFlags();
  };
}

/** Tăng mỗi khi dữ liệu thay đổi, để các màn hình tải lại. */
export function useDataVersion() {
  return useSyncExternalStore(subscribeVersion, getVersion, () => 0);
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
