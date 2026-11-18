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

- Giọng là **giọng đọc máy** (espeak-ng, chạy offline), nghe rõ là máy. Dùng tốt để thử **đường ống**: tải lên, lưu, phát, bản đồ nghe, đối chiếu mốc thời gian, buổi dài, khóa màn hình.
- **Không dùng để đánh giá chất lượng AI nhận dạng giọng người.** Việc đó cần ghi âm người thật: xem mục "Ghi âm người thật" bên dưới.

## Ghi âm người thật (cho phần đánh giá AI ở B0)

Đọc to lời trong `audio/01-bds-gap-chi-lan.truth.json` (và 2 file còn lại) theo vai, mỗi người một vai, bằng điện thoại đặt giữa bàn như họp thật. Vì đọc theo kịch bản nên vẫn có đáp án để tính tỷ lệ sai chữ. Nên thu đủ: một buổi giọng Bắc, một buổi có người giọng Nam hoặc Trung, một buổi ở quán cà phê. Người đọc phải đồng ý cho dùng giọng của mình để thử.

## Sinh lại

```bash
pip install espeakng-loader numpy
python3 scripts/gen-test-audio.py      # ghi cả 4 bộ vào test-data/audio, khoảng 3 phút
```
