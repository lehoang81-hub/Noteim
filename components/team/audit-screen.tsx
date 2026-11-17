"use client";

import { Download } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SkeletonRow } from "@/components/ui/feedback";
import { NoAccess } from "./no-access";
import { useTeamWorkspace } from "./use-team";
import { data, useData, type AuditEvent } from "@/lib/data";
import { downloadCsv } from "@/lib/team/csv";

/*
 * Trang /team/audit (M7-03, docs/08 phần B): nhật ký truy cập của nhóm, lọc
 * theo người và theo loại. Quyền chặn ở repository (Thành viên ném forbidden,
 * docs/08 bảng quyền); Thành viên mở bằng đường dẫn thấy màn không có quyền.
 * Nhật ký ghi thật ở mọi thao tác trong đặc tả: xem, chia sẻ, xuất, xóa, mời,
 * gỡ, đổi vai trò, dọn bản gốc, gửi email.
 */

const ACTIONS: AuditEvent["action"][] = [
  "view",
  "share",
  "unshare",
  "export",
  "delete",
  "invite",
  "remove_member",
  "role_change",
  "purge",
  "send_email",
];

const ACTION_KEY: Record<AuditEvent["action"], string> = {
  view: "actView",
  share: "actShare",
  unshare: "actUnshare",
  export: "actExport",
  delete: "actDelete",
  invite: "actInvite",
  remove_member: "actRemoveMember",
  role_change: "actRoleChange",
  purge: "actPurge",
  send_email: "actSendEmail",
};

/** Ngày giờ đầy đủ cho nhật ký: 14/11/2026 19:00 (vi) / Nov 14, 2026 7:00 PM (en). */
function auditTime(iso: string, locale: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat(locale === "en" ? "en-US" : locale === "ko" ? "ko-KR" : "vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat(locale === "en" ? "en-US" : locale === "ko" ? "ko-KR" : "vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${date} ${time}`;
}

export function AuditScreen() {
  const t = useTranslations("team");
  const locale = useLocale();
  const { workspace, isTeam, isAdmin, loading: wsLoading } = useTeamWorkspace();
  const [person, setPerson] = useState("");
  const [action, setAction] = useState("");

  const members = useData(
    () => (workspace && workspace.kind === "team" ? data.workspaces.members(workspace.id) : Promise.resolve([])),
    [workspace?.id],
  );
  // Fetch theo không gian; quyền chặn ở repository (Thành viên ném forbidden)
  // và ở giao diện (NoAccess). Không dựa isAdmin vào fetcher: biến này sẵn
  // sàng sau members, không kích hoạt tải lại của useData.
  const events = useData(
    () =>
      workspace && workspace.kind === "team"
        ? data.workspaces.audit(workspace.id, {
            actor_user_id: person || undefined,
            action: (action || undefined) as AuditEvent["action"] | undefined,
          })
        : Promise.resolve([]),
    [workspace?.id, person, action],
  );

  if (wsLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-page pt-6 lg:px-8" aria-busy={true}>
        <SkeletonRow />
        <div className="mt-3">
          <SkeletonRow />
        </div>
      </div>
    );
  }

  if (!isTeam || !workspace) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-page pb-24 text-center">
        <h1 className="text-h2 font-semibold text-ink">{t("empty")}</h1>
        <p className="mt-2 max-w-[40ch] text-small text-ink-2">{t("emptyNote")}</p>
      </div>
    );
  }

  // Không đúng vai trò: thông báo ở giao diện, quyền chặn ở repository
  if (!isAdmin || events.error?.code === "forbidden") return <NoAccess />;

  const memberName = new Map((members.data ?? []).map((m) => [m.user_id, m.display_name]));
  const list = events.data ?? [];

  function download() {
    if (!workspace) return;
    // CSV nhật ký theo bộ lọc đang chọn: Thời gian, Người thực hiện, Hành động, Đối tượng
    downloadCsv("nhat-ky-truy-cap.csv", [t("csvColTime"), t("csvColActor"), t("csvColAction"), t("csvColTarget")], list.map((e) => [
      auditTime(e.at, locale),
      memberName.get(e.actor_user_id) ?? t("actorGone"),
      t(ACTION_KEY[e.action]),
      e.target_label,
    ]));
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="px-page pt-2 lg:px-8 lg:pt-6">
        <h1 className="font-display text-h1 font-semibold text-ink">{t("menuAudit")}</h1>
        <p className="mt-1 text-small text-ink-2">{t("menuAuditNote")}</p>
      </div>

      <div className="px-page pb-40 pt-4 lg:px-8 lg:pt-5">
        {/* Bộ lọc theo người và theo loại */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-small font-medium text-ink">{t("filterPerson")}</span>
            <select
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              className="h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
            >
              <option value="">{t("filterAllPeople")}</option>
              {(members.data ?? [])
                .filter((m) => m.status === "active")
                .map((m) => (
                  <option key={m.user_id ?? m.email} value={m.user_id ?? ""}>
                    {m.display_name}
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-small font-medium text-ink">{t("filterAction")}</span>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
            >
              <option value="">{t("filterAllActions")}</option>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {t(ACTION_KEY[a])}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="secondary" icon={Download} onClick={download}>
            {t("csvAudit")}
          </Button>
        </div>

        {/* Danh sách nhật ký, mới nhất trên cùng */}
        <ul className="mt-4 max-h-[32rem] divide-y divide-line overflow-y-auto rounded-block border border-line bg-surface" aria-busy={events.loading}>
          {events.initialLoading
            ? Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="p-3">
                  <SkeletonRow />
                </li>
              ))
            : list.length === 0
              ? (
                <li className="p-6 text-center text-small text-ink-2">{t("auditEmpty")}</li>
              )
              : list.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-small text-ink">
                        <span className="font-semibold">{memberName.get(e.actor_user_id) ?? t("actorGone")}</span>
                        {" "}
                        <span className="text-ink-2">{t(ACTION_KEY[e.action])}</span>
                      </p>
                      <p className="mt-0.5 truncate text-caption text-ink-3">{e.target_label}</p>
                    </div>
                    <time dateTime={e.at} className="shrink-0 text-caption text-ink-3">
                      {auditTime(e.at, locale)}
                    </time>
                  </li>
                ))}
        </ul>
      </div>
    </div>
  );
}
