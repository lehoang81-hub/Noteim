"use client";

import { HardHat, Handshake, Scale, Stethoscope } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, SkeletonRow } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { data, useData, type Folder, type FolderKind, type Session } from "@/lib/data";
import { durationParts } from "@/lib/format";

/*
 * Danh sách hồ sơ trong Thư viện (góp ý vòng 1, #75): gom buổi ghi theo
 * vụ việc (luật sư), bệnh nhân (bác sĩ), khách hàng (môi giới), công trình
 * (kiến trúc sư). Hàng hồ sơ đếm sẵn số buổi, thời lượng và việc còn mở
 * (gom từ các buổi con) để chọn đúng hồ sơ cần xử trước.
 */

export const FOLDER_KINDS: FolderKind[] = ["legal_case", "patient", "client", "project"];

/** Biểu tượng theo loại hồ sơ: cân (vụ việc), ống nghe (bệnh nhân), bắt tay (khách hàng), mũ bảo hộ (công trình). */
export function FolderKindIcon({ kind, className }: { kind: FolderKind; className?: string }) {
  if (kind === "legal_case") return <Scale aria-hidden={true} className={className} strokeWidth={1.75} />;
  if (kind === "patient") return <Stethoscope aria-hidden={true} className={className} strokeWidth={1.75} />;
  if (kind === "client") return <Handshake aria-hidden={true} className={className} strokeWidth={1.75} />;
  return <HardHat aria-hidden={true} className={className} strokeWidth={1.75} />;
}

/** Loại hồ sơ gợi ý theo nghề của người dùng (môi giới mặc định khách hàng). */
export function defaultKindFor(profession: string | undefined): FolderKind {
  if (profession === "lawyer") return "legal_case";
  if (profession === "doctor") return "patient";
  if (profession === "architect") return "project";
  return "client";
}

export function FolderList({ className }: { className?: string }) {
  const t = useTranslations("folders");
  const tl = useTranslations("library");
  const router = useRouter();
  const folders = useData(() => data.folders.list(), []);
  const sessions = useData(() => data.sessions.list(), []);
  const me = useData(() => data.account.me(), []);
  const [creating, setCreating] = useState(false);
  const [creatingOnce, setCreatingOnce] = useState(false);
  if (creating && !creatingOnce) setCreatingOnce(true);

  const sessionById = new Map<string, Session>((sessions.data ?? []).map((s) => [s.id, s]));

  function folderMeta(folder: Folder) {
    const items = folder.session_ids.map((id) => sessionById.get(id)).filter(Boolean) as Session[];
    const minutes = items.reduce((n, s) => n + s.duration_sec, 0);
    const { h, m } = durationParts(minutes);
    const duration = h > 0 ? tl("hours", { h, m: String(m).padStart(2, "0") }) : tl("minutes", { m });
    const tasks = items.reduce((n, s) => n + s.open_task_count, 0);
    return {
      count: t("sessionsCount", { count: items.length }),
      duration,
      tasks: tasks > 0 ? t("openTasks", { count: tasks }) : undefined,
    };
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="px-page pb-3">
        <h1 className="font-display text-h1 font-semibold text-ink">{t("title")}</h1>
        <p className="mt-0.5 text-small text-ink-2">{t("subtitle")}</p>
      </div>

      {folders.initialLoading ? (
        <div className="px-page">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : folders.error && !folders.data ? (
        <EmptyState drawing={<span />} message={t("loadError")} action={<Button onClick={folders.reload}>{t("retry")}</Button>} />
      ) : (folders.data ?? []).length === 0 ? (
        <EmptyState
          message={t("empty")}
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              {t("createAction")}
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col">
          {(folders.data ?? []).map((f) => {
            const meta = folderMeta(f);
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/f/${f.id}`)}
                  className="flex w-full items-start gap-3 border-b border-line px-page py-3 text-left transition-colors ease-noteim duration-(--t-quick) hover:bg-surface-2"
                >
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-pill bg-surface-2 text-ink-2">
                    <FolderKindIcon kind={f.kind} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-body-strong font-semibold text-ink">{f.name}</span>
                      {f.ref ? <span className="text-caption tabular-nums text-ink-3">{f.ref}</span> : null}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-ink-3">
                      <span>{t(`kind.${f.kind}`)}</span>
                      <span>
                        {meta.count}, {meta.duration}
                        {meta.tasks ? `, ${meta.tasks}` : ""}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="px-page pb-6 pt-3">
        <Button variant="secondary" block onClick={() => setCreating(true)}>
          {t("createAction")}
        </Button>
      </div>

      {creatingOnce ? <CreateFolderSheet open={creating} onOpenChange={setCreating} defaultKind={defaultKindFor(me.data?.profession)} /> : null}
    </div>
  );
}

export function CreateFolderSheet({
  open,
  onOpenChange,
  defaultKind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultKind: FolderKind;
}) {
  const t = useTranslations("folders");
  const ts = useTranslations("session");
  const toast = useToast();
  const router = useRouter();
  const [kind, setKind] = useState<FolderKind>(defaultKind);
  const [name, setName] = useState("");
  const [ref, setRef] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const clean = name.trim();
    if (!clean || saving) return;
    setSaving(true);
    try {
      const created = await data.folders.create({ kind, name: clean, ref: ref.trim() || undefined });
      onOpenChange(false);
      toast.show({ tone: "success", message: t("createdToast") });
      router.push(`/f/${created.id}`);
    } catch {
      toast.show({ tone: "error", message: t("createError") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t("createTitle")} size="half">
      <form
        className="flex flex-col gap-3 py-1"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset>
          <legend className="mb-1.5 text-small font-medium text-ink">{t("nameLabel")}</legend>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={t("nameLabel")}
            placeholder={t("namePlaceholder")}
            className="h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink placeholder:text-ink-3 focus-visible:outline-none"
          />
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-small font-medium text-ink">{t("kindLabel")}</legend>
          <div role="radiogroup" aria-label={t("kindLabel")} className="flex flex-wrap gap-2">
            {FOLDER_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  "h-11 rounded-control border px-3 text-small font-medium transition-colors ease-noteim duration-(--t-quick)",
                  kind === k ? "border-sen bg-sen/10 text-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
                )}
              >
                {t(`kind.${k}`)}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-small font-medium text-ink">{t("refLabel")}</legend>
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            aria-label={t("refLabel")}
            placeholder={t("refPlaceholder")}
            className="h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink placeholder:text-ink-3 focus-visible:outline-none"
          />
        </fieldset>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
            {ts("cancel")}
          </Button>
          <Button variant="primary" type="submit" loading={saving} disabled={!name.trim()}>
            {t("save")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
