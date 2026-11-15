"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";

/*
 * Sơ đồ quy trình Mermaid (issue M3-03). File này được next/dynamic nạp —
 * chỉ khi mở tab Hình. Mermaid nặng, không được đưa vào bundle trang khác.
 * Màu lấy từ token, đổi sáng tối thì vẽ lại.
 */

type MermaidModule = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, code: string) => Promise<{ svg: string }>;
};

let mermaidModule: MermaidModule | null = null;
async function loadMermaid(): Promise<MermaidModule> {
  if (!mermaidModule) {
    const mod = (await import("mermaid")) as unknown as { default?: MermaidModule } & MermaidModule;
    mermaidModule = mod.default ?? mod;
  }
  return mermaidModule;
}

export default function MermaidFlow({
  code,
  colors,
}: {
  code: string;
  colors: { background: string; primary: string; text: string; border: string; line: string };
}) {
  const t = useTranslations("visual");
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const mermaid = await loadMermaid();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            background: colors.background,
            primaryColor: colors.primary,
            primaryTextColor: colors.text,
            primaryBorderColor: colors.border,
            lineColor: colors.line,
            fontSize: "14px",
            fontFamily: "'Be Vietnam Pro', sans-serif",
          },
        });
        const { svg: out } = await mermaid.render(`mermaid-${reactId}`, code);
        if (alive) {
          setSvg(out);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [code, reactId, colors]);

  if (failed) {
    return <p className="text-small text-ink-2">{t("mermaidError")}</p>;
  }
  if (!svg) {
    return <div className="h-40 w-full animate-pulse rounded-block bg-surface-2 motion-reduce:animate-none" aria-hidden={true} />;
  }
  return (
    <div
      className="w-full overflow-x-auto [&_svg]:mx-auto [&_svg]:max-w-full"
      // Sơ do do Mermaid tạo từ code của dữ liệu mẫu (fixture), không phải đầu vào người dùng
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
