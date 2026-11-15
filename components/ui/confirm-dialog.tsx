"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Button, type ButtonVariant } from "@/components/ui/button";

/*
 * Hộp xác nhận cho hành động không hoàn tác được (xóa, dọn bản gốc, gửi).
 * Nút xác nhận phải nói đúng việc sẽ xảy ra: "Dọn bản gốc", "Gửi cho 4 người",
 * không dùng "Xác nhận" hay "OK".
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  cancelLabel,
  confirmLabel,
  confirmVariant = "danger",
  confirmDisabled,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  confirmVariant?: ButtonVariant;
  /** Chặn nút xác nhận cho tới khi người dùng làm đủ điều kiện (ví dụ gõ "XÓA") */
  confirmDisabled?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-40px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-block border border-line bg-surface p-5 text-ink shadow-float focus:outline-none">
          <AlertDialog.Title className="text-h2 font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className="mt-2 text-small text-ink-2">{children}</div>
          </AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">{cancelLabel}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={confirmVariant} disabled={confirmDisabled} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
