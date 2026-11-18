# B0-01 — So sánh AI nhận dạng giọng nói tiếng Việt

Script và ghi chú chạy cho phần A của `docs/10-b0-thu-rui-ro.md`. Nhãn `spike`: không đụng code app.

## Bộ chấm điểm và chạy nhà cung cấp

```bash
# tự kiểm bộ chấm (đạt thì thoát mã 0)
node scripts/b0-asr/score.mjs --selftest

# gọi một nhà cung cấp trên một file; kết quả thô và đã chuẩn hóa lưu vào
# test-data/asr-results/<mã>/<tên bộ>.raw.json và .json; đã có kết quả thì không gọi lại
# (thêm --force để gọi lại). Thiếu khóa thì thoát mã 2, không gọi API.
node scripts/b0-asr/run.mjs --provider soniox     --file test-data/audio/01-bds-gap-chi-lan.m4a
node scripts/b0-asr/run.mjs --provider elevenlabs --file test-data/audio/02-hop-doi-tac-han.m4a
node scripts/b0-asr/run.mjs --provider google     --file test-data/audio/03-bac-si-kham.m4a
node scripts/b0-asr/run.mjs --provider fpt        --file test-data/audio/01-bds-gap-chi-lan.m4a

# chấm lại TỪ KẾT QUẢ ĐÃ LƯU (không gọi API), in JSON hoặc một dòng bảng Markdown
node scripts/b0-asr/score.mjs --hyp test-data/asr-results/soniox/01-bds-gap-chi-lan.json --md
node scripts/b0-asr/score.mjs --all --md        # chấm mọi kết quả đã lưu
```

Nhà cung cấp trong `scripts/b0-asr/providers/`: `soniox` (`SONIOX_API_KEY`), `elevenlabs`
(`ELEVENLABS_API_KEY`), `google` (`GOOGLE_APPLICATION_CREDENTIALS`, chirp_3, vi-VN), `fpt`
(`FPT_STT_KEY`, tùy chọn). Các adapter viết theo tài liệu công khai của từng hãng nhưng
CHƯA gọi API lần nào (máy agent không có khóa, ngày 2026-11-18): khi có khóa cần kiểm lại
tên mô hình và cấu trúc trả về trước khi tin số liệu.

## File dài 04-dai-62-phut (62 phút)

File dài KHÔNG commit (khoảng 10 đến 13 MB, `.gitignore` đã sẵn `/test-data/audio/04-*`), sinh lại bằng:

```bash
pip install edge-tts numpy
python3 scripts/gen-test-audio.py            # chính thức: đọc lại cả 4 bộ (có cache, cần mạng)
```

Chỉ cần ghép lại file dài (không đọc lại 3 bộ ngắn, không cần edge-tts, chỉ cần numpy + ffmpeg):

```bash
python3 - <<'EOF'
import importlib.util, numpy as np
spec = importlib.util.spec_from_file_location('gen', 'scripts/gen-test-audio.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.long_file(np.random.default_rng(20261117))
EOF
```

Đo lần sinh 2026-11-18 (nguồn `ls` + `ffprobe`, không có truth.json — file dài là bản ghép
lặp 3 bộ ngắn kèm im lặng 20 đến 90 giây, không sinh đáp án riêng):

| File | Thời lượng | Dung lượng |
| --- | --- | --- |
| `test-data/audio/04-dai-62-phut.ogg` | 3720,01 giây | 10.076.544 byte (9,6 MB, Opus 24 kbps) |
| `test-data/audio/04-dai-62-phut.m4a` | 3720,00 giây | 13.322.246 byte (12,7 MB, AAC 32 kbps) |

Chạy đo tốc độ và giới hạn (chưa chạy được — thiếu khóa, lệnh để sẵn):

```bash
node scripts/b0-asr/run.mjs --provider soniox --file test-data/audio/04-dai-62-phut.ogg
node scripts/b0-asr/run.mjs --provider elevenlabs --file test-data/audio/04-dai-62-phut.ogg
node scripts/b0-asr/run.mjs --provider google --file test-data/audio/04-dai-62-phut.ogg   # recognize inline không đủ cho 62 phút, cần batchRecognize + Cloud Storage
node scripts/b0-asr/run.mjs --provider fpt --file test-data/audio/04-dai-62-phut.ogg
```

## Bản ghi người thật

`test-data/human/` chưa có bản ghi nào — **chờ bản ghi người thật** (xem hướng dẫn trong
`test-data/human/README.md`). Khi có file, chấm bằng:

```bash
node scripts/b0-asr/run.mjs --provider <mã> --file test-data/human/<tên file>.m4a
node scripts/b0-asr/score.mjs --hyp test-data/asr-results/<mã>/<tên file>.json --truth test-data/human/<tên file>.truth.json --md
```
