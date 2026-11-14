import { LibrarySplit } from "@/components/library/library-split";

/*
 * Thư viện và chi tiết buổi ghi dùng chung bố cục:
 * điện thoại hiện một trong hai, máy tính hiện cột thư viện 360px và chi tiết bên phải.
 */
export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return <LibrarySplit>{children}</LibrarySplit>;
}
