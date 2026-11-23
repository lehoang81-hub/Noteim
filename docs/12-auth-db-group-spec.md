# 12. Đặc tả chặng C1 — Tài khoản, Cơ sở dữ liệu bền vững và Quản lý nhóm

Trạng thái: ĐÃ DUYỆT phương án tổng thể + 10 điểm mở + 3 yêu cầu bổ sung + cập nhật lưu trữ Cloudflare R2 (anh chốt ngày 20/11/2026).
Ngày soạn: 20/11/2026 (Hà Nội).
Phạm vi: đưa Noteim từ mockup lưu tạm thành sản phẩm thương mại lưu trữ bền vững: đăng nhập, database thật, dashboard cá nhân, không gian nhóm, phân quyền, tuân thủ dữ liệu nhạy cảm.
Liên quan: `docs/04-data-contract.md` (kiến trúc dữ liệu — chặng này bổ sung, không thay nội dung cũ), `docs/08-da-ngon-ngu-va-nhom.md` phần B (M7 nhóm), `docs/gap-check-spec-v1.1.md` (GC-04/05), `docs/DECISIONS.md`.

---

## 0. Truy vết các quyết định đã chốt

### 0.1 Mười điểm mở — tất cả đã chốt ngày 20/11/2026

| # | Quyết định | Nội dung chốt |
|---|---|---|
| 1 | Nền DB và ORM | **Supabase Postgres + Drizzle ORM**. Supabase chỉ dùng như một Postgres (không dùng Auth, không dùng RLS của Supabase) |
| 2 | Đăng nhập mở màn | **Google OAuth là cửa chính**. Dùng next-auth v4 nếu tương thích Next 16; nếu vướng thì dựng module Google OAuth + cookie httpOnly tối giản (ưu tiên nhẹ) |
| 3 | Vai trò Trợ lý | Thêm vai trò **assistant** ngay ở pha C1-B (PR 09) |
| 4 | Trợ lý ghi hộ | Cho phép: buổi của Trợ lý gắn vào thư mục nhóm để chuyên viên thấy metadata; kèm nhật ký |
| 5 | Chế độ ẩn danh | **Giữ**, giới hạn 3 buổi / 30 phút tổng ghi trên máy |
| 6 | Hạn mức | Free 180 phút/tháng (giữ số mockup); giữ băng gốc: Free 90 ngày, Pro 12 tháng; giá các gói để "…" |
| 7 | Di trú trùng dữ liệu | Ghép thêm (append) theo id; trùng id giữ bản mới hơn theo `created_at`; báo kết quả "đã ghép X buổi" |
| 8 | Audit log | Giữ **12 tháng**, tải CSV trước khi hết hạn |
| 9 | Duyệt thư viện | next-auth v4, drizzle-orm + drizzle-kit, driver `postgres` (postgres.js), resend (Email OTP — PR sau), @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner (R2) |
| 10 | Giáo dục ở C1 | Chỉ chọn nghề giáo viên/học sinh + gợi ý mẫu; gói "Lớp học tương tác 1–30" để B5 làm trọn |

### 0.2 Ba yêu cầu bổ sung của anh

| # | Yêu cầu | Nơi cài đặt |
|---|---|---|
| 1 | Chia C1 thành 2 pha: **C1-A (PR 01→07)** mở cửa cho người dùng thật đăng ký ngay sau PR 07; **C1-B (PR 08→12)** nhóm, Trợ lý, biên nhận, audit, quyền riêng tư | §4 |
| 2 | Tránh giới hạn 4,5 MB thân yêu cầu của Vercel Serverless: file ghi âm và ảnh tải **trực tiếp từ trình duyệt lên Cloudflare R2 qua Presigned Upload URL**, không đi vòng qua API Route của Next.js (PR 04 và PR 05) | §1.5 |
| 3 | Nút nâng cấp gói + **Mã kích hoạt (Promo/License Code)** trên khối Hạn mức để cấp gói Pro/Edu thủ công cho nhóm khách hàng sớm (PR 07) | §3.5 |

### 0.3 Cập nhật sau duyệt — lưu trữ file dùng Cloudflare R2

# 12. Đặc tả chặng C1 — Tài khoản, Cơ sở dữ liệu bền vững và Quản lý nhóm

Trạng thái: ĐÃ DUYỆT phương án tổng thể + 10 điểm mở + 3 yêu cầu bổ sung + cập nhật lưu trữ Cloudflare R2 (anh chốt ngày 20/11/2026).
Ngày soạn: 20/11/2026 (Hà Nội).
Phạm vi: đưa Noteim từ mockup lưu tạm thành sản phẩm thương mại lưu trữ bền vững: đăng nhập, database thật, dashboard cá nhân, không gian nhóm, phân quyền, tuân thủ dữ liệu nhạy cảm.
Liên quan: `docs/04-data-contract.md` (kiến trúc dữ liệu — chặng này bổ sung, không thay nội dung cũ), `docs/08-da-ngon-ngu-va-nhom.md` phần B (M7 nhóm), `docs/gap-check-spec-v1.1.md` (GC-04/05), `docs/DECISIONS.md`.

---

## 0. Truy vết các quyết định đã chốt

### 0.1 Mười điểm mở — tất cả đã chốt ngày 20/11/2026

| # | Quyết định | Nội dung chốt |
|---|---|---|
| 1 | Nền DB và ORM | **Supabase Postgres + Drizzle ORM**. Supabase chỉ dùng như một Postgres (không dùng Auth, không dùng RLS của Supabase) |
| 2 | Đăng nhập mở màn | **Google OAuth là cửa chính**. Dùng next-auth v4 nếu tương thích Next 16; nếu vướng thì dựng module Google OAuth + cookie httpOnly tối giản (ưu tiên nhẹ) |
| 3 | Vai trò Trợ lý | Thêm vai trò **assistant** ngay ở pha C1-B (PR 09) |
| 4 | Trợ lý ghi hộ | Cho phép: buổi của Trợ lý gắn vào thư mục nhóm để chuyên viên thấy metadata; kèm nhật ký |
| 5 | Chế độ ẩn danh | **Giữ**, giới hạn 3 buổi / 30 phút tổng ghi trên máy |
| 6 | Hạn mức | Free 180 phút/tháng (giữ số mockup); giữ băng gốc: Free 90 ngày, Pro 12 tháng; giá các gói để "…" |
| 7 | Di trú trùng dữ liệu | Ghép thêm (append) theo id; trùng id giữ bản mới hơn theo `created_at`; báo kết quả "đã ghép X buổi" |
| 8 | Audit log | Giữ **12 tháng**, tải CSV trước khi hết hạn |
| 9 | Duyệt thư viện | next-auth v4, drizzle-orm + drizzle-kit, driver `postgres` (postgres.js), resend (Email OTP — PR sau), @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner (R2) |
| 10 | Giáo dục ở C1 | Chỉ chọn nghề giáo viên/học sinh + gợi ý mẫu; gói "Lớp học tương tác 1–30" để B5 làm trọn |

### 0.2 Ba yêu cầu bổ sung của anh

| # | Yêu cầu | Nơi cài đặt |
|---|---|---|
| 1 | Chia C1 thành 2 pha: **C1-A (PR 01→07)** mở cửa cho người dùng thật đăng ký ngay sau PR 07; **C1-B (PR 08→12)** nhóm, Trợ lý, biên nhận, audit, quyền riêng tư | §4 |
| 2 | Tránh giới hạn 4,5 MB thân yêu cầu của Vercel Serverless: file ghi âm và ảnh tải **trực tiếp từ trình duyệt lên Cloudflare R2 qua Presigned Upload URL**, không đi vòng qua API Route của Next.js (PR 04 và PR 05) | §1.5 |
| 3 | Nút nâng cấp gói + **Mã kích hoạt (Promo/License Code)** trên khối Hạn mức để cấp gói Pro/Edu thủ công cho nhóm khách hàng sớm (PR 07) | §3.5 |

### 0.3 Cập nhật sau duyệt — lưu trữ file dùng Cloudflare R2

Lưu trữ băng ghi âm và ảnh dùng **Cloudflare R2** thay cho Supabase Storage (database vẫn là Supabase Postgres + Drizzle như đã chốt). Lý do: 10 GB miễn phí, **0 đồng phí băng thông nghe lại**, có **Lifecycle tự xóa** file quá hạn. Kết nối qua `@aws-sdk/client-s3` (API S3-tương thích) + `@aws-sdk/s3-request-presigner`. Chi tiết §1.5.
### 0.4 Cập nhật nhịp 2 — 4 yêu cầu bổ sung của anh (21/11/2026)

1. **Không đưa khóa Supabase ra trình duyệt** — ghi vào §1.3 (quy ước khóa chỉ chạy máy chủ) và tiêu chí nghiệm thu §6.
2. **DB và R2 đặt vùng Singapore** — ghi vào §1.3 (Supabase) và §1.5 (R2 bucket).
3. **Chuyển `lib/gap-check/store.ts` (Map bộ nhớ) sang bảng `session_gap_checks`** — vốn đã có trong schema §1.4 và lộ trình PR 04; nhịp 2 làm rõ đây là việc bắt buộc của PR 04, không phải tùy chọn.
4. **Quyết định nhà cung cấp AI cho Gap Check**: `z-ai-web-dev-sdk` giữ đầu chuỗi. Hoang chốt 22/11: Z.ai **dùng cả cho dữ liệu thật**, chạy đến khi lỗi hoặc hết lượt miễn phí thì chuỗi tự chuyển sang Gemini, rồi Anthropic. Lưu ý kỹ thuật: SDK chỉ chạy khi có file `.z-ai-config` (máy agent); trên Vercel không có file này nên bản production tự dùng bên dự phòng. Không commit file đó lên repo. Điều kiện pháp lý trước khi mở cho người dùng thật: chính sách quyền riêng tư phải ghi rõ dữ liệu được gửi tới nhà cung cấp AI ở nước ngoài (Z.ai: Trung Quốc; Google, Anthropic: Mỹ) và lập hồ sơ chuyển dữ liệu ra nước ngoài theo Luật 91/2025; Gemini phải dùng bản trả phí (bản miễn phí dùng dữ liệu để cải thiện sản phẩm); thêm chuỗi dự phòng `GAP_CHECK_PROVIDERS` (chi tiết §5 mục "Nhà cung cấp AI").

---

## 1. Phương án kỹ thuật

### 1.1 Đăng nhập (Auth)

**Cửa chính là Google OAuth, một chạm.** Email OTP/Magic link (Resend) là cửa phụ, làm PR riêng khi có nhu cầu thực. Không dùng SMS/Zalo OTP (chi phí, phụ thuộc nhà cung cấp), không dùng mật khẩu truyền thống.

Hai phương án cài, chốt ngay bước 1 của PR 01:

| Phương án | Điều kiện chọn | Ghi chú |
|---|---|---|
| **next-auth v4 (Auth.js)** | Cài thử chạy được với Next 16.4.6 + React 19, không lỗi build/hydrate | Đã được duyệt vào danh sách thư viện |
| **Module Google OAuth tối giản tự dựng** | next-auth v4 vướng tương thích Next 16 | Luồng authorization code của Google + cookie httpOnly ký HMAC, khoảng 200 dòng, không thêm thư viện; bảng users/auth tự giữ như schema §1.4 |

Chi tiết phiên:

- **JWT trong cookie** `noteim.session` — httpOnly, Secure, SameSite=Lax, sống 30 ngày có gia hạn trượt. Không cần bảng phiên trong DB, ít truy vấn mỗi request; audit không phụ thuộc bảng session.
- Middleware bảo vệ: mọi `/api/**` ghi dữ liệu yêu cầu phiên hợp lệ; người ẩn danh chỉ được gọi gap-check với mã khách như hiện tại.
- Đăng xuất: xóa cookie, về màn thư viện chế độ ẩn danh (dữ liệu trên máy nếu có).

**Chế độ ẩn danh giữ nguyên** (triết lý "bấm 2 lần là ghi"): mở app là ghi được, dữ liệu nằm trên máy. Giới hạn ẩn danh: 3 buổi / 30 phút tổng ghi — chặn ở màn bắt đầu ghi khi vượt, kèm dải nhắc đăng nhập. Điểm bắt buộc có tài khoản: dùng không gian Nhóm, vượt hạn mức ẩn danh, và mọi gói trả phí.

Bí mật môi trường (Vercel env, không commit khóa — đúng §8 đặc tả B4): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `DATABASE_URL`.

### 1.2 Di trú dữ liệu dùng thử lên tài khoản

Nguyên tắc: **di trú một lần, có xác nhận, không mất buổi, giữ nguyên mọi id.**

Luồng khi đăng nhập lần đầu và kho `localStorage` (`noteim-mock-db-v1`) có dữ liệu thật:

1. Bảng xác nhận ngắn: "Ghim N buổi ghi đang có trên máy vào tài khoản?" — nút [Ghim vào tài khoản] / [Bỏ — bắt đầu trống].
2. Bấm Ghim: client đóng gói kho → `POST /api/migrate-local`, payload qua Zod dùng lại đúng schema `lib/data/types.ts` (nguồn sự thật hiện có).
3. Máy chủ: gán `user_id` mới, **giữ nguyên mọi id** (session, folder, contact, glossary, action item…) nên không vỡ tham chiếu (note_ids, speaker, folder.session_ids, gap_check, pending_ai_questions); ghi 1 dòng audit `migrate`; trả về số đối tượng đã nhận.
4. Ảnh và băng Blob trong IndexedDB **tải thẳng lên R2 qua Presigned Upload URL** (yêu cầu bổ sung 2 — §1.5), kèm thanh tiến độ; vượt dung lượng cho phép thì giữ blob trên máy và ghi chú trong buổi.
5. Client dọn `noteim-mock-db-v1`, chuyển nguồn dữ liệu sang remote (đúng cơ chế chọn nguồn ở `lib/data/index.ts`), tải lại.

Biên:

- **Buổi đang ghi dở** (RecordingDraft): vẫn nằm IndexedDB, tự lên DB khi lưu buổi — không đụng luồng ghi.
- **Nhiều tab**: di trú single-flight bằng cờ trong sessionStorage; tab khác chỉ chờ kết quả.
- **Tài khoản đã có dữ liệu, ghép thêm máy khác**: append hết theo id; trùng id giữ bản mới hơn theo `created_at` (điểm chốt số 7); báo "Đã ghép X buổi, Y thư mục".
- **Bỏ "Bắt đầu trống"**: đánh dấu đã hỏi, không hỏi lại; kho cũ giữ trên máy, có nút "Ghim dữ liệu trên máy" trong Cài đặt để ghim sau.
- **Ngắt giữa chừng** (mất mạng, đóng máy): đã nhận gì giữ nấy, client giữ cờ "chưa di trú xong" → lần sau đẩy lại phần còn thiếu, không sinh trùng (id bất biến).

### 1.3 Nền cơ sở dữ liệu

- **Supabase Postgres**, dùng đúng như một Postgres: không Auth, không RLS của Supabase. Auth nằm ở lớp NextAuth/module tự dựng; quyền kiểm ở lớp repository phía máy chủ.
- **Vùng Singapore**: tạo project Supabase ở **region `ap-southeast-1` (Singapore)** — người dùng chính ở Việt Nam nên đây là vùng có độ trễ thấp nhất trong các vùng Supabase; chọn ngay lúc tạo project, không đổi được sau. Mọi môi trường (dev, preview, production) trỏ cùng vùng.
- **Khóa Supabase không bao giờ ra trình duyệt**: `DATABASE_URL` (và mọi khóa Postgres) chỉ tồn tại ở máy chủ — API Route / middleware Node runtime của Next.js. Cấm đặt khóa vào biến `NEXT_PUBLIC_*`, cấm import trực tiếp thư viện Postgres/Drizzle trong component hoặc client bundle, cấm gọi thẳng Supabase từ trình duyệt (không dùng `@supabase/supabase-js` ở client). Trình duyệt chỉ nói chuyện với API Route nội bộ của app; API Route dùng khóa ở máy chủ và tự kiểm quyền trước khi truy DB. Bài e2e chốt: nội dung JS chạy trên trình duyệt không chứa chuỗi khóa (quét bundle khi build).
- **Drizzle ORM + drizzle-kit** sinh migration; driver `postgres` (postgres.js) qua connection pooler của Supabase (chuẩn cho serverless Vercel).
- Migration chạy bằng `pnpm db:migrate` (script riêng `scripts/db-migrate.mjs`, KHÔNG dùng `drizzle-kit migrate`):
  đọc `drizzle/meta/_journal.json`, chạy từng file SQL theo thứ tự trong 1 giao dịch, ghi hash vào bảng sổ
  `noteim.__drizzle_migrations` (tự tạo bảng sổ, không tạo schema). Schema `noteim` do DBA tạo sẵn — role
  `noteim_app` không có quyền CREATE trên database (project Supabase dùng chung với app khác), nên migration
  không được phát sinh `CREATE SCHEMA` (`pnpm db:generate` tự gỡ qua `scripts/db-generate-clean.mjs`).
- Script seed dữ liệu demo từ fixture giữ cho môi trường thử.
- `dataNow()` ở bản remote trả giờ máy chủ theo múi giờ `Asia/Ho_Chi_Minh`; bản mock giữ `MOCK_NOW` cố định để e2e ổn định (điểm này chỉ đụng `lib/data/index.ts`, không đụng màn hình).

### 1.4 Schema cơ sở dữ liệu

Nguyên tắc đặt tên: giữ snake_case trùng 1-1 với trường Zod hiện có (đúng ghi chú đầu `lib/data/types.ts`). Phần linh hoạt (peaks, spans, translations, listening_map, result_json) để JSONB thay vì dựng bảng con — khớp hình dạng repository hiện tại, ít rủi ro di trú.

| Bảng | Nguồn hiện tại | Trường chính / ghi chú |
|---|---|---|
| `users` | `fixtures/user.json` + MockDb.user | id uuid, email unique, display_name, honorific, profession, default_template_id, plan `free/pro/edu` (thêm edu), ui_language, theme, các công tắc ghi/ngôn ngữ, listening_prefs JSONB, onboarded_at, anonymous_used_sessions, anonymous_used_seconds |
| `accounts`, `auth_sessions`, `verification_tokens` | mới | Bảng chuẩn next-auth, nối `accounts.user_id → users.id` (module tự dựng thì đặt tên tương đương) |
| `workspaces` | `fixtures/workspaces.json` | kind personal/team, name, profession, default_report_language, plan free/pro/team, seat_limit, owner_user_id |
| `workspace_members` | MockDb.members | workspace_id, user_id nullable (đang là lời mời), email, display_name, role `owner/admin/member/assistant`, status active/invited, invited_at, invite_expires_at; khóa (workspace_id, user_id) |
| `invites` | `lib/team/invite-token.ts` | token unique, workspace_id, email, role, invited_by, expires_at, accepted_at |
| `folders` | `fixtures/folders.json` (GC-05) | workspace_id, owner_user_id, kind, name, ref, note, template_id nullish, created_at, updated_at |
| `folder_sessions` | `Folder.session_ids` | Bảng nối (folder_id, session_id); remote repo trả `session_ids` ghép lại để khớp interface hiện có |
| `sessions` | StoredSession phần đầu | user_id, workspace_id, visibility, owner_user_id, title, template_id, **intake_template_id** (mới — ánh xạ 11 mẫu intake), primary_language, detected_languages[], report_languages[], original_report_language, status, processing_step, failure_reason, storage_status, duration_sec, size_bytes, **audio_path** (key R2), audio_expires_at, consent JSONB, peaks_thumb/speaker_colors_thumb JSONB, headline_tag JSONB, open_task_count, created_at, **deleted_at** (xóa mềm cho Hoàn tác) |
| `session_details` | phần SessionDetail | 1-1 với sessions: executive_summary, topics JSONB, notes, bookmarks, photos, peaks, speaker_spans, send_history, gap_check JSONB (SavedGapCheck), gap_check_done[], pending_ai_questions[] |
| `transcript_segments` | transcript trong fixture | session_id, speaker_id, start_sec, end_sec, text, text_clean, edited, lang, translations JSONB, words JSONB; chỉ mục (session_id, start_sec) |
| `summary_versions` | M6-03 | session_id, lang, source, translated_from, stale, executive_summary, topics JSONB, task_texts JSONB |
| `action_items` | TaskRepository | session_id, task, assignee_contact_id, assignee_user_id, due_date, priority, done, done_at, source_quote, timestamp_sec |
| `contacts` | `fixtures/contacts.json` | user_id, name, role, email, preferred_language |
| `glossary_terms` | M3-01 | user_id, term, note, variants JSONB |
| `chat_messages` | MockDb.chat_log | session_id, role, text, citations JSONB |
| `share_links` | MockDb.shares | session_id, scope, **password_hash** (thay mật khẩu plain trong bản giả), expires_at, revoked, view_count, languages[] |
| `session_gap_checks` | `lib/gap-check/store.ts` (Map bộ nhớ → chuyển sang DB ở PR 04, bắt buộc — serverless nhiều instance không dùng chung Map) | Giữ nguyên 6 cột đã định từ GC-02: id, session_id, template_id, checked_at, transcript_until_ms, result_json JSONB; ràng buộc tối đa 10 dòng/buổi |
| `consent_receipts` | `session.consent.receipts` (GC-05) | Tách thành bảng thật: id, session_id, who text[], at, method, announcement_text — tra cứu được, giữ bằng chứng kể cả khi băng đã purge |
| `audit_log` | MockDb.audit + `fixtures/audit.json` | workspace_id nullable (hành động cá nhân), actor_user_id, action (14 loại — §3.3), target_type, target_id, target_label, at, meta JSONB; chỉ mục (workspace_id, at), (target_type, target_id) |
| `usage_counters` | `lib/gap-check/rate-limit.ts` (Map) | subject_user_id nullable, client_id nullable, day, kind `minutes/gap_checks`, used — thay đếm bộ nhớ, sửa lỗi serverless |
| `promo_codes` | mới (PR 07) | code unique, plan `pro/edu`, months, max_redemptions, redeemed_count, redeemed_by_user_id, redeemed_at, note, created_at — §3.5 |

Mẫu ghi âm app (`fixtures/templates.json`) và 11 mẫu intake (`config/intake-templates.json`) **giữ nguyên file tĩnh** trong chặng này — đúng backlog §6.3 spec B4: chỉ chuyển vào bảng `templates` khi số mẫu tăng.

### 1.5 Lưu trữ file: Cloudflare R2

| Hạng mục | Thiết kế |
|---|---|
| Bucket | 1 bucket (env `R2_BUCKET`, ví dụ `noteim-audio`), khóa công khai tuyệt đối — mọi đọc qua signed URL |
| Vùng | Bucket đặt **location APAC — Singapore** (location hint `apac`) cùng vùng với DB (§1.3): người dùng chính ở Việt Nam, độ trễ upload/nghe lại thấp nhất; R2 thu phí egress 0 đồng nên không cần cân nhắc vị trí người nghe xa |
| Cấu trúc key | `audio/{user_id}/{session_id}.{ext}`, `photos/{session_id}/{photo_id}.{ext}` — **key do máy chủ sinh**, client không được chỉ định |
| Upload (Presigned PUT) | Client gọi `POST /api/uploads` { kind, contentType, sizeBytes, sessionId? } → máy chủ kiểm phiên + hạn mức → trả `uploadUrl` (presigned PUT, sống 10 phút) + `key`. Client PUT thẳng lên R2, xong gọi `POST /api/uploads/confirm` { key } → máy chủ `HeadObject` xác nhận kích thước đúng → trả key chuẩn để đưa vào RecordingDraft (`audio_path`) |
| Lý do bắt buộc | Giới hạn thân yêu cầu ~4,5 MB của Vercel Serverless làm mọi upload qua API Route đều hỏng với băng ghi dài; yêu cầu bổ sung số 2 chốt upload phải đi thẳng trình duyệt → R2 (áp dụng ở PR 04 và PR 05) |
| Đọc (Signed GET) | Phát lại: client gọi `GET /api/sessions/[id]/audio-url` → máy chủ kiểm quyền → trả signed URL 15 phút; ảnh trong buổi cũng qua cơ chế này |
| Dọn dẹp | Cron Vercel hằng tuần: quét `sessions.audio_expires_at` quá hạn → `DeleteObjects` trên R2 + đặt `storage_status = essence_only`, giữ transcript, tóm tắt, biên nhận. **R2 Lifecycle làm lưới an toàn**: xóa object prefix `audio/` quá 400 ngày (12 tháng Pro + đệm) |
| Giữ băng theo gói | Free 90 ngày, Pro 12 tháng (điểm chốt số 6); `audio_expires_at` đặt lúc lưu buổi theo plan |
| Thư viện | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (đã duyệt, điểm chốt số 9) |

### 1.6 Hai lỗi nền bắt buộc sửa khi lên serverless

1. **Rate limit Map trong bộ nhớ** (`lib/gap-check/rate-limit.ts`): nhiều instance thì mỗi instance đếm riêng — người dùng được nhân lượt. Chuyển sang `usage_counters` ở PR 06; giữ `GAP_CHECK_FREE_DAILY=10` cho ẩn danh, theo `user_id` cho người đăng nhập.
2. **`dataNow()` trả ngày cứng 14/11/2026**: hợp lệ cho mockup, sai cho sản phẩm thật — bản remote trả giờ máy chủ múi giờ `Asia/Ho_Chi_Minh` (§1.3).

---

## 2. Trải nghiệm UI/UX

### 2.1 Luồng Onboarding 30 giây

Tận dụng `/welcome` đã có (chip chọn ngôn ngữ làm quen) — không làm màn hình mới, chỉ nối dài:

```
Mở app lần đầu → [Tiếp tục bằng Google]   (1 chạm)
     ↓ người mới
Chọn loại không gian chính: [Cá nhân / Chuyên gia] · [Giáo dục / Lớp học]   (1 chạm)
     ↓
Chọn nghề mặc định: 6 nghề + [Bỏ qua — dùng Tổng quát]   (1 chạm hoặc bỏ qua)
     ↓
Bảng di trú dữ liệu trên máy (nếu có — §1.2, có Bỏ qua)
     ↓
Vào thẳng Thư viện (bảng "Bắt đầu ghi" đã chọn sẵn mẫu theo nghề)
```

- Tổng tối đa 3 chạm bắt buộc, mỗi bước có "Bỏ qua" — không bao giờ chặn người dùng vào app.
- Kết quả chốt vào `users` (profession, onboarded_at) và không gian Cá nhân. Chọn Giáo dục: chỉ gợi ý mẫu teacher_educator/student_lecture khi bắt đầu ghi — gói "Lớp học tương tác" để B5 (điểm chốt số 10).
- Màn ghi âm **không thêm bất kỳ bước nào**.

### 2.2 Dashboard cá nhân

Giữ nguyên khung M7-02 đã duyệt (Cần xử lý → Tuần này → Quyết định → Người gặp nhiều → Theo mẫu → Hạn mức), bổ sung:

- **Khối "Cần bổ sung sau buổi"** (chèn sau Cần xử lý): gom mọi mục checklist chưa tick từ `gap_check` của mọi buổi mọi thư mục; mỗi dòng: hồ sơ/buổi + mục thiếu + nút đi thẳng; tick tại đây gọi `completeGapCheckItem` như ở màn chi tiết.
- **Thẻ Hạn mức** mở rộng: phút đã dùng/còn theo gói, **lượt Gap Check còn hôm nay** (đọc `meta.remaining` đã trả API), trạng thái gói Free/Pro/Edu + ngày hết hạn; nút [Nâng cấp gói] mở luồng §3.5; gần hết thì dải cảnh báo.
- Desktop 1280px: hai cột (Cần xử lý + Cần bổ sung bên trái; Tuần này + Hạn mức bên phải); mobile 390px một cột; mọi khối có đủ trạng thái đang tải, rỗng, lỗi (luật AGENTS.md).

### 2.3 Chuyển đổi không gian Cá nhân ↔ Nhóm

Giữ cơ chế `switchTo` của M7-01, chuẩn hóa UI:

- **Máy tính**: chip không gian đầu thanh bên → menu thả: Cá nhân (nhãn hệ thống), các Nhóm, ngăn cách, "Tạo nhóm", "Vào bằng lời mời". Chip có chữ cái đầu + tên + vai trò của mình (Chủ/Quản trị/Thành viên/Trợ lý).
- **Điện thoại**: chip ở tiêu đề Thư viện → bottom sheet cùng nội dung, dòng đang dùng tô đậm.
- Sau đổi: Thư viện, Việc, Tổng quan, Thư mục tự theo không gian (mockup đã hoạt động — nối dữ liệu thật).
- Giữ "bấm 2 lần là ghi": nút Ghi âm giữ vị trí giữa thanh dưới, không phụ thuộc không gian; không gian chốt lúc lưu buổi.

---

## 3. Quản lý nhóm và tuân thủ dữ liệu nhạy cảm

### 3.1 Phân quyền (RBAC) — 4 vai trò

M7 hiện có 3 vai trò (Chủ, Quản trị, Thành viên); thêm **Trợ lý (assistant)** — lễ tân/trợ lý chăm sóc hồ sơ nhưng không đọc nội dung:

| Quyền | Chủ | Quản trị | Chuyên viên | Trợ lý |
|---|---|---|---|---|
| Ghi âm, xem, sửa buổi của mình | Đ | Đ | Đ | Đ |
| Xem buổi đã chia sẻ Cả nhóm | Đ | Đ | Đ | Đ |
| Thấy metadata (tên, thời lượng, người ghi) buổi riêng tư người khác | Đ | Đ | Đ | Chỉ trong thư mục được giao |
| Mở nội dung (transcript, tóm tắt, nghe lại) buổi riêng tư người khác | **Không** | **Không** | Không | Không |
| Tạo/sửa thư mục, gắn buổi vào thư mục | Đ | Đ | Đ | Đ (xóa thư mục cần Quản trị) |
| Chọn mẫu kế thừa cho thư mục | Đ | Đ | Đ | Không |
| Chạy Gap Check trên buổi của mình | Đ | Đ | Đ | Đ |
| Xuất PDF/Word/CSV, gửi email biên bản | Đ | Đ | Đ | Không |
| Tạo link chia sẻ công khai | Đ | Đ | Đ | Không |
| Xóa buổi (có nhật ký) | Mọi buổi nhóm | Mọi buổi nhóm | Buổi của mình | Không |
| Mời, đổi vai trò, gỡ thành viên | Đ | Đ (trừ Chủ) | Không | Không |
| Nhật ký truy cập, tải CSV | Đ | Đ | Không | Không |
| Gói, hóa đơn, số chỗ | Đ | Xem | Không | Không |
| Sửa mẫu tóm tắt dùng chung nhóm | Đ | Đ | Không | Không |

Nguyên tắc vàng M7 giữ nguyên và in rõ ở màn quản trị: **Quản trị và Chủ không đọc được nội dung buổi riêng tư của thành viên** — điểm bán hàng với bác sĩ, luật sư. Mọi kiểm quyền thực hiện **tại repository phía máy chủ** (không tin UI), đúng mô hình DataError "forbidden" hiện có.

### 3.2 Biên nhận đồng ý ghi âm

Phạm vi: 3 mẫu `requires_consent: true` trong `config/intake-templates.json` v1.1 — `doctor_clinical` (y tế), `lawyer_consultation` (pháp lý), `psychologist_counselor` (tâm lý).

- **Lưu trữ**: bảng `consent_receipts` (tách từ `session.consent.receipts`) — ai đồng ý (who), lúc nào (at), cách nào (method), câu thông báo đã phát (announcement_text). **Giữ kể cả khi băng gốc đã purge** — biên nhận là bằng chứng pháp lý, sống lâu hơn dữ liệu âm thanh.
- **Tra cứu 3 mức**: (1) chi tiết buổi — đã có từ GC-05; (2) trong thư mục — Chủ/Quản trị xem danh sách buổi nhạy cảm + trạng thái biên nhận, lọc thiếu biên nhận; (3) xuất CSV biên nhận cho một thư mục khi cơ quan kiểm tra yêu cầu chứng minh.
- **Khoảng trống**: buổi nhạy cảm không có biên nhận (dữ liệu cũ trước GC-05) → cảnh báo ở chi tiết buổi + nhét vào "Cần xử lý" của dashboard; không tự bịa biên nhận.
- **Gói Edu/lớp học**: vẫn khuyến nghị câu thông báo trước khi ghi (giữ `consent_reminder`), không bắt biên nhận từng người.

### 3.3 Nhật ký truy cập (Audit Log)

Mở rộng `AuditEvent` từ 10 hành động hiện có (view, share, unshare, export, delete, invite, remove_member, role_change, purge, send_email) thành **14**:

| Hành động mới | Ghi khi nào | Ai xem được |
|---|---|---|
| `view_sensitive` | Ai mở chi tiết buổi có mẫu `requires_consent` | Nhật ký nhóm (Chủ, Quản trị) |
| `replay_audio` | Bấm phát lại băng gốc của buổi nhạy cảm | Nhật ký nhóm |
| `consent_sign` | Hoàn tất biên nhận (ai đồng ý, cách nào) | Nhật ký nhóm + hiện ở biên nhận |
| `migrate` | Di trú dữ liệu ẩn danh lên tài khoản | Cá nhân, trong Cài đặt |

- Quy tắc ghi: máy chủ ghi tự động, **không tắt được** cho view_sensitive, replay_audio, export; nội dung log chỉ là ai-lúc nào-làm gì-với hồ sơ nào, **không chứa transcript hay evidence**.
- Giao diện: `/team/audit` nối dữ liệu thật, bộ lọc theo người/hành động/khoảng thời gian, tải CSV (`lib/team/csv.ts`).
- Giữ 12 tháng (điểm chốt số 8); cron dọn hàng quá hạn; tải CSV được trước khi hết hạn.
- Pha C1-A đã ghi: `migrate` + hành động cá nhân; pha C1-B ghi đủ phần nhóm.

### 3.4 Quy tắc ẩn/hạn chế `evidence` y tế và tâm lý

Gap Check trả `evidence` là trích nguyên văn — với bác sĩ/tâm lý, câu nguyên văn có thể chứa chẩn đoán, dược chất, nguy cơ tự hại. Sáu quy tắc:

1. **Link công khai và email ra ngoài**: không bao giờ chứa evidence (`PublicSessionView` hiện tại đã không có trường này — giữ nguyên và viết bài e2e chốt để không ai phá).
2. **Trong nhóm**: evidence chỉ hiện cho người có quyền đọc buổi; Trợ lý thấy trạng thái ô (đủ/thiếu) nhưng không thấy evidence.
3. **Xuất PDF/Word**: công tắc "Ẩn trích nguyên văn nhạy cảm" (mặc định bật cho 3 mẫu requires_consent); khi bật, chỗ evidence in "[Đã ẩn để chia sẻ]".
4. **Hỏi AI trên thư mục**: câu trả lời có thể dẫn evidence nhưng chỉ cho thành viên có quyền đọc buổi tương ứng.
5. **Log**: evidence tuyệt đối không vào console log (quy tắc GC-02 hiện có) và không vào audit log.
6. Slot `"sensitive": true` (allergies_history, support_safety, health_disclosure) giữ luật B4: không tự xanh khi confidence < high — áp dụng cả khi hiển thị lại ở checklist.

### 3.5 Nâng cấp gói và mã kích hoạt thủ công (yêu cầu bổ sung 3)

Phục vụ nhóm khách hàng sớm: anh bán gói thủ công (chuyển khoản + cấp mã), chưa cần cổng thanh toán.

- **Điểm vào**: khối Hạn mức ở Tổng quan có nút [Nâng cấp gói]; Cài đặt > Hồ sơ hiện gói hiện tại + ngày hết hạn.
- **Bottom sheet "Nâng cấp gói Pro/Edu"** gồm:
  - Thông tin liên hệ bán hàng (placeholder — anh điền sau: Zalo/số điện thoại/email).
  - **QR chuyển khoản** — ảnh tĩnh `public/upgrade-qr.png` trong repo, thay được mà không cần phát hành lại app.
  - Ô "Nhập mã kích hoạt" + nút [Kích hoạt]; trạng thái đầy đủ: đang kiểm tra / mã sai / mã đã dùng hoặc hết hạn / thành công (đổi gói, gia hạn hạn mức, tải lại thẻ hạn mức, dải chúc mừng).
- **Máy chủ**: `POST /api/promo/redeem` { code } — yêu cầu phiên; mã đúng còn lượt thì đặt `users.plan = pro|edu`, `period_end` = hôm nay + `months` tháng, ghi nhận redeemed_by/redeemed_at; mã đã dùng hoặc sai trả mã lỗi riêng kèm lời nhắn; log redeem **che mã, chỉ in 4 ký tự cuối**.
- **Bảng `promo_codes`** (§1.4) + script `scripts/gen-promo-codes.mjs` sinh mã cục bộ cho chủ chạy (mã never commit vào repo); không có UI quản lý mã trong C1.
- **Gói Edu**: thêm `edu` vào `users.plan`; hạn mức Edu cấu hình `EDU_MINUTES_MONTHLY` (mặc định bằng Pro); không đụng `workspaces.plan` (gói Nhóm để sau).
- **Bảng thử nghiệm `?debug=1`**: ép "Mã kích hoạt lỗi", ép "Mã đã dùng", ép "Kích hoạt chậm".

---

## 4. Lộ trình chia PR — 2 pha

Quy trình giữ nguyên AGENTS.md: mỗi nhánh một PR, bước nhỏ ~45 phút, `pnpm lint` + `pnpm typecheck` sạch từng bước, commit + push ngay, PR nháp thân là ô tích → tick bằng Python urllib PATCH `/pulls/{N}` → chuyển ready bằng GraphQL `markPullRequestReadyForReview`, e2e + Lighthouse, LOG.md khi build sạch. Nhánh xếp chồng: nhánh sau tách từ nhánh trước, base PR trỏ nhánh trước, merge kiểu "Create a merge commit" từ dưới lên.

### Pha C1-A (PR 01 → PR 07) — mở cửa cho người dùng thật sau PR 07

| PR | Nhánh | Nội dung | Bước |
|---|---|---|---|
| 01 | `c1/01-auth-foundation` | 1) Cài thử next-auth v4 với Next 16 — chạy được chọn, vướng thì chốt module tự dựng (ghi kết quả vào PR); 2) cấu hình Google OAuth + bảng users + bảng auth (Drizzle) + env; 3) trang đăng nhập + middleware + hook phiên; 4) e2e đăng nhập/đăng xuất/ẩn danh, LOG | 4 |
| 02 | `c1/02-db-schema` | 1) Supabase Postgres + drizzle-kit config + pooler; 2) schema toàn bộ §1.4 + migration; 3) seed demo từ fixture + script; 4) `dataNow()` remote múi giờ VN; 5) e2e, LOG | 5 |
| 03 | `c1/03-remote-read` | `lib/data/remote` đọc: account, folders, tasks, sessions (list/get/transcript/detail); bật qua `NEXT_PUBLIC_DATA_SOURCE=remote` cho người đăng nhập; e2e hai chế độ song song | 5 |
| 04 | `c1/04-remote-write` | remote ghi: createFromRecording + **R2 presigned upload** (POST /api/uploads, confirm, audio-url) cho băng và ảnh; **chuyển `lib/gap-check/store.ts` (Map bộ nhớ) sang bảng `session_gap_checks`** — bắt buộc, giữ đúng 6 cột đã định và hạn 10 dòng/buổi, POST/GET route đọc ghi DB thay Map (serverless nhiều instance vẫn nhất quán); e2e upload thẳng R2 (không qua API route) | 5 |
| 05 | `c1/05-migrate-anon` | `POST /api/migrate-local` + banner xác nhận + upload blob presigned + dọn kho + nút "Ghim dữ liệu trên máy" trong Cài đặt; e2e kịch bản ngắt giữa chừng đẩy lại được | 4 |
| 06 | `c1/06-quota-db` | `usage_counters` thay Map; hạn mức gap-check theo user (ẩn danh giữ GAP_CHECK_FREE_DAILY); giới hạn ẩn danh 3 buổi/30 phút; e2e hạn mức | 3 |
| 07 | `c1/07-dashboard-v2` | Khối "Cần bổ sung sau buổi" + thẻ hạn mức + **sheet Nâng cấp gói + mã kích hoạt** (`promo_codes`, script gen mã) + cờ debug; Lighthouse dashboard; LOG | 5 |

### Pha C1-B (PR 08 → PR 12) — nhóm, Trợ lý, biên nhận, audit, quyền riêng tư

| PR | Nhánh | Nội dung | Bước |
|---|---|---|---|
| 08 | `c1/08-workspace-real` | Workspace/members/invites thật + switcher Cá nhân↔Nhóm (desktop menu, mobile sheet) — đợi GY1 (PR #76) merge | 5 |
| 09 | `c1/09-rbac-assistant` | Vai trò assistant + kiểm quyền server-side toàn bộ repository theo ma trận §3.1 + e2e quyền | 4 |
| 10 | `c1/10-consent-store` | Bảng consent_receipts + tra cứu 3 mức + cảnh báo thiếu biên nhận + giữ khi purge | 4 |
| 11 | `c1/11-audit-real` | Audit server-side (view_sensitive, replay_audio, consent_sign) + /team/audit thật + CSV + cron dọn 12 tháng | 4 |
| 12 | `c1/12-privacy-tools` | Trang /privacy + "Tải toàn bộ dữ liệu" + "Xóa tài khoản" + cron purge R2 theo audio_expires_at | 4 |

Phụ thuộc: pha A đợi anh merge chuỗi GC #77→#81 vào main (đụng `lib/gap-check`, `lib/data`); PR 08 đợi GY1 #76 (đụng folders). Tổng ~43 bước (~35 giờ làm việc agent). Mỗi PR có preview Vercel để duyệt giao diện.

---

## 5. Quy ước triển khai chung

- **Env secrets** (Vercel, không commit): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `EDU_MINUTES_MONTHLY` (tùy chọn); giữ nguyên `GAP_CHECK_FREE_DAILY`, `GAP_CHECK_MODEL`; thêm `GAP_CHECK_PROVIDERS` (mặc định `zai,gemini,anthropic`), `GEMINI_API_KEY` + `GEMINI_MODEL`, `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL` (các khóa AI dự phòng — thiếu là bỏ qua bên đó, không bắt buộc).
- **Không log nội dung nhạy cảm**: transcript, evidence, mã kích hoạt (che còn 4 ký tự cuối) tuyệt đối không vào console/audit.
- **Nhà cung cấp AI cho Gap Check (yêu cầu nhịp 2)**: giữ `z-ai-web-dev-sdk` ở đầu chuỗi. Hoang chốt 22/11: Z.ai **dùng cả cho dữ liệu thật**, chạy đến khi lỗi hoặc hết lượt miễn phí thì chuỗi tự chuyển sang Gemini, rồi Anthropic. Lưu ý kỹ thuật: SDK chỉ chạy khi có file `.z-ai-config` (máy agent); trên Vercel không có file này nên bản production tự dùng bên dự phòng. Không commit file đó lên repo. Điều kiện pháp lý trước khi mở cho người dùng thật: chính sách quyền riêng tư phải ghi rõ dữ liệu được gửi tới nhà cung cấp AI ở nước ngoài (Z.ai: Trung Quốc; Google, Anthropic: Mỹ) và lập hồ sơ chuyển dữ liệu ra nước ngoài theo Luật 91/2025; Gemini phải dùng bản trả phí (bản miễn phí dùng dữ liệu để cải thiện sản phẩm). Thêm **chuỗi dự phòng** qua biến `GAP_CHECK_PROVIDERS` (mặc định `zai,gemini,anthropic`, đổi thứ tự được): bên không cấu hình được (thiếu khóa) hay lỗi `429/5xx` hay quá **8 giây** thì chuyển bên kế tiếp; **Gemini** dùng `GEMINI_API_KEY` (model Flash-Lite, ví dụ `gemini-2.5-flash-lite`, đổi được bằng `GEMINI_MODEL`), **Anthropic** dùng `ANTHROPIC_API_KEY` (model claude-haiku, mặc định `claude-haiku-5-5`, đổi được bằng `ANTHROPIC_MODEL`) — thiếu khóa thì bỏ qua bên đó; hết chuỗi trả **503**, tuyệt đối không tự chế kết quả. Log và `meta.provider` ghi **tên bên đã dùng** và thời gian từng bên, không bao giờ ghi transcript/evidence. Stub kiểm thử `GAP_CHECK_FAKE` giữ nguyên cho e2e; thêm e2e giả lập chuyển bên.
- **Mỗi PR**: lint + typecheck sạch từng bước; `pnpm build` ở bước cuối; bài e2e mới trong `tests/e2e/` (dùng `tests/e2e/helpers.ts`) + hồi quy 2 project phone/desktop; PR có link preview Vercel + danh sách trạng thái đã kiểm.
- **Cờ thử nghiệm `?debug=1`**: mỗi trạng thái mới (mã sai, mã đã dùng, hết hạn mức, di trú lỗi, di trú chậm, hết hạn mức ẩn danh) phải ép được — thêm cờ vào `lib/debug/flags.ts` + nút vào `components/shell/debug-panel.tsx`.
- **Rollback**: `NEXT_PUBLIC_DATA_SOURCE=mock` trả app về mockup mọi lúc; chế độ ẩn danh luôn hoạt động — lỗi auth không chặn người dùng cũ.
- **Ngôn ngữ**: mọi chuỗi hiển thị vào `messages/vi.json` + `messages/en.json` (khóa đồng bộ); màn mới có chữ Hàn thì thêm `ko`.
- **Không đụng màn ghi âm** ngoài những điểm đặc tả nêu rõ (chặn hạn mức ẩn danh ở bảng bắt đầu ghi, không thêm bước nào khi ghi).
- **docs/04-data-contract.md**: khi triển khai từng PR, chỉ **thêm mục mới** ("Bổ sung C1") liệt kê thư viện đã duyệt và nguồn dữ liệu remote — không thay nội dung cũ (luật AGENTS.md).

---

## 6. Tiêu chí nghiệm thu chung

1. Đăng nhập Google ≤ 2 chạm từ lúc mở app lần đầu; đã đăng nhập thì mở app vào thẳng Thư viện.
2. Di trú: mất điện/ngắt mạng giữa chừng phải đẩy lại được, không sinh trùng buổi; mọi id giữ nguyên sau di trú.
3. Không một file ghi âm/ảnh nào đi qua API Route khi upload — kiểm bằng bài e2e chặn request thân lớn và xác nhận PUT thẳng R2.
4. Evidence không xuất hiện ở link công khai, email ra ngoài, console log, audit log (e2e chốt từng đường).
5. Quản trị và Chủ không đọc được nội dung buổi riêng tư của thành viên (e2e quyền theo ma trận §3.1).
6. Mã kích hoạt: đúng mã đổi gói + gia hạn đúng số tháng; mã đã dùng bị chặn; log che mã.
7. R2: băng hết hạn bị cron purge đúng hạn, giữ transcript + biên nhận; lifecycle là lưới an toàn.
8. Lighthouse dashboard mobile không thấp hơn điểm trước khi thêm khối mới (đo `pnpm lh`, in bảng vào PR).
9. Hồi quy đầy đủ xanh sau mỗi PR (phone + desktop); lint + typecheck + build sạch.
10. Không ghi khóa API/mật khẩu vào code, commit, PR.

---

## 7. Điểm mở — trạng thái

Toàn bộ 10 điểm mở của bản đề xuất đã được anh chốt ngày 20/11/2026 (§0.1), cùng 3 yêu cầu bổ sung (§0.2) và cập nhật Cloudflare R2 (§0.3). Không còn điểm mở nào cần chốt trước khi bắt đầu `c1/01-auth-foundation`. Phát sinh trong lúc làm: hỏi bằng comment trong issue, gắn nhãn `can-hoi` (luật AGENTS.md).


## 1. Phương án kỹ thuật

### 1.1 Đăng nhập (Auth)

**Cửa chính là Google OAuth, một chạm.** Email OTP/Magic link (Resend) là cửa phụ, làm PR riêng khi có nhu cầu thực. Không dùng SMS/Zalo OTP (chi phí, phụ thuộc nhà cung cấp), không dùng mật khẩu truyền thống.

Hai phương án cài, chốt ngay bước 1 của PR 01:

| Phương án | Điều kiện chọn | Ghi chú |
|---|---|---|
| **next-auth v4 (Auth.js)** | Cài thử chạy được với Next 16.4.6 + React 19, không lỗi build/hydrate | Đã được duyệt vào danh sách thư viện |
| **Module Google OAuth tối giản tự dựng** | next-auth v4 vướng tương thích Next 16 | Luồng authorization code của Google + cookie httpOnly ký HMAC, khoảng 200 dòng, không thêm thư viện; bảng users/auth tự giữ như schema §1.4 |

Chi tiết phiên:

- **JWT trong cookie** `noteim.session` — httpOnly, Secure, SameSite=Lax, sống 30 ngày có gia hạn trượt. Không cần bảng phiên trong DB, ít truy vấn mỗi request; audit không phụ thuộc bảng session.
- Middleware bảo vệ: mọi `/api/**` ghi dữ liệu yêu cầu phiên hợp lệ; người ẩn danh chỉ được gọi gap-check với mã khách như hiện tại.
- Đăng xuất: xóa cookie, về màn thư viện chế độ ẩn danh (dữ liệu trên máy nếu có).

**Chế độ ẩn danh giữ nguyên** (triết lý "bấm 2 lần là ghi"): mở app là ghi được, dữ liệu nằm trên máy. Giới hạn ẩn danh: 3 buổi / 30 phút tổng ghi — chặn ở màn bắt đầu ghi khi vượt, kèm dải nhắc đăng nhập. Điểm bắt buộc có tài khoản: dùng không gian Nhóm, vượt hạn mức ẩn danh, và mọi gói trả phí.

Bí mật môi trường (Vercel env, không commit khóa — đúng §8 đặc tả B4): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `DATABASE_URL`.

### 1.2 Di trú dữ liệu dùng thử lên tài khoản

Nguyên tắc: **di trú một lần, có xác nhận, không mất buổi, giữ nguyên mọi id.**

Luồng khi đăng nhập lần đầu và kho `localStorage` (`noteim-mock-db-v1`) có dữ liệu thật:

1. Bảng xác nhận ngắn: "Ghim N buổi ghi đang có trên máy vào tài khoản?" — nút [Ghim vào tài khoản] / [Bỏ — bắt đầu trống].
2. Bấm Ghim: client đóng gói kho → `POST /api/migrate-local`, payload qua Zod dùng lại đúng schema `lib/data/types.ts` (nguồn sự thật hiện có).
3. Máy chủ: gán `user_id` mới, **giữ nguyên mọi id** (session, folder, contact, glossary, action item…) nên không vỡ tham chiếu (note_ids, speaker, folder.session_ids, gap_check, pending_ai_questions); ghi 1 dòng audit `migrate`; trả về số đối tượng đã nhận.
4. Ảnh và băng Blob trong IndexedDB **tải thẳng lên R2 qua Presigned Upload URL** (yêu cầu bổ sung 2 — §1.5), kèm thanh tiến độ; vượt dung lượng cho phép thì giữ blob trên máy và ghi chú trong buổi.
5. Client dọn `noteim-mock-db-v1`, chuyển nguồn dữ liệu sang remote (đúng cơ chế chọn nguồn ở `lib/data/index.ts`), tải lại.

Biên:

- **Buổi đang ghi dở** (RecordingDraft): vẫn nằm IndexedDB, tự lên DB khi lưu buổi — không đụng luồng ghi.
- **Nhiều tab**: di trú single-flight bằng cờ trong sessionStorage; tab khác chỉ chờ kết quả.
- **Tài khoản đã có dữ liệu, ghép thêm máy khác**: append hết theo id; trùng id giữ bản mới hơn theo `created_at` (điểm chốt số 7); báo "Đã ghép X buổi, Y thư mục".
- **Bỏ "Bắt đầu trống"**: đánh dấu đã hỏi, không hỏi lại; kho cũ giữ trên máy, có nút "Ghim dữ liệu trên máy" trong Cài đặt để ghim sau.
- **Ngắt giữa chừng** (mất mạng, đóng máy): đã nhận gì giữ nấy, client giữ cờ "chưa di trú xong" → lần sau đẩy lại phần còn thiếu, không sinh trùng (id bất biến).

### 1.3 Nền cơ sở dữ liệu

- **Supabase Postgres**, dùng đúng như một Postgres: không Auth, không RLS của Supabase. Auth nằm ở lớp NextAuth/module tự dựng; quyền kiểm ở lớp repository phía máy chủ.
- **Drizzle ORM + drizzle-kit** sinh migration; driver `postgres` (postgres.js) qua connection pooler của Supabase (chuẩn cho serverless Vercel).
- Migration chạy bằng `pnpm db:migrate` (script riêng `scripts/db-migrate.mjs`, KHÔNG dùng `drizzle-kit migrate`):
  đọc `drizzle/meta/_journal.json`, chạy từng file SQL theo thứ tự trong 1 giao dịch, ghi hash vào bảng sổ
  `noteim.__drizzle_migrations` (tự tạo bảng sổ, không tạo schema). Schema `noteim` do DBA tạo sẵn — role
  `noteim_app` không có quyền CREATE trên database (project Supabase dùng chung với app khác), nên migration
  không được phát sinh `CREATE SCHEMA` (`pnpm db:generate` tự gỡ qua `scripts/db-generate-clean.mjs`).
- Script seed dữ liệu demo từ fixture giữ cho môi trường thử.
- `dataNow()` ở bản remote trả giờ máy chủ theo múi giờ `Asia/Ho_Chi_Minh`; bản mock giữ `MOCK_NOW` cố định để e2e ổn định (điểm này chỉ đụng `lib/data/index.ts`, không đụng màn hình).

### 1.4 Schema cơ sở dữ liệu

Nguyên tắc đặt tên: giữ snake_case trùng 1-1 với trường Zod hiện có (đúng ghi chú đầu `lib/data/types.ts`). Phần linh hoạt (peaks, spans, translations, listening_map, result_json) để JSONB thay vì dựng bảng con — khớp hình dạng repository hiện tại, ít rủi ro di trú.

| Bảng | Nguồn hiện tại | Trường chính / ghi chú |
|---|---|---|
| `users` | `fixtures/user.json` + MockDb.user | id uuid, email unique, display_name, honorific, profession, default_template_id, plan `free/pro/edu` (thêm edu), ui_language, theme, các công tắc ghi/ngôn ngữ, listening_prefs JSONB, onboarded_at, anonymous_used_sessions, anonymous_used_seconds |
| `accounts`, `auth_sessions`, `verification_tokens` | mới | Bảng chuẩn next-auth, nối `accounts.user_id → users.id` (module tự dựng thì đặt tên tương đương) |
| `workspaces` | `fixtures/workspaces.json` | kind personal/team, name, profession, default_report_language, plan free/pro/team, seat_limit, owner_user_id |
| `workspace_members` | MockDb.members | workspace_id, user_id nullable (đang là lời mời), email, display_name, role `owner/admin/member/assistant`, status active/invited, invited_at, invite_expires_at; khóa (workspace_id, user_id) |
| `invites` | `lib/team/invite-token.ts` | token unique, workspace_id, email, role, invited_by, expires_at, accepted_at |
| `folders` | `fixtures/folders.json` (GC-05) | workspace_id, owner_user_id, kind, name, ref, note, template_id nullish, created_at, updated_at |
| `folder_sessions` | `Folder.session_ids` | Bảng nối (folder_id, session_id); remote repo trả `session_ids` ghép lại để khớp interface hiện có |
| `sessions` | StoredSession phần đầu | user_id, workspace_id, visibility, owner_user_id, title, template_id, **intake_template_id** (mới — ánh xạ 11 mẫu intake), primary_language, detected_languages[], report_languages[], original_report_language, status, processing_step, failure_reason, storage_status, duration_sec, size_bytes, **audio_path** (key R2), audio_expires_at, consent JSONB, peaks_thumb/speaker_colors_thumb JSONB, headline_tag JSONB, open_task_count, created_at, **deleted_at** (xóa mềm cho Hoàn tác) |
| `session_details` | phần SessionDetail | 1-1 với sessions: executive_summary, topics JSONB, notes, bookmarks, photos, peaks, speaker_spans, send_history, gap_check JSONB (SavedGapCheck), gap_check_done[], pending_ai_questions[] |
| `transcript_segments` | transcript trong fixture | session_id, speaker_id, start_sec, end_sec, text, text_clean, edited, lang, translations JSONB, words JSONB; chỉ mục (session_id, start_sec) |
| `summary_versions` | M6-03 | session_id, lang, source, translated_from, stale, executive_summary, topics JSONB, task_texts JSONB |
| `action_items` | TaskRepository | session_id, task, assignee_contact_id, assignee_user_id, due_date, priority, done, done_at, source_quote, timestamp_sec |
| `contacts` | `fixtures/contacts.json` | user_id, name, role, email, preferred_language |
| `glossary_terms` | M3-01 | user_id, term, note, variants JSONB |
| `chat_messages` | MockDb.chat_log | session_id, role, text, citations JSONB |
| `share_links` | MockDb.shares | session_id, scope, **password_hash** (thay mật khẩu plain trong bản giả), expires_at, revoked, view_count, languages[] |
| `session_gap_checks` | `lib/gap-check/store.ts` | Giữ nguyên 6 cột đã định từ GC-02: id, session_id, template_id, checked_at, transcript_until_ms, result_json JSONB; ràng buộc tối đa 10 dòng/buổi |
| `consent_receipts` | `session.consent.receipts` (GC-05) | Tách thành bảng thật: id, session_id, who text[], at, method, announcement_text — tra cứu được, giữ bằng chứng kể cả khi băng đã purge |
| `audit_log` | MockDb.audit + `fixtures/audit.json` | workspace_id nullable (hành động cá nhân), actor_user_id, action (14 loại — §3.3), target_type, target_id, target_label, at, meta JSONB; chỉ mục (workspace_id, at), (target_type, target_id) |
| `usage_counters` | `lib/gap-check/rate-limit.ts` (Map) | subject_user_id nullable, client_id nullable, day, kind `minutes/gap_checks`, used — thay đếm bộ nhớ, sửa lỗi serverless |
| `promo_codes` | mới (PR 07) | code unique, plan `pro/edu`, months, max_redemptions, redeemed_count, redeemed_by_user_id, redeemed_at, note, created_at — §3.5 |

Mẫu ghi âm app (`fixtures/templates.json`) và 11 mẫu intake (`config/intake-templates.json`) **giữ nguyên file tĩnh** trong chặng này — đúng backlog §6.3 spec B4: chỉ chuyển vào bảng `templates` khi số mẫu tăng.

### 1.5 Lưu trữ file: Cloudflare R2

| Hạng mục | Thiết kế |
|---|---|
| Bucket | 1 bucket (env `R2_BUCKET`, ví dụ `noteim-audio`), khóa công khai tuyệt đối — mọi đọc qua signed URL |
| Cấu trúc key | `audio/{user_id}/{session_id}.{ext}`, `photos/{session_id}/{photo_id}.{ext}` — **key do máy chủ sinh**, client không được chỉ định |
| Upload (Presigned PUT) | Client gọi `POST /api/uploads` { kind, contentType, sizeBytes, sessionId? } → máy chủ kiểm phiên + hạn mức → trả `uploadUrl` (presigned PUT, sống 10 phút) + `key`. Client PUT thẳng lên R2, xong gọi `POST /api/uploads/confirm` { key } → máy chủ `HeadObject` xác nhận kích thước đúng → trả key chuẩn để đưa vào RecordingDraft (`audio_path`) |
| Lý do bắt buộc | Giới hạn thân yêu cầu ~4,5 MB của Vercel Serverless làm mọi upload qua API Route đều hỏng với băng ghi dài; yêu cầu bổ sung số 2 chốt upload phải đi thẳng trình duyệt → R2 (áp dụng ở PR 04 và PR 05) |
| Đọc (Signed GET) | Phát lại: client gọi `GET /api/sessions/[id]/audio-url` → máy chủ kiểm quyền → trả signed URL 15 phút; ảnh trong buổi cũng qua cơ chế này |
| Dọn dẹp | Cron Vercel hằng tuần: quét `sessions.audio_expires_at` quá hạn → `DeleteObjects` trên R2 + đặt `storage_status = essence_only`, giữ transcript, tóm tắt, biên nhận. **R2 Lifecycle làm lưới an toàn**: xóa object prefix `audio/` quá 400 ngày (12 tháng Pro + đệm) |
| Giữ băng theo gói | Free 90 ngày, Pro 12 tháng (điểm chốt số 6); `audio_expires_at` đặt lúc lưu buổi theo plan |
| Thư viện | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (đã duyệt, điểm chốt số 9) |

### 1.6 Hai lỗi nền bắt buộc sửa khi lên serverless

1. **Rate limit Map trong bộ nhớ** (`lib/gap-check/rate-limit.ts`): nhiều instance thì mỗi instance đếm riêng — người dùng được nhân lượt. Chuyển sang `usage_counters` ở PR 06; giữ `GAP_CHECK_FREE_DAILY=10` cho ẩn danh, theo `user_id` cho người đăng nhập.
2. **`dataNow()` trả ngày cứng 14/11/2026**: hợp lệ cho mockup, sai cho sản phẩm thật — bản remote trả giờ máy chủ múi giờ `Asia/Ho_Chi_Minh` (§1.3).

---

## 2. Trải nghiệm UI/UX

### 2.1 Luồng Onboarding 30 giây

Tận dụng `/welcome` đã có (chip chọn ngôn ngữ làm quen) — không làm màn hình mới, chỉ nối dài:

```
Mở app lần đầu → [Tiếp tục bằng Google]   (1 chạm)
     ↓ người mới
Chọn loại không gian chính: [Cá nhân / Chuyên gia] · [Giáo dục / Lớp học]   (1 chạm)
     ↓
Chọn nghề mặc định: 6 nghề + [Bỏ qua — dùng Tổng quát]   (1 chạm hoặc bỏ qua)
     ↓
Bảng di trú dữ liệu trên máy (nếu có — §1.2, có Bỏ qua)
     ↓
Vào thẳng Thư viện (bảng "Bắt đầu ghi" đã chọn sẵn mẫu theo nghề)
```

- Tổng tối đa 3 chạm bắt buộc, mỗi bước có "Bỏ qua" — không bao giờ chặn người dùng vào app.
- Kết quả chốt vào `users` (profession, onboarded_at) và không gian Cá nhân. Chọn Giáo dục: chỉ gợi ý mẫu teacher_educator/student_lecture khi bắt đầu ghi — gói "Lớp học tương tác" để B5 (điểm chốt số 10).
- Màn ghi âm **không thêm bất kỳ bước nào**.

### 2.2 Dashboard cá nhân

Giữ nguyên khung M7-02 đã duyệt (Cần xử lý → Tuần này → Quyết định → Người gặp nhiều → Theo mẫu → Hạn mức), bổ sung:

- **Khối "Cần bổ sung sau buổi"** (chèn sau Cần xử lý): gom mọi mục checklist chưa tick từ `gap_check` của mọi buổi mọi thư mục; mỗi dòng: hồ sơ/buổi + mục thiếu + nút đi thẳng; tick tại đây gọi `completeGapCheckItem` như ở màn chi tiết.
- **Thẻ Hạn mức** mở rộng: phút đã dùng/còn theo gói, **lượt Gap Check còn hôm nay** (đọc `meta.remaining` đã trả API), trạng thái gói Free/Pro/Edu + ngày hết hạn; nút [Nâng cấp gói] mở luồng §3.5; gần hết thì dải cảnh báo.
- Desktop 1280px: hai cột (Cần xử lý + Cần bổ sung bên trái; Tuần này + Hạn mức bên phải); mobile 390px một cột; mọi khối có đủ trạng thái đang tải, rỗng, lỗi (luật AGENTS.md).

### 2.3 Chuyển đổi không gian Cá nhân ↔ Nhóm

Giữ cơ chế `switchTo` của M7-01, chuẩn hóa UI:

- **Máy tính**: chip không gian đầu thanh bên → menu thả: Cá nhân (nhãn hệ thống), các Nhóm, ngăn cách, "Tạo nhóm", "Vào bằng lời mời". Chip có chữ cái đầu + tên + vai trò của mình (Chủ/Quản trị/Thành viên/Trợ lý).
- **Điện thoại**: chip ở tiêu đề Thư viện → bottom sheet cùng nội dung, dòng đang dùng tô đậm.
- Sau đổi: Thư viện, Việc, Tổng quan, Thư mục tự theo không gian (mockup đã hoạt động — nối dữ liệu thật).
- Giữ "bấm 2 lần là ghi": nút Ghi âm giữ vị trí giữa thanh dưới, không phụ thuộc không gian; không gian chốt lúc lưu buổi.

---

## 3. Quản lý nhóm và tuân thủ dữ liệu nhạy cảm

### 3.1 Phân quyền (RBAC) — 4 vai trò

M7 hiện có 3 vai trò (Chủ, Quản trị, Thành viên); thêm **Trợ lý (assistant)** — lễ tân/trợ lý chăm sóc hồ sơ nhưng không đọc nội dung:

| Quyền | Chủ | Quản trị | Chuyên viên | Trợ lý |
|---|---|---|---|---|
| Ghi âm, xem, sửa buổi của mình | Đ | Đ | Đ | Đ |
| Xem buổi đã chia sẻ Cả nhóm | Đ | Đ | Đ | Đ |
| Thấy metadata (tên, thời lượng, người ghi) buổi riêng tư người khác | Đ | Đ | Đ | Chỉ trong thư mục được giao |
| Mở nội dung (transcript, tóm tắt, nghe lại) buổi riêng tư người khác | **Không** | **Không** | Không | Không |
| Tạo/sửa thư mục, gắn buổi vào thư mục | Đ | Đ | Đ | Đ (xóa thư mục cần Quản trị) |
| Chọn mẫu kế thừa cho thư mục | Đ | Đ | Đ | Không |
| Chạy Gap Check trên buổi của mình | Đ | Đ | Đ | Đ |
| Xuất PDF/Word/CSV, gửi email biên bản | Đ | Đ | Đ | Không |
| Tạo link chia sẻ công khai | Đ | Đ | Đ | Không |
| Xóa buổi (có nhật ký) | Mọi buổi nhóm | Mọi buổi nhóm | Buổi của mình | Không |
| Mời, đổi vai trò, gỡ thành viên | Đ | Đ (trừ Chủ) | Không | Không |
| Nhật ký truy cập, tải CSV | Đ | Đ | Không | Không |
| Gói, hóa đơn, số chỗ | Đ | Xem | Không | Không |
| Sửa mẫu tóm tắt dùng chung nhóm | Đ | Đ | Không | Không |

Nguyên tắc vàng M7 giữ nguyên và in rõ ở màn quản trị: **Quản trị và Chủ không đọc được nội dung buổi riêng tư của thành viên** — điểm bán hàng với bác sĩ, luật sư. Mọi kiểm quyền thực hiện **tại repository phía máy chủ** (không tin UI), đúng mô hình DataError "forbidden" hiện có.

### 3.2 Biên nhận đồng ý ghi âm

Phạm vi: 3 mẫu `requires_consent: true` trong `config/intake-templates.json` v1.1 — `doctor_clinical` (y tế), `lawyer_consultation` (pháp lý), `psychologist_counselor` (tâm lý).

- **Lưu trữ**: bảng `consent_receipts` (tách từ `session.consent.receipts`) — ai đồng ý (who), lúc nào (at), cách nào (method), câu thông báo đã phát (announcement_text). **Giữ kể cả khi băng gốc đã purge** — biên nhận là bằng chứng pháp lý, sống lâu hơn dữ liệu âm thanh.
- **Tra cứu 3 mức**: (1) chi tiết buổi — đã có từ GC-05; (2) trong thư mục — Chủ/Quản trị xem danh sách buổi nhạy cảm + trạng thái biên nhận, lọc thiếu biên nhận; (3) xuất CSV biên nhận cho một thư mục khi cơ quan kiểm tra yêu cầu chứng minh.
- **Khoảng trống**: buổi nhạy cảm không có biên nhận (dữ liệu cũ trước GC-05) → cảnh báo ở chi tiết buổi + nhét vào "Cần xử lý" của dashboard; không tự bịa biên nhận.
- **Gói Edu/lớp học**: vẫn khuyến nghị câu thông báo trước khi ghi (giữ `consent_reminder`), không bắt biên nhận từng người.

### 3.3 Nhật ký truy cập (Audit Log)

Mở rộng `AuditEvent` từ 10 hành động hiện có (view, share, unshare, export, delete, invite, remove_member, role_change, purge, send_email) thành **14**:

| Hành động mới | Ghi khi nào | Ai xem được |
|---|---|---|
| `view_sensitive` | Ai mở chi tiết buổi có mẫu `requires_consent` | Nhật ký nhóm (Chủ, Quản trị) |
| `replay_audio` | Bấm phát lại băng gốc của buổi nhạy cảm | Nhật ký nhóm |
| `consent_sign` | Hoàn tất biên nhận (ai đồng ý, cách nào) | Nhật ký nhóm + hiện ở biên nhận |
| `migrate` | Di trú dữ liệu ẩn danh lên tài khoản | Cá nhân, trong Cài đặt |

- Quy tắc ghi: máy chủ ghi tự động, **không tắt được** cho view_sensitive, replay_audio, export; nội dung log chỉ là ai-lúc nào-làm gì-với hồ sơ nào, **không chứa transcript hay evidence**.
- Giao diện: `/team/audit` nối dữ liệu thật, bộ lọc theo người/hành động/khoảng thời gian, tải CSV (`lib/team/csv.ts`).
- Giữ 12 tháng (điểm chốt số 8); cron dọn hàng quá hạn; tải CSV được trước khi hết hạn.
- Pha C1-A đã ghi: `migrate` + hành động cá nhân; pha C1-B ghi đủ phần nhóm.

### 3.4 Quy tắc ẩn/hạn chế `evidence` y tế và tâm lý

Gap Check trả `evidence` là trích nguyên văn — với bác sĩ/tâm lý, câu nguyên văn có thể chứa chẩn đoán, dược chất, nguy cơ tự hại. Sáu quy tắc:

1. **Link công khai và email ra ngoài**: không bao giờ chứa evidence (`PublicSessionView` hiện tại đã không có trường này — giữ nguyên và viết bài e2e chốt để không ai phá).
2. **Trong nhóm**: evidence chỉ hiện cho người có quyền đọc buổi; Trợ lý thấy trạng thái ô (đủ/thiếu) nhưng không thấy evidence.
3. **Xuất PDF/Word**: công tắc "Ẩn trích nguyên văn nhạy cảm" (mặc định bật cho 3 mẫu requires_consent); khi bật, chỗ evidence in "[Đã ẩn để chia sẻ]".
4. **Hỏi AI trên thư mục**: câu trả lời có thể dẫn evidence nhưng chỉ cho thành viên có quyền đọc buổi tương ứng.
5. **Log**: evidence tuyệt đối không vào console log (quy tắc GC-02 hiện có) và không vào audit log.
6. Slot `"sensitive": true` (allergies_history, support_safety, health_disclosure) giữ luật B4: không tự xanh khi confidence < high — áp dụng cả khi hiển thị lại ở checklist.

### 3.5 Nâng cấp gói và mã kích hoạt thủ công (yêu cầu bổ sung 3)

Phục vụ nhóm khách hàng sớm: anh bán gói thủ công (chuyển khoản + cấp mã), chưa cần cổng thanh toán.

- **Điểm vào**: khối Hạn mức ở Tổng quan có nút [Nâng cấp gói]; Cài đặt > Hồ sơ hiện gói hiện tại + ngày hết hạn.
- **Bottom sheet "Nâng cấp gói Pro/Edu"** gồm:
  - Thông tin liên hệ bán hàng (placeholder — anh điền sau: Zalo/số điện thoại/email).
  - **QR chuyển khoản** — ảnh tĩnh `public/upgrade-qr.png` trong repo, thay được mà không cần phát hành lại app.
  - Ô "Nhập mã kích hoạt" + nút [Kích hoạt]; trạng thái đầy đủ: đang kiểm tra / mã sai / mã đã dùng hoặc hết hạn / thành công (đổi gói, gia hạn hạn mức, tải lại thẻ hạn mức, dải chúc mừng).
- **Máy chủ**: `POST /api/promo/redeem` { code } — yêu cầu phiên; mã đúng còn lượt thì đặt `users.plan = pro|edu`, `period_end` = hôm nay + `months` tháng, ghi nhận redeemed_by/redeemed_at; mã đã dùng hoặc sai trả mã lỗi riêng kèm lời nhắn; log redeem **che mã, chỉ in 4 ký tự cuối**.
- **Bảng `promo_codes`** (§1.4) + script `scripts/gen-promo-codes.mjs` sinh mã cục bộ cho chủ chạy (mã never commit vào repo); không có UI quản lý mã trong C1.
- **Gói Edu**: thêm `edu` vào `users.plan`; hạn mức Edu cấu hình `EDU_MINUTES_MONTHLY` (mặc định bằng Pro); không đụng `workspaces.plan` (gói Nhóm để sau).
- **Bảng thử nghiệm `?debug=1`**: ép "Mã kích hoạt lỗi", ép "Mã đã dùng", ép "Kích hoạt chậm".

---

## 4. Lộ trình chia PR — 2 pha

Quy trình giữ nguyên AGENTS.md: mỗi nhánh một PR, bước nhỏ ~45 phút, `pnpm lint` + `pnpm typecheck` sạch từng bước, commit + push ngay, PR nháp thân là ô tích → tick bằng Python urllib PATCH `/pulls/{N}` → chuyển ready bằng GraphQL `markPullRequestReadyForReview`, e2e + Lighthouse, LOG.md khi build sạch. Nhánh xếp chồng: nhánh sau tách từ nhánh trước, base PR trỏ nhánh trước, merge kiểu "Create a merge commit" từ dưới lên.

### Pha C1-A (PR 01 → PR 07) — mở cửa cho người dùng thật sau PR 07

| PR | Nhánh | Nội dung | Bước |
|---|---|---|---|
| 01 | `c1/01-auth-foundation` | 1) Cài thử next-auth v4 với Next 16 — chạy được chọn, vướng thì chốt module tự dựng (ghi kết quả vào PR); 2) cấu hình Google OAuth + bảng users + bảng auth (Drizzle) + env; 3) trang đăng nhập + middleware + hook phiên; 4) e2e đăng nhập/đăng xuất/ẩn danh, LOG | 4 |
| 02 | `c1/02-db-schema` | 1) Supabase Postgres + drizzle-kit config + pooler; 2) schema toàn bộ §1.4 + migration; 3) seed demo từ fixture + script; 4) `dataNow()` remote múi giờ VN; 5) e2e, LOG | 5 |
| 03 | `c1/03-remote-read` | `lib/data/remote` đọc: account, folders, tasks, sessions (list/get/transcript/detail); bật qua `NEXT_PUBLIC_DATA_SOURCE=remote` cho người đăng nhập; e2e hai chế độ song song | 5 |
| 04 | `c1/04-remote-write` | remote ghi: createFromRecording + **R2 presigned upload** (POST /api/uploads, confirm, audio-url) cho băng và ảnh; checklist gap-check xuống DB thay `store.ts` Map; e2e upload thẳng R2 (không qua API route) | 5 |
| 05 | `c1/05-migrate-anon` | `POST /api/migrate-local` + banner xác nhận + upload blob presigned + dọn kho + nút "Ghim dữ liệu trên máy" trong Cài đặt; e2e kịch bản ngắt giữa chừng đẩy lại được | 4 |
| 06 | `c1/06-quota-db` | `usage_counters` thay Map; hạn mức gap-check theo user (ẩn danh giữ GAP_CHECK_FREE_DAILY); giới hạn ẩn danh 3 buổi/30 phút; e2e hạn mức | 3 |
| 07 | `c1/07-dashboard-v2` | Khối "Cần bổ sung sau buổi" + thẻ hạn mức + **sheet Nâng cấp gói + mã kích hoạt** (`promo_codes`, script gen mã) + cờ debug; Lighthouse dashboard; LOG | 5 |

### Pha C1-B (PR 08 → PR 12) — nhóm, Trợ lý, biên nhận, audit, quyền riêng tư

| PR | Nhánh | Nội dung | Bước |
|---|---|---|---|
| 08 | `c1/08-workspace-real` | Workspace/members/invites thật + switcher Cá nhân↔Nhóm (desktop menu, mobile sheet) — đợi GY1 (PR #76) merge | 5 |
| 09 | `c1/09-rbac-assistant` | Vai trò assistant + kiểm quyền server-side toàn bộ repository theo ma trận §3.1 + e2e quyền | 4 |
| 10 | `c1/10-consent-store` | Bảng consent_receipts + tra cứu 3 mức + cảnh báo thiếu biên nhận + giữ khi purge | 4 |
| 11 | `c1/11-audit-real` | Audit server-side (view_sensitive, replay_audio, consent_sign) + /team/audit thật + CSV + cron dọn 12 tháng | 4 |
| 12 | `c1/12-privacy-tools` | Trang /privacy + "Tải toàn bộ dữ liệu" + "Xóa tài khoản" + cron purge R2 theo audio_expires_at | 4 |

Phụ thuộc: pha A đợi anh merge chuỗi GC #77→#81 vào main (đụng `lib/gap-check`, `lib/data`); PR 08 đợi GY1 #76 (đụng folders). Tổng ~43 bước (~35 giờ làm việc agent). Mỗi PR có preview Vercel để duyệt giao diện.

---

## 5. Quy ước triển khai chung

- **Env secrets** (Vercel, không commit): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `EDU_MINUTES_MONTHLY` (tùy chọn); giữ nguyên `GAP_CHECK_FREE_DAILY`, `GAP_CHECK_MODEL`.
- **Không log nội dung nhạy cảm**: transcript, evidence, mã kích hoạt (che còn 4 ký tự cuối) tuyệt đối không vào console/audit.
- **Mỗi PR**: lint + typecheck sạch từng bước; `pnpm build` ở bước cuối; bài e2e mới trong `tests/e2e/` (dùng `tests/e2e/helpers.ts`) + hồi quy 2 project phone/desktop; PR có link preview Vercel + danh sách trạng thái đã kiểm.
- **Cờ thử nghiệm `?debug=1`**: mỗi trạng thái mới (mã sai, mã đã dùng, hết hạn mức, di trú lỗi, di trú chậm, hết hạn mức ẩn danh) phải ép được — thêm cờ vào `lib/debug/flags.ts` + nút vào `components/shell/debug-panel.tsx`.
- **Rollback**: `NEXT_PUBLIC_DATA_SOURCE=mock` trả app về mockup mọi lúc; chế độ ẩn danh luôn hoạt động — lỗi auth không chặn người dùng cũ.
- **Ngôn ngữ**: mọi chuỗi hiển thị vào `messages/vi.json` + `messages/en.json` (khóa đồng bộ); màn mới có chữ Hàn thì thêm `ko`.
- **Không đụng màn ghi âm** ngoài những điểm đặc tả nêu rõ (chặn hạn mức ẩn danh ở bảng bắt đầu ghi, không thêm bước nào khi ghi).
- **docs/04-data-contract.md**: khi triển khai từng PR, chỉ **thêm mục mới** ("Bổ sung C1") liệt kê thư viện đã duyệt và nguồn dữ liệu remote — không thay nội dung cũ (luật AGENTS.md).

---

## 6. Tiêu chí nghiệm thu chung

1. Đăng nhập Google ≤ 2 chạm từ lúc mở app lần đầu; đã đăng nhập thì mở app vào thẳng Thư viện.
2. Di trú: mất điện/ngắt mạng giữa chừng phải đẩy lại được, không sinh trùng buổi; mọi id giữ nguyên sau di trú.
3. Không một file ghi âm/ảnh nào đi qua API Route khi upload — kiểm bằng bài e2e chặn request thân lớn và xác nhận PUT thẳng R2.
4. Evidence không xuất hiện ở link công khai, email ra ngoài, console log, audit log (e2e chốt từng đường).
5. Quản trị và Chủ không đọc được nội dung buổi riêng tư của thành viên (e2e quyền theo ma trận §3.1).
6. Mã kích hoạt: đúng mã đổi gói + gia hạn đúng số tháng; mã đã dùng bị chặn; log che mã.
7. R2: băng hết hạn bị cron purge đúng hạn, giữ transcript + biên nhận; lifecycle là lưới an toàn.
8. Lighthouse dashboard mobile không thấp hơn điểm trước khi thêm khối mới (đo `pnpm lh`, in bảng vào PR).
9. Hồi quy đầy đủ xanh sau mỗi PR (phone + desktop); lint + typecheck + build sạch.
10. Không ghi khóa API/mật khẩu vào code, commit, PR.

---

## 7. Điểm mở — trạng thái

Toàn bộ 10 điểm mở của bản đề xuất đã được anh chốt ngày 20/11/2026 (§0.1), cùng 3 yêu cầu bổ sung (§0.2) và cập nhật Cloudflare R2 (§0.3). Không còn điểm mở nào cần chốt trước khi bắt đầu `c1/01-auth-foundation`. Phát sinh trong lúc làm: hỏi bằng comment trong issue, gắn nhãn `can-hoi` (luật AGENTS.md).
