"use client";

/*
 * Giữ tạm file nhập (/import) giữa hai lần điều hướng: kéo thả file ở thư viện
 * rồi chuyển sang /import mà không gửi được File qua URL. File không được lưu
 * xuống đĩa hay tải lên đâu cả (mockup) — chỉ đọc thông tin.
 */

let held: File | null = null;

export function holdImportFile(file: File) {
  held = file;
}

export function takeImportFile(): File | null {
  const f = held;
  held = null;
  return f;
}
