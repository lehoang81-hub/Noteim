# 01. Tóm tắt sản phẩm

## Noteim làm gì

Người dùng bấm ghi âm trong buổi làm việc. Khi kết thúc, Noteim trả về bản tóm tắt theo đúng mẫu của nghề họ, danh sách việc cần làm kèm người phụ trách, và cho phép bấm vào bất kỳ ý nào để nghe lại đúng đoạn đó. Sau đó họ gửi biên bản, giao việc, hoặc chia sẻ đoạn trích chỉ bằng vài lần chạm.

## Cho ai

Ưu tiên 1, người đi làm có nhiều buổi nói chuyện quan trọng mỗi ngày:

| Nghề | Buổi làm việc điển hình | Thứ họ cần nhất sau buổi đó |
| --- | --- | --- |
| Chủ doanh nghiệp | Họp điều hành, họp đối tác | Ai nhận việc gì, hạn nào, điều gì đã chốt |
| Bác sĩ | Buổi khám, hội chẩn | Lời bệnh nhân kể, chỉ định, dặn dò, lịch tái khám |
| Luật sư | Tư vấn khách hàng | Sự việc, yêu cầu, tài liệu còn thiếu, mốc thời hạn |
| Sale bất động sản | Gặp khách, dẫn xem nhà | Nhu cầu, ngân sách, băn khoăn, bước tiếp theo |
| Kiến trúc sư | Họp chủ nhà, họp công trường | Yêu cầu thay đổi, số đo, hạng mục tồn tại theo từng bên |
| Công chứng viên | Phiên làm việc với các bên | Giấy tờ đã xuất trình, giấy tờ còn thiếu, nội dung đã giải thích |

Ưu tiên 2 (chưa làm ở mockup): sinh viên, học sinh.

Đặc điểm chung của nhóm ưu tiên 1, quyết định cách thiết kế:

- Dùng điện thoại là chính, thường cầm một tay, hay đang đi lại.
- Ít kiên nhẫn với phần mềm. Mở app phải ghi được trong 2 lần chạm.
- Coi trọng hình ảnh cá nhân. Thứ họ đưa cho khách xem phải đẹp và chỉn chu.
- Nội dung nhạy cảm (bệnh án, hồ sơ pháp lý, giá cả). Phải thấy rõ quyền kiểm soát dữ liệu.

## Nguyên tắc sản phẩm

1. **Ghi trước, hỏi sau.** Không bắt điền gì trước khi ghi. Tiêu đề, mẫu, người tham gia đều có thể bổ sung sau.
2. **Mọi kết luận đều có bằng chứng.** Ý tóm tắt nào cũng bấm được để nghe lại đoạn gốc.
3. **AI đề xuất, người quyết định.** Không gửi email, không chia sẻ, không xóa khi chưa có màn hình xem trước và nút xác nhận.
4. **Đúng nghề.** Bản tóm tắt của bác sĩ khác bản tóm tắt của sale. Mẫu theo nghề là tính năng lõi, không phải phần trang trí.
5. **Người dùng thấy dữ liệu của mình ở đâu.** Trạng thái lưu trữ, ngày tự xóa, ai đang xem link chia sẻ luôn hiển thị rõ.

## Phạm vi mockup

**Có trong mockup** (bấm được, chạy bằng dữ liệu giả):

- Làm quen lần đầu, chọn nghề
- Thư viện buổi ghi, tìm kiếm, lọc
- Tạo buổi ghi, màn hình ghi âm với ghi chú, đánh dấu, chụp ảnh
- Màn hình xử lý, khôi phục buổi ghi dang dở
- Chi tiết buổi ghi: Tóm tắt, Việc cần làm, Bản ghi lời, Hình ảnh hóa, Hỏi AI
- Đặt tên người nói
- Gửi biên bản và giao việc qua email (xem trước, xác nhận, giả lập gửi)
- Chia sẻ: trang công khai, thẻ trích dẫn, đoạn tinh túy
- Nhập file ghi âm có sẵn
- Cài đặt: hồ sơ, từ điển tên riêng, lưu trữ và dọn dẹp, gói dịch vụ
- Giao diện sáng và tối, điện thoại và máy tính, tiếng Việt và tiếng Anh

**Giả lập trong mockup:**

- Micro: dùng micro thật để vẽ dải giọng sống (nếu người dùng cho phép), nhưng không lưu, không tải lên. Từ chối quyền thì chạy dải giọng giả.
- Phát lại: đồng hồ giả lập chạy trên dữ liệu `peaks` có sẵn, không cần file âm thanh.
- AI: mọi câu trả lời lấy từ fixture, có độ trễ giả và hiệu ứng chữ chạy.

**Không làm ở giai đoạn này:** đăng nhập thật, database, gọi AI, gửi email, thanh toán, thu tiếng họp online, podcast tóm tắt, sketchnote, tính năng cho sinh viên.

## Việc kỹ thuật chạy song song (không thuộc mockup)

Rủi ro lớn nhất của sản phẩm là ghi âm dài trên điện thoại bằng PWA. Cần một bài thử riêng, tách khỏi mockup: ghi 60 phút trên iPhone và Android, có khóa màn hình và chuyển app giữa chừng, xem có mất dữ liệu không. Kết quả bài thử này quyết định Noteim là PWA hay phải bọc thành app. Xem issue riêng ở `docs/06-roadmap.md` mục "Bài thử kỹ thuật".

## Khác biệt so với bản đặc tả 1.0

| Bản 1.0 | Bản này | Lý do |
| --- | --- | --- |
| 3 bối cảnh chung (họp, sales, lecture) | 6 mẫu theo nghề | Nhóm khách hàng đã rõ |
| Nhãn "formula" cho công thức | Nhãn "Số liệu" | Người đi làm cần con số, không cần công thức |
| Gửi email bằng lệnh tự nhiên, gửi ngay | Luôn xem trước rồi xác nhận | Gửi nhầm người là mất uy tín |
| AI tự đặt tên người nói | Có bước người dùng gán tên | AI không biết ai là ai |
| Chưa có bước xin đồng ý ghi âm | Có nhắc và ghi nhận đồng ý | Nội dung nhạy cảm, yêu cầu pháp lý |
| Code đầy đủ ngay từ Phase 1 | Mockup trước, nối dữ liệu sau | Duyệt giao diện trước khi tốn công |
