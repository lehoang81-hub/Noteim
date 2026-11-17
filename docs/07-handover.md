# 07. Bàn giao: nối database thật vào Noteim

Tài liệu này dành cho người nối backend thật sau giai đoạn mockup. Nguồn sự
thật kèm theo: `docs/04-data-contract.md` (kiểu dữ liệu Zod và quy tắc lớp dữ
liệu), `lib/data/repository.ts` (interface các repository — mọi phương thức
dưới đây lấy từ file này), `lib/data/types.ts` (schema Zod).

## 1. Mỗi phương thức Repository: bản giả làm gì, bản thật cần gì

Quy ước đọc bảng: "vào/ra" ghi theo kiểu TypeScript trong `repository.ts`;
"lỗi cần trả" là mã `DataError` (`offline | not_found | quota_exceeded |
server`) mà giao diện đã xử lý sẵn.

### SessionRepository

| Phương thức | Bản giả làm gì | Bản thật cần API | Vào/ra | Lỗi cần trả |
| --- | --- | --- | --- | --- |
| `list(filter?)` | Đọc kho bộ nhớ + localStorage, lọc theo mẫu/tuần/có việc, nhóm không cần — trả mảng `Session` | `GET /sessions?template_id&range&has_open_tasks` | `SessionFilter` → `Session[]` | `offline`, `server` |
| `get(id)` | Tìm fixture theo id, trả `SessionDetail` đầy đủ (tóm tắt, người nói, chủ đề, việc, ghi chú, ảnh) | `GET /sessions/:id` | `id` → `SessionDetail` | `not_found`, `offline` |
| `getTranscript(id)` | Trả mảng đoạn lời của buổi | `GET /sessions/:id/transcript` | `id` → `TranscriptSegment[]` | `not_found` |
| `getVisuals(id)` | Trả dữ liệu tab Hình: dòng thời gian, tỷ lệ nói, sơ đồ Mermaid | `GET /sessions/:id/visuals` (hoặc sinh từ dữ liệu trên) | `id` → `VisualArtifacts` | `not_found` |
| `update(id, patch)` | Gộp_patch vào `detail` (tiêu đề, mẫu, người tham gia, ngày tự xóa), lưu localStorage | `PATCH /sessions/:id` | `Partial<Session>` → `void` | `offline`, `not_found` |
| `updateBullet(sessionId, bulletId, text)` | Sửa chữ một ý tóm tắt, đánh dấu `edited` | `PATCH /sessions/:sid/bullets/:bid` | `text` → `void` | `offline` |
| `updateSegment(sessionId, segmentId, text)` | Sửa lời một đoạn bản ghi, đánh dấu `edited` | `PATCH /sessions/:sid/segments/:seg` | `text` → `void` | `offline` |
| `reassignSegment(sessionId, segmentId, speakerId)` | Đổi người nói của một đoạn | `PATCH /sessions/:sid/segments/:seg` | `speakerId` → `void` | `offline` |
| `nameSpeaker(sessionId, speakerId, contactId)` | Gán liên hệ cho người nói, tên hiện mọi nơi | `POST /sessions/:sid/speakers/:spid/assign` | `contactId` → `void` | `offline` |
| `mergeSpeakers(sessionId, fromId, intoId)` | Gộp hai người nói, chuyển tỉ lệ nói | `POST /sessions/:sid/speakers/merge` | `fromId, intoId` → `void` | `offline` |
| `createFromRecording(draft)` | Nhận bản nháp ghi âm (mốc ghi chú, điểm nóng, ảnh, dải âm lượng), sinh nội dung tóm tắt giả, chạy 5 bước xử lý giả | `POST /sessions` (upload file riêng qua storage; hàng đợi AI tách đoạn) | `RecordingDraft` → `{ id }` | `offline`, `quota_exceeded` |
| `subscribeProcessing(id, onStep)` | Bộ đếm nội bộ 5 bước × 1,6s, thông báo qua callback; tải lại trang vẫn chạy tiếp | Không cần REST: dùng WebSocket/SSE hoặc polling `GET /sessions/:id` | `onStep(step)` | — |
| `retryProcessing(id)` | Chạy lại 5 bước từ đầu | `POST /sessions/:id/retry` | → `void` | `offline` |
| `purgeRaw(ids)` | Xóa bản ghi âm + bản ghi lời của các buổi, trả dung lượng giải phóng | `POST /sessions/purge-raw` (xóa object storage) | `ids[]` → `{ freed_bytes }` | `offline` |
| `remove(id)` | Đánh dấu xóa (giữ để Hoàn tác trong phiên) | `DELETE /sessions/:id` | → `void` | `offline`, `not_found` |
| `restore(id)` | Hoàn tác xóa, trả về đúng vị trí theo ngày tạo | `POST /sessions/:id/restore` | → `void` | `not_found` |
| `reprocess(id, templateId)` | Tóm tắt lại theo mẫu mới, chạy lại 5 bước | `POST /sessions/:id/reprocess` | `templateId` → `void` | `offline` |
| `search(query)` | Tìm xuyên buổi: tiêu đề, tóm tắt, lời nói (so khớp bỏ dấu bằng NFD), việc cần làm | `GET /search?q=` (Postgres: `pg_trgm`/full-text) | `query` → `SearchResult` | `offline` |
| `createFromImport(input)` | Nhận thông tin file có sẵn (không lưu file), sinh buổi ghi đi qua xử lý giả | `POST /sessions/import` | `{ file_name, duration_sec, template_id, language }` → `{ id }` | `offline`, `quota_exceeded` |
| `getSample(profession)` | Trả buổi ghi mẫu theo nghề từ `fixtures/samples/` | Ghi cứng hoặc bảng `sample_sessions` | `Profession` → `SessionDetail` | `not_found` |

### SessionRepository — bổ sung M6, M7

| Phương thức | Bản giả làm gì | Bản thật cần API | Vào/ra | Lỗi cần trả |
| --- | --- | --- | --- | --- |
| `translateSegments(sessionId, lang, segmentIds?)` | Điền bản dịch đoạn lời từ fixture; đoạn chưa có bản dịch điền "bản dịch mẫu" kèm câu gốc (không bịa nội dung). Không kèm `segmentIds` là bật "Xem bản dịch": chỉ điền đoạn chưa có; đoạn đang "Cần dịch lại" giữ nhãn cho đến khi người dùng bấm "Dịch đoạn này" | `POST /sessions/:sid/segments/translate` (hàng đợi AI dịch, model đặt trong cấu hình) | `lang, segmentIds?` → `TranscriptSegment[]` | `offline`, `server` |
| `getSummary(id, lang)` | Bản gốc trả từ detail; bản dịch đọc từ `summary_versions` của buổi | `GET /sessions/:id/summary/:lang` | → `SummaryVersion` | `not_found` |
| `createSummaryVersion(id, lang, onStep)` | Tạo bản dịch tóm tắt qua 2 bước × 1,5s (Dịch tóm tắt, Dịch việc); bản giả giữ câu gốc và đánh dấu `sample`. Gói Free chỉ tạo 1 bản thêm mỗi buổi, bản "Dịch lại" không mất gì thêm | `POST /sessions/:id/summary/:lang` (hàng đợi dịch, webhook khi xong từng bước) | `onStep(1\|2)` → `SummaryVersion` | `offline`, `quota_exceeded`, `server` |
| `updateVersionBullet(sessionId, lang, bulletId, text)` | Sửa một ý trong bản đang xem; bản khác và bản gốc không đổi; bản gốc đã sửa thì bản khác hiện "Bản gốc đã sửa sau khi dịch" | `PATCH /sessions/:sid/summary/:lang/bullets/:bid` | → `void` | `offline`, `not_found` |
| `setVisibility(id, visibility)` | Chỉ người ghi buổi đổi Riêng tư/Cả nhóm; buổi cá nhân luôn riêng tư. Đổi sang "workspace" ghi nhật ký nhóm `share`, đổi lại ghi `unshare` | `PATCH /sessions/:id/visibility` | → `void` | `forbidden` |
| `recordExport(id)` | Ghi nhật ký nhóm `export` khi đang ở không gian Nhóm (nút Sao chép văn bản, Xuất PDF/Word gọi); chỉ người được đọc nội dung mới ghi được dòng | Endpoint xuất thật tự ghi log ở máy chủ | → `void` | — |

### TaskRepository

| Phương thức | Bản giả làm gì | Bản thật cần API | Vào/ra | Lỗi |
| --- | --- | --- | --- | --- |
| `listAll(filter?)` | Gom việc của mọi buổi, lọc "của tôi"; M7 thêm `mine` (lọc "Giao cho tôi") và `lang` (tên việc theo bản tóm tắt của ngôn ngữ đó). Chỉ việc của buổi mình được đọc, theo không gian đang dùng | `GET /tasks?mine=1&lang=ko` | `{ mine?, lang? }` → `ActionItem[]` | `offline` |
| `upsert(item)` | Thêm/sửa một việc (kể cả tạo từ ý tóm tắt) | `PUT /tasks/:id` | `ActionItem` → `void` | `offline` |
| `toggleDone(id)` | Đánh dấu xong/đang làm, ghi `done_at` | `PATCH /tasks/:id/done` | → `ActionItem` | `offline` |

### ChatRepository

| Phương thức | Bản giả làm gì | Bản thật cần API | Vào/ra | Lỗi |
| --- | --- | --- | --- | --- |
| `history(sessionId)` | Trả lịch sử hỏi đáp lưu theo buổi | `GET /sessions/:sid/chat` | → `ChatMessage[]` | `offline` |
| `ask(sessionId, question, onToken)` | Trả câu trả lời giả từng chữ theo mẫu có sẵn, kèm mốc trích dẫn; Free chặn sau 10 câu | `POST /sessions/:sid/chat` (stream SSE) | `onToken(text)` → `ChatMessage` | `offline`, `quota_exceeded` |

### ShareRepository

| Phương thức | Bản giả làm gì | Bản thật cần API | Vào/ra | Lỗi |
| --- | --- | --- | --- | --- |
| `create(sessionId, opts)` | Sinh link giả `share_<random>`, lưu mật khẩu, hạn, phạm vi; M6-04 thêm `languages`: các bản tóm tắt người xem được chọn (mặc định bản gốc) | `POST /sessions/:sid/shares` | `{ scope, expires_at, password?, languages? }` → `ShareLink` | `offline` |
| `revoke(id)` | Đánh dấu thu hồi | `POST /shares/:id/revoke` | → `void` | `offline` |
| `getForSession(sessionId)` | Trả link đang sống của buổi (chưa thu hồi, chưa hết hạn) | `GET /sessions/:sid/share` | → `ShareLink \| null` | `offline` |
| `listAll()` | Mọi link đã tạo, cho mục Quyền riêng tư | `GET /shares` | → `ShareLink[]` | `offline` |
| `recordView(shareId)` | Tăng lượt xem | `POST /shares/:id/view` | → `void` | — |
| `getPublic(shareId, password?, lang?)` | Kiểm thứ tự: thu hồi → hết hạn → cần mật khẩu → trả nội dung công khai; M6-04 thêm `lang`: xem bản tóm tắt theo ngôn ngữ trong `languages` của link, không truyền là bản gốc | `GET /public/shares/:id?lang=ko` (endpoint không cần đăng nhập) | → `PublicSessionView \| "expired" \| "revoked" \| "needs_password" \| "not_found"` | các trạng thái trên là giá trị trả về, không phải exception |

### MailRepository

| Phương thức | Bản giả làm gì | Bản thật cần API | Vào/ra | Lỗi |
| --- | --- | --- | --- | --- |
| `preview(sessionId, recipientContactIds, mode)` | Dựng thư từ tóm tắt/việc theo người nhận; M6-04: tiêu đề, lời chào, chân email và nội dung theo ngôn ngữ của từng người nhận (chip đổi được tại hàng, mặc định theo `preferred_language` của liên hệ), ngôn ngữ chưa có bản thì ghi "Sẽ tạo bản … trước khi gửi" | `POST /mail/preview` | → `EmailDraft[]` (mỗi bản có `lang`) | `offline` |
| `send(drafts)` | Gửi giả, ghi `send_history` vào buổi; cờ "Gửi email lỗi một người" ép 1 người thất bại; M7: đang ở không gian Nhóm thì ghi nhật ký `send_email` | `POST /mail/send` (Resend/SES) | `EmailDraft[]` → `{ contact_id, ok }[]` | `offline` |

### AccountRepository

| Phương thức | Bản giả làm gì | Bản thật cần API | Vào/ra | Lỗi |
| --- | --- | --- | --- | --- |
| `me()` | Đọc hồ sơ từ `fixtures/user.json`, áp cờ nghề/gói của bảng thử nghiệm | `GET /me` | → `User` | `offline` |
| `updateMe(patch)` | Gộp patch, lưu localStorage | `PATCH /me` | `Partial<User>` → `void` | `offline` |
| `quota()` | Hạn mức từ `fixtures/quota.json`; Pro 1.200 phút/tháng | `GET /me/quota` | → `Quota` | `offline` |
| `templates()` | 6 mẫu từ `fixtures/templates.json` (kèm trường tiếng Anh `*_en`) | `GET /templates` | → `Template[]` | `offline` |
| `contacts()` | Danh bạ từ fixture | `GET /contacts` | → `Contact[]` | `offline` |
| `glossary()` | Từ điển tên riêng | `GET /me/glossary` | → `GlossaryTerm[]` | `offline` |
| `addGlossaryTerm(term)` | Thêm từ; trùng (bỏ hoa thường) trả từ cũ | `POST /me/glossary` | → `GlossaryTerm` | `offline` |
| `updateGlossaryTerm(id, term)` | Sửa một từ | `PATCH /me/glossary/:id` | → `void` | `offline` |
| `removeGlossaryTerm(id)` | Xóa một từ | `DELETE /me/glossary/:id` | → `void` | `offline` |
| `addContact(input)` | Tạo liên hệ trong ô chọn tên | `POST /contacts` | `{ name, email? }` → `Contact` | `offline` |
| `updateContact(id, patch)` | Sửa liên hệ (thêm email tại hàng người nhận); M6-04 thêm `preferred_language`: ngôn ngữ ưa dùng khi gửi biên bản | `PATCH /contacts/:id` | → `void` | `offline` |
| `contactUsage(id)` | Liệt kê buổi đang dùng liên hệ làm người nói (cảnh báo trước xóa) | `GET /contacts/:id/usage` | → `string[]` (session ids) | `offline` |
| `removeContact(id)` | Xóa liên hệ; người nói gán liên hệ này trả về "Người nói N" | `DELETE /contacts/:id` | → `void` | `offline` |
| `updateTemplate(id, patch)` | Bật/tắt, đổi thứ tự phần của mẫu; M6-04: tên mẫu/tên phần/câu hỏi gợi ý là `LocalizedText` (map theo ngôn ngữ, bắt buộc có `vi`), thiếu ngôn ngữ rơi về Anh rồi Việt | `PATCH /templates/:id` | `{ sections }` → `void` | `offline` |
| `exportAll()` | Xuất toàn bộ kho ra JSON tải về | `GET /me/export` | → `Record<string, unknown>` | `offline` |

### WorkspaceRepository (M7-01, M7-03)

Quyền kiểm ở repository, bản giả cũng kiểm: thao tác ngoài vai trò ném
`DataError` mã `forbidden` — bản thật map lỗi Postgres/RLS về cùng bộ mã.

| Phương thức | Bản giả làm gì | Bản thật cần API | Vào/ra | Lỗi cần trả |
| --- | --- | --- | --- | --- |
| `list()` | Mọi không gian của người dùng; không gian Cá nhân đi gói theo người dùng | `GET /workspaces` | → `Workspace[]` | `offline` |
| `switchTo(id)` | Đổi không gian đang dùng (phải là thành viên đang hoạt động) | `POST /me/current-workspace` | → `void` | `forbidden`, `not_found` |
| `create(input)` | Tạo nhóm: sinh `w-new-*`, thêm thành viên Chủ (chính người tạo), chuyển sang dùng ngay | `POST /workspaces` | `{ name, profession, default_report_language }` → `Workspace` | `offline` |
| `update(id, patch)` | Đổi tên, nghề chính, ngôn ngữ báo cáo mặc định — Chủ và Quản trị | `PATCH /workspaces/:id` | → `void` | `forbidden`, `not_found` |
| `remove(id)` | Xóa nhóm — chỉ Chủ; buổi ghi của nhóm về không gian Cá nhân của từng người ghi và đổi thành riêng tư; nhật ký xóa theo nhóm | `DELETE /workspaces/:id` (cascade members, audit) | → `void` | `forbidden`, `not_found`, `server` (không xóa được Cá nhân) |
| `members(id)` | Danh sách thành viên và lời mời — mọi thành viên đọc được | `GET /workspaces/:id/members` | → `Member[]` | `forbidden` |
| `invite(id, email, role)` | Mời bằng email: kiểm định dạng, không mời làm Chủ, không trùng người đã trong nhóm, không vượt số chỗ (`seat_limit`); tên hiển thị tạm theo email; lời mời hết hạn sau 7 ngày; ghi nhật ký `invite` | `POST /workspaces/:id/invites` (gửi email mời thật) | → `Member` | `forbidden`, `server` (email sai, trùng), `quota_exceeded` (hết chỗ) |
| `revokeInvite(id, email)` | Thu hồi lời mời đang chờ; ghi nhật ký `remove_member` | `DELETE /workspaces/:id/invites/:email` | → `void` | `forbidden`, `not_found` |
| `changeRole(id, userId, role)` | Đổi vai trò giữa Quản trị và Thành viên — không đổi được Chủ, không đặt ai thành Chủ bằng cách này; ghi nhật ký `role_change` | `PATCH /workspaces/:id/members/:uid` | → `void` | `forbidden`, `not_found` |
| `removeMember(id, userId)` | Gỡ thành viên — không gỡ được Chủ; buổi riêng tư của người bị gỡ về không gian Cá nhân của họ, buổi đã chia sẻ ở lại nhóm; ghi nhật ký `remove_member` | `DELETE /workspaces/:id/members/:uid` | → `void` | `forbidden`, `not_found` |
| `transferOwnership(id, userId)` | Chuyển quyền Chủ — chỉ Chủ; người cũ thành Quản trị, `owner_user_id` đổi; ghi nhật ký `role_change` | `POST /workspaces/:id/transfer-ownership` | → `void` | `forbidden`, `not_found` |
| `leave(id)` | Tự rời nhóm — Thành viên và Quản trị; Chủ phải chuyển quyền Chủ hoặc xóa nhóm trước; buổi riêng tư của người rời về Cá nhân, xong quay về Cá nhân; ghi nhật ký `remove_member` | `POST /workspaces/:id/leave` | → `void` | `forbidden`, `not_found` |
| `setSeats(id, seats)` | Đổi số chỗ của gói Nhóm (giả lập) — chỉ Chủ; không giảm dưới số thành viên đang có, không dưới 1 | `PATCH /workspaces/:id/seats` | → `void` | `forbidden`, `not_found`, `server` (giảm dưới hiện có) |
| `getInvite(token)` | Xem lời mời theo token: tên nhóm, ai mời; `"expired"` khi hết hạn (thật hoặc cờ thử nghiệm), `"not_found"` khi token lạ. Token bản giả sinh xác định từ email (`lib/team/invite-token.ts`); bản thật: token do máy chủ sinh, lưu ở bản ghi lời mời | `GET /invites/:token` (không cần đăng nhập) | → `{ workspace, invited_by } \| "expired" \| "not_found"` | — |
| `acceptInvite(token)` | Nhận lời mời: thành invited thành active; hết hạn ném lỗi, hết chỗ ném `quota_exceeded` | `POST /invites/:token/accept` | → `void` | `not_found`, `server` (hết hạn), `quota_exceeded` |
| `usage(id, month)` | Mức dùng theo người: số buổi, số phút, việc mở của từng thành viên trong tháng — **tính cả buổi riêng tư của từng người** (bảng quyền cho phép thấy tên và thời lượng để tính mức dùng), chỉ ra số, không lộ tiêu đề. Chủ và Quản trị đọc được, Thành viên ném `forbidden` | `GET /workspaces/:id/usage?month=2026-11` (máy chủ tính, không trả nội dung) | → `UsageRow[]` | `forbidden` |
| `audit(id, filter?)` | Nhật ký truy cập: lọc theo người và loại, mới nhất trước. Chủ và Quản trị đọc được, Thành viên ném `forbidden` | `GET /workspaces/:id/audit?actor=&action=` | → `AuditEvent[]` | `forbidden` |
| `invoices(id)` | Hóa đơn mẫu của gói Nhóm: Chủ có, Quản trị xem, Thành viên không | `GET /workspaces/:id/invoices` | → `Invoice[]` | `forbidden`, `not_found` |

### DashboardRepository (M7-02)

| Phương thức | Bản giả làm gì | Bản thật cần API | Vào/ra | Lỗi cần trả |
| --- | --- | --- | --- | --- |
| `get(range)` | Tổng quan cá nhân: Cần xử lý (việc quá hạn/đến hạn hôm nay, người nói chưa đặt tên, bản gốc sắp tự xóa, link sắp hết hạn, buổi xử lý lỗi), câu tổng kết tuần/tháng, dải giọng theo ngày, quyết định đã chốt (ý thuộc chủ đề nhãn "decided" trong khoảng), người gặp nhiều, theo mẫu, hạn mức. Chỉ tính từ buổi mình được đọc trong không gian đang dùng; không đếm nội dung buổi riêng tư của người khác | `GET /dashboard?range=week\|month` | → `DashboardData` | `offline` |
| `team(range)` | Bảng Nhóm: mức dùng theo người (như `usage`, tính cả buổi riêng tư của từng người — chỉ ra số) và việc mở/quá hạn theo người phụ trách. Chỉ Chủ và Quản trị trong không gian Nhóm; sai vai trò ném `forbidden` | `GET /dashboard/team?range=` (máy chủ tính từ dữ liệu nhóm) | → `{ usage, open_tasks_by_assignee }` | `forbidden` |

## 2. Những gì đang giả

- **Ghi âm**: chỉ đo âm lượng (4 mẫu/giây) để vẽ dải giọng; KHÔNG lưu file âm
  thanh. Bản nháp (`RecordingDraft`) giữ mốc ghi chú, điểm nóng, ảnh (pixel
  ảnh nằm ở IndexedDB, `lib/record/photo-store.ts`) và dải âm lượng trong
  localStorage. Bản thật: ghi MediaRecorder, upload từng đoạn 5 giây lên
  storage (bài thử SPIKE-01 trong `06-roadmap.md`).
- **Xử lý AI**: 5 bước × 1,6 giây là bộ đếm giờ; tóm tắt, chủ đề, việc cần làm
  lấy từ fixture hoặc sinh cú pháp từ bản nháp (`lib/data/mock/generate.ts`).
  Bản thật: đường ống AI (chia đoạn buổi dài, model đặt trong cấu hình).
- **Hỏi AI**: trả lời giả từng chữ từ `fixtures/generated/*.json` — bản thật
  gọi model, stream từng token, trả mốc trích dẫn.
- **Dịch (M6)**: bản dịch đoạn lời và bản tóm tắt nhiều ngôn ngữ đọc từ fixture
  (buổi họp đối tác Hàn có sẵn bản tiếng Hàn); chỗ chưa có bản thì bản giả giữ
  câu gốc và đánh dấu `sample` — giao diện ghi rõ "Bản dịch mẫu", không bịa
  nội dung. Bản thật cần:
  - **Model dịch**: tên model đặt trong cấu hình máy chủ (không hardcode vào
    giao diện); dịch theo từng đoạn có mốc giờ để trích dẫn vẫn nhảy đúng chỗ.
  - **Chi phí**: dịch theo ký tự/ngôn ngữ đích; mỗi bản tóm tắt là một lần gọi
    (gói Free 1 bản thêm mỗi buổi, Pro không giới hạn — khớp hạn mức bên trên).
  - **Cache bản dịch**: bản dịch đã tạo lưu vĩnh viễn ở `summary_versions` và
    `translations` của đoạn lời; không dịch lại khi mở lại trang. Bản gốc sửa
    sau khi dịch thì bản dịch đánh dấu `stale` và chỉ dịch lại khi người dùng
    chủ động bấm "Dịch lại" (cả bản) hoặc "Dịch đoạn này" (từng đoạn) — đừng
    tự dịch lại toàn bộ, tốn chi phí vô ích. Câu trích nguyên văn luôn giữ câu
    gốc trong ngoặc kép, bản dịch đặt dưới (bằng chứng pháp lý không được thay).
- **Gửi email**: `send()` luôn thành công (trừ cờ ép lỗi), chỉ ghi lịch sử —
  bản thật cần nhà cung cấp email và xác minh tên miền; mỗi người nhận một thư
  theo ngôn ngữ của họ (M6-04), đang ở không gian Nhóm thì ghi thêm nhật ký.
- **Link công khai**: lưu trong localStorage của người tạo; máy chủ không có.
  Trang `/p/[shareId]` kiểm mật khẩu/hạn/lượt xem trên dữ liệu giả. Bản thật:
  bảng shares + endpoint công khai + RLS (mục 3).
- **Thanh toán**: màn "Bản mockup chưa nối thanh toán" — chưa có gì cả.
- **Đăng nhập**: không có. Một người dùng mẫu (`fixtures/user.json`), không
  session, không quyền. Bản thật cần Supabase Auth (email + OAuth).

## 3. Đề xuất bảng database (Supabase/Postgres)

Suy từ schema Zod trong `lib/data/types.ts`; tên cột trùng tên trường
snake_case sẵn có.

```sql
-- Hồ sơ mở rộng của auth.users
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  honorific text check (honorific in ('anh','chi')), -- giá trị 'chị' lưu đúng dấu hoặc map
  email text not null,
  profession text not null check (profession in ('business_owner','doctor','lawyer','realestate_sales','architect','notary','other')),
  default_template_id uuid,
  plan text not null default 'free' check (plan in ('free','pro')),
  ui_language text not null default 'vi' check (ui_language in ('vi','en')),
  theme text not null default 'system' check (theme in ('light','dark','system')),
  consent_reminder boolean not null default true,
  consent_announcement text,
  auto_filter_silence boolean default false,
  onboarded_at timestamptz
);

create table templates (
  id uuid primary key default gen_random_uuid(),
  profession text not null,
  name text not null,
  name_en text,
  footer_note text,
  footer_note_en text,
  suggested_questions jsonb not null default '[]',
  suggested_questions_en jsonb,
  sort_order int not null default 0
);

create table template_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references templates on delete cascade,
  title text not null,
  title_en text,
  enabled boolean not null default true,
  sort_order int not null default 0
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  workspace_id uuid,
  title text not null default '',
  template_id uuid references templates,
  language text not null default 'vi',
  output_language text not null default 'vi',
  status text not null check (status in ('recording','unsynced','processing','ready','failed')),
  processing_step int check (processing_step between 1 and 5),
  failure_reason text,
  storage_status text not null default 'full' check (storage_status in ('full','essence_only')),
  duration_sec int not null default 0,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now(),
  audio_expires_at timestamptz,          -- null: giữ bản gốc (Pro)
  consent jsonb not null default '{"confirmed":false,"announced":false}',
  peaks_thumb jsonb not null,            -- mảng 40 số
  speaker_colors_thumb jsonb not null,   -- mảng 40 số nguyên 0..5
  headline_tag jsonb,
  open_task_count int not null default 0,
  is_sample boolean not null default false
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  name text not null,
  role text,
  email text
);

create table session_participants (       -- participant_contact_ids
  session_id uuid references sessions on delete cascade,
  contact_id uuid references contacts on delete cascade,
  primary key (session_id, contact_id)
);

create table speakers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions on delete cascade,
  contact_id uuid references contacts,    -- null: chưa đặt tên
  display_name text not null,
  is_me boolean not null default false,
  color_index int not null check (color_index between 0 and 5),
  talk_ratio_percent int not null default 0,
  sample_start_sec numeric not null default 0
);

create table topics (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions on delete cascade,
  section_id uuid references template_sections,
  title text not null,
  start_sec numeric not null,
  end_sec numeric not null,
  tag text not null check (tag in ('decided','pending','risk','idea','figure'))
);

create table bullets (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references topics on delete cascade,
  text text not null,
  timestamp_sec numeric not null,
  speaker_id uuid references speakers,
  is_quote boolean not null default false,
  edited boolean not null default false,
  note_ids jsonb not null default '[]'
);

create table transcript_segments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions on delete cascade,
  speaker_id uuid references speakers,
  start_sec numeric not null,
  end_sec numeric not null,
  text text not null,
  edited boolean not null default false
);

create table action_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions on delete cascade,
  task text not null,
  assignee_contact_id uuid references contacts,
  due_date date,
  priority text not null default 'medium' check (priority in ('high','medium','low')),
  done boolean not null default false,
  done_at timestamptz,
  source_quote text,
  timestamp_sec numeric
);

create table session_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions on delete cascade,
  timestamp_sec numeric not null,
  text text not null
);

create table bookmarks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions on delete cascade,
  timestamp_sec numeric not null,
  tag text check (tag in ('decided','pending','risk','idea','figure'))
);

create table photos (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions on delete cascade,
  timestamp_sec numeric not null,
  storage_path text not null,             -- object storage, thay cho url data
  caption text
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions on delete cascade,
  role text not null check (role in ('user','ai')),
  text text not null,
  citations jsonb not null default '[]',  -- [{timestamp_sec}]
  created_at timestamptz not null default now()
);

create table shares (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions on delete cascade,
  scope text not null check (scope in ('summary','summary_audio')),
  password_hash text,                     -- null: không mật khẩu
  expires_at timestamptz,
  revoked boolean not null default false,
  view_count int not null default 0,
  created_at timestamptz not null default now()
);

create table glossary_terms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles on delete cascade,
  term text not null,
  note text
);

create table quota_periods (              -- hạn mức theo tháng của người dùng
  user_id uuid references profiles on delete cascade,
  period_end date not null,
  minutes_used numeric not null default 0,
  minutes_limit numeric not null,
  max_session_minutes numeric not null,
  chat_questions_per_session int,
  primary key (user_id, period_end)
);

-- ---------- Bổ sung M6, M7 (docs/04 "Bổ sung M6, M7") ----------

-- M7: không gian làm việc. Mỗi người luôn có một hàng kind='personal'.
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'team' check (kind in ('personal','team')),
  name text not null,
  profession text,                        -- null với Cá nhân
  default_report_language text not null default 'vi' check (default_report_language in ('vi','en','ko')),
  plan text not null default 'free' check (plan in ('free','pro','team')),
  seat_limit int,                         -- null: không giới hạn (Free/Pro cá nhân)
  owner_user_id uuid not null references profiles on delete cascade
);

-- M7: thành viên và lời mời. Lời mời là hàng user_id null, status 'invited'.
create table members (
  workspace_id uuid not null references workspaces on delete cascade,
  user_id uuid references profiles on delete cascade,
  email text not null,
  display_name text,
  role text not null check (role in ('owner','admin','member')),
  status text not null check (status in ('active','invited')),
  invited_at timestamptz not null default now(),
  invite_expires_at timestamptz,          -- null với thành viên đã vào
  primary key (workspace_id, email)       -- một email một dòng trong mỗi nhóm
);
create unique index members_one_ws_per_user
  on members (workspace_id, coalesce(user_id, email));

-- M7: nhật ký truy cập của nhóm. Chỉ ghi thêm, không sửa không xóa.
create table audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  actor_user_id uuid references profiles on delete set null,
  action text not null check (action in
    ('view','share','unshare','export','delete','invite','remove_member','role_change','purge','send_email')),
  target_type text not null check (target_type in ('session','member','workspace','share_link')),
  target_id text not null,
  target_label text not null,             -- tiêu đề buổi/email tên, hiển thị thô
  at timestamptz not null default now()
);
create index audit_events_ws_time on audit_events (workspace_id, at desc);

-- M6: bản tóm tắt theo ngôn ngữ. Bản gốc nằm trong sessions.structured_summary,
-- mỗi bản dịch một hàng, khóa (session_id, lang).
create table summary_versions (
  session_id uuid not null references sessions on delete cascade,
  lang text not null check (lang in ('vi','en','ko')),
  source text not null check (source in ('original','translated')),
  translated_from text check (translated_from in ('vi','en','ko')),
  created_at timestamptz not null default now(),
  stale boolean not null default false,   -- bản gốc đã sửa sau khi dịch
  structured_summary jsonb not null,      -- executive_summary, topics, task_texts
  primary key (session_id, lang)
);

-- M6/M7: cột thêm vào bảng cũ.
alter table profiles
  add column default_speech_language text not null default 'vi' check (default_speech_language in ('vi','en','ko')),
  add column auto_detect_languages boolean not null default true,
  add column default_report_language text not null default 'vi' check (default_report_language in ('vi','en','ko')),
  add column auto_translate_on_send boolean not null default true;
alter table profiles alter column ui_language type text;  -- mở check thêm 'ko'
alter table profiles alter column ui_language drop check;

alter table sessions
  add column primary_language text not null default 'vi' check (primary_language in ('vi','en','ko')),
  add column detected_languages jsonb not null default '["vi"]',   -- gồm cả primary_language
  add column report_languages jsonb not null default '["vi"]',     -- các bản tóm tắt đã có
  add column visibility text not null default 'private' check (visibility in ('private','workspace')),
  add column owner_user_id uuid references profiles;               -- người ghi, phục vụ nhóm

alter table contacts
  add column preferred_language text check (preferred_language in ('vi','en','ko'));  -- null: theo mặc định

alter table glossary_terms
  add column variants jsonb not null default '{}';  -- cách viết ở ngôn ngữ khác, ví dụ {"ko":"빈홈즈 마리나"}

alter table shares
  add column languages jsonb not null default '[]'; -- các bản người xem được chọn

alter table action_items
  add column assignee_user_id uuid references profiles;  -- giao cho thành viên nhóm (ngoài liên hệ)

-- M6: templates đổi từ các cột *_en sang LocalizedText (một map jsonb, bắt buộc
-- có "vi"), và mẫu dùng chung của nhóm:
-- alter table templates alter column name type jsonb using jsonb_build_object('vi', name);
-- (tương tự name_en, footer_note, suggested_questions; template_sections.title)
alter table templates add column workspace_id uuid references workspaces on delete cascade;  -- null là mẫu hệ thống
-- Nhóm có bản sao riêng của 6 mẫu hệ thống để bật/tắt không đụng nhau.
```

Chính sách bảo mật theo hàng (RLS):

```sql
alter table sessions enable row level security;
-- Người dùng thấy và sửa buổi của mình
create policy "sessions_owner" on sessions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Trang công khai: ai cũng đọc được buổi đã chia sẻ và chưa thu hồi/hết hạn.
-- Thực hiện bằng hàm bảo mật để không lộ các buổi khác:
create or replace function can_view_session(sid uuid) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from shares s
    join sessions se on se.id = s.session_id
    where s.session_id = sid and not s.revoked
      and (s.expires_at is null or s.expires_at > now())
  );
$$;
create policy "sessions_public_view" on sessions for select
  using (can_view_session(id));

-- shares: người tạo đọc/sửa link của mình; mọi người (anon) chỉ được kiểm
-- trạng thái qua hàm security definer, không đọc thẳng bảng.
alter table shares enable row level security;
create policy "shares_owner" on shares for all
  using (session_id in (select id from sessions where user_id = auth.uid()))
  with check (session_id in (select id from sessions where user_id = auth.uid()));

-- ---------- RLS bổ sung M7: nhóm và nhiều ngôn ngữ ----------

-- Hai hàm kiểm vai trò, dùng chung cho mọi policy dưới đây:
create or replace function is_member_of(ws uuid, uid uuid) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from members m
    where m.workspace_id = ws and m.user_id = uid and m.status = 'active');
$$;
create or replace function is_workspace_admin(ws uuid, uid uuid) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from members m
    where m.workspace_id = ws and m.user_id = uid and m.status = 'active'
      and m.role in ('owner','admin'));
$$;

-- workspaces: thành viên đọc; Chủ sửa. Xóa nhóm, chuyển quyền Chủ, đổi số
-- chỗ đi qua RPC security definer để kiểm thêm "chỉ Chủ".
alter table workspaces enable row level security;
create policy "workspaces_member_read" on workspaces for select
  using (owner_user_id = auth.uid() or is_member_of(id, auth.uid()));
create policy "workspaces_owner_write" on workspaces for update
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "workspaces_owner_insert" on workspaces for insert
  with check (owner_user_id = auth.uid());

-- members: ai trong nhóm cũng đọc được danh sách (trang Thành viên); mời, đổi
-- vai trò, gỡ, thu hồi lời mời qua RPC security definer kiểm is_workspace_admin
-- (Quản trị không đổi được vai trò của Chủ) và giới hạn chỗ của gói.
alter table members enable row level security;
create policy "members_team_read" on members for select
  using (is_member_of(workspace_id, auth.uid()));
create policy "members_self_row" on members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());  -- chỉ display_name của mình

-- sessions trong nhóm: buổi visibility='workspace' thì mọi thành viên nhóm đọc;
-- buổi riêng tư chỉ người ghi (owner_user_id) — kể cả Chủ và Quản trị cũng
-- KHÔNG đọc được nội dung, đây là điểm bán hàng của sản phẩm (docs/08 phần B).
-- Policy "sessions_owner" ở trên đổi điều kiện sang owner_user_id.
alter table sessions drop policy if exists "sessions_owner";
create policy "sessions_owner" on sessions for all
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "sessions_team_view" on sessions for select
  using (
    visibility = 'workspace'
    and workspace_id is not null
    and is_member_of(workspace_id, auth.uid())
  );

-- summary_versions và các bảng con của buổi (bullets, transcript_segments,
-- action_items...) đọc theo quyền của buổi cha: trong policy, thay điều kiện
-- cũ "user_id = auth.uid()" bằng một hàm can_read_session(sid uuid) gộp cả
-- ba đường: người ghi, buổi chia sẻ cả nhóm, buổi có link công khai còn sống.
create or replace function can_read_session(sid uuid) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from sessions s
    where s.id = sid
      and (
        s.owner_user_id = auth.uid()
        or (s.visibility = 'workspace' and s.workspace_id is not null
            and is_member_of(s.workspace_id, auth.uid()))
        or can_view_session(sid)
      ));
$$;
alter table summary_versions enable row level security;
create policy "summary_versions_read" on summary_versions for select
  using (can_read_session(session_id));
create policy "summary_versions_owner_write" on summary_versions for all
  using (exists (select 1 from sessions s where s.id = summary_versions.session_id
                 and s.owner_user_id = auth.uid()))
  with check (exists (select 1 from sessions s where s.id = summary_versions.session_id
                 and s.owner_user_id = auth.uid()));

-- audit_events: chỉ Chủ và Quản trị đọc (M7-03, docs/08 bảng quyền "Nhật ký
-- truy cập"); ghi bằng hàm security definer gọi từ endpoint các thao tác
-- (xem, chia sẻ, xuất, xóa, mời, gỡ, đổi vai trò, dọn bản gốc, gửi email).
-- Không ai sửa hay xóa dòng nào.
alter table audit_events enable row level security;
create policy "audit_admin_read" on audit_events for select
  using (is_workspace_admin(workspace_id, auth.uid()));

-- Mức dùng và hóa đơn: máy chủ tính (mức dùng đếm cả buổi riêng tư của từng
-- người, chỉ trả số — bảng quyền cho phép). Đọc qua RPC security definer
-- get_workspace_usage(ws uuid, month text) / get_workspace_invoices(ws uuid)
-- kiểm is_workspace_admin bên trong; không mở policy select thẳng để không
-- ai đọc được hàng của người khác qua bảng trung gian.
```

Ghi chú bảo mật: mật khẩu link băm (bcrypt/argon2) ở `shares.password_hash`;
điểm cộng lượt xem qua RPC `record_view` (security definer, chỉ tăng số).
File âm thanh và ảnh đặt ở object storage (Supabase Storage), bucket riêng
theo `user_id`, đường dẫn kiểm bằng policy `storage.objects`.

Ghi chú bảo mật bổ sung M7:

- **Điểm bán hàng quyền riêng tư phải giữ nguyên khi nối backend**: "quản trị
  không đọc được nội dung buổi ghi riêng tư, kể cả Chủ" — policy
  `sessions_team_view` ở trên chỉ mở `visibility='workspace'`, không có ngoại
  lệ cho vai trò. Mức dùng thấy được tên và thời lượng vì máy chủ tự tính số
  (security definer), không mở nội dung.
- Nhật ký ghi ở **mọi** thao tác trong đặc tả (xem, chia sẻ/gỡ chia sẻ, xuất,
  xóa buổi, dọn bản gốc, mời, gỡ thành viên, đổi vai trò, gửi email), kể cả
  thao tác có từ trước khi nhóm ra đời — chỉ ghi khi đang ở không gian Nhóm.
- Token lời mời: bản thật do máy chủ sinh và lưu ở `members` (bản giả sinh
  xác định từ email, `lib/team/invite-token.ts`); trang `/join/[token]` là
  endpoint không cần đăng nhập, chỉ trả tên nhóm, ai mời và trạng thái hết hạn.
- Dữ liệu người dùng (buổi ghi, liên hệ) **không dịch**: chỉ chuỗi hệ thống
  (mẫu, phần, gợi ý câu hỏi) là `LocalizedText`. Thiếu ngôn ngữ rơi về Anh rồi
  Việt — hàm gộp viết một nơi, dùng chung cho mọi bảng jsonb.

## 4. Cách đổi nguồn dữ liệu

Mọi giao diện chỉ import `lib/data` (`index.ts`) — file này là nơi DUY NHẤT
chọn nguồn. Các bước nối Supabase:

1. Tạo `lib/data/supabase/` với các file cài đặt từng repository, hiện thực
   đúng interface trong `lib/data/repository.ts` (máy khách: `@supabase/
   ssr` — cần duyệt thêm thư viện trước khi thêm).
2. Trong `lib/data/index.ts`, đổi:
   ```ts
   export const data: DataSource = mockSource;
   ```
   thành chọn theo biến môi trường, ví dụ:
   ```ts
   export const data: DataSource =
     process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase" ? supabaseSource : mockSource;
   ```
3. Giữ nguyên mock để bảng thử nghiệm (`?debug=1`) và môi trường không có
   database vẫn chạy được.
4. Kiểm sau khi đổi:
   - Thư viện hiện đủ 8 buổi mẫu; mở chi tiết đúng tab Lời có đủ đoạn.
   - Ghi âm xong đi qua 5 bước và có tóm tắt; sửa lời, đổi người nói còn
     nguyên sau khi tải lại.
   - Tạo link chia sẻ → mở trang công khai ở trình duyệt khác; sai mật khẩu
     báo lỗi; thu hồi xong trang báo đã thu hồi.
   - Gửi biên bản ghi `send_history`; xóa buổi có Hoàn tác trả lại đúng chỗ.
   - Các trạng thái lỗi ép được bằng bảng thử nghiệm (`?debug=1`): mất mạng,
     tải chậm, lỗi tải, hết hạn mức, thư viện rỗng.
   - Nhiều ngôn ngữ (M6): mở buổi họp Hàn, ô "Tóm tắt bằng" tạo bản tiếng Anh
     được; sửa ý ở bản gốc thì bản Hàn hiện "Bản gốc đã sửa sau khi dịch";
     gửi biên bản cho ông Park nhận thư tiếng Hàn; trang công khai đổi ngôn
     ngữ được; tìm thấy nội dung ở cả bản dịch.
   - Nhóm (M7): tạo nhóm, mời → mở `/join/[token]` ở trình duyệt khác để nhận
     lời mời; đổi không gian thì thư viện, việc, tổng quan theo không gian;
     buổi riêng tư của người khác chỉ hiện tên + thời lượng ở mức dùng, mở
     trực tiếp bằng id thì báo không có quyền; Thành viên mở `/team/usage`,
     `/team/audit`, `/team/billing` nhận "không có quyền"; gỡ thành viên xong
     buổi riêng tư của họ về thư viện cá nhân của họ, buổi đã chia sẻ ở lại
     nhóm; nhật ký đủ dòng cho mọi thao tác kể trên.

Lưu ý từ mock hiện tại: lỗi trả về bằng `DataError` với mã
`offline | not_found | quota_exceeded | forbidden | server` — giao diện bắt
theo mã này, bản thật cần map lỗi HTTP/Supabase về cùng bộ mã; `forbidden`
(M7) ném từ repository khi vai trò không đủ, giao diện chỉ hiện màn "không có
quyền" khi gặp đúng mã này.

## 5. Bài học trong `AGENTS.md` người làm backend cần biết

- **Dữ liệu đi qua repository**: component không bao giờ import fixture hay
  gọi Supabase trực tiếp. Bổ sung phương thức mới thì sửa
  `repository.ts` trước, hai bản cài đặt cùng hiện thực.
- **Ngày "bây giờ"** lấy từ `dataNow()` — mockup cố định 14/11/2026 19:00 để
  dữ liệu mẫu khớp. Bản thật trả về `now()` của máy chủ, nhưng mọi phép so
  hạn/nhóm ngày vẫn phải đi qua lớp này.
- **Độ trễ và lỗi giả**: 300–800ms mỗi lần đọc và các mã lỗi giữ nguyên ở
  bản thật (độ trễ thật của mạng thay thế). Trạng thái đang tải/rỗng/lỗi của
  giao diện phụ thuộc vào chúng.
- **Bộ nhớ trình duyệt**: ảnh lớn và file ghi âm nằm IndexedDB
  (`lib/record/photo-store.ts`), không đưa vào localStorage (giới hạn ~5MB).
  Mọi lần ghi phải bắt lỗi và báo người dùng (dải "Bộ nhớ đầy"), không im
  lặng. Bản thật: file lên object storage, localStorage không còn dữ liệu lớn.
- **Giảm chuyển động**: mọi hiệu ứng phải tôn trọng `prefers-reduced-motion`
  (dùng `useReducedMotionSafe()`), kể cả hiệu ứng do máy chủ trả về.
- **Chạm thật**: cử chỉ vuốt/nhấn giữ cần `touch-action` phù hợp,
  `setPointerCapture`, và phải thử bằng sự kiện chạm thật (Playwright
  `has_touch` + CDP `Input.dispatchTouchEvent`), không thử bằng chuột.
- **Tiếng Việt là ngôn ngữ chính**: mọi chuỗi hiển thị nằm trong
  `messages/vi.json`/`en.json`; dữ liệu hệ thống (mẫu, phần, gợi ý câu hỏi)
  có trường `*_en` trong bảng tương ứng. Dữ liệu người dùng không dịch.
- **Khả năng tiếp cận**: giữ mốc `<main>`, nhãn cho mọi nút chỉ có biểu
  tượng, vùng chạm từ 44px, tương phản từ token — Lighthouse a11y từng route
  đạt 100 ở mockup, nối backend không được làm tụt.
- **Hiệu năng**: không nạp thư viện vẽ (Recharts, Mermaid) vào chunk khởi
  tạo — đã tách bằng `next/dynamic`; bảng số liệu thay thế cho biểu đồ phải
  có; ảnh không làm lệch bố cục (CLS).

## 6. Điểm Lighthouse Hiệu năng còn dưới 85 và việc cần làm khi nối backend

Đo đúng cách sau khi sửa theo review PR #41 (mục 1): Chrome có `--user-data-dir`
với người dùng **đã làm quen** (localStorage có dữ liệu), `lighthouse --port
--disable-storage-reset`, **xóa bộ nhớ đệm HTTP trước mỗi lần**
(`Network.clearBrowserCache`), lấy **trung vị 5 lần** (bản main lấy trung vị 3
lần), mobile, CPU chậm 4x + mạng 4G, kiểm `finalDisplayedUrl` đúng route đang
đo. Ngày đo 2026-11-16, bản build `pnpm build && pnpm start` ở máy.

| Route | Perf main | Perf nhánh M5 | LCP main→M5 (ms) | TBT main→M5 (ms) | CLS |
| --- | --- | --- | --- | --- | --- |
| `/` | 76 | 73 | 4 705→4 896 | 368→361 | 0,0 |
| `/s/[id]` | 68 | 70 | 4 899→5 040 | 545→481 | 0 |
| `/record` | 78 | 82 | 4 269→4 082 | 339→250 | 0 |
| `/search` | 80 | 93 | 2 918→3 019 | 326→142 | 0,163→0 |
| `/settings` | 86 | 89 | 3 522→3 213 | 239→177 | 0 |
| `/p/[id]` | 78 | 79 | 4 049→4 175 | 336→300 | 0 |
| `/welcome` | 88 | 92 | 2 985→3 021 | 310→168 | 0 |

Bốn route còn dưới 85 — nguyên nhân còn lại và việc cần làm khi nối backend:

### `/` (73) và `/s/[id]` (70)

- **Nguyên nhân còn lại**: nội dung chính của hai màn là **dữ liệu người dùng
  render phía client**, nên LCP phải chờ trình duyệt tải, phân tích và chạy JS
  trên CPU chậm 4x rồi mới vẽ. Độ trễ giả 300 đến 800ms **không phải** nút thắt:
  reviewer đặt độ trễ về 0 rồi đo lại, điểm gần như không đổi (`/` 76 đến 77,
  `/s` 73 đến 78). Đã xử lý phần nằm trong phạm vi mockup: fixture buổi ghi và
  Zod nạp bằng `import()` động (chunk khởi tạo của `/` giảm 362,6 xuống
  279,4 KB đã nén, không còn dữ liệu mẫu), Motion dùng `LazyMotion` + `m.*`.
  TBT giảm (545 xuống 481 ms ở `/s`), LCP chưa đổi đáng kể vì vẫn phải chạy
  JS mới có nội dung.
- **Việc cần làm khi nối backend**: render phần đầu của danh sách/tóm tắt
  **phía server** (SSR hoặc streaming) để HTML đầu tiên đã có nội dung, LCP
  không còn phụ thuộc thời gian chạy JS. Không cần đổi giao diện — các màn đã
  có khung chờ và trạng thái rỗng/lỗi đầy đủ. LCP mục tiêu sau khi nối: dưới
  2,5s (điểm dự kiến 90+).

### `/record` (82)

- **Nguyên nhân còn lại**: màn luôn tối, hydrate nhiều component (máy ghi,
  dải thời gian, canvas). TBT đã giảm 339→250 ms và SI 2 855→1 646 ms nhờ
  bảng xin quyền micro dựng sẵn từ máy chủ; phần còn lại là chi phí hydrate.
- **Việc cần làm khi nối backend**: chuyển phần tĩnh của màn ghi sang server
  component, chỉ hydrate máy ghi; đo lại sau khi Recharts/Mermaid đã ở chunk
  riêng (đã xong từ M3).

### `/p/[id]` (79)

- **Nguyên nhân còn lại**: trang công khai render phía client như mọi route
  khác, phải chạy JS rồi mới vẽ tóm tắt.
- **Việc cần làm khi nối backend**: link không mật khẩu có thể **cache tĩnh
  (ISR)** hoặc render server kèm header cache; link có mật khẩu giữ render
  client sau khi nhập mật khẩu.

### Bổ sung M6 (2026-11-17, nhánh `m6/da-ngon-ngu`, cùng phương pháp đo)

Trung vị 3 lần, người dùng đã làm quen, xóa cache HTTP mỗi lần, kiểm
`finalDisplayedUrl` — 21/21 lần đo đều đúng route. Bản đo trên nhánh M6.

| Route | Perf M5 | Perf M6 | LCP M5→M6 (ms) | Ghi chú |
| --- | --- | --- | --- | --- |
| `/` | 73 | 69 | 4 896→5 000 | Thư viện nạp 9 buổi (thêm buổi họp Hàn ~69 KB kèm bản tóm tắt tiếng Hàn) |
| `/s/[id]` | 70 | 68 | 5 040→5 300 | Thêm ô "Tóm tắt bằng": bản gốc vẽ ngay từ detail, bản dịch mới chờ fetch |
| `/record` | 82 | 76 | 4 082→4 200 | Bảng "Bắt đầu ghi" thêm dòng ngôn ngữ; lệch còn lại là hydrate (như trên) |
| `/search` | 93 | 88 | 3 019→3 400 | Tìm kiếm mở rộng trên mọi bản tóm tắt và bản dịch đoạn lời |
| `/settings` | 89 | 88 | 3 213→3 000 | Thêm mục "Ngôn ngữ báo cáo" |
| `/p/[id]` | 79 | 80 | 4 175→4 400 | Trang công khai có nút đổi ngôn ngữ |
| `/welcome` | 92 | 91 | 3 021→3 100 | — |

Khả năng tiếp cận: **100/100 ở cả 7 route** (Lighthouse Accessibility, yêu cầu
M6-04 là từ 95). Bài học M6: một nhãn "한국어" hiển thị ở giao diện Việt/Anh là
tải phông Hàn 2 MB (Pretendard) → LCP trang chi tiết và công khai tăng 4,4s lên
~14s. Sửa bằng cách dùng tên ngôn ngữ theo ngôn ngữ giao diện ("tiếng Hàn") ở
chip và nút đổi ngôn ngữ; phông Hàn chỉ tải khi trang thật sự có chữ Hàn
(unicode-range). Khi nối backend: giữ nguyên quy tắc này, không đặt tên gốc
tiếng Hàn vào các nhãn điều khiển ở giao diện khác ngôn ngữ.

### Bổ sung M7 (2026-11-18, nhánh `m7/04-ban-giao`, cùng phương pháp đo)

Trung vị 3 lần, người dùng đã làm quen, xóa cache HTTP mỗi lần, kiểm
`finalDisplayedUrl`, `--cats performance,accessibility`. Route mới của M7:
`/dashboard` (M7-02), `/team/members` (M7-03) — `/team/members` chưa có số mốc,
lần đầu ghi đây. Mốc M6 lấy từ bảng trên (vi).

| Route | Perf vi (mốc) | Perf vi M7 | Perf ko | A11y | LCP vi→ko (s) | Font vi→ko (KB) |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | 69 | 71 | 70 | 100 | 5,27→5,97 | 124→288 |
| `/s/s-bds-lan` | 68 | 72 | 65 | 100 | 5,29→5,85 | 141→321 |
| `/dashboard` | 71 (M7-02) | 76 | 70 | 100 | 4,95→5,35 | 124→347 |
| `/team/members` | chưa có | 75 | 75 | 100 | 4,93→5,71 | 116→257 |

Không route nào tụt so với mốc: `/` +2, `/s` +4 điểm so với M6; `/dashboard` +5
điểm so với M7-02. TBT giảm ở mọi route (thư viện 398 ms, chi tiết 374 ms so
với 368/481 ms của M5). A11y 100/100 cả 8 lần đo.

Ghi chú tiếng Hàn: điểm Perf ko thấp hơn vi 5–7 điểm ở `/s` và `/dashboard` do
phông Hàn (Pretendard, subset theo unicode-range) nạp thêm 160–230 KB cho các
chữ Hàn của giao diện và của tên mẫu; LCP ko chênh vi 0,4–0,7 s, cùng mức chênh
đã chốt ở M6 (0,35–0,69 s). Mục tiêu "< 300 KB phông cho `/` ko" của M6 giờ là
288 KB (thêm chữ của giao diện nhóm M7) — vẫn dưới đích. Khi nối backend: nếu
thêm ngôn ngữ mới, nhớ đo lại cả hai ngôn ngữ cho route mới, phông nạp theo
unicode-range tự mở rộng theo chữ dùng thật.



## 7. Ghi chú M6, M7 — nội dung tiếng Hàn

Toàn bộ chuỗi giao diện tiếng Hàn (`messages/ko.json`) và nội dung dữ liệu mẫu
tiếng Hàn (buổi họp đối tác Hàn `fixtures/sessions/hop-doi-tac-han.json`, tên
mẫu và tên phần trong `fixtures/templates.json`) do agent viết theo giọng lịch
sự trang trọng (합니다체). M7 thêm khoảng 70 khóa nhóm (không gian, mời, vai trò,
nhật ký, mức dùng, hóa đơn, gói Nhóm) cùng giọng đó.

**Trước khi ra mắt thật cần người bản ngữ đọc lại**, đặc biệt: chuỗi xin đồng ý
ghi âm, email gửi đối tác, điều khoản thanh toán trong buổi họp mẫu; thêm của
M7: lời mời tham gia nhóm (`/join/[token]`, email mời), nhãn vai trò (Chủ,
Quản trị, Thành viên), hộp xác nhận gỡ thành viên và rời nhóm, câu quyền riêng
tuất "quản trị không đọc được nội dung buổi ghi riêng tư", gói Nhóm và hóa đơn.

**Font Hàn**: Pretendard 1.3.9 (OFL) tự host `public/fonts/pretendard/` — 92
file subset chính thức, mỗi file một `unicode-range` (dùng chung qua
`styles/pretendard-subset.css`); chỉ các subset chứa chữ thật sự dùng trên trang
được nạp (bài học M6: một file variable 2 MB làm LCP giao diện ko lên ~14s;
bản subset còn 257–347 KB mỗi route). Khi nối backend: giữ nguyên cách nạp theo
unicode-range, thêm ngôn ngữ mới thì thêm file subset tương ứng, không quay lại
file duy nhất. Danh sách vị trí chuỗi Hàn cần rà nằm trong PR M6 và PR này.

## 8. Nghe sạch (M8) — khi nối thật

Đặc tả ở `docs/09-nghe-sach.md`. Nguyên tắc: chỉ lưu MỘT file gốc, không tạo
bản sạch lưu riêng — "Nghe sạch" là chế độ phát, dựa trên bản đồ nghe tính
trước một lần. Tải file, gửi biên bản, xuất file, link công khai luôn dùng bản
gốc; lấy bằng chứng (luật, công chứng, y tế) dùng câu Nguyên văn.

**Kiểu dữ liệu và repository** (đã có ở mockup): `ListeningMap`
(`silences`, `fillers`, `speaker_gain_db`, `noise_level`, `clean_duration_sec`),
`TranscriptSegment.text_clean` (+ `words` khi có mốc thật),
`User.listening_prefs`, `SessionRepository.getListeningMap(id)` — null là buổi
chưa có dữ liệu. Bản đồ nghe thành cột JSONB của bảng `sessions` (khoảng vài
KB, tính một lần khi xử lý); `listening_prefs` thành cột của `profiles`.

**B2 — ghi âm**: lưu dạng nén giọng nói (Opus khoảng 24 đến 32 kbps, khoảng 10
đến 15 MB mỗi giờ), chỉ một file gốc.

**B3 — cùng lượt AI nhận dạng**: lọc ồn tạm cho AI nghe (không lưu bản đã
lọc), lấy mốc thời gian từng chữ (`TranscriptSegment.words` — thay hàm chia
đều theo ký tự `lib/listening/words.ts`), tách người nói, đánh dấu tiếng đệm,
sinh `text_clean` (bản gọn bỏ đệm, lặp, vấp), tính `ListeningMap` (VAD cho
khoảng lặng, mức âm lượng trung bình theo người nói cho `speaker_gain_db`).
Mockup sinh bản đồ bằng `scripts/gen-listening-map.mjs` từ `speaker_spans`,
`transcript` và `peaks` để dữ liệu mẫu có sẵn.

**Lúc nghe — Web Audio API**:
- Cân âm lượng: `GainNode` theo người nói đang phát, mức từ
  `speaker_gain_db` (người nói nhỏ được tăng tối đa +9 dB, to giảm tới -6 dB).
- Lọc ồn: bộ lọc nhẹ chạy trong `AudioWorklet` (ví dụ RNNoise bản WASM) —
  công tắc chỉ đổi trạng thái ở mockup, bản thật nối vào đây.
- Bỏ qua khoảng lặng/tiếng đệm: `seek` theo bản đồ. Mockup đã làm đúng cách
  này: đồng hồ phát nhận danh sách khoảng bỏ qua (`Player.setSkips` trong
  `lib/player/mock-player.ts`, gộp khoảng chồng lấp ở `lib/listening/skips.ts`)
  — bản thật giữ nguyên cách di chuyển kim, chỉ thay phần phát âm thanh, và
  thanh thời gian vẫn theo thời gian gốc.
- Chữ chạy theo: mốc từng chữ thật thay cho chia đều theo ký tự; bảng "Bản
  gọn/Nguyên văn" hiển thị theo `text_clean`/`text` như mockup đã làm.

**Cần thử ở B0**: iPhone khóa màn hình có giữ được Web Audio không; nếu không,
khi khóa màn hình chỉ giữ nhảy khoảng lặng và cân âm lượng đơn giản.
