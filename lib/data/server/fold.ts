/**
 * So khớp không phân biệt hoa thường và bỏ dấu tiếng Việt (M4-02) — dùng
 * chung cho tìm kiếm và Hỏi AI thư mục ở phía máy chủ.
 */
export function foldVi(s: string): string {
  return s
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}
