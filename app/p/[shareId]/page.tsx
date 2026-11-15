"use client";

import { Lock, Pause, Play, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatClock } from "@/components/ribbon/draw";
import { Button } from "@/components/ui/button";
import { SpeakerName } from "@/components/ui/chips";
import { SkeletonParagraph } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form";
import { data, useData, type PublicSessionView } from "@/lib/data";
import { createMockPlayer, usePlayerState } from "@/lib/player/mock-player";
import { shortDate } from "@/lib/format";

/*
 * Trang chia sẻ công khai /p/[shareId] (docs/03-screens.md mục 9, issue M4-01).
 * Ngoài khung ứng dụng: không thanh điều hướng, không nút ghi âm.
 * Đầu trang: tiêu đề buổi ghi, người chia sẻ, ngày. Giữa: tóm tắt, chạm ý để
 * nghe nếu link cho phép. Cuối: "Ghi và tóm tắt bằng Noteim" + nút "Dùng thử".
 * Trạng thái: hết hạn, bị thu hồi, cần mật khẩu, không tồn tại. Mỗi lần mở
 * tăng lượt xem.
 */

type PublicState = "expired" | "revoked" | "needs_password" | "not_found";

export default function PublicSessionPage() {
  const params = useParams<{ shareId: string }>();
  const shareId = params?.shareId ?? "";
  return <PublicSessionLoader shareId={shareId} />;
}

function PublicSessionLoader({ shareId }: { shareId: string }) {
  const [password, setPassword] = useState("");
  const [attempt, setAttempt] = useState(0);
  return (
    <PublicSessionView
      key={attempt}
      shareId={shareId}
      password={attempt > 0 ? password : undefined}
      wrongPassword={attempt > 0}
      onSubmitPassword={(pw) => {
        setPassword(pw);
        setAttempt((n) => n + 1);
      }}
    />
  );
}

function PublicSessionView({
  shareId,
  password,
  wrongPassword,
  onSubmitPassword,
}: {
  shareId: string;
  password?: string;
  wrongPassword?: boolean;
  onSubmitPassword: (password: string) => void;
}) {
  const view = useData(() => data.share.getPublic(shareId, password), [shareId, password]);
  const counted = useRef(false);
  const result = view.data;

  // Mở thành công thì tăng lượt xem đúng một lần cho lần tải này
  useEffect(() => {
    if (result && typeof result !== "string" && !counted.current) {
      counted.current = true;
      void data.share.recordView(shareId);
    }
  }, [result, shareId]);

  if (view.initialLoading) {
    return (
      <main className="mx-auto min-h-dvh w-full max-w-2xl px-5 pt-10" aria-busy={true}>
        <SkeletonParagraph lines={2} />
        <div className="mt-8">
          <SkeletonParagraph lines={6} />
        </div>
      </main>
    );
  }

  if (!result || typeof result === "string") {
    const state = (result ?? "not_found") as PublicState;
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-5">
        <StateScreen state={state} wrongPassword={!!wrongPassword} onSubmitPassword={onSubmitPassword} />
      </main>
    );
  }
  return <PublicSummary view={result} />;
}

function StateScreen({
  state,
  wrongPassword,
  onSubmitPassword,
}: {
  state: PublicState;
  wrongPassword?: boolean;
  onSubmitPassword: (password: string) => void;
}) {
  const t = useTranslations("public");
  const [password, setPassword] = useState("");
  const icon =
    state === "needs_password" ? (
      <Lock aria-hidden={true} className="size-8 text-ink-2" strokeWidth={1.75} />
    ) : (
      <TriangleAlert aria-hidden={true} className="size-8 text-ink-2" strokeWidth={1.75} />
    );
  const message =
    state === "expired"
      ? t("expired")
      : state === "revoked"
        ? t("revoked")
        : state === "needs_password"
          ? t("needsPassword")
          : t("notFound");

  return (
    <div className="rounded-block border border-line bg-surface p-6 text-center">
      <div className="flex justify-center">{icon}</div>
      <h1 className="mt-3 text-h2 font-semibold text-ink">{message}</h1>
      {state === "needs_password" ? (
        <form
          className="mx-auto mt-4 max-w-xs text-left"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmitPassword(password);
          }}
        >
          <TextField
            label={t("passwordLabel")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="off"
            autoFocus
            error={wrongPassword ? t("wrongPassword") : undefined}
          />
          <Button type="submit" variant="primary" block className="mt-3">
            {t("unlock")}
          </Button>
        </form>
      ) : null}
      <p className="mt-6">
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-control border border-line bg-surface px-4 text-small font-semibold text-ink hover:bg-surface-2"
        >
          {t("tryNoteim")}
        </Link>
      </p>
    </div>
  );
}

function PublicSummary({ view }: { view: Exclude<PublicSessionView, string> }) {
  const t = useTranslations("public");
  const locale = useLocale();
  const allowAudio = view.scope === "summary_audio";
  const [player] = useState(() => createMockPlayer(view.duration_sec));
  const ps = usePlayerState(player);
  const [started, setStarted] = useState(false);

  function seek(sec: number) {
    if (!allowAudio) return;
    setStarted(true);
    player.seek(sec);
    player.play();
  }

  // Ý đang phát: ý cuối có mốc trước thời điểm hiện tại
  const bullets = useMemo(
    () => view.topics.flatMap((tp) => tp.bullets).sort((a, b) => a.timestamp_sec - b.timestamp_sec),
    [view.topics],
  );
  const playingId = useMemo(() => {
    if (!started && !ps.playing) return null;
    let cur: string | null = null;
    for (const b of bullets) if (b.timestamp_sec <= ps.currentTime + 0.5) cur = b.id;
    return cur;
  }, [bullets, ps.currentTime, ps.playing, started]);

  const colorOf = Object.fromEntries(view.speakers.map((s) => [s.id, s.color_index]));

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-5 pb-28 pt-8">
      <header>
        <h1 className="font-display text-h1 font-semibold text-ink">{view.title}</h1>
        <p className="mt-1 text-small text-ink-2">{t("sharedBy", { name: view.sharer_name, date: shortDate(view.created_at, locale) })}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {view.speakers.map((s) => (
            <SpeakerName key={s.id} colorIndex={s.color_index} name={s.display_name} named={!!s.contact_id || s.is_me} />
          ))}
        </div>
      </header>

      <section className="mt-8" aria-label={t("summaryLabel")}>
        <h2 className="text-small font-semibold text-ink-2">{t("keyPoints")}</h2>
        <p className="mt-1 text-body text-ink">{view.executive_summary}</p>

        {view.topics.map((topic) => (
          <article key={topic.id} className="mt-6">
            <h3 className="text-h2 font-semibold text-ink">{topic.title}</h3>
            <ul className="mt-2">
              {topic.bullets.map((b) => (
                <li
                  key={b.id}
                  className="border-l-2 border-transparent py-1.5 pl-3"
                  aria-current={playingId === b.id ? "true" : undefined}
                >
                  <button
                    type="button"
                    onClick={() => seek(b.timestamp_sec)}
                    aria-label={allowAudio ? t("playBullet", { time: formatClock(b.timestamp_sec) }) : undefined}
                    className="flex w-full items-start gap-3 rounded-control text-left"
                  >
                    <span
                      aria-hidden={true}
                      className="mt-2 size-2 shrink-0 rounded-pill"
                      style={{ backgroundColor: `var(--speaker-${((colorOf[b.speaker_id] ?? 0) % 6) + 1})` }}
                    />
                    <span className="min-w-0 flex-1 text-body text-ink">{b.text}</span>
                    <span className="shrink-0 pt-0.5 text-caption tabular-nums text-ink-3">{formatClock(b.timestamp_sec)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      {/* Trình phát nhỏ khi link cho phép nghe lại */}
      {allowAudio ? (
        <div className="fixed inset-x-3 bottom-4 z-20 mx-auto flex max-w-2xl items-center gap-3 rounded-block border border-line bg-surface p-3 shadow-float">
          <Button
            variant="primary"
            icon={ps.playing ? Pause : Play}
            iconOnly
            aria-label={ps.playing ? t("pause") : t("play")}
            onClick={() => (setStarted(true), player.toggle())}
          />
          <div className="min-w-0 flex-1">
            <div className="h-1.5 rounded-pill bg-surface-2">
              <div
                className="h-1.5 rounded-pill bg-sen"
                style={{ width: `${Math.min(100, (ps.currentTime / Math.max(1, view.duration_sec)) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-caption tabular-nums text-ink-3">
              {formatClock(ps.currentTime)} / {formatClock(view.duration_sec)}
            </p>
          </div>
        </div>
      ) : null}

      <footer className="mt-16 border-t border-line pt-6 text-center">
        <p className="text-small text-ink-2">{t("madeWith")}</p>
        <Link
          href="/"
          className="mt-3 inline-flex h-11 items-center gap-2 rounded-control bg-sen px-4 text-small font-semibold text-on-sen hover:bg-sen/90"
        >
          {t("tryNoteim")}
        </Link>
      </footer>
    </main>
  );
}
