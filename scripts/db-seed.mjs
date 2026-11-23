/**
 * Seed dữ liệu demo từ fixture vào DATABASE_URL — PR 02 (đặc tả C1 §1.3:
 * "script seed dữ liệu demo từ fixture giữ cho môi trường thử").
 *
 * Dùng: `node scripts/db-seed.mjs [--dry]` (hoặc `pnpm db:seed [--dry]`)
 * - `--dry`: chỉ đếm số dòng sẽ ghi theo ánh xạ fixture → bảng, KHÔNG cần DB
 *   — dùng để kiểm ánh xạ trên máy không có khóa.
 * - Không `--dry`: nối DATABASE_URL và ghi vào schema `noteim`; chạy lại bao
 *   nhiêu lần kết quả dữ liệu cũng như nhau — mọi bảng dùng `ON CONFLICT …
 *   DO NOTHING` nhắm đúng khóa/ràng buộc đã khai trong `lib/db/schema.ts`:
 *   id fixture cho dòng client sinh; id ổn định theo nội dung (stableUuid)
 *   cho dòng máy sinh (chat_messages, audit_log); unique theo (workspace_id,
 *   lower(email)) cho thành viên còn lời mời. Mỗi lần chạy in số dòng
 *   ghi/bỏ qua theo từng bảng.
 * - Mã thoát: 0 thành công; 2 thiếu DATABASE_URL (đang chờ); 3 lỗi nối/ghi.
 *
 * Nguồn fixture (nguồn sự thật là `lib/data/types.ts`):
 *   fixtures/user.json, workspaces.json, members.json, contacts.json,
 *   folders.json, glossary.json, audit.json, sessions/*.json
 *
 * Quy tắc id (§1.2): id buổi/thư mục/liên hệ/từ điển/việc giữ nguyên như
 * fixture (việc cần làm khóa composite (session_id, id)); id người dùng là
 * uuid do máy sinh (fixture user id được ánh xạ sang uuid trong lần chạy này);
 * chat_messages/audit_log dùng uuid ổn định theo nội dung fixture để chạy
 * lại không sinh trùng. Không bao giờ in giá trị DATABASE_URL.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import postgres from "postgres";

/** Chỉ chạy phần CLI khi gọi trực tiếp (db-test import module này để dùng lại). */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

const ROOT = join(import.meta.dirname, "..");
const FIXTURES = join(ROOT, "fixtures");

const dryRun = isMain && process.argv.includes("--dry");
const url = isMain ? (process.env.DATABASE_URL ?? "") : "";

/** Giới hạn tham số mỗi câu INSERT (protocol Postgres giới hạn 65535). */
const MAX_PARAMS_PER_STATEMENT = 2000;

/** Mốc giờ cố định cho dòng fixture thiếu thời điểm — chạy lại phải trùng. */
const FIXED_EPOCH = new Date("2026-01-01T00:00:00Z");

function exitWith(code, message) {
  console.log(message);
  process.exit(code);
}

if (isMain && !dryRun && !url) {
  exitWith(
    2,
    "Thiếu DATABASE_URL (Supabase Postgres vùng ap-southeast-1) — đang chờ. Chạy `--dry` để kiểm ánh xạ không cần DB; không commit khóa.",
  );
}
if (isMain && !dryRun && !url.startsWith("postgres://") && !url.startsWith("postgresql://")) {
  exitWith(2, "DATABASE_URL không phải chuỗi Postgres — đang chờ giá trị Supabase đúng. Không commit khóa.");
}

function readJson(rel) {
  return JSON.parse(readFileSync(join(FIXTURES, rel), "utf8"));
}

function toDateOrNull(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ---------- Ánh xạ giá trị → tham số Postgres ---------- */

/** Chuỗi literal mảng text[] của Postgres: {'a','b,c'} — bỏ qua khi rỗng. */
function pgArrayLiteral(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "{}";
  const item = (v) => {
    const s = String(v);
    if (s === "" || /[\s",{}\\]/.test(s) || s.toLowerCase() === "null") {
      return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }
    return s;
  };
  return `{${arr.map(item).join(",")}}`;
}

/** uuid ổn định theo nội dung — chạy lại seed phải ra đúng giá trị đó. */
function stableUuid(seed) {
  const h = createHash("sha1").update(`noteim-seed:${seed}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/* ---------- Đọc fixture và dựng dòng ---------- */

function buildRows({ existingUserId = null } = {}) {
  const user = readJson("user.json");
  const workspaces = readJson("workspaces.json");
  const members = readJson("members.json");
  const contacts = readJson("contacts.json");
  const folders = readJson("folders.json");
  const glossary = readJson("glossary.json");
  const audit = readJson("audit.json");

  const sessionsDir = join(FIXTURES, "sessions");
  const sessionFiles = existsSync(sessionsDir)
    ? readdirSync(sessionsDir).filter((f) => f.endsWith(".json")).sort()
    : [];
  const sessionFixtures = sessionFiles.map((f) => ({
    file: f,
    data: JSON.parse(readFileSync(join(sessionsDir, f), "utf8")),
  }));

  // Ánh xạ id người dùng fixture (chuỗi như "u-...") → uuid máy sinh
  // (§1.4: users.id là uuid). Có sẵn user cùng email trong DB thì dùng lại
  // id đó; chưa có thì sinh uuid cố định theo email (commit 09d334e) để
  // chạy lại không phá khóa ngoại.
  const userUuid = existingUserId ?? stableUuid(user.email.toLowerCase());
  const userIdMap = new Map([[user.id, userUuid]]);
  // Ánh xạ id thành viên khác trong members (nếu trùng user fixture) → null khi không biết
  for (const m of members) {
    if (m.user_id && !userIdMap.has(m.user_id)) userIdMap.set(m.user_id, null);
  }

  const usersRows = [
    {
      id: userUuid,
      email: user.email.toLowerCase(),
      display_name: user.display_name ?? null,
      honorific: user.honorific ?? null,
      profession: user.profession ?? null,
      default_template_id: user.default_template_id ?? null,
      plan: user.plan ?? "free",
      ui_language: user.ui_language ?? "vi",
      theme: user.theme ?? "system",
      consent_reminder: user.consent_reminder ?? true,
      consent_announcement: user.consent_announcement ?? null,
      auto_filter_silence: user.auto_filter_silence ?? false,
      default_speech_language: user.default_speech_language ?? "vi",
      auto_detect_languages: user.auto_detect_languages ?? true,
      default_report_language: user.default_report_language ?? "vi",
      auto_translate_on_send: user.auto_translate_on_send ?? true,
      current_workspace_id: user.current_workspace_id ?? "",
      listening_prefs: user.listening_prefs ?? null,
      onboarded_at: toDateOrNull(user.onboarded_at),
    },
  ];

  const workspacesRows = workspaces.map((w) => ({
    id: w.id,
    kind: w.kind ?? "personal",
    name: w.name ?? "",
    profession: w.profession ?? null,
    default_report_language: w.default_report_language ?? "vi",
    plan: w.plan ?? "free",
    seat_limit: w.seat_limit ?? null,
    owner_user_id: userIdMap.get(w.owner_user_id) ?? userUuid,
  }));

  const membersRows = members.map((m) => ({
    workspace_id: m.workspace_id,
    user_id: m.user_id ? (userIdMap.get(m.user_id) ?? null) : null,
    email: m.email,
    display_name: m.display_name ?? "",
    role: m.role ?? "member",
    status: m.status ?? "invited",
    invited_at: toDateOrNull(m.invited_at) ?? new Date(),
    invite_expires_at: toDateOrNull(m.invite_expires_at),
  }));

  const contactsRows = contacts.map((c) => ({
    id: c.id,
    user_id: userUuid,
    name: c.name,
    role: c.role ?? null,
    email: c.email ?? null,
    preferred_language: c.preferred_language ?? null,
  }));

  const glossaryRows = glossary.map((g) => ({
    id: g.id,
    user_id: userUuid,
    term: g.term,
    note: g.note ?? null,
    variants: g.variants ?? {},
  }));

  /* Buổi ghi: sessions + session_details + transcript_segments + chat + tóm tắt + việc + biên nhận */
  const sessionsRows = [];
  const detailsRows = [];
  const segmentRows = [];
  const chatRows = [];
  const summaryRows = [];
  const actionRows = [];
  const receiptRows = [];

  for (const { file, data } of sessionFixtures) {
    const d = data.detail ?? {};
    const sid = d.id;
    if (!sid) {
      console.warn(`(bỏ qua ${file}) fixture buổi thiếu detail.id`);
      continue;
    }
    const ownerUuid = userIdMap.get(d.owner_user_id || d.user_id) ?? userUuid;
    const sessionCreatedAt = toDateOrNull(d.created_at) ?? FIXED_EPOCH;
    sessionsRows.push({
      id: sid,
      user_id: userIdMap.get(d.user_id) ?? userUuid,
      workspace_id: d.workspace_id ?? null,
      visibility: d.visibility ?? "private",
      owner_user_id: ownerUuid,
      title: d.title ?? "(không tên)",
      template_id: d.template_id ?? "",
      intake_template_id: d.intake_template_id ?? null,
      primary_language: d.primary_language ?? "vi",
      detected_languages: d.detected_languages ?? [],
      report_languages: d.report_languages ?? [],
      original_report_language: d.original_report_language ?? "vi",
      status: d.status ?? "processing",
      processing_step: d.processing_step ?? null,
      failure_reason: d.failure_reason ?? null,
      storage_status: d.storage_status ?? "full",
      duration_sec: Math.round(d.duration_sec ?? 0),
      size_bytes: Math.round(d.size_bytes ?? 0),
      // audio_path là key R2 — PR 04 đặt khi upload thật; fixture chưa có nên để null
      audio_path: null,
      audio_expires_at: toDateOrNull(d.audio_expires_at),
      consent: d.consent ?? { confirmed: false, announced: false },
      participant_contact_ids: d.participant_contact_ids ?? [],
      peaks_thumb: d.peaks_thumb ?? null,
      speaker_colors_thumb: d.speaker_colors_thumb ?? null,
      headline_tag: d.headline_tag ?? null,
      open_task_count: d.open_task_count ?? 0,
      is_sample: Boolean(d.is_sample),
      created_at: sessionCreatedAt,
    });
    detailsRows.push({
      session_id: sid,
      executive_summary: d.executive_summary ?? "",
      speakers: d.speakers ?? [],
      topics: d.topics ?? [],
      notes: d.notes ?? [],
      bookmarks: d.bookmarks ?? [],
      photos: d.photos ?? [],
      peaks: d.peaks ?? [],
      speaker_spans: d.speaker_spans ?? [],
      send_history: d.send_history ?? [],
      listening_map: data.listening_map ?? null,
      flow_mermaid: data.flow_mermaid ?? null,
      gap_check: d.gap_check ?? null,
      gap_check_done: d.gap_check_done ?? [],
      pending_ai_questions: d.pending_ai_questions ?? [],
    });
    for (const seg of data.transcript ?? []) {
      segmentRows.push({
        session_id: sid,
        id: seg.id,
        speaker_id: seg.speaker_id,
        start_sec: seg.start_sec,
        end_sec: seg.end_sec,
        text: seg.text ?? "",
        text_clean: seg.text_clean ?? "",
        edited: Boolean(seg.edited),
        lang: seg.lang ?? "vi",
        translations: seg.translations ?? {},
        words: seg.words ?? null,
      });
    }
    // Chat: created_at + id cố định theo nội dung (cách nhau 1 giây theo thứ
    // tự fixture) — thời điểm `Date.now()` của bản cũ khiến chạy lại sinh
    // dòng mới; giờ chạy lại chỉ được bỏ qua đúng khóa.
    let chatSeq = 0;
    for (const c of data.chat ?? []) {
      chatRows.push({
        id: stableUuid(`chat:${sid}:${chatSeq}`),
        session_id: sid,
        role: "user",
        text: c.question ?? "",
        citations: [],
        created_at: new Date(sessionCreatedAt.getTime() + chatSeq * 1000),
      });
      chatSeq++;
      chatRows.push({
        id: stableUuid(`chat:${sid}:${chatSeq}`),
        session_id: sid,
        role: "ai",
        text: c.answer ?? "",
        citations: (c.citations ?? []).map((ts) => ({ timestamp_sec: ts })),
        created_at: new Date(sessionCreatedAt.getTime() + chatSeq * 1000),
      });
      chatSeq++;
    }
    for (const v of data.summary_versions ?? []) {
      summaryRows.push({
        session_id: sid,
        lang: v.lang,
        source: v.source ?? "original",
        translated_from: v.translated_from ?? null,
        created_at: toDateOrNull(v.created_at) ?? sessionCreatedAt,
        stale: Boolean(v.stale),
        executive_summary: v.executive_summary ?? "",
        topics: v.topics ?? [],
        task_texts: v.task_texts ?? {},
        sample: v.sample ?? null,
      });
    }
    for (const a of d.action_items ?? []) {
      actionRows.push({
        id: a.id,
        session_id: sid,
        task: a.task ?? "",
        assignee_contact_id: a.assignee_contact_id ?? null,
        assignee_user_id: a.assignee_user_id ? (userIdMap.get(a.assignee_user_id) ?? null) : null,
        due_date: a.due_date ?? null,
        priority: a.priority ?? "medium",
        done: Boolean(a.done),
        done_at: toDateOrNull(a.done_at),
        source_quote: a.source_quote ?? null,
        timestamp_sec: a.timestamp_sec ?? null,
      });
    }
    for (const r of d.consent?.receipts ?? []) {
      receiptRows.push({
        id: r.id,
        session_id: sid,
        who: r.who ?? [],
        at: toDateOrNull(r.at) ?? sessionCreatedAt,
        method: r.method ?? "button",
        announcement_text: r.announcement_text ?? null,
      });
    }
  }

  const seededSessionIds = new Set(sessionsRows.map((s) => s.id));
  const folderSessionsRows = [];
  for (const f of folders) {
    for (const sid of f.session_ids ?? []) {
      if (seededSessionIds.has(sid)) folderSessionsRows.push({ folder_id: f.id, session_id: sid });
    }
  }
  const foldersRows = folders.map((f) => ({
    id: f.id,
    workspace_id: f.workspace_id ?? null,
    owner_user_id: userUuid,
    kind: f.kind,
    name: f.name,
    ref: f.ref ?? null,
    note: f.note ?? null,
    template_id: f.template_id ?? null,
    created_at: toDateOrNull(f.created_at) ?? FIXED_EPOCH,
    updated_at: toDateOrNull(f.updated_at) ?? FIXED_EPOCH,
  }));

  // audit_log: id ổn định theo fixture id ("a01"…) — chạy lại bị bỏ qua.
  const auditRows = audit.map((a) => ({
    id: stableUuid(`audit:${a.id}`),
    workspace_id: a.workspace_id ?? null,
    actor_user_id: userIdMap.get(a.actor_user_id) ?? null,
    action: a.action,
    target_type: a.target_type,
    target_id: a.target_id,
    target_label: a.target_label ?? "",
    at: toDateOrNull(a.at) ?? FIXED_EPOCH,
    meta: {},
  }));

  return { userUuid, rows: { usersRows, workspacesRows, membersRows, contactsRows, glossaryRows, sessionsRows, detailsRows, segmentRows, chatRows, summaryRows, actionRows, receiptRows, foldersRows, folderSessionsRows, auditRows } };
}

/* ---------- Kế hoạch ghi: bảng → cột + khóa ON CONFLICT ---------- */

/**
 * kind điều khiển cách truyền tham số (cast tường minh để chạy đúng với
 * cả postgres.js lẫn PGlite):
 * text/uuid/int/float/bool/json/arr(text[])/ts(timestamptz)
 */
const KIND_COLS = {
  users: { conflict: "(email)", cols: { id: "uuid", email: "text", display_name: "text", honorific: "text", profession: "text", default_template_id: "text", plan: "text", ui_language: "text", theme: "text", consent_reminder: "bool", consent_announcement: "text", auto_filter_silence: "bool", default_speech_language: "text", auto_detect_languages: "bool", default_report_language: "text", auto_translate_on_send: "bool", current_workspace_id: "text", listening_prefs: "json", onboarded_at: "ts" } },
  workspaces: { conflict: "(id)", cols: { id: "text", kind: "text", name: "text", profession: "text", default_report_language: "text", plan: "text", seat_limit: "int", owner_user_id: "uuid" } },
  workspace_members: { conflict: "(workspace_id, lower(email))", cols: { workspace_id: "text", user_id: "uuid", email: "text", display_name: "text", role: "text", status: "text", invited_at: "ts", invite_expires_at: "ts" } },
  sessions: { conflict: "(id)", cols: { id: "text", user_id: "uuid", workspace_id: "text", visibility: "text", owner_user_id: "uuid", title: "text", template_id: "text", intake_template_id: "text", primary_language: "text", detected_languages: "arr", report_languages: "arr", original_report_language: "text", status: "text", processing_step: "int", failure_reason: "text", storage_status: "text", duration_sec: "int", size_bytes: "int", audio_path: "text", audio_expires_at: "ts", consent: "json", participant_contact_ids: "arr", peaks_thumb: "json", speaker_colors_thumb: "json", headline_tag: "json", open_task_count: "int", is_sample: "bool", created_at: "ts" } },
  session_details: { conflict: "(session_id)", cols: { session_id: "text", executive_summary: "text", speakers: "json", topics: "json", notes: "json", bookmarks: "json", photos: "json", peaks: "json", speaker_spans: "json", send_history: "json", listening_map: "json", flow_mermaid: "text", gap_check: "json", gap_check_done: "arr", pending_ai_questions: "arr" } },
  transcript_segments: { conflict: "(session_id, id)", cols: { session_id: "text", id: "text", speaker_id: "text", start_sec: "float", end_sec: "float", text: "text", text_clean: "text", edited: "bool", lang: "text", translations: "json", words: "json" } },
  chat_messages: { conflict: "(session_id, role, created_at, md5(text))", cols: { id: "uuid", session_id: "text", role: "text", text: "text", citations: "json", created_at: "ts" } },
  summary_versions: { conflict: "(session_id, lang)", cols: { session_id: "text", lang: "text", source: "text", translated_from: "text", created_at: "ts", stale: "bool", executive_summary: "text", topics: "json", task_texts: "json", sample: "bool" } },
  action_items: { conflict: "(session_id, id)", cols: { id: "text", session_id: "text", task: "text", assignee_contact_id: "text", assignee_user_id: "uuid", due_date: "text", priority: "text", done: "bool", done_at: "ts", source_quote: "text", timestamp_sec: "float" } },
  consent_receipts: { conflict: "(id)", cols: { id: "text", session_id: "text", who: "arr", at: "ts", method: "text", announcement_text: "text" } },
  folders: { conflict: "(id)", cols: { id: "text", workspace_id: "text", owner_user_id: "uuid", kind: "text", name: "text", ref: "text", note: "text", template_id: "text", created_at: "ts", updated_at: "ts" } },
  folder_sessions: { conflict: "(folder_id, session_id)", cols: { folder_id: "text", session_id: "text" } },
  contacts: { conflict: "(id)", cols: { id: "text", user_id: "uuid", name: "text", role: "text", email: "text", preferred_language: "text" } },
  glossary_terms: { conflict: "(id)", cols: { id: "text", user_id: "uuid", term: "text", note: "text", variants: "json" } },
  audit_log: { conflict: "(id)", cols: { id: "uuid", workspace_id: "text", actor_user_id: "uuid", action: "text", target_type: "text", target_id: "text", target_label: "text", at: "ts", meta: "json" } },
};

/** Danh sách ghi theo thứ tự phụ thuộc khóa ngoại. */
export function buildPlan({ existingUserId = null } = {}) {
  const { userUuid, rows } = buildRows({ existingUserId });
  const rowMap = {
    users: rows.usersRows,
    workspaces: rows.workspacesRows,
    workspace_members: rows.membersRows,
    sessions: rows.sessionsRows,
    session_details: rows.detailsRows,
    transcript_segments: rows.segmentRows,
    chat_messages: rows.chatRows,
    summary_versions: rows.summaryRows,
    action_items: rows.actionRows,
    consent_receipts: rows.receiptRows,
    folders: rows.foldersRows,
    folder_sessions: rows.folderSessionsRows,
    contacts: rows.contactsRows,
    glossary_terms: rows.glossaryRows,
    audit_log: rows.auditRows,
  };
  const plan = [];
  for (const [table, { conflict, cols }] of Object.entries(KIND_COLS)) {
    const rws = rowMap[table];
    if (!rws) throw new Error(`Thiếu ánh xạ dòng cho bảng ${table}`);
    plan.push({
      table,
      conflict,
      columns: Object.entries(cols).map(([name, kind]) => ({ name, kind })),
      rows: rws,
    });
  }
  return { plan, userUuid };
}

/* ---------- Ghi: INSERT … ON CONFLICT (khóa) DO NOTHING ---------- */

const PLACEHOLDER_CAST = {
  json: (p) => `${p}::jsonb`,
  arr: (p) => `${p}::text[]`,
  ts: (p) => `${p}::timestamptz`,
  uuid: (p) => `${p}::uuid`,
  int: (p) => `${p}::integer`,
  float: (p) => `${p}::double precision`,
  bool: (p) => `${p}::boolean`,
};

/**
 * Ghi kế hoạch vào DB qua `run(text, params) -> { rows }` (hỗ trợ postgres.js
 * lẫn PGlite). Trả về số dòng chèn mới theo từng bảng (dòng trùng khóa bị
 * bỏ qua nhờ ON CONFLICT DO NOTHING nhắm đúng ràng buộc).
 */
export async function seedInto(run, plan) {
  const inserted = {};
  for (const spec of plan) {
    const colNames = spec.columns.map((c) => `"${c.name}"`).join(",");
    let n = 0;
    let i = 0;
    while (i < spec.rows.length) {
      // Chia lô để không vượt giới hạn tham số của giao thức Postgres
      const batch = [];
      const params = [];
      let p = 1;
      let used = 0;
      while (i < spec.rows.length && used + spec.columns.length <= MAX_PARAMS_PER_STATEMENT) {
        const row = spec.rows[i];
        const ph = [];
        for (const c of spec.columns) {
          const v = row[c.name];
          const name = `$${p++}`;
          used++;
          if (v === undefined || v === null) {
            params.push(null);
            ph.push(name);
            continue;
          }
          if (c.kind === "json") {
            params.push(JSON.stringify(v));
            ph.push(PLACEHOLDER_CAST.json(name));
          } else if (c.kind === "arr") {
            params.push(pgArrayLiteral(v));
            ph.push(PLACEHOLDER_CAST.arr(name));
          } else if (c.kind === "ts") {
            params.push(v instanceof Date ? v.toISOString() : String(v));
            ph.push(PLACEHOLDER_CAST.ts(name));
          } else if (c.kind === "bool") {
            params.push(Boolean(v));
            ph.push(PLACEHOLDER_CAST.bool(name));
          } else if (c.kind === "int") {
            params.push(Number(v));
            ph.push(PLACEHOLDER_CAST.int(name));
          } else if (c.kind === "float") {
            params.push(Number(v));
            ph.push(PLACEHOLDER_CAST.float(name));
          } else if (c.kind === "uuid") {
            params.push(String(v));
            ph.push(PLACEHOLDER_CAST.uuid(name));
          } else {
            params.push(String(v));
            ph.push(name);
          }
        }
        batch.push(`(${ph.join(",")})`);
        i++;
      }
      const stmt =
        `insert into "noteim"."${spec.table}" (${colNames}) values ${batch.join(",")} ` +
        `on conflict ${spec.conflict} do nothing returning 1`;
      const res = await run(stmt, params);
      n += Array.isArray(res) ? res.length : res.rows.length;
    }
    inserted[spec.table] = n;
  }
  return inserted;
}

/* ---------- Báo cáo / CLI ---------- */

function printPlan(plan) {
  const total = plan.reduce((n, s) => n + s.rows.length, 0);
  console.log(`Ánh xạ fixture → bảng: tổng ${total} dòng`);
  for (const s of plan) {
    console.log(`  ${s.table.padEnd(20)} ${String(s.rows.length).padStart(4)}`);
  }
  console.log(
    "  (audio_path để null — key R2 do PR 04 đặt khi upload thật)",
  );
  return total;
}

function printCounts(plan, inserted) {
  const total = plan.reduce((n, s) => n + s.rows.length, 0);
  for (const s of plan) {
    const got = inserted[s.table] ?? 0;
    if (got !== s.rows.length) {
      console.log(`  ${s.table}: ghi ${got}/${s.rows.length} (bỏ qua ${s.rows.length - got})`);
    } else {
      console.log(`  ${s.table}: ghi ${got} (bỏ qua 0)`);
    }
  }
  const sum = plan.reduce((n, s) => n + (inserted[s.table] ?? 0), 0);
  console.log(`Đã ghi ${sum}/${total} dòng (trùng khóa bị bỏ qua: ${total - sum}).`);
  return sum;
}

if (isMain && dryRun) {
  const { plan } = buildPlan();
  printPlan(plan);
  console.log("Chế độ --dry: không nối DB, không ghi gì.");
  process.exit(0);
}

if (isMain) {
  // Có sẵn user cùng email trong DB thì dùng lại id đó (không phá khóa ngoại
  // của dữ liệu đã có); các bảng con chạy lại được bỏ qua đúng khóa.
  let existingUserId = null;
  const probe = postgres(url, { prepare: false, max: 1, connect_timeout: 15 });
  try {
    const u = readJson("user.json");
    const [row] = await probe`select id from "noteim"."users" where email = ${u.email.toLowerCase()} limit 1`;
    existingUserId = row?.id ?? null;
  } catch {
    existingUserId = null; // schema/migration chưa có: để bước ghi báo lỗi rõ ràng
  } finally {
    await probe.end({ timeout: 5 });
  }

  const { plan } = buildPlan({ existingUserId });
  printPlan(plan);

  const sql = postgres(url, { prepare: false, max: 3, connect_timeout: 15 });
  try {
    // Mỗi bảng ghi trong cùng một transaction; trùng khóa bỏ qua (ON CONFLICT
    // DO NOTHING nhắm đúng ràng buộc) nên chạy lại nhiều lần cho cùng kết quả.
    const inserted = await sql.begin(async (tx) => {
      const run = async (text, params) => {
        const res = await tx(text, params);
        return { rows: Array.isArray(res) ? res : (res.rows ?? []) };
      };
      return seedInto(run, plan);
    });
    printCounts(plan, inserted);
    console.log("Seed idempotent: chạy lại sẽ bỏ qua toàn bộ (xem pnpm db:test).");
  } catch (error) {
    exitWith(3, `Ghi seed thất bại: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
