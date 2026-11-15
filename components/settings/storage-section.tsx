"use client";

import { Archive } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { data, useData, type Session } from "@/lib/data";
import { durationParts } from "@/lib/format";

/*
 * Lưu trữ (M4-03): thanh dung lượng đã dùng, danh sách buổi ghi theo dung lượng
 * giảm dần, "Dọn bản gốc" từng buổi hoặc chọn nhiều. Hộp xác nhận nói rõ
 * thứ gì mất và thứ gì giữ (docs/03-screens.md mục 12).
 */

export function StorageSection() {
  const t = useTranslations("settings");
  const tl = useTranslations("library");
  const ts = useTranslations("session");
  const toast = useToast();
  const sessions = useData(() => data.sessions.list(), []);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmPurge, setConfirmPurge] = useState(false);

  const stored = useMemo(
    () => (sessions.data ?? []).filter((s) => s.storage_status === "full").sort((a, b) => b.size_bytes - a.size_bytes),
    [sessions.data],
  );
  const totalBytes = stored.reduce((n, s) => n + s.size_bytes, 0);
  const targets = stored.filter((s) => selected.includes(s.id));
  const targetMb = Math.max(1, Math.round(targets.reduce((n, s) => n + s.size_bytes, 0) / 1_000_000));
  const totalMb = (totalBytes / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 });

  function toggle(id: string) {
    setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  async function purge(ids: string[]) {
    try {
      const { freed_bytes } = await data.sessions.purgeRaw(ids);
      setSelected([]);
      setConfirmPurge(false);
      toast.show({ tone: "success", message: ts("purgedToast", { count: ids.length, mb: Math.max(1, Math.round(freed_bytes / 1_000_000)) }) });
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
      setConfirmPurge(false);
    }
  }

  function durationLabel(sec: number) {
    const { h, m } = durationParts(sec);
    return h > 0 ? tl("hours", { h, m: String(m).padStart(2, "0") }) : tl("minutes", { m });
  }

  function rowSize(s: Session) {
    return (s.size_bytes / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 });
  }

  return (
    <div>
      <div>
        <div className="flex items-baseline justify-between">
          <h2 className="text-small font-semibold text-ink-2">{t("storageUsed")}</h2>
          <span className="text-small font-semibold tabular-nums text-ink">{totalMb} MB</span>
        </div>
        <div className="mt-2 h-2.5 rounded-pill bg-surface-2" role="img" aria-label={`${t("storageUsed")}: ${totalMb} MB`}>
          <div className="h-2.5 rounded-pill bg-sen" style={{ width: `${Math.min(100, Math.max(2, (totalBytes / 2_000_000_000) * 100))}%` }} />
        </div>
      </div>

      {stored.length ? (
        <>
          <ul className="mt-5 divide-y divide-line">
            {stored.map((s) => (
              <li key={s.id} className="flex min-h-12 items-center gap-3 py-2">
                <input
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  onChange={() => toggle(s.id)}
                  aria-label={t("storagePick", { title: s.title })}
                  className="size-5 shrink-0 accent-[var(--sen)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-ink">{s.title}</span>
                  <span className="block text-small text-ink-3">
                    {durationLabel(s.duration_sec)} · {rowSize(s)} MB
                  </span>
                </span>
                <Button
                  variant="ghost"
                  className="-my-1 h-9 shrink-0 text-tag-risk hover:text-tag-risk"
                  onClick={() => {
                    setSelected([s.id]);
                    setConfirmPurge(true);
                  }}
                >
                  {t("purgeOne")}
                </Button>
              </li>
            ))}
          </ul>

          {targets.length ? (
            <Button variant="danger" icon={Archive} className="mt-4" onClick={() => setConfirmPurge(true)}>
              {t("purgeMany", { count: targets.length })}
            </Button>
          ) : null}

          <ConfirmDialog
            open={confirmPurge}
            onOpenChange={setConfirmPurge}
            title={ts("purgeTitle")}
            cancelLabel={t("cancel")}
            confirmLabel={ts("purgeConfirm")}
            onConfirm={() => void purge(selected)}
          >
            <span className="block">{ts("purgeBodyRemove", { mb: targetMb })}</span>
            <span className="block">{ts("purgeBodyKeep")}</span>
            <span className="mt-2 block font-medium text-ink">{ts("purgeBodyIrreversible")}</span>
          </ConfirmDialog>
        </>
      ) : (
        <p className="mt-5 text-small text-ink-3">{t("storageEmpty")}</p>
      )}
    </div>
  );
}
