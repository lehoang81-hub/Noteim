"use client";

import { Check, Play, Plus, Square, UserRoundPen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { SpeakerName } from "@/components/ui/chips";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet } from "@/components/ui/sheet";
import { TextField } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { data, useData, type SessionDetail, type Speaker } from "@/lib/data";
import { speakerLabel } from "@/lib/data/localize";
import type { Player } from "@/lib/player/mock-player";
import { cn } from "@/lib/cn";

/*
 * Bảng "Ai là ai?" (docs/03-screens.md mục 6, issue M3-02).
 * - Mỗi người nói một hàng: chấm màu, tên, tỷ lệ nói, nghe thử 5 giây, ô chọn tên.
 * - Ô chọn tên gợi ý theo người tham gia, rồi danh bạ; dòng cuối tạo liên hệ mới.
 * - Gộp hai người nói thành một, có câu xác nhận nói rõ kết quả.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SpeakerSheet({
  detail,
  player,
  canPlay,
  open,
  onOpenChange,
}: {
  detail: SessionDetail;
  player: Player;
  canPlay: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("speakers");
  const tr = useTranslations(); // nhãn người nói chưa đặt tên ở cấp gốc (review #41 mục 5)
  const ts = useTranslations("session");
  const toast = useToast();
  const contacts = useData(() => data.account.contacts(), []);

  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewTimer = useRef<number>(0);

  // Nghe thử: phát 5 giây từ đoạn rõ nhất của người đó rồi tự dừng
  function stopPreview() {
    window.clearTimeout(previewTimer.current);
    player.pause();
    setPreviewId(null);
  }
  function startPreview(sp: Speaker) {
    window.clearTimeout(previewTimer.current);
    setPreviewId(sp.id);
    player.seek(sp.sample_start_sec);
    player.play();
    previewTimer.current = window.setTimeout(stopPreview, 5000);
  }
  useEffect(() => () => window.clearTimeout(previewTimer.current), []);

  function handleClose(next: boolean) {
    // Đóng bảng thì dừng nghe thử (gọi từ sự kiện, không trong effect)
    if (!next) stopPreview();
    onOpenChange(next);
  }

  async function assign(sp: Speaker, contactId: string) {
    try {
      await data.sessions.nameSpeaker(detail.id, sp.id, contactId);
      toast.show({ tone: "success", message: t("saved") });
    } catch {
      toast.show({ tone: "error", message: ts("saveError") });
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleClose} title={t("title")} description={t("description")} size="half">
      <div className="flex flex-col gap-5">
        <ul className="flex flex-col divide-y divide-line">
          {detail.speakers.map((sp) => (
            <li key={sp.id} className="py-4">
              <div className="flex items-center gap-3">
                <SpeakerName colorIndex={sp.color_index} name={speakerLabel(sp, detail.speakers, tr)} named={!!sp.contact_id || sp.is_me} className="min-w-0 flex-1" />
                <span className="shrink-0 text-caption text-ink-3">{t("talkShare", { percent: sp.talk_ratio_percent })}</span>
                <Button
                  variant="ghost"
                  icon={previewId === sp.id ? Square : Play}
                  loading={previewId === sp.id}
                  disabled={!canPlay || (!!previewId && previewId !== sp.id)}
                  onClick={() => (previewId === sp.id ? stopPreview() : startPreview(sp))}
                >
                  {previewId === sp.id ? t("previewing") : t("preview")}
                </Button>
              </div>
              <NamePicker
                speaker={sp}
                speakers={detail.speakers}
                contacts={contacts.data ?? []}
                participantIds={detail.participant_contact_ids}
                disabled={sp.is_me}
                onAssign={(contactId) => void assign(sp, contactId)}
              />
            </li>
          ))}
        </ul>

        <MergeSpeakers detail={detail} onDone={() => toast.show({ tone: "success", message: t("merged") })} />
      </div>
    </Sheet>
  );
}

/* ---------- Ô chọn tên ---------- */

function NamePicker({
  speaker,
  speakers,
  contacts,
  participantIds,
  disabled,
  onAssign,
}: {
  speaker: Speaker;
  speakers: Speaker[];
  contacts: Awaited<ReturnType<typeof data.account.contacts>>;
  participantIds: string[];
  disabled?: boolean;
  onAssign: (contactId: string) => void;
}) {
  const t = useTranslations("speakers");
  const ts = useTranslations("session");
  const toast = useToast();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const assignedElsewhere = useMemo(
    () => new Set(speakers.filter((s) => s.id !== speaker.id && s.contact_id).map((s) => s.contact_id as string)),
    [speakers, speaker.id],
  );
  const contactById = useMemo(() => Object.fromEntries(contacts.map((c) => [c.id, c])), [contacts]);

  // Gợi ý: người tham gia buổi ghi trước, rồi phần còn lại của danh bạ
  const suggestions = useMemo(() => {
    const pool = contacts.filter((c) => !assignedElsewhere.has(c.id));
    const rank = (c: (typeof pool)[number]) => (participantIds.includes(c.id) ? 0 : 1);
    const q = text.trim().toLocaleLowerCase("vi");
    const filtered = q ? pool.filter((c) => c.name.toLocaleLowerCase("vi").includes(q)) : pool;
    return [...filtered].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "vi"));
  }, [contacts, assignedElsewhere, participantIds, text]);

  const typed = text.trim();
  // Trùng tên đã có trong danh bạ thì không hiện dòng "Thêm"
  const duplicateName = typed
    ? contacts.some((c) => c.name.toLocaleLowerCase("vi") === typed.toLocaleLowerCase("vi"))
    : true;

  useEffect(() => {
    function onDocDown(e: PointerEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDocDown);
    return () => document.removeEventListener("pointerdown", onDocDown);
  }, []);

  const current = speaker.contact_id ? contactById[speaker.contact_id] : null;

  async function createAndAssign() {
    if (!typed) return;
    if (newEmail.trim() && !EMAIL_RE.test(newEmail.trim())) {
      setEmailError(true);
      return;
    }
    setEmailError(false);
    try {
      const contact = await data.account.addContact({ name: typed, email: newEmail.trim() || undefined });
      setText("");
      setNewEmail("");
      setCreating(false);
      setOpen(false);
      onAssign(contact.id);
    } catch {
      // Ghi lỗi (thường là mất mạng do bảng thử nghiệm ép)
      setEmailError(false);
      toast.show({ tone: "error", message: ts("saveError") });
    }
  }

  if (disabled) {
    return (
      <p className="mt-2 text-caption text-ink-3">
        {current?.email ? current.email : t("noEmail")}
      </p>
    );
  }

  return (
    <div ref={boxRef} className="relative mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex h-11 w-full items-center gap-2 rounded-control border border-line bg-surface px-3 text-left text-body text-ink transition-colors ease-noteim duration-(--t-quick) hover:border-dien"
      >
        <UserRoundPen aria-hidden={true} className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
        <span className={cn("min-w-0 flex-1 text-left", current ? "text-ink" : "text-ink-3")}>
          {current ? (
            <>
              {/* Tên và email ở hai dòng, không ghép bằng gạch ngang dài */}
              <span className="block truncate text-body">{current.name}</span>
              {current.email ? <span className="block truncate text-caption text-ink-3">{current.email}</span> : null}
            </>
          ) : (
            t("pickPlaceholder")
          )}
        </span>
      </button>

      {open ? (
        <div role="listbox" aria-label={t("pickLabel")} className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-block border border-line bg-surface p-1 shadow-float">
          <input
            autoFocus
            value={text}
            onChange={(e) => (setText(e.target.value), setCreating(false))}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            aria-label={t("pickLabel")}
            placeholder={t("pickPlaceholder")}
            className="h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink placeholder:text-ink-3 focus:border-dien focus-visible:outline-none"
          />
          <p className="px-2 py-1.5 text-caption text-ink-3">{t("pickHint")}</p>
          <ul>
            {suggestions.map((c) => (
              <li key={c.id} role="option" aria-selected={speaker.contact_id === c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setText("");
                    onAssign(c.id);
                  }}
                  className="flex min-h-11 w-full items-center gap-2 rounded-control px-2 py-1.5 text-left hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1 truncate text-small text-ink">{c.name}</span>
                  <span className="shrink-0 text-caption text-ink-3">{c.email ?? c.role ?? ""}</span>
                  {speaker.contact_id === c.id ? <Check aria-hidden={true} className="size-4 shrink-0 text-sen" strokeWidth={2} /> : null}
                </button>
              </li>
            ))}
            {!suggestions.length && !typed ? (
              <li className="px-2 py-2 text-small text-ink-3">{t("pickHint")}</li>
            ) : null}
          </ul>

          {/* Tạo liên hệ mới ngay trong ô chọn tên */}
          {typed && !duplicateName ? (
            creating ? (
              <div className="mt-1 border-t border-line p-2">
                <TextField
                  label={t("newName")}
                  value={typed}
                  disabled={true}
                  onChange={() => undefined}
                  className="mb-2"
                />
                <TextField
                  label={t("newEmail")}
                  value={newEmail}
                  error={emailError ? t("emailInvalid") : undefined}
                  onChange={(e) => setNewEmail(e.target.value)}
                  type="email"
                />
                <Button variant="primary" icon={Plus} className="mt-2" onClick={() => void createAndAssign()}>
                  {t("createAssign")}
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-control border-t border-line px-2 py-2 text-left text-small font-medium text-sen-text hover:bg-surface-2"
              >
                <Plus aria-hidden={true} className="size-4 shrink-0" strokeWidth={2} />
                {t("addNew", { name: typed })}
              </button>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Gộp hai người nói ---------- */

function MergeSpeakers({ detail, onDone }: { detail: SessionDetail; onDone: () => void }) {
  const t = useTranslations("speakers");
  const tr = useTranslations(); // nhãn người nói chưa đặt tên ở cấp gốc (review #41 mục 5)
  const ts = useTranslations("session");
  const toast = useToast();
  const [fromId, setFromId] = useState("");
  const [intoId, setIntoId] = useState("");
  // Gộp là thao tác không hoàn tác được: luôn qua hộp xác nhận trước khi thực hiện
  const [confirmOpen, setConfirmOpen] = useState(false);
  const select =
    "h-11 w-full rounded-control border border-line bg-surface px-2 text-small text-ink";

  const from = detail.speakers.find((s) => s.id === fromId);
  const into = detail.speakers.find((s) => s.id === intoId);
  const ready = !!from && !!into && from.id !== into.id;
  const same = !!fromId && !!intoId && fromId === intoId;

  return (
    <section aria-label={t("mergeTitle")} className="rounded-block border border-line p-4">
      <h3 className="text-small font-semibold text-ink">{t("mergeTitle")}</h3>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-caption font-medium text-ink-2">
          {t("mergeFrom")}
          <select className={`${select} mt-1`} value={fromId} onChange={(e) => setFromId(e.target.value)}>
            <option value="">—</option>
            {detail.speakers.map((s) => (
              <option key={s.id} value={s.id}>
                {speakerLabel(s, detail.speakers, tr)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-caption font-medium text-ink-2">
          {t("mergeInto")}
          <select className={`${select} mt-1`} value={intoId} onChange={(e) => setIntoId(e.target.value)}>
            <option value="">—</option>
            {detail.speakers.map((s) => (
              <option key={s.id} value={s.id}>
                {speakerLabel(s, detail.speakers, tr)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {same ? <p className="mt-2 text-small font-medium text-tag-pending">{t("mergeSame")}</p> : null}
      {ready ? (
        <p className="mt-3 rounded-control bg-surface-2 px-3 py-2 text-small text-ink">
          {t("mergeConfirm", { from: speakerLabel(from!, detail.speakers, tr), into: speakerLabel(into!, detail.speakers, tr), percent: from!.talk_ratio_percent })}
        </p>
      ) : null}
      <Button
        variant="secondary"
        icon={Check}
        className="mt-3"
        disabled={!ready}
        onClick={() => setConfirmOpen(true)}
      >
        {t("mergeButton")}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("mergeTitle")}
        cancelLabel={ts("cancel")}
        confirmLabel={t("mergeButton")}
        onConfirm={() => {
          void (async () => {
            try {
              await data.sessions.mergeSpeakers(detail.id, fromId, intoId);
              setFromId("");
              setIntoId("");
              onDone();
            } catch {
              toast.show({ tone: "error", message: ts("saveError") });
            }
          })();
        }}
      >
        {ready ? t("mergeConfirm", { from: speakerLabel(from!, detail.speakers, tr), into: speakerLabel(into!, detail.speakers, tr), percent: from!.talk_ratio_percent }) : null}
      </ConfirmDialog>
    </section>
  );
}
