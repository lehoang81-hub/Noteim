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

## 2026-11-14, Claude, review và merge M0-01

- PR #3 đã merge, issue #1 đóng. Agent không mở được PR vì token chỉ có quyền đọc PR; reviewer mở thay.
- Repo đã nối Vercel (dự án `noteim`, đội HLRace16St). Mỗi nhánh tự có link xem thử. Bản `main`: https://noteim-seven.vercel.app
- Reviewer sửa thêm: khôi phục README, thêm giá trị dự phòng cho `var(--font-*)`, xóa SVG mẫu.
- Môi trường kiểm tra của reviewer không tải được Google Fonts; build cục bộ dùng phông từ npm thay thế. Vercel build bình thường.
- Việc tiếp theo: M0-02, hoàn thiện `/styleguide` theo kết quả review.

## 2026-11-14, Claude, M0-02 hoàn thiện /styleguide

- Hoang giao Claude tự làm M0-02 thay agent.
- Thêm khối "Xem nhanh" (`app/styleguide/preview.tsx`): hàng buổi ghi, ý đang phát, khối AI, nút, nút ghi âm. Máy tính hiện cả sáng và tối cạnh nhau.
- Mục lục: chip dính đầu trang trên điện thoại, cột trái trên máy tính; mục đang xem được tô (`section-nav.tsx`).
- Một nguồn mã màu: `palette-data.ts` không còn mã màu. `use-token-colors.ts` đọc giá trị thật từ CSS lúc chạy (kể cả `color-mix`), `live.tsx` hiển thị mã, tỷ lệ tương phản, cỡ chữ, thời lượng.
- `styles/tokens.css`: khối màu sáng áp cho cả `:root` và `.light`, để ép một vùng về giao diện sáng. Thêm token `--on-dawn`.
- Nút đổi giao diện hiện giao diện sẽ chuyển sang; máy tính có thêm chữ.
- Đã kiểm: 390px và 1280px, sáng và tối, không tràn ngang; trang dài 5.498px ở 390px; khối "Xem nhanh" nằm trọn màn hình đầu; 12 cặp tương phản đều từ 4,5:1 ở cả hai giao diện; giảm chuyển động thì cuộn không mượt; viền lấy nét màu Điện.
- Lưu ý cho người sau: khối "Xem nhanh" không dùng tiện ích `dark:` vì có thể bị ép sáng hoặc tối độc lập với trang. Component chính thức ở M0-03 nên tránh `dark:` vì lý do tương tự; dùng token là đủ.

## 2026-11-14, Claude, M0-03 bộ component

- Hoang giao Claude tự làm M0-03.
- Thư viện mới: `@radix-ui/react-dialog`, `react-alert-dialog`, `react-switch`, `react-tabs` (nền của shadcn/ui), `motion`.
- `components/ui`: `Button`, `RecordButton`, `TagChip`, `FilterChip`, `SpeakerName`, `Sheet`, `ToastProvider` + `useToast`, `ConfirmDialog`, `Banner`, `EmptyState`, `SkeletonRow`, `SkeletonParagraph`, `TextField`, `SearchField`, `Switch`, `Tabs`.
- `components/session`: `SessionRow`, `SummaryBullet`, `UserNote`, `TaskRow`, `AiBlock`. `components/ribbon/ribbon-thumb.tsx`: dải giọng thu nhỏ bản tĩnh, M0-04 thay bằng canvas.
- `ToastProvider` bọc toàn ứng dụng trong `app/layout.tsx`. Chữ dùng chung (Đóng, Hoàn tác, Thử lại) ở `messages/*.json` mục `ui`.
- `/styleguide` có mục "Component", mọi biến thể bấm thử được. Khối "Xem nhanh" dựng lại bằng component.
- Thêm `app/icon.svg` (biểu tượng Hừng đông), hết lỗi 404 favicon.
- Đã kiểm: 390px và 1280px, sáng và tối, không tràn ngang, không lỗi console. Bảng trượt giữ tiêu điểm, đóng bằng Esc và kéo tay nắm. Hộp xác nhận, thông báo nhanh, công tắc, tab, nút ghi âm, đánh dấu việc đều chạy.
- Giảm chuyển động: bảng trượt và thông báo hiện bằng mờ dần; tắt kéo tay nắm (vẫn đóng bằng nút, nền mờ, Esc); khối AI hiện đủ chữ ngay.
- Lưu ý cho người sau: `useReducedMotion` trả giá trị khác nhau giữa máy chủ và trình duyệt. Đừng dùng nó để quyết định nội dung ở lần vẽ đầu, chỉ dùng cho chuyển động hoặc trong `useEffect` (xem `ai-block.tsx`), nếu không sẽ lỗi hydrate.

## 2026-11-14, Claude, M0-04 dải giọng, trình phát, ba khoảnh khắc

- Hoang giao Claude tự làm M0-04. Đây là PR cuối mốc M0, chờ Hoang duyệt trên điện thoại rồi mới merge.
- `components/ribbon/`: `draw.ts` (công cụ vẽ chung), `RibbonThumb` (canvas, giữ nguyên props cũ), `RibbonPlayback` (tua bằng chạm, kéo, bàn phím; điểm nóng; dải nhiệt; `dye` cho khoảnh khắc "Xử lý xong"), `RibbonLive` (rAF, dừng khi tab ẩn hoặc ra khỏi màn hình).
- `lib/player/mock-player.ts`: đồng hồ phát giả lập, interface play, pause, seek, skip, setRate, getState, subscribe. `usePlayerState` để đọc trong component.
- `components/session/floating-player.tsx`: thu gọn và mở rộng, tốc độ 1x, 1,25x, 1,5x, 2x.
- `lib/audio/use-mic-level.ts`: đọc âm lượng micro, không ghi, không lưu. Dùng lại ở M2.
- `lib/use-reduced-motion.ts`: `useReducedMotionSafe`, thay `useReducedMotion` của Motion ở mọi nơi. Lần vẽ đầu luôn là false giống máy chủ, nên không lỗi hydrate. **Từ giờ dùng hook này, không dùng `useReducedMotion` của Motion.**
- `/styleguide`: mục "Dải giọng" gồm ba dạng, thanh trượt âm lượng, nút micro thật, trình phát nổi (hai bản dùng chung một trình phát), ba khoảnh khắc có nút "Chạy thử".
- Hiệu năng: đo 180 khung hình ở 390px, mật độ 3x, CPU giả lập chậm gấp 4: trung vị 16,7ms, không khung nào quá 33ms. Bài học: quầng sáng dùng `blur`, nếu đổi độ mờ mỗi khung hình sẽ tụt khung; giờ chỉ đổi khi âm lượng chênh đáng kể, có CSS transition.
- Đã kiểm: 390px và 1280px, sáng và tối, không tràn ngang, không lỗi console; tua bằng kéo, chạm, mũi tên; phát, tốc độ; micro thật (trình duyệt giả lập thiết bị); giảm chuyển động không lỗi hydrate.
- Lưu ý kiểm thử tự động: trang bật cuộn mượt, `scrollIntoView` cần `behavior: "instant"` trước khi đo vị trí.
