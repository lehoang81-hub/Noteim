# Luật làm việc cho coding agent

Bạn đang xây **mockup tương tác** của Noteim. Mục tiêu của giai đoạn này là để chủ sản phẩm cầm điện thoại bấm thử toàn bộ luồng và duyệt giao diện, trước khi tốn công nối database và AI.

## Trước khi viết dòng code nào

1. Đọc issue được giao. Chỉ làm đúng phạm vi issue đó.
2. Đọc `docs/02-design-system.md` và phần màn hình liên quan trong `docs/03-screens.md`.
3. Đọc 20 dòng cuối của `docs/LOG.md` để biết phiên trước dừng ở đâu.

## Luật cứng

- **Không gọi API thật.** Không Supabase, không Gemini, không gửi email, không thanh toán. Mọi dữ liệu đi qua lớp `lib/data` mô tả trong `docs/04-data-contract.md`.
- **Component không được import fixture trực tiếp.** Chỉ gọi qua repository. Đây là điều kiện để sau này đổi sang database mà không sửa giao diện.
- **Không tự chọn màu, cỡ chữ, bo góc, thời lượng chuyển động.** Chỉ dùng token trong design system. Thiếu token thì hỏi, không tự thêm.
- **Mobile trước.** Thiết kế và kiểm tra ở bề ngang 390px trước, rồi mới tới 1280px.
- **Tiếng Việt có dấu là ngôn ngữ chính.** Mọi chuỗi hiển thị nằm trong file ngôn ngữ, không viết cứng trong component.
- **Mỗi màn hình phải có đủ trạng thái**: đang tải, rỗng, lỗi, và trạng thái bình thường. Thiếu một trạng thái là chưa xong.
- **Không thêm thư viện** ngoài danh sách ở `docs/04-data-contract.md` mục "Công nghệ" khi chưa được duyệt trong issue.
- **Không commit thẳng vào `main`.** Mỗi issue một nhánh, một PR.
- **Không xóa hay viết lại tài liệu sẵn có** (`README.md`, `docs/`) ngoài phạm vi issue. Được thêm mục mới, không được thay nội dung cũ.
- **Không commit ảnh chụp vào repo.** Link xem thử của Vercel thay cho ảnh.

## Bài học đã rút ra (đọc kỹ, đều là lỗi đã gặp)

- **Dữ liệu:** màn hình đọc qua `useData(() => data.xxx(), [deps])` từ `@/lib/data`. Ghi qua `data.xxx` rồi để màn hình tự tải lại (lớp dữ liệu phát sự kiện khi đổi). Ngày "bây giờ" lấy từ `dataNow()`, không dùng `new Date()` để nhóm ngày hay so hạn.
- **Giảm chuyển động:** dùng `useReducedMotionSafe()` từ `@/lib/use-reduced-motion`. Không dùng `useReducedMotion` của Motion, nó gây lỗi hydrate (React #418).
- **Sáng tối:** không dùng tiện ích `dark:` trong `components/`. Mọi khác biệt nằm trong token. Muốn ép một vùng luôn tối (ví dụ màn hình ghi âm), thêm class `dark` cho vùng đó.
- **Canvas:** đọc màu bằng `tokenColor(el, "--ten-token")` trong `components/ribbon/draw.ts`, đọc một lần mỗi khi đổi giao diện, không đọc trong từng khung hình.
- **Hiệu năng:** không đổi `opacity` hay `transform` của phần tử có `blur` trong từng khung hình. Đo bằng Chrome giả lập CPU chậm gấp 4 trước khi báo xong.
- **Bảng thử nghiệm:** mỗi trạng thái mới (lỗi, rỗng, giới hạn) phải ép được bằng `?debug=1`. Thêm cờ vào `lib/debug/flags.ts` và nút vào `components/shell/debug-panel.tsx`.
- **Kiểm thử tự động:** trang bật cuộn mượt; trước khi đo vị trí, cuộn bằng `behavior: "instant"`.
- **Chữ:** mọi chuỗi hiển thị nằm trong `messages/vi.json` và `messages/en.json`, hai file phải có cùng khóa.

## Khi không chắc

Dừng lại và hỏi bằng một comment trong issue, gắn nhãn `can-hoi`. Nêu rõ: bạn đang phân vân giữa những phương án nào và bạn nghiêng về phương án nào. Đừng đoán rồi làm tiếp phần phụ thuộc vào câu trả lời.

## Khi xong

Làm theo danh sách kiểm trong `docs/05-workflow.md` mục "PR đạt chuẩn". Tóm tắt: PR có link xem thử Vercel, danh sách trạng thái đã kiểm, và một mục mới trong `docs/LOG.md`. Không commit ảnh chụp vào repo.

## Quyền đề xuất

Bạn được khuyến khích đề xuất cải tiến tương tác nhỏ, phím tắt, tối ưu hiệu năng. Ghi đề xuất vào mục "Đề xuất" cuối PR. Đừng tự làm nếu nó nằm ngoài issue.
