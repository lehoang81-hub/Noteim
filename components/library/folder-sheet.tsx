"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FolderOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { data, useData, type Folder, type FolderKind } from "@/lib/data";
import { templateName as localizedTemplateName } from "@/lib/data/localize";

/*
 * Quản lý thư mục theo hồ sơ (GC-05, đặc tả v1.1 §4.7):
 * - Tạo/sửa thư mục chọn nghề một lần (chọn mẫu của nghề): buổi mới gắn vào
 *   thư mục kế thừa mẫu này, override từng buổi vẫn làm được trên màn ghi.
 * - Nghề chưa chọn thì buổi mới dùng mẫu mặc định ("Tổng quát").
 * - Xóa thư mục không đụng buổi ghi (chỉ gỡ khỏi thư mục).
 * Loại thư mục (vụ việc/bệnh nhân/khách hàng/công trình) suy ra từ nghề của
 * mẫu đã chọn, không hỏi thêm lần chạm.
 */

const KIND_BY_PROFESSION: Record<string, FolderKind> = {
  doctor: "patient",
  lawyer: "legal_case",
  realestate_sales: "client",
  business_owner: "client",
  architect: "project",
  notary: "project",
};

function kindFor(templateProfession: string | null | undefined): FolderKind {
  return (templateProfession && KIND_BY_PROFESSION[templateProfession]) || "client";
}

export function FolderManageSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("library");
  const toast = useToast();
  const locale = useLocale();
  const folders = useData(() => data.folders.list(), []);
  const templates = useData(() => data.account.templates(), []);
  const [editing, setEditing] = useState<Folder | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Folder | null>(null);

  const list = folders.data ?? [];
  const templateNameOf = (templateId: string | null | undefined) => {
    const tpl = templates.data?.find((tp) => tp.id === templateId);
    return tpl ? localizedTemplateName(tpl, locale) : null;
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) { setEditing(null); onOpenChange(false); } }} title={t("folderManage")} size="half">
      {editing === null ? (
        list.length === 0 ? (
          <p className="py-2 text-body text-ink-2">{t("folderEmpty")}</p>
        ) : (
          <ul className="divide-y divide-line py-1">
            {list.map((f) => (
              <li key={f.id} className="flex items-center gap-2 py-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-surface-2 text-ink-2">
                  <FolderOpen aria-hidden={true} className="size-4.5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium text-ink">
                    {f.name}
                    {f.ref ? <span className="font-normal text-ink-3"> ({f.ref})</span> : null}
                  </span>
                  <span className="block text-caption text-ink-3">
                    {f.template_id ? t("folderInherits", { template: templateNameOf(f.template_id) ?? "" }) : t("folderInheritsNone")}
                    {", "}
                    {t("folderSessionCount", { count: f.session_ids.length })}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  icon={Pencil}
                  iconOnly
                  aria-label={t("folderEdit")}
                  onClick={() => setEditing(f)}
                />
                <Button
                  variant="ghost"
                  icon={Trash2}
                  iconOnly
                  aria-label={t("folderDelete")}
                  onClick={() => setConfirmDelete(f)}
                />
              </li>
            ))}
          </ul>
        )
      ) : (
        <FolderForm
          editing={editing}
          templates={templates.data ?? []}
          onDone={(saved) => {
            setEditing(null);
            if (saved) toast.show({ tone: "success", message: t("folderSaved") });
          }}
        />
      )}

      {editing === null ? (
        <Button
          variant="primary"
          block
          icon={Plus}
          className="mt-4"
          onClick={() => setEditing("new")}
        >
          {t("folderNew")}
        </Button>
      ) : null}

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(next) => !next && setConfirmDelete(null)}
        title={t("folderDeleteTitle", { name: confirmDelete?.name ?? "" })}
        confirmLabel={t("folderDeleteConfirm")}
        cancelLabel={t("folderDeleteCancel")}
        onConfirm={() => {
          const target = confirmDelete;
          setConfirmDelete(null);
          if (!target) return;
          void data.folders
            .remove(target.id)
            .then(() => toast.show({ tone: "success", message: t("folderDeleted") }))
            .catch(() => toast.show({ tone: "error", message: t("folderSaveError") }));
        }}
      >
        <p>{t("folderDeleteBody")}</p>
      </ConfirmDialog>
    </Sheet>
  );
}

/** Form tạo/sửa thư mục: tên, mã hồ sơ, chọn nghề (chọn mẫu kế thừa). */
function FolderForm({
  editing,
  templates,
  onDone,
}: {
  editing: Folder | "new";
  templates: Awaited<ReturnType<typeof data.account.templates>>;
  onDone: (saved: boolean) => void;
}) {
  const t = useTranslations("library");
  const locale = useLocale();
  const existing = editing === "new" ? null : editing;
  const [name, setName] = useState(existing?.name ?? "");
  const [ref, setRef] = useState(existing?.ref ?? "");
  const [templateId, setTemplateId] = useState<string | null>(existing?.template_id ?? null);
  const [saving, setSaving] = useState(false);
  const latest = useRef({ name, ref, templateId });
  useEffect(() => {
    latest.current = { name, ref, templateId };
  }, [name, ref, templateId]);

  async function save() {
    if (!latest.current.name.trim()) return;
    setSaving(true);
    try {
      if (existing) {
        await data.folders.update(existing.id, {
          name: latest.current.name,
          ref: latest.current.ref || undefined,
          template_id: latest.current.templateId,
        });
      } else {
        const tpl = templates.find((tp) => tp.id === latest.current.templateId);
        await data.folders.create({
          kind: kindFor(tpl?.profession),
          name: latest.current.name,
          ref: latest.current.ref || undefined,
          template_id: latest.current.templateId,
        });
      }
      onDone(true);
    } catch {
      onDone(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 py-1">
      <label className="block">
        <span className="mb-1.5 block text-small font-medium text-ink">{t("folderName")}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={t("folderName")}
          placeholder={t("folderNamePlaceholder")}
          className="h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink placeholder:text-ink-3 focus:border-dien focus-visible:outline-none"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-small font-medium text-ink">{t("folderRef")}</span>
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          aria-label={t("folderRef")}
          placeholder={t("folderRefPlaceholder")}
          className="h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink placeholder:text-ink-3 focus:border-dien focus-visible:outline-none"
        />
      </label>
      <fieldset>
        <legend className="mb-1.5 text-small font-medium text-ink">{t("folderTemplate")}</legend>
        <p className="mb-2 text-caption text-ink-3">{t("folderTemplateHint")}</p>
        <div role="radiogroup" aria-label={t("folderTemplate")} className="flex flex-col gap-1">
          {templates.map((tp) => {
            const active = templateId === tp.id;
            return (
              <button
                key={tp.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTemplateId(tp.id)}
                className={cn(
                  "flex min-h-11 items-center justify-between gap-2 rounded-control border px-3 py-2 text-left text-body transition-colors ease-noteim duration-(--t-quick)",
                  active ? "border-sen bg-sen/10 font-semibold text-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
                )}
              >
                <span className="min-w-0 truncate">{localizedTemplateName(tp, locale)}</span>
                {active ? <Check aria-hidden={true} className="size-4 shrink-0 text-sen" strokeWidth={2} /> : null}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={templateId === null}
            onClick={() => setTemplateId(null)}
            className={cn(
              "flex min-h-11 items-center justify-between gap-2 rounded-control border px-3 py-2 text-left text-body transition-colors ease-noteim duration-(--t-quick)",
              templateId === null ? "border-sen bg-sen/10 font-semibold text-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
            )}
          >
            <span>{t("folderTemplateNone")}</span>
            {templateId === null ? <Check aria-hidden={true} className="size-4 shrink-0 text-sen" strokeWidth={2} /> : null}
          </button>
        </div>
      </fieldset>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => onDone(false)}>
          {t("folderCancel")}
        </Button>
        <Button variant="primary" loading={saving} disabled={!name.trim()} onClick={() => void save()}>
          {t("folderSave")}
        </Button>
      </div>
    </div>
  );
}
