"use client";

/*
 * Kho IndexedDB riêng cho trang thử ghi âm (B0-02, issue #70, docs/10-B).
 * Tên kho "noteim-spike-ghi-am" KHÁC hẳn kho của app (kho ảnh
 * "noteim-photos-v1", kho mẫu trên localStorage "noteim-mock-db-v1") để
 * trang spike không đụng dữ liệu app.
 * Mỗi thao tác đều bắt lỗi và reject với câu nói rõ nguyên nhân: trang sẽ
 * hiện lỗi lên giao diện và nhật ký, không được im lặng (bài học AGENTS.md
 * về ghi bộ nhớ trình duyệt).
 */

export const SPIKE_DB_NAME = "noteim-spike-ghi-am";
const SPIKE_DB_VERSION = 1;

/** Một khúc ghi 10 giây, lưu ngay khi MediaRecorder phát xong khúc đó. */
export interface SpikeChunk {
  id: string;
  /** Số thứ tự khúc trong kho, tăng dần qua các phiên ghi. */
  index: number;
  /** Ngày lưu (Date.now khi ondataavailable), dùng để tính khoảng trống. */
  ts: number;
  mime: string;
  size: number;
  blob: Blob;
}

/** Một dòng khoảng hụt sau khi so thời lượng khúc với thời gian thực. */
export interface SpikeGap {
  ts: number;
  sec: number;
  kind: "lead" | "between" | "tail" | "total";
}

/** Kết quả phân tích một phiên ghi, giữ lại để nạp lại trang vẫn còn thấy. */
export interface SpikeSession {
  key: "hien-tai";
  startedAt: number;
  stoppedAt: number;
  mime: string;
  gapMode: "idle" | "none" | "chunk" | "total" | "unknown";
  gaps: SpikeGap[];
  wallSec: number;
  totalDurSec: number | null;
  /** Thời lượng từng khúc theo index của khúc (giây); null là không đo được. */
  chunkDurs: Record<string, number | null>;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Trình duyệt không có IndexedDB"));
      return;
    }
    const req = indexedDB.open(SPIKE_DB_NAME, SPIKE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("chunks")) {
        const store = db.createObjectStore("chunks", { keyPath: "id" });
        store.createIndex("index", "index", { unique: false });
      }
      if (!db.objectStoreNames.contains("phien")) {
        db.createObjectStore("phien", { keyPath: "key" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error("Mở kho ghi âm thử thất bại"));
    req.onblocked = () => reject(new Error("Kho ghi âm thử đang bị mở ở tab khác"));
  });
}

async function withValue<T>(
  name: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const req = run(tx.objectStore(name));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Lệnh kho ghi âm thử thất bại"));
    tx.onabort = () => reject(tx.error ?? new Error("Lệnh kho ghi âm thử bị hủy"));
    tx.oncomplete = () => db.close();
  });
}

/** Lệnh ghi không cần giá trị trả về, hoàn tất theo transaction. */
async function withWrite(
  name: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const req = run(tx.objectStore(name));
    req.onerror = () => reject(req.error ?? new Error("Lệnh kho ghi âm thử thất bại"));
    tx.onabort = () => reject(tx.error ?? new Error("Lệnh kho ghi âm thử bị hủy"));
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}

/** Lưu một khúc ngay khi vừa nhận được; gọi trong ondataavailable. */
export function saveChunk(chunk: SpikeChunk): Promise<void> {
  return withWrite("chunks", "readwrite", (store) => store.put(chunk));
}

/** Đọc mọi khúc, xếp theo index (thứ tự ghi). */
export async function loadChunks(): Promise<SpikeChunk[]> {
  const all = await withValue<SpikeChunk[]>("chunks", "readonly", (store) => store.getAll());
  return all.sort((a, b) => a.index - b.index);
}

export function clearChunks(): Promise<void> {
  return withWrite("chunks", "readwrite", (store) => store.clear());
}

export function saveSession(session: SpikeSession): Promise<void> {
  return withWrite("phien", "readwrite", (store) => store.put(session));
}

export async function loadSession(): Promise<SpikeSession | null> {
  const got = await withValue<SpikeSession | undefined>("phien", "readonly", (store) =>
    store.get("hien-tai"),
  );
  return got ?? null;
}

export function clearSession(): Promise<void> {
  return withWrite("phien", "readwrite", (store) => store.delete("hien-tai"));
}

/** Xóa cả khúc và phiên (nút "Xóa các khúc đã lưu"). */
export async function clearAll(): Promise<void> {
  await clearChunks();
  await clearSession();
}
