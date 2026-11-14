"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { sections, type SectionId } from "./palette-data";

/*
 * Mục lục trang.
 * Điện thoại: thanh chip cuộn ngang, dính đầu trang.
 * Máy tính (từ 1024px): danh sách dính ở cột trái.
 * Mục đang xem được tô, tính bằng IntersectionObserver.
 */

function useActiveSection(): SectionId {
  const [active, setActive] = useState<SectionId>(sections[0]);

  useEffect(() => {
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
          else visible.delete(entry.target.id);
        }
        const first = sections.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: "-72px 0px -55% 0px" },
    );
    for (const id of sections) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return active;
}

export function SectionNavMobile() {
  const t = useTranslations("styleguide.nav");
  const active = useActiveSection();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const chip = listRef.current?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    chip?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <nav
      aria-label={t("label")}
      className="sticky top-0 z-10 -mx-page border-b border-line bg-bg lg:hidden"
    >
      <ul ref={listRef} className="flex scroll-px-page gap-2 overflow-x-auto px-page py-2.5 [scrollbar-width:none] [&>li:last-child]:pr-page">
        {sections.map((id) => (
          <li key={id} data-id={id} className="shrink-0">
            <a
              href={`#${id}`}
              aria-current={active === id ? "true" : undefined}
              className="inline-flex h-9 items-center rounded-pill px-3.5 text-small font-medium text-ink-2 transition-colors ease-noteim aria-[current]:bg-surface-2 aria-[current]:text-ink"
              style={{ transitionDuration: "var(--t-quick)" }}
            >
              {t(id)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SectionNavDesktop() {
  const t = useTranslations("styleguide.nav");
  const active = useActiveSection();

  return (
    <nav aria-label={t("label")} className="sticky top-8 hidden self-start lg:block">
      <ul className="flex flex-col gap-0.5">
        {sections.map((id) => (
          <li key={id}>
            <a
              href={`#${id}`}
              aria-current={active === id ? "true" : undefined}
              className="flex h-9 items-center rounded-control border-l-2 border-transparent px-3 text-small text-ink-2 transition-colors ease-noteim hover:text-ink aria-[current]:rounded-l-none aria-[current]:border-sen aria-[current]:bg-surface-2 aria-[current]:font-medium aria-[current]:text-ink"
              style={{ transitionDuration: "var(--t-quick)" }}
            >
              {t(id)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
