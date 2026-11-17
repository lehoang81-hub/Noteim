"use client";

/*
 * Tải CSV cho trang quản trị nhóm (M7-03). UTF-8 có BOM để Excel mở chữ
 * tiếng Việt không lỗi mã hóa (tiêu chí #49); phân tách bằng dấu phẩy,
 * giá trị có dấu phẩy, dấu ngoặc kép hoặc xuống dòng được bọc ngoặc kép.
 */
export function downloadCsv(fileName: string, headers: string[], rows: Array<Array<string | number>>) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = "\uFEFF" + [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
