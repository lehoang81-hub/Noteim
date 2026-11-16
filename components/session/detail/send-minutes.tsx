"use client";

import { ArrowLeft, ArrowRight, Check, ClipboardCopy, Languages, Send, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { formatClock } from "@/components/ribbon/draw";
import { shortDate } from "@/lib/format";
import { useToast } from "@/components/ui/toast";
import { data, DataError, type Contact, type EmailDraft, type Lang, type SessionDetail } from "@/lib/data";
import { cn } from "@/lib/cn";

/*
 * Gửi biên bản và giao việc, ba bước luôn qua xem trước
 * (docs/03-screens.md mục 7, issue M3-04).
 * 1. Chọn người nhận (người tham gia + người nói đã đặt tên), thiếu email thì
 *    nhập ngay tại hàng; hai lựa chọn biên bản chung / việc riêng.
 * 2. Xem trước qua data.mail.preview: cuộn ngang có điểm dừng, sửa được
 *    tiêu đề và nội dung, phần AI soạn có viền điện, email việc có nút nghe lại.
 * 3. Xác nhận "Gửi cho N người", chờ 1,5 giây, ghi send_history.
 * Gói Free: bước 3 là "Sao chép nội dung" kèm ghi chú gói Pro.
 * Cờ "Gửi email lỗi một người": báo đúng người đó, có "Gửi lại".
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SEND_LANGS: readonly Lang[] = ["vi", "en", "ko"];
const LANG_NAME_KEY: Record<Lang, string> = { vi: "langVi", en: "langEn", ko: "langKo" };

export function SendMinutesSheet({
  session,
  contacts,
  plan,
  canPlay,
  onSeek,
  open,
  onOpenChange,
  defaultReportLang,
}: {
  session: SessionDetail;
  contacts: Contact[];
  plan: "free" | "pro";
  canPlay: boolean;
  onSeek: (time: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ngôn ngữ báo cáo mặc định (M6-04): người nhận không đặt ngôn ngữ ưa dùng thì theo đây */
  defaultReportLang: Lang;
}) {
  const t = useTranslations("sendMinutes");
  const ts = useTranslations("session");
  const tl = useTranslations(); // tên ngôn ngữ ở gốc (settings.langVi...)
  const toast = useToast();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<"minutes" | "tasks">("minutes");
  const [selected, setSelected] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState<Record<string, string>>({});
  // Lỗi email từng hàng: thiếu email (bắt buộc nhập) hoặc sai định dạng
  const [emailErrors, setEmailErrors] = useState<Record<string, "missing" | "invalid">>({});
  const [previews, setPreviews] = useState<EmailDraft[] | null>(null);
  // Ngôn ngữ từng người nhận (M6-04): mặc định theo liên hệ, đổi được tại hàng
  const [langById, setLangById] = useState<Record<string, Lang>>({});
  // Người nhận thêm từ Danh bạ ngoài người tham gia (M6-04): gửi biên bản cho
  // người không ngồi trong buổi cũng là nhu cầu thật
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [previewLang, setPreviewLang] = useState<Lang | null>(null);
  const [creatingLangs, setCreatingLangs] = useState<Lang[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string }>>({});
  const [sending, setSending] = useState(false);
  const [failures, setFailures] = useState<Array<{ contactId: string; name: string; draft: EmailDraft }>>([]);
  const [slide, setSlide] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const contactById = useMemo(() => Object.fromEntries(contacts.map((c) => [c.id, c])), [contacts]);

  // Người nhận: người tham gia buổi ghi + người nói đã đặt tên
  const recipientIds = useMemo(() => {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const id of session.participant_contact_ids) {
      if (!seen.has(id) && contactById[id]) {
        seen.add(id);
        ids.push(id);
      }
    }
    for (const sp of session.speakers) {
      if (sp.contact_id && !seen.has(sp.contact_id) && contactById[sp.contact_id]) {
        seen.add(sp.contact_id);
        ids.push(sp.contact_id);
      }
    }
    return ids;
  }, [session, contactById]);

  const allRecipientIds = useMemo(() => [...recipientIds, ...extraIds], [recipientIds, extraIds]);

  // Mỗi lần mở bảng: đặt lại về bước 1 và chỉ tích sẵn người CÓ email
  // — người chưa có email phải được tích chủ động kèm nhập email
  // (làm lúc vẽ thay vì trong effect — bảng mở từ prop bên ngoài)
  const [prevOpen, setPrevOpen] = useState(false);
  if (open && !prevOpen) {
    setPrevOpen(true);
    setStep(1);
    setMode("minutes");
    setSelected(recipientIds.filter((id) => contactById[id]?.email));
    setEmailDraft({});
    setEmailErrors({});
    setExtraIds([]);
    setLangById(
      Object.fromEntries(
        recipientIds.map((id) => [id, contactById[id]?.preferred_language ?? defaultReportLang]),
      ),
    );
    setPreviews(null);
    setEdits({});
    setSending(false);
    setFailures([]);
    setSlide(0);
  } else if (!open && prevOpen) {
    setPrevOpen(false);
  }

  function resetAll() {
    setStep(1);
    setMode("minutes");
    setSelected([]);
    setEmailDraft({});
    setEmailErrors({});
    setPreviews(null);
    setEdits({});
    setSending(false);
    setFailures([]);
    setSlide(0);
  }
  void resetAll;

  function handleOpenChange(next: boolean) {
    if (!next) onOpenChange(next);
  }

  function emailOf(id: string) {
    return contactById[id]?.email ?? emailDraft[id]?.trim() ?? "";
  }

  function missingEmailIds() {
    return selected.filter((id) => !emailOf(id));
  }

  function invalidEmailIds() {
    return selected.filter((id) => {
      const email = emailOf(id);
      return !!email && !EMAIL_RE.test(email);
    });
  }

  function clearEmailError(id: string) {
    setEmailErrors((e) => {
      if (!(id in e)) return e;
      const next = { ...e };
      delete next[id];
      return next;
    });
  }

  async function saveEmail(id: string) {
    const value = (emailDraft[id] ?? "").trim();
    if (!value) {
      clearEmailError(id);
      return;
    }
    if (!EMAIL_RE.test(value)) {
      setEmailErrors((e) => ({ ...e, [id]: "invalid" }));
      return;
    }
    clearEmailError(id);
    try {
      await data.account.updateContact(id, { email: value });
      toast.show({ tone: "success", message: t("emailSaved") });
    } catch {
      toast.show({ tone: "error", message: ts("saveError") });
    }
  }

  async function goPreview() {
    if (!selected.length) {
      toast.show({ tone: "error", message: t("noRecipients") });
      return;
    }
    // Người được tích phải có email hợp lệ: thiếu thì báo ngay tại hàng và không sang bước 2
    const missing = missingEmailIds();
    const invalid = invalidEmailIds();
    if (missing.length || invalid.length) {
      setEmailErrors(
        Object.fromEntries([
          ...missing.map((id) => [id, "missing" as const]),
          ...invalid.map((id) => [id, "invalid" as const]),
        ]),
      );
      return;
    }
    // Email vừa nhập: lưu vào liên hệ trước khi xem trước
    for (const id of selected) {
      const value = (emailDraft[id] ?? "").trim();
      if (value && EMAIL_RE.test(value) && contactById[id]?.email !== value) {
        try {
          await data.account.updateContact(id, { email: value });
        } catch {
          toast.show({ tone: "error", message: ts("saveError") });
          return;
        }
      }
    }
    setPreviewLoading(true);
    try {
      const result = await data.mail.preview(session.id, selected, mode);
      setPreviews(result);
      // Mở tab ngôn ngữ đầu tiên của danh sách người nhận (M6-04)
      setPreviewLang(result[0]?.lang ?? defaultReportLang);
      setStep(2);
    } catch {
      toast.show({ tone: "error", message: ts("saveError") });
    } finally {
      setPreviewLoading(false);
    }
  }

  function editedDraft(d: EmailDraft): EmailDraft {
    const e = edits[keyOf(d)];
    return e ? { ...d, subject: e.subject, body: e.body } : d;
  }

  function keyOf(d: EmailDraft) {
    return `${d.kind}:${d.to_contact_id}`;
  }

  async function send(draftList: EmailDraft[]) {
    const payload = draftList.map((d) => ({ ...editedDraft(d), session_id: session.id }));
    const results = await data.mail.send(payload);
    const okCount = results.filter((r) => r.ok).length;
    const failedIds = results.filter((r) => !r.ok).map((r) => r.contact_id);
    if (failedIds.length) {
      setFailures(
        failedIds.map((id) => ({
          contactId: id,
          name: contactById[id]?.name ?? id,
          draft: payload.filter((d) => d.to_contact_id === id)[0] ?? payload[0],
        })),
      );
      return okCount;
    }
    return okCount;
  }

  /** Ngôn ngữ người nhận đã chọn nhưng buổi chưa có bản tóm tắt (M6-04). */
  function missingVersionLangs(): Lang[] {
    const langs = new Set<Lang>(selected.map((id) => langById[id] ?? defaultReportLang));
    return [...langs].filter(
      (lang) => lang !== session.original_report_language && !session.report_languages.includes(lang),
    );
  }

  async function confirmSend() {
    if (!previews) return;
    setSending(true);
    setFailures([]);
    try {
      // Tạo bản tóm tắt còn thiếu trong lúc gửi (M6-04, màn xác nhận đã ghi rõ)
      const missing = missingVersionLangs();
      for (const lang of missing) {
        setCreatingLangs((list) => [...list, lang]);
        try {
          await data.sessions.createSummaryVersion(session.id, lang, () => undefined);
        } catch (e) {
          if (e instanceof DataError && e.code === "quota_exceeded") {
            toast.show({ tone: "error", message: tl("summary.limitTitle") });
          }
        }
        setCreatingLangs((list) => list.filter((l) => l !== lang));
      }
      // Giả lập thời gian gửi
      await new Promise((r) => setTimeout(r, 1500));
      const okCount = await send(previews);
      if (!failures.length && okCount === previews.length) {
        toast.show({ tone: "success", message: t("sent", { count: okCount }) });
        onOpenChange(false);
      } else if (okCount > 0) {
        toast.show({ tone: "success", message: t("sent", { count: okCount }) });
      }
    } catch {
      toast.show({ tone: "error", message: ts("saveError") });
    } finally {
      setSending(false);
    }
  }

  async function resendOne(f: { contactId: string; name: string; draft: EmailDraft }) {
    try {
      const results = await data.mail.send([{ ...editedDraft(f.draft), session_id: session.id }]);
      if (results.every((r) => r.ok)) {
        const left = failures.length - 1;
        setFailures((list) => list.filter((x) => x.contactId !== f.contactId));
        toast.show({ tone: "success", message: t("sent", { count: 1 }) });
        // Gửi đủ hết cho mọi người thì đóng bảng
        if (left === 0) onOpenChange(false);
      }
    } catch {
      toast.show({ tone: "error", message: ts("saveError") });
    }
  }

  async function copyAll() {
    if (!previews) return;
    const text = previews
      .map((d) => {
        const e = editedDraft(d);
        const name = contactById[d.to_contact_id]?.name ?? "";
        return `--- ${name} (${t(d.kind === "minutes" ? "minutesKind" : "tasksKind")}) ---\n${e.subject}\n\n${e.body}`;
      })
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ tone: "success", message: t("copiedAll") });
    } catch {
      toast.show({ tone: "error", message: ts("saveError") });
    }
  }

  function slideTo(i: number) {
    const clamped = Math.max(0, Math.min(i, (previews?.length ?? 1) - 1));
    setSlide(clamped);
    const track = trackRef.current;
    if (track) track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
  }

  const recipientsWithTasks = new Set(
    session.action_items.filter((a) => !a.done && a.assignee_contact_id).map((a) => a.assignee_contact_id as string),
  );

  // Nhóm người nhận theo ngôn ngữ cho tab xem trước (M6-04)
  const previewGroups = useMemo(() => {
    const order: Lang[] = [];
    const counts = new Map<Lang, number>();
    for (const id of selected) {
      const lg = langById[id] ?? defaultReportLang;
      if (!counts.has(lg)) order.push(lg);
      counts.set(lg, (counts.get(lg) ?? 0) + 1);
    }
    return order.map((lang) => ({ lang, recipients: counts.get(lang) ?? 0 }));
  }, [selected, langById, defaultReportLang]);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange} title={t("title")} size="full">
      {/* Bước 1: chọn người nhận */}
      {step === 1 ? (
        <div>
          <p className="text-small font-semibold text-ink-2">{t("step1")}</p>
          <div className="mt-3 flex flex-col gap-1">
            {allRecipientIds.map((id) => {
              const c = contactById[id];
              const checked = selected.includes(id);
              const email = c?.email ?? emailDraft[id] ?? "";
              const hasNoEmail = !c?.email;
              return (
                <div key={id} className="flex items-start gap-3 border-b border-line py-2.5">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    aria-label={c?.name}
                    onClick={() => {
                      setSelected((list) => (checked ? list.filter((x) => x !== id) : [...list, id]));
                      if (checked) clearEmailError(id);
                    }}
                    className="-m-2 flex size-11 shrink-0 items-center justify-center rounded-pill"
                  >
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-pill border-2 transition-colors ease-noteim duration-(--t-quick)",
                        checked ? "border-sen bg-sen text-on-sen" : "border-ink-3",
                      )}
                    >
                      {checked ? <Check aria-hidden={true} className="size-4" strokeWidth={2.5} /> : null}
                    </span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-body text-ink">{c?.name}</p>
                    {hasNoEmail ? (
                      <div className="mt-1">
                        <input
                          type="email"
                          value={emailDraft[id] ?? ""}
                          onChange={(e) => {
                            setEmailDraft((d) => ({ ...d, [id]: e.target.value }));
                            clearEmailError(id);
                          }}
                          onBlur={() => void saveEmail(id)}
                          placeholder={t("emailMissing")}
                          aria-invalid={!!emailErrors[id] || undefined}
                          className="min-h-11 w-full max-w-xs rounded-control border border-line bg-surface px-3 text-small text-ink placeholder:text-ink-3 aria-[invalid=true]:border-tag-risk focus:border-dien focus-visible:outline-none"
                        />
                        {emailErrors[id] ? (
                          <p role="alert" className="mt-1 text-small font-medium text-tag-risk">
                            {emailErrors[id] === "missing" ? t("emailRequiredRow", { name: c?.name ?? "" }) : t("emailInvalid")}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-small text-ink-3">{email}</p>
                    )}
                  </div>
                  {/* Ngôn ngữ nhận: mặc định theo liên hệ, đổi được tại hàng (M6-04) */}
                  <label className="shrink-0">
                    <span className="sr-only">{t("recipientLanguage")}</span>
                    <select
                      value={langById[id] ?? defaultReportLang}
                      onChange={(e) => setLangById((m2) => ({ ...m2, [id]: e.target.value as Lang }))}
                      aria-label={`${t("recipientLanguage")}: ${c?.name ?? ""}`}
                      className="h-9 rounded-pill border border-line bg-surface px-2.5 text-caption font-medium text-ink"
                    >
                      {SEND_LANGS.map((lg) => (
                        <option key={lg} value={lg}>
                          {tl(`settings.${LANG_NAME_KEY[lg]}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {mode === "tasks" && !recipientsWithTasks.has(id) ? (
                    <span className="shrink-0 text-caption text-ink-3">—</span>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Thêm người nhận từ Danh bạ (M6-04): người không tham gia buổi */}
          {(() => {
            const remaining = contacts.filter((c) => !allRecipientIds.includes(c.id) && contactById[c.id]);
            if (!remaining.length) return null;
            return (
              <div className="mt-3 flex items-center gap-2">
                <label className="text-small font-medium text-ink">
                  <span className="sr-only">{t("addRecipient")}</span>
                  <select
                    value=""
                    onChange={(e) => {
                      const id = e.target.value;
                      if (!id) return;
                      setExtraIds((list) => [...list, id]);
                      setLangById((m2) => ({ ...m2, [id]: contactById[id]?.preferred_language ?? defaultReportLang }));
                    }}
                    aria-label={t("addRecipient")}
                    className="h-11 rounded-control border border-dashed border-line bg-surface px-2 text-small text-ink-2"
                  >
                    <option value="">{t("addRecipient")}</option>
                    {remaining.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.preferred_language ? ` (${tl(`settings.${LANG_NAME_KEY[c.preferred_language]}`)})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            );
          })()}

          {/* Hai lựa chọn: biên bản chung / việc riêng cho từng người */}
          <div className="mt-4 flex flex-col gap-2">
            {(
              [
                { value: "minutes" as const, label: t("modeMinutes") },
                { value: "tasks" as const, label: t("modeTasks") },
              ]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                aria-pressed={mode === opt.value}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-control border px-3 text-left text-small",
                  mode === opt.value ? "border-sen bg-surface font-semibold text-ink" : "border-line bg-surface text-ink-2",
                )}
              >
                <span
                  aria-hidden={true}
                  className={cn(
                    "size-4 rounded-pill border-2",
                    mode === opt.value ? "border-sen bg-sen" : "border-ink-3",
                  )}
                />
                {opt.label}
              </button>
            ))}
          </div>

          <Button variant="primary" icon={ArrowRight} className="mt-4" loading={previewLoading} onClick={() => void goPreview()}>
            {t("nextPreview")}
          </Button>
        </div>
      ) : null}

      {/* Bước 2: xem trước từng email, cuộn ngang có điểm dừng */}
      {step === 2 ? (
        <div>
          <p className="text-small font-semibold text-ink-2">{t("step2")}</p>
          {previews && previews.length === 0 ? (
            <p className="mt-3 text-body text-ink-2">{t("noTaskEmails")}</p>
          ) : null}
          {previewLoading ? (
            <p className="mt-3 text-body text-ink-2">{t("sending")}</p>
          ) : null}
          {previews && previews.length > 0 ? (
            <>
              {/* Xem trước theo từng ngôn ngữ: "Tiếng Việt (3 người)" (M6-04) */}
              {previewGroups.length > 1 ? (
                <div role="tablist" aria-label={t("recipientLanguage")} className="mt-2 flex flex-wrap gap-2">
                  {previewGroups.map((g) => (
                    <button
                      key={g.lang}
                      type="button"
                      role="tab"
                      aria-selected={previewLang === g.lang}
                      onClick={() => (setPreviewLang(g.lang), setSlide(0))}
                      className={cn(
                        "h-9 rounded-pill border px-3 text-caption font-medium transition-colors ease-noteim duration-(--t-quick)",
                        previewLang === g.lang ? "border-sen bg-sen/10 text-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
                      )}
                    >
                      {t("previewGroup", { lang: tl(`settings.${LANG_NAME_KEY[g.lang]}`), count: g.recipients })}
                    </button>
                  ))}
                </div>
              ) : null}
              <div
                ref={trackRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  setSlide(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
                }}
                className="mt-3 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none]"
              >
                {previews.filter((d) => !previewLang || d.lang === previewLang).map((d) => {
                  const e = editedDraft(d);
                  const key = keyOf(d);
                  const items =
                    d.kind === "tasks"
                      ? session.action_items.filter((a) => !a.done && a.assignee_contact_id === d.to_contact_id)
                      : [];
                  return (
                    <article
                      key={key}
                      className="w-[86%] max-w-[420px] shrink-0 snap-center rounded-block border border-line bg-bg p-3"
                      aria-label={`${contactById[d.to_contact_id]?.name}: ${t(d.kind === "minutes" ? "minutesKind" : "tasksKind")}`}
                    >
                      <div className="text-caption text-ink-3">
                        {/* Tên trên, loại email dưới — không ghép bằng gạch ngang dài */}
                        <p className="font-medium text-ink-2">{contactById[d.to_contact_id]?.name}</p>
                        <p>{t(d.kind === "minutes" ? "minutesKind" : "tasksKind")}</p>
                      </div>
                      <input
                        value={e.subject}
                        onChange={(ev) => setEdits((m) => ({ ...m, [key]: { ...e, subject: ev.target.value } }))}
                        aria-label={ts("edit")}
                        className="mt-2 min-h-11 w-full rounded-control border border-line bg-surface px-2 text-small font-semibold text-ink focus:border-dien focus-visible:outline-none"
                      />
                      {/* Phần do AI soạn: viền điện */}
                      <div className="mt-2 rounded-control border border-dien p-2">
                        <p className="mb-1 flex items-center gap-1 text-caption font-medium text-dien">
                          <span aria-hidden={true} className="size-1.5 rounded-pill bg-dien" />
                          {t("aiDraft")}
                        </p>
                        <textarea
                          value={e.body}
                          onChange={(ev) => setEdits((m) => ({ ...m, [key]: { ...e, body: ev.target.value } }))}
                          rows={Math.min(10, Math.max(4, e.body.split("\n").length + 2))}
                          aria-label={ts("edit")}
                          className="w-full resize-none rounded-control bg-transparent text-small text-ink focus-visible:outline-none"
                        />
                      </div>
                      {d.kind === "tasks" ? (
                        <ul className="mt-2 flex flex-col gap-1.5">
                          {items.map((a) => (
                            <li key={a.id} className="text-small text-ink-2">
                              <span className="font-medium text-ink">{a.task}</span>
                              {a.due_date ? `, ${shortDate(a.due_date, langById[d.to_contact_id] ?? defaultReportLang)}` : ""}
                              {a.source_quote ? (
                                <span className="mt-0.5 block border-l-2 border-line pl-2 text-caption text-ink-3">
                                  “{a.source_quote}”
                                  {canPlay && a.timestamp_sec !== null ? (
                                    <button
                                      type="button"
                                      onClick={() => onSeek(a.timestamp_sec!)}
                                      className="ml-2 inline-flex min-h-6 items-center font-medium text-sen-text hover:underline"
                                    >
                                      {t("replay")} ({formatClock(a.timestamp_sec)})
                                    </button>
                                  ) : null}
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </article>
                  );
                })}
              </div>
              {/* Chấm chỉ vị trí */}
              <div className="mt-1 flex items-center justify-center gap-1.5" aria-hidden={true}>
                {previews.filter((d) => !previewLang || d.lang === previewLang).map((d, i) => (
                  <span key={keyOf(d)} className={cn("size-1.5 rounded-pill", i === slide ? "bg-ink" : "bg-line")} />
                ))}
              </div>
              <div className="mt-2 hidden items-center justify-center gap-2 lg:flex">
                <Button variant="ghost" icon={ArrowLeft} onClick={() => slideTo(slide - 1)} disabled={slide === 0}>
                  {t("back")}
                </Button>
                <Button variant="ghost" icon={ArrowRight} onClick={() => slideTo(slide + 1)} disabled={slide >= previews.filter((d) => !previewLang || d.lang === previewLang).length - 1}>
                  {t("nextConfirm")}
                </Button>
              </div>
            </>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep(1)}>
              {t("back")}
            </Button>
            {previews && previews.length > 0 ? (
              <Button variant="primary" icon={ArrowRight} onClick={() => setStep(3)}>
                {t("nextConfirm")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Bước 3: xác nhận */}
      {step === 3 ? (
        <div>
          <p className="text-small font-semibold text-ink-2">{t("step3")}</p>

          {/* Bản còn thiếu sẽ tạo trong lúc gửi (M6-04) */}
          {missingVersionLangs().map((lg) => (
            <p key={lg} className="mt-2 flex items-center gap-2 text-small text-dien">
              <Languages aria-hidden={true} className="size-4 shrink-0" strokeWidth={1.75} />
              {creatingLangs.includes(lg) ? tl("sendMinutes.willCreate", { lang: tl(`settings.${LANG_NAME_KEY[lg]}`) }) : t("willCreate", { lang: tl(`settings.${LANG_NAME_KEY[lg]}`) })}
            </p>
          ))}

          {failures.length ? (
            <div className="mt-3 rounded-block border border-line bg-surface p-3" role="alert">
              {failures.map((f) => (
                <div key={f.contactId} className="flex items-center gap-2 py-1">
                  <TriangleAlert aria-hidden={true} className="size-4 shrink-0 text-tag-risk" strokeWidth={2} />
                  <p className="min-w-0 flex-1 text-small text-ink">{t("failedFor", { name: f.name })}</p>
                  <Button variant="secondary" className="h-9" onClick={() => void resendOne(f)}>
                    {t("resend")}
                  </Button>
                </div>
              ))}
              <p className="mt-1 text-caption text-ink-3">{t("sent", { count: previews!.length - failures.length })}</p>
            </div>
          ) : null}

          {plan === "pro" ? (
            <Button variant="primary" icon={Send} className="mt-4" loading={sending} onClick={() => void confirmSend()}>
              {sending ? t("sending") : t("sendTo", { count: previews?.length ?? selected.length })}
            </Button>
          ) : (
            <>
              <Button variant="secondary" icon={ClipboardCopy} className="mt-4" onClick={() => void copyAll()}>
                {t("copyAll")}
              </Button>
              <p className="mt-2 text-small text-ink-3">{t("freeNote")}</p>
            </>
          )}

          <Button variant="ghost" icon={ArrowLeft} className="mt-4" onClick={() => setStep(2)}>
            {t("back")}
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}
