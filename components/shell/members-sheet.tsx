"use client";

import { Copy, UserMinus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { SkeletonRow } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { DataError, data, useData, type Member, type WorkspaceRole } from "@/lib/data";
import { useDebugFlags } from "@/lib/debug/flags";
import { inviteToken } from "@/lib/team/invite-token";
import { shortDate } from "@/lib/format";

/*
 * Thành viên và lời mời của không gian nhóm (M7-01, giao diện tối thiểu —
 * màn quản trị đầy đủ /team/members ở issue sau). Mọi vai trò xem được;
 * Chủ và Quản trị mời, thu hồi lời mời, đổi vai trò, gỡ thành viên. Nhóm
 * hết chỗ (dữ liệu hoặc cờ "Nhóm hết chỗ") thì nút Mời bị khóa kèm lý do.
 * Link mời hiện tại hàng lời mời để mở trong trình duyệt khác.
 */

const ROLE_KEY: Record<WorkspaceRole, "roleOwner" | "roleAdmin" | "roleMember"> = {
  owner: "roleOwner",
  admin: "roleAdmin",
  member: "roleMember",
};

const CHANGEABLE: Array<Exclude<WorkspaceRole, "owner">> = ["admin", "member"];

function AvatarLetter({ name }: { name: string }) {
  return (
    <span
      aria-hidden={true}
      className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-surface-2 text-small font-semibold text-ink"
    >
      {name.trim().charAt(0).toUpperCase() || "•"}
    </span>
  );
}

export function MembersSheet({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("workspace");
  const ts = useTranslations("session");
  const locale = useLocale();
  const toast = useToast();
  const flags = useDebugFlags();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<WorkspaceRole, "owner">>("member");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [seatsLocked, setSeatsLocked] = useState(false);
  // Thành viên sẽ bị gỡ (hộp xác nhận)
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

  const list = useData(() => (open ? data.workspaces.members(workspaceId) : Promise.resolve([])), [workspaceId, open]);
  const me = useData(() => data.account.me(), []);

  const members = list.data ?? [];
  const myMember = members.find((m) => m.user_id === me.data?.id);
  const myRole: WorkspaceRole | null = flags.debugRole ?? myMember?.role ?? null;
  const canManage = myRole === "owner" || myRole === "admin";

  async function invite() {
    const clean = email.trim();
    if (!clean || inviteBusy) return;
    setInviteBusy(true);
    try {
      const m = await data.workspaces.invite(workspaceId, clean, role);
      toast.show({ tone: "success", message: t("membersInvited", { email: m.email }) });
      setEmail("");
      list.reload();
    } catch (e) {
      if (e instanceof DataError && e.code === "quota_exceeded") setSeatsLocked(true);
      toast.show({ tone: "error", message: t("membersInviteError") });
    } finally {
      setInviteBusy(false);
    }
  }

  async function revoke(m: Member) {
    try {
      await data.workspaces.revokeInvite(workspaceId, m.email);
      toast.show({ tone: "success", message: t("membersRevoked") });
      list.reload();
    } catch {
      toast.show({ tone: "error", message: ts("saveError") });
    }
  }

  async function changeRole(m: Member, next: WorkspaceRole) {
    if (next === m.role || next === "owner") return;
    try {
      await data.workspaces.changeRole(workspaceId, m.user_id!, next);
      toast.show({ tone: "success", message: t("membersChangeRoleDone", { name: m.display_name }) });
      list.reload();
    } catch {
      toast.show({ tone: "error", message: ts("saveError") });
    }
  }

  async function confirmRemove() {
    const m = removeTarget;
    setRemoveTarget(null);
    if (!m) return;
    try {
      await data.workspaces.removeMember(workspaceId, m.user_id!);
      toast.show({ tone: "success", message: t("membersRemoved", { name: m.display_name }) });
      list.reload();
    } catch {
      toast.show({ tone: "error", message: ts("saveError") });
    }
  }

  function copyLink(m: Member) {
    const url = `${window.location.origin}/join/${inviteToken(m.email)}`;
    void navigator.clipboard
      .writeText(url)
      .then(() => toast.show({ tone: "success", message: t("membersLinkCopied") }))
      .catch(() => toast.show({ tone: "error", message: t("membersLinkCopyError") }));
  }

  const seatsFull = flags.seatsFull || seatsLocked;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} title={t("membersTitle")} description={t("membersHint")} size="half">
        <div className="pb-4">
          {canManage ? (
            <form
              className="mb-4 flex flex-col gap-3 rounded-block border border-line bg-surface-2/50 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void invite();
              }}
            >
              <TextField
                label={t("membersEmail")}
                type="email"
                placeholder="ten@congty.example.vn"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <label className="block">
                <span className="mb-1.5 block text-small font-medium text-ink">{t("membersRole")}</span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Exclude<WorkspaceRole, "owner">)}
                  className="h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
                >
                  {CHANGEABLE.map((r) => (
                    <option key={r} value={r}>
                      {t(ROLE_KEY[r])}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" variant="primary" className="h-12" disabled={seatsFull || inviteBusy || !email.trim()}>
                {t("membersInviteAction")}
              </Button>
              {seatsFull ? <p className="text-small font-medium text-tag-risk">{t("membersSeatsFull")}</p> : null}
            </form>
          ) : null}

          <ul className="divide-y divide-line" aria-busy={list.loading}>
            {list.initialLoading
              ? Array.from({ length: 4 }, (_, i) => <li key={i} className="py-1"><SkeletonRow /></li>)
              : members.map((m) => {
                  const invited = m.status === "invited";
                  const isOwnerRow = m.role === "owner";
                  const isMe = m.user_id === me.data?.id;
                  return (
                    <li key={`${m.email}-${m.user_id ?? "pending"}`} className="flex items-start gap-3 py-3">
                      <AvatarLetter name={m.display_name} />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 text-body-strong font-semibold text-ink">
                          <span className="truncate">{m.display_name}</span>
                          {isMe ? <span className="text-caption font-medium text-ink-3">{t("membersYou")}</span> : null}
                          <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-caption font-medium text-ink-2">
                            {t(ROLE_KEY[m.role])}
                          </span>
                        </p>
                        <p className="truncate text-small text-ink-2">{m.email}</p>
                        {invited ? (
                          <p className="mt-0.5 text-caption text-ink-3">
                            {t("membersPending")} · {t("membersInviteExpires", { date: m.invite_expires_at ? shortDate(new Date(m.invite_expires_at), locale) : "" })}
                          </p>
                        ) : null}
                        {invited && canManage ? (
                          <div className="mt-1.5 flex items-center gap-2">
                            <code className="max-w-[220px] truncate rounded-control bg-surface-2 px-2 py-1 text-caption text-ink-2">
                              /join/{inviteToken(m.email)}
                            </code>
                            <Button
                              variant="ghost"
                              icon={Copy}
                              iconOnly
                              aria-label={t("membersLink")}
                              onClick={() => copyLink(m)}
                            />
                          </div>
                        ) : null}
                      </div>
                      {canManage ? (
                        <div className="flex shrink-0 items-center gap-1">
                          {!invited && !isOwnerRow ? (
                            <select
                              aria-label={t("membersRole")}
                              value={m.role}
                              onChange={(e) => void changeRole(m, e.target.value as WorkspaceRole)}
                              className="h-9 rounded-control border border-line bg-surface px-2 text-caption text-ink"
                            >
                              {CHANGEABLE.map((r) => (
                                <option key={r} value={r}>
                                  {t(ROLE_KEY[r])}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          {invited ? (
                            <Button variant="ghost" onClick={() => void revoke(m)}>
                              {t("membersRevoke")}
                            </Button>
                          ) : null}
                          {!isOwnerRow && !isMe ? (
                            <Button
                              variant="ghost"
                              icon={UserMinus}
                              iconOnly
                              aria-label={t("membersRemove")}
                              onClick={() => setRemoveTarget(m)}
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
          </ul>
        </div>
      </Sheet>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title={t("membersRemoveTitle", { name: removeTarget?.display_name ?? "" })}
        cancelLabel={ts("cancel")}
        confirmLabel={t("membersRemove")}
        confirmVariant="danger"
        onConfirm={() => void confirmRemove()}
      >
        {t("membersRemoveBody", { name: removeTarget?.display_name ?? "" })}
      </ConfirmDialog>
    </>
  );
}
