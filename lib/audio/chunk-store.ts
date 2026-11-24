"use client";

/*
 * Lưu từng đoạn băng ghi vào IndexedDB (C1-04 yêu cầu 2a) — mất mạng hoặc
 * đóng tab giữa chừng không mất băng: MediaRecorder đẩy mỗi đoạn (timeslice
 * 5 giây) vào đây ngay lúc nhận, kết thúc ghép lại thành một Blob.
 *
 * Hai nhóm khóa:
 * - "live"      : buổi ghi đang diễn ra (chưa có id buổi).
 * - "session:{id}": băng đã có id buổi, chờ tải lên R2 hoặc đang tải lại sau
 *   khi mất mạng — xóa đi chỉ khi POST /api/audio/complete thành công.
 *
 * Mỗi entry nhớ mime để presign/khóa đúng đuôi khi tải lên.
 */

const DB_NAME = "noteim-audio";
const STORE = "chunks";
const LIVE_KEY = "live";
const SESSION_PREFIX = "session:";

export type AudioEntry = { mime: string; chunks: Blob[]; updatedAt: number };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB mở không được"));
  });
  return dbPromise;
}

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = run(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB ghi không được"));
      }),
  );
}

export function sessionKey(sessionId: string): string {
  return `${SESSION_PREFIX}${sessionId}`;
}

export async function appendLiveChunk(chunk: Blob, mime: string): Promise<void> {
  const existing = (await withStore<AudioEntry | undefined>("readonly", (s) => s.get(LIVE_KEY))) ?? {
    mime,
    chunks: [],
    updatedAt: 0,
  };
  existing.mime = existing.mime || mime;
  existing.chunks = [...existing.chunks, chunk];
  existing.updatedAt = Date.now();
  await withStore("readwrite", (s) => s.put(existing, LIVE_KEY));
}

export async function readEntry(key: string): Promise<AudioEntry | null> {
  return ((await withStore<AudioEntry | undefined>("readonly", (s) => s.get(key))) as AudioEntry | undefined) ?? null;
}

/** Chép buổi ghi đang diễn ra sang khóa theo id buổi (sau khi tạo buổi xong)
 * và dọn khóa live — băng nằm lại IndexedDB cho tới khi tải lên thành công. */
export async function moveLiveTo(sessionId: string): Promise<void> {
  const live = await readEntry(LIVE_KEY);
  if (!live) return;
  await withStore("readwrite", (s) => s.put(live, sessionKey(sessionId)));
  await withStore("readwrite", (s) => s.delete(LIVE_KEY));
}

export async function removeEntry(key: string): Promise<void> {
  await withStore("readwrite", (s) => s.delete(key));
}

export function clearLive(): Promise<void> {
  return removeEntry(LIVE_KEY);
}

/** Danh sách khóa băng còn chờ tải lên (retry sau khi mở lại app). */
export async function listPendingKeys(): Promise<string[]> {
  const keys = (await withStore<IDBValidKey[]>("readonly", (s) => s.getAllKeys())) as IDBValidKey[];
  return keys.filter((k): k is string => typeof k === "string" && k.startsWith(SESSION_PREFIX));
}

export async function blobFromEntry(entry: AudioEntry): Promise<Blob> {
  return new Blob(entry.chunks, { type: entry.mime });
}
