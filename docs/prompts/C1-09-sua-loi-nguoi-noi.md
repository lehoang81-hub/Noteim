# C1-09: Sửa lời, sửa người nói, tóm tắt lại, mẹo ghi âm

Đọc AGENTS.md trước. Nhánh mới từ `main` (sau khi #98 đã merge). Một PR, chia commit theo mục.

## Bối cảnh (đã kiểm trên production)

- Hoang ghi một buổi 3 người nói, Soniox chỉ tách ra 2 (`SPK_01` 9 đoạn, `SPK_02` 12 đoạn). Lời có vài chỗ nhận sai.
- Code đã có `updateSegment` và `reassignSegment` (lib/data/server/sessions.ts, transcript-tab.tsx). Nhưng trên điện thoại, menu đoạn lời chỉ mở bằng **nhấn giữ 500 ms**. Nút ⋯ có class `hidden lg:flex`, nên người dùng không tìm ra chỗ sửa.
- Sheet "Đổi người nói" chỉ cho chọn trong số người nói đã có. Không thêm được người thứ 3.
- Sửa lời xong, tóm tắt và việc cần làm vẫn giữ theo bản cũ.
- API Soniox hiện tại (stt-async-v6) chỉ có `enable_speaker_diarization`, **không có tham số số người nói**. Vì vậy KHÔNG làm ô "chọn số người nói" và KHÔNG gửi danh sách từ khóa cho Soniox. Giữ nhận dạng tự động.

## Việc cần làm

### 1. Lối vào sửa thấy được trên điện thoại
- Hiện nút ⋯ ở mỗi đoạn lời trên mọi màn hình (bỏ `hidden lg:flex`), vùng chạm tối thiểu 44×44. Vẫn giữ nhấn giữ.
- Lần đầu mở tab Lời của buổi thật: hiện một dòng gợi ý đóng được, ví dụ: "Lời hoặc người nói chưa đúng? Bấm ⋯ ở đoạn đó để sửa." Ẩn vĩnh viễn sau khi đóng (lưu theo tài khoản hoặc localStorage có try/catch).
- Thứ tự trong menu: **Sửa lời**, **Đổi người nói**, rồi các mục cũ.

### 2. Thêm người nói mới khi đổi người nói
- Cuối sheet "Đổi người nói" thêm dòng **"+ Người nói mới"**.
- Bấm vào thì tạo người nói mới trong `session_details.speakers`: id mới, `color_index` kế tiếp chưa dùng, chưa có tên (hiện "Người nói 3"…), rồi gán đoạn đang chọn cho người đó. Một thao tác, chạy phía máy chủ (action mới `addSpeakerAndReassign`, kiểm quyền như các action khác).
- Sau khi đổi, sheet hỏi thêm một lần, không bắt buộc: "Đổi luôn N đoạn liền sau của cùng người nói?" Chỉ áp dụng cho các đoạn **liền kề** cùng `speaker_id` cũ.
- Sau mỗi lần đổi người nói, máy chủ tính lại `speaker_spans` và `talk_ratio_percent` của từng người nói từ các đoạn lời. Thanh màu người nói, tỉ lệ nói ở tab Hình và dòng "Bạn • Người nói 2 • Người nói 3" ở đầu buổi phải cập nhật.
- Người nói không còn đoạn nào thì ẩn khỏi danh sách đầu buổi và khỏi tỉ lệ nói (không xóa dữ liệu).
- Chip "Có N người nói chưa có tên. Đặt tên" vẫn đúng với người nói mới.

### 3. Sửa lời
- Kiểm lại `updateSegment` chạy với buổi ghi thật (chế độ tài khoản, dữ liệu từ Soniox), cả Bản gọn lẫn Nguyên văn. Sửa xong tải lại trang vẫn còn.
- Ô sửa dùng cùng cách chống nhảy con trỏ như SearchField (#98): ô tự quản giá trị, có composition guard. Thử Telex.

### 4. Tóm tắt lại sau khi sửa
- Buổi có sửa lời hoặc đổi người nói sau lần tóm tắt gần nhất thì tab Tóm tắt và tab Việc hiện băng thông báo: "Bạn đã sửa lời. Tóm tắt lại để cập nhật tóm tắt và việc cần làm." Kèm nút **Tóm tắt lại**.
- Máy chủ: action `resummarize` dùng lại `summarize.ts` trên bản lời hiện tại (đã sửa, đúng người nói). Ghi đè tóm tắt và việc cần làm. Giữ các việc người dùng đã tick xong hoặc tự thêm. Mọi bản dịch tóm tắt chuyển `stale: true`.
- Chạy theo luồng `asr_stage` sẵn có (đặt `summarizing` để màn xử lý và ProcessingWatcher tự đẩy). Nhớ `maxDuration 60`.
- Hạn mức: Free tối đa 3 lần tóm tắt lại mỗi buổi, đếm phía máy chủ, chặn TRƯỚC khi gọi Gemini, lỗi không trừ lượt. Pro không giới hạn. Hết lượt thì hiện đúng thông báo, không hiện như lỗi máy.
- Nhật ký chỉ ghi id, độ trễ, mã lỗi; không ghi nội dung lời.

### 5. Trang "Mẹo ghi âm và câu hỏi thường gặp"
- Thêm mục trong Cài đặt, trang `/help` (vi/en/ko qua next-intl). Nội dung ngắn, dễ đọc trên điện thoại:
  - Đặt máy giữa bàn, gần người nói. Tránh quạt, điều hòa thổi thẳng vào máy.
  - Mỗi người nói lần lượt, không nói chen. Có khoảng nghỉ ngắn khi đổi người.
  - Buổi rất ngắn hoặc giọng giống nhau thì app có thể gộp hai người thành một.
  - Nhận sai người nói: bấm ⋯ ở đoạn lời → Đổi người nói → chọn hoặc thêm người nói mới.
  - Nhận sai chữ: bấm ⋯ → Sửa lời. Sửa xong bấm Tóm tắt lại.
  - Bản dịch đã có thì xem lại không tốn lượt. Chỉ dịch lại khi bản gốc đã sửa.
- Dòng gợi ý ở mục 1 có link "Xem mẹo" tới trang này.

## Kiểm thử bắt buộc

- lint (0 lỗi), typecheck, i18n:check, db:test, build.
- e2e mới `tests/e2e/c1-edit-speaker.spec.ts`, chạy cả project phone và desktop:
  - Nút ⋯ thấy được trên phone, menu có Sửa lời và Đổi người nói.
  - Thêm người nói mới: đoạn chuyển sang "Người nói 3", đầu buổi hiện 3 người, tỉ lệ nói đổi, tải lại trang vẫn đúng.
  - Đổi các đoạn liền sau: chỉ đổi đoạn liền kề.
  - Sửa lời rồi tải lại trang vẫn còn; gõ IME không đảo chữ.
  - Hiện băng "Tóm tắt lại" sau khi sửa → bấm → tóm tắt mới (GEMINI_FAKE), bản dịch thành lỗi thời, việc đã tick vẫn giữ.
  - Free: lần thứ 4 bị 429 trước khi gọi AI; lỗi giả không trừ lượt.
  - Quyền: người khác 403, chưa đăng nhập 401.
  - Trang /help mở được bằng cả 3 ngôn ngữ.
- Chạy lại các spec cũ: c1-asr, c1-chat-ai, c1-translate, c1-ime, gc-session-detail.
- Ghi docs/LOG.md: đã làm, đã kiểm, CHƯA kiểm (Telex máy thật, Gemini thật).
