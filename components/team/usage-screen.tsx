"use client";

import { Download } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SkeletonRow } from "@/components/ui/feedback";
import { NoAccess } from "./no-access";
import { useTeamWorkspace } from "./use-team";
import { data, dataNow, useData } from "@/lib/data";
import { downloadCsv } from "@/lib/team/csv";

/*
 * Trang /team/usage (M7-03, docs/08 phần B): mức dùng theo người và theo
 * tháng, tải CSV (UTF-8 có BOM). Mức dùng tính cả buổi riêng tư của từng
 * người, chỉ ra số, không lộ nội dung (bảng quyền M7-01). Quyền chặn ở
 * repository: Thành viên ném forbidden.
 */

const ROLE_KEY: Record<string, "roleOwner" | "roleAdmin" | "roleMember"> = {
  owner: "roleOwner",
  admin: "roleAdmin",
  member: "roleMember",
};

/** "2026-11" của "bây giờ" của dữ liệu mẫu, không dùng đồng hồ thật. */
function currentMonth(): string {
  const now = dataNow();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const fmt = locale === "en" ? "en-US" : locale === "ko" ? "ko-KR" : "vi-VN";
  return new Intl.DateTimeFormat(fmt, { year: "numeric", month: "long" }).format(d);
}

export function UsageScreen() {
  const t = useTranslations("team");
  const tw = useTranslations("workspace");
  const locale = useLocale();
  const { workspace, isTeam, isAdmin, loading: wsLoading } = useTeamWorkspace();
  const [month, setMonth] = useState(currentMonth());

  const members = useData(
    () => (workspace && workspace.kind === "team" ? data.workspaces.members(workspace.id) : Promise.resolve([])),
    [workspace?.id],
  );
  const invoices = useData(
    () => (workspace && workspace.kind === "team" && isAdmin ? data.workspaces.invoices(workspace.id) : Promise.resolve([])),
    [workspace?.id],
  );
  const rows = useData(
    () => (workspace && workspace.kind === "team" && isAdmin ? data.workspaces.usage(workspace.id, month) : Promise.resolve([])),
    [workspace?.id, month],
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

  if (!isAdmin || rows.error?.code === "forbidden") return <NoAccess />;

  const memberById = new Map((members.data ?? []).filter((m) => m.user_id).map((m) => [m.user_id!, m]));
  const usage = rows.data ?? [];

  // Các tháng có dữ liệu: tháng hiện tại của dữ liệu mẫu và các tháng có hóa đơn
  const months = Array.from(
    new Set([currentMonth(), ...(invoices.data ?? []).map((i) => i.period)]),
  ).sort((a, b) => b.localeCompare(a));

  function download() {
    if (!workspace) return;
    downloadCsv(`muc-dung-${month}.csv`, [t("usageColMember"), t("usageColRole"), t("usageColSessions"), t("usageColMinutes"), t("usageColOpenTasks")], usage.map((r) => {
      const m = memberById.get(r.user_id);
      return [m?.display_name ?? r.user_id, m ? tw(ROLE_KEY[m.role]) : "", r.sessions, r.minutes, r.open_tasks];
    }));
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="px-page pt-2 lg:px-8 lg:pt-6">
        <h1 className="font-display text-h1 font-semibold text-ink">{t("menuUsage")}</h1>
        <p className="mt-1 text-small text-ink-2">{t("menuUsageNote")}</p>
      </div>

      <div className="px-page pb-40 pt-4 lg:px-8 lg:pt-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="block">
            <span className="mb-1.5 block text-small font-medium text-ink">{t("usageMonth")}</span>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-11 w-full min-w-40 rounded-control border border-line bg-surface px-3 text-body text-ink"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m, locale)}
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary" icon={Download} onClick={download}>
            {t("csvUsage")}
          </Button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-block border border-line bg-surface">
          <table className="w-full text-left text-small">
            <thead>
              <tr className="border-b border-line text-caption text-ink-3">
                <th scope="col" className="px-4 py-2 font-medium">{t("usageColMember")}</th>
                <th scope="col" className="px-4 py-2 font-medium">{t("usageColRole")}</th>
                <th scope="col" className="px-4 py-2 font-medium text-right">{t("usageColSessions")}</th>
                <th scope="col" className="px-4 py-2 font-medium text-right">{t("usageColMinutes")}</th>
                <th scope="col" className="px-4 py-2 font-medium text-right">{t("usageColOpenTasks")}</th>
              </tr>
            </thead>
            <tbody aria-busy={rows.loading}>
              {rows.initialLoading ? (
                <tr><td colSpan={5} className="px-4 py-3"><SkeletonRow /></td></tr>
              ) : usage.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-2">{t("usageEmpty")}</td></tr>
              ) : (
                usage.map((r) => {
                  const m = memberById.get(r.user_id);
                  return (
                    <tr key={r.user_id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 font-medium text-ink">{m?.display_name ?? r.user_id}</td>
                      <td className="px-4 py-2.5 text-ink-2">{m ? tw(ROLE_KEY[m.role]) : ""}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink">{r.sessions}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink">{r.minutes}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink">{r.open_tasks}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
