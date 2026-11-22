/**
 * Thời gian theo múi giờ Việt Nam — PR 02 (đặc tả C1 §1.3).
 *
 * Bản remote trả giờ máy chủ (một Date là một mốc thời gian tuyệt đối, không
 * gắn múi giờ); múi giờ chỉ có ý nghĩa khi ĐỊNH DẠNG ngày — mọi chỗ cắt ngày
 * ("hôm nay", nhóm theo ngày trong dashboard) phải qua `vnDayKey()` ở đây để
 * ra đúng ngày Việt Nam, không theo múi giờ của máy người xem.
 *
 * Bản mock không dùng file này: `MOCK_NOW` cố định 14/11/2026 để dữ liệu mẫu
 * và e2e ổn định (điểm này chỉ đụng lib/data, không đụng màn hình — đúng §1.3).
 */

/** Múi giờ chính thức của app (đặc tả C1 §1.3). */
export const VN_TIMEZONE = "Asia/Ho_Chi_Minh";

/** Giờ máy chủ hiện tại — dùng cho bản remote (`dataNow()`). */
export function serverNow(): Date {
  return new Date();
}

/** Khóa ngày "YYYY-MM-DD" của một mốc thời gian, tính theo múi giờ Việt Nam. */
export function vnDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
