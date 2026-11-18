# 11. Kết quả chặng B0

Kết quả hai câu hỏi của chặng B0 (`10-b0-thu-rui-ro.md`), quyết định cho B1 trở đi.

- **Phần A. So sánh AI nhận dạng giọng nói tiếng Việt** (issue #69, PR #72) — bên dưới.
- Phần B. Ghi âm và nghe dài trên điện thoại (issue #70, PR #70): PR đó thêm phần này.

---

## Phần A. So sánh AI nhận dạng giọng nói tiếng Việt

### Trạng thái lần chạy 2026-11-18

Máy agent **không có khóa nào** trong 4 biến môi trường (`SONIOX_API_KEY`, `ELEVENLABS_API_KEY`,
`GOOGLE_APPLICATION_CREDENTIALS`, `FPT_STT_KEY` — kiểm bằng `printenv` 2 lần). Theo thân issue:
"Thiếu khóa nào thì bỏ qua nhà cung cấp đó và ghi rõ trong báo cáo; không dừng cả việc" →
đã viết đủ bộ chấm điểm, `run.mjs` và 4 adapter, nhưng **chưa gọi API của nhà cung cấp nào,
chưa có số đo chất lượng** (không bịa số). Tổng tiền đã gọi API: **0 USD** (giới hạn 10 USD
của đặc tả không bị vượt).

Đã xong và chạy thật trên máy:

- `scripts/b0-asr/score.mjs` — bộ chấm, tự kiểm đạt 10/10 bài (bên dưới).
- `scripts/b0-asr/run.mjs` + `scripts/b0-asr/providers/{soniox,elevenlabs,google,fpt}.mjs` —
  chạy thử cả 4 hãng trên 3 file 01–03 và file dài 04: đều dừng đúng cách với thông báo
  "Thiếu <KHÓA> — bỏ qua nhà cung cấp <mã> (không gọi API)", thoát mã 2, không gọi API.
- Sinh `04-dai-62-phut` (bên dưới). Kết quả thô của nhà cung cấp sẽ nằm ở
  `test-data/asr-results/<mã>/<bộ>.raw.json` và `<bộ>.json` (chưa có file nào vì chưa gọi API).

### Bảng chỉ số giọng AI (chưa có số đo)

Các ô số đo để "—" vì chưa gọi được nhà cung cấp nào. Cột giá/giới hạn tra từ tài liệu
công khai (bảng bên dưới), không phải số đo trên âm thanh của Noteim.

| Nhà cung cấp | Bộ | WER vi | CER ko | WER en | Sai số liệu (thiếu/tổng) | Tách người nói (máy/thật) | Ngôn ngữ đúng | Lệch mốc (s) | Tiếng đệm (máy/truth) | Tốc độ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| soniox | 01-bds-gap-chi-lan | — | — | — | — | — | — | — | — | — |
| soniox | 02-hop-doi-tac-han | — | — | — | — | — | — | — | — | — |
| soniox | 03-bac-si-kham | — | — | — | — | — | — | — | — | — |
| elevenlabs | 01-bds-gap-chi-lan | — | — | — | — | — | — | — | — | — |
| elevenlabs | 02-hop-doi-tac-han | — | — | — | — | — | — | — | — | — |
| elevenlabs | 03-bac-si-kham | — | — | — | — | — | — | — | — | — |
| google | 01-bds-gap-chi-lan | — | — | — | — | — | — | — | — | — |
| google | 02-hop-doi-tac-han | — | — | — | — | — | — | — | — | — |
| google | 03-bac-si-kham | — | — | — | — | — | — | — | — | — |
| fpt | 01-bds-gap-chi-lan | — | — | — | — | — | — | — | — | — |
| fpt | 02-hop-doi-tac-han | — | — | — | — | — | — | — | — | — |
| fpt | 03-bac-si-kham | — | — | — | — | — | — | — | — | — |

**Chưa có số đo: thiếu khóa API trên máy agent, chưa gọi được nhà cung cấp nào (không bịa số).**

Cách tính từng cột (đặt trong `scripts/b0-asr/score.mjs`, khi có kết quả chỉ cần chạy lại):

- WER vi: theo âm tiết cách nhau bằng khoảng trắng, giữ dấu thanh, bỏ dấu câu, chữ thường.
- CER ko: theo ký tự, bỏ khoảng trắng và dấu câu. WER en: theo từ.
- Sai số liệu: regex đếm trong đáp án 4 nhóm riêng — số, tiền (tỷ/triệu/đồng/VND/₫),
  ngày (dd/mm), tên riêng (chữ viết hoa giữa câu) — mỗi nhóm đếm "thiếu/tổng"; cột bảng
  gộp tổng, JSON kết quả (`score.mjs` không có `--md`) liệt kê riêng từng nhóm kèm danh sách.
- Tách người nói: thử mọi hoán vị ghép nhãn máy ↔ đáp án (≤ 4 người thì vét cạn), ô hiển thị
  "tỷ lệ chữ đúng người (số người máy/số người thật)".
- Ngôn ngữ đúng: tỷ lệ đoạn đáp án được đoạn khớp tốt nhất gán đúng ngôn ngữ (file 02 tách
  riêng vi/ko/en trong JSON `language.per_lang`).
- Lệch mốc: trung bình |đầu đoạn máy − đầu đoạn đáp án| theo cặp đoạn khớp chồng lấp, giây.
- Tiếng đệm: "số tiếng đệm máy giữ/số trong đáp án" ("à, ừ, ờ, ừm, hừ").
- Tốc độ: thời gian xử lý so độ dài âm thanh (hệ số realtime, nhỏ hơn 1 là nhanh hơn realtime),
  ghi ở `processing_ms` trong kết quả chuẩn hóa từng lần gọi.

### Tự kiểm bộ chấm (đã chạy thật, `node scripts/b0-asr/score.mjs --selftest`)

```
[ĐẠT] bộ 01 chấm chính nó: mọi chỉ số 0 — WER vi 0.00% trên 1272 âm tiết, 3 người nói
[ĐẠT] bộ 02 chấm chính nó: mọi chỉ số 0 (vi/ko/en, 4 người nói) — WER vi 0.00%, CER ko 0.00%, WER en 0.00%
[ĐẠT] đổi 5 âm tiết: WER vi đúng bằng 5/N — 5/1272 = 0.39%, đo được 0.39% (thay 5, thiếu 0, thừa 0)
[ĐẠT] đổi 5 âm tiết: không sai thực thể nào (chỉ đổi chữ thường, không đụng số/tên) — thiếu 0
[ĐẠT] đổi 5 âm tiết: tách người nói vẫn 100% trên các cặp chữ còn khớp — 100.00%
[ĐẠT] sửa 2 ký tự Hàn: CER đúng bằng 2/N — 2/962 = 0.21%, đo được 0.21%
[ĐẠT] sửa 2 từ tiếng Anh: WER en đúng bằng 2/N — 2/129 = 1.55%, đo được 1.55%
[ĐẠT] gán nhầm ngôn ngữ 1/60 đoạn: tỷ lệ đúng giảm đúng 1 đoạn, WER không đổi — 98.33% (59/60)
[ĐẠT] sửa mọi số/tiền/ngày: thiếu đủ lượng regex đếm được, tên riêng không bị đếm sai — số 16/16, tiền 3/3, ngày 1/1, tên 0/24
[ĐẠT] sửa mọi tên riêng: thiếu đủ lượng đếm được, không ảnh hưởng số/tiền/ngày — tên riêng thiếu 24/24
Tự kiểm đạt: 10/10 bài
```

Bộ 01 có 1272 âm tiết vi; bộ 02 có 551 âm tiết vi, 962 ký tự Hàn, 129 từ tiếng Anh,
58 số, 3 ngày, 24 lần nhắc tên riêng trong đáp án.

### File dài 04-dai-62-phut (giọng AI)

Sinh thật bằng `scripts/gen-test-audio.py` ngày 2026-11-18 (bản ghép lặp 3 bộ ngắn kèm
im lặng 20–90 giây; không sinh đáp án truth riêng). Đo bằng `ffprobe`/`ls`:

| File | Thời lượng | Dung lượng |
| --- | --- | --- |
| `test-data/audio/04-dai-62-phut.ogg` | 3720,01 giây (62 phút) | 10.076.544 byte (9,6 MB, Opus 24 kbps) |
| `test-data/audio/04-dai-62-phut.m4a` | 3720,00 giây (62 phút) | 13.322.246 byte (12,7 MB, AAC 32 kbps) |

Không commit (theo `test-data/README.md` và `.gitignore` `/test-data/audio/04-*`); lệnh sinh
lại trong `scripts/b0-asr/README.md`. Chưa đo tốc độ xử lý — thiếu khóa; lệnh chạy đã để sẵn.

### Giọng người thật

`test-data/human/` chưa có bản ghi nào — **chờ bản ghi người thật** (hướng dẫn đọc trong
`test-data/human/README.md`). Lệnh chạy và chấm đã để sẵn trong `scripts/b0-asr/README.md`.

### Giá, giới hạn, chính sách dữ liệu (tra tài liệu công khai, ngày xem 2026-11-18)

Giá là số hãng tự công bố, chưa đo lại trên âm thanh Noteim. Trang nào không đọc được thì
ghi rõ "chưa xác thực được".

| Nhà cung cấp | Giá công bố | Quy đổi mỗi giờ | Giới hạn, tách người nói, ngôn ngữ | Chính sách dữ liệu | Nguồn (ngày xem) |
| --- | --- | --- | --- | --- | --- |
| soniox | Tính theo token: "Equivalent to about $0.10/hour for async (file) and $0.12/hour for real-time" | ≈ 0,10 USD/giờ (async), ≈ 0,12 USD/giờ (streaming) | 60+ ngôn ngữ, tự nhận ngôn ngữ chuyển giữa câu, có nhãn người nói; tên mô hình cần kiểm khi có khóa (tài liệu có badge "stt-v6", trang giá nêu "stt-rt-v6" cho streaming) | Chưa tra được chi tiết (dữ liệu có dùng để huấn luyện, máy chủ ở đâu) — cần bổ sung | https://soniox.com/pricing (2026-11-18) |
| elevenlabs | STT trừ theo thời lượng: 330 credit/phút ≈ 19.800 credit/giờ; gói Pro 99 USD/600.000 credit → ≈ 3,27 USD/giờ, gói Creator 22 USD/121.000 credit → ≈ 3,60 USD/giờ (trang tài liệu ghi "billing is calculated per hour of audio, with rates varying by tier and model", bảng giá API cần đăng nhập) | ≈ 3,3 đến 3,6 USD/giờ tùy gói (Claude ghi chú: đây là quy đổi từ credit của gói thuê bao. Các bảng so sánh giá API trả theo dùng ghi Scribe khoảng 0,20 đến 0,27 USD/giờ xử lý sau; phải xác nhận giá API thật khi có khóa trước khi so) | File ≤ 5 GB, ≤ 15 giờ; Scribe v3 tách người nói tới 32 người, có mốc từng chữ, hỗ trợ âm thanh đa ngôn ngữ; bảng WER Scribe v2 xếp Vietnamese (vie), Korean (kor), English (eng) mức "Excellent (≤ 5% WER)" | Chưa tra được chi tiết — cần bổ sung | https://elevenlabs.io/pricing và https://elevenlabs.io/docs/capabilities/speech-to-text (2026-11-18) |
| google | V2 nhận dạng chuẩn (gồm "chirp (Speech-to-Text V2 only)"): 0,016 USD/phút bậc 0–500.000 phút/tháng; batch động: 0,003 USD/phút; làm tròn lên từng giây. Trang giá CHƯA có mục giá riêng cho chirp_3 — cần xác nhận khi có khóa | ≈ 0,96 USD/giờ (recognize), ≈ 0,18 USD/giờ (batch) | Recognize cho âm thanh dưới 1 phút; BatchRecognize 1 phút đến 1 giờ (bật mốc từng chữ tối đa 20 phút); chirp_3 không có mốc từng chữ; tách người nói chỉ trong BatchRecognize và chỉ cho danh sách ngôn ngữ KHÔNG gồm vi-VN (gồm ko-KR) — xem chi tiết dưới; V1 có 60 phút miễn phí/tháng | Trang giá phân biệt "with/without data logging" ở V1; chi tiết dùng dữ liệu để huấn luyện cần tra thêm | https://cloud.google.com/speech-to-text/pricing và https://cloud.google.com/speech-to-text/v2/docs/chirp_3 (2026-11-18) |
| fpt | Chưa xác thực được — trang https://fpt.ai/vi/price/ không đọc được nội dung giá bằng curl (có thể là ảnh hoặc vẽ bằng JS), r.jina.ai bị chặn IP | — | API asr/v15 chỉ tiếng Việt, không tách người nói, không mốc từng chữ (theo mô tả tài liệu); giới hạn độ dài file cần tra tay | Chưa tra được | https://fpt.ai/vi/price/ (2026-11-18, không đọc được nội dung giá — cần tra tay) |

**Trả lời câu hỏi của issue: "tách người nói của Google chirp_3 có chạy với tiếng Việt không" —
theo tài liệu chính thức (trang chirp_3, ngày xem 2026-11-18): KHÔNG.** Danh sách "Language
availability for diarization" của chirp_3 chỉ gồm cmn-Hans-CN, de-DE, en-GB, en-IN, en-US,
es-ES, es-US, fr-CA, fr-FR, hi-IN, it-IT, ja-JP, ko-KR, pt-BR — không có vi-VN (tiếng Việt
vẫn được nhận chữ, mức GA). Hai điểm cần thử thật khi có khóa: (1) bảng tính năng ghi
"Speaker Diarization … Available only in Speech.BatchRecognize" trong khi danh sách ngôn ngữ
ghi "in BatchRecognize and Recognize"; (2) xác nhận chirp_3 không trả mốc từng chữ.

### Đề xuất nhà cung cấp chính và dự phòng

Khung tiêu chí (điền số khi đo được):

1. WER âm tiết tiếng Việt thấp nhất ở file 02 (đa ngôn ngữ) và 01 (tiền, ngày nhiều).
2. Tách người nói: tỷ lệ chữ gán đúng người ≥ 90% với 3 đến 4 người nói (file 01, 02).
3. Sai số liệu (tiền, ngày, tên riêng) gần 0.
4. Giá mỗi giờ ≤ 1 USD cho mục tiêu gói giá của Noteim (còn cân nhắc lại khi thấy giá các gói).
5. Giới hạn đủ cho buổi dài (file 62 phút) và có mốc từng chữ cho "chữ chạy theo".
6. Nhận ngôn ngữ đúng ở chỗ Việt–Hàn–Anh chuyển câu.

Kết luận: **chờ số liệu đo thật khi có khóa** — bảng giá tự công bố của hãng không đủ làm
căn cứ chọn (Google rẻ nhất trên giấy nhưng diarization không hỗ trợ tiếng Việt theo tài liệu;
Soniox rẻ và có tách người nói nhưng cần đo chất lượng tiếng Việt; ElevenLabs đắt hơn nhiều
lần nhưng bảng WER tiếng Việt mức tốt nhất công bố). Sau khi chạy được 3 file × 4 hãng,
điền bảng chỉ số ở trên và chọn theo khung tiêu chí.

### Tổng tiền đã gọi API

**0 USD** — không có khóa nào trên máy agent, không gọi được nhà cung cấp nào (giới hạn
10 USD của đặc tả: không vượt).

### Việc chờ có khóa (lệnh chạy lại được ngay)

```bash
# 1) gọi từng hãng trên 3 file ngắn (tự lưu kết quả thô + chuẩn hóa, có thời gian xử lý)
node scripts/b0-asr/run.mjs --provider soniox     --file test-data/audio/01-bds-gap-chi-lan.m4a
node scripts/b0-asr/run.mjs --provider elevenlabs --file test-data/audio/02-hop-doi-tac-han.m4a
node scripts/b0-asr/run.mjs --provider google     --file test-data/audio/03-bac-si-kham.m4a
node scripts/b0-asr/run.mjs --provider fpt        --file test-data/audio/01-bds-gap-chi-lan.m4a
# 2) chấm lại từ kết quả đã lưu (không tốn tiền) và điền bảng chỉ số
node scripts/b0-asr/score.mjs --all --md
# 3) file dài 62 phút: đo tốc độ và giới hạn (Google cần cắt khúc, xem bảng giới hạn trên)
node scripts/b0-asr/run.mjs --provider soniox --file test-data/audio/04-dai-62-phut.ogg
# 4) bản ghi người thật khi có: xem lệnh trong scripts/b0-asr/README.md
```
