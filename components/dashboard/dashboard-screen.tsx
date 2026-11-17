"use client";

import {
  CalendarClock,
  ChevronRight,
  CircleAlert,
  FileClock,
  Link2,
  Quote,
  TriangleAlert,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { TopBar } from "@/components/shell/app-shell";
import { RibbonThumb } from "@/components/ribbon/ribbon-thumb";
import { formatClock } from "@/components/ribbon/draw";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/chips";
import { EmptyState } from "@/components/ui/feedback";
import { data, dataNow, useData, type AttentionKind, type DashboardData, type Session, type WorkspaceRole } from "@/lib/data";
import { dayDiff, durationParts, shortDate, weekdayDate } from "@/lib/format";
import { templateName } from "@/lib/data/localize";
import { cn } from "@/lib/cn";

/*
 * Tổng quan (docs/08 phần B "Bảng điều khiển cá nhân" và "Bảng điều khiển
 * nhóm", M7-02, issue #48).
 * - Số liệu từ data.dashboard.get(range) và data.dashboard.team(range), tính
 *   theo không gian đang dùng và quyền đọc (bản giả không đếm nội dung buổi
 *   riêng tư của người khác — quyền của M7-01).
 * - Danh sách có đường kẻ mảnh; KHÔNG dùng lưới thẻ số liệu giống nhau
 *   (Bốn điều cấm, docs/02).
 * - "Cần xử lý" ở đầu trang, mỗi dòng đi thẳng tới chỗ xử lý. "Tuần này":
 *   một câu tổng kết và dải giọng ghép theo ngày, bấm một ngày để lọc thư viện.
 * - Tab Nhóm chỉ hiện cho Chủ và Quản trị trong không gian Nhóm.
 */

// Biểu đồ "Theo mẫu" nằm cuối trang: nạp chậm khi cuộn tới (M7-02)
const TemplateChart = dynamic(() => import("./template-chart").then((m) => m.TemplateChart), {
  ssr: false,
  loading: () => (
    <div className="h-28 w-full animate-pulse rounded-block bg-surface-2 motion-reduce:animate-none" aria-hidden={true} />
  ),
});

const KIND_ICON: Record<AttentionKind, LucideIcon> = {
  task_overdue: CircleAlert,
  task_due_today: CalendarClock,
  speaker_unnamed: UsersRound,
  audio_expiring: FileClock,
  link_expiring: Link2,
  processing_failed: TriangleAlert,
};

type Range = DashboardData["range"];
type TeamData = { usage: Array<{ user_id: string; sessions: number; minutes: number; open_tasks: number }>; open_tasks_by_assignee: Array<{ user_id: string; open: number; overdue: number }> };

/**
 * Gom dải giọng của các buổi trong cùng ngày thành một dải, gom về tối đa
 * 40 cột để vừa bề ngang điện thoại (giống resampleThumb của bản giả:
 * cột gộp giữ âm lượng cao nhất và màu người nói của cột đó).
 */
function mergeStrip(sessions: Session[], ids: string[]): { peaks: number[]; speakers: number[] } | null {
  const rows = ids.map((id) => sessions.find((s) => s.id === id)).filter((s): s is Session => !!s);
  if (!rows.length) return null;
  const peaks: number[] = [];
  const speakers: number[] = [];
  for (const s of rows) {
    peaks.push(...s.peaks_thumb);
    speakers.push(...s.speaker_colors_thumb);
  }
  if (peaks.length <= 40) return { peaks, speakers };
  const outP: number[] = [];
  const outS: number[] = [];
  for (let i = 0; i < 40; i++) {
    const from = Math.floor((i * peaks.length) / 40);
    const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / 40));
    let max = 0;
    let sp = speakers[from] ?? 0;
    for (let j = from; j < to; j++) {
      const p = peaks[j] ?? 0;
      if (p >= max) {
        max = p;
        sp = speakers[j] ?? 0;
      }
    }
    outP.push(Math.round(max * 100) / 100);
    outS.push(sp);
  }
  return { peaks: outP, speakers: outS };
}

/** Hạn mức chung minh họa của gói Nhóm: số hạn mức mỗi người hiện có × số chỗ đang dùng. Số gói Nhóm chờ Hoang chốt (docs/08). */
function teamMinutesLimit(personalLimit: number, activeCount: number): number {
  return Math.max(1, personalLimit) * Math.max(1, activeCount);
}

export function DashboardScreen() {
  const t = useTranslations("dashboard");
  const tl = useTranslations("library");
  const locale = useLocale();
  const router = useRouter();
  const now = dataNow();
  const [range, setRange] = useState<Range>("week");
  const [tab, setTab] = useState<"personal" | "team">("personal");

  const dash = useData(() => data.dashboard.get(range), [range]);
  const sessions = useData(() => data.sessions.list(), []);
  const quota = useData(() => data.account.quota(), []);
  const contacts = useData(() => data.account.contacts(), []);
  const templates = useData(() => data.account.templates(), []);
  const workspaces = useData(() => data.workspaces.list(), []);
  const me = useData(() => data.account.me(), []);

  // Không gian nhóm đang dùng và vai trò của tôi: tab Nhóm chỉ Chủ, Quản trị
  const team = (workspaces.data ?? []).find((w) => w.id === me.data?.current_workspace_id && w.kind === "team");
  const members = useData(() => (team ? data.workspaces.members(team.id) : Promise.resolve([])), [team?.id]);
  const myRole = (members.data ?? []).find((m) => m.user_id === me.data?.id)?.role;
  const canTeam = !!team && (myRole === "owner" || myRole === "admin");
  // Không đủ quyền xem Nhóm thì luôn hiển thị tab Cá nhân (không cần effect)
  const activeTab: "personal" | "team" = canTeam ? tab : "personal";
  const teamData = useData(
    () => (canTeam ? data.dashboard.team(range) : Promise.resolve(null)),
    [range, canTeam, team?.id],
  );
  const shared = useData(() => (team ? data.sessions.list({ shared: true }) : Promise.resolve([])), [team?.id]);

  function durationLabel(minutes: number) {
    const { h, m } = durationParts(minutes * 60);
    return h > 0 ? tl("hours", { h, m: String(m).padStart(2, "0") }) : tl("minutes", { m });
  }

  function dayLabel(date: string) {
    const d = new Date(`${date}T12:00:00+07:00`);
    const diff = dayDiff(d, now);
    if (diff <= 0) return tl("today");
    if (diff === 1) return tl("yesterday");
    return weekdayDate(d, locale);
  }

  const sessionTitle = Object.fromEntries((sessions.data ?? []).map((s) => [s.id, s.title]));
  const contactName = Object.fromEntries((contacts.data ?? []).map((c) => [c.id, c.name]));
  const memberName = Object.fromEntries((members.data ?? []).map((m) => [m.user_id, m.display_name]));
  const tplName = Object.fromEntries((templates.data ?? []).map((tp) => [tp.id, templateName(tp, locale)]));

  // Người mới: chưa có buổi ghi nào trong không gian đang dùng — hiện hướng
  // dẫn, không hiện dãy số 0
  const isNew = (sessions.data ?? []).length === 0;

  // Biểu đồ "Theo mẫu" chỉ dựng khi cuộn tới: callback ref để effect chạy lại
  // đúng lúc node gắn vào (sau khi dữ liệu tải xong)
  const [chartNode, setChartNode] = useState<HTMLDivElement | null>(null);
  const [chartSeen, setChartSeen] = useState(false);
  const ioSupported = typeof IntersectionObserver !== "undefined";
  useEffect(() => {
    if (chartSeen || !ioSupported || !chartNode) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setChartSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "160px" },
    );
    io.observe(chartNode);
    return () => io.disconnect();
  }, [chartNode, chartSeen, ioSupported]);

  const loading = dash.initialLoading || sessions.initialLoading;
  const d = dash.data;
  const q = quota.data;

  return (
    <div className="min-h-dvh">
      <TopBar title={t("title")} />
      <div className="mx-auto w-full max-w-[720px] px-page pt-1 pb-40 lg:px-0">
        {/* Chọn khoảng: áp dụng cho các phần số liệu */}
        <div role="group" aria-label={t("rangeLabel")} className="flex gap-2 pt-1 pb-2">
          <FilterChip selected={range === "week"} onClick={() => setRange("week")}>
            {t("rangeWeek")}
          </FilterChip>
          <FilterChip selected={range === "month"} onClick={() => setRange("month")}>
            {t("rangeMonth")}
          </FilterChip>
        </div>

        {/* Tab Nhóm chỉ hiện cho Chủ và Quản trị trong không gian Nhóm */}
        {canTeam ? (
          <div role="tablist" aria-label={t("tabLabel")} className="mt-1 flex w-fit gap-1 rounded-pill bg-surface-2 p-1">
            {(
              [
                { value: "personal" as const, label: t("tabPersonal") },
                { value: "team" as const, label: t("tabTeam") },
              ]
            ).map((tb) => (
              <button
                key={tb.value}
                role="tab"
                type="button"
                aria-selected={activeTab === tb.value}
                onClick={() => setTab(tb.value)}
                className={cn(
                  "min-h-9 rounded-pill px-4 text-small font-medium transition-colors ease-noteim duration-(--t-quick)",
                  activeTab === tb.value ? "bg-surface text-ink" : "text-ink-3 hover:text-ink",
                )}
              >
                {tb.label}
              </button>
            ))}
          </div>
        ) : null}

        {loading ? (
          <div aria-busy={true} className="mt-4 flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-4 animate-pulse rounded-pill bg-surface-2 motion-reduce:animate-none"
                style={{ width: `${88 - i * 14}%` }}
              />
            ))}
          </div>
        ) : dash.error && !dash.data ? (
          <EmptyState
            drawing={<span />}
            message={t("loadError")}
            action={<Button onClick={dash.reload}>{t("retry")}</Button>}
          />
        ) : isNew ? (
          /* Người mới: hướng dẫn ghi buổi đầu tiên thay vì dãy số 0 */
          <div className="mt-6">
            <h2 className="text-center text-body-strong font-semibold text-ink">{t("emptyTitle")}</h2>
            <EmptyState
              message={t("emptyBody")}
              action={
                <Button variant="primary" onClick={() => router.push("/record")}>
                  {t("emptyRecord")}
                </Button>
              }
            />
          </div>
        ) : activeTab === "team" ? (
          /* ================= TAB NHÓM (Chủ, Quản trị) ================= */
          <TeamPanel
            data={teamData.data ?? null}
            loading={teamData.initialLoading}
            members={members.data ?? []}
            shared={shared.data ?? []}
            memberName={memberName}
            myId={me.data?.id ?? ""}
            personalLimit={q?.minutes_limit ?? 0}
          />
        ) : (
          d && (
            <>
              {/* ---------- 1. Cần xử lý (đầu trang, quan trọng nhất) ---------- */}
              <section aria-labelledby="dash-attention" className="mt-3">
                <h2 id="dash-attention" className="text-small font-semibold text-ink-2">
                  {t("attention")}
                </h2>
                {d.attention.length === 0 ? (
                  <p className="py-3 text-body text-ink-3">{t("attentionEmpty")}</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {d.attention.map((a) => {
                      const Icon = KIND_ICON[a.kind];
                      return (
                        <li key={`${a.kind}-${a.target_id}`}>
                          <Link
                            href={a.href}
                            className="group flex min-h-14 items-center gap-3 py-2.5 pr-1 transition-colors ease-noteim duration-(--t-quick)"
                            aria-label={t("openAttention", { kind: t(`atKind.${a.kind}`), label: a.label })}
                          >
                            <Icon aria-hidden={true} className="size-5 shrink-0 text-ink-2" strokeWidth={1.75} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-caption text-ink-3">{t(`atKind.${a.kind}`)}</span>
                              <span className="block truncate text-body font-medium text-ink">{a.label}</span>
                            </span>
                            <ChevronRight
                              aria-hidden={true}
                              className="size-5 shrink-0 text-ink-3 transition-transform ease-noteim duration-(--t-quick) group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                              strokeWidth={1.75}
                            />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* ---------- 2. Tuần này / Tháng này ---------- */}
              <section aria-labelledby="dash-week" className="mt-6">
                <h2 id="dash-week" className="text-small font-semibold text-ink-2">
                  {range === "week" ? t("rangeWeek") : t("rangeMonth")}
                </h2>
                {d.totals.sessions === 0 ? (
                  <p className="py-3 text-body text-ink-3">{t("summaryNoSessions")}</p>
                ) : (
                  <>
                    <p className="py-2 text-body text-ink">
                      {t("summary", {
                        sessions: d.totals.sessions,
                        duration: durationLabel(d.totals.minutes),
                        decisions: d.totals.decisions,
                        done: d.totals.tasks_done,
                        total: d.totals.tasks_total,
                      })}
                    </p>
                    <p className="sr-only">{t("dayHint")}</p>
                    {/* Dải giọng ghép theo ngày: bấm một ngày để lọc thư viện */}
                    <ul className="divide-y divide-line">
                      {d.by_day.map((day) => {
                        const strip = mergeStrip(sessions.data ?? [], day.session_ids);
                        return (
                          <li key={day.date}>
                            <button
                              type="button"
                              onClick={() => router.push(`/?day=${day.date}`)}
                              aria-label={t("openDay", { date: dayLabel(day.date) })}
                              className="group flex w-full items-center gap-4 py-3 text-left transition-colors ease-noteim duration-(--t-quick)"
                            >
                              <span className="w-24 shrink-0">
                                <span className="block text-body font-medium text-ink">{dayLabel(day.date)}</span>
                                <span className="block text-caption text-ink-3">{tl("minutes", { m: day.minutes })}</span>
                              </span>
                              {strip ? (
                                <span className="min-w-0 flex-1 overflow-hidden">
                                  <RibbonThumb peaks={strip.peaks} speakers={strip.speakers} className="max-w-full" />
                                </span>
                              ) : null}
                              <ChevronRight
                                aria-hidden={true}
                                className="size-5 shrink-0 text-ink-3 transition-transform ease-noteim duration-(--t-quick) group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                                strokeWidth={1.75}
                              />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </section>

              {/* ---------- 3. Quyết định đã chốt ---------- */}
              <section aria-labelledby="dash-decisions" className="mt-6">
                <h2 id="dash-decisions" className="text-small font-semibold text-ink-2">
                  {t("decisions")}
                </h2>
                {d.decisions.length === 0 ? (
                  <p className="py-3 text-body text-ink-3">{t("decisionsEmpty")}</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {d.decisions.map((dc) => (
                      <li key={`${dc.session_id}:${dc.bullet_id}`}>
                        <Link
                          href={`/s/${dc.session_id}?t=${dc.timestamp_sec}`}
                          className="group flex min-h-14 items-start gap-3 py-3 pr-1 transition-colors ease-noteim duration-(--t-quick)"
                          aria-label={t("openDecision", { session: sessionTitle[dc.session_id] ?? dc.session_id })}
                        >
                          <Quote aria-hidden={true} className="mt-0.5 size-5 shrink-0 text-tag-decided" strokeWidth={1.75} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-body font-medium text-ink">{dc.text}</span>
                            <span className="mt-0.5 block truncate text-caption text-ink-3">
                              {sessionTitle[dc.session_id] ?? dc.session_id} · {formatClock(dc.timestamp_sec)}
                            </span>
                          </span>
                          <ChevronRight
                            aria-hidden={true}
                            className="mt-1 size-5 shrink-0 text-ink-3 transition-transform ease-noteim duration-(--t-quick) group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                            strokeWidth={1.75}
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* ---------- 4. Người gặp nhiều ---------- */}
              <section aria-labelledby="dash-contacts" className="mt-6">
                <h2 id="dash-contacts" className="text-small font-semibold text-ink-2">
                  {t("topContacts")}
                </h2>
                {d.top_contacts.length === 0 ? (
                  <p className="py-3 text-body text-ink-3">{t("topContactsEmpty")}</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {d.top_contacts.map((c) => (
                      <li key={c.contact_id} className="flex min-h-14 items-center gap-3 py-2.5">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-surface-2 text-small font-semibold text-ink">
                          {(contactName[c.contact_id] ?? "?").trim().charAt(0)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body font-medium text-ink">{contactName[c.contact_id] ?? c.contact_id}</span>
                          <span className="block text-caption text-ink-3">
                            {t("contactSessions", { count: c.sessions })} ·{" "}
                            {t("contactLastMet", { date: shortDate(c.last_met_at, locale) })}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* ---------- 5. Theo mẫu (biểu đồ nạp chậm) ---------- */}
              <section aria-labelledby="dash-templates" className="mt-6">
                <h2 id="dash-templates" className="text-small font-semibold text-ink-2">
                  {t("byTemplate")}
                </h2>
                <div ref={setChartNode} className="mt-3">
                  {chartSeen || !ioSupported ? (
                    <TemplateChart
                      rows={d.by_template.map((b) => ({
                        template_id: b.template_id,
                        name: tplName[b.template_id] ?? b.template_id,
                        minutes: b.minutes,
                        minutesLabel: tl("minutes", { m: b.minutes }),
                      }))}
                      label={t("byTemplateAria")}
                    />
                  ) : (
                    <div className="h-28 w-full rounded-block bg-surface-2 opacity-40" aria-hidden={true} />
                  )}
                </div>
              </section>

              {/* ---------- 6. Hạn mức ---------- */}
              <section aria-labelledby="dash-quota" className="mt-6">
                <h2 id="dash-quota" className="text-small font-semibold text-ink-2">
                  {t("quota")}
                </h2>
                {q ? (
                  <div className="py-3">
                    <p className="text-body text-ink">{t("quotaUsed", { used: q.minutes_used, limit: q.minutes_limit })}</p>
                    <div className="mt-2 h-3 w-full overflow-hidden rounded-pill bg-surface-2">
                      <div
                        className="h-full rounded-pill bg-sen transition-[width] ease-noteim duration-(--t-base) motion-reduce:transition-none"
                        style={{
                          width: `${Math.min(100, Math.round((q.minutes_used / Math.max(1, q.minutes_limit)) * 100))}%`,
                        }}
                      />
                    </div>
                    {q.minutes_used / Math.max(1, q.minutes_limit) >= 0.8 ? (
                      <>
                        <p className="mt-2 text-small font-medium text-tag-risk">{t("quotaNear")}</p>
                        <Button className="mt-3" onClick={() => router.push("/upgrade")}>
                          {t("quotaUpgrade")}
                        </Button>
                      </>
                    ) : null}
                    <p className="mt-2 text-caption text-ink-3">
                      {t("quotaLeft", {
                        left: Math.max(0, q.minutes_limit - q.minutes_used),
                        date: shortDate(new Date(Date.parse(q.period_end) + 86400_000), locale),
                      })}
                    </p>
                  </div>
                ) : null}
              </section>
            </>
          )
        )}
      </div>
    </div>
  );
}

/* ================= Tab Nhóm ================= */

function TeamPanel({
  data,
  loading,
  members,
  shared,
  memberName,
  myId,
  personalLimit,
}: {
  data: TeamData | null;
  loading: boolean;
  members: Array<{ user_id: string | null; display_name: string; role: WorkspaceRole; status: string }>;
  shared: Session[];
  memberName: Record<string, string>;
  myId: string;
  personalLimit: number;
}) {
  const t = useTranslations("dashboard");
  const tw = useTranslations("workspace");
  const locale = useLocale();

  if (loading) {
    return (
      <div aria-busy={true} className="mt-4 flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-4 animate-pulse rounded-pill bg-surface-2 motion-reduce:animate-none"
            style={{ width: `${88 - i * 14}%` }}
          />
        ))}
      </div>
    );
  }
  if (!data || data.usage.length === 0) return <p className="py-6 text-body text-ink-3">{t("teamEmpty")}</p>;

  const teamMinutes = data.usage.reduce((n, r) => n + r.minutes, 0);
  const teamSessions = data.usage.reduce((n, r) => n + r.sessions, 0);
  const teamOverdue = data.open_tasks_by_assignee.reduce((n, r) => n + r.overdue, 0);
  const activeCount = members.filter((m) => m.status === "active" && m.user_id).length;
  const limit = teamMinutesLimit(personalLimit, activeCount);
  const openByName = Object.fromEntries(data.open_tasks_by_assignee.map((r) => [r.user_id, r.open]));
  const ROLE_KEY: Record<WorkspaceRole, "roleOwner" | "roleAdmin" | "roleMember"> = {
    owner: "roleOwner",
    admin: "roleAdmin",
    member: "roleMember",
  };

  return (
    <>
      {/* Phút đã dùng của cả nhóm so với hạn mức chung */}
      <section aria-labelledby="dash-team-usage" className="mt-3">
        <h2 id="dash-team-usage" className="text-small font-semibold text-ink-2">
          {t("teamUsage", { minutes: teamMinutes })}
          <span className="ml-2 font-normal text-ink-3">{t("teamUsageLimit", { limit })}</span>
        </h2>
        <p className="sr-only">{`${t("teamSessions")}: ${teamSessions}`}</p>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-pill bg-surface-2">
          <div
            className="h-full rounded-pill bg-sen transition-[width] ease-noteim duration-(--t-base) motion-reduce:transition-none"
            style={{ width: `${Math.min(100, Math.round((teamMinutes / limit) * 100))}%` }}
          />
        </div>
        <p className={cn("mt-2 text-small font-medium", teamOverdue > 0 ? "text-tag-risk" : "text-ink-3")}>
          {t("teamOverdue", { count: teamOverdue })}
        </p>
      </section>

      {/* Bảng mức dùng theo từng người (tên, vai trò, số buổi, phút, việc mở).
          Việc mở theo người phụ trách là cột cuối của bảng này. */}
      <section aria-label={t("teamOpenByAssignee")} className="mt-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-small">
            <thead>
              <tr className="text-caption text-ink-3">
                <th scope="col" className="py-2 pr-3 font-medium">{t("teamMember")}</th>
                <th scope="col" className="py-2 pr-3 font-medium">{t("teamRole")}</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">{t("teamSessions")}</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">{t("teamMinutes")}</th>
                <th scope="col" className="py-2 text-right font-medium">{t("teamOpenTasks")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.usage.map((row) => {
                const m = members.find((x) => x.user_id === row.user_id);
                return (
                  <tr key={row.user_id}>
                    <td className="max-w-[9rem] truncate py-2.5 pr-3 font-medium text-ink">{m?.display_name ?? row.user_id}</td>
                    <td className="py-2.5 pr-3 text-ink-2">{m ? tw(ROLE_KEY[m.role]) : ""}</td>
                    <td className="py-2.5 pr-3 text-right text-ink-2">{row.sessions}</td>
                    <td className="py-2.5 pr-3 text-right text-ink-2">{row.minutes}</td>
                    <td className="py-2.5 text-right text-ink-2">{openByName[row.user_id] ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Buổi ghi được chia sẻ với nhóm gần đây */}
      <section aria-labelledby="dash-team-shared" className="mt-6">
        <h2 id="dash-team-shared" className="text-small font-semibold text-ink-2">
          {t("teamShared")}
        </h2>
        {shared.length === 0 ? (
          <p className="py-3 text-body text-ink-3">{t("teamNoShared")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {shared.slice(0, 3).map((s) => {
              const ownerId = s.owner_user_id || s.user_id;
              return (
                <li key={s.id}>
                  <Link href={`/s/${s.id}`} className="group flex min-h-14 items-center gap-3 py-2.5 pr-1">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-medium text-ink">{s.title}</span>
                      <span className="block text-caption text-ink-3">
                        {shortDate(s.created_at, locale)}
                        {ownerId !== myId ? ` · ${t("teamSharedBy", { name: memberName[ownerId] ?? "" })}` : ""}
                      </span>
                    </span>
                    <ChevronRight aria-hidden={true} className="size-5 shrink-0 text-ink-3" strokeWidth={1.75} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
