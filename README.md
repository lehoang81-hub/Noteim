# Noteim

Trợ lý ghi âm, tóm tắt và giao việc cho người đi làm tại Việt Nam: chủ doanh nghiệp, bác sĩ, luật sư, sale bất động sản, kiến trúc sư, công chứng viên.

Giai đoạn hiện tại: **mockup tương tác đầy đủ** (chạy bằng dữ liệu giả, chưa nối database, chưa gọi AI thật).

## Đọc theo thứ tự này

| Tài liệu | Nội dung |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Luật làm việc cho AI coding agent. Đọc trước tiên. |
| [docs/01-product-brief.md](docs/01-product-brief.md) | Sản phẩm là gì, cho ai, phạm vi mockup |
| [docs/02-design-system.md](docs/02-design-system.md) | Màu, chữ, chuyển động, component, giọng văn |
| [docs/03-screens.md](docs/03-screens.md) | Từng màn hình, trạng thái, tương tác |
| [docs/04-data-contract.md](docs/04-data-contract.md) | Kiểu dữ liệu, lớp dữ liệu giả, cách nối database sau này |
| [docs/05-workflow.md](docs/05-workflow.md) | Quy trình giao việc và kiểm tra qua GitHub |
| [docs/06-roadmap.md](docs/06-roadmap.md) | Các mốc M0–M5 và tiêu chí nghiệm thu |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Sổ quyết định |
| [docs/LOG.md](docs/LOG.md) | Nhật ký bàn giao giữa các phiên làm việc |

## Vai trò

- **Hoang**: chủ sản phẩm. Duyệt cuối trên điện thoại, bấm merge.
- **Claude (reviewer)**: viết đặc tả, mở issue giao việc, kiểm tra PR, mở issue tiếp theo.
- **Coding agent**: nhận issue, làm trên nhánh riêng, mở PR kèm link xem thử và ảnh chụp.
