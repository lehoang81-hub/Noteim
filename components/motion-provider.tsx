"use client";

import { LazyMotion, domMax } from "motion/react";

/*
 * Nạp bộ tính năng Motion theo kiểu lười (M5, sửa review PR #41 mục 2):
 * chỉ nạp lõi nhỏ lúc đầu, các thành phần dùng `m.*` thay vì `motion.*` nên
 * phần tính năng chưa dùng không nằm trong chunk khởi tạo. `strict` để chỗ
 * nào còn dùng `motion.*` lộ ra ngay khi chạy thay vì âm thầm tải bản đầy đủ.
 * Dùng domMax vì bảng trượt có kéo tay nắm (drag) và cần đủ animate/exit.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <LazyMotion features={domMax} strict>{children}</LazyMotion>;
}
