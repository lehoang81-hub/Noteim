/**
 * db:test — kiểm end-to-end migration + seed trên PGlite (Postgres chạy
 * dưới dạng WASM, không cần DB thật) — yêu cầu của PR 02:
 *
 * 1) Giả lập đúng tình huống Supabase thật (góp ý test 22/11):
 *    - DBA tạo sẵn schema `noteim`; role `noteim_app` KHÔNG có quyền
 *      CREATE trên database (tạo schema bị từ chối — lỗi 42501 thật).
 *    - Chạy migration đúng bằng `scripts/db-migrate.mjs` (bảng sổ
 *      noteim.__drizzle_migrations, không CREATE SCHEMA) dưới role đó.
 *    - Migration phải sạch; chạy lần 2 bỏ qua toàn bộ (idempotent).
 *    - Bảng không rơi vào `public`.
 * 2) Seed lần 1 — ghi mới toàn bộ; seed lần 2 — phải bỏ qua toàn bộ
 *    (idempotent). Báo cáo số dòng ghi/bỏ qua theo từng bảng, mỗi lần.
 * 3) Kiểm số dòng cuối khớp ánh xạ fixture; không trùng khóa mềm
 *    (thành viên theo email, chat y hệt, audit y hệt, việc theo buổi).
 * 4) Kiểm trigger giới hạn 10 dòng gap-check mỗi buổi hoạt động.
 *
 * Dùng: `node scripts/db-test.mjs` (hoặc `pnpm db:test`). Mã thoát 0/1.
 * Không cần DATABASE_URL — PGlite chạy trong bộ nhớ.
 *
 * Giới hạn ghi rõ: PGlite là một connection duy nhất nên dùng `SET ROLE`
 * để mô phỏng quyền `noteim_app` trong instance (không tách process).
 * Quyền đã đúng mô hình: role không superuser, không quyền CREATE trên
 * database, chỉ có USAGE/CREATE trong schema `noteim` đã có sẵn (giống
 * DBA đã grant trên Supabase — phần bảng/index/trigger test bằng
 * `noteim_app` chạy được, còn CREATE SCHEMA thì bị từ chối).
 */
import { PGlite } from "@electric-sql/pglite";
import { migrateWith } from "./db-migrate.mjs";
import { buildPlan, seedInto } from "./db-seed.mjs";

let failures = 0;
function check(cond, okMsg, failMsg) {
  if (cond) {
    console.log(`  [đạt] ${okMsg}`);
  } else {
    failures++;
    console.error(`  [THẤT BẠI] ${failMsg}`);
  }
}

const db = new PGlite();

/* ---------- 1. Migration qua scripts/db-migrate.mjs, role giới hạn ---------- */

console.log(
  "== 1. Migration qua scripts/db-migrate.mjs với role không có quyền tạo schema ==",
);

// (a) Giả lập DBA Supabase: schema `noteim` tạo sẵn; role `noteim_app`
//     không superuser — không có quyền CREATE trên database. Chỉ grant
//     USAGE/CREATE TRONG schema noteim (quyền cấp-schema, giống DBA đã
//     grant trên Supabase; đây là DB test trong bộ nhớ, không phải
//     cấp quyền thật trên Supabase).
await db.exec(`CREATE SCHEMA "noteim"`);
await db.exec(`CREATE ROLE "noteim_app"`);
await db.exec(`GRANT USAGE, CREATE ON SCHEMA "noteim" TO "noteim_app"`);
await db.exec(`SET ROLE "noteim_app"`);

// (b) Chứng minh role không có quyền CREATE trên database: tạo schema
//     phải bị từ chối (như lỗi 42501 trên Supabase thật ngày 22/11).
let probeError = null;
try {
  await db.query(`CREATE SCHEMA "noteim_probe_42501"`);
} catch (error) {
  probeError = error;
}
check(
  probeError !== null,
  "Role test không có quyền CREATE trên database (tạo schema bị từ chối) — mô phỏng đúng noteim_app trên Supabase",
  "Role test vẫn tạo được schema mới — mô phỏng quyền không đúng, bài test không có giá trị chứng minh",
);

// (c) Chạy migration đúng bằng script db:migrate (không CREATE SCHEMA).
//     Runtime gói giao dịch của PGlite theo hợp đồng migrateWith().
const pgliteRuntime = {
  begin: (fn) =>
    db.transaction(async (tx) =>
      fn({
        q: async (text, params = []) => (await tx.query(text, params)).rows,
        exec: (text) => tx.exec(text),
      }),
    ),
};
let migrationError = null;
let firstRun = null;
try {
  firstRun = await migrateWith(pgliteRuntime, {
    log: (message) => console.log(`  ${message}`),
  });
} catch (error) {
  migrationError = error;
}
check(
  migrationError === null,
  `Toàn bộ migration chạy sạch bằng scripts/db-migrate.mjs (áp dụng ${firstRun?.applied ?? "?"}/${firstRun?.total ?? "?"}, không tạo schema)`,
  `Migration lỗi: ${migrationError instanceof Error ? migrationError.message : migrationError}`,
);

const pgVersion = (await db.query("select version() as v")).rows[0].v;
console.log(`  Postgres: ${pgVersion}`);

// Bảng sổ ghi đủ hash của từng file migration.
const ledgerCount = (
  await db.query(
    'select count(*)::int as n from "noteim"."__drizzle_migrations"',
  )
).rows[0].n;
check(
  firstRun !== null && ledgerCount === firstRun.total,
  `Bảng sổ noteim.__drizzle_migrations ghi đủ hash (${ledgerCount}/${firstRun?.total ?? "?"} file)`,
  `Bảng sổ có ${ledgerCount} dòng nhưng journal có ${firstRun?.total ?? "?"} file migration`,
);

// Migrate lần 2 phải bỏ qua toàn bộ (idempotent theo hash).
let secondRun = null;
let secondError = null;
try {
  secondRun = await migrateWith(pgliteRuntime);
} catch (error) {
  secondError = error;
}
check(
  secondError === null && secondRun?.applied === 0,
  "Chạy migrate lần 2 bỏ qua toàn bộ file (idempotent theo hash)",
  `Migrate lần 2 lỗi hoặc còn áp dụng mới (${secondRun?.applied ?? "?"}): ${secondError instanceof Error ? secondError.message : ""}`,
);

// Toàn bộ bước dưới vẫn chạy dưới role giới hạn (SET ROLE còn hiệu lực).
const currentRole = (await db.query("select current_user as u")).rows[0].u;
check(
  currentRole === "noteim_app",
  "Toàn bộ migrate + seed + kiểm tra chạy dưới role noteim_app (không superuser)",
  `Đang chạy dưới role ${currentRole} — không phải noteim_app`,
);

// 23 bảng Noteim nằm trong schema noteim (trừ bảng sổ migration).
const tableCount = (
  await db.query(
    "select count(*)::int as n from information_schema.tables where table_schema = 'noteim' and table_type = 'BASE TABLE' and table_name <> '__drizzle_migrations'",
  )
).rows[0].n;
check(
  tableCount === 23,
  `Schema noteim có đúng ${tableCount}/23 bảng`,
  `Schema noteim có ${tableCount}/23 bảng`,
);

// Không bảng nào rơi vào public
const publicTables = (
  await db.query(
    "select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name = any(string_to_array($1, ','))",
    ["accounts,action_items,audit_log,auth_sessions,chat_messages,consent_receipts,contacts,folder_sessions,folders,glossary_terms,invites,promo_codes,session_details,session_gap_checks,sessions,share_links,summary_versions,transcript_segments,usage_counters,users,verification_tokens,workspace_members,workspaces"],
  )
).rows[0].n;
check(
  publicTables === 0,
  "Không bảng nào nằm trong schema public",
  `Có ${publicTables} bảng của Noteim trong schema public`,
);

/* ---------- 2. Seed hai lần ---------- */

console.log(
  "== 2. Seed lần 1 (ghi mới) và lần 2 (phải bỏ qua hết) — vẫn dưới role noteim_app ==",
);
const { plan } = buildPlan();
const run = (text, params) => db.query(text, params);
const expected = {};
for (const s of plan) expected[s.table] = s.rows.length;

const run1 = await seedInto(run, plan);
const run2 = await seedInto(run, plan);

console.log(
  "  bảng                    | lần 1: ghi/bỏ qua | lần 2: ghi/bỏ qua",
);
let sum1 = 0;
let sum2 = 0;
for (const s of plan) {
  const a = run1[s.table] ?? 0;
  const b = run2[s.table] ?? 0;
  sum1 += a;
  sum2 += b;
  console.log(
    `  ${s.table.padEnd(23)} | ${`${a}/${s.rows.length - a}`.padEnd(17)} | ${b}/${s.rows.length - b}`,
  );
}
console.log(
  `  TỔNG: lần 1 ghi ${sum1} dòng — lần 2 ghi ${sum2} dòng (bỏ qua toàn bộ).`,
);

check(
  plan.every((s) => (run1[s.table] ?? 0) === s.rows.length),
  "Lần 1 ghi đủ 100% dòng ánh xạ từ fixture (không mất dòng nào)",
  "Lần 1 có bảng không ghi đủ dòng — xem bảng phía trên",
);
check(
  Object.values(run2).every((n) => n === 0),
  "Lần 2 bỏ qua toàn bộ — seed idempotent",
  `Lần 2 còn ghi mới ${sum2} dòng — seed chưa idempotent`,
);

/* ---------- 3. Số dòng cuối + không trùng ---------- */

console.log("== 3. Số dòng cuối và kiểm không trùng ==");
for (const s of plan) {
  const n = (await db.query(`select count(*)::int as n from "noteim"."${s.table}"`)).rows[0].n;
  check(
    n === s.rows.length,
    `${s.table}: ${n} dòng`,
    `${s.table}: ${n} dòng (kỳ vọng ${s.rows.length})`,
  );
}

const dupMembers = (
  await db.query(
    "select count(*)::int as n from (select workspace_id, lower(email) from \"noteim\".\"workspace_members\" group by 1, 2 having count(*) > 1) t",
  )
).rows[0].n;
check(dupMembers === 0, "workspace_members: không trùng (workspace_id, email)", `workspace_members còn ${dupMembers} cặp trùng`);

const dupChat = (
  await db.query(
    "select count(*)::int as n from (select session_id, role, created_at, md5(text) from \"noteim\".\"chat_messages\" group by 1, 2, 3, 4 having count(*) > 1) t",
  )
).rows[0].n;
check(dupChat === 0, "chat_messages: không có tin nhắn y hệt trùng", `chat_messages còn ${dupChat} tin trùng`);

const dupAudit = (
  await db.query(
    "select count(*)::int as n from (select workspace_id, actor_user_id, action, target_type, target_id, at from \"noteim\".\"audit_log\" group by 1, 2, 3, 4, 5, 6 having count(*) > 1) t",
  )
).rows[0].n;
check(dupAudit === 0, "audit_log: không có dòng nhật ký y hệt trùng", `audit_log còn ${dupAudit} dòng trùng`);

const dupAction = (
  await db.query(
    "select count(*)::int as n from (select session_id, id from \"noteim\".\"action_items\" group by 1, 2 having count(*) > 1) t",
  )
).rows[0].n;
check(dupAction === 0, "action_items: không trùng (session_id, id)", `action_items còn ${dupAction} khóa trùng`);

/* ---------- 4. Trigger giới hạn 10 dòng gap-check/buổi ---------- */

console.log("== 4. Trigger noteim_gap_check_max10 ==");
const sid = (
  await db.query('select id from "noteim"."sessions" order by id limit 1')
).rows[0].id;
for (let i = 0; i < 11; i++) {
  await db.query(
    'insert into "noteim"."session_gap_checks" (session_id, template_id, checked_at, transcript_until_ms, result_json) values ($1, \'t\', now() + ($2 || \' seconds\')::interval, 0, \'{}\'::jsonb)',
    [sid, String(i)],
  );
}
const gapCount = (
  await db.query(
    'select count(*)::int as n from "noteim"."session_gap_checks" where session_id = $1',
    [sid],
  )
).rows[0].n;
check(
  gapCount === 10,
  `Chèn 11 lần nhưng bảng giữ đúng 10 dòng/buổi (đang ${gapCount})`,
  `Chèn 11 lần nhưng bảng còn ${gapCount} dòng — trigger không hoạt động`,
);

/* ---------- Kết luận ---------- */

if (failures > 0) {
  console.error(`\npnpm db:test THẤT BẠI: ${failures} kiểm tra không đạt.`);
  process.exit(1);
}
console.log(
  "\npnpm db:test đạt: migration bằng scripts/db-migrate.mjs (không CREATE SCHEMA, role noteim_app giới hạn) + migrate idempotent + seed hai lần + không trùng + trigger hoạt động.",
);
process.exit(0);
