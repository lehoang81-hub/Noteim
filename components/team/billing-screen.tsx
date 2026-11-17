"use client";

import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SkeletonRow } from "@/components/ui/feedback";
import { NoAccess } from "./no-access";
import { useTeamWorkspace } from "./use-team";
import { DataError, data, useData } from "@/lib/data";
import { useToast } from "@/components/ui/toast";

/*
 * Trang /team/billing (M7-03, docs/08 phần B): Gói Nhóm, số chỗ, hóa đơn mẫu,
 * đổi số chỗ (giả lập). Quyền: Chủ xem và đổi số chỗ; Quản trị xem; Thành viên
 * không (bảng quyền M7-01, chặn ở repository).
 */

const TEAM_MINUTES_PER_PERSON = 180; // hạn mức mỗi người của gói Free, minh họa hạn mức dùng chung

export function BillingScreen() {
  const t = useTranslations("team");
  const toast = useToast();
  const { workspace, isTeam, isAdmin, role, loading: wsLoading } = useTeamWorkspace();
  const [busy, setBusy] = useState(false);

  const invoices = useData(
    () => (workspace && workspace.kind === "team" && isAdmin ? data.workspaces.invoices(workspace.id) : Promise.resolve([])),
    [workspace?.id],
  );
  const members = useData(
    () => (workspace && workspace.kind === "team" ? data.workspaces.members(workspace.id) : Promise.resolve([])),
    [workspace?.id],
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

  if (!isAdmin || invoices.error?.code === "forbidden") return <NoAccess />;

  const seatLimit = workspace.seat_limit ?? 0;
  const activeCount = (members.data ?? []).filter((m) => m.status === "active").length;
  const sharedLimit = TEAM_MINUTES_PER_PERSON * Math.max(1, activeCount);
  const isOwner = role === "owner";
  const list = invoices.data ?? [];

  async function changeSeats(delta: -1 | 1) {
    if (!workspace || busy) return;
    setBusy(true);
    try {
      await data.workspaces.setSeats(workspace.id, seatLimit + delta);
      toast.show({ tone: "success", message: t("billingSeatsDone", { count: seatLimit + delta }) });
    } catch (e) {
      // Lỗi số chỗ thấp hơn số thành viên hiện ở repository: báo nguyên câu lỗi
      toast.show({
        tone: "error",
        message: e instanceof DataError && e.message ? e.message : t("billingSeatsError"),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="px-page pt-2 lg:px-8 lg:pt-6">
        <h1 className="font-display text-h1 font-semibold text-ink">{t("menuBilling")}</h1>
        <p className="mt-1 text-small text-ink-2">{t("menuBillingNote")}</p>
      </div>

      <div className="flex flex-col gap-4 px-page pb-40 pt-4 lg:px-8 lg:pt-5">
        {/* Gói hiện tại */}
        <section aria-label={t("billingPlan")} className="rounded-block border border-sen bg-sen/5 p-4">
          <h2 className="text-h2 font-semibold text-sen-text">{t("billingTeamName")}</h2>
          <p className="mt-1 text-h2 font-semibold tabular-nums text-ink">{t("billingPricePerSeat")}</p>
          <dl className="mt-3 flex flex-col gap-1.5 text-small">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-2">{t("billingSeats")}</dt>
              <dd className="font-semibold tabular-nums text-ink">{seatLimit}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-2">{t("billingQuotaShared", { limit: sharedLimit })}</dt>
              <dd className="sr-only">{sharedLimit}</dd>
            </div>
          </dl>
          <p className="mt-2 text-caption text-ink-3">{t("billingQuotaHint")}</p>
          {isOwner ? (
            <div className="mt-4">
              <p className="mb-2 text-small font-medium text-ink">{t("billingSeatsEdit")}</p>
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  icon={Minus}
                  iconOnly
                  aria-label={`${t("billingSeatsEdit")} -1`}
                  disabled={busy || seatLimit <= Math.max(1, activeCount)}
                  onClick={() => void changeSeats(-1)}
                />
                <span className="min-w-10 text-center text-h2 font-semibold tabular-nums text-ink" aria-live="polite">
                  {seatLimit}
                </span>
                <Button
                  variant="secondary"
                  icon={Plus}
                  iconOnly
                  aria-label={`${t("billingSeatsEdit")} +1`}
                  disabled={busy}
                  onClick={() => void changeSeats(1)}
                />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-caption text-ink-3">{t("billingOwnerOnly")}</p>
          )}
        </section>

        {/* Hóa đơn mẫu */}
        <section aria-label={t("billingInvoices")} className="rounded-block border border-line bg-surface">
          <h2 className="px-4 pt-4 text-body font-semibold text-ink">{t("billingInvoices")}</h2>
          <div className="mt-2 overflow-x-auto px-2 pb-3">
            <table className="w-full text-left text-small">
              <thead>
                <tr className="border-b border-line text-caption text-ink-3">
                  <th scope="col" className="px-2 py-2 font-medium">{t("invoicePeriod")}</th>
                  <th scope="col" className="px-2 py-2 font-medium text-right">{t("invoiceSeats")}</th>
                  <th scope="col" className="px-2 py-2 font-medium text-right">{t("invoiceAmount")}</th>
                  <th scope="col" className="px-2 py-2 font-medium text-right">{t("invoiceStatus")}</th>
                </tr>
              </thead>
              <tbody aria-busy={invoices.loading}>
                {invoices.initialLoading ? (
                  <tr><td colSpan={4} className="px-2 py-3"><SkeletonRow /></td></tr>
                ) : list.length === 0 ? (
                  <tr><td colSpan={4} className="px-2 py-6 text-center text-ink-2">{t("usageEmpty")}</td></tr>
                ) : (
                  list.map((inv) => (
                    <tr key={inv.id} className="border-b border-line last:border-0">
                      <td className="px-2 py-2.5 font-medium text-ink">{inv.period}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-ink">{inv.seats}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-ink">{inv.amount_label}</td>
                      <td className="px-2 py-2.5 text-right">
                        <span
                          className={
                            inv.status === "paid"
                              ? "rounded-pill bg-tag-decided-bg px-2 py-0.5 text-caption font-medium text-tag-decided"
                              : "rounded-pill bg-tag-risk-bg px-2 py-0.5 text-caption font-medium text-tag-risk"
                          }
                        >
                          {inv.status === "paid" ? t("invoicePaid") : t("invoiceDue")}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
