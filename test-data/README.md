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
