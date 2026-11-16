# 05. Quy trình làm việc qua GitHub

## Vòng lặp

```
Claude mở issue  →  Agent làm trên nhánh  →  Agent mở PR
       ↑                                         ↓
Claude mở issue kế  ←  Claude merge  ←  Claude kiểm tra PR
```

1. **Giao việc.** Claude mở một issue theo mẫu bên dưới. Mỗi lúc chỉ có một issue ở trạng thái `dang-lam` cho mỗi agent.
2. **Làm.** Agent tạo nhánh `m<mốc>/<số>-<tên-ngắn>` (ví dụ `m1/02-thu-vien`), commit nhỏ, thông điệp commit bằng tiếng Việt hoặc tiếng Anh đều được, bắt đầu bằng động từ.
3. **Nộp.** Agent mở PR vào `main`, ghi `Closes #<số issue>`, điền đủ mẫu PR.
4. **Kiểm tra.** Claude đọc code, mở link xem thử, đối chiếu tiêu chí nghiệm thu. Kết quả là một trong ba: Đạt, Cần sửa (liệt kê từng điểm, có đánh số), Cần Hoang quyết.
5. **Merge.** PR đạt thì Claude merge (squash). Hoang xem link xem thử trên điện thoại bất cứ lúc nào; chỗ nào chưa ưng thì nhắn Claude để mở issue sửa. Riêng PR cuối của mỗi mốc, Claude gửi Hoang link xem thử và chờ Hoang đồng ý rồi mới merge.
6. **Việc tiếp theo.** Sau khi merge, Claude mở issue kế tiếp theo `06-roadmap.md`.

Claude chỉ thấy GitHub khi có một phiên làm việc đang mở. Sau khi agent mở PR, Hoang gửi báo cáo của agent hoặc nhắn Claude "kiểm tra PR số N".

## Giao cả một mốc

Từ M7, mỗi mốc làm theo **mô-đun nhỏ**, để một lần máy agent bị reset chỉ mất tối đa một bước, và mỗi lần kiểm thử chỉ xem một phần nhỏ.

```
main
 └─ m7/nhom                    nhánh tích hợp của mốc
     ├─ m7/01-khong-gian       một issue = một nhánh = một PR vào m7/nhom
     ├─ m7/02-tong-quan
     └─ ...
```

1. Claude tạo nhánh tích hợp `m<số>/<tên>` từ `main`, và chia mỗi issue thành các bước (comment "Các bước" trên issue).
2. Agent làm **từng issue một**: nhánh `m<số>/<số issue>-<tên>` tách từ nhánh tích hợp; mỗi bước commit và push ngay; PR nháp mở sau lần push đầu, base là nhánh tích hợp, thân PR là danh sách bước. Xong hết bước thì chuyển PR sang sẵn sàng và báo cáo.
3. Claude kiểm thử PR của issue, sửa xong thì merge vào nhánh tích hợp. Agent chỉ bắt đầu issue sau khi PR trước đã merge (tách nhánh mới từ nhánh tích hợp đã cập nhật).
4. Hết mốc, Claude mở PR từ nhánh tích hợp vào `main`, chạy hồi quy đầy đủ (`pnpm e2e`, `pnpm lh`), gửi Hoang link xem thử, chờ Hoang đồng ý rồi merge.

`main` chỉ nhận cả mốc đã kiểm, nên bản chạy thật luôn ổn định.

## Quyền của agent

Token GitHub cấp cho agent cần: Contents (đọc và ghi), Issues (đọc và ghi), Pull requests (đọc và ghi). Thiếu quyền mở PR thì agent đẩy nhánh, comment vào issue, gắn `can-hoi`; reviewer sẽ mở PR thay.

Agent không cần tài khoản Vercel. Repo đã nối với dự án Vercel `noteim`: mỗi nhánh đẩy lên tự có link xem thử, bản `main` chạy tại https://noteim-seven.vercel.app.

## Nhãn

| Nhãn | Nghĩa |
| --- | --- |
| `m0` … `m7`, `spike` | Thuộc mốc nào |
| `san-sang` | Issue đã đủ thông tin, agent nhận được |
| `dang-lam` | Agent đang làm |
| `can-hoi` | Agent đang chờ trả lời, không làm tiếp phần liên quan |
| `can-sua` | PR đã kiểm tra, còn điểm phải sửa |
| `cho-hoang` | Chờ Hoang quyết định hoặc duyệt cuối |

## Mẫu issue giao việc

```markdown
## Mục tiêu
Một hoặc hai câu: xong issue này thì người dùng làm được gì.

## Phạm vi
- Việc 1
- Việc 2

## Ngoài phạm vi
- Thứ dễ bị làm lấn sang

## Tài liệu phải đọc
- docs/02-design-system.md, mục …
- docs/03-screens.md, mục …

## Tiêu chí nghiệm thu
- [ ] Tiêu chí kiểm tra được bằng mắt hoặc bằng lệnh
- [ ] …

## Trạng thái phải có
Đang tải, rỗng, lỗi, … (liệt kê cụ thể cho màn hình này)
```

## PR đạt chuẩn

Mẫu mô tả PR:

```markdown
Closes #N

## Đã làm
- …

## Xem thử
Link Vercel: …
Đường dẫn cần xem: /…, /…?debug=1

## Ảnh chụp
Không commit ảnh vào repo. Vercel tự tạo link xem thử cho mỗi lần đẩy nhánh, reviewer tự chụp khi kiểm tra.
Nếu công cụ của bạn đính kèm được ảnh vào comment của PR thì đính kèm ảnh 390px và 1280px, sáng và tối.

## Trạng thái đã kiểm
Mỗi mục phải ghi đã bấm gì và thấy gì. Không được ghi "Đạt (commit)" hay "Đạt (code)" cho mục chưa tự thử.
- [ ] Bình thường  - [ ] Đang tải  - [ ] Rỗng  - [ ] Lỗi  - [ ] Mất mạng

## Tự kiểm
- [ ] `pnpm lint` và `pnpm typecheck` sạch
- [ ] `pnpm build` thành công
- [ ] Không có màu, cỡ chữ, bo góc, thời lượng viết cứng ngoài token
- [ ] Không có chuỗi hiển thị viết cứng ngoài messages/
- [ ] Không component nào import fixtures/ hoặc lib/data/mock
- [ ] Dùng được bằng bàn phím, viền lấy nét nhìn rõ
- [ ] Đã bật "giảm chuyển động" của máy và kiểm tra
- [ ] Đã thêm mục vào docs/LOG.md

## Lệch so với đặc tả
Không có / liệt kê kèm lý do

## Đề xuất
Ý tưởng cải tiến nằm ngoài issue
```

## Claude kiểm tra những gì

1. **Đúng phạm vi.** Không thiếu, không lấn sang issue khác.
2. **Đúng thiết kế.** Token, bố cục, giọng văn, bốn điều cấm trong design system.
3. **Đủ trạng thái.** Dùng `?debug=1` ép từng trạng thái.
4. **Đúng ranh giới dữ liệu.** Mọi dữ liệu đi qua repository.
5. **Chạy được.** Bản dựng trên Vercel thành công, build sạch, không lỗi trong bảng điều khiển trình duyệt, không tràn bố cục ở 390px.
6. **Tiếng Việt.** Dấu hiển thị đúng, không rớt dòng xấu ở tiêu đề, không lẫn tiếng Anh.

## Sổ sách

- **`docs/LOG.md`**: mỗi PR thêm một mục: ngày, issue, đã làm gì, còn dở gì, điều người sau cần biết. Đây là trí nhớ chung giữa các phiên và giữa các agent.
- **`docs/DECISIONS.md`**: mỗi quyết định thay đổi đặc tả ghi một dòng: ngày, quyết định, lý do, ai quyết.
- Đặc tả trong `docs/` là nguồn sự thật. Thay đổi đặc tả đi qua PR riêng, không sửa lẫn trong PR code.

## Khi đặc tả và thực tế mâu thuẫn

Agent không tự chọn. Comment vào issue, gắn `can-hoi`, nêu hai phương án và phương án mình nghiêng về. Trong lúc chờ, làm tiếp các phần không phụ thuộc.
