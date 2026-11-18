import type { Metadata } from "next";
import { getMessages } from "next-intl/server";
import { GhiAmSpikeScreen } from "./screen";

export async function generateMetadata(): Promise<Metadata> {
  const messages = (await getMessages()) as { spikeGhiAm?: { title?: string; subtitle?: string } };
  return {
    title: messages.spikeGhiAm?.title ?? "Noteim",
    description: messages.spikeGhiAm?.subtitle,
  };
}

/*
 * Trang thử ghi âm và nghe dài trên điện thoại (B0-02, issue #70, docs/10-B
 * phần B). Trang riêng nằm ngoài khung ứng dụng: không có trong thanh điều
 * hướng, không đổi màn hiện có nào.
 */
export default function SpikeGhiAmPage() {
  return <GhiAmSpikeScreen />;
}
