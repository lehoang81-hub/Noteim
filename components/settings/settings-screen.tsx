"use client";

import { BookA, Building2, CircleHelp, ContactRound, Gem, HardDriveDownload, Languages, LayoutTemplate, Mic, Palette, ShieldCheck, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ProfileSection } from "./profile-section";
import { TemplatesSection } from "./templates-section";
import { GlossarySection } from "./glossary-section";
import { ContactsSection } from "./contacts-section";
import { RecordingSection } from "./recording-section";
import { StorageSection } from "./storage-section";
import { PrivacySection } from "./privacy-section";
import { AppearanceSection } from "./appearance-section";
import { PlanSection } from "./plan-section";
import { ReportLanguageSection } from "./report-language-section";
import { TeamSection } from "./team-section";
import { useTeamWorkspace } from "@/components/team/use-team";
import { AccountEntry } from "@/components/auth/account-entry";
import { cn } from "@/lib/cn";

/*
 * Cài đặt (docs/03-screens.md mục 12, issue M4-03).
 * Điện thoại: danh sách mục, chạm vào mở trang con /settings/<mục>.
 * Máy tính: cột mục bên trái, nội dung bên phải.
 */

export const SECTION_IDS = [
  "tai-khoan",
  "ho-so",
  "mau-tom-tat",
  "tu-dien",
  "danh-ba",
  "ghi-am",
  "ngon-ngu-bao-cao",
  "luu-tru",
  "quyen-rieng-tu",
  "giao-dien",
  "goi-dich-vu",
  "nhom",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

/** Mục chỉ hiện khi đang dùng không gian Nhóm (M7-03, docs/08 phần B). */
const TEAM_ONLY_SECTIONS: SectionId[] = ["nhom"];

export const SECTION_ICONS: Record<SectionId, typeof Users> = {
  "tai-khoan": UserRound,
  "ho-so": Users,
  "mau-tom-tat": LayoutTemplate,
  "tu-dien": BookA,
  "danh-ba": ContactRound,
  "ghi-am": Mic,
  "ngon-ngu-bao-cao": Languages,
  "luu-tru": HardDriveDownload,
  "quyen-rieng-tu": ShieldCheck,
  "giao-dien": Palette,
  "goi-dich-vu": Gem,
  "nhom": Building2,
};

function isSection(v: string | undefined): v is SectionId {
  return (SECTION_IDS as readonly string[]).includes(v ?? "");
}

function SectionBody({ id }: { id: SectionId }) {
  switch (id) {
    case "tai-khoan":
      // Lối vào đăng nhập/đăng xuất (sau PR #87): bọc phiên riêng trong AccountEntry
      return <AccountEntry variant="settings" />;
    case "ho-so":
      return <ProfileSection />;
    case "mau-tom-tat":
      return <TemplatesSection />;
    case "tu-dien":
      return <GlossarySection />;
    case "danh-ba":
      return <ContactsSection />;
    case "ghi-am":
      return <RecordingSection />;
    case "ngon-ngu-bao-cao":
      return <ReportLanguageSection />;
    case "luu-tru":
      return <StorageSection />;
    case "quyen-rieng-tu":
      return <PrivacySection />;
    case "giao-dien":
      return <AppearanceSection />;
    case "goi-dich-vu":
      return <PlanSection />;
    case "nhom":
      return <TeamSection />;
  }
}

function SectionMenu({ active }: { active: SectionId | null }) {
  const t = useTranslations("settings");
  // Mục Nhóm chỉ hiện khi đang dùng không gian Nhóm (M7-03)
  const { isTeam } = useTeamWorkspace();
  return (
    <nav aria-label={t("nav")} className="flex flex-col">
      {SECTION_IDS.map((id) => {
        const Icon = SECTION_ICONS[id];
        if (!isTeam && TEAM_ONLY_SECTIONS.includes(id)) return null;
        return (
          <Link
            key={id}
            href={`/settings/${id}`}
            aria-current={active === id ? "page" : undefined}
            className={cn(
              "flex min-h-12 items-center gap-3 rounded-control px-3 text-left text-body transition-colors ease-noteim duration-(--t-quick)",
              active === id ? "bg-surface-2 font-semibold text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icon aria-hidden={true} className="size-5 shrink-0" strokeWidth={1.75} />
            {t(`sections.${id}`)}
          </Link>
        );
      })}
      {/* Mẹo ghi âm và câu hỏi thường gặp (C1-09 mục 5): trang riêng /help */}
      <Link
        href="/help"
        className="flex min-h-12 items-center gap-3 rounded-control px-3 text-left text-body text-ink-2 transition-colors ease-noteim duration-(--t-quick) hover:bg-surface-2 hover:text-ink"
      >
        <CircleHelp aria-hidden={true} className="size-5 shrink-0" strokeWidth={1.75} />
        {t("helpEntry")}
      </Link>
    </nav>
  );
}

export function SettingsScreen() {
  const t = useTranslations("settings");
  const params = useParams<{ section?: string }>();
  const section = isSection(params?.section) ? params.section : null;

  /* Điện thoại: danh sách, hoặc một trang con */
  if (!section) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <div className="px-page pt-2 lg:px-8 lg:pt-6">
          <h1 className="font-display text-h1 font-semibold text-ink">{t("title")}</h1>
        </div>
        <div className="px-page pb-40 pt-4 lg:hidden">
          <SectionMenu active={null} />
        </div>
        {/* Máy tính: cột mục bên trái, nội dung bên phải (mặc định mở Hồ sơ) */}
        <div className="hidden px-page pt-6 lg:block lg:px-8">
          <div className="grid grid-cols-[240px_minmax(0,1fr)] gap-8 pb-16">
            <SectionMenu active={"ho-so"} />
            <div className="max-w-[60ch]">
              <SectionBody id="ho-so" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="px-page pt-2 lg:hidden">
        <Link href="/settings" className="inline-flex min-h-11 items-center text-small font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
          {t("backToList")}
        </Link>
      </div>

      {/* Trang chỉ có một thẻ h1: tên mục đang mở, dùng chung cho mọi bề ngang (review PR #35) */}
      <div className="px-page pt-2 lg:px-8 lg:pt-6">
        <h1 className="mt-2 font-display text-h1 font-semibold text-ink lg:mt-0">{t(`sections.${section}`)}</h1>
      </div>

      <div className="px-page pb-40 pt-4 lg:hidden">
        <SectionBody id={section} />
      </div>

      {/* Máy tính: giữ cột mục bên trái để đổi mục nhanh */}
      <div className="hidden px-page pt-6 lg:block lg:px-8">
        <div className="grid grid-cols-[240px_minmax(0,1fr)] gap-8 pb-16">
          <SectionMenu active={section} />
          <div className="max-w-[60ch]">
            <SectionBody id={section} />
          </div>
        </div>
      </div>
    </div>
  );
}
