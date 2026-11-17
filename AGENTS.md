# Luật làm việc cho coding agent

Bạn đang xây **mockup tương tác** của Noteim. Mục tiêu của giai đoạn này là để chủ sản phẩm cầm điện thoại bấm thử toàn bộ luồng và duyệt giao diện, trước khi tốn công nối database và AI.

## Trước khi viết dòng code nào

1. Đọc issue được giao. Chỉ làm đúng phạm vi issue đó.
2. Đọc `docs/02-design-system.md` và phần màn hình liên quan trong `docs/03-screens.md`.
3. Đọc 20 dòng cuối của `docs/LOG.md` để biết phiên trước dừng ở đâu.

## Luật cứng

- **Không gọi API thật.** Không Supabase, không Gemini, không gửi email, không thanh toán. Mọi dữ liệu đi qua lớp `lib/data` mô tả trong `docs/04-data-contract.md`.
- **Component không được import fixture trực tiếp.** Chỉ gọi qua repository. Đây là điều kiện để sau này đổi sang database mà không sửa giao diện.
- **Không tự chọn màu, cỡ chữ, bo góc, thời lượng chuyển động.** Chỉ dùng token trong design system. Thiếu token thì hỏi, không tự thêm.
- **Mobile trước.** Thiết kế và kiểm tra ở bề ngang 390px trước, rồi mới tới 1280px.
- **Tiếng Việt có dấu là ngôn ngữ chính.** Mọi chuỗi hiển thị nằm trong file ngôn ngữ, không viết cứng trong component.
- **Mỗi màn hình phải có đủ trạng thái**: đang tải, rỗng, lỗi, và trạng thái bình thường. Thiếu một trạng thái là chưa xong.
- **Không thêm thư viện** ngoài danh sách ở `docs/04-data-contract.md` mục "Công nghệ" khi chưa được duyệt trong issue.
- **Không commit thẳng vào `main`.** Mỗi issue một nhánh, một PR.
- **Không xóa hay viết lại tài liệu sẵn có** (`README.md`, `docs/`) ngoài phạm vi issue. Được thêm mục mới, không được thay nội dung cũ.
- **Không commit ảnh chụp vào repo.** Link xem thử của Vercel thay cho ảnh.

## Chống mất việc khi máy làm việc bị reset (đọc trước khi bắt đầu)

Máy của agent đã bị xóa sạch giữa chừng ở M4, M5, M6 (mất code chưa push, mất script kiểm thử, mất nội dung subagent viết). Quy tắc:

1. **Chỉ GitHub là bền.** Thứ gì chưa push coi như chưa có.
2. **Làm theo bước nhỏ.** Mỗi issue chia sẵn thành các bước (xem comment "Các bước" trên issue). Mỗi bước tối đa khoảng 45 phút làm việc, kết thúc bằng `pnpm lint` + `pnpm typecheck` sạch, commit, **push ngay**. Thông điệp: `M7-01 bước 2/6: <việc>`. `pnpm build` chạy ở bước cuối của issue và bất cứ khi nào đổi cấu hình, font, route.
3. **Mở PR nháp ngay sau lần push đầu tiên** của issue. Thân PR là danh sách các bước dạng ô tích; tích sau mỗi lần push. Đây là chỗ để biết làm tới đâu khi phải bắt đầu lại.
4. **Nội dung lớn commit ngay khi viết xong**, trước khi viết code dùng nó: fixture, bản dịch, dữ liệu mẫu, `messages/*.json`. Subagent viết xong phải ghi ra file và commit; đừng để kết quả chỉ nằm trong ngữ cảnh.
5. **Kiểm thử và đo nằm trong repo**, không viết lại mỗi lần: thêm bài vào `tests/e2e/` (Playwright, dùng `tests/e2e/helpers.ts`), đo bằng `pnpm lh` (`scripts/lighthouse.mjs`). Bài kiểm thử commit cùng bước làm tính năng đó.
6. **Máy yếu (khoảng 4 GB).** Không chạy dev và bản build cùng lúc; không để tiến trình nền dài (hay bị giết); Lighthouse chạy từng lần, `--disable-dev-shm-usage`; Playwright `workers: 1`.

### Bắt đầu lại sau khi bị reset

```bash
git clone https://github.com/lehoang81-hub/Noteim && cd Noteim
git checkout <nhánh issue đang làm>      # tên nhánh ở PR nháp
pnpm install
git log --oneline -8                      # bước cuối đã push
gh pr view <số PR> --json body -q .body   # ô tích: bước nào chưa xong
```

Làm tiếp từ bước chưa tích đầu tiên. Không làm lại bước đã push. Nếu bước dở dang bị mất, làm lại riêng bước đó.

### Chạy kiểm thử

```bash
pnpm build && pnpm start -p 3100          # một cửa sổ
pnpm e2e                                  # hồi quy, cửa sổ khác
pnpm lh --lang vi --runs 3 / /s/s-bds-lan # đo, in bảng Markdown dán vào PR
```

Không có trình duyệt Playwright thì đặt `PW_CHROMIUM_PATH` tới Chrome có sẵn.

## Bài học đã rút ra (đọc kỹ, đều là lỗi đã gặp)

- **Dữ liệu:** màn hình đọc qua `useData(() => data.xxx(), [deps])` từ `@/lib/data`. Ghi qua `data.xxx` rồi để màn hình tự tải lại (lớp dữ liệu phát sự kiện khi đổi). Ngày "bây giờ" lấy từ `dataNow()`, không dùng `new Date()` để nhóm ngày hay so hạn.
- **Giảm chuyển động:** dùng `useReducedMotionSafe()` từ `@/lib/use-reduced-motion`. Không dùng `useReducedMotion` của Motion, nó gây lỗi hydrate (React #418).
- **Sáng tối:** không dùng tiện ích `dark:` trong `components/`. Mọi khác biệt nằm trong token. Muốn ép một vùng luôn tối (ví dụ màn hình ghi âm), thêm class `dark` cho vùng đó.
- **Canvas:** đọc màu bằng `tokenColor(el, "--ten-token")` trong `components/ribbon/draw.ts`, đọc một lần mỗi khi đổi giao diện, không đọc trong từng khung hình.
- **Hiệu năng:** không đổi `opacity` hay `transform` của phần tử có `blur` trong từng khung hình. Đo bằng Chrome giả lập CPU chậm gấp 4 trước khi báo xong.
- **Bảng thử nghiệm:** mỗi trạng thái mới (lỗi, rỗng, giới hạn) phải ép được bằng `?debug=1`. Thêm cờ vào `lib/debug/flags.ts` và nút vào `components/shell/debug-panel.tsx`.
- **Bộ nhớ trình duyệt:** ảnh và dữ liệu lớn để trong IndexedDB, không để trong localStorage (giới hạn khoảng 5 MB). Mọi lần ghi bộ nhớ phải bắt lỗi và báo người dùng, không được im lặng.
- **Motion:** các nhánh điều kiện (`a ? <motion.div/> : <motion.div/>`) phải có `key` riêng, nếu không React dùng lại một instance và phần tử thừa hưởng kích thước đang dở của nhánh trước.
- **Kiểm thử tự động:** trang bật cuộn mượt; trước khi đo vị trí, cuộn bằng `behavior: "instant"`.
- **Chữ:** mọi chuỗi hiển thị nằm trong `messages/vi.json` và `messages/en.json`, hai file phải có cùng khóa.
- Thao tác vuốt và nhấn giữ trên điện thoại: khung nhận cử chỉ cần `touch-action: pan-y` (hoặc phù hợp), gọi `setPointerCapture`, và phải thử bằng sự kiện chạm thật (Playwright `has_touch` + CDP `Input.dispatchTouchEvent`), không thử bằng chuột.
- Giá trị mặc định phụ thuộc nhiều lần `useData` thì chờ đủ tất cả rồi mới đặt; độ trễ giả 300 đến 800ms làm thứ tự về không cố định.
- Đo Lighthouse: người dùng đã làm quen (Chrome `--user-data-dir`, cùng origin), `--disable-storage-reset`, xóa cache HTTP trước mỗi lần, lấy trung vị, kiểm `finalDisplayedUrl`.
- Chuỗi tiếng Anh có số đếm dùng ICU plural (`{count, plural, one {# session} other {# sessions}}`).
- `pnpm lint` giờ chạy thêm `scripts/check-rules.mjs`: dấu chấm giữa, gạch dài trong `messages/`, `dark:`, nhãn in hoa sẽ làm lint thất bại. Đừng tắt hay lách; sửa chữ.

## Khi không chắc

Dừng lại và hỏi bằng một comment trong issue, gắn nhãn `can-hoi`. Nêu rõ: bạn đang phân vân giữa những phương án nào và bạn nghiêng về phương án nào. Đừng đoán rồi làm tiếp phần phụ thuộc vào câu trả lời.

## Khi xong

Làm theo danh sách kiểm trong `docs/05-workflow.md` mục "PR đạt chuẩn". Tóm tắt: PR có link xem thử Vercel, danh sách trạng thái đã kiểm, và một mục mới trong `docs/LOG.md`. Không commit ảnh chụp vào repo.

## Quyền đề xuất

Bạn được khuyến khích đề xuất cải tiến tương tác nhỏ, phím tắt, tối ưu hiệu năng. Ghi đề xuất vào mục "Đề xuất" cuối PR. Đừng tự làm nếu nó nằm ngoài issue.
