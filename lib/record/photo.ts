"use client";

/*
 * Ảnh chụp trong lúc ghi (docs/03-screens.md mục 3): thu nhỏ còn cạnh dài
 * tối đa 640px, chất lượng 0,7 rồi lưu dạng data URL vào kho buổi ghi.
 * Pixel nằm ở IndexedDB theo id ảnh (lib/record/photo-store.ts), nên kích
 * thước nhỏ giúp hiển thị nhanh và không làm đầy localStorage (PR #22, lỗi 3).
 */

const MAX_EDGE = 640;
const QUALITY = 0.7;

export async function fileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas không dùng được");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", QUALITY);
  } finally {
    bitmap.close();
  }
}
