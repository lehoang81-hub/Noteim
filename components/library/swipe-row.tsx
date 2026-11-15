"use client";

import { Share2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/*
 * Hàng thư viện vuốt được sang trái (docs/03-screens.md mục 1, M4-01):
 * hiện hai nút Chia sẻ và Xóa. Chỉ kéo bằng ngón tay (pointer touch/pen),
 * máy tính dùng nút ⋯ trên hàng. Vuốt hàng khác hoặc chạm ra ngoài thì đóng
 * (người dùng điều khiển qua open/onOpenChange).
 *
 * Bài học chạm thật (review PR #35): trình duyệt di động coi chuyển động ngang
 * là cử chỉ cuộn và bắn pointercancel ngay sau lần di chuyển đầu, nên hàng
 * không bao giờ mở. Xử lý bằng ba việc cùng lúc:
 * 1. touch-action: pan-y cho khung hàng — trình duyệt chỉ giữ quyền cuộn dọc,
 *    chuyển động ngang thuộc về hàng.
 * 2. setPointerCapture lúc chạm — mọi pointermove/up tiếp theo vẫn gửi về hàng
 *    kể cả khi ngón tay trượt ra ngoài.
 * 3. up() đọc vị trí kéo từ ref thay vì state — state có thể là giá trị cũ của
 *    lần dựng trước khi vòng lặp sự kiện kịp dựng lại.
 *
 * Nhấn giữ để chọn nhiều (M5-01, dọn #27): giữ ngón tay 0,5 giây trên hàng
 * thì gọi onLongPress. Nhấn giữ ở đây thay vì trong SessionRow vì khung này
 * giữ con trỏ (setPointerCapture) — pointerup được gửi về khung, SessionRow
 * không nhận được nên không biết người dùng đã nhả tay. Di chuyển quá 10px
 * (cuộn danh sách) là hủy giữ; sau khi giữ ăn thì chặn lần click kế tiếp để
 * không mở nhầm buổi ghi.
 */

const LONG_PRESS_MS = 500;
const MOVE_CANCEL_PX = 10;

const ACTION_W = 76;
const OPEN_X = -(ACTION_W * 2);

export function SwipeRow({
  open,
  onOpenChange,
  shareLabel,
  deleteLabel,
  onShare,
  onDelete,
  onLongPress,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareLabel: string;
  deleteLabel: string;
  onShare: () => void;
  onDelete: () => void;
  /** Nhấn giữ ngón tay đủ lâu để vào chế độ chọn nhiều (M5-01) */
  onLongPress?: () => void;
  children: React.ReactNode;
}) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const horizontal = useRef(false);
  // Vị trí kéo mới nhất theo ref để up() luôn đọc đúng giá trị
  const dragXRef = useRef(0);
  // Nhấn giữ để chọn nhiều
  const holdTimer = useRef(0);
  const suppressClick = useRef(false);

  // Dọn hẹn giờ giữ khi khung bị tháo khỏi trang (chuyển sang chế độ chọn)
  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  const x = open ? OPEN_X : dragX;

  function down(e: React.PointerEvent) {
    if (e.pointerType === "mouse") return; // máy tính không vuốt
    setDragging(true);
    startX.current = e.clientX;
    startY.current = e.clientY;
    horizontal.current = false;
    suppressClick.current = false;
    if (onLongPress) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = window.setTimeout(() => {
        suppressClick.current = true;
        setDragging(false);
        dragXRef.current = 0;
        setDragX(0);
        onLongPress();
      }, LONG_PRESS_MS);
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Con trỏ đã nhấc lên trước khi kịp giữ: bỏ qua
    }
  }

  function move(e: React.PointerEvent) {
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (Math.abs(dx) > MOVE_CANCEL_PX || Math.abs(dy) > MOVE_CANCEL_PX) {
      // Cuộn danh sách hoặc kéo: hủy nhấn giữ
      window.clearTimeout(holdTimer.current);
    }
    if (!dragging) return;
    if (!horizontal.current && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) horizontal.current = true;
    if (horizontal.current) {
      // Chỉ vuốt sang trái, khép khi quá nửa bề ngang nút
      const next = Math.min(0, Math.max(OPEN_X - 24, dx + (open ? OPEN_X : 0)));
      dragXRef.current = next;
      setDragX(next);
    }
  }

  function up() {
    window.clearTimeout(holdTimer.current);
    if (!dragging) return;
    setDragging(false);
    // Đọc từ ref: state dragX có thể chưa kịp cập nhật vào lần dựng này
    const target = dragXRef.current < OPEN_X / 2 ? OPEN_X : 0;
    dragXRef.current = 0;
    setDragX(0);
    onOpenChange(target !== 0);
  }

  // Nhấn giữ đã ăn: chặn lần click kế tiếp (mở buổi ghi) để không nhầm lẫn
  function clickCapture(e: React.MouseEvent) {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <div
      className="relative touch-pan-y overflow-hidden [-webkit-touch-callout:none]" // pan-y: trình duyệt không giành cử chỉ ngang
      data-swipe-open={open ? "true" : undefined}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => onLongPress && e.preventDefault()}
      onClickCapture={clickCapture}
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
