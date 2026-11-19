# 10. Chặng B0: thử hai rủi ro lớn trước khi làm phần chạy thật

B0 không làm tính năng mới cho người dùng. B0 trả lời hai câu hỏi bằng số liệu, để chọn công nghệ cho B1 đến B6 (`06-roadmap.md`):

1. **AI nhận dạng giọng nói tiếng Việt nào dùng được cho Noteim**, với giá bao nhiêu mỗi giờ.
2. **Điện thoại, nhất là iPhone, ghi âm và nghe buổi dài qua trình duyệt có ổn không**, hay phải làm app điện thoại.

Kết quả ghi vào `docs/11-b0-ket-qua.md` (agent tạo) và quyết định ghi vào `DECISIONS.md`.

---

## Phần A. So sánh AI nhận dạng giọng nói (issue B0-01)

### Nhà cung cấp đưa vào thử

| Mã | Nhà cung cấp, mô hình | Vì sao thử | Khóa cần có |
| --- | --- | --- | --- |
| `soniox` | Soniox, mô hình async mới nhất | Giá công bố thấp nhất, tự nhận dạng chuyển ngôn ngữ giữa câu, có tách người nói | `SONIOX_API_KEY` |
| `elevenlabs` | ElevenLabs Scribe (bản batch mới nhất) | Có tách người nói, Hoang đã có tài khoản | `ELEVENLABS_API_KEY` |
| `google` | Google Speech-to-Text V2, mô hình `chirp_3`, `vi-VN` | Hãng lớn, tiếng Việt GA; cần kiểm tách người nói có hỗ trợ `vi-VN` không | Tài khoản dịch vụ Google Cloud (file JSON) |
| `fpt` (tùy chọn) | FPT.AI Speech to Text | Nhà cung cấp trong nước | `FPT_STT_KEY` |

Bảng so sánh trên trang các hãng là do chính hãng tự đo; Noteim phải tự đo trên âm thanh của mình. Giá ghi theo bảng giá công khai lúc thử, ghi rõ ngày xem.

### Dữ liệu thử

- `test-data/audio/01`, `02`, `03` (giọng AI, có đáp án `truth.json`): dùng để chạy đường ống và so sơ bộ.
- `test-data/human/` (Hoang bổ sung, có thể chưa có khi bắt đầu): bản ghi người thật đọc theo kịch bản của 3 buổi trên, ghi bằng điện thoại. Đây mới là số để quyết định. Mỗi file kèm một dòng mô tả trong `test-data/human/README.md`: ai đọc, giọng vùng nào, ghi ở đâu, điện thoại gì, người đọc đã đồng ý.
- `04-dai-62-phut` (sinh bằng `scripts/gen-test-audio.py`): đo thời gian xử lý và giới hạn độ dài file của từng nhà cung cấp.

### Chỉ số đo (cho từng file, từng nhà cung cấp)

| Chỉ số | Cách tính |
| --- | --- |
| Tỷ lệ sai chữ (WER) | Tiếng Việt: đếm theo âm tiết cách nhau bằng khoảng trắng, **giữ dấu thanh**, bỏ dấu câu, chữ thường. Tiếng Hàn: theo ký tự (CER). Tiếng Anh: theo từ. Ghi riêng từng ngôn ngữ ở file 02 |
| Sai số liệu | Đếm riêng các số, số tiền, ngày, tên riêng trong đáp án bị nhận sai (chúng quan trọng hơn chữ thường) |
| Tách người nói | Tỷ lệ chữ gán đúng người nói sau khi ghép nhãn người nói của máy với đáp án theo cách khớp tốt nhất; số người nói máy đếm được so với thật |
| Nhận ngôn ngữ | File 02: tỷ lệ đoạn tiếng Hàn, tiếng Anh nhận đúng ngôn ngữ |
| Mốc thời gian | Độ lệch trung bình đầu đoạn so với đáp án (giây); có mốc từng chữ không |
| Tiếng đệm | Có giữ "à, ừ, ờ" không (cần cho Nguyên văn và bản đồ nghe) |
| Tốc độ | Thời gian xử lý so với độ dài âm thanh, đo cả file 62 phút |
| Giá | Đô la mỗi giờ âm thanh, đã gồm tách người nói và nhận đa ngôn ngữ nếu tính thêm |
| Giới hạn | Độ dài, dung lượng file tối đa; có xử lý theo luồng (vừa ghi vừa ra chữ) không; dữ liệu có bị dùng để huấn luyện không, máy chủ đặt ở đâu |

### Kết quả mong muốn

- Script `scripts/b0-asr/` chạy lại được: `run.mjs --provider soniox --file test-data/audio/01-bds-gap-chi-lan.m4a` gọi nhà cung cấp, lưu kết quả thô vào `test-data/asr-results/<provider>/<file>.json` (commit, để không phải gọi lại tốn tiền), và `score.mjs` tính bảng chỉ số từ kết quả thô và `truth.json`.
- Bảng tổng hợp trong `docs/11-b0-ket-qua.md`, tách riêng "giọng AI" và "người thật".
- Đề xuất một nhà cung cấp chính và một dự phòng, với lý do bằng số.

### Giới hạn chi phí

Toàn bộ phần A không quá 10 đô la tiền gọi API. Mỗi file chỉ gọi mỗi nhà cung cấp một lần (kết quả đã lưu thì dùng lại).

---

## Phần B. Ghi âm và nghe dài trên điện thoại (issue B0-02)

Agent không có iPhone. Agent làm trang thử, Hoang cầm điện thoại thật làm theo danh sách và gửi kết quả.

### Trang thử `/spike/ghi-am`

Trang riêng, không có trong thanh điều hướng, không ảnh hưởng app. Có:

- **Ghi âm thật** bằng `MediaRecorder`: chọn định dạng theo trình duyệt (`audio/mp4` trên Safari, `audio/webm;codecs=opus` nơi khác), ghi theo khúc 10 giây, mỗi khúc lưu ngay vào IndexedDB (mất mạng hay tắt trang vẫn còn các khúc đã ghi).
- **Giữ màn hình sáng** bằng Screen Wake Lock khi trình duyệt hỗ trợ; công tắc bật tắt để thử cả hai trường hợp.
- **Nhật ký sự kiện** có giờ: bắt đầu, mỗi khúc lưu (kích thước), `visibilitychange`, `pagehide`, `freeze`, `resume`, track micro `ended` hoặc `mute`, lỗi `MediaRecorder`, mất và lấy lại wake lock, cuộc gọi đến (nếu trình duyệt báo qua `mute`).
- **Khoảng trống:** sau khi dừng, so tổng thời lượng các khúc với thời gian thực đã trôi qua; báo các khoảng bị hụt (ví dụ "hụt 4 phút 10 giây lúc 14:32 khi khóa màn hình").
- **Nghe lại** bản vừa ghi (ghép các khúc) và nghe file mẫu `/audio/01-bds-gap-chi-lan.m4a` với Nghe sạch bật hoặc tắt; nhật ký ghi `AudioContext.state` mỗi khi đổi.
- **Xuất kết quả:** nút "Sao chép kết quả" (JSON gồm thiết bị, trình duyệt, nhật ký, khoảng trống) để Hoang dán gửi lại; nút "Tải bản ghi" để lấy file.

### Danh sách Hoang thử trên điện thoại thật

Thử trên iPhone (Safari) và nếu có, một máy Android (Chrome). Thêm vào màn hình chính (PWA) và mở từ đó cũng thử một lượt.

| Mã | Thử | Ghi lại |
| --- | --- | --- |
| G1 | Ghi 5 phút, để yên màn hình sáng | Có khoảng trống không |
| G2 | Ghi, khóa màn hình 5 phút, mở lại | Có ghi tiếp trong lúc khóa không, hụt bao lâu |
| G3 | Ghi, chuyển sang app khác (Zalo) 2 phút, quay lại | Hụt bao lâu |
| G4 | Ghi, có cuộc gọi đến (nhờ người gọi) | Sau cuộc gọi có ghi tiếp không |
| G5 | Ghi 60 phút liên tục, màn hình sáng, cắm sạc | Có dừng không, file nặng bao nhiêu, máy có nóng không |
| G6 | Ghi 10 phút, tắt Wi-Fi và 4G giữa chừng | Các khúc có còn đủ không |
| N1 | Nghe file mẫu, Nghe sạch tắt, khóa màn hình 2 phút | Còn tiếng không |
| N2 | Như N1 nhưng Nghe sạch bật | Còn tiếng không, `AudioContext.state` |
| N3 | Nghe, chuyển app khác rồi quay lại | Tiếp tục được không |

### Kết quả mong muốn

Bảng G1 đến N3 theo từng thiết bị trong `docs/11-b0-ket-qua.md`, và kết luận: web đủ dùng, web kèm hướng dẫn giữ màn hình sáng, hay cần bọc thành app điện thoại (Capacitor hoặc tương đương) cho phần ghi âm.

---

## Quyết định cuối B0 (Claude viết, Hoang duyệt)

- Nhà cung cấp nhận dạng chính và dự phòng, giá mỗi giờ, ảnh hưởng tới giá các gói.
- Ghi âm trên web hay cần app điện thoại; nếu cần app, thêm vào lộ trình trước B2.
- Những gì đổi trong `07-handover.md` và `04-data-contract.md` (ví dụ định dạng file ghi, độ dài khúc).

---

## Bổ sung từ góp ý vòng 1 (issue #75, ngày 2026-11-19): bộ thứ năm nói pha Việt, Anh

Người dùng góp ý: ba bộ hiện có chưa có kiểu nói lẫn Việt, Anh trong cùng một câu của dân văn phòng ("em check lại KPI phase 2"), vốn phổ biến nhất và khó nhất cho nhận dạng giọng nói. Thêm bộ thứ năm:

| Bộ | Nội dung | Cách sinh |
| --- | --- | --- |
| 05-vi-en-pha-le | 16 lượt thoại, hai người nói (trưởng nhóm và nhân viên), tiếng Việt pha từ và cụm tiếng Anh văn phòng: KPI phase 2, dashboard, merge, deadline, budget, Facebook Ads, Google Ads, breakdown, approve, feedback, report, format, vendor, scan, deck, present, slide, draft, message, ping, chat, out | `test-data/audio/05-vi-en-pha-le.dialogue.json` là lời gốc; sinh bằng `python3 scripts/gen-test-audio.py --only 05-vi-en-pha-le --engine elevenlabs --skip-long` |

Ghi chú về bộ đọc: ngày 2026-11-19 edge-tts bị Microsoft chặn 403 từ máy làm việc (mọi giọng), nên bộ 05 đọc bằng ElevenLabs `eleven_turbo_v2_5`, giọng Adam (SPK_01) và Sarah (SPK_02). Kiểm trước bằng Soniox: cả Adam, Sarah, Laura, Josh đọc tiếng Việt pha tiếng Anh chuẩn, khớp 100% với lời gốc ở câu thử. Các bộ 01 đến 03 giữ nguyên cách sinh cũ.

Chạy đo và chấm:

```bash
node scripts/b0-asr/run.mjs --provider soniox --file test-data/audio/05-vi-en-pha-le.ogg
node scripts/b0-asr/score.mjs --hyp test-data/asr-results/soniox/05-vi-en-pha-le.json
```

Kết quả đã chạy thật ngày 2026-11-19 (chi tiết tổng hợp nằm ở `docs/11-b0-ket-qua.md`, ghép bảng khi PR #74 gộp):

- WER theo âm tiết 4,26% (282 âm, sai 8 thay, 4 bỏ) — thấp nhất trong các bộ hiện có, tức nói pha Việt, Anh không phải điểm yếu của Soniox.
- Ngôn ngữ đúng 16/16; đủ số liệu 10/10 (kể cả "KPI phase 2", "50 triệu", "tám giờ", "mười slide"); tách người nói 2/2, 270/270 khớp mốc.
- Tốc độ 7,4 giây cho 84 giây âm thanh (0,089 lần thời gian thực); chi phí khoảng 0,005 đô la Mỹ.
