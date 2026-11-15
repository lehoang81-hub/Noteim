"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { TextField } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { data, type ActionItem, type Contact, type SessionDetail } from "@/lib/data";

/*
 * Bảng sửa / thêm việc cần làm (docs/03-screens.md mục 5b, issue M3-04).
 * Nội dung, người phụ trách (gợi ý người nói đã đặt tên trước, rồi danh bạ,
 * có "Chưa giao"), hạn, mức ưu tiên. Lưu bằng data.tasks.upsert.
 */

export function TaskSheet({
  session,
  contacts,
  item,
  open,
  onOpenChange,
}: {
  session: SessionDetail;
  contacts: Contact[];
  /** null là thêm mới */
  item: ActionItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("taskEdit");
  const ts = useTranslations("session");
  const toast = useToast();

  const [task, setTask] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<ActionItem["priority"]>("medium");
  // Mỗi lần mở bảng: nạp giá trị của việc đang sửa (hoặc trống khi thêm mới);
  // làm lúc vẽ thay vì trong effect
  const [prevOpen, setPrevOpen] = useState(false);
  if (open && !prevOpen) {
    setPrevOpen(true);
    setTask(item?.task ?? "");
    setAssignee(item?.assignee_contact_id ?? "");
    setDueDate(item?.due_date ?? "");
    setPriority(item?.priority ?? "medium");
  } else if (!open && prevOpen) {
    setPrevOpen(false);
  }

  // Gợi ý người phụ trách: người nói đã đặt tên của buổi ghi trước, rồi danh bạ
  const namedSpeakers = session.speakers
    .filter((s) => s.contact_id)
    .map((s) => contacts.find((c) => c.id === s.contact_id))
    .filter((c): c is Contact => !!c);
  const speakerIds = new Set(namedSpeakers.map((c) => c.id));
  const otherContacts = contacts.filter((c) => !speakerIds.has(c.id) && c.id !== "c-me");

  async function save() {
    const text = task.trim();
    if (!text) return;
    const base: ActionItem =
      item ??
      {
        id: `a-new-${Date.now().toString(36)}`,
        session_id: session.id,
        task: "",
        assignee_contact_id: null,
        due_date: null,
        priority: "medium",
        done: false,
        done_at: null,
        source_quote: null,
        timestamp_sec: null,
      };
    try {
      await data.tasks.upsert({
        ...base,
        task: text,
        assignee_contact_id: assignee || null,
        due_date: dueDate || null,
        priority,
      });
      onOpenChange(false);
      toast.show({ tone: "success", message: t("saved") });
    } catch {
      toast.show({ tone: "error", message: ts("saveError") });
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={item ? t("titleEdit") : t("titleAdd")}
      size="half"
      footer={
        <Button variant="primary" block disabled={!task.trim()} onClick={() => void save()}>
          {ts("save")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label={t("content")}
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder={t("contentPlaceholder")}
          autoFocus
        />
        <label className="block">
          <span className="mb-1.5 block text-small font-medium text-ink">{t("assignee")}</span>
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="h-11 w-full rounded-control border border-line bg-surface px-2 text-body text-ink"
          >
            <option value="">{t("assigneeNone")}</option>
            {namedSpeakers.length ? (
              <optgroup label={t("assigneeGroupSpeakers")}>
                {namedSpeakers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {otherContacts.length ? (
              <optgroup label={t("assigneeGroupContacts")}>
                {otherContacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.email ? `, ${c.email}` : ""}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
        <TextField label={t("due")} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <label className="block">
          <span className="mb-1.5 block text-small font-medium text-ink">{t("priority")}</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as ActionItem["priority"])}
            className="h-11 w-full rounded-control border border-line bg-surface px-2 text-body text-ink"
          >
            <option value="high">{t("prHigh")}</option>
            <option value="medium">{t("prMedium")}</option>
            <option value="low">{t("prLow")}</option>
          </select>
        </label>
      </div>
    </Sheet>
  );
}
