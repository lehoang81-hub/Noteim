# 12. Góp ý vòng 1 — nhận xét và phương án

Ngày 2026-11-19. Góp ý đến từ người dùng thử sản phẩm (nhóm người đi làm: luật sư, bác sĩ, môi giới, kiến trúc sư). Nguyên tắc duyệt của chủ sản phẩm: **ưu tiên cao, làm mockup bấm được ngay, song song với B0/B1**. Cả sáu ý triển khai trong issue #75, nhánh `gy/01-gop-y-vong-1`.

## A. Nhận xét và phương án từng ý

### 1. Ưu tiên cao cho người đi làm — mockup được ngay, song song B0/B1

**Nhận xét.** Đúng nhóm khách hàng chính. Mockup là thứ người đi làm duyệt được trong 10 phút giữa hai cuộc họp; chờ B0 (đo ASR) hay B1 (nối dữ liệu thật) xong mới làm là mất nhịp duyệt giao diện.

**Phương án.** Sáu ý làm trên một nhánh mockup riêng, đúng luật `AGENTS.md` (dữ liệu qua `lib/data` bản giả, không gọi API thật). Riêng ý 6 chạm bộ đo B0 nhưng chỉ **thêm** file thử mới, không đổi kịch bản hiện có — hai PR không cản nhau.

### 2. Ghi chú nhanh một dòng khi đang ghi; marker làm khung tóm tắt

**Nhận xét.** Màn ghi từ M2-02 đã có ô ghi chú một dòng (mỗi lần xuống dòng thành một ghi chú gắn mốc), nhưng **điểm nóng và ghi chú không nối nhau**: điểm nóng chỉ là cờ màu (5 nhãn ngữ nghĩa), không chứa nội dung. Tóm tắt buổi mới sinh theo phần đang bật của mẫu, không nhìn thấy điểm nóng nào. Góp ý chạm đúng chỗ hở này.

**Phương án.**
- Mỗi điểm nóng trong danh sách feed thêm ô gõ nhanh một dòng: bấm "+ Ghi chú điểm này" hiện ô nhập, Enter lưu, bấm vào chữ để sửa. Ghi chú nằm ngay dưới cờ, cùng mốc giây.
- Dữ liệu: `RecordingBookmark` và `BookmarkData` thêm trường `note` (chuỗi một dòng, rỗng là chưa có).
- Tóm tắt buổi mới (`lib/data/mock/generate.ts`): mỗi điểm nóng chèn một ý tại đúng mốc của nó vào chủ đề chứa mốc đó; chủ đề mang nhãn màu của điểm nóng; chữ ghi chú cũng thành "ghi chú tay" gắn vào ý (note_ids) như ghi chú thường. Buổi không có điểm nóng thì tóm tắt giữ nguyên như cũ — không làm hỏng luồng cũ.

### 3. Thư mục theo hồ sơ + Hỏi AI trên cả thư mục

**Nhận xét.** Đặc tả gói Pro (docs/03 mục 13) đã hứa "Hỏi AI không giới hạn, hỏi xuyên mọi buổi ghi" nhưng chưa có màn hình nào làm điều đó — tab Hỏi AI của buổi hiện chỉ trả câu cố định. Đây là khác biệt lớn nhất so với chatbot thông thường (chatbot không biết dữ liệu riêng của từng hồ sơ), là lý do chính khách trả tiền. Góp ý còn chỉ đúng danh mục: mỗi nghề một cách gọi hồ sơ.

**Phương án.**
- Thực thể mới `Folder`: `kind` một trong `legal_case` (Vụ việc — luật sư), `patient` (Bệnh nhân — bác sĩ), `client` (Khách hàng — môi giới), `project` (Công trình — kiến trúc sư); `name`, `ref` (số hồ sơ / mã bệnh nhân / mã bất động sản / mã công trình), `session_ids`.
- Nhãn kind hiển thị theo nghề đang dùng (không gian Cá nhân theo nghề của người dùng, không gian Nhóm theo nghề của nhóm).
- Thư viện thêm dải chuyển "Buổi ghi / Hồ sơ"; chọn Hồ sơ hiện danh sách thư mục + nút tạo mới (đặt tên, chọn loại, thêm buổi sau).
- Trang mới `/f/[id]` trong nhóm thư viện (điện thoại cả màn hình, máy tính chiếm cột phải như chi tiết buổi): đầu trang là tên + loại + mã + số buổi + tổng thời lượng; hai tab "Buổi ghi" và "Hỏi AI".
- Hỏi AI của thư mục (Pro): ô hỏi + câu gợi ý; bản giả ghép câu trả lời từ ý tóm tắt, việc cần làm và ghi chú của các buổi trong thư mục, xếp theo mức khớp câu hỏi; mỗi dẫn chứng là **tên buổi + mốc giây**, bấm nhảy thẳng tới buổi đó đúng mốc (`/s/[id]?t=giây&tab=transcript`). Free thấy chip khóa + lời mời nâng cấp.
- Dữ liệu mẫu: bốn thư mục gắn sẵn buổi fixture có sẵn để duyệt ngay.

### 4. Lưu biên nhận đồng ý ghi âm vào từng buổi

**Nhận xét.** Bảng xin đồng ý hiện chỉ lưu hai cờ (`confirmed`, `announced`) — đủ để chạy luồng nhưng không phải biên nhận. Với Luật bảo vệ dữ liệu cá nhân, cần trả lời được ba câu: **ai** đồng ý, **lúc nào**, **cách nào**. Đây là giá trị pháp lý thật của sản phẩm, nên mockup phải thể hiện đúng hình thức "biên nhận".

**Phương án.**
- Kiểu mới `ConsentReceipt`: `who` (danh sách tên người đã đồng ý), `at` (thời điểm bấm đồng ý), `method` (`button` — bấm nút "Đã đồng ý, ghi", hoặc `auto` — hết 3 giây tự xác nhận), `announcement_text` (câu thông báo đã phát trong buổi, nếu có).
- Bảng đồng ý thêm một ô nhập nhanh tên người đồng ý (tách bằng dấu phẩy, không bắt buộc); ô này không phá nhịp tự đóng 3 giây — gõ chữ là hẹn giờ chạy lại như bấm chip ngôn ngữ.
- Lưu vào `Session.consent.receipts`; dữ liệu cũ thiếu tự về `[]`.
- Chi tiết buổi: dưới dòng thông tin meta hiện dòng biên nhận gọn ("Đồng ý ghi âm: Anh Nam, Chị Lan · 14:05 · bấm nút"), bấm mở bảng xem đầy đủ (ai, lúc nào, cách nào, câu thông báo đã phát). Buổi mẫu trong fixture có sẵn biên nhận để duyệt ngay.

### 5. Mẫu bác sĩ chuẩn SOAP

**Nhận xét.** SOAP (Subjective — Objective — Assessment — Plan) là khung hồ sơ bệnh án chuẩn quốc tế; bác sĩ quen chốt theo đúng bốn mục này hơn là năm mục "Buổi khám" hiện có. Hai mẫu song song cho hai cách làm việc: buổi khám thường nói chuyện tự nhiên, SOAP cho bác sĩ muốn ghi hồ sơ chuẩn.

**Phương án.** Thêm mẫu `tpl-doctor-soap` "Khám theo SOAP" với bốn phần S/O/A/P (đủ vi/en/ko), nội dung sinh mẫu thêm bốn mục SOAP vào fixture nghề doctor, `footer_note` riêng của mẫu. Bật tắt từng phần, đổi thứ tự dùng lại cơ chế sẵn của mẫu (M4-03). Mẫu mới hiện ở mọi chỗ mẫu cũ hiện: bảng chọn khi ghi, cài đặt, đổi mẫu và tóm tắt lại, nhóm.

### 6. Thêm file thử nói lẫn Việt–Anh kiểu dân văn phòng vào bộ đo B0

**Nhận xét.** Ba file hiện có là thuần tiếng Việt (bất động sản), Việt–Hàn (họp đối tác) và bệnh sĩ nói chậm — chưa có kiểu **pha tiếng Anh trong câu tiếng Việt** ("em check lại KPI phase 2", "đ gửi cho tôi cái report nhé"), vốn là kiểu nói phổ biến nhất của dân văn phòng và khó nhất cho nhận dạng giọng nói.

**Phương án.** Sinh file `05-vi-en-pha-le.ogg` khoảng 2 phút bằng edge-tts: giọng vi-VN đọc câu Việt pha từ/cụm Anh, các cụm Anh đọc bằng giọng en-US rồi ghép nối, đúng kiểu nói lẫn thật. Thêm mục mới vào `docs/10-b0-thu-rui-ro.md` (file thứ năm, cách sinh, cách chạy), thêm vào cấu hình đo, chạy Soniox lưu kết quả thô vào `test-data/asr-results/soniox/`. Không đổi bảng kết quả trong `docs/11` (PR #74 đang chạm file đó; ghép số liệu sau khi #74 gộp).

## B. Sáng kiến bổ sung (ngoài sáu ý)

1. **Dẫn chứng của Hỏi AI thư mục nhảy được, không chỉ hiện số.** Mỗi chip dẫn chứng mang tên buổi + mốc giây, bấm là tới đúng giây trong buổi đó — nếu chỉ hiện "12:34" như tab Hỏi AI của buổi thì người dùng phải tự tìm lại buổi.
2. **Biên nhận đồng ý ghi cả câu thông báo đã phát.** Ba dữ kiện ai/lúc nào/cách nào + câu nói phát trong buổi là đủ bộ hồ sơ pháp lý tối thiểu, chuẩn bị sạch cho B1 nối database.
3. **Thư mục đếm sẵn việc còn mở của các buổi con.** Hàng thư mục hiện số việc cần làm chưa xong (gom từ các buổi), giúp người đi làm chọn đúng hồ sơ cần xử trước khi mở AI hỏi.

## C. Rủi ro và cách tránh

- **PR #74 đang mở**, chạm `docs/11-b0-ket-qua.md`, `docs/LOG.md`, `scripts/b0-asr/providers`, `test-data/asr-results`. Nhánh này chỉ **thêm mục mới** vào `docs/10` và `docs/LOG.md`, không đụng các file còn lại. Đề xuất gộp #74 trước PR này thì LOG không xung đột.
- **Dữ liệu localStorage cũ**: mọi trường mới đều `.catch()` về giá trị mặc định khi nạp, không cần chuyển dữ liệu tay.
- **Nhãn IN HOA và `dark:`**: `pnpm lint` chặn cả hai — chuỗi mới viết thường có dấu, màu dùng token sẵn.
