# Nhật ký bàn giao

Mục mới nhất nằm dưới cùng. Mỗi PR thêm một mục.

## 2026-11-14, Claude, khởi tạo đặc tả

- Đã viết bộ đặc tả mockup: `README.md`, `AGENTS.md`, `docs/01` đến `docs/06`, `DECISIONS.md`.
- Repo chưa có code. Việc đầu tiên là issue M0-01.
- Điều người sau cần biết: đừng dựng màn hình thật trước khi M0 được merge.

## 2026-11-14, Claude, chốt màu và quyền merge

- Hoang đã chọn bảng màu A (Sen và Điện). Mã màu trong `02-design-system.md` là chính thức.
- Claude là người merge PR sau khi kiểm tra đạt. PR cuối mỗi mốc chờ Hoang xem link xem thử.

## 2026-11-14, coding agent, M0-01 khởi tạo dự án, token thiết kế và /styleguide

- Khởi tạo Next.js 16.4.6 (App Router, TypeScript strict), Tailwind CSS 4.3.3, pnpm 12.18.0; thêm script `pnpm typecheck`.
- `styles/tokens.css` đủ token màu (sáng/tối), nhãn ngữ nghĩa, màu người nói, dải Hừng đông, thang chữ (kèm cỡ máy tính), khoảng cách, bo góc, bóng, chuyển động theo `02-design-system.md`. Chế độ tối đổi bằng class `.dark` trên `<html>`, ánh xạ thành tiện ích Tailwind trong `app/globals.css` (`bg-bg`, `text-ink`, `rounded-control`, `text-display`, `shadow-float`...).
- Phông Bricolage Grotesque (600, 700) và Be Vietnam Pro (400–700) nạp bằng `next/font/google`, subset `vietnamese`. Chuỗi thử `Đặng Thị Quỳnh Ngữ...` hiện đúng dấu ở mọi cấp, cả hai phông — không cần phương án dự phòng Be Vietnam Pro 700 cho tiêu đề.
- Trang `/styleguide` hiển thị toàn bộ token kèm tên, mã và tỷ lệ tương phản tính tại runtime (`lib/contrast.ts`), 18 cặp chữ và nền đều từ 4,5:1 trở lên ở cả hai giao diện. Không tràn ngang ở 390px.
- Nút đổi sáng/tối (`components/ui/theme-toggle.tsx`): một nút, lưu `localStorage` khoá `noteim-theme`, còn nguyên khi tải lại; chưa chọn thì theo hệ điều hành. Trạng thái đọc qua `useSyncExternalStore`.
- next-intl 4 không định tuyến theo locale, mặc định `vi`; toàn bộ chuỗi hiển thị nằm trong `messages/vi.json` và `messages/en.json`.
- ESLint `no-restricted-imports` chặn `fixtures/` và `lib/data/mock` từ `app/` và `components/` — đã thử chặn thật với cả import alias lẫn relative.
- Còn dở: chưa có link xem thử Vercel vì repo chưa được nối với tài khoản Vercel của chủ dự án; cần nối rồi bật preview cho mỗi PR.
- Điều người sau cần biết: (1) biến phông của `next/font` phải gắn trên `<html>` chứ không phải `<body>`, nếu không token `--font-display`/`--font-body` khai báo ở `:root` sẽ vỡ và rơi về phông hệ thống; (2) khi đổi mã màu phải sửa cả `styles/tokens.css` lẫn `app/styleguide/palette-data.ts`; (3) các thư mục trống của cấu trúc (`components/ribbon`, `components/session`, `components/shell`, `lib/data/mock`, `lib/player`, `lib/debug`, `fixtures`) đang giữ bằng `.gitkeep`, đừng xoá; (4) gầm `@theme inline` trong `globals.css` đặt tên key khác tên biến token (ví dụ `--color-bg` trỏ tới `--bg`) để tránh tham chiếu vòng.
