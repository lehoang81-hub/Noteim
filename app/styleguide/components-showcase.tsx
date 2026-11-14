"use client";

import { Share2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AiBlock } from "@/components/session/ai-block";
import { SessionRow } from "@/components/session/session-row";
import { SummaryBullet, UserNote } from "@/components/session/summary-bullet";
import { TaskRow } from "@/components/session/task-row";
import { Button } from "@/components/ui/button";
import { FilterChip, SpeakerName, TagChip, type SemanticTag } from "@/components/ui/chips";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Banner, EmptyState, SkeletonParagraph, SkeletonRow } from "@/components/ui/feedback";
import { SearchField, Switch, Tabs, TabsContent, TabsList, TabsTrigger, TextField } from "@/components/ui/form";
import { RecordButton, type RecordState } from "@/components/ui/record-button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { sampleRibbon } from "./sample-ribbon";

/*
 * Trưng bày toàn bộ component trên /styleguide, mỗi cái một khối,
 * đủ biến thể và trạng thái, bấm thử được.
 * Dữ liệu ở đây là chữ mẫu cho trang trưng bày, không phải dữ liệu ứng dụng.
 */

function Block({ name, desc, children }: { name: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line pb-2 pt-6 first:border-t-0 first:pt-0">
      <h3 className="text-body-strong font-semibold text-ink">{name}</h3>
      <p className="mt-0.5 max-w-[62ch] text-small text-ink-2">{desc}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Cell({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <figure className={className}>
      <div className="flex min-h-11 flex-wrap items-center gap-3">{children}</div>
      <figcaption className="mt-1.5 text-caption text-ink-3">{label}</figcaption>
    </figure>
  );
}

const tags: SemanticTag[] = ["decided", "pending", "risk", "idea", "figure"];

export function ComponentsShowcase() {
  const t = useTranslations("styleguide.components");
  const tl = useTranslations("styleguide.tags");
  const tui = useTranslations("ui");
  const toast = useToast();

  const [rec, setRec] = useState<RecordState>("idle");
  const [filter, setFilter] = useState("all");
  const [playing, setPlaying] = useState("b2");
  const [done, setDone] = useState<Record<string, boolean>>({ t4: true });
  const [aiRun, setAiRun] = useState(0);
  const [sheet, setSheet] = useState<"half" | "full" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [query, setQuery] = useState("");
  const [sw1, setSw1] = useState(true);
  const [sw2, setSw2] = useState(false);

  const recLabel = { idle: t("record.idle"), recording: t("record.recording"), paused: t("record.paused") };
  const nextRec: Record<RecordState, RecordState> = { idle: "recording", recording: "paused", paused: "recording" };
  const toggleTask = (id: string) => setDone((d) => ({ ...d, [id]: !d[id] }));

  return (
    <div className="flex flex-col gap-6">
      {/* Nút */}
      <Block name={t("button.name")} desc={t("button.desc")}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          <Cell label={t("button.lPrimary")}>
            <Button variant="primary">{t("button.primary")}</Button>
          </Cell>
          <Cell label={t("button.lSecondary")}>
            <Button variant="secondary">{t("button.secondary")}</Button>
          </Cell>
          <Cell label={t("button.lGhost")}>
            <Button variant="ghost">{t("button.ghost")}</Button>
          </Cell>
          <Cell label={t("button.lAi")}>
            <Button variant="ai" icon={Sparkles}>
              {t("button.ai")}
            </Button>
          </Cell>
          <Cell label={t("button.lDanger")}>
            <Button variant="danger">{t("button.danger")}</Button>
          </Cell>
          <Cell label={t("button.lLoading")}>
            <Button variant="primary" loading>
              {t("button.primary")}
            </Button>
          </Cell>
          <Cell label={t("button.lDisabled")}>
            <Button variant="primary" disabled>
              {t("button.primary")}
            </Button>
          </Cell>
          <Cell label={t("button.lIcon")}>
            <Button variant="secondary" icon={Share2} iconOnly aria-label={t("button.share")} />
          </Cell>
        </div>
      </Block>

      {/* Nút ghi âm */}
      <Block name={t("record.name")} desc={t("record.desc")}>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-5">
          <Cell label={t("record.lIdle")}>
            <RecordButton label={recLabel.idle} state="idle" />
          </Cell>
          <Cell label={t("record.lRecording")}>
            <RecordButton label={recLabel.recording} state="recording" />
          </Cell>
          <Cell label={t("record.lPaused")}>
            <RecordButton label={recLabel.paused} state="paused" />
          </Cell>
          <Cell label={t("record.lTry")}>
            <RecordButton size={88} state={rec} label={recLabel[rec]} onClick={() => setRec(nextRec[rec])} />
          </Cell>
        </div>
      </Block>

      {/* Nhãn, chip, người nói */}
      <Block name={t("chips.name")} desc={t("chips.desc")}>
        <div className="flex flex-col gap-5">
          <Cell label={t("chips.lTags")}>
            {tags.map((tag) => (
              <TagChip key={tag} tag={tag} label={tl(tag)} />
            ))}
          </Cell>
          <Cell label={t("chips.lFilter")}>
            {(["all", "week", "open"] as const).map((id) => (
              <FilterChip key={id} selected={filter === id} onClick={() => setFilter(id)}>
                {t(`chips.${id}`)}
              </FilterChip>
            ))}
          </Cell>
          <Cell label={t("chips.lSpeakers")}>
            <SpeakerName colorIndex={0} name={t("chips.me")} />
            <SpeakerName colorIndex={1} name={t("chips.lan")} />
            <SpeakerName colorIndex={2} name={t("chips.unnamed")} named={false} />
          </Cell>
        </div>
      </Block>

      {/* Hàng buổi ghi */}
      <Block name={t("row.name")} desc={t("row.desc")}>
        <div className="grid lg:grid-cols-2 lg:gap-x-8">
          {(
            [
              ["ready", "title1", "lReady"],
              ["processing", "title2", "lProcessing"],
              ["failed", "title3", "lFailed"],
              ["essence", "title4", "lEssence"],
              ["unsynced", "title5", "lUnsynced"],
            ] as const
          ).map(([status, title, label]) => (
            <figure key={status}>
              <SessionRow
                href="#components"
                title={t(`row.${title}`)}
                duration={t("row.duration")}
                template={t("row.template1")}
                peaks={sampleRibbon.peaks}
                speakers={sampleRibbon.speakers}
                status={status}
                statusText={status === "ready" ? undefined : t(`row.${status}`)}
                tag={status === "ready" ? { tag: "pending", label: t("row.tag1") } : undefined}
                action={
                  status === "failed" ? (
                    <Button variant="ghost" className="-my-2 h-9">
                      {tui("retry")}
                    </Button>
                  ) : undefined
                }
              />
              <figcaption className="mt-1 text-caption text-ink-3">{t(`row.${label}`)}</figcaption>
            </figure>
          ))}
        </div>
      </Block>

      {/* Ý tóm tắt */}
      <Block name={t("bullet.name")} desc={t("bullet.desc")}>
        <div className="max-w-[62ch]">
          {(
            [
              ["b1", "02:05", 1],
              ["b2", "04:30", 1],
              ["b3", "11:20", 1],
            ] as const
          ).map(([id, time, speaker]) => (
            <SummaryBullet
              key={id}
              text={t(`bullet.${id}`)}
              time={time}
              speakerColorIndex={speaker}
              playing={playing === id}
              editedLabel={id === "b1" ? t("bullet.edited") : undefined}
              seekLabel={t("bullet.seek")}
              onSeek={() => setPlaying(id)}
            >
              {id === "b3" ? <UserNote label={t("bullet.noteLabel")}>{t("bullet.note")}</UserNote> : null}
            </SummaryBullet>
          ))}
        </div>
      </Block>

      {/* Việc cần làm */}
      <Block name={t("task.name")} desc={t("task.desc")}>
        <div className="max-w-[62ch]">
          <TaskRow
            task={t("task.t1")}
            done={!!done.t1}
            onToggle={() => toggleTask("t1")}
            toggleLabel={t("task.toggle")}
            assignee={t("task.me")}
            unassignedLabel={t("task.unassigned")}
            due={t("task.due1")}
            priority={t("task.high")}
            quote={t("task.q1")}
            time="27:40"
            seekLabel={t("task.seek")}
          />
          <TaskRow
            task={t("task.t2")}
            done={!!done.t2}
            onToggle={() => toggleTask("t2")}
            toggleLabel={t("task.toggle")}
            unassignedLabel={t("task.unassigned")}
          />
          <TaskRow
            task={t("task.t3")}
            done={!!done.t3}
            onToggle={() => toggleTask("t3")}
            toggleLabel={t("task.toggle")}
            assignee={t("task.tuan")}
            unassignedLabel={t("task.unassigned")}
            due={t("task.due3")}
            overdue
            time="35:12"
            seekLabel={t("task.seek")}
          />
          <TaskRow
            task={t("task.t4")}
            done={!!done.t4}
            onToggle={() => toggleTask("t4")}
            toggleLabel={t("task.toggle")}
            assignee={t("task.tuan")}
            unassignedLabel={t("task.unassigned")}
            due={t("task.done4")}
          />
        </div>
      </Block>

      {/* Khối AI */}
      <Block name={t("ai.name")} desc={t("ai.desc")}>
        <div className="grid gap-5 lg:grid-cols-3">
          <figure>
            <AiBlock key={aiRun} state="writing" label={t("ai.label")} text={t("ai.answer")} />
            <figcaption className="mt-1.5 flex items-center justify-between text-caption text-ink-3">
              {t("ai.lWriting")}
              <Button variant="ghost" className="-my-2 h-9" onClick={() => setAiRun((n) => n + 1)}>
                {t("ai.replay")}
              </Button>
            </figcaption>
          </figure>
          <figure>
            <AiBlock
              state="done"
              label={t("ai.label")}
              text={t("ai.answer")}
              citations={["04:30", "15:12"]}
              citationLabel={t("ai.cite")}
            />
            <figcaption className="mt-1.5 text-caption text-ink-3">{t("ai.lDone")}</figcaption>
          </figure>
          <figure>
            <AiBlock
              state="error"
              label={t("ai.label")}
              text=""
              errorText={t("ai.error")}
              retryLabel={tui("retry")}
              onRetry={() => setAiRun((n) => n + 1)}
            />
            <figcaption className="mt-1.5 text-caption text-ink-3">{t("ai.lError")}</figcaption>
          </figure>
        </div>
      </Block>

      {/* Bảng trượt */}
      <Block name={t("sheet.name")} desc={t("sheet.desc")}>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setSheet("half")}>{t("sheet.openHalf")}</Button>
          <Button onClick={() => setSheet("full")}>{t("sheet.openFull")}</Button>
        </div>
        <Sheet
          open={sheet === "half"}
          onOpenChange={(o) => setSheet(o ? "half" : null)}
          title={t("sheet.halfTitle")}
          description={t("sheet.halfDesc")}
          footer={
            <Button variant="primary" block onClick={() => setSheet(null)}>
              {t("sheet.save")}
            </Button>
          }
        >
          <div className="flex flex-col gap-3 pt-1">
            <SpeakerName colorIndex={0} name={t("chips.me")} />
            <SpeakerName colorIndex={1} name={t("chips.lan")} />
            <SpeakerName colorIndex={2} name={t("chips.unnamed")} named={false} />
          </div>
        </Sheet>
        <Sheet
          open={sheet === "full"}
          onOpenChange={(o) => setSheet(o ? "full" : null)}
          title={t("sheet.fullTitle")}
          description={t("sheet.fullDesc")}
          size="full"
          footer={
            <Button variant="primary" block onClick={() => setSheet(null)}>
              {t("sheet.send")}
            </Button>
          }
        >
          <p className="whitespace-pre-line text-body text-ink">{t("sheet.body")}</p>
        </Sheet>
      </Block>

      {/* Thông báo nhanh */}
      <Block name={t("toast.name")} desc={t("toast.desc")}>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => toast.show({ tone: "success", message: t("toast.success") })}>{t("toast.bSuccess")}</Button>
          <Button onClick={() => toast.show({ tone: "error", message: t("toast.error") })}>{t("toast.bError")}</Button>
          <Button
            onClick={() =>
              toast.show({ tone: "success", message: t("toast.undoMsg"), action: { label: tui("undo"), onClick: () => {} } })
            }
          >
            {t("toast.bUndo")}
          </Button>
        </div>
      </Block>

      {/* Hộp xác nhận */}
      <Block name={t("confirm.name")} desc={t("confirm.desc")}>
        <Button variant="danger" onClick={() => setConfirm(true)}>
          {t("confirm.open")}
        </Button>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={t("confirm.title")}
          cancelLabel={t("confirm.cancel")}
          confirmLabel={t("confirm.confirm")}
          onConfirm={() => toast.show({ tone: "success", message: t("confirm.done") })}
        >
          <p>{t("confirm.lose")}</p>
          <p className="mt-1">{t("confirm.keep")}</p>
          <p className="mt-2 font-medium text-ink">{t("confirm.final")}</p>
        </ConfirmDialog>
      </Block>

      {/* Dải báo */}
      <Block name={t("banner.name")} desc={t("banner.desc")}>
        <div className="-mx-page flex flex-col gap-2 sm:mx-0 sm:overflow-hidden sm:rounded-control">
          <Banner kind="offline">{t("banner.offline")}</Banner>
          <Banner kind="quota">{t("banner.quota")}</Banner>
          <Banner
            kind="expiring"
            action={
              <button type="button" className="-my-2 inline-flex h-10 items-center px-1 font-semibold underline underline-offset-2">
                {t("banner.keep")}
              </button>
            }
          >
            {t("banner.expiring")}
          </Banner>
        </div>
      </Block>

      {/* Rỗng và chờ tải */}
      <Block name={t("empty.name")} desc={t("empty.desc")}>
        <div className="grid gap-6 lg:grid-cols-2">
          <figure className="rounded-block border border-line">
            <EmptyState message={t("empty.message")} action={<Button variant="primary">{t("empty.action")}</Button>} />
            <figcaption className="border-t border-line px-4 py-2 text-caption text-ink-3">{t("empty.lEmpty")}</figcaption>
          </figure>
          <div className="flex flex-col gap-4">
            <figure>
              <SkeletonRow />
              <SkeletonRow />
              <figcaption className="mt-1.5 text-caption text-ink-3">{t("empty.lRow")}</figcaption>
            </figure>
            <figure>
              <SkeletonParagraph />
              <figcaption className="mt-1.5 text-caption text-ink-3">{t("empty.lPara")}</figcaption>
            </figure>
          </div>
        </div>
      </Block>

      {/* Ô nhập, tìm kiếm, công tắc, tab */}
      <Block name={t("form.name")} desc={t("form.desc")}>
        <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
          <TextField label={t("form.title")} defaultValue={t("form.titleValue")} hint={t("form.titleHint")} />
          <TextField label={t("form.email")} defaultValue={t("form.emailValue")} error={t("form.emailError")} type="email" />
          <SearchField
            value={query}
            onChange={setQuery}
            label={t("form.search")}
            clearLabel={tui("clearSearch")}
            placeholder={t("form.searchPh")}
          />
          <div className="divide-y divide-line">
            <Switch checked={sw1} onCheckedChange={setSw1} label={t("form.sw1")} description={t("form.sw1d")} />
            <Switch checked={sw2} onCheckedChange={setSw2} label={t("form.sw2")} />
          </div>
          <div className="lg:col-span-2">
            <Tabs defaultValue="summary">
              <TabsList label={t("form.tabs")}>
                {(["summary", "tasks", "transcript", "visual", "ai"] as const).map((id) => (
                  <TabsTrigger key={id} value={id}>
                    {t(`form.t${id === "ai" ? "Ai" : id[0].toUpperCase() + id.slice(1)}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
              {(["summary", "tasks", "transcript", "visual", "ai"] as const).map((id) => (
                <TabsContent key={id} value={id} className="pt-3 text-small text-ink-2">
                  {t(`form.p${id === "ai" ? "Ai" : id[0].toUpperCase() + id.slice(1)}`)}
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </div>
      </Block>
    </div>
  );
}
