"use client";

import { Share2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";

/*
 * Hàng thư viện vuốt được sang trái (docs/03-screens.md mục 1, M4-01):
 * hiện hai nút Chia sẻ và Xóa. Chỉ kéo bằng ngón tay (pointer touch/pen),
 * máy tính dùng nút ⋯ trên hàng. Vuốt hàng khác hoặc chạm ra ngoài thì đóng
 * (người dùng điều khiển qua open/onOpenChange).
 */

const ACTION_W = 76;
const OPEN_X = -(ACTION_W * 2);

export function SwipeRow({
  open,
  onOpenChange,
  shareLabel,
  deleteLabel,
  onShare,
  onDelete,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareLabel: string;
  deleteLabel: string;
  onShare: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const horizontal = useRef(false);

  const x = open ? OPEN_X : dragX;

  function down(e: React.PointerEvent) {
    if (e.pointerType === "mouse") return; // máy tính không vuốt
    setDragging(true);
    startX.current = e.clientX;
    startY.current = e.clientY;
    horizontal.current = false;
  }

  function move(e: React.PointerEvent) {
    if (!dragging) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (!horizontal.current && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) horizontal.current = true;
    if (horizontal.current) {
      // Chỉ vuốt sang trái, khép khi quá nửa bề ngang nút
      setDragX(Math.min(0, Math.max(OPEN_X - 24, dx + (open ? OPEN_X : 0))));
    }
  }

  function up() {
    if (!dragging) return;
    setDragging(false);
    const target = dragX < OPEN_X / 2 ? OPEN_X : 0;
    setDragX(0);
    onOpenChange(target !== 0);
  }

  return (
    <div
      className="relative overflow-hidden"
      data-swipe-open={open ? "true" : undefined}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      {/* Hai nút phía sau hàng, bên phải: Chia sẻ, Xóa */}
      <div className="absolute inset-y-0 right-0 flex" aria-hidden={!open}>
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          onClick={onShare}
          className="flex w-[76px] flex-col items-center justify-center gap-1 bg-dien-tint text-small font-semibold text-dien"
        >
          <Share2 aria-hidden={true} className="size-5" strokeWidth={1.75} />
          {shareLabel}
        </button>
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          onClick={onDelete}
          className="flex w-[76px] flex-col items-center justify-center gap-1 bg-tag-risk text-small font-semibold text-on-sen"
        >
          <Trash2 aria-hidden={true} className="size-5" strokeWidth={1.75} />
          {deleteLabel}
        </button>
      </div>

      <div
        className={cn(
          "relative bg-bg",
          !dragging && "transition-transform ease-noteim duration-(--t-quick) motion-reduce:transition-none",
        )}
        style={{ transform: `translateX(${x}px)` }}
      >
        {children}
      </div>
    </div>
  );
}
