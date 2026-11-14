# 03. Màn hình và luồng

Sơ đồ vẽ theo bề ngang điện thoại. Bố cục máy tính xem `02-design-system.md` mục "Bố cục".

## Bản đồ đường dẫn

| Đường dẫn | Màn hình | Mốc |
| --- | --- | --- |
| `/styleguide` | Trang trưng bày token và component | M0 |
| `/` | Thư viện | M1 |
| `/s/[id]` | Chi tiết buổi ghi (tab qua `?tab=`) | M1, M3 |
| `/record` | Ghi âm | M2 |
| `/s/[id]/processing` | Đang xử lý | M2 |
| `/tasks` | Việc cần làm của mọi buổi | M3 |
| `/search` | Tìm kiếm | M4 |
| `/import` | Nhập file có sẵn | M4 |
| `/settings/*` | Cài đặt | M4 |
| `/welcome` | Làm quen lần đầu | M4 |
| `/p/[shareId]` | Trang chia sẻ công khai | M4 |
| `/upgrade` | Gói dịch vụ | M4 |

## Bảng điều khiển thử nghiệm

Thêm `?debug=1` vào bất kỳ đường dẫn nào để mở bảng nhỏ ở góc màn hình, cho phép ép trạng thái: mất mạng, tải chậm (3 giây), lỗi tải, hết hạn mức, thư viện rỗng, đổi nghề, đổi gói Free và Pro. Bảng này là công cụ để người duyệt kiểm tra mọi trạng thái trên điện thoại. Lựa chọn lưu trong `localStorage`.

---

## 1. Thư viện `/`

Việc chính: tìm lại một buổi ghi, hoặc bắt đầu buổi mới.

```
┌──────────────────────────────┐
│ Chào anh Hoàng           ⌕ ⚙ │
│ Tuần này: 5 buổi, 3 việc treo│
├──────────────────────────────┤
│ [Tất cả][Tuần này][Có việc]… │
├──────────────────────────────┤
│ Hôm nay                      │
│ Gặp chị Lan, căn 2PN Vinhomes│
│ ▂▅▇▃▆▂▇▅▃▂▆▇▃▅  42 phút      │
│ ⏳ 2 việc   Gặp khách        │
│ ──────────────────────────── │
│ Họp điều hành tháng 11       │
│ ▃▆▂▇▅▃▂▆▇▃▅▂▅▇  1 giờ 08     │
│ ✓ Đã chốt 4   Họp điều hành  │
│ ──────────────────────────── │
│ Hôm qua                      │
│ Tư vấn ông Phước, tranh chấp…│
│ ◌ Đang tóm tắt, còn khoảng 1'│
├──────────────────────────────┤
│ Thư viện    ( ● )     Việc   │
└──────────────────────────────┘
```

- Dòng chào dùng tên và cách xưng hô người dùng chọn lúc làm quen (anh, chị, hoặc không).
- Dòng thứ hai là con số thật tính từ dữ liệu, không phải câu khẩu hiệu.
- Hàng buổi ghi: tiêu đề, dải giọng thu nhỏ + thời lượng, một dòng trạng thái (nhãn quan trọng nhất + tên mẫu). Nhóm theo ngày.
- Vuốt hàng sang trái: Chia sẻ, Xóa. Nhấn giữ: chọn nhiều.
- Chip lọc cuộn ngang: Tất cả, Tuần này, Có việc treo, theo từng mẫu.
- Dải hạn mức chỉ hiện khi đã dùng trên 80%: "Còn 22 phút tháng này".

Trạng thái:

| Trạng thái | Hiển thị |
| --- | --- |
| Đang tải | 5 hàng khung chờ |
| Rỗng | Hình vẽ nét đơn chiếc micro, câu "Chưa có buổi ghi nào…", mũi tên cong chỉ xuống nút ghi âm |
| Lọc không ra kết quả | "Không có buổi ghi nào khớp." + nút "Bỏ lọc" |
| Lỗi tải | "Chưa tải được thư viện." + nút "Thử lại" |
| Có bản ghi dang dở | Dải báo trên cùng: "Buổi ghi lúc 14:05 chưa lưu xong (37 phút). Khôi phục / Bỏ" |
| Hàng đang xử lý | Dải giọng màu trung tính có ánh chạy, dòng trạng thái là tiến độ |
| Hàng lỗi xử lý | Biểu tượng cảnh báo, "Chưa tóm tắt được. Thử lại" |
| Hàng chưa tải lên | Biểu tượng đám mây gạch, "Đang chờ mạng để tải lên" |
| Hàng đã dọn bản gốc | Dải giọng mờ, chú thích "Chỉ còn tóm tắt" |

## 2. Bắt đầu ghi

Chạm nút ghi âm là ghi ngay. Không có biểu mẫu chặn đường.

Lần đầu tiên trong đời: bảng trượt nửa màn hình xin quyền micro, giải thích một câu, có hình minh họa. Sau khi được cấp quyền thì ghi luôn.

Nếu trong Cài đặt đang bật "Nhắc xin đồng ý ghi âm" (mặc định bật): trước khi ghi hiện bảng nhỏ 3 giây tự đóng:

```
┌──────────────────────────────┐
│ Mọi người đã đồng ý ghi âm?  │
│ [ Đã đồng ý, ghi ]  [ Hủy ]  │
│ ☐ Phát câu thông báo ghi âm  │
└──────────────────────────────┘
```

Chọn "Phát câu thông báo" thì mockup hiện dòng chữ "Đang phát: Buổi làm việc này được ghi âm để lập biên bản" trong 2 giây. Lựa chọn đồng ý được ghi vào buổi ghi (`consent`).

## 3. Ghi âm `/record`

Nền luôn là chàm đêm. Màn hình không tự tắt (Wake Lock).

```
┌──────────────────────────────┐
│ ⌄  Gặp khách ▾        ● Ghi  │
│                              │
│           12:47              │
│                              │
│  ▁▂▃▅▇▅▃▂▁▂▄▆▇▆▄▂▁▂▃▅▇▅▃▂▁  │
│        (dải giọng sống)      │
│                              │
│ ┌──────────────────────────┐ │
│ │ 03:12 Khách chê giá cao  │ │
│ │ 08:40 📷 ảnh mặt bằng    │ │
│ │ 11:05 ⚑ Điểm nóng        │ │
│ │ Gõ ghi chú…              │ │
│ └──────────────────────────┘ │
│                              │
│   ⚑        ( ❚❚ )       📷   │
│ Đánh dấu   Tạm dừng    Chụp  │
│                              │
│      [ Kết thúc buổi ghi ]   │
└──────────────────────────────┘
```

- Góc trên trái: thu nhỏ màn hình ghi (vẫn ghi tiếp, hiện thanh nhỏ màu sen ở mọi trang khác: "● 12:47 Đang ghi").
- Giữa trên: tên mẫu, chạm để đổi mẫu ngay trong lúc ghi.
- Đồng hồ dùng cỡ `display`, số đều bề ngang.
- Ô ghi chú: mỗi lần xuống dòng tạo một ghi chú gắn mốc thời gian hiện tại.
- **Đánh dấu**: chạm một lần tạo điểm nóng. Nhấn giữ để chọn nhãn màu (Đã chốt, Còn treo, Rủi ro, Ý hay, Số liệu).
- **Chụp**: mở máy ảnh (mockup dùng `<input type="file" capture>`), ảnh gắn mốc thời gian, hiện thu nhỏ trong danh sách ghi chú.
- **Kết thúc**: phải nhấn giữ 0,8 giây (có vòng tiến độ chạy quanh nút) để tránh chạm nhầm.

Trạng thái:

| Trạng thái | Hiển thị |
| --- | --- |
| Tạm dừng | Dải giọng đứng yên và mờ, đồng hồ nhấp nháy chậm, nút giữa đổi thành "Ghi tiếp" |
| Mất mạng | Dải báo: "Mất mạng. Vẫn đang ghi và lưu trên máy này." |
| Sắp hết hạn mức phiên | Còn 5 phút: dải báo hổ phách "Còn 5 phút cho buổi này (gói Free tối đa 45 phút)" |
| Hết hạn mức phiên | Tự kết thúc, chuyển sang xử lý, thông báo lý do |
| Micro bị từ chối | Trang giải thích cách bật lại quyền, có nút "Dùng thử với âm thanh mẫu" |
| Có cuộc gọi đến hoặc app khác chiếm micro | Tự tạm dừng, dải báo "Đã tạm dừng vì micro bị dùng ở nơi khác" |
| Bên kia im lặng trên 60 giây | Gợi ý nhỏ: "Im lặng đã 1 phút. Tạm dừng?" |

## 4. Đang xử lý `/s/[id]/processing`

```
┌──────────────────────────────┐
│ ←                            │
│                              │
│  ▃▆▂▇▅▃▂▆▇▃▅▂▅▇▃▆▂▇▅▃▂▆▇▃   │
│  (đang được nhuộm màu dần)   │
│                              │
│  ✓ Đã lưu bản ghi âm         │
│  ✓ Đã lọc khoảng lặng        │
│  ◌ Đang nhận ra người nói    │
│  ○ Tóm tắt theo mẫu          │
│  ○ Tìm việc cần làm          │
│                              │
│  Trong lúc chờ:              │
│  Tên buổi ghi [Gặp chị Lan ] │
│  Ai đã tham gia? [+ Thêm]    │
│                              │
│  Bạn có thể rời màn hình này.│
│  Noteim sẽ báo khi xong.     │
└──────────────────────────────┘
```

- Mockup chạy 5 bước trong khoảng 8 giây rồi tự chuyển sang chi tiết buổi ghi, kèm khoảnh khắc đặc trưng số 3.
- Phần "Trong lúc chờ" tận dụng thời gian để lấy tiêu đề và người tham gia. Người tham gia chọn từ danh bạ Noteim hoặc gõ tên mới.
- Trạng thái lỗi: bước lỗi đổi sang biểu tượng cảnh báo, hiện "Chưa tóm tắt được buổi ghi này. Bản ghi âm vẫn an toàn." + "Thử lại".

## 5. Chi tiết buổi ghi `/s/[id]`

```
┌──────────────────────────────┐
│ ←                      ⇪  ⋯  │
│ Gặp chị Lan, căn 2PN         │
│ Vinhomes                     │
│ 12/11, 42 phút, Gặp khách    │
│ ● Chị Lan  ● Bạn  ● Anh Tuấn │
├──────────────────────────────┤
│ Tóm tắt  Việc  Lời  Hình  AI │
│ ───────                      │
│ (nội dung tab)               │
│                              │
├──────────────────────────────┤
│ ▶ 03:12  ▃▆▂▇▅▃▂▆▇  42:10    │
├──────────────────────────────┤
│ Thư viện    ( ● )     Việc   │
└──────────────────────────────┘
```

- Tiêu đề chạm để sửa. Chấm người nói chạm để mở bảng đặt tên (mục 6).
- `⇪` mở bảng chia sẻ (mục 9). `⋯`: Đổi mẫu và tóm tắt lại, Gửi biên bản, Xuất file, Dọn bản gốc, Xóa.
- Trình phát nổi luôn có mặt. Chạm vào để mở rộng: dải giọng đầy đủ, dải nhiệt, tốc độ (1x, 1,25x, 1,5x, 2x), lùi 10 giây, tới 10 giây, bỏ qua khoảng lặng.
- Nếu còn người nói chưa đặt tên: dải gợi ý ngay dưới phần đầu "Có 2 người nói chưa có tên. Đặt tên".
- Nếu bản gốc sắp bị xóa (gói Free, còn dưới 48 giờ): dải báo hổ phách "Bản ghi âm sẽ tự xóa ngày 19/11. Tóm tắt vẫn được giữ. Giữ lại bản gốc".
- Buổi ghi đã dọn bản gốc: trình phát thay bằng dòng "Buổi ghi này chỉ còn tóm tắt", các mốc thời gian vẫn hiện nhưng không bấm được, tab "Lời" hiện trạng thái rỗng có giải thích.

### 5a. Tab Tóm tắt

```
│ Điểm chính                   │
│ Chị Lan thích căn 2PN tầng   │
│ 18, ngân sách 4,2 tỷ, cần    │
│ chồng xem trước khi cọc.     │
│                              │
│ ✓ Đã chốt                    │
│ Nhu cầu và ngân sách   01:20 │
│  ● Cần 2 phòng ngủ, gần      │
│    trường cấp 1        02:05 │
│  ● Ngân sách tối đa 4,2 tỷ,  │
│    vay 50%             04:30 │
│                              │
│ ⚠ Rủi ro                     │
│ Băn khoăn về giá       11:05 │
│  ● "Giá này cao hơn bên      │
│    Imperia 300 triệu"  11:20 │
│  ┌ Ghi chú của bạn ────────┐ │
│  │ Khách chê giá cao       │ │
│  └─────────────────────────┘ │
│                              │
│ [ Gửi biên bản ]  [ Hỏi AI ] │
```

- "Điểm chính": 2 đến 3 câu, cỡ `body`, không nằm trong hộp.
- Dưới đó là các phần theo mẫu của nghề (xem bảng "Mẫu theo nghề" cuối tài liệu). Mỗi phần gồm nhiều chủ đề; mỗi chủ đề có nhãn ngữ nghĩa, tiêu đề, mốc thời gian, các ý.
- Mỗi ý: chấm màu người nói, nội dung, mốc thời gian bên phải. Chạm vào ý thì phát từ mốc đó; ý đang phát có vạch sen bên trái.
- Ghi chú tay của người dùng trong lúc ghi hiện đúng dưới ý liên quan, trong khung viền mảnh, để phân biệt với nội dung AI viết.
- Nhấn giữ một ý: Sao chép, Sửa, Tạo thẻ trích dẫn, Thêm vào đoạn tinh túy, Chuyển thành việc cần làm.
- Sửa ý: chỉnh tại chỗ, lưu thì hiện chấm nhỏ "đã sửa".
- Chủ đề có số liệu thì hiện biểu đồ nhỏ ngay bên dưới (xem 5d).

### 5b. Tab Việc cần làm

```
│ 3 việc, 1 quá hạn            │
│                              │
│ ○ Gửi bảng tính vay 50% cho  │
│   chị Lan                    │
│   Bạn, hạn 13/11, Cao  27:40 │
│   "Em gửi chị bảng tính      │
│    trước tối mai nhé"        │
│ ──────────────────────────── │
│ ○ Hẹn chồng chị Lan xem nhà  │
│   Chưa giao, chưa có hạn     │
│ ──────────────────────────── │
│ ✓ Xin chính sách chiết khấu  │
│   Anh Tuấn, xong 12/11       │
│                              │
│ [ + Thêm việc ]              │
│ [ Giao việc qua email ]      │
```

- Chạm ô tròn để đánh dấu xong, có thông báo nhanh kèm "Hoàn tác".
- Chạm hàng để mở bảng sửa: nội dung, người phụ trách (chọn từ người tham gia), hạn, mức ưu tiên.
- Câu trích nguyên văn hiện dưới việc, chạm để nghe.
- Việc AI không chắc về người phụ trách: hiện "Chưa giao" màu hổ phách, không tự đoán.
- Rỗng: "Buổi này không có việc nào được giao." + "Thêm việc".

### 5c. Tab Bản ghi lời

- Danh sách đoạn lời, mỗi đoạn có vạch dọc màu người nói, tên, mốc thời gian, nội dung.
- Đoạn đang phát được tô nền `--surface-2` và tự cuộn theo. Người dùng cuộn tay thì dừng tự cuộn, hiện nút "Về đoạn đang phát".
- Ô tìm trong bản ghi lời ở trên cùng, tô sáng kết quả, có nút tới và lùi.
- Chạm một đoạn để phát từ đó. Nhấn giữ: Sao chép, Sửa lời, Đổi người nói, Tạo thẻ trích dẫn.
- Từ nằm trong từ điển tên riêng được gạch chân chấm; chạm một từ bất kỳ để "Thêm vào từ điển" khi AI nghe sai tên.

### 5d. Tab Hình ảnh hóa

Chỉ tạo khi người dùng mở tab lần đầu: hiện khung chờ 2 giây rồi mới ra nội dung, để giả lập đúng hành vi thật.

- **Dòng thời gian buổi ghi**: các chủ đề xếp theo thời gian, bề ngang theo thời lượng, màu theo nhãn.
- **Ai nói bao nhiêu**: thanh ngang chia theo tỷ lệ thời lượng từng người, có số phần trăm.
- **Biểu đồ số liệu**: cột hoặc đường, dựng từ các con số được nhắc trong buổi (ví dụ so sánh giá ba căn). Mỗi biểu đồ có dòng nguồn "Nhắc đến lúc 11:20", bấm được.
- **Sơ đồ quy trình**: khi buổi ghi có các bước (ví dụ thủ tục công chứng), dựng bằng Mermaid.
- **Ảnh đã chụp**: lưới ảnh kèm mốc thời gian.
- Mỗi khối có nút "Tải ảnh" và "Sao chép".
- Gói Free: biểu đồ số liệu và sơ đồ bị che mờ kèm nút "Mở khóa với Pro".

### 5e. Tab Hỏi AI

```
│ Gợi ý:                       │
│ [Khách còn băn khoăn gì?]    │
│ [Soạn tin nhắn Zalo cảm ơn]  │
│ [Lần gặp tới cần chuẩn bị gì]│
│                              │
│        Chị Lan nói gì về     │
│        chuyện vay?        ◗  │
│                              │
│ ✦ Chị Lan định vay 50%, lo   │
│   lãi suất sau ưu đãi.       │
│   ▶ 04:30   ▶ 15:12          │
│                              │
│ [ Hỏi về buổi ghi này…   ➤ ] │
```

- Câu gợi ý lấy theo mẫu của nghề.
- Câu trả lời nằm trong khối AI (nền `--dien-tint`), chữ chạy dần, cuối câu có các nút dẫn chứng bấm để nghe.
- Câu không có trong fixture: trả lời cố định "Bản mockup chỉ trả lời được các câu gợi ý."
- Gói Free: bộ đếm "Còn 7/10 câu hỏi cho buổi này".
- Công tắc phạm vi: "Buổi này" hoặc "Mọi buổi ghi" (Pro).

## 6. Đặt tên người nói (bảng trượt)

```
│ Ai là ai?                    │
│                              │
│ ● Người nói 1   ▶ nghe thử   │
│   nói 52%                    │
│   [ Bạn ]                    │
│ ● Người nói 2   ▶ nghe thử   │
│   nói 39%                    │
│   [ Chị Lan          ▾ ]     │
│ ● Người nói 3   ▶ nghe thử   │
│   nói 9%                     │
│   [ Chọn hoặc gõ tên… ]      │
│                              │
│ Gộp hai người nói thành một  │
│ [ Lưu ]                      │
```

- "Nghe thử" phát 5 giây đoạn rõ nhất của người đó.
- Ô tên gợi ý từ người tham gia đã khai và danh bạ. Chọn người có email thì việc cần làm của họ tự có địa chỉ gửi.
- Lưu xong, tên cập nhật ở mọi nơi trong buổi ghi.

## 7. Gửi biên bản và giao việc

Ba bước, luôn có xem trước.

1. **Chọn người nhận.** Danh sách người tham gia, tích chọn. Người thiếu email hiện ô nhập ngay tại hàng. Hai lựa chọn: "Gửi biên bản chung" và "Gửi việc riêng cho từng người".
2. **Xem trước.** Vuốt ngang qua từng email: biên bản chung, rồi email riêng của từng người (việc của họ, hạn, câu trích nguyên văn, nút "Nghe lại đoạn này"). Sửa được tiêu đề và nội dung. Khối do AI soạn có viền điện.
3. **Xác nhận.** Nút ghi rõ số lượng: "Gửi cho 4 người". Sau khi bấm: giả lập 1,5 giây, thông báo "Đã gửi biên bản cho 4 người", ghi lịch sử gửi vào buổi ghi.

Gói Free: bước 3 thay bằng "Sao chép nội dung" và ghi chú gói Pro gửi được trực tiếp.

Trạng thái lỗi: một người gửi lỗi thì báo đúng người đó, có "Gửi lại".

## 8. Việc cần làm của mọi buổi `/tasks`

- Gộp việc từ tất cả buổi ghi. Nhóm: Quá hạn, Hôm nay, Tuần này, Sau đó, Chưa có hạn.
- Bộ lọc: Việc của tôi, Tôi đã giao, Tất cả.
- Mỗi hàng ghi tên buổi ghi gốc, chạm để nhảy tới đúng đoạn.
- Rỗng: "Không còn việc nào treo."

## 9. Chia sẻ (bảng trượt)

Bốn lựa chọn:

| Lựa chọn | Kết quả |
| --- | --- |
| Link xem | Tạo trang công khai. Chọn nội dung được xem: chỉ tóm tắt, hoặc tóm tắt + nghe lại. Đặt mật khẩu, ngày hết hạn. Thấy số lượt xem. Thu hồi được. |
| Thẻ trích dẫn | Ảnh dọc 1080 x 1350: câu nói, tên người nói, dải giọng của đoạn đó, logo nhỏ. Ba kiểu nền: sứ, chàm đêm, Hừng đông. Tải về hoặc chia sẻ qua bảng chia sẻ của máy. |
| Đoạn tinh túy | Tích chọn 3 đến 5 ý, xem tổng thời lượng, bấm "Ghép đoạn". Mockup giả lập và trả về màn hình nghe thử. |
| Xuất file | PDF, Word, sao chép dạng văn bản. Mockup chỉ hiện thông báo "Đã xuất". |

**Trang công khai `/p/[shareId]`:** không có thanh điều hướng của app. Đầu trang là tiêu đề buổi ghi và người chia sẻ, giữa là tóm tắt bấm nghe được (nếu được phép), cuối trang là dòng "Ghi và tóm tắt bằng Noteim" kèm nút "Dùng thử". Trạng thái: link hết hạn, link bị thu hồi, cần mật khẩu.

## 10. Nhập file `/import`

- Kéo thả hoặc chọn file ghi âm, video. Hiện tên, thời lượng, dung lượng.
- Chọn mẫu, chọn ngôn ngữ, bấm "Tóm tắt file này" rồi sang màn hình xử lý.
- Lỗi: định dạng không hỗ trợ, file dài quá hạn mức phiên, tổng vượt hạn mức tháng.

## 11. Tìm kiếm `/search`

- Ô tìm lấy nét sẵn. Bên dưới: tìm kiếm gần đây, gợi ý theo người và theo mẫu.
- Kết quả nhóm thành: Buổi ghi, Trong lời nói (kèm đoạn trích tô sáng và mốc thời gian), Việc cần làm.
- Gói Free: tìm trong tiêu đề và tóm tắt. Tìm trong lời nói của mọi buổi là Pro.
- Không có kết quả: "Không tìm thấy 'hợp đồng cọc'. Thử tên người hoặc ngày."

## 12. Cài đặt `/settings`

| Mục | Nội dung |
| --- | --- |
| Hồ sơ | Tên, cách xưng hô, nghề (đổi nghề thì đổi mẫu mặc định), email |
| Mẫu tóm tắt | Xem 6 mẫu có sẵn, bật tắt từng phần, đổi thứ tự. Tạo mẫu riêng là Pro. |
| Từ điển tên riêng | Danh sách tên người, công ty, dự án, thuật ngữ để AI nghe đúng. Thêm, sửa, xóa. |
| Danh bạ | Người hay làm việc cùng: tên, vai trò, email |
| Ghi âm | Nhắc xin đồng ý (bật tắt), câu thông báo, tự lọc khoảng lặng |
| Lưu trữ | Thanh dung lượng đã dùng. Danh sách buổi ghi theo dung lượng. "Dọn bản gốc" từng buổi hoặc hàng loạt, có hộp xác nhận nói rõ thứ gì mất và thứ gì giữ. |
| Quyền riêng tư | Tải toàn bộ dữ liệu, xóa tài khoản, danh sách link đang chia sẻ |
| Giao diện | Sáng, tối, theo máy. Ngôn ngữ: Tiếng Việt, English |
| Gói dịch vụ | Gói hiện tại, hạn mức đã dùng, nút nâng cấp |

Hộp xác nhận dọn bản gốc:

```
│ Dọn bản gốc của 3 buổi ghi?  │
│                              │
│ Sẽ xóa: bản ghi âm, bản ghi  │
│ lời đầy đủ (giải phóng 31 MB)│
│ Vẫn giữ: tóm tắt, việc cần   │
│ làm, biểu đồ, ghi chú, ảnh   │
│                              │
│ Không khôi phục được.        │
│ [ Hủy ]   [ Dọn bản gốc ]    │
```

## 13. Gói dịch vụ `/upgrade`

| | Free | Pro |
| --- | --- | --- |
| Thời lượng ghi | 180 phút mỗi tháng, tối đa 45 phút mỗi buổi | 1.200 phút mỗi tháng, tối đa 4 giờ mỗi buổi |
| Bản ghi âm gốc | Tự xóa sau 7 ngày, nhắc trước 24 giờ | Giữ đến khi bạn tự dọn |
| Tóm tắt, việc cần làm | Giữ mãi | Giữ mãi |
| Mẫu theo nghề | 6 mẫu có sẵn | Thêm mẫu tự tạo |
| Hình ảnh hóa | Dòng thời gian, ai nói bao nhiêu | Thêm biểu đồ số liệu, sơ đồ quy trình |
| Hỏi AI | 10 câu mỗi buổi | Không giới hạn, hỏi xuyên mọi buổi ghi |
| Tìm kiếm | Tiêu đề và tóm tắt | Thêm tìm trong lời nói |
| Email | Soạn sẵn để sao chép | Gửi trực tiếp cho từng người |
| Chia sẻ | Link xem, thẻ trích dẫn | Thêm đoạn tinh túy, xuất PDF và Word |

Giá hiển thị trong mockup để trống dạng "… đ/tháng", chờ chủ sản phẩm chốt. Hai nút thanh toán (chuyển khoản VietQR, thẻ quốc tế) đều dẫn tới màn hình "Bản mockup chưa nối thanh toán".

## 14. Làm quen lần đầu `/welcome`

Ba bước, mỗi bước một màn hình, có thể bỏ qua:

1. **Bạn làm nghề gì?** Sáu lựa chọn dạng danh sách có biểu tượng, cộng "Nghề khác". Lựa chọn quyết định mẫu mặc định và buổi ghi mẫu.
2. **Noteim nên gọi bạn là gì?** Tên và cách xưng hô.
3. **Nghe thử một buổi ghi mẫu.** Mở thẳng chi tiết buổi ghi mẫu của nghề đã chọn, có 3 chú thích nổi lần lượt chỉ vào: ý tóm tắt bấm nghe được, việc cần làm, nút ghi âm.

Đây là nơi duy nhất dùng khoảnh khắc đặc trưng số 1 làm màn chào: logo Hừng đông duỗi thành dải giọng.

## 15. Trạng thái toàn cục

| Trạng thái | Hiển thị |
| --- | --- |
| Mất mạng | Dải báo mỏng dưới thanh tiêu đề: "Đang ngoại tuyến. Thư viện vẫn xem được." |
| Có mạng lại | Thông báo nhanh: "Đã có mạng. Đang tải lên 1 buổi ghi." |
| Hết hạn mức tháng | Nút ghi âm vẫn bấm được, mở bảng giải thích + ngày có hạn mức mới + nút nâng cấp |
| Trang không tồn tại | "Không tìm thấy buổi ghi này. Có thể nó đã bị xóa." + "Về thư viện" |
| Đang ghi mà chuyển trang | Thanh nhỏ màu sen trên cùng, chạm để quay lại màn hình ghi |

---

## Mẫu theo nghề

Mỗi mẫu định nghĩa các phần trong tab Tóm tắt và các câu gợi ý trong tab Hỏi AI.

| Mẫu | Các phần tóm tắt | Câu gợi ý hỏi AI |
| --- | --- | --- |
| **Họp điều hành** (chủ doanh nghiệp) | Quyết định, Số liệu được nhắc, Rủi ro và vướng mắc, Việc giao theo người | Ai đang quá tải? Điều gì chưa có người nhận? Soạn thông báo cho toàn công ty |
| **Buổi khám** (bác sĩ) | Lý do đến khám, Lời bệnh nhân kể, Chỉ định và đơn thuốc đã dặn, Dặn dò, Hẹn tái khám | Bệnh nhân kể triệu chứng từ khi nào? Soạn tờ dặn dò cho bệnh nhân. Tôi đã dặn kiêng gì? |
| **Tư vấn pháp lý** (luật sư) | Sự việc theo trình tự thời gian, Yêu cầu của khách hàng, Vấn đề pháp lý cần xem, Tài liệu cần bổ sung, Mốc thời hạn | Liệt kê các mốc ngày tháng khách nhắc. Khách còn thiếu giấy tờ gì? Soạn thư xác nhận nội dung tư vấn |
| **Gặp khách** (sale BĐS) | Nhu cầu, Ngân sách và phương án vay, Băn khoăn của khách, Căn đang quan tâm, Cam kết hai bên, Bước tiếp theo | Khách còn băn khoăn gì? Soạn tin nhắn Zalo cảm ơn. Lần gặp tới cần chuẩn bị gì? |
| **Họp thiết kế và công trường** (KTS) | Yêu cầu thay đổi, Số đo và vật liệu được nhắc, Hạng mục tồn tại, Việc theo từng bên (chủ nhà, thiết kế, thi công) | Chủ nhà đổi ý những gì so với lần trước? Liệt kê số đo. Soạn biên bản hiện trường |
| **Phiên công chứng** (công chứng viên) | Các bên tham gia, Loại giao dịch, Giấy tờ đã xuất trình, Giấy tờ còn thiếu, Nội dung đã giải thích cho các bên, Lịch hẹn | Còn thiếu giấy tờ gì? Tôi đã giải thích những quyền và nghĩa vụ nào? Soạn tin nhắc lịch hẹn |

Mẫu "Buổi khám" có thêm một dòng cố định cuối tab Tóm tắt: "Noteim chỉ ghi lại lời đã nói. Không phải chẩn đoán hay tư vấn y khoa."
