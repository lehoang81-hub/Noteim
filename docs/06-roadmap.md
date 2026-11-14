# 06. Lộ trình mockup

Sáu mốc. Mỗi mốc kết thúc bằng một lần Hoang duyệt trên điện thoại. Không bắt đầu mốc sau khi mốc trước chưa merge.

## M0. Nền móng và trang trưng bày

Mục tiêu: chốt màu, chữ, chuyển động trước khi dựng bất kỳ màn hình nào. Đây là mốc duyệt thẩm mỹ quan trọng nhất.

| Issue | Việc | Trạng thái |
| --- | --- | --- |
| M0-01 | Khởi tạo dự án, lint, typecheck, luật chặn import, Vercel. `styles/tokens.css` đủ token sáng và tối. Trang `/styleguide` bản đầu. | Xong (#1, PR #3) |
| M0-02 | Hoàn thiện `/styleguide` theo kết quả review: khối "Xem nhanh", điều hướng mục, bố cục máy tính, một nguồn mã màu. | Xong (#5, Claude làm) |
| M0-03 | Toàn bộ component trong bảng "Component" của design system, hiện trên `/styleguide` với đủ trạng thái. | |
| M0-04 | Dải giọng ba dạng (sống, phát lại, thu nhỏ) và ba khoảnh khắc đặc trưng, có nút bấm chạy thử trên `/styleguide`. | |

Nghiệm thu:

- [ ] `/styleguide` mở được trên điện thoại, đổi sáng tối bằng một nút
- [ ] Chuỗi thử tiếng Việt hiển thị đúng dấu ở cả hai phông
- [ ] Dải giọng sống chạy mượt (không giật) trên điện thoại tầm trung
- [ ] Bật "giảm chuyển động" thì ba khoảnh khắc đổi thành mờ dần

## M1. Thư viện và đọc buổi ghi

| Issue | Việc |
| --- | --- |
| M1-01 | Lớp dữ liệu: `types.ts`, `repository.ts`, bản giả, bảng thử nghiệm `?debug=1`, hai fixture đầy đủ. |
| M1-02 | Khung ứng dụng: thanh điều hướng, trình phát nổi, dải báo, bố cục ba cột trên máy tính. |
| M1-03 | Thư viện `/` với mọi trạng thái trong `03-screens.md` mục 1. |
| M1-04 | Chi tiết buổi ghi: phần đầu, tab Tóm tắt, tab Việc cần làm, trình phát giả lập, bấm ý để tua. |

Nghiệm thu:

- [ ] Từ thư viện mở một buổi ghi, bấm một ý, trình phát nhảy đúng mốc và ý đó được đánh dấu đang phát
- [ ] Đánh dấu xong một việc, tải lại trang vẫn còn
- [ ] Ép từng trạng thái bằng bảng thử nghiệm đều hiển thị đúng

## M2. Ghi âm

| Issue | Việc |
| --- | --- |
| M2-01 | Bắt đầu ghi: quyền micro, nhắc xin đồng ý. Màn hình ghi với dải giọng sống theo micro thật, đồng hồ, tạm dừng, kết thúc bằng nhấn giữ. |
| M2-02 | Ghi chú, đánh dấu điểm nóng, chụp ảnh. Thu nhỏ màn hình ghi thành thanh trên cùng. |
| M2-03 | Màn hình xử lý, khoảnh khắc kết thúc ghi và xử lý xong, buổi ghi mới xuất hiện trong thư viện. Khôi phục buổi ghi dang dở. |
| M2-04 | Các trạng thái của màn hình ghi: mất mạng, sắp hết hạn mức, micro bị từ chối, micro bị chiếm. |

Nghiệm thu:

- [ ] Từ thư viện tới lúc đang ghi không quá 2 lần chạm (sau lần đầu)
- [ ] Ghi 1 phút có ghi chú và điểm nóng, kết thúc, thấy buổi ghi mới trong thư viện với ghi chú hiện đúng chỗ
- [ ] Tải lại trang giữa lúc ghi thì thư viện báo có buổi ghi dang dở

## M3. Đào sâu một buổi ghi

| Issue | Việc |
| --- | --- |
| M3-01 | Tab Bản ghi lời: tự cuộn, tìm trong lời, sửa lời, thêm vào từ điển. |
| M3-02 | Đặt tên và gộp người nói. |
| M3-03 | Tab Hình ảnh hóa (tải khi mở), tab Hỏi AI (chữ chạy, dẫn chứng bấm được). |
| M3-04 | Gửi biên bản và giao việc: ba bước. Trang `/tasks`. |

Nghiệm thu:

- [ ] Đặt tên "Người nói 3" thì tên mới hiện ở tóm tắt, việc cần làm, bản ghi lời
- [ ] Luồng gửi email luôn qua màn hình xem trước, nút cuối ghi đúng số người nhận
- [ ] Gói Free thấy đúng các giới hạn (10 câu hỏi, biểu đồ bị khóa, chỉ sao chép email)

## M4. Chia sẻ và phần còn lại

| Issue | Việc |
| --- | --- |
| M4-01 | Bảng chia sẻ, trang công khai `/p/[shareId]`, thẻ trích dẫn (xuất ảnh thật), đoạn tinh túy. |
| M4-02 | Tìm kiếm, nhập file. |
| M4-03 | Cài đặt đủ các mục, gồm dọn bản gốc và từ điển tên riêng. Trang gói dịch vụ. |
| M4-04 | Làm quen lần đầu, sáu mẫu theo nghề, bốn fixture còn lại. |

Nghiệm thu:

- [ ] Tạo thẻ trích dẫn và tải được ảnh về máy
- [ ] Dọn bản gốc một buổi ghi: hộp xác nhận đúng nội dung, sau đó buổi ghi hiển thị đúng dạng "chỉ còn tóm tắt"
- [ ] Đổi nghề trong làm quen thì mẫu mặc định và buổi ghi mẫu đổi theo

## M5. Hoàn thiện

| Issue | Việc |
| --- | --- |
| M5-01 | Rà giao diện tối và bố cục máy tính cho mọi màn hình. |
| M5-02 | Tiếng Anh đầy đủ. Rà chuỗi tiếng Việt theo mục "Giọng văn". |
| M5-03 | Rà khả năng tiếp cận: bàn phím, trình đọc màn hình, tương phản, vùng chạm. |
| M5-04 | Rà hiệu năng trên điện thoại tầm trung. Viết `docs/07-handover.md`: danh sách việc để nối database theo `04-data-contract.md`. |

Nghiệm thu:

- [ ] Hoang đi hết luồng chính trên điện thoại không gặp chỗ nào phải hỏi "bấm vào đâu"
- [ ] Lighthouse trên điện thoại: Khả năng tiếp cận từ 95, Hiệu năng từ 85

## Bài thử kỹ thuật (chạy song song, nhãn `spike`)

Không thuộc mockup, nhưng kết quả quyết định hướng đi của bản thật. Nên làm trong lúc M1 đang chạy.

**SPIKE-01. Ghi âm dài trên điện thoại.** Một trang đơn giản, không cần đẹp: ghi âm bằng MediaRecorder, cắt đoạn 5 giây lưu IndexedDB, hiện số đoạn đã lưu. Hoang thử trên iPhone (Safari và khi đã thêm vào màn hình chính) và Android (Chrome), mỗi máy 60 phút, có khóa màn hình, có chuyển app, có cuộc gọi đến.

Kết quả cần ghi vào `docs/DECISIONS.md`:

- Máy nào, tình huống nào bị mất dữ liệu, mất bao nhiêu
- Wake Lock có giữ được màn hình không
- Kết luận: PWA đủ dùng, hay phải bọc thành app (ví dụ Capacitor) cho iPhone

## Sau mockup

Thứ tự đề xuất, sẽ viết đặc tả riêng khi tới lúc: đăng nhập và database, ghi âm và tải lên thật, đường ống AI (model đặt trong cấu hình, chia đoạn cho buổi dài), email, thanh toán, rồi mới tới podcast tóm tắt, sketchnote, tính năng cho sinh viên.
