"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { data, useData, type Workspace, type WorkspaceRole } from "@/lib/data";

/*
 * Chọn không gian làm việc (M7-01, docs/08 phần B):
 * - Máy tính: đầu thanh bên, dưới logo.
 * - Điện thoại: đầu thư viện, trên lời chào.
 * Đổi xong thư viện, việc, tổng quan tự tải lại theo không gian mới (lớp dữ
 * liệu phát sự kiện khi đổi). Nhãn "Cá nhân" là nhãn hệ thống, hiển thị theo
 * ngôn ngữ giao diện, không lấy từ dữ liệu.
 */

export function workspaceLabel(w: Workspace, personal: string): string {
  return w.kind === "personal" ? personal : w.name;
}

export function WorkspaceAvatar({ name, kind, className }: { name: string; kind: Workspace["kind"]; className?: string }) {
  const t = useTranslations("workspace");
  const label = kind === "personal" ? t("personal") : name;
  return (
    <span
      aria-hidden={true}
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-pill bg-surface-2 text-small font-semibold text-ink",
        className,
      )}
    >
      {label.trim().charAt(0).toUpperCase() || "•"}
    </span>
  );
}

const ROLE_KEY: Record<WorkspaceRole, "roleOwner" | "roleAdmin" | "roleMember"> = {
  owner: "roleOwner",
  admin: "roleAdmin",
  member: "roleMember",
};

export function WorkspaceSwitcher({ className }: { className?: string }) {
  const t = useTranslations("workspace");
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const list = useData(() => data.workspaces.list(), []);
  const me = useData(() => data.account.me(), []);

  const current =
    (list.data ?? []).find((w) => w.id === me.data?.current_workspace_id) ?? (list.data ?? [])[0];

  // Vai trò của tôi trong không gian nhóm đang dùng (chỉ để nhãn; kiểm quyền
  // nằm ở repository). Lỗi (không phải thành viên) thì không hiện nhãn.
  const members = useData(
    () => (current && current.kind === "team" ? data.workspaces.members(current.id) : Promise.resolve([])),
    [current?.id],
  );
  const myRole = (members.data ?? []).find((m) => m.user_id === me.data?.id)?.role;

  async function pick(w: Workspace) {
    setOpen(false);
    if (w.id === me.data?.current_workspace_id) return;
    try {
      await data.workspaces.switchTo(w.id);
      toast.show({ tone: "success", message: t("switchDone", { name: workspaceLabel(w, t("personal")) }) });
    } catch {
      toast.show({ tone: "error", message: t("switchError") });
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={t("switchTitle")}
        className="flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left transition-colors ease-noteim duration-(--t-quick) hover:bg-surface-2"
      >
        {current ? (
          <>
            <WorkspaceAvatar name={current.name} kind={current.kind} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-small font-semibold text-ink">
                {workspaceLabel(current, t("personal"))}
              </span>
              <span className="block truncate text-caption text-ink-3">
                {current.kind === "team" && myRole ? t(ROLE_KEY[myRole]) : t("personalNote")}
              </span>
            </span>
          </>
        ) : (
          <span className="flex-1" />
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen} title={t("switchTitle")} size="auto">
        <ul className="py-1">
          {(list.data ?? []).map((w) => {
            const active = w.id === me.data?.current_workspace_id;
            return (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => void pick(w)}
                  aria-current={active ? "true" : undefined}
                  className="flex min-h-12 w-full items-center gap-3 rounded-control px-2 py-1 text-left transition-colors ease-noteim duration-(--t-quick) hover:bg-surface-2"
                >
                  <WorkspaceAvatar name={w.name} kind={w.kind} className="size-10" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-ink">{workspaceLabel(w, t("personal"))}</span>
                    <span className="block truncate text-caption text-ink-3">
                      {w.kind === "personal" ? t("personalNote") : t("teamNote")}
                    </span>
                  </span>
                  {active ? (
                    <Check aria-hidden={true} className="size-5 shrink-0 text-ink" strokeWidth={2} />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </div>
  );
}
