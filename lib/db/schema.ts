/**
 * Schema Drizzle — nền đăng nhập (PR 01, đặc tả C1 §1.4).
 *
 * Chỉ 4 bảng nền của PR 01: `users`, `accounts`, `auth_sessions`,
 * `verification_tokens`. Schema toàn bộ §1.4 (workspaces, sessions…) là
 * việc của PR 02 — đừng thêm bảng khác vào file này trong PR 01.
 *
 * Quy ước đặt tên giữ nguyên đặc tả: cột snake_case, tên bảng trùng
 * §1.4; `accounts`/`auth_sessions`/`verification_tokens` giữ bộ trường
 * chuẩn next-auth (chỉ đổi `user_id` để nối `users.id`).
 *
 * Phiên đăng nhập dùng JWT trong cookie (`noteim.session`) nên
 * `auth_sessions` không nằm trên đường nóng — vẫn tạo đúng §1.4 để
 * cửa phụ Email OTP (PR riêng khi có nhu cầu) dùng ngay.
 */
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Bảng users — người dùng của app. Bộ trường theo §1.4 (dòng users):
 * gói, ngôn ngữ, giao diện, đếm hạn mức ẩn danh đều nằm đây.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: text("email").notNull(),
    displayName: text("display_name"),
    honorific: text("honorific"),
    profession: text("profession"),
    defaultTemplateId: text("default_template_id"),
    plan: text("plan").notNull().default("free"),
    uiLanguage: text("ui_language").notNull().default("vi"),
    theme: text("theme").notNull().default("system"),
    listeningPrefs: jsonb("listening_prefs"),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    anonymousUsedSessions: integer("anonymous_used_sessions")
      .notNull()
      .default(0),
    anonymousUsedSeconds: integer("anonymous_used_seconds")
      .notNull()
      .default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("users_email_key").on(table.email)],
);

/**
 * Bảng accounts — liên kết nhà cung cấp OAuth (chuẩn next-auth,
 * nối accounts.user_id → users.id).
 */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type"),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    expiresAt: integer("expires_at"),
    tokenType: text("token_type"),
    scope: text("scope"),
    idToken: text("id_token"),
    sessionState: text("session_state"),
  },
  (table) => [
    uniqueIndex("accounts_provider_account_key").on(
      table.provider,
      table.providerAccountId,
    ),
    index("accounts_user_id_idx").on(table.userId),
  ],
);

/**
 * Bảng auth_sessions — phiên kiểu cơ sở dữ liệu theo §1.4. Chặng này
 * dùng JWT nên bảng nằm chờ cho cửa Email OTP; không ghi khi đăng nhập
 * Google (không truy vấn mỗi request — đúng §1.1).
 */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sessionToken: text("session_token").notNull(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("auth_sessions_token_key").on(table.sessionToken)],
);

/** Bảng verification_tokens — mã xác thực một lần (chuẩn next-auth). */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type AccountRow = typeof accounts.$inferSelect;
