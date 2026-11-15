"use client";

/*
 * Kho ảnh trong IndexedDB (PR #22, lỗi 3).
 * - Ảnh chụp giữ nguyên pixel ở IndexedDB, khóa theo id ảnh; localStorage
 *   (kho buổi ghi và kho dữ liệu mẫu) chỉ giữ id, nên vài trăm ảnh cũng
 *   không làm đầy bộ nhớ và mất buổi ghi âm thầm.
 * - Mọi hàm đều bắt lỗi và trả giá trị an toàn: IndexedDB không dùng được
 *   thì ảnh chỉ còn trong bộ nhớ của phiên, buổi ghi vẫn chạy bình thường.
 */

const DB_NAME = "noteim-photos-v1";
const STORE = "photos";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB không có"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Mở IndexedDB thất bại"));
  });
}

function runTx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = run(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Lệnh IndexedDB thất bại"));
        tx.oncomplete = () => db.close();
      }),
  );
}

/** Lưu ảnh (data URL) theo id. Trả false nếu lưu không được. */
export async function savePhoto(id: string, dataUrl: string): Promise<boolean> {
  try {
    await runTx("readwrite", (store) => store.put(dataUrl, id));
    return true;
  } catch {
    return false;
  }
}

/** Đọc ảnh theo id; không có hoặc lỗi thì trả null. */
export async function loadPhoto(id: string): Promise<string | null> {
  try {
    const value = await runTx<string | undefined>("readonly", (store) => store.get(id) as IDBRequest<string | undefined>);
    return value ?? null;
  } catch {
    return null;
  }
}

/** Đếm số ảnh đang lưu (bảng thử nghiệm và tự kiểm dùng). */
export async function countPhotos(): Promise<number> {
  try {
    return await runTx<number>("readonly", (store) => store.count());
  } catch {
    return 0;
  }
}
