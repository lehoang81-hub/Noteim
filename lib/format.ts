/*
 * Định dạng ngày giờ, thời lượng theo kiểu Việt Nam. Không phụ thuộc giờ máy:
 * luôn tính theo múi giờ Việt Nam để máy chủ và trình duyệt ra cùng kết quả.
 */

const TZ = "Asia/Ho_Chi_Minh";

function parts(date: Date) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(date); // 2026-11-14
}

/** Số ngày chênh theo lịch (không theo giờ). */
export function dayDiff(a: Date, b: Date): number {
  const da = new Date(parts(a) + "T00:00:00Z").getTime();
  const db = new Date(parts(b) + "T00:00:00Z").getTime();
  return Math.round((db - da) / 86400_000);
}

/** "12/11" */
export function shortDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const [, m, day] = parts(d).split("-");
  return `${day}/${m}`;
}

/** "Thứ Tư, 12/11" */
export function weekdayDate(date: Date | string, locale = "vi-VN"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const wd = new Intl.DateTimeFormat(locale, { timeZone: TZ, weekday: "long" }).format(d);
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)}, ${shortDate(d)}`;
}

/** Giờ phút và giây: { h, m } để ghép vào chuỗi dịch. */
export function durationParts(sec: number) {
  const totalMin = Math.max(1, Math.round(sec / 60));
  return { h: Math.floor(totalMin / 60), m: totalMin % 60, totalMin };
}

/** Ngày dạng "2026-11-13" sang Date ở cuối ngày giờ Việt Nam. */
export function endOfDay(isoDate: string): Date {
  return new Date(`${isoDate}T23:59:59+07:00`);
}
