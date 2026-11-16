"use client";

import { CalendarX2, CircleCheck, CircleHelp, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SkeletonParagraph } from "@/components/ui/feedback";
import { WorkspaceAvatar } from "@/components/shell/workspace-switcher";
import { data, useData } from "@/lib/data";

/*
 * Nhận lời mời vào không gian nhóm /join/[token] (M7-01, docs/08 phần B).
 * Ngoài khung ứng dụng (như /p và /welcome): không thanh điều hướng.
 * Ba trạng thái của lời mời: hợp lệ (tên nhóm, ai mời, bấm Tham gia), hết
 * hạn (7 ngày), không tìm thấy (sai liên kết hoặc đã thu hồi). Ép trạng thái
 * hết hạn bằng bảng thử nghiệm (?debug=1, cờ "Lời mời hết hạn").
 */

export default function JoinPage() {
  const params = useParams<{ token: string }>();
  return <JoinLoader token={params?.token ?? ""} />;
}

function JoinLoader({ token }: { token: string }) {
  const t = useTranslations("join");
  const invite = useData(() => data.workspaces.getInvite(token), [token]);
  // Sau khi tham gia không đọc lại lời mời (đã hết trạng thái "invited"):
  // hiện xác nhận đã tham gia với tên nhóm đã biết
  const [joinedName, setJoinedName] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);

  async function accept(workspaceName: string) {
    setBusy(true);
    try {
      await data.workspaces.acceptInvite(token);
      setJoinedName(workspaceName);
    } catch {
      setFull(true);
    } finally {
      setBusy(false);
    }
  }

  const data0 = invite.data;
  const expired = data0 === "expired";
  const notFound = !invite.error && data0 === "not_found";
  const valid = data0 && data0 !== "expired" && data0 !== "not_found" ? data0 : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-page pb-[calc(24px+env(safe-area-inset-bottom))] pt-10">
      <div className="mb-6 flex items-center gap-2 text-ink-2">
        <span aria-hidden={true} className="size-8 rounded-pill" style={{ background: "var(--gradient-dawn)" }} />
        <span className="text-small font-semibold">Noteim</span>
      </div>

      {joinedName ? (
        <section>
          <CircleCheck aria-hidden={true} className="size-10 text-tag-decided" strokeWidth={1.75} />
          <h1 className="mt-3 font-display text-h1 font-semibold text-ink">{t("joined", { name: joinedName })}</h1>
          <p className="mt-2 text-body text-ink-2">{t("joinedHint")}</p>
          <Link
            href="/"
            className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-control bg-ink text-small font-semibold text-bg"
          >
            {t("openApp")}
          </Link>
        </section>
      ) : invite.initialLoading ? (
        <section aria-busy={true}>
          <SkeletonParagraph lines={2} />
          <div className="mt-6">
            <SkeletonParagraph lines={4} />
          </div>
        </section>
      ) : valid ? (
        <section>
          <p className="flex items-center gap-2 text-small text-ink-2">
            <Users aria-hidden={true} className="size-4" strokeWidth={1.75} />
            {t("lead", { invitedBy: valid.invited_by })}
          </p>
          <h1 className="mt-2 flex items-center gap-3 font-display text-h1 font-semibold text-ink">
            <WorkspaceAvatar name={valid.workspace.name} kind="team" className="size-12 text-body" />
            {valid.workspace.name}
          </h1>
          <p className="mt-2 text-body text-ink-2">{t("body")}</p>
          {full ? <p className="mt-3 text-small font-medium text-tag-risk">{t("fullNote")}</p> : null}
          <Button
            variant="primary"
            className="mt-6 h-12 w-full"
            disabled={busy || full}
            onClick={() => void accept(valid.workspace.name)}
          >
            {busy ? t("joining") : t("accept")}
          </Button>
        </section>
      ) : expired ? (
        <EmptyJoin icon={CalendarX2} title={t("expired")} note={t("expiredNote")} />
      ) : notFound || invite.error ? (
        <EmptyJoin icon={CircleHelp} title={t("notFound")} note={t("notFoundNote")} />
      ) : null}
    </main>
  );
}

function EmptyJoin({
  icon: Icon,
  title,
  note,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  note: string;
}) {
  const t = useTranslations("join");
  return (
    <section>
      <Icon aria-hidden={true} className="size-10 text-ink-3" strokeWidth={1.75} />
      <h1 className="mt-3 font-display text-h1 font-semibold text-ink">{title}</h1>
      <p className="mt-2 text-body text-ink-2">{note}</p>
      <Link
        href="/"
        className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-control border border-line bg-surface text-small font-semibold text-ink hover:bg-surface-2"
      >
        {t("openApp")}
      </Link>
    </section>
  );
}
