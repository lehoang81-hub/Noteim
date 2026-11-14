# 02. Hệ thống thiết kế

## Ý tưởng chủ đạo: giọng nói là ánh sáng có màu

Người dùng Noteim là dân chuyên nghiệp ăn mặc chỉn chu. Giao diện phải giống một món phụ kiện tốt: nền tĩnh, đường nét gọn, và **đúng một điểm nhấn rực rỡ**.

Điểm nhấn đó là **Dải giọng**: sóng âm vẽ thành một dải lụa chuyển động, mỗi người nói một màu. Dải giọng xuất hiện ở ba nơi và chỉ ba nơi:

1. Màn hình ghi âm, chạy theo tiếng nói thật.
2. Trình phát trong chi tiết buổi ghi, bấm vào để tua.
3. Thu nhỏ trên mỗi thẻ buổi ghi trong thư viện, như dấu vân tay của buổi đó.

Mọi thứ còn lại giữ yên tĩnh: nền phẳng, không gradient trang trí, không bóng đổ dày, không hiệu ứng tự chạy.

### Bốn điều cấm

- Không dùng gradient ở bất kỳ đâu ngoài nút ghi âm, dải giọng và logo.
- Không chia nội dung thành các thẻ bo tròn giống hệt nhau xếp lưới. Danh sách là danh sách, có đường kẻ mảnh, không phải chồng thẻ.
- Không viết hoa toàn bộ nhãn. Không nối thông tin phụ bằng dấu chấm giữa. Không gắn mũi tên vào chữ trên nút.
- Không dùng phông đơn cách (monospace) cho số và mốc thời gian.

## Màu

Tên màu lấy từ chất liệu Việt để cả nhóm dễ gọi. Mọi cặp chữ và nền dưới đây đã kiểm tra đạt tỷ lệ tương phản từ 4,5:1 trở lên.

### Nền và chữ

| Token | Sáng | Tối | Dùng cho |
| --- | --- | --- | --- |
| `--bg` | `#F6F7FB` Sứ | `#0D0F2B` Chàm đêm | Nền trang |
| `--surface` | `#FFFFFF` | `#171A40` | Bảng trượt, thanh điều hướng, ô nhập |
| `--surface-2` | `#ECEEF6` | `#20244F` | Vùng chìm, nền chip, hàng đang chọn |
| `--line` | `#DDE0EE` | `#2C3063` | Đường kẻ, viền |
| `--ink` | `#16193B` Chàm | `#F2F3FB` | Chữ chính |
| `--ink-2` | `#4A4E72` | `#B5B8D6` | Chữ phụ |
| `--ink-3` | `#666A8E` | `#8E92B8` | Chú thích, mốc thời gian |

Nền sáng là trắng sứ ngả lạnh, không phải màu kem. Nền tối là chàm đậm, không phải đen.

### Màu hành động

| Token | Sáng | Tối | Dùng cho |
| --- | --- | --- | --- |
| `--sen` | `#D81F5F` Sen | `#FF6B97` | Nút chính, ghi âm, liên kết quan trọng |
| `--sen-text` | `#C2185B` | `#FF6B97` | Chữ màu sen trên nền |
| `--on-sen` | `#FFFFFF` | `#0D0F2B` | Chữ trên nền sen |
| `--dien` | `#5B3DF5` Điện | `#A594FF` | Mọi thứ do AI tạo ra: câu trả lời, gợi ý, nút "Hỏi AI" |
| `--dien-tint` | `#ECE8FF` | `#241F5C` | Nền khối nội dung AI |

Quy ước: **sen là việc người dùng làm, điện là việc AI làm.** Người dùng nhìn màu là biết nội dung nào do máy viết.

### Dải màu "Hừng đông"

`linear-gradient(100deg, #FF8A4C 0%, #E6336E 45%, #6B4EFF 100%)`

Chỉ dùng cho: nút ghi âm, quầng sáng dải giọng khi đang ghi, logo. Không dùng làm nền, không dùng cho chữ tiêu đề.

### Nhãn ngữ nghĩa

Mỗi nhãn luôn đi kèm biểu tượng và chữ, không bao giờ chỉ dựa vào màu.

| Nhãn | Biểu tượng | Chữ (sáng) | Nền nhạt (sáng) | Chữ (tối) |
| --- | --- | --- | --- | --- |
| Đã chốt | dấu tích | `#08715C` Ngọc | `#E1F5F0` | `#3FD9B8` |
| Còn treo | đồng hồ cát | `#9A6200` Hổ phách | `#FCF1DA` | `#FFC457` |
| Rủi ro | tam giác cảnh báo | `#C2371F` Son | `#FCE7E2` | `#FF8A70` |
| Ý hay | tia sáng | `#5B3DF5` Điện | `#ECE8FF` | `#A594FF` |
| Số liệu | cột biểu đồ | `#1F62D0` Lam | `#E3EDFD` | `#7FB0FF` |

Ở giao diện tối, nền nhạt của nhãn là chính màu chữ với độ mờ 16%.

### Màu người nói

Sáu màu, gán theo thứ tự xuất hiện: `#6B4EFF`, `#E6336E`, `#0FA98A`, `#F08A24`, `#2F7BF6`, `#B14FD8`. Từ người thứ bảy quay vòng lại, thêm họa tiết gạch chéo.

Màu người nói chỉ dùng cho: dải giọng, chấm tròn trước tên, vạch dọc bên trái đoạn lời. Không dùng làm màu chữ.

## Chữ

| Vai trò | Phông | Ghi chú |
| --- | --- | --- |
| Tiêu đề, con số lớn | **Bricolage Grotesque** (600, 700) | Có cá tính, hơi thời trang. Dùng tiết chế. |
| Mọi thứ còn lại | **Be Vietnam Pro** (400, 500, 600) | Thiết kế riêng cho tiếng Việt, dấu rõ |

Tải bằng `next/font/google`, khai báo subset `vietnamese`.

**Việc phải làm ở M0:** hiển thị chuỗi thử `Đặng Thị Quỳnh Ngữ, Nguyễn Hữu Phước: thỏa thuận chuyển nhượng 12,5 tỷ` bằng cả hai phông trên trang `/styleguide`. Nếu Bricolage Grotesque hiển thị dấu sai hoặc xô lệch, dùng Be Vietnam Pro 700 cho tiêu đề và báo trong PR.

### Thang cỡ chữ (điện thoại)

| Token | Cỡ / dòng | Phông, độ đậm | Dùng cho |
| --- | --- | --- | --- |
| `display` | 32 / 40 | Bricolage 700 | Lời chào, số đồng hồ ghi âm |
| `h1` | 24 / 32 | Bricolage 600 | Tiêu đề buổi ghi |
| `h2` | 19 / 26 | Be Vietnam 600 | Tiêu đề chủ đề, tiêu đề bảng trượt |
| `body` | 16 / 25 | Be Vietnam 400 | Nội dung |
| `body-strong` | 16 / 25 | Be Vietnam 600 | Tên người, nhấn mạnh |
| `small` | 14 / 21 | Be Vietnam 400 | Thông tin phụ |
| `caption` | 12 / 17 | Be Vietnam 500 | Mốc thời gian, nhãn |

Máy tính: `display` 44/52, `h1` 30/38, còn lại giữ nguyên.

Lưu ý tiếng Việt: chiều cao dòng không dưới 1,3 lần cỡ chữ, vì dấu chồng (ề, ỗ, ặ) cần chỗ. Bề ngang đoạn văn tối đa 68 ký tự. Số trong danh sách và mốc thời gian dùng `font-variant-numeric: tabular-nums`.

## Khoảng cách, bo góc, độ nổi

**Khoảng cách:** bội số của 4. Thang dùng: 4, 8, 12, 16, 24, 32, 48, 64. Lề trang điện thoại 20, máy tính 32.

**Bo góc theo cấp bậc**, không dùng một giá trị cho mọi thứ:

| Token | Giá trị | Dùng cho |
| --- | --- | --- |
| `--r-control` | 10 | Nút, ô nhập |
| `--r-block` | 16 | Khối nội dung AI, ảnh, thẻ trích dẫn |
| `--r-sheet` | 28 | Bảng trượt từ dưới lên (chỉ hai góc trên) |
| `--r-pill` | 999 | Chip, nhãn, nút ghi âm |

**Độ nổi:** ưu tiên phân lớp bằng màu nền và đường kẻ. Chỉ có hai kiểu bóng, pha màu chàm chứ không xám:

- `--shadow-float`: `0 8px 24px rgba(22, 25, 59, 0.10)` cho trình phát nổi và bảng trượt.
- `--shadow-record`: `0 10px 30px rgba(230, 51, 110, 0.35)` chỉ cho nút ghi âm.

Giao diện tối không dùng bóng, dùng viền `--line`.

## Chuyển động

### Token

| Token | Giá trị | Dùng cho |
| --- | --- | --- |
| `--t-quick` | 120ms | Đổi màu khi nhấn, bật tắt |
| `--t-base` | 220ms | Mở chip, đổi tab, hiện thông báo |
| `--t-sheet` | 340ms | Bảng trượt, chuyển trang |
| `--t-scene` | 700ms | Ba khoảnh khắc đặc trưng bên dưới |
| `--ease` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Mặc định |

### Ba khoảnh khắc đặc trưng

Đây là toàn bộ ngân sách "hiệu ứng" của sản phẩm. Làm thật kỹ ba chỗ này, những chỗ khác giữ đơn giản.

1. **Bắt đầu ghi.** Nút ghi âm tròn nở ra và duỗi thành dải giọng chạy ngang màn hình. Nền chuyển sang chàm đêm (kể cả khi đang ở giao diện sáng): phòng họp tối lại, chỉ còn giọng nói phát sáng.
2. **Kết thúc ghi.** Dải giọng co lại, gấp thành thẻ buổi ghi và rơi vào đầu thư viện.
3. **Xử lý xong.** Dải giọng đang một màu trung tính được "nhuộm" lần lượt theo màu từng người nói, từ trái sang phải, rồi các ý tóm tắt hiện ra theo thứ tự thời gian.

### Quy tắc

- Chuyển động khác chỉ để trả lời một thao tác: nhấn, mở, đóng, kéo. Không có phần tử nào tự trượt vào khi cuộn trang.
- Nút khi nhấn: thu nhỏ còn 97%, thời lượng `--t-quick`.
- Đánh dấu điểm nóng khi đang ghi: một gợn sóng nhỏ tại vị trí hiện tại trên dải giọng, kèm rung nhẹ (`navigator.vibrate(10)` nếu thiết bị hỗ trợ).
- `prefers-reduced-motion`: ba khoảnh khắc đặc trưng đổi thành mờ dần 220ms, dải giọng sống đổi thành các cột tĩnh cập nhật mỗi giây.
- Dùng thư viện Motion cho ba khoảnh khắc đặc trưng và bảng trượt. Còn lại dùng CSS transition.

## Dải giọng: đặc tả

- Vẽ bằng `<canvas>`, dữ liệu là mảng `peaks` (số từ 0 đến 1) và mảng `speakerSpans` (đoạn thời gian của từng người).
- Hình dạng: các cột bo tròn hai đầu, rộng 3, cách 2, đối xứng qua trục giữa. Không vẽ đường nối liền.
- **Khi đang ghi:** cột mới xuất hiện ở mép phải và trôi sang trái. Màu trắng, có quầng sáng Hừng đông phía sau với độ mờ theo âm lượng. Cao 160 trên điện thoại.
- **Khi phát lại:** phần đã phát tô màu người nói, phần chưa phát cùng màu với độ mờ 35%. Kéo ngang để tua. Chấm đánh dấu nằm phía trên, ảnh chụp nằm phía dưới. Cao 72.
- **Thu nhỏ trên thẻ:** 40 cột, cao 28, tô màu người nói, không tương tác.
- Dải nhiệt bên dưới trình phát (cao 4): màu nhãn ngữ nghĩa của chủ đề tại thời điểm đó.

## Component

Xây trên shadcn/ui, đổi kiểu theo token ở trên. Danh sách bắt buộc, mỗi cái phải có mặt trên trang `/styleguide` với đủ trạng thái:

| Component | Biến thể và trạng thái |
| --- | --- |
| Nút | chính (sen), phụ (viền), chữ, AI (điện), nguy hiểm; mặc định, nhấn, đang tải, vô hiệu |
| Nút ghi âm | nghỉ, đang ghi, tạm dừng; đường kính 72 trên thanh điều hướng, 88 trên màn hình ghi |
| Chip nhãn ngữ nghĩa | 5 loại ở bảng trên |
| Chip lọc | chọn, chưa chọn |
| Chấm người nói + tên | 6 màu; chưa đặt tên ("Người nói 2") và đã đặt tên |
| Hàng buổi ghi | bình thường, đang xử lý, lỗi, đã dọn bản gốc, chưa tải lên |
| Ý tóm tắt | có mốc thời gian bấm được; đang phát thì có vạch sen bên trái |
| Hàng việc cần làm | chưa xong, đã xong, quá hạn; có người phụ trách hoặc chưa |
| Khối AI | nền `--dien-tint`, biểu tượng tia sáng; đang viết (chữ chạy), xong, lỗi |
| Trình phát nổi | thu gọn (một hàng), mở rộng (có dải giọng) |
| Bảng trượt | nửa màn hình, toàn màn hình; có tay nắm kéo |
| Thông báo nhanh | thành công, lỗi, có nút hoàn tác |
| Dải báo trạng thái | mất mạng, sắp hết hạn mức, bản ghi sắp bị xóa |
| Trạng thái rỗng | hình vẽ nét đơn + một câu + một nút |
| Khung chờ tải | hàng, đoạn văn, dải giọng |
| Ô nhập, ô tìm kiếm, công tắc, thanh tab, hộp xác nhận | theo shadcn/ui |

Vùng chạm tối thiểu 44 x 44. Mọi phần tử tương tác có viền lấy nét nhìn rõ khi dùng bàn phím: 2px màu `--dien`, cách 2px.

Biểu tượng: bộ Lucide, nét 1,75, cỡ 20 (trong dòng) và 24 (điều hướng).

## Bố cục

**Điện thoại (dưới 768px):**

```
┌──────────────────────────┐
│ Tiêu đề trang        ⌕ ⚙ │
├──────────────────────────┤
│                          │
│ Nội dung cuộn dọc        │
│ căn trái, lề 20          │
│                          │
├──────────────────────────┤
│ ▶ Trình phát nổi (nếu có)│
├──────────────────────────┤
│ Thư viện   ( ● )   Việc  │
└──────────────────────────┘
```

Thanh điều hướng dưới có đúng ba mục: Thư viện, nút ghi âm ở giữa (nhô lên trên thanh), Việc cần làm. Tìm kiếm và Cài đặt nằm ở góc trên phải.

**Máy tính (từ 1024px):**

```
┌────────┬───────────────┬─────────────────────────────┐
│ Logo   │ Thư viện      │ Chi tiết buổi ghi           │
│        │ ⌕ Tìm         │                             │
│ Thư    │ ───────────── │ Tóm tắt | Việc | Lời | ...  │
│ viện   │ Buổi ghi 1    │                             │
│ Việc   │ Buổi ghi 2    │ Nội dung, bề ngang tối đa   │
│ Cài đặt│ Buổi ghi 3    │ 720                         │
│        │               │                             │
│ ( ● )  │               ├─────────────────────────────┤
│ Ghi âm │               │ Trình phát + dải giọng      │
└────────┴───────────────┴─────────────────────────────┘
   88           360                  còn lại
```

Từ 768 đến 1023px: ẩn cột danh sách, hiện lại bằng nút quay lại.

Nội dung luôn căn trái. Chỉ căn giữa ở màn hình ghi âm, làm quen lần đầu và trạng thái rỗng.

## Giọng văn

- Xưng hô: Noteim gọi người dùng là "bạn", không tự xưng. Không dùng "chúng tôi", "mình", "em".
- Câu ngắn, động từ đứng trước. Viết hoa chữ đầu câu, không viết hoa từng chữ.
- Tên nút nói đúng việc sẽ xảy ra, và giữ nguyên tên đó suốt luồng: nút "Gửi biên bản" thì thông báo sau đó là "Đã gửi biên bản".
- Lỗi nói rõ chuyện gì xảy ra và làm gì tiếp. Không xin lỗi, không cảm thán.
- Không dùng từ kỹ thuật với người dùng: không "transcript", "RAG", "token", "sync". Dùng "bản ghi lời", "hỏi AI", "hạn mức", "đồng bộ" chỉ khi thật cần.

| Tình huống | Viết | Không viết |
| --- | --- | --- |
| Thư viện rỗng | Chưa có buổi ghi nào. Bấm nút tròn bên dưới để ghi buổi đầu tiên. | Oops! Có vẻ bạn chưa có gì ở đây |
| Mất mạng khi ghi | Mất mạng. Vẫn đang ghi và lưu trên máy này. | Lỗi kết nối. Vui lòng thử lại sau. |
| Xử lý lỗi | Chưa tóm tắt được buổi ghi này. Bản ghi âm vẫn an toàn. | Đã xảy ra lỗi không xác định |
| Nút sau khi xem trước email | Gửi cho 4 người | Xác nhận |
| Hết hạn mức | Bạn đã dùng hết 180 phút tháng này. Hạn mức mới có từ ngày 1/12. | Bạn đã đạt giới hạn! Nâng cấp ngay! |

Thuật ngữ thống nhất: buổi ghi, bản ghi lời, tóm tắt, việc cần làm, người nói, điểm nóng, đoạn tinh túy, thẻ trích dẫn, mẫu, hạn mức, dọn bản gốc.
