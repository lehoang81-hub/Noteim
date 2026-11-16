# 08. Đa ngôn ngữ và làm việc nhóm (M6, M7)

Hai chặng mockup thêm sau M5, làm trước khi nối database vì cả hai thay đổi cấu trúc dữ liệu. Vẫn chạy bằng dữ liệu giả, theo mọi quy tắc trong `AGENTS.md` và `02-design-system.md`.

Kiểu dữ liệu chi tiết ở `04-data-contract.md` mục "Bổ sung M6, M7". Đường dẫn mới ở `03-screens.md` mục "Bản đồ đường dẫn".

---

## Phần A. M6, đa ngôn ngữ

### Bối cảnh

Người dùng Việt thường họp với đối tác nước ngoài (FDI ở Hải Phòng, Bắc Ninh: Hàn, Nhật, Trung), hoặc nói lẫn thuật ngữ tiếng Anh (bác sĩ, kiến trúc sư). Sau buổi họp, mỗi bên cần biên bản bằng ngôn ngữ của mình: nội bộ đọc tiếng Việt, đối tác Hàn đọc tiếng Hàn, sếp nước ngoài đọc tiếng Anh.

Ngôn ngữ hỗ trợ ở M6: **tiếng Việt, tiếng Anh, tiếng Hàn**. Kiểu `Lang` viết sao cho thêm tiếng Nhật, Trung sau này chỉ là thêm một giá trị và một file `messages/`.

### Ba lớp ngôn ngữ, không được trộn lẫn

| Lớp | Là gì | Ai chọn |
| --- | --- | --- |
| Ngôn ngữ giao diện | Chữ của nút, menu, thông báo | Người dùng, trong Cài đặt |
| Ngôn ngữ nói | Ngôn ngữ trong buổi ghi, có thể nhiều thứ tiếng | Người dùng chọn ngôn ngữ chính, app nhận các ngôn ngữ còn lại theo từng đoạn |
| Ngôn ngữ báo cáo | Ngôn ngữ của bản tóm tắt, việc cần làm, biên bản gửi đi | Mặc định theo cài đặt; mỗi buổi có thể có nhiều bản; mỗi người nhận có thể nhận bản riêng |

Ví dụ: anh Hoàng để giao diện tiếng Việt, họp với đối tác Hàn nói lẫn Việt, Hàn, Anh. Bản tóm tắt anh đọc là tiếng Việt; biên bản gửi ông Park là tiếng Hàn; chị kế toán nhận việc bằng tiếng Việt.

### Giao diện tiếng Hàn

- Thêm `messages/ko.json` đủ khóa như `vi.json`. Câu chữ ngắn, lịch sự trang trọng (đuôi 합니다/하세요 cho nút và thông báo), không dịch từng chữ.
- Bricolage Grotesque và Be Vietnam Pro không có chữ Hàn. Thêm font Hàn (đề xuất Pretendard hoặc Noto Sans KR), **chỉ nạp khi có chữ Hàn trên trang** (giao diện tiếng Hàn, hoặc nội dung có tiếng Hàn), dùng làm font dự phòng sau hai font chính. Ghi lựa chọn vào `DECISIONS.md`.
- Chữ Hàn dùng `word-break: keep-all` để không ngắt giữa từ. Kiểm tiêu đề dài, chip, nút ở 390px.
- Ngày, giờ, số, dung lượng qua `Intl` theo `ko-KR` (ví dụ "11월 14일 (토)", "42분").
- Số ít, số nhiều: tiếng Hàn không đổi theo số, vẫn viết ICU plural cho đủ khóa.
- Nội dung tiếng Hàn do agent viết; trước khi ra mắt thật cần người bản ngữ đọc lại (ghi vào `07-handover.md`).

### Ghi âm

- Bảng "Bắt đầu ghi" thêm dòng **Ngôn ngữ**: chip ngôn ngữ chính (mặc định theo Cài đặt), và công tắc "Có thể có tiếng khác" (mặc định bật) để app tự nhận đoạn tiếng Anh, tiếng Hàn.
- Màn ghi âm không thêm gì; không được làm chậm thao tác ghi trong 2 lần chạm.
- Nhập file: ô chọn ngôn ngữ hiện có đổi thành ngôn ngữ chính và công tắc như trên.

### Bản ghi lời

- Mỗi đoạn có `lang`. Đoạn khác ngôn ngữ chính hiện nhãn nhỏ (`EN`, `한국어`) cạnh giờ.
- Nút "Xem bản dịch" trên đầu tab bật dịch cho mọi đoạn khác ngôn ngữ giao diện: bản dịch nằm ngay dưới câu gốc, chữ nhỏ hơn, màu phụ. Từng đoạn cũng có thao tác "Dịch đoạn này".
- Dịch là giả lập: lấy từ fixture nếu có, không có thì hiện "Bản dịch mẫu" kèm câu gốc (không bịa nội dung).
- Sửa lời chỉ sửa câu gốc; bản dịch của đoạn đã sửa hiện "Cần dịch lại".

### Bản tóm tắt nhiều ngôn ngữ

- Đầu tab Tóm tắt có ô **"Tóm tắt bằng"**: liệt kê các bản đã có, và "Tạo bản tiếng Hàn", "Tạo bản tiếng Anh" cho ngôn ngữ chưa có.
- Tạo bản mới: xác nhận ngắn, chạy tiến trình 2 bước (Dịch tóm tắt, Dịch việc cần làm) khoảng 3 giây, rồi hiện bản mới. Bản gốc không đổi.
- Mỗi bản ghi rõ "Bản gốc" hoặc "Dịch từ tiếng Việt". Sửa ý ở một bản không tự sửa bản khác; bản khác hiện "Bản gốc đã sửa sau khi dịch" và nút "Dịch lại".
- **Câu trích nguyên văn** luôn giữ câu gốc trong ngoặc kép, bản dịch đặt dưới, có nhãn ngôn ngữ. Lý do: trích dẫn có thể dùng làm bằng chứng (luật, công chứng), dịch sai không được thay câu gốc.
- Số liệu, biểu đồ: giữ số, dịch tiêu đề và đơn vị; định dạng số theo ngôn ngữ của bản.
- Việc cần làm: tên việc theo bản đang xem; người phụ trách và hạn không đổi.
- Hỏi AI: trả lời bằng ngôn ngữ của câu hỏi; trích dẫn nhảy về đoạn gốc.
- Tìm kiếm: so khớp trên câu gốc và mọi bản đã có.
- Gói: Free tạo 1 bản thêm cho mỗi buổi, Pro không giới hạn. Đề xuất, chờ Hoang chốt.

### Gửi và chia sẻ theo người nhận

- Liên hệ có thêm **ngôn ngữ ưa dùng** (sửa ở Cài đặt, Danh bạ và ngay tại hàng người nhận).
- Bảng "Gửi biên bản": mỗi người nhận có chip ngôn ngữ, mặc định theo liên hệ, đổi được. Xem trước theo từng ngôn ngữ (tab nhỏ "Tiếng Việt (3 người)", "한국어 (1 người)"). Ngôn ngữ chưa có bản thì màn xác nhận ghi "Sẽ tạo bản tiếng Hàn trước khi gửi" và tạo trong lúc gửi.
- Tiêu đề email, lời chào, chân email theo ngôn ngữ của người nhận (khóa trong `messages/`).
- Link công khai: lúc tạo chọn các bản được xem; trang công khai có nút đổi ngôn ngữ, mặc định theo ngôn ngữ trình duyệt nếu có bản đó, không thì bản gốc. Chữ giao diện của trang công khai cũng đổi theo.
- Thẻ trích dẫn: chọn "Câu gốc", "Câu gốc kèm dịch" hoặc "Chỉ bản dịch" (bản dịch luôn ghi nhỏ "Dịch từ ...").

### Từ điển và mẫu

- Từ điển tên riêng: mỗi từ có thêm cách viết ở ngôn ngữ khác (ví dụ "Vinhomes Marina", "빈홈즈 마리나"). Dịch dùng từ điển này.
- Mẫu tóm tắt: tên mẫu, tên phần, câu hỏi gợi ý, dòng lưu ý chuyển sang kiểu `LocalizedText` (một map theo ngôn ngữ, bắt buộc có `vi`), thay cho trường `_en` của M5. Thiếu ngôn ngữ nào thì rơi về tiếng Anh rồi tiếng Việt.

### Cài đặt

- Giao diện: Ngôn ngữ giao diện (Tiếng Việt, English, 한국어).
- Ghi âm: Ngôn ngữ ghi âm mặc định; công tắc "Tự nhận tiếng khác".
- Mục mới "Ngôn ngữ báo cáo": ngôn ngữ tóm tắt mặc định; "Tự tạo thêm bản cho người nhận khi gửi" (bật/tắt).

### Dữ liệu mẫu

Thêm một buổi ghi đầy đủ: **"Họp với đối tác Hàn Quốc, khuôn mẫu nhựa"** (chủ doanh nghiệp, khoảng 50 phút, 4 người nói: anh Hoàng, chị Thảo kế toán, ông Park Ji-ho, cô Kim Min-ji phiên dịch). Lời nói lẫn Việt, Hàn, một ít tiếng Anh kỹ thuật. Có sẵn bản tóm tắt tiếng Việt (gốc) và tiếng Hàn (đã dịch), chưa có bản tiếng Anh để thử luồng tạo. Ông Park có ngôn ngữ ưa dùng `ko`. Nội dung thật, số liệu hợp lý (giá khuôn, thời gian giao, điều khoản thanh toán).

### Bảng thử nghiệm `?debug=1`

- Ép "Dịch lỗi" (tạo bản mới thất bại, có Thử lại).
- Ép "Dịch chậm" (10 giây).

---

## Phần B. M7, làm việc nhóm và bảng điều khiển

### Bối cảnh

Khách trả tiền lớn là tổ chức: phòng khám, văn phòng luật, sàn bất động sản, văn phòng kiến trúc, văn phòng công chứng. Họ cần không gian chung, phân quyền, và chủ phải thấy được ai dùng bao nhiêu. Dữ liệu nhạy cảm nên quyền riêng tư phải rõ hơn tiện lợi.

### Không gian làm việc

- Mỗi người luôn có **không gian Cá nhân**. Có thể tạo hoặc được mời vào **không gian Nhóm**.
- Đổi không gian ở đầu thanh bên (máy tính) hoặc ở tiêu đề thư viện (điện thoại): tên và biểu tượng chữ cái của nhóm. Đổi xong, thư viện, việc, tổng quan đều theo không gian đó.
- Tạo nhóm: tên, nghề chính, ngôn ngữ báo cáo mặc định của nhóm. Người tạo là Chủ.
- Mời: nhập email, chọn vai trò, gửi (giả lập). Người được mời mở `/join/[token]`: xem tên nhóm, ai mời, bấm "Tham gia". Lời mời hết hạn sau 7 ngày; có thu hồi.

### Vai trò và quyền

| Việc | Chủ | Quản trị | Thành viên |
| --- | --- | --- | --- |
| Ghi âm, xem buổi ghi của mình | Có | Có | Có |
| Xem buổi ghi đã chia sẻ với nhóm | Có | Có | Có |
| Xem buổi ghi riêng tư của người khác | Không | Không | Không |
| Thấy tên, thời lượng buổi ghi riêng tư của người khác (để tính mức dùng) | Có | Có | Không |
| Mời, đổi vai trò, gỡ thành viên | Có | Có (trừ Chủ) | Không |
| Mẫu tóm tắt dùng chung | Sửa | Sửa | Dùng |
| Gói, thanh toán, hóa đơn | Có | Xem | Không |
| Nhật ký truy cập | Có | Có | Không |
| Xóa nhóm, chuyển quyền Chủ | Có | Không | Không |

Nguyên tắc: **quản trị không đọc được nội dung buổi ghi riêng tư**, kể cả Chủ. Đây là điểm bán hàng với bác sĩ, luật sư; ghi rõ ở màn quản trị.

- Buổi ghi trong nhóm có `visibility`: Riêng tư (mặc định) hoặc Cả nhóm. Đổi ở menu buổi ghi và trong bảng Chia sẻ ("Chia sẻ với nhóm").
- Thư viện nhóm có chip lọc: Của tôi, Cả nhóm. Hàng buổi ghi của người khác hiện tên người ghi.
- Việc cần làm: giao được cho thành viên nhóm (ngoài liên hệ); trang Việc có lọc "Giao cho tôi".

### Bảng điều khiển cá nhân `/dashboard`

Tên trên thanh điều hướng: **Tổng quan**. Thanh dưới điện thoại: Thư viện, Tổng quan, Ghi âm (giữa), Việc, Cài đặt; Tìm kiếm ở góc trên.

Việc chính: biết tuần này mình đã làm gì và việc gì cần xử lý. Không phải lưới thẻ số liệu giống nhau (Bốn điều cấm).

Thứ tự từ trên xuống:

1. **Cần xử lý** (đầu trang, quan trọng nhất): việc quá hạn, việc đến hạn hôm nay, người nói chưa đặt tên, bản gốc sắp tự xóa, link chia sẻ sắp hết hạn, buổi ghi xử lý lỗi. Mỗi dòng có nút đi thẳng tới chỗ xử lý. Không có gì thì một dòng "Không có việc gì cần xử lý".
2. **Tuần này**: một câu tổng kết ("5 buổi ghi, 3 giờ 40 phút, 4 quyết định, xong 6 trên 9 việc") và dải giọng ghép của các buổi trong tuần theo ngày (dùng lại component dải giọng), bấm một ngày để lọc thư viện.
3. **Quyết định đã chốt**: các ý có nhãn Đã chốt trong 7 ngày, bấm để nghe lại.
4. **Người gặp nhiều**: 5 liên hệ, số buổi, lần gặp gần nhất.
5. **Theo mẫu**: thời lượng theo từng mẫu tóm tắt (biểu đồ thanh ngang, nạp chậm).
6. **Hạn mức**: phút đã dùng, còn lại, ngày làm mới; gần hết thì có nút nâng cấp.

Chọn khoảng: Tuần này, Tháng này. Trạng thái rỗng (người mới): hướng dẫn ghi buổi đầu tiên, không hiện số 0.

### Bảng điều khiển nhóm

Trong không gian Nhóm, Tổng quan có thêm tab **Nhóm** (chỉ Chủ và Quản trị):

- Phút đã dùng của cả nhóm so với hạn mức chung, theo từng người (bảng: tên, vai trò, số buổi, phút, việc mở).
- Việc mở theo người phụ trách, việc quá hạn của nhóm.
- Buổi ghi được chia sẻ với nhóm gần đây.

### Quản trị nhóm `/team/*`

Vào từ Cài đặt, mục "Nhóm" (chỉ hiện trong không gian Nhóm).

| Đường dẫn | Nội dung |
| --- | --- |
| `/team` | Thông tin nhóm: tên, nghề, ngôn ngữ báo cáo mặc định, rời nhóm, xóa nhóm (Chủ) |
| `/team/members` | Thành viên và lời mời: mời, đổi vai trò, gỡ, thu hồi lời mời |
| `/team/usage` | Mức dùng theo người và theo tháng, tải CSV |
| `/team/audit` | Nhật ký: ai xem, chia sẻ, xuất, xóa, mời, đổi vai trò, lúc nào; lọc theo người và loại; tải CSV |
| `/team/templates` | Mẫu tóm tắt dùng chung của nhóm |
| `/team/billing` | Gói Nhóm, số chỗ, hóa đơn mẫu, đổi số chỗ (giả lập) |

Mọi thao tác nguy hiểm (gỡ thành viên, xóa nhóm, chuyển Chủ) qua hộp xác nhận; xóa nhóm phải gõ tên nhóm.

Gỡ thành viên: buổi ghi riêng tư của họ đi theo họ về không gian Cá nhân; buổi đã chia sẻ với nhóm ở lại nhóm. Ghi rõ trong hộp xác nhận.

### Gói Nhóm

Thêm gói thứ ba ở `/upgrade`: **Nhóm**, giá theo người mỗi tháng (để "…" như các gói khác), hạn mức phút dùng chung, mẫu dùng chung, nhật ký truy cập. Con số chờ Hoang chốt.

### Dữ liệu mẫu

- Không gian Nhóm **"Sàn BĐS Hải Phòng Land"**: 5 thành viên (Chủ là người dùng mẫu, 1 Quản trị, 3 Thành viên, 1 lời mời đang chờ), 6 buổi ghi nhóm (3 chia sẻ cả nhóm, 3 riêng tư của người khác chỉ hiện ở mức dùng), 25 dòng nhật ký, 3 hóa đơn.
- Không gian Cá nhân giữ nguyên dữ liệu hiện có.

### Bảng thử nghiệm `?debug=1`

- Đổi vai trò của người dùng mẫu: Chủ, Quản trị, Thành viên.
- Đổi gói: Free, Pro, Nhóm.
- Ép "Lời mời hết hạn" khi mở `/join/[token]`.
- Ép "Hết chỗ" (nhóm đã đủ số chỗ, nút Mời bị khóa kèm lý do).
