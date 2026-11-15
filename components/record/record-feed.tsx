"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Flag } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatClock } from "@/components/ribbon/draw";
import { TagChip, type SemanticTag } from "@/components/ui/chips";
import { cn } from "@/lib/cn";
import { loadPhoto } from "@/lib/record/photo-store";
import type { RecordingPhoto, RecordingSnapshot } from "@/lib/record/recording-store";

/*
 * Ô ghi chú và danh sách ghi chú, điểm nóng, ảnh trong lúc ghi
 * (docs/03-screens.md mục 3): mỗi lần xuống dòng tạo một ghi chú gắn mốc
 * hiện tại; danh sách xếp theo mốc thời gian, mới nhất ở dưới, tự cuộn.
 */

type FeedItem =
  | { kind: "note"; id: string; time: number; text: string }
  | { kind: "bookmark"; id: string; time: number; tag: SemanticTag | null }
  | { kind: "photo"; id: string; time: number; url: string };

function mergeFeed(recording: RecordingSnapshot): FeedItem[] {
  const items: FeedItem[] = [
    ...recording.notes.map((n) => ({ kind: "note" as const, id: n.id, time: n.timestamp_sec, text: n.text })),
    ...recording.bookmarks.map((b) => ({ kind: "bookmark" as const, id: b.id, time: b.timestamp_sec, tag: b.tag })),
    ...recording.photos.map((p: RecordingPhoto) => ({ kind: "photo" as const, id: p.id, time: p.timestamp_sec, url: p.url })),
  ];
  return items.sort((a, b) => a.time - b.time);
}

/* Ảnh trong danh sách: vừa chụp thì có url sẵn; buổi ghi khôi phục sau khi
 * tải lại thì url rỗng (localStorage chỉ giữ id), đọc pixel từ IndexedDB. */
function FeedPhoto({ id, url, alt }: { id: string; url: string; alt: string }) {
  const [fromIdb, setFromIdb] = useState<string | null>(null);
  useEffect(() => {
    if (url) return;
    let alive = true;
    void loadPhoto(id).then((found) => {
      if (alive && found) setFromIdb(found);
    });
    return () => {
      alive = false;
    };
  }, [id, url]);
  const src = url || fromIdb;
  if (!src) {
    return <span aria-hidden={true} className="h-14 w-14 shrink-0 rounded-block bg-surface-2" />;
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={src} alt={alt} className="h-14 rounded-block object-cover" />
  );
}

export function RecordFeed({
  recording,
  tagLabels,
  onAddNote,
  className,
}: {
  recording: RecordingSnapshot;
  tagLabels: Record<SemanticTag, string>;
  /** Mỗi lần xuống dòng là một ghi chú mới gắn mốc hiện tại */
  onAddNote: (text: string) => void;
  className?: string;
}) {
  const t = useTranslations("record");
  const listRef = useRef<HTMLUListElement>(null);
  const [draft, setDraft] = useState("");
  const items = mergeFeed(recording);

  // Mục mới nhất nằm dưới: cuộn tới ngay khi có mục mới (cuộn tức thời,
  // trang bật cuộn mượt — xem bài học trong AGENTS.md)
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "instant" });
  }, [items.length]);

  function submit() {
    const text = draft.trim();
    if (!text) return;
    onAddNote(text);
    setDraft("");
  }

  return (
    <div className={cn("w-full rounded-block border border-line bg-surface/60 p-3", className)}>
      <ul ref={listRef} aria-label={t("feedLabel")} className="flex max-h-36 flex-col gap-2.5 overflow-y-auto">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2.5">
            <span className="w-11 shrink-0 pt-0.5 text-caption tabular-nums text-ink-3">{formatClock(item.time)}</span>
            {item.kind === "note" ? (
              <p className="min-w-0 flex-1 text-body text-ink">{item.text}</p>
            ) : item.kind === "bookmark" ? (
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <Flag aria-hidden={true} className="size-4 shrink-0 text-sen" strokeWidth={1.75} />
                <span className="text-body text-ink">{t("bookmarkWord")}</span>
                {item.tag ? <TagChip size="sm" tag={item.tag} label={tagLabels[item.tag]} /> : null}
              </span>
            ) : (
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <Camera aria-hidden={true} className="size-4 shrink-0 text-ink-2" strokeWidth={1.75} />
                {/* Ảnh người dùng vừa chụp, đã thu nhỏ còn cạnh dài 640px,
                    pixel nằm ở IndexedDB (PR #22, lỗi 3) */}
                <FeedPhoto id={item.id} url={item.url} alt={t("photoAlt", { time: formatClock(item.time) })} />
              </span>
            )}
          </li>
        ))}
      </ul>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        aria-label={t("noteAria")}
        placeholder={t("notePlaceholder")}
        className="mt-1 h-11 w-full bg-transparent px-1 text-body text-ink placeholder:text-ink-3 focus-visible:outline-none"
      />
    </div>
  );
}
