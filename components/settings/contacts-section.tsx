"use client";

import { Check, Pencil, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextField } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { data, useData, type Contact } from "@/lib/data";

/*
 * Danh bạ (M4-03): tên, vai trò, email; thêm, sửa, xóa.
 * Xóa liên hệ đang gán cho người nói thì cảnh báo (contactUsage).
 */

type Draft = { name: string; role: string; email: string };

const EMPTY_DRAFT: Draft = { name: "", role: "", email: "" };

export function ContactsSection() {
  const t = useTranslations("settings");
  const toast = useToast();
  const contacts = useData(() => data.account.contacts(), []);
  const [draft, setDraft] = useState<Draft | null>(null); // null = đóng; id=null là thêm mới
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ contact: Contact; usedIn: string[] } | null>(null);
  const [usageChecked, setUsageChecked] = useState(false);

  async function saveNew() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setDraft(null);
      return;
    }
    try {
      await data.account.addContact({ name, email: draft.email.trim() || undefined });
      setDraft(null);
      toast.show({ tone: "success", message: t("contactAdded") });
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
    }
  }

  async function saveEdit(contact: Contact) {
    if (!draft) return;
    try {
      await data.account.updateContact(contact.id, {
        name: draft.name.trim(),
        role: draft.role.trim() || undefined,
        email: draft.email.trim() || undefined,
      });
      setEditingId(null);
      setDraft(null);
      toast.show({ tone: "success", message: t("contactSaved") });
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
    }
  }

  async function askRemove(contact: Contact) {
    setUsageChecked(false);
    try {
      const usedIn = await data.account.contactUsage(contact.id);
      setConfirmRemove({ contact, usedIn });
      setUsageChecked(true);
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
    }
  }

  async function remove() {
    if (!confirmRemove) return;
    try {
      await data.account.removeContact(confirmRemove.contact.id);
      toast.show({ tone: "success", message: t("contactRemoved", { name: confirmRemove.contact.name }) });
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
    }
    setConfirmRemove(null);
  }

  function editDraft(contact: Contact): Draft {
    return { name: contact.name, role: contact.role ?? "", email: contact.email ?? "" };
  }

  return (
    <div>
      {editingId === null && draft ? (
        <form
          className="mb-4 flex flex-col gap-3 rounded-block border border-line bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void saveNew();
          }}
        >
          <TextField label={t("contactName")} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label={t("contactRole")} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
            <TextField label={t("contactEmail")} type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" icon={Check}>
              {t("save")}
            </Button>
            <Button variant="ghost" icon={X} onClick={() => setDraft(null)}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <Button icon={Plus} onClick={() => setDraft({ ...EMPTY_DRAFT })}>
          {t("contactAdd")}
        </Button>
      )}

      <ul className="mt-4 divide-y divide-line">
        {(contacts.data ?? []).map((c) =>
          editingId === c.id && draft ? (
            <li key={c.id} className="py-3">
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveEdit(c);
                }}
              >
                <TextField label={t("contactName")} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label={t("contactRole")} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
                  <TextField label={t("contactEmail")} type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" variant="primary" icon={Check}>
                    {t("save")}
                  </Button>
                  <Button variant="ghost" icon={X} onClick={() => (setEditingId(null), setDraft(null))}>
                    {t("cancel")}
                  </Button>
                </div>
              </form>
            </li>
          ) : (
            <li key={c.id} className="flex min-h-14 items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body text-ink">{c.name}</span>
                <span className="block truncate text-small text-ink-3">
                  {[c.role, c.email].filter(Boolean).join(" · ") || " "}
                </span>
              </span>
              <Button
                variant="ghost"
                icon={Pencil}
                iconOnly
                aria-label={t("contactEdit", { name: c.name })}
                onClick={() => {
                  setEditingId(c.id);
                  setDraft(editDraft(c));
                }}
              />
              <Button variant="ghost" icon={X} iconOnly aria-label={t("contactDelete", { name: c.name })} onClick={() => void askRemove(c)} />
            </li>
          ),
        )}
      </ul>

      <ConfirmDialog
        open={!!confirmRemove && usageChecked}
        onOpenChange={(open) => !open && setConfirmRemove(null)}
        title={t("contactRemoveTitle", { name: confirmRemove?.contact.name ?? "" })}
        cancelLabel={t("cancel")}
        confirmLabel={t("contactRemoveConfirm")}
        onConfirm={() => void remove()}
      >
        {confirmRemove?.usedIn.length ? (
          <>
            <span className="block">{t("contactUsedWarning")}</span>
            <span className="mt-1 block text-small">{t("contactUsedIn", { titles: confirmRemove.usedIn.slice(0, 3).join(", ") })}</span>
          </>
        ) : (
          <span className="block">{t("contactRemoveBody")}</span>
        )}
      </ConfirmDialog>
    </div>
  );
}
