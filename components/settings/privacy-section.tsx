"use client";

import { Download, Link2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { data, resetData, useData } from "@/lib/data";

/*
 * Quyền riêng tư (M4-03): tải toàn bộ dữ liệu (JSON thật), danh sách link đang
 * chia sẻ (thu hồi được), xóa tài khoản (phải gõ "XÓA"; xong thì đặt lại dữ
 * liệu mẫu và về /welcome).
 */

const DELETE_WORD = "XÓA";

export function PrivacySection() {
  const t = useTranslations("settings");
  const toast = useToast();
  const router = useRouter();
  const links = useData(() => data.share.listAll(), []);
  const sessions = useData(() => data.sessions.list(), []);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState("");
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const titleById = Object.fromEntries((sessions.data ?? []).map((s) => [s.id, s.title]));

  async function exportJson() {
    setBusy(true);
    try {
      const blobJson = await data.account.exportAll();
      const blob = new Blob([JSON.stringify(blobJson, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "noteim-data.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.show({ tone: "success", message: t("privacyExported") });
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    try {
      resetData();
      setConfirmDelete(false);
      router.push("/welcome");
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-label={t("privacyExport")}>
        <h2 className="text-small font-semibold text-ink-2">{t("privacyExport")}</h2>
        <p className="mt-1 text-small text-ink-2">{t("privacyExportHint")}</p>
        <Button icon={Download} loading={busy} className="mt-3" onClick={() => void exportJson()}>
          {t("privacyExportAction")}
        </Button>
      </section>

      <section aria-label={t("privacyLinks")}>
        <h2 className="text-small font-semibold text-ink-2">{t("privacyLinks")}</h2>
        {(links.data ?? []).length ? (
          <ul className="mt-2 divide-y divide-line">
            {(links.data ?? []).map((link) => (
              <li key={link.id} className="flex min-h-12 items-center gap-3 py-2">
                <Link2 aria-hidden={true} className="size-5 shrink-0 text-ink-3" strokeWidth={1.75} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-ink">{titleById[link.session_id] ?? link.session_id}</span>
                  <span className="block text-small text-ink-3">
                    /p/{link.id}, {t("viewCountShort", { count: link.view_count })}
                    {link.revoked ? `, ${t("linkRevokedLabel")}` : ""}
                  </span>
                </span>
                {!link.revoked ? (
                  <Button variant="ghost" icon={Trash2} iconOnly aria-label={t("revokeShort")} className="text-tag-risk hover:text-tag-risk" onClick={() => setRevokeId(link.id)} />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-small text-ink-3">{t("privacyLinksEmpty")}</p>
        )}
      </section>

      <section aria-label={t("privacyDelete")}>
        <h2 className="text-small font-semibold text-ink-2">{t("privacyDelete")}</h2>
        <p className="mt-1 text-small text-ink-2">{t("privacyDeleteHint")}</p>
        <Button variant="danger" className="mt-3" onClick={() => (setTyped(""), setConfirmDelete(true))}>
          {t("privacyDeleteAction")}
        </Button>
      </section>

      <ConfirmDialog
        open={!!revokeId}
        onOpenChange={(open) => !open && setRevokeId(null)}
        title={t("linkRevokeTitle")}
        cancelLabel={t("cancel")}
        confirmLabel={t("revokeShort")}
        onConfirm={() => {
          const id = revokeId;
          setRevokeId(null);
          if (!id) return;
          void data.share
            .revoke(id)
            .then(() => toast.show({ tone: "success", message: t("linkRevokedLabel") }))
            .catch(() => toast.show({ tone: "error", message: t("saveError") }));
        }}
      >
        {t("privacyRevokeBody")}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("privacyDeleteTitle")}
        cancelLabel={t("cancel")}
        confirmLabel={t("privacyDeleteConfirm")}
        confirmVariant="danger"
        confirmDisabled={typed.trim() !== DELETE_WORD}
        onConfirm={() => void deleteAccount()}
      >
        <span className="block">{t("privacyDeleteBody")}</span>
        <label className="mt-3 block text-small font-medium text-ink">
          {t("privacyDeleteType", { word: DELETE_WORD })}
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink focus:border-dien focus-visible:outline-none"
            autoComplete="off"
          />
        </label>
      </ConfirmDialog>
    </div>
  );
}
