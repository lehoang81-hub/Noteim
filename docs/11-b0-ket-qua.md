# 11. Kết quả chặng B0

Kết quả hai câu hỏi của chặng B0 (`10-b0-thu-rui-ro.md`), quyết định cho B1 trở đi.

- **Phần A. So sánh AI nhận dạng giọng nói tiếng Việt** (issue #69, PR #72) — bên dưới.
- Phần B. Ghi âm và nghe dài trên điện thoại (issue #70, PR #70): PR đó thêm phần này.

---

## Phần A. So sánh AI nhận dạng giọng nói tiếng Việt

### Trạng thái lần chạy 2026-11-19 (đã gọi API thật — nhánh b0/01b-do-asr, PR #74)

Có khóa `SONIOX_API_KEY` (Soniox đã nạp tiền) và `ELEVENLABS_API_KEY`. Kết quả:

- **soniox — CHẠY ĐƯỢC**, gọi thật 3 file ngắn (01, 02, 03) + file dài 04, kết quả thô
  và đã chuẩn hóa nằm ở `test-data/asr-results/soniox/` (commit trong PR #74), chấm lại từ
  kết quả đã lưu không cần gọi API.
- **elevenlabs — BỊ CHẶN QUYỀN KHÓA**: gọi thử file 03 trả HTTP 401
  `missing_permissions` — "The API key you used is missing the permission `speech_to_text`
  to execute this operation" (request_id 94aee984cc1acafc204552605d427199, ngày 2026-11-19).
  Chủ tài khoản chưa tìm được chỗ cấp quyền `speech_to_text` cho khóa ở gói free → chờ chủ
  tài khoản cấp quyền rồi chạy lại (lệnh ở cuối trang).
- **google, fpt — không có khóa** (`GOOGLE_APPLICATION_CREDENTIALS`, `FPT_STT_KEY` không có).
- Sửa adapter soniox theo API thật (khung viết theo docs cũ đã sai): mô hình async hiện hành
  là `stt-async-v6` (liệt kê từ `/v1/models`, ngày 2026-11-19), flow là upload qua Files API
  rồi tạo việc bằng JSON body, token có `end_ms`; xem đầu file
  `scripts/b0-asr/providers/soniox.mjs`.

### Trạng thái lần chạy 2026-11-18 (khung, PR #72)

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
  `test-data/asr-results/<mã>/<bộ>.raw.json.gz` (nén gzip, nhịp 2 — nhẹ kho) và `<bộ>.json`.

### Bảng chỉ số giọng AI (đo thật ngày 2026-11-19)

Số đo của **soniox** là gọi API thật trên âm thanh Noteim (mô hình `stt-async-v6`, chấm bằng
`score.mjs` từ kết quả đã lưu). Các ô "—" của elevenlabs là vì khóa bị chặn quyền; google/fpt
là vì không có khóa. Không bịa số.

| Nhà cung cấp | Bộ | WER vi | CER ko | WER en | Sai số liệu (thiếu/tổng) | Tách người nói (máy/thật) | Ngôn ngữ đúng | Lệch mốc (s) | Tiếng đệm (máy/truth) | Tốc độ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| soniox | 01-bds-gap-chi-lan | 7.55% | — | — | 5/44 | 100.00% (3/3) | 100.00% | 4.07 | 6/6 | 0.03x |
| soniox | 02-hop-doi-tac-han | 13.79% | 31.91% | 17.05% | 18/101 | 100.00% (4/4) | 100.00% | 0.90 | 0/0 | 0.03x |
| soniox | 03-bac-si-kham | 4.36% | — | — | 0/9 | 65.95% (2/3) | 100.00% | 3.25 | 0/0 | 0.05x |
| elevenlabs | 01-bds-gap-chi-lan | — | — | — | — | — | — | — | — | — |
| elevenlabs | 02-hop-doi-tac-han | — | — | — | — | — | — | — | — | — |
| elevenlabs | 03-bac-si-kham | — | — | — | — | — | — | — | — | — |
| google | 01-bds-gap-chi-lan | — | — | — | — | — | — | — | — | — |
| google | 02-hop-doi-tac-han | — | — | — | — | — | — | — | — | — |
| google | 03-bac-si-kham | — | — | — | — | — | — | — | — | — |
| fpt | 01-bds-gap-chi-lan | — | — | — | — | — | — | — | — | — |
| fpt | 02-hop-doi-tac-han | — | — | — | — | — | — | — | — | — |
| fpt | 03-bac-si-kham | — | — | — | — | — | — | — | — | — |

Đọc số soniox:

- File thuần Việt (01 bất động sản, 03 phòng khám): WER vi 4,36–7,55% — dùng được làm bản
  nháp, cần người soát. File 03 không sai số liệu nào (0/9).
- File 01 nhiều tiền/ngày: thiếu 5/44 thực thể — các chỗ "bao nhiêu", "hôm nào" cần đối
  chiếu tay trước khi lưu chính thức.
- File đa ngôn ngữ (02 Việt–Hàn–Anh): WER vi 13,79%; CER Hàn 31,91% — phần Hàn là điểm yếu
  rõ nhất; sai 18/101 thực thể (chủ yếu ở chỗ đọc số theo kiểu Hàn). Ngôn ngữ vẫn gán đúng
  100% và người nói đúng 100% (4/4).
- File 03 chỉ 65,95% tách người nói (2/3): máy gộp 2 người nói ít tiếng thành 1 nhãn.
  Cần kiểm lại trên bản ghi người thật khi có.
- Tốc độ 0,03–0,05x realtime (nhanh hơn realtime 20–33 lần) trên file ngắn.
- Elevenlabs: chưa có số đo nào — khóa trả HTTP 401 thiếu quyền `speech_to_text`
  (2026-11-19), chờ chủ tài khoản cấp quyền.

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
lại trong `scripts/b0-asr/README.md`.

Đo tốc độ ngày 2026-11-19: **soniox `stt-async-v6` xử lý hết 62 phút (3720s) trong 48,9 giây
= 0,013x realtime (nhanh hơn realtime khoảng 76 lần)**, trả 460 đoạn có người nói và ngôn ngữ
từng token; kết quả ở `test-data/asr-results/soniox/04-dai-62-phut.{raw,}.json`. Chi phí lần
gọi này 0,1075 USD (từ usage-logs API của Soniox). Không chấm chữ vì file dài không có đáp án
riêng (theo README bộ test).

### Giọng người thật

`test-data/human/` chưa có bản ghi nào — **chờ bản ghi người thật** (hướng dẫn đọc trong
`test-data/human/README.md`). Lệnh chạy và chấm đã để sẵn trong `scripts/b0-asr/README.md`.

### Giá, giới hạn, chính sách dữ liệu (ngày xem 2026-11-19 cho soniox và elevenlabs)

Giá soniox và elevenlabs dưới đây là **giá API trả theo dùng (pay-as-you-go) xác thực trực
tiếp trên trang giá công khai của hãng** — không phải quy đổi từ gói thuê bao. Soniox được
xác thực chéo bằng hóa đơn thật của lần gọi ngày 2026-11-19.

| Nhà cung cấp | Giá công bố | Quy đổi mỗi giờ | Giới hạn, tách người nói, ngôn ngữ | Chính sách dữ liệu | Nguồn (ngày xem) |
| --- | --- | --- | --- | --- | --- |
| soniox | Trả theo token, không cần gói thuê bao: async — input audio 1,50 USD/1M token, output text 3,50 USD/1M token; công bố "Equivalent to about $0.10/hour for async (file) and $0.12/hour for real-time"; quy chiếu: 1 giờ audio ≈ 30.000 token, 1 giờ nói ≈ 15.000 token output | ≈ 0,10 USD/giờ (async). **Đo lại từ hóa đơn thật 2026-11-19: 4 lần gọi, 1,310 giờ audio, tổng 0,1389 USD = 0,106 USD/giờ — khớp công bố** | Mô hình async hiện hành `stt-async-v6` (liệt kê từ API `/v1/models`, 2026-11-19); 60+ ngôn ngữ hỗ trợ vi/ko/en; tách người nói + tự nhận ngôn ngữ từng token; file ≤ 300 phút (cố định, không tăng); lưu trữ 10 GB / 1000 file, file và việc nhận dạng tự xóa sau 30 ngày, tối đa 100 việc chờ / 2000 việc tổng; cần tự xóa file sau khi lấy kết quả (adapter đã tự xóa cả file lẫn việc) | SOC 2 Type 2, ISO/IEC 27001:2022, GDPR, HIPAA; **không dùng dữ liệu để huấn luyện**; không lưu âm thanh/chữ trừ khi chủ động upload qua Files API (file tự xóa sau 30 ngày; adapter xóa ngay sau khi lấy kết quả) | https://soniox.com/pricing ; https://docs.soniox.com/stt/async/limits-and-quotas ; https://docs.soniox.com/security-and-privacy ; https://docs.soniox.com/openapi.yaml (2026-11-19) |
| elevenlabs | **Scribe v3 Speech to Text: 0,20 USD/giờ; Scribe v3 Live: 0,22 USD/giờ — giá API trả theo dùng công khai trên trang giá API (không bắt buộc gói thuê bao)**; Scribe v2: 0,20 USD/giờ | 0,20 USD/giờ (Scribe v3) | File < 5 GB, định dạng audio/video đều được; Scribe v3 tách người nói tới 32 người, có mốc từng chữ, secondary languages cho audio đa ngôn ngữ, 90+ ngôn ngữ; bảng WER Scribe v2 xếp Vietnamese, Korean, English mức "Excellent (≤ 5% WER)" | Scribe v2 Medical có Zero Retention Mode và BAA (HIPAA-eligible); chính sách lưu giữ chung của Scribe v3 cần tra thêm trên trang riêng | https://elevenlabs.io/pricing/api ; https://elevenlabs.io/docs/capabilities/speech-to-text ; https://elevenlabs.io/docs/api-reference/speech-to-text/convert (2026-11-19) |
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

Khung tiêu chí và số đo ngày 2026-11-19:

1. WER âm tiết tiếng Việt: soniox 4,36–7,55% ở file thuần Việt; 13,79% ở file đa ngôn ngữ.
2. Tách người nói: soniox 100% với 3–4 người nói (01: 3/3, 02: 4/4); file 03 chỉ 65,95% (2/3).
3. Sai số liệu: 0/9 (03), 5/44 (01), 18/101 (02) — file nhiều Hàn/Anh sai nhiều hơn.
4. Giá mỗi giờ: soniox 0,106 USD đo thật (công bố ≈ 0,10) — dưới ngưỡng 1 USD/giờ của tiêu chí.
5. Giới hạn đủ cho buổi dài: file 62 phút xử lý được (≤ 300 phút/file); có mốc từng chữ;
   nhanh hơn realtime 76 lần ở file dài.
6. Nhận ngôn ngữ đúng chỗ Việt–Hàn–Anh chuyển câu: 100% mọi file.

**Kết luận (đề xuất theo số đo ngày 2026-11-19):**

- **Nhà cung cấp chính: Soniox (`stt-async-v6`)** — chất lượng tiếng Việt dùng được cho bản
  nháp (WER vi 4,4–7,6% file thuần Việt), tách người nói và nhận ngôn ngữ đúng ở cả buổi
  Việt–Hàn–Anh, giá 0,106 USD/giờ đo thật (rẻ nhất trong các hãng có tách người nói tiếng
  Việt mà ta đo được), nhanh hơn realtime 76 lần ở file 62 phút, giới hạn 300 phút/file đủ
  cho buổi dài, chính sách dữ liệu rõ (không huấn luyện, không lưu). Điểm cần theo dõi:
  sai số liệu ở chỗ nói lẫn Hàn (18/101) và gộp người nói ở file 03 (65,95%).
- **Dự phòng: ElevenLabs Scribe v3 (0,20 USD/giờ trả theo dùng)** — giá đã xác thực trên
  trang API công khai; công bố WER tiếng Việt mức "Excellent" và tách người nói tới 32 người.
  Chưa đo được chất lượng vì khóa bị thiếu quyền `speech_to_text` (HTTP 401 ngày 2026-11-19)
  → **phải đo lại trên 3 file khi chủ tài khoản cấp quyền trước khi kết luận chính thức**;
  giá gấp đôi Soniox nhưng vẫn dưới ngưỡng 1 USD/giờ.
- Google: batch rẻ (≈0,18 USD/giờ) nhưng chirp_3 không tách người nói tiếng Việt (tài liệu
  ngày 2026-11-18) → không phù hợp luồng chính của Noteim (cần phân vai biên bản).
- FPT: không tách người nói, chưa xác thực được giá → không phù hợp nhu cầu phân vai.

Lưu ý cho B1: cả hai hãng đều là **giọng AI tổng hợp** — kết quả chất lượng có thể tốt hơn
người thật (phát âm đều, ít nhiễu). Khi có bản ghi người thật (`test-data/human/`) phải
chấm lại trước khi chốt kiến trúc.

### Tổng tiền đã gọi API

**0,1389 USD** (khoảng 3.500 đồng) — đo từ API usage-logs của Soniox ngày 2026-11-19,
4 lần gọi, 1,310 giờ audio, mô hình `stt-async-v6`:

| Lần gọi (UTC) | Bộ | Thời lượng audio | Chi phí |
| --- | --- | --- | --- |
| 06:40:02 | 03-bac-si-kham | 148,6 s | 0,0049 USD |
| 06:40:59 | 01-bds-gap-chi-lan | 383,5 s | 0,0126 USD |
| 06:41:19 | 02-hop-doi-tac-han | 464,4 s | 0,0140 USD |
| 06:43:50 | 04-dai-62-phut | 3720,0 s | 0,1075 USD |
| **Tổng** | | **1,310 giờ** | **0,1389 USD** |

ElevenLabs không tốn đồng nào (khóa bị chặn quyền, không gọi được). Google, FPT không có
khóa. Giới hạn 10 USD của đặc tả: **không vượt** (còn dư 9,86 USD).

### Việc chờ (lệnh chạy lại được ngay)

- ElevenLabs: chủ tài khoản cấp quyền `speech_to_text` cho khóa (Console ElevenLabs) rồi chạy
  lệnh elevenlabs ở dưới; chạy xong chấm lại bằng score.mjs và điền thêm dòng elevenlabs vào
  bảng chỉ số trên.
- Google: cần file JSON tài khoản dịch vụ (`GOOGLE_APPLICATION_CREDENTIALS`); lưu ý
  BatchRecognize + Cloud Storage cho file dài (khung "run.mjs inline không đủ cho 62 phút").
- Bản ghi người thật: vào `test-data/human/` rồi chạy theo README của scripts/b0-asr.

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


