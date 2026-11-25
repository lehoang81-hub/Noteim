# 13. Rà quyền role `noteim_app` và nhật ký máy chủ (C1-06)

> Ngày rà: 2026-11-25. Người rà: coding agent (PR #93).
> **Mọi SQL trong tài liệu này CHỈ LÀ ĐỀ XUẤT** — chưa chạy trên Supabase thật
> vì máy làm việc không có `DATABASE_URL` thật và không có quyền DBA. Chờ Hoang
> xem, chạy tay trên Supabase bằng role DBA khi thấy phù hợp.

## 1. Bối cảnh

- Project Supabase **dùng chung với app khác**; schema `noteim` do DBA tạo sẵn,
  role `noteim_app` không có quyền CREATE ở cấp **database** (lỗi 42501 nếu cố
  tạo schema — docs/12 mục 1.3). Migration vẫn tự tạo **bảng** trong schema
  `noteim` (bảng sổ `noteim.__drizzle_migrations` + bảng mới khi có cột mới)
  nên role cần quyền CREATE ở cấp **schema `noteim`**.
- Cron của app chạy bằng **Vercel Cron** (HTTP, `vercel.json`) — KHÔNG dùng
  pg_cron của Supabase, không cần quyền gì trên schema `cron`.
- App chỉ nói chuyện với schema `noteim` (24 bảng, `lib/db/schema.ts`): users,
  accounts, auth_sessions, verification_tokens, workspaces, workspace_members,
  invites, folders, folder_sessions, sessions, session_details,
  transcript_segments, summary_versions, action_items, contacts, glossary_terms,
  chat_messages, folder_chat_messages, share_links, session_gap_checks,
  consent_receipts, audit_log, usage_counters, promo_codes + bảng sổ
  `__drizzle_migrations`. Không đụng `public`, không đụng `cron`.

## 2. Rủi ro cần rà

1. Lúc DBA tạo role có thể đã cấp quyền theo mẫu rộng (`GRANT ALL ON DATABASE`,
   `GRANT ALL ON SCHEMA public`, hoặc role này kế thừa `postgres`/`anon`) →
   app đọc được bảng của **app khác** trên cùng project.
2. `cron.job_run_details` và các bảng khác trong schema `cron` của Supabase:
   nếu role được `USAGE` trên schema `cron` thì đọc được lịch sử cron của cả
   project (tên job, lệnh SQL, kết quả).
3. Quyền chạy hàm/routine thừa (`EXECUTE` trên hàm hệ thống Supabase).

## 3. SQL rà (chỉ đọc — an toàn, chạy được ngay bằng role DBA)

```sql
-- 3.1. Toàn bộ quyền trên bảng mà noteim_app được cấp (mọi schema)
SELECT grantee, table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'noteim_app'
ORDER BY table_schema, table_name, privilege_type;

-- 3.2. Quyền cấp-qua-vai-trò (nếu noteim_app là thành viên role khác —
-- ví dụ kế thừa postgres thì mọi quyền của postgres đều áp dụng)
SELECT r.rolname AS role, m.rolname AS member
FROM pg_auth_members am
JOIN pg_roles r ON r.oid = am.roleid
JOIN pg_roles m ON m.oid = am.member
WHERE m.rolname = 'noteim_app';

-- 3.3. Quyền cấp database/schema của noteim_app
SELECT datname, has_database_privilege('noteim_app', d.datname, 'CONNECT')  AS can_connect,
       has_database_privilege('noteim_app', d.datname, 'CREATE')   AS can_create_db
FROM pg_database d WHERE d.datname = current_database();
SELECT nspname,
       has_schema_privilege('noteim_app', n.nspname, 'USAGE')  AS can_use,
       has_schema_privilege('noteim_app', n.nspname, 'CREATE') AS can_create
FROM pg_namespace n
WHERE n.nspname IN ('noteim', 'public', 'cron', 'extensions', 'auth', 'storage', 'supabase_functions')
ORDER BY nspname;

-- 3.4. Schema cron: role có đọc được lịch sử cron của project không?
SELECT has_schema_privilege('noteim_app', 'cron', 'USAGE') AS cron_usage,
       has_table_privilege('noteim_app', 'cron.job_run_details', 'SELECT') AS can_read_job_run_details;

-- 3.5. Bảng NGOÀI schema noteim mà noteim_app chạm được (những gì cần thu hồi)
SELECT table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'noteim_app' AND table_schema <> 'noteim'
ORDER BY table_schema, table_name;

-- 3.6. Quyền trên hàm (routine) ngoài noteim
SELECT routine_schema, routine_name, privilege_type
FROM information_schema.role_routine_grants
WHERE grantee = 'noteim_app' AND routine_schema <> 'noteim'
ORDER BY 1, 2;
```

Đối chiếu kết quả: **chỉ được còn** quyền ở schema `noteim` (mục 4) và
`CONNECT` database. Mọi dòng ở `public`, `cron`, `extensions`, `auth`,
`storage`, `supabase_functions` là quyền thừa.

## 4. Đề xuất thu hẹp (chạy sau khi đã rà, từng cụm một, có OK của Hoang)

```sql
BEGIN;

-- 4.1. Chỉ giữ CONNECT ở cấp database; thu CREATE database nếu có
REVOKE CREATE ON DATABASE postgres FROM noteim_app;   -- tên DB xem bằng SELECT current_database();

-- 4.2. Thu mọi quyền trên bảng/sequence NGOÀI schema noteim (public, cron, ...)
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM noteim_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM noteim_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM noteim_app;
REVOKE USAGE ON SCHEMA public FROM noteim_app;
-- cron của Supabase: app không dùng, thu sạch (cron.job_run_details nằm trong đây)
REVOKE ALL ON ALL TABLES    IN SCHEMA cron FROM noteim_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA cron FROM noteim_app;
REVOKE USAGE ON SCHEMA cron FROM noteim_app;

-- 4.3. Khung quyền TỐI THIỂU đúng app cần trong schema noteim
GRANT USAGE ON SCHEMA noteim TO noteim_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA noteim TO noteim_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA noteim TO noteim_app;
-- CREATE ở cấp SCHEMA (khác CREATE database) — migration pnpm db:migrate cần
-- nó để tạo bảng sổ + bảng mới trong schema noteim
GRANT CREATE ON SCHEMA noteim TO noteim_app;
-- Bảng tạo sau này tự có quyền (migration là noteim_app tự tạo nên đã là chủ,
-- dòng dưới cho chắc khi DBA thay người tạo bảng)
ALTER DEFAULT PRIVILEGES IN SCHEMA noteim
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO noteim_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA noteim
  GRANT USAGE, SELECT ON SEQUENCES TO noteim_app;

COMMIT;
```

Lưu ý khi chạy:

- KHÔNG revoke `CONNECT` database và KHÔNG revoke quyền trong schema `noteim`
  (app dừng ngay nếu thiếu).
- KHÔNG đụng role khác của project (app khác trên cùng project không liên quan).
- Sau khi chạy: vào app đăng nhập, tạo/xem/sửa buổi, chạy `pnpm db:migrate`
  trên môi trường thử trỏ cùng Supabase để chắc migration vẫn chạy.
- Nếu 3.2 cho thấy `noteim_app` là thành viên role lớn (postgres, service_role)
  → REMOVE MEMBERSHIP trước, rồi mới áp dụng mục 4 (mục 4 không đùa được với
  role kế thừa).

## 5. Kết quả rà nhật ký máy chủ (25/11, dùng cho C1-06)

Đã soát mọi `console.log/warn/error` phía máy chủ (`lib/data/server/`,
`lib/gap-check/`, `lib/auth/`, `app/api/`). Kết luận: **không có dòng nào ghi
bản chữ, tóm tắt, URL presigned, khóa API, email**. Cụ thể:

| Vị trí | Nội dung ghi | Đánh giá |
|---|---|---|
| `asr-pipeline.ts` `logEvent` | `sessionId`, `event`, số liệu kỹ thuật (ms, attempts, mã lỗi ngắn kiểu `soniox_submit`) | sạch — mã lỗi là mã máy ngắn, không phải nội dung buổi |
| `soniox.ts` | `[asr] soniox start/transcript` — chỉ ms + ts | sạch — không ghi audio_url presigned, không ghi chữ |
| `summarize.ts` | `[asr] gemini ok` — ms + số ký tự | sạch — không ghi tóm tắt |
| `gap-check/provider.ts` `logAttempt` | provider, outcome, status, ms, ts | sạch — có chú thích tường minh "không có transcript" |
| `gap-check/route.ts` `logGapCheck` | event, sessionId, templateId, attempts, latencyMs, outcome | sạch |
| `auth/nextauth-options.ts` | thông điệp lỗi ngắn `error.message` | sạch — có chú thích "không ghi nội dung nhạy cảm" |
| `context.ts` | thông điệp lỗi cắt 160 ký tự | sạch — chú thích tường minh, không ghi dữ liệu người dùng |
| `sample-fixtures.ts` | id mẫu khi fixture sai cấu trúc | sạch |

Không có `console.*` nào trong `r2.ts`, `app/api/audio/*` (presign/complete/302)
và `app/api/cron/*` — đường presigned/khóa đối tượng không bao giờ ra log.

## 6. Liệt kê dữ liệu thử nặng — đề xuất bỏ/giữ (C1-06, CHỈ ĐỀ XUẤT, CHƯA XÓA GÌ)

Tổng: `test-data/` ≈ 24 MB, `public/audio/` ≈ 13 MB (48 file trong git).

### Bỏ được (đề xuất, ≈ 7,4 MB)

| File | Dung lượng | Lý do |
|---|---|---|
| `test-data/audio/*.ogg` (10 file: 01–10, trừ không có 04) | ≈ 7,3 MB | Trùng nội dung file `.m4a` cùng tên — chỉ B0 từng ghi ogg cho ASR; mọi script hiện tại (`b0-asr/run.mjs`, `asr-smoke.mjs`, `attach-test-audio.mjs`) đều dùng `.m4a`, e2e không dùng test-data. Sinh lại được bằng `scripts/gen-test-audio.py`. |
| `test-data/asr-results/soniox/*.raw.json.gz` (5 file) | ≈ 96 KB | Đáp thô của API Soniox đã được tóm tắt vào `.json` cùng thư mục; chỉ cần khi muốn chấm lại bằng logic khác. |

### Giữ (bắt buộc hoặc rẻ mà quý)

| Nhóm | Dung lượng | Lý do giữ |
|---|---|---|
| `public/audio/*.m4a` (8 file) | ≈ 13 MB | Âm thanh buổi mẫu theo nghề — app nạp lúc chạy (M9-02, `fixtures/audio-attach.json` gán cho 8 buổi mẫu), e2e nghe sách/nghe lại dùng. |
| `test-data/audio/*.m4a` (9 file) | ≈ 12,9 MB | Bản nguồn của `public/audio` (`attach-test-audio.mjs` chép từ đây); `asr-smoke.mjs` dùng `03-bac-si-kham.m4a` (0,9 MB); B0 chạy lại được. |
| `test-data/audio/*.truth.json` (9 file) | ≈ 150 KB | Bản chép chuẩn để chấm sai chữ (B0, docs/11) — không sinh lại được bằng script. |
| `test-data/asr-results/soniox/*.json` (6 file) | ≈ 2,7 MB | Kết quả B0 đã chốt (docs/11); riêng `04-dai-62-phut.json` (1,9 MB) là dữ liệu bản chữ DÀI DUY NHẤT để kiểm map-reduce tóm tắt — không có khóa API thì không sinh lại được. |
| `test-data/README.md`, `test-data/human/` | < 10 KB | Ghi chú nguồn dữ liệu. |

Sau khi Hoang OK: xóa 2 nhóm "bỏ được" trong MỘT commit riêng (git rm + commit
"bớt dữ liệu thử theo docs/13 mục 6"), repo nhẹ ≈ 7,4 MB / 37 MB ≈ 20%.
