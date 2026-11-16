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

### TaskRepository

| Phương thức | Bản giả làm gì | Bản thật cần API | Vào/ra | Lỗi |
| --- | --- | --- | --- | --- |
| `listAll(filter?)` | Gom việc của mọi buổi, lọc "của tôi" | `GET /tasks?mine=1` | → `ActionItem[]` | `offline` |
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
| `create(sessionId, opts)` | Sinh link giả `share_<random>`, lưu mật khẩu, hạn, phạm vi | `POST /sessions/:sid/shares` | `{ scope, expires_at, password? }` → `ShareLink` | `offline` |
| `revoke(id)` | Đánh dấu thu hồi | `POST /shares/:id/revoke` | → `void` | `offline` |
| `getForSession(sessionId)` | Trả link đang sống của buổi (chưa thu hồi, chưa hết hạn) | `GET /sessions/:sid/share` | → `ShareLink \| null` | `offline` |
| `listAll()` | Mọi link đã tạo, cho mục Quyền riêng tư | `GET /shares` | → `ShareLink[]` | `offline` |
| `recordView(shareId)` | Tăng lượt xem | `POST /shares/:id/view` | → `void` | — |
| `getPublic(shareId, password?)` | Kiểm thứ tự: thu hồi → hết hạn → cần mật khẩu → trả nội dung công khai | `GET /public/shares/:id` (endpoint không cần đăng nhập) | → `PublicSessionView \| "expired" \| "revoked" \| "needs_password" \| "not_found"` | các trạng thái trên là giá trị trả về, không phải exception |

### MailRepository

| Phương thức | Bản giả làm gì | Bản thật cần API | Vào/ra | Lỗi |
| --- | --- | --- | --- | --- |
| `preview(sessionId, recipientContactIds, mode)` | Dựng thư từ tóm tắt/việc theo người nhận | `POST /mail/preview` | → `EmailDraft[]` | `offline` |
| `send(drafts)` | Gửi giả, ghi `send_history` vào buổi; cờ "Gửi email lỗi một người" ép 1 người thất bại | `POST /mail/send` (Resend/SES) | `EmailDraft[]` → `{ contact_id, ok }[]` | `offline` |

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
| `updateContact(id, patch)` | Sửa liên hệ (thêm email tại hàng người nhận) | `PATCH /contacts/:id` | → `void` | `offline` |
| `contactUsage(id)` | Liệt kê buổi đang dùng liên hệ làm người nói (cảnh báo trước xóa) | `GET /contacts/:id/usage` | → `string[]` (session ids) | `offline` |
| `removeContact(id)` | Xóa liên hệ; người nói gán liên hệ này trả về "Người nói N" | `DELETE /contacts/:id` | → `void` | `offline` |
| `updateTemplate(id, patch)` | Bật/tắt, đổi thứ tự phần của mẫu (kèm trường `*_en` giữ nguyên) | `PATCH /templates/:id` | `{ sections }` → `void` | `offline` |
| `exportAll()` | Xuất toàn bộ kho ra JSON tải về | `GET /me/export` | → `Record<string, unknown>` | `offline` |

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
- **Gửi email**: `send()` luôn thành công (trừ cờ ép lỗi), chỉ ghi lịch sử —
  bản thật cần nhà cung cấp email và xác minh tên miền.
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
```

Ghi chú bảo mật: mật khẩu link băm (bcrypt/argon2) ở `shares.password_hash`;
điểm cộng lượt xem qua RPC `record_view` (security definer, chỉ tăng số).
File âm thanh và ảnh đặt ở object storage (Supabase Storage), bucket riêng
theo `user_id`, đường dẫn kiểm bằng policy `storage.objects`.

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

Lưu ý từ mock hiện tại: lỗi trả về bằng `DataError` với mã
`offline | not_found | quota_exceeded | server` — giao diện bắt theo mã này,
bản thật cần map lỗi HTTP/Supabase về cùng bộ mã.

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
