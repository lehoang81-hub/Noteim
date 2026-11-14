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

## 2026-11-14, Claude, M1 thư viện và đọc buổi ghi

- Hoang duyệt M0 và giao Claude làm tiếp M1. Bốn issue #12 đến #15, một PR chung, chờ Hoang duyệt vì là cuối mốc.
- **Lớp dữ liệu** `lib/data/`: `types.ts` (Zod), `repository.ts`, `mock/` (kho trong bộ nhớ, lưu localStorage khóa `noteim-mock-db-v1`, trễ 300 đến 800ms), `index.ts` (nơi duy nhất chọn nguồn, hook `useData`, `dataNow`, `resetData`). Màn hình tự tải lại khi dữ liệu hoặc cờ thử nghiệm đổi.
- **Fixture** `fixtures/`: 8 buổi ghi tiếng Việt (2 đầy đủ: gặp khách BĐS, họp điều hành; còn lại đủ các trạng thái: đang xử lý, lỗi, chưa tải lên, chỉ còn tóm tắt), 6 mẫu theo nghề, 10 liên hệ, 12 thuật ngữ. `node scripts/gen-peaks.mjs` sinh lại dải giọng và nhãn nổi bật.
- **Bảng thử nghiệm** `?debug=1`: mất mạng, tải chậm 3 giây, lỗi khi tải, hết hạn mức, thư viện rỗng, đổi nghề, đổi gói, đặt lại dữ liệu mẫu. `?debug=0` để tắt.
- **Khung ứng dụng** `components/shell/`: thanh dưới (Thư viện, nút ghi âm, Việc) trên điện thoại, cột trái 88px trên máy tính, dải báo mất mạng. `/record`, `/tasks`, `/search`, `/settings` đang là trang giữ chỗ.
- **Thư viện** `components/library/`: lời chào, số liệu tuần, dải hạn mức, chip lọc (tất cả, tuần này, có việc treo, theo mẫu), nhóm theo ngày, đủ trạng thái hàng; máy tính chia hai cột, hàng đang mở được tô.
- **Chi tiết buổi ghi** `components/session/detail/`: sửa tên tại chỗ, người nói, dải báo người nói chưa đặt tên, bản gốc sắp xóa, chỉ còn tóm tắt; tab qua `?tab=`; Tóm tắt theo mẫu của nghề, ghi chú tay, biểu đồ số liệu nhỏ; Việc cần làm với hoàn tác; trình phát nổi; chạm ý để tua và ý đang phát được tô.
- Đã kiểm: 390px và 1280px, sáng và tối, không tràn ngang, không lỗi console. Chạm ý "Ngân sách tối đa 4,2 tỷ" thì trình phát nhảy tới 07:30 và ý được tô. Đánh dấu việc xong rồi tải lại vẫn còn. Mọi trạng thái trong bảng thử nghiệm hiện đúng. Mất mạng thì ghi lỗi có thông báo và trả lại trạng thái cũ.
- Lưu ý cho người sau: `next.config.ts` đã tắt `cacheComponents` (xem DECISIONS). Ngày "bây giờ" của mockup lấy từ `dataNow()`, đừng dùng `new Date()` để nhóm hay so hạn.

## 2026-11-14, Claude, bàn giao M2 cho agent

- M1 đã merge (PR #16, Hoang duyệt). Mở 4 issue M2: #17, #18, #19, #20.
- `AGENTS.md` có thêm mục "Bài học đã rút ra": `useData`, `dataNow`, `useReducedMotionSafe`, không `dark:`, màu canvas, hiệu năng, bảng thử nghiệm, chữ hai ngôn ngữ.
- `docs/05-workflow.md` có thêm mục "Giao cả một mốc": một nhánh, commit theo issue, một PR cuối mốc.
- Việc tiếp theo: agent làm M2 trên nhánh `m2/ghi-am`, báo cáo để Claude kiểm thử.

## 2026-11-14, coding agent, M2 ghi âm: màn hình ghi, xử lý và khôi phục

- Bốn issue #17, #18, #19, #20 trên một nhánh `m2/ghi-am`, một PR, commit theo từng issue.
- **Kho buổi ghi** `lib/record/recording-store.ts`: một kho ngoài React (useSyncExternalStore), trạng thái idle/recording/paused, đồng hồ không tính lúc tạm dừng, ghi chú, điểm nóng, ảnh, âm lượng lấy mẫu 250ms; lưu localStorage mỗi 5 giây và mỗi khi thay đổi. Tải lại trang giữa lúc ghi: chuyển sang tạm dừng với thời lượng đã lưu.
- **Màn hình /record**: nền chàm đêm luôn tối (class `.dark`), không có khung ứng dụng (AppShell ẩn theo pathname); lần đầu xin quyền micro (ghi nhớ để bỏ qua), bảng hỏi đồng ý tự đóng 3 giây (đóng là đồng ý) có ô phát thông báo; kết thúc bằng nhấn giữ 0,8 giây có vòng tiến độ (giữ Enter hoặc Space tương đương); Wake Lock khi ghi; khoảnh khắc Bắt đầu ghi nở nút thành dải giọng, Kết thúc ghi gấp thành thẻ buổi ghi.
- **Trong lúc ghi** (M2-02): ô ghi chú (mỗi lần xuống dòng một ghi chú gắn mốc), điểm nóng chạm/nhấn giữ chọn nhãn (gợn sóng + rung 10ms), ảnh chụp thu nhỏ 1280px lưu data URL, nút thu nhỏ + thanh sen "● 12:47 Đang ghi" trên mọi trang, gợi ý im lặng sau 60 giây.
- **Kết thúc và xử lý** (M2-03): `createFromRecording` nhận đủ draft (gồm levels, photos, consent); bản giả sinh tóm tắt theo mẫu của nghề từ `fixtures/generated/<nghề>.json` khi xử lý xong, peaks 600/peaks_thumb 40 gom từ âm lượng đã ghi, ghi chú gắn vào ý gần nhất, 1-2 việc có một "Chưa giao"; xử lý chạy độc lập với người nghe — rời màn hình vẫn chạy, tải lại trang chạy tiếp từ bước đang dở; màn hình `/s/[id]/processing` nhuộm dải giọng khi xong; thư viện hiện thông báo "Đã tóm tắt xong" có nút Xem; dải báo buổi dang dở với Khôi phục/Bỏ.
- **Trạng thái** (M2-04): mất mạng (ghi vẫn chạy, kết thúc thành unsynced, có mạng tự xử lý kèm thông báo), hạn mức phiên (cảnh báo hổ phách còn 5 phút, tự kết thúc khi hết; Pro là 4 giờ), hết hạn mức tháng (bảng giải thích + "Xem gói Pro" tới /upgrade — trang giữ chỗ mới), micro bị từ chối (trang hướng dẫn iPhone/Android + "Dùng thử với âm thanh mẫu"), micro bị chiếm (sự kiện ended của track hoặc cờ ép sau 10 giây, tự tạm dừng).
- Cờ thử nghiệm mới: "Tua nhanh đồng hồ ghi x30", "Micro bị từ chối", "Micro bị chiếm sau 10 giây".
- Điều người sau cần biết: (1) `useMicLevel` giờ nhận `{ onEnded }` để nghe track bị chiếm, bản gọi cũ không bị ảnh hưởng; (2) `data.sessions.update` chấp nhận thêm `participant_contact_ids`; (3) `createFromRecording` không ném lỗi khi mất mạng — buổi ghi thành `unsynced`, ProcessingWatcher trong AppShell lo chuyển sang xử lý khi có mạng; (4) `/s/*/processing` và `/record` đều không có khung ứng dụng, nếu thêm màn hình dạng đầy màn hình thì cập nhật điều kiện trong `app-shell.tsx`; (5) dữ liệu nội dung sinh theo nghề nằm ở `fixtures/generated/`, thêm nghề mới phải thêm file cùng tên.
- Đã kiểm: 390px và 1280px, sáng và tối, không tràn ngang, không lỗi console; từng trạng thái ép được bằng ?debug=1; giữ dưới 0,8 giây không kết thúc; tải lại giữa lúc ghi không mất ghi chú, điểm nóng, ảnh; đổi nghề trong bảng thử nghiệm ra đúng mẫu của nghề đó.
