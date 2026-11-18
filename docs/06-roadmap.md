# 06. Lộ trình mockup

Sáu mốc. Mỗi mốc kết thúc bằng một lần Hoang duyệt trên điện thoại. Không bắt đầu mốc sau khi mốc trước chưa merge.

## M0. Nền móng và trang trưng bày

Mục tiêu: chốt màu, chữ, chuyển động trước khi dựng bất kỳ màn hình nào. Đây là mốc duyệt thẩm mỹ quan trọng nhất.

| Issue | Việc | Trạng thái |
| --- | --- | --- |
| M0-01 | Khởi tạo dự án, lint, typecheck, luật chặn import, Vercel. `styles/tokens.css` đủ token sáng và tối. Trang `/styleguide` bản đầu. | Xong (#1, PR #3) |
| M0-02 | Hoàn thiện `/styleguide` theo kết quả review: khối "Xem nhanh", điều hướng mục, bố cục máy tính, một nguồn mã màu. | Xong (#5, Claude làm) |
| M0-03 | Toàn bộ component trong bảng "Component" của design system, hiện trên `/styleguide` với đủ trạng thái. | Xong (#8, Claude làm) |
| M0-04 | Dải giọng ba dạng (sống, phát lại, thu nhỏ) và ba khoảnh khắc đặc trưng, có nút bấm chạy thử trên `/styleguide`. | Xong (#9, Hoang duyệt 14/11) |

Nghiệm thu:

- [ ] `/styleguide` mở được trên điện thoại, đổi sáng tối bằng một nút
- [ ] Chuỗi thử tiếng Việt hiển thị đúng dấu ở cả hai phông
- [ ] Dải giọng sống chạy mượt (không giật) trên điện thoại tầm trung
- [ ] Bật "giảm chuyển động" thì ba khoảnh khắc đổi thành mờ dần

## M1. Thư viện và đọc buổi ghi

| Issue | Việc |
| --- | --- |
| M1-01 | Lớp dữ liệu: `types.ts`, `repository.ts`, bản giả, bảng thử nghiệm `?debug=1`, hai fixture đầy đủ. Xong (#12, Hoang duyệt 14/11) |
| M1-02 | Khung ứng dụng: thanh điều hướng, trình phát nổi, dải báo, bố cục ba cột trên máy tính. Xong (#13, Hoang duyệt 14/11) |
| M1-03 | Thư viện `/` với mọi trạng thái trong `03-screens.md` mục 1. Xong (#14, Hoang duyệt 14/11). Vuốt hàng và chọn nhiều chuyển sang M4. |
| M1-04 | Chi tiết buổi ghi: phần đầu, tab Tóm tắt, tab Việc cần làm, trình phát giả lập, bấm ý để tua. Xong (#15, Hoang duyệt 14/11) |

Nghiệm thu:

- [ ] Từ thư viện mở một buổi ghi, bấm một ý, trình phát nhảy đúng mốc và ý đó được đánh dấu đang phát
- [ ] Đánh dấu xong một việc, tải lại trang vẫn còn
- [ ] Ép từng trạng thái bằng bảng thử nghiệm đều hiển thị đúng

## M2. Ghi âm

| Issue | Việc |
| --- | --- |
| M2-01 (#17, xong) | Bắt đầu ghi: quyền micro, nhắc xin đồng ý. Màn hình ghi với dải giọng sống theo micro thật, đồng hồ, tạm dừng, kết thúc bằng nhấn giữ. |
| M2-02 (#18, xong) | Ghi chú, đánh dấu điểm nóng, chụp ảnh. Thu nhỏ màn hình ghi thành thanh trên cùng. |
| M2-03 (#19, xong) | Màn hình xử lý, khoảnh khắc kết thúc ghi và xử lý xong, buổi ghi mới xuất hiện trong thư viện. Khôi phục buổi ghi dang dở. |
| M2-04 (#20, xong) | Các trạng thái của màn hình ghi: mất mạng, sắp hết hạn mức, micro bị từ chối, micro bị chiếm. |

Nghiệm thu:

- [ ] Từ thư viện tới lúc đang ghi không quá 2 lần chạm (sau lần đầu)
- [ ] Ghi 1 phút có ghi chú và điểm nóng, kết thúc, thấy buổi ghi mới trong thư viện với ghi chú hiện đúng chỗ
- [ ] Tải lại trang giữa lúc ghi thì thư viện báo có buổi ghi dang dở

## M3. Đào sâu một buổi ghi

| Issue | Việc |
| --- | --- |
| M3-01 (#23, xong) | Tab Bản ghi lời: tự cuộn, tìm trong lời, sửa lời, thêm vào từ điển. |
| M3-02 (#24, xong) | Đặt tên và gộp người nói. |
| M3-03 (#25, xong) | Tab Hình ảnh hóa (tải khi mở), tab Hỏi AI (chữ chạy, dẫn chứng bấm được). |
| M3-04 (#26, xong) | Sửa và thêm việc. Gửi biên bản và giao việc: ba bước. Trang `/tasks`. |

Nghiệm thu:

- [ ] Đặt tên "Người nói 3" thì tên mới hiện ở tóm tắt, việc cần làm, bản ghi lời
- [ ] Luồng gửi email luôn qua màn hình xem trước, nút cuối ghi đúng số người nhận
- [ ] Gói Free thấy đúng các giới hạn (10 câu hỏi, biểu đồ bị khóa, chỉ sao chép email)

## M4. Chia sẻ và phần còn lại

| Issue | Việc |
| --- | --- |
| M4-01 (#30, xong) | Bảng chia sẻ, trang công khai `/p/[shareId]`, thẻ trích dẫn (xuất ảnh thật), đoạn tinh túy. Vuốt hàng trong thư viện (chuyển từ M1). Chọn nhiều bị sót, chuyển sang M5-01. |
| M4-02 (#31, xong) | Tìm kiếm, nhập file. |
| M4-03 (#32, xong) | Cài đặt đủ các mục, gồm dọn bản gốc và từ điển tên riêng. Trang gói dịch vụ. |
| M4-04 (#33, xong) | Làm quen lần đầu, sáu buổi ghi mẫu theo nghề. |

Nghiệm thu:

- [ ] Tạo thẻ trích dẫn và tải được ảnh về máy
- [ ] Dọn bản gốc một buổi ghi: hộp xác nhận đúng nội dung, sau đó buổi ghi hiển thị đúng dạng "chỉ còn tóm tắt"
- [ ] Đổi nghề trong làm quen thì mẫu mặc định và buổi ghi mẫu đổi theo

## M5. Hoàn thiện (xong 16/11/2026, PR #41)

Bản mockup hoàn chỉnh M0 đến M5. Bước tiếp theo là nối database thật theo `docs/07-handover.md`.

Các điểm nhỏ phát hiện trong lúc kiểm thử được gom ở issue #27.

| Issue | Việc |
| --- | --- |
| M5-01 (#36, xong) | Rà giao diện tối và bố cục máy tính cho mọi màn hình. Dọn #27, gồm nhấn giữ để chọn nhiều trong thư viện. |
| M5-02 (#37, xong) | Tiếng Anh đầy đủ. Rà chuỗi tiếng Việt theo mục "Giọng văn". |
| M5-03 (#38, xong) | Rà khả năng tiếp cận: bàn phím, trình đọc màn hình, tương phản, vùng chạm. |
| M5-04 (#39, xong) | Rà hiệu năng trên điện thoại tầm trung. Viết `docs/07-handover.md`: danh sách việc để nối database theo `04-data-contract.md`. |

Nghiệm thu:

- [ ] Hoang đi hết luồng chính trên điện thoại không gặp chỗ nào phải hỏi "bấm vào đâu"
- [ ] Lighthouse trên điện thoại: Khả năng tiếp cận từ 95, Hiệu năng từ 85

## M6. Đa ngôn ngữ (xong 17/11/2026, PR #52)

Đặc tả: `08-da-ngon-ngu-va-nhom.md` phần A. Một nhánh `m6/da-ngon-ngu`, một PR.

| Issue | Việc |
| --- | --- |
| M6-01 (#43, xong) | Nền tảng: kiểu `Lang`, `LocalizedText` thay `_en`, giao diện tiếng Hàn đầy đủ, font Hàn nạp khi cần, `Intl` theo `ko-KR`, chọn 3 ngôn ngữ trong Cài đặt. |
| M6-02 (#44, xong) | Ghi âm và lời nói nhiều ngôn ngữ: chọn ngôn ngữ khi bắt đầu, nhãn và bản dịch từng đoạn, từ điển nhiều cách viết, buổi ghi mẫu họp đối tác Hàn. |
| M6-03 (#45, xong) | Bản tóm tắt nhiều ngôn ngữ: chọn và tạo bản, trích dẫn giữ câu gốc, việc cần làm, Hỏi AI, tìm kiếm trên mọi bản. |
| M6-04 (#46, xong) | Gửi và chia sẻ theo người nhận: ngôn ngữ ưa dùng của liên hệ, email theo từng người, link công khai đổi ngôn ngữ, thẻ trích dẫn kèm dịch, mục "Ngôn ngữ báo cáo" trong Cài đặt. |

## M7. Nhóm và bảng điều khiển (xong 17/11/2026, PR #59)

Đặc tả: `08-da-ngon-ngu-va-nhom.md` phần B. Nhánh tích hợp `m7/nhom`; mỗi issue một nhánh, một PR vào `m7/nhom`, chia bước và push sau mỗi bước (xem `05-workflow.md`). Hết mốc một PR `m7/nhom` vào `main`.

| Issue | Việc |
| --- | --- |
| M7-01 (#47, xong) | Không gian làm việc: Cá nhân và Nhóm, đổi không gian, tạo nhóm, mời và nhận lời mời, vai trò, buổi ghi riêng tư hoặc cả nhóm, quyền kiểm ở repository. |
| M7-02 (#48, xong) | Bảng điều khiển cá nhân `/dashboard` và tab Nhóm; thanh điều hướng mới. |
| M7-03 (#49, xong) | Quản trị nhóm `/team/*`: thành viên, mức dùng, nhật ký truy cập, mẫu dùng chung, gói Nhóm và hóa đơn mẫu. |
| M7-04 (#50, xong) | Cập nhật `07-handover.md` (bảng database, bảo mật theo hàng cho nhóm và nhiều ngôn ngữ) và chạy lại rà tối, máy tính, tiếp cận, hiệu năng cho mọi màn mới. |

## M8. Nghe sạch và chữ chạy theo tiếng (xong 17/11/2026, PR #62)

Đặc tả: `09-nghe-sach.md`. Một issue, nhánh `m8/01-nghe-sach`, PR vào `main` (chặng chỉ một issue nên không cần nhánh tích hợp), chờ Hoang duyệt.

| Issue | Việc |
| --- | --- |
| M8-01 (#60, xong) | Nút và bảng Nghe sạch, bản đồ nghe giả, chữ chạy theo từng từ, đoạn đang phát nổi rõ, ý tóm tắt sáng theo, Bản gọn và Nguyên văn. |

## M9. Âm thanh thật cho buổi mẫu (xong 18/11/2026, PR #67)

Dùng 3 bộ âm thanh thử giọng tự nhiên (PR #64) cho 3 buổi mẫu, trình phát thật qua `HTMLAudioElement`, Nghe sạch qua Web Audio. Một issue, nhánh `m9/01-am-thanh-that`, PR vào `main`, chờ Hoang duyệt.

| Issue | Việc |
| --- | --- |
| M9-01 (#65, xong) | Gắn âm thanh, đổi mốc lời và tóm tắt theo file, trình phát thật, Nghe sạch có tiếng, kiểm khớp nội dung. |

## B0. Thử rủi ro trước khi làm phần chạy thật

Đặc tả: `10-b0-thu-rui-ro.md`. Hai issue độc lập, làm song song được, mỗi issue một nhánh, một PR vào `main`. Kết quả: `11-b0-ket-qua.md` và quyết định trong `DECISIONS.md`.

| Issue | Việc |
| --- | --- |
| B0-01 (#69) | So sánh Soniox, ElevenLabs Scribe, Google Chirp 3, (FPT.AI) trên 3 file thử và bản ghi người thật: sai chữ, sai số liệu, tách người nói, nhận ngôn ngữ, tốc độ, giá. |
| B0-02 (#70) | Trang `/spike/ghi-am` để Hoang thử ghi âm theo khúc và nghe dài trên iPhone, Android: khóa màn hình, chuyển app, cuộc gọi, 60 phút, mất mạng. |

## Bài thử kỹ thuật (chạy song song, nhãn `spike`)

Không thuộc mockup, nhưng kết quả quyết định hướng đi của bản thật. Nên làm trong lúc M1 đang chạy.

**SPIKE-01. Ghi âm dài trên điện thoại.** Một trang đơn giản, không cần đẹp: ghi âm bằng MediaRecorder, cắt đoạn 5 giây lưu IndexedDB, hiện số đoạn đã lưu. Hoang thử trên iPhone (Safari và khi đã thêm vào màn hình chính) và Android (Chrome), mỗi máy 60 phút, có khóa màn hình, có chuyển app, có cuộc gọi đến.

Kết quả cần ghi vào `docs/DECISIONS.md`:

- Máy nào, tình huống nào bị mất dữ liệu, mất bao nhiêu
- Wake Lock có giữ được màn hình không
- Kết luận: PWA đủ dùng, hay phải bọc thành app (ví dụ Capacitor) cho iPhone

## Sau mockup

Sau M7. Thứ tự đề xuất, sẽ viết đặc tả riêng khi tới lúc: đăng nhập và database, ghi âm và tải lên thật, đường ống AI (model đặt trong cấu hình, chia đoạn cho buổi dài), email, thanh toán, rồi mới tới podcast tóm tắt, sketchnote, tính năng cho sinh viên.
