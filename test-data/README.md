# Dữ liệu thử chặng B0

Bộ âm thanh thử sinh từ lời của 3 buổi ghi mẫu, kèm đáp án để đối chiếu.
Ba bộ ngắn (khoảng 11 MB) nằm ngay trong `test-data/audio/`. File dài 62 phút không commit (khoảng 24 MB): chạy script bên dưới để sinh, ra `test-data/audio/04-dai-62-phut.ogg` và `.m4a`.

| File | Thời lượng | Nội dung | Phòng | Dùng để thử |
| --- | --- | --- | --- | --- |
| `01-bds-gap-chi-lan` | 6,7 phút | 60 đoạn, 3 người nói, tiếng Việt | Văn phòng yên | Phát, chữ chạy theo, Cân âm lượng (chị Lan nhỏ hơn 9 dB) |
| `02-hop-doi-tac-han` | 8,5 phút | 65 đoạn, 4 người: Việt 32, Hàn 26, Anh 7 | Phòng họp cạnh xưởng (điều hòa, tiếng máy) | Nhận đoạn nhiều ngôn ngữ, lọc ồn |
| `03-bac-si-kham` | 2,7 phút | 34 đoạn, bác sĩ và bệnh nhân | Phòng khám ồn | Lọc ồn, người nói nhỏ và chậm |
| `04-dai-62-phut` | 62 phút | Ghép lặp 3 bộ trên, có nghỉ 20 đến 90 giây | | Ghi âm và tải lên buổi dài, khóa màn hình, bỏ qua khoảng lặng |

Mỗi bộ có `.ogg` (Opus 32 kbps, như sẽ lưu thật) và `.m4a` (AAC, phát được trên mọi iPhone).
`audio/<tên>.truth.json` là đáp án: từng đoạn với người nói, ngôn ngữ, chữ Nguyên văn, `start_sec` và `end_sec` **trong file âm thanh**, và `fixture_start_sec` (mốc của đoạn đó trong buổi mẫu).

## Kết quả ASR (`asr-results/`)

`asr-results/<mã hãng>/<tên bộ>.json` là kết quả đã chuẩn hóa và **đã chấm** — file dùng cho `score.mjs`, giữ nguyên dạng.
`asr-results/<mã hãng>/<tên bộ>.raw.json.gz` là kết quả thô của hãng **nén gzip** (nhịp 2, PR #74): 4 file chiếm ~0,4 MB thay vì ~5,5 MB, giữ được dữ liệu gốc để tái chấm mà không gọi lại API tốn tiền. Mở bằng `gunzip -k <file>` (hoặc `zcat <file> | head`). `run.mjs` giờ ghi thẳng nén gzip; `score.mjs` tự bỏ qua file `.gz` khi liệt kê kết quả để chấm.

## Bảng giọng (giọng AI tự nhiên, bộ đọc edge-tts)

Mỗi người nói một giọng, cao độ và tốc độ chỉnh khác nhau để phân biệt nghe được. `Cao độ` là lệch so với giọng gốc, `Tốc độ` là lệch tốc độ đọc, `Âm lượng` là gain dB áp sau khi chuẩn hóa (người có gain 0 dB là mức chuẩn).

| Bộ | Người nói | Giọng | Cao độ | Tốc độ | Âm lượng | Vai |
| --- | --- | --- | --- | --- | --- | --- |
| 01-bds-gap-chi-lan | SPK_01 | vi-VN-NamMinhNeural | +0 Hz | +0 % | 0 dB | Bạn (môi giới) |
| 01-bds-gap-chi-lan | SPK_02 | vi-VN-HoaiMyNeural | +0 Hz | -8 % | -9 dB | Chị Lan (chậm hơn một chút, nhỏ hơn 9 dB) |
| 01-bds-gap-chi-lan | SPK_03 | vi-VN-NamMinhNeural | -15 Hz | +10 % | -3 dB | Người nói 3, bạn của chị Lan (trầm và nhanh hơn) |
| 02-hop-doi-tac-han | SPK_01 | vi-VN-NamMinhNeural | +0 Hz | +0 % | 0 dB | Bạn (môi giới) |
| 02-hop-doi-tac-han | SPK_02 | ko-KR-InJoonNeural | -10 Hz | +0 % | +2 dB | Park Ji-ho (trầm hơn một chút) |
| 02-hop-doi-tac-han | SPK_03 | ko-KR-SunHiNeural | +8 Hz | +5 % | -4 dB | Kim Min-ji (cao và nhanh hơn) |
| 02-hop-doi-tac-han | SPK_04 | vi-VN-HoaiMyNeural | +10 Hz | +0 % | -6 dB | Chị Thảo (cao hơn) |
| 03-bac-si-kham | SPK_01 | vi-VN-NamMinhNeural | +0 Hz | +0 % | 0 dB | Bạn (bác sĩ) |
| 03-bac-si-kham | SPK_02 | vi-VN-HoaiMyNeural | +0 Hz | -15 % | -7 dB | Chị Hằng (bệnh nhân, chậm và nhỏ) |
| 03-bac-si-kham | SPK_03 | vi-VN-NamMinhNeural | -10 Hz | -5 % | 0 dB | Người nhà (con chị Hằng) |

- Đoạn tiếng Anh của Park (SPK_02) và Kim (SPK_03) đọc bằng **chính giọng Hàn của họ** (giọng Anh pha Hàn, như thật), không đổi sang giọng tiếng Anh.
- Cao độ và tốc độ của Park, Kim, người nhà được chọn để các cặp người nói cùng một giọng gốc (ví dụ bạn và người nói 3) vẫn phân biệt được.
- `--engine fpt` (khi có khóa `FPT_TTS_KEY`) đổi Người nói 3 (bộ 01) và Chị Hằng (bộ 03) sang giọng miền Nam (`giahung`, `thuminh`), các người nói còn lại vẫn dùng Edge. `--engine elevenlabs` (khi có khóa `ELEVENLABS_API_KEY`) cũng chỉ đổi hai người nói đó; giọng mặc định ElevenLabs đọc tiếng Việt chưa đạt khi thử (giọng Mỹ pha nặng, ASR nhận sai nhiều chữ — xem mục Giới hạn quan trọng).

## Giới hạn quan trọng

- Giọng là **giọng AI tự nhiên** (edge-tts, giọng đọc Microsoft, cần mạng): giọng Việt Bắc `vi-VN-NamMinhNeural` (nam) và `vi-VN-HoaiMyNeural` (nữ), giọng Hàn `ko-KR-InJoonNeural` và `ko-KR-SunHiNeural`. Nghe gần người đọc thật hơn espeak-ng; espeak-ng giờ chỉ là phương án dự phòng chạy offline (`--engine espeak`), nghe rõ là máy.
- **Giọng AI vẫn rõ hơn người thật**: đọc đều, không ngập ngừng thật, không nhiễu mất chữ như ghi âm thật. Dùng tốt để thử **đường ống**: tải lên, lưu, phát, bản đồ nghe, đối chiếu mốc thời gian, buổi dài, khóa màn hình; có thể dùng để thử nhận dạng, nhưng không thay thế được đánh giá trên giọng người thật. Việc đó cần ghi âm người thật: xem mục "Ghi âm người thật" bên dưới.
- **Chỉ có giọng Bắc nếu không dùng FPT**: edge-tts chưa có giọng Việt miền Nam hoặc miền Trung. `--engine fpt` (cần khóa `FPT_TTS_KEY`) đổi Người nói 3 (bộ 01) và Chị Hằng (bộ 03) sang giọng miền Nam (`giahung`, `thuminh`), các người nói còn lại vẫn dùng Edge. `--engine elevenlabs` (cần khóa `ELEVENLABS_API_KEY`) cũng chỉ đổi hai người nói đó, nhưng giọng mặc định ElevenLabs đọc tiếng Việt chưa đạt khi thử (giọng Mỹ pha nặng: Rachel lỗi nặng, Paul và Domi lỗi nhiều chữ, Lily khá nhất vẫn sai) — chỉ nên dùng khi có `voice_id` giọng Việt tốt hơn, đặt qua `ELEVEN_VOICE_SPK3` và `ELEVEN_VOICE_CHI_HANG`.

## Ghi âm người thật (cho phần đánh giá AI ở B0)

Đọc to lời trong `audio/01-bds-gap-chi-lan.truth.json` (và 2 file còn lại) theo vai, mỗi người một vai, bằng điện thoại đặt giữa bàn như họp thật. Vì đọc theo kịch bản nên vẫn có đáp án để tính tỷ lệ sai chữ. Nên thu đủ: một buổi giọng Bắc, một buổi có người giọng Nam hoặc Trung, một buổi ở quán cà phê. Người đọc phải đồng ý cho dùng giọng của mình để thử.

## Sinh lại

```bash
pip install edge-tts numpy
python3 scripts/gen-test-audio.py                       # ghi cả 4 bộ vào test-data/audio, cần mạng
python3 scripts/gen-test-audio.py --only 03-bac-si-kham # sinh riêng một bộ
python3 scripts/gen-test-audio.py --engine espeak       # dự phòng offline, giọng đọc máy
python3 scripts/gen-test-audio.py --engine fpt          # cần khóa FPT_TTS_KEY trong biến môi trường
python3 scripts/gen-test-audio.py --engine elevenlabs   # cần khóa ELEVENLABS_API_KEY trong biến môi trường
```

Mỗi đoạn đọc thành file mp3 riêng trong thư mục tạm rồi mới ghép, nên chạy lại không mất công đọc lại phần đã xong. Bộ đọc lỗi (mạng, giới hạn) thì thử lại 3 lần, có chờ; vẫn lỗi thì dừng và báo, không lặng lẽ rơi về espeak. `start_sec`/`end_sec` trong .truth.json đo từ độ dài thật của từng đoạn đã đọc (sau khi cắt im lặng đầu/cuối file đọc ra).

## Bộ thứ năm: 05-vi-en-pha-le (góp ý vòng 1, issue #75, ngày 2026-11-19)

Nói lẫn Việt, Anh kiểu dân văn phòng trong cùng một câu ("em check lại KPI phase 2") — kiểu nói mà góp ý vòng 1 cho rằng ba bộ trên còn thiếu. Bộ nằm ngay trong `test-data/audio/` (ogg khoảng 0,3 MB, m4a khoảng 0,5 MB), lời gốc ở `05-vi-en-pha-le.dialogue.json`.

| Bộ | Thời lượng | Nội dung | Phòng | Dùng để đo |
| --- | --- | --- | --- | --- |
| `05-vi-en-pha-le` | 1,4 phút | 16 đoạn, 2 người nói, Việt pha Anh văn phòng | Văn phòng yên | Nhận từ, cụm tiếng Anh pha trong câu Việt; đủ số liệu (KPI phase 2, năm mươi triệu) |

Cách sinh: `python3 scripts/gen-test-audio.py --only 05-vi-en-pha-le --engine elevenlabs --skip-long`. Ngày 2026-11-19 edge-tts bị Microsoft chặn 403 từ máy làm việc (mọi giọng), nên bộ này đọc bằng ElevenLabs `eleven_turbo_v2_5`: Adam cho SPK_01, Sarah cho SPK_02. Kiểm trước bằng Soniox trên câu mẫu: Adam, Sarah, Laura, Josh đọc tiếng Việt pha tiếng Anh khớp 100% với lời gốc. Các bộ 01 đến 03 giữ nguyên cách sinh cũ.
