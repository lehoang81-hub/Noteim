/**
 * Nhóm (a) — không gian làm việc phía máy chủ (C1-03b).
 *
 * Phạm vi của PR này: mỗi người dùng có đúng một không gian Cá nhân tự tạo
 * khi lần đầu gọi API dữ liệu (ensureUserWorkspace). Không gian Nhóm, mời,
 * vai trò là việc của PR C1-08 — các thao tác nhóm ở client trả lỗi rõ ràng
 * thay vì trả dữ liệu giả.
 */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { users, workspaceMembers, workspaces } from "@/lib/db/schema";
import { DataError } from "../errors";
import type { Member, Workspace } from "../types";

import { ApiError, type ServerContext } from "./context";

type WorkspaceRow = typeof workspaces.$inferSelect;
type MemberRow = typeof workspaceMembers.$inferSelect;

export function toWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    kind: row.kind === "team" ? "team" : "personal",
    name: row.name,
    profession: (row.profession as Workspace["profession"]) ?? null,
    default_report_language: (row.defaultReportLanguage as Workspace["default_report_language"]) ?? "vi",
    plan: row.plan === "team" ? "team" : row.plan === "pro" ? "pro" : "free",
    seat_limit: row.seatLimit ?? null,
    owner_user_id: row.ownerUserId,
  };
}

function toMember(row: MemberRow): Member {
  return {
    workspace_id: row.workspaceId,
    user_id: row.userId ?? null,
    email: row.email,
    display_name: row.displayName || row.email.split("@")[0],
    role: row.role === "owner" ? "owner" : row.role === "admin" ? "admin" : "member",
    status: row.status === "active" ? "active" : "invited",
    invited_at: row.invitedAt.toISOString(),
    invite_expires_at: row.inviteExpiresAt ? row.inviteExpiresAt.toISOString() : null,
  };
}

export async function listWorkspaces(ctx: ServerContext): Promise<Workspace[]> {
  const db = getDb();
  const rows = await db.select().from(workspaces).where(eq(workspaces.ownerUserId, ctx.userId));
  return rows.filter((r) => r.kind === "personal").map(toWorkspace);
}

export async function listMembers(ctx: ServerContext, workspaceId: string): Promise<Member[]> {
  const db = getDb();
  // Chỉ thành viên của không gian mới được xem danh sách thành viên
  const mine = (
    await db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, ctx.userId)))
      .limit(1)
  )[0];
  if (!mine) throw new DataError("forbidden");
  const rows = await db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
  return rows.map(toMember);
}

/** Đổi không gian đang dùng: chỉ cho phép không gian mình là thành viên. */
export async function switchWorkspace(ctx: ServerContext, workspaceId: string): Promise<void> {
  const db = getDb();
  const member = (
    await db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, ctx.userId)))
      .limit(1)
  )[0];
  if (!member) throw new DataError("forbidden");
  await db.update(users).set({ currentWorkspaceId: workspaceId, updatedAt: new Date() }).where(eq(users.id, ctx.userId));
}

/** Các thao tác nhóm chưa thuộc phạm vi C1-03b — lỗi rõ ràng, không giả dữ liệu. */
export function teamNotAvailableYet(): never {
  throw new ApiError(501, "not_available_yet", "Tính năng nhóm là việc của PR sau (C1-08)");
}
