"use client";

import { ArrowLeft, FileAudio, FileVideo, TriangleAlert, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { data, useData } from "@/lib/data";
import { durationParts } from "@/lib/format";
import { takeImportFile } from "@/lib/import-file";
import { cn } from "@/lib/cn";

/*
 * Nhập file có sẵn (docs/03-screens.md mục 10, issue M4-02).
 * - Chọn hoặc kéo thả file âm thanh, video. Hiện tên, thời lượng (đọc bằng thẻ
 *   audio/video), dung lượng.
 * - Chọn mẫu (mặc định theo nghề), ngôn ngữ nói, "Tóm tắt file này" tạo buổi ghi
 *   rồi sang màn hình xử lý như M2.
 * - Lỗi: định dạng không hỗ trợ; dài hơn hạn mức phiên; vượt hạn mức tháng còn lại.
 * - File không được lưu hay tải lên (mockup), chỉ đọc thông tin.
 */

type Picked = {
  file: File;
  kind: "audio" | "video";
  durationSec: number | null; // null là chưa đọc được metadata
  sizeBytes: number;
};

const OK_EXT = /\.(mp3|m4a|wav|aac|ogg|oga|opus|flac|webm|mp4|mov|m4v|3gp)$/i;

function readDuration(file: File, kind: "audio" | "video"): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(kind);
    const url = URL.createObjectURL(file);
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(el.duration) ? el.duration : 0);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("metadata"));
    };
    el.src = url;
  });
}

export function ImportScreen() {
  const t = useTranslations("import");
  const tl = useTranslations("library");
  const ts = useTranslations("session");
  const toast = useToast();
  const router = useRouter();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);

  const me = useData(() => data.account.me(), []);
  const quota = useData(() => data.account.quota(), []);
  const templates = useData(() => data.account.templates(), []);
  const [templateId, setTemplateId] = useState("");
  const [language, setLanguage] = useState("vi");

  useEffect(() => {
    mounted.current = true;
    // File giữ từ lúc kéo thả ở thư viện (nếu có)
    const held = takeImportFile();
    if (held) void pick(held);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mặc định chọn mẫu theo nghề của người dùng. Chờ cả templates và me về rồi
  // mới đặt — nếu templates về trước mà đặt ngay sẽ chọn mẫu đầu tiên rồi giữ
  // nguyên mãi, bỏ qua default_template_id đã lưu theo nghề (review PR #35).
  // Đặt lúc vẽ theo khuyến nghị của React, không dùng effect.
  if (mounted.current && !templateId && templates.data && me.data) {
    setTemplateId(me.data.default_template_id || templates.data[0]?.id || "");
  }

  function durationLabel(sec: number): string {
    if (sec < 60) return tl("seconds", { s: Math.round(sec) });
    const { h, m } = durationParts(Math.round(sec));
    return h > 0 ? tl("hours", { h, m: String(m).padStart(2, "0") }) : tl("minutes", { m });
  }

  async function pick(file: File) {
    setError(null);
    const kind: "audio" | "video" | null = file.type.startsWith("audio/")
      ? "audio"
      : file.type.startsWith("video/")
        ? "video"
        : OK_EXT.test(file.name)
          ? "audio"
          : null;
    if (!kind) {
      setPicked(null);
      setError(t("badFormat", { name: file.name }));
      return;
    }
    const item: Picked = { file, kind, durationSec: null, sizeBytes: file.size };
    setPicked(item);
    try {
      const sec = await readDuration(file, kind);
      setPicked((p) => (p && p.file === file ? { ...p, durationSec: sec } : p));
    } catch {
      setPicked((p) => (p && p.file === file ? { ...p, durationSec: null } : p));
    }
  }

  function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void pick(f);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void pick(f);
  }

  const q = quota.data;
  const maxSessionSec = (q?.max_session_minutes ?? 45) * 60;
  const monthLeftSec = q ? (q.minutes_limit - q.minutes_used) * 60 : 0;
  const dur = picked?.durationSec ?? null;

  const tooLong = dur !== null && dur > maxSessionSec;
  const overMonth = !tooLong && dur !== null && dur > monthLeftSec;
  const ready = picked && dur !== null && !tooLong && !overMonth && templateId;

  async function start() {
    if (!picked || dur === null || !templateId) return;
    setBusy(true);
    try {
      const { id } = await data.sessions.createFromImport({
        file_name: picked.file.name,
        duration_sec: Math.round(dur),
        template_id: templateId,
        language,
      });
      toast.show({ tone: "success", message: t("imported") });
      router.push(`/s/${id}/processing`);
    } catch {
      toast.show({ tone: "error", message: ts("saveError") });
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl">
      <header className="flex min-h-14 items-center gap-1 px-page pt-2 lg:px-8 lg:pt-4">
        <Link
          href="/"
          aria-label={ts("back")}
          className="-ml-2 flex size-11 items-center justify-center rounded-control text-ink hover:bg-surface-2"
        >
          <ArrowLeft aria-hidden={true} className="size-5" strokeWidth={1.75} />
        </Link>
        <p className="flex-1 text-body-strong font-semibold text-ink">{t("title")}</p>
      </header>

      <div className="px-page pb-40 pt-4 lg:px-8">
        {!picked ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex min-h-56 w-full flex-col items-center justify-center gap-3 rounded-block border-2 border-dashed p-6 text-center transition-colors ease-noteim duration-(--t-quick)",
                dragOver ? "border-dien bg-dien-tint" : "border-line bg-surface hover:bg-surface-2",
              )}
            >
              <UploadCloud aria-hidden={true} className="size-10 text-ink-3" strokeWidth={1.5} />
              <span className="text-body font-semibold text-ink">{t("dropTitle")}</span>
              <span className="max-w-xs text-small text-ink-2">{t("dropHint")}</span>
            </button>
            <input ref={inputRef} type="file" accept="audio/*,video/*" onChange={onSelect} className="sr-only" aria-label={t("title")} />
          </div>
        ) : (
          <div>
            <div className="flex items-start gap-3 rounded-block border border-line bg-surface p-4">
              {picked.kind === "audio" ? (
                <FileAudio aria-hidden={true} className="mt-0.5 size-8 shrink-0 text-ink-2" strokeWidth={1.5} />
              ) : (
                <FileVideo aria-hidden={true} className="mt-0.5 size-8 shrink-0 text-ink-2" strokeWidth={1.5} />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-body-strong font-semibold text-ink">{picked.file.name}</p>
                <p aria-live="polite" className="mt-0.5 text-small text-ink-2">
                  {picked.durationSec === null
                    ? t("readingDuration")
                    : `${durationLabel(picked.durationSec)}, ${(picked.sizeBytes / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB`}
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  setPicked(null);
                  setError(null);
                }}
              >
                {ts("cancel")}
              </Button>
            </div>

            {tooLong ? (
              <BannerError>{t("tooLong", { duration: durationLabel(dur ?? 0), limit: q?.max_session_minutes ?? 45 })}</BannerError>
            ) : overMonth ? (
              <BannerError>{t("overMonth", { minutes: Math.floor(monthLeftSec / 60) })}</BannerError>
            ) : null}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-small font-medium text-ink">
                {t("templateLabel")}
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-control border border-line bg-surface px-2 text-small text-ink"
                >
                  {(templates.data ?? []).map((tp) => (
                    <option key={tp.id} value={tp.id}>
                      {tp.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-small font-medium text-ink">
                {t("languageLabel")}
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-control border border-line bg-surface px-2 text-small text-ink"
                >
                  <option value="vi">{t("langVi")}</option>
                  <option value="en">{t("langEn")}</option>
                </select>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button variant="primary" disabled={!ready} loading={busy} onClick={() => void start()}>
                {t("start")}
              </Button>
              {picked && dur === null && !tooLong ? <p className="mt-2 w-full text-small text-ink-3">{t("cannotReadDuration")}</p> : null}
            </div>

            <p className="mt-4 text-caption text-ink-3">{t("notStored")}</p>
          </div>
        )}

        {error && !picked ? (
          <div className="mt-4">
            <BannerError>{error}</BannerError>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BannerError({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="mt-4 flex items-start gap-3 rounded-block border border-line bg-surface p-4">
      <TriangleAlert aria-hidden={true} className="mt-0.5 size-5 shrink-0 text-tag-risk" strokeWidth={1.75} />
      <p className="text-small text-ink">{children}</p>
    </div>
  );
}
