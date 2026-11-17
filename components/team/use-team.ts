"use client";

import { data, useData, type Workspace, type WorkspaceRole } from "@/lib/data";
import { useDebugFlags } from "@/lib/debug/flags";

/*
 * Không gian đang dùng và vai trò của tôi (M7-03). Dùng chung cho các trang
 * /team/*, mục Nhóm trong Cài đặt và màn không có quyền. Vai trò ép bằng cờ
 * "Vai trò trong nhóm" của bảng thử nghiệm khi có (?debug=1, M7-01).
 */
export function useTeamWorkspace(): {
  workspace: Workspace | null;
  loading: boolean;
  isTeam: boolean;
  role: WorkspaceRole | null;
  isAdmin: boolean;
} {
  const flags = useDebugFlags();
  const list = useData(() => data.workspaces.list(), []);
  const me = useData(() => data.account.me(), []);
  const current = (list.data ?? []).find((w) => w.id === me.data?.current_workspace_id) ?? null;
  const isTeam = current?.kind === "team";
  const members = useData(
    () => (current && current.kind === "team" ? data.workspaces.members(current.id) : Promise.resolve([])),
    [current?.id],
  );
  const myMember = members.data?.find((m) => m.user_id === me.data?.id);
  // Không gian Cá nhân luôn là Chủ; không gian Nhóm theo dữ liệu thành viên
  const role: WorkspaceRole | null = flags.debugRole ?? (isTeam ? (myMember?.role ?? null) : "owner");
  return {
    workspace: current,
    loading: list.initialLoading || me.initialLoading || (isTeam && members.initialLoading),
    isTeam,
    role,
    isAdmin: role === "owner" || role === "admin",
  };
}
