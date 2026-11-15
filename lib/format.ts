/*
 * Định dạng ngày giờ, thời lượng. Không phụ thuộc giờ máy: luôn tính theo
 * múi giờ Việt Nam để máy chủ và trình duyệt ra cùng kết quả.
 * Ngôn ngữ hiển thị do người gọi truyền vào ("vi" | "en") — M5-02: ngày, số,
 * dung lượng hiển thị theo ngôn ngữ giao diện.
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

/** "14/11" (vi) hoặc "Nov 14" (en) */
export function shortDate(date: Date | string, locale = "vi"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (locale === "en") {
    return new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" }).format(d);
  }
  const [, m, day] = parts(d).split("-");
  return `${day}/${m}`;
}

/** "Thứ Tư, 12/11" (vi) hoặc "Sat, Nov 14" (en) */
export function weekdayDate(date: Date | string, locale = "vi"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (locale === "en") {
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d);
    return `${wd}, ${shortDate(d, "en")}`;
  }
  const wd = new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, weekday: "long" }).format(d);
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)}, ${shortDate(d, "vi")}`;
}

/** Định dạng số theo ngôn ngữ: 7,6 (vi) / 7.6 (en) */
export function decimal(value: number, locale = "vi", maxFrac = 1): string {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "vi-VN", { maximumFractionDigits: maxFrac }).format(value);
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
