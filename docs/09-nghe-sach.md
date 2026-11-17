# 09. Nghe sạch và chữ chạy theo tiếng (M8)

Chặng mockup nhỏ thêm sau M7, theo đề xuất của Hoang ngày 17/11/2026. Vẫn dùng dữ liệu giả và đồng hồ phát giả lập (chưa có tiếng thật), theo mọi quy tắc trong `AGENTS.md` và `02-design-system.md`.

## Vấn đề

- Khi phát, chữ ở tab Lời có chạy theo nhưng gần như không thấy: chỉ tô cả đoạn (mỗi đoạn khoảng 40 giây) bằng nền xám rất nhạt. Tab Tóm tắt không có gì chạy theo.
- Ghi âm thật có tiếng ồn, người nói to người nói nhỏ, nhiều khoảng lặng, tiếng đệm "à, ừ, ờ". Người nghe lại mất thời gian và khó nghe.

## Nguyên tắc

1. **Chỉ lưu một file gốc, không cắt sửa.** File gốc có thể là bằng chứng (luật, công chứng, y tế). Không tạo bản sạch lưu riêng.
2. **"Nghe sạch" là chế độ phát**, bật tắt được bất cứ lúc nào. Tải file, gửi biên bản, xuất file, link công khai tải về luôn dùng file gốc.
3. **Tính trước một lần, áp dụng lúc nghe.** Khi xử lý buổi ghi, máy chủ tính một "bản đồ nghe" vài KB (khoảng lặng, mức to nhỏ của từng người, vị trí tiếng đệm). Lúc nghe, máy người dùng chỉ đọc bản đồ để nhảy qua và chỉnh âm lượng; lọc ồn chạy nhẹ trên máy.
4. **Chữ có hai chế độ.** Bản gọn (mặc định, bỏ tiếng đệm, nói lặp, nói vấp) và Nguyên văn (giữ từng chữ, dùng khi cần làm bằng chứng). Mốc thời gian của mọi chữ vẫn trỏ về file gốc.

## Trình phát: nút "Nghe sạch"

- Trên trình phát nổi có nút **Nghe sạch** (biểu tượng sóng âm có tia sáng, có nhãn chữ trên máy tính, chỉ biểu tượng có `aria-label` trên điện thoại). Bật thì nút đổi màu điện (`--ai`).
- Giữ nút hoặc bấm mũi tên nhỏ cạnh nút mở bảng **Nghe sạch** với 4 công tắc:

| Công tắc | Mặc định khi bật Nghe sạch | Làm gì |
| --- | --- | --- |
| Lọc tiếng ồn | Bật | Giảm tiếng quạt, điều hòa, xe, quán ồn |
| Cân âm lượng người nói | Bật | Người nói nhỏ được tăng, người nói to được giảm, theo từng người |
| Bỏ qua khoảng lặng | Bật | Khi phát, nhảy qua chỗ im lặng hơn 1,5 giây |
| Bỏ qua "à, ừ" | Tắt | Nhảy qua tiếng đệm; ghi chú nhỏ "Có thể nghe hơi giật" |

- Dòng dưới bảng: "File gốc giữ nguyên. Tải về và gửi đi luôn là bản gốc."
- Thời lượng trên trình phát hiện cả hai khi bật: "42:10, nghe sạch còn 36:40". Thanh thời gian vẫn theo thời gian gốc; khoảng bị bỏ qua tô nhạt hơn trên dải giọng.
- Khi nhảy qua một khoảng lặng dài (hơn 5 giây), hiện một dấu nhỏ thoáng qua trên dải giọng (không có thông báo nổi).
- Lựa chọn được nhớ theo người dùng (`User.listening_prefs`), áp dụng cho mọi buổi.
- Mockup: chưa có tiếng nên Lọc ồn và Cân âm lượng chỉ đổi trạng thái giao diện; Bỏ qua khoảng lặng và Bỏ qua "à, ừ" phải thật sự nhảy đồng hồ phát giả qua các khoảng trong bản đồ nghe.
- Bảng thử nghiệm `?debug=1`: ép "Không có bản đồ nghe" (buổi cũ chưa xử lý): nút Nghe sạch tắt, có dòng giải thích "Buổi này chưa có dữ liệu nghe sạch".

## Chữ chạy theo tiếng

- **Từng chữ:** trong đoạn đang phát, chữ đã đọc có màu chữ chính, chữ đang đọc gạch chân màu điện, chữ chưa đọc màu chữ phụ. Mockup chưa có mốc từng chữ: chia đều thời lượng đoạn theo số ký tự (hàm riêng, sau này thay bằng mốc thật từ AI). Bấm vào một chữ thì nghe từ chữ đó.
- **Đoạn đang phát nổi rõ:** viền trái dày hơn theo màu người nói, nền `--surface-2` đậm hơn hiện tại, nhãn nhỏ "Đang phát" cạnh giờ. Phải thấy rõ ở cả sáng và tối, đạt tương phản.
- **Tự cuộn:** giữ như hiện tại (cuộn tức thời, có nút "Theo dõi" khi người dùng tự cuộn đi).
- **Tab Tóm tắt:** ý có `source_ref` chứa thời điểm đang phát sáng lên (viền trái màu điện và chấm nhỏ). Không tự cuộn ở tab này.
- **Giảm chuyển động:** với `prefers-reduced-motion`, bỏ hiệu ứng chuyển màu từng chữ, chỉ tô đoạn.
- Trình đọc màn hình: không đọc lại mỗi khi chữ đổi; chỉ đoạn đang phát có `aria-current`.

## Tab Lời: Bản gọn và Nguyên văn

- Chuyển đổi hai nút ở đầu tab, cạnh ô tìm: **Bản gọn** (mặc định), **Nguyên văn**.
- Bản gọn bỏ tiếng đệm ("à", "ừ", "ờ", "ừm", "kiểu", "thì là"), từ lặp liền nhau, câu nói vấp tự sửa. Nguyên văn hiện đủ, tiếng đệm màu chữ phụ.
- Tìm kiếm, sửa lời, trích dẫn, xuất file: theo chế độ đang xem; câu trích dẫn trong tóm tắt luôn lấy Nguyên văn.
- Tóm tắt và Hỏi AI làm từ Bản gọn.

## Dữ liệu (thêm vào `04-data-contract.md`)

```ts
interface ListeningMap {
  session_id: string;
  silences: Array<{ start_sec: number; end_sec: number }>;   // khoảng lặng hơn 1,5 giây
  fillers: Array<{ start_sec: number; end_sec: number; text: string }>;
  speaker_gain_db: Record<string, number>;                   // speaker_id -> mức tăng giảm, -6 đến +9
  noise_level: "low" | "medium" | "high";
  clean_duration_sec: number;                                // thời lượng khi bỏ khoảng lặng (không bỏ tiếng đệm)
}

interface TranscriptSegment {
  text_clean: string;          // Bản gọn; text giữ Nguyên văn
  words?: Array<{ w: string; start_sec: number; end_sec: number; filler?: boolean }>;   // có khi nối AI thật
}

interface User {
  listening_prefs: { enabled: boolean; denoise: boolean; level: boolean; skip_silence: boolean; skip_fillers: boolean };
}

interface SessionRepository {
  getListeningMap(id: string): Promise<ListeningMap | null>;   // null: buổi chưa có dữ liệu nghe sạch
}
```

Fixture: sinh `ListeningMap` cho mọi buổi mẫu bằng script từ `speaker_spans` và `peaks` sẵn có (khoảng lặng là chỗ peaks thấp giữa các lượt nói); thêm `text_clean` cho mọi đoạn (agent viết lại câu cho gọn, giữ nghĩa). Dữ liệu cũ trong localStorage tự chuyển (thiếu `text_clean` thì dùng `text`).

## Khi nối thật (ghi vào `07-handover.md`)

- B2: ghi âm lưu dạng nén giọng nói (Opus khoảng 24 đến 32 kbps, khoảng 10 đến 15 MB mỗi giờ), chỉ một file.
- B3: cùng lượt AI nhận dạng: lọc ồn tạm cho AI nghe (không lưu), lấy mốc thời gian từng chữ, tách người nói, đánh dấu tiếng đệm, sinh `text_clean`, tính `ListeningMap` (VAD cho khoảng lặng, mức âm lượng trung bình theo người nói).
- Lúc nghe: Web Audio API. Cân âm lượng bằng `GainNode` theo người nói đang phát; lọc ồn bằng bộ lọc nhẹ chạy trong `AudioWorklet` (ví dụ RNNoise bản WASM); nhảy khoảng lặng bằng `seek` theo bản đồ.
- Cần thử ở B0: iPhone khóa màn hình có giữ được Web Audio không; nếu không, khi khóa màn hình chỉ giữ nhảy khoảng lặng và cân âm lượng đơn giản.
