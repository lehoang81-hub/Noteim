"use client";

import { Check, Pencil, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { data, useData } from "@/lib/data";

/*
 * Từ điển tên riêng (M4-03): danh sách, thêm, sửa, xóa.
 * Dùng chung dữ liệu với tab Lời (bôi đen để thêm từ).
 */

export function GlossarySection() {
  const t = useTranslations("settings");
  const toast = useToast();
  const glossary = useData(() => data.account.glossary(), []);
  const [adding, setAdding] = useState(false);
  const [newTerm, setNewTerm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  async function add() {
    const term = newTerm.trim();
    if (!term) {
      setAdding(false);
      return;
    }
    try {
      await data.account.addGlossaryTerm(term);
      setNewTerm("");
      setAdding(false);
      toast.show({ tone: "success", message: t("glossaryAdded") });
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
    }
  }

  async function saveEdit() {
    const id = editingId;
    const term = editValue.trim();
    if (!id || !term) {
      setEditingId(null);
      return;
    }
    try {
      await data.account.updateGlossaryTerm(id, term);
      setEditingId(null);
      toast.show({ tone: "success", message: t("glossarySaved") });
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
    }
  }

  async function remove(id: string) {
    try {
      await data.account.removeGlossaryTerm(id);
      toast.show({ tone: "success", message: t("glossaryRemoved") });
    } catch {
      toast.show({ tone: "error", message: t("saveError") });
    }
  }

  return (
    <div>
      <p className="text-small text-ink-2">{t("glossaryHint")}</p>

      {adding ? (
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <TextField
            label={t("glossaryTerm")}
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            autoFocus
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="primary" icon={Check} iconOnly aria-label={t("save")} />
          <Button variant="ghost" icon={X} iconOnly aria-label={t("cancel")} onClick={() => setAdding(false)} />
        </form>
      ) : (
        <Button icon={Plus} className="mt-3" onClick={() => setAdding(true)}>
          {t("glossaryAdd")}
        </Button>
      )}

      <ul className="mt-4 divide-y divide-line">
        {(glossary.data ?? []).map((g) =>
          editingId === g.id ? (
            <li key={g.id} className="flex items-end gap-2 py-2">
              <TextField label={t("glossaryTerm")} value={editValue} onChange={(e) => setEditValue(e.target.value)} autoFocus className="min-w-0 flex-1" />
              <Button variant="primary" icon={Check} iconOnly aria-label={t("save")} onClick={() => void saveEdit()} />
              <Button variant="ghost" icon={X} iconOnly aria-label={t("cancel")} onClick={() => setEditingId(null)} />
            </li>
          ) : (
            <li key={g.id} className="flex min-h-12 items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-body text-ink">{g.term}</span>
              <Button
                variant="ghost"
                icon={Pencil}
                iconOnly
                aria-label={t("glossaryEdit", { term: g.term })}
                onClick={() => {
                  setEditingId(g.id);
                  setEditValue(g.term);
                }}
              />
              <Button variant="ghost" icon={X} iconOnly aria-label={t("glossaryDelete", { term: g.term })} onClick={() => void remove(g.id)} />
            </li>
          ),
        )}
      </ul>
      {!glossary.data?.length ? <p className="mt-4 text-small text-ink-3">{t("glossaryEmpty")}</p> : null}
    </div>
  );
}
