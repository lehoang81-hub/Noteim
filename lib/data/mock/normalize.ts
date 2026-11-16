/*
 * Nhãn người nói chưa đặt tên (M5, sửa review PR #41 mục 5).
 * Dữ liệu cũ lưu nhãn hệ thống dạng chuỗi tiếng Việt ("Bạn", "Người nói 3")
 * vào display_name, khiến giao diện English vẫn hiện tiếng Việt. Quy ước mới:
 * người nói chưa đặt tên có display_name = null; nhãn hiển thị sinh lúc vẽ
 * theo ngôn ngữ giao diện (speakerLabel trong lib/data/localize.ts).
 * File này thuần logic chuỗi, không phụ thuộc Zod, để cả store.ts (chunk
 * khởi tạo) và seed-data.ts (chunk động) cùng dùng được.
 */

/** Nhận diện chuỗi là nhãn hệ thống của người nói chưa đặt tên. */
function isSystemSpeakerLabel(name: string): boolean {
  // Dữ liệu fixture luôn tiếng Việt; kho localStorage của người dùng cũ cũng vậy
  return name === "Bạn" || /^Người nói \d+$/.test(name);
}

/** Quy nhãn hệ thống về chưa đặt tên (display_name = null), tại chỗ. */
export function normalizeSpeakerNames(speakers: Array<{ display_name: string | null }> | undefined | null) {
  if (!speakers) return;
  for (const sp of speakers) {
    if (sp.display_name && isSystemSpeakerLabel(sp.display_name)) sp.display_name = null;
  }
}
