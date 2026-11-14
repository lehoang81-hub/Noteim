"use client";

import { useEffect, useRef, useState } from "react";
import { Flag } from "lucide-react";
import { useTranslations } from "next-intl";
import { Sheet } from "@/components/ui/sheet";
import { TagChip, type SemanticTag } from "@/components/ui/chips";

/*
 * Nút Đánh dấu (docs/03-screens.md mục 3):
 * - Chạm một lần: tạo điểm nóng không nhãn.
 * - Nhấn giữ 0,5 giây: mở bảng chọn nhãn màu; chọn nhãn là tạo điểm nóng có nhãn.
 * - Bàn phím: Enter hoặc Space chạm một lần; giữ phím (phím lặp) là nhấn giữ.
 * Gợn sóng trên dải giọng và rung nhẹ do màn hình ghi lo sau khi tạo điểm nóng.
 */

const LONG_PRESS_MS = 500;

export function BookmarkButton({
  onBookmark,
  className,
}: {
  /** tag là nhãn đã chọn, null nếu chạm nhanh không nhãn */
  onBookmark: (tag: SemanticTag | null) => void;
  className?: string;
}) {
  const t = useTranslations("record");
  const tl = useTranslations("styleguide.tags");
  const [tagSheet, setTagSheet] = useState(false);
  const timer = useRef(0);
  const longFired = useRef(false);
  const keyArmed = useRef(false);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function tap() {
    onBookmark(null);
  }

  return (
    <>
      <button
        type="button"
        aria-label={t("addBookmark")}
        className={className}
        onPointerDown={() => {
          longFired.current = false;
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => {
            longFired.current = true;
            setTagSheet(true);
          }, LONG_PRESS_MS);
        }}
        onPointerUp={() => {
          window.clearTimeout(timer.current);
          if (!longFired.current) tap();
          longFired.current = false;
        }}
        onPointerLeave={() => window.clearTimeout(timer.current)}
        onPointerCancel={() => window.clearTimeout(timer.current)}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          if (e.repeat) {
            if (!longFired.current && !keyArmed.current) {
              keyArmed.current = true;
              longFired.current = true;
              setTagSheet(true);
            }
            return;
          }
          keyArmed.current = true;
        }}
        onKeyUp={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          if (keyArmed.current && !longFired.current) tap();
          keyArmed.current = false;
          longFired.current = false;
        }}
        onBlur={() => {
          window.clearTimeout(timer.current);
          keyArmed.current = false;
        }}
      >
        <Flag aria-hidden={true} className="size-6" strokeWidth={1.75} />
        <span className="text-caption font-medium">{t("bookmarkLabel")}</span>
      </button>

      <Sheet open={tagSheet} onOpenChange={setTagSheet} title={t("bookmarkTagTitle")} size="half">
        <div className="flex flex-wrap gap-2 py-1">
          {(["decided", "pending", "risk", "idea", "figure"] as const).map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => {
                setTagSheet(false);
                onBookmark(tag);
              }}
              className="rounded-pill outline-offset-2"
            >
              <TagChip tag={tag} label={tl(tag)} />
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
