import { redirect } from "next/navigation";

/*
 * M0 chưa có màn hình ứng dụng; "/" chỉ đưa tới bảng mẫu kiểu dáng.
 * Màn hình thật sẽ thay thế trang này từ mốc M1.
 */
export default function HomePage() {
  redirect("/styleguide");
}
