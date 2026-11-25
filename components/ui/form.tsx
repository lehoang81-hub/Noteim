"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Search, X } from "lucide-react";
import { forwardRef, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const fieldBase =
  "h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink placeholder:text-ink-3 " +
  "transition-colors ease-noteim duration-(--t-quick) focus:border-dien focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-dien/30 aria-[invalid=true]:border-tag-risk";

/* ---------- Ô nhập có nhãn ---------- */

export const TextField = forwardRef<
  HTMLInputElement,
  { label: string; hint?: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>
>(function TextField({ label, hint, error, className, id, ...rest }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const noteId = `${inputId}-note`;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 block text-small font-medium text-ink">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? noteId : undefined}
        className={fieldBase}
        {...rest}
      />
      {error ? (
        <p id={noteId} className="mt-1.5 text-small font-medium text-tag-risk">
          {error}
        </p>
      ) : hint ? (
        <p id={noteId} className="mt-1.5 text-small text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

/* ---------- Ô tìm kiếm ---------- */

/**
 * Ô tìm kiếm kiểm soát lọc bằng state của cha, an toàn với bộ gõ có lúc soạn
 * (IME: gõ Telex trên Android, chữ Hàn...) và với trang nặng.
 *
 * Lỗi thật (C1-08): gõ "Lê Chân" bằng Telex trên Android thì con trỏ nhảy,
 * chữ bị đảo (ra "iCh"). Bắt được cả trên máy làm việc: tab Lời của buổi,
 * project mobile của Playwright — code cũ gõ "căn" thành "ncă", "Lê Chân"
 * thành " ChânLê". Nguyên nhân: ô nhập kiểu kiểm soát (value={state}) khiến
 * React ghi giá trị vào DOM giữa lúc gõ (khi đang soạn dấu của bộ gõ, hoặc
 * khi trang đang vẽ lại — khôi phục giá trị cũ chạy đua với sự kiện gõ kế
 * tiếp), chữ chen ngang thành xáo trộn.
 *
 * Cách sửa: ô nhập TỰ QUẢN GIÁ TRỊ trong DOM (uncontrolled) — trong lúc gõ,
 * React KHÔNG BAO GIỜ ghi vào ô nên không thể chen ngang:
 * - onInput/onChange chỉ ĐỌC giá trị DOM và đẩy lên cha (bộ lọc chạy ngay
 *   từng phím như cũ);
 * - đang soạn (compositionstart → compositionend) thì CHƯA đẩy lên cha, xong
 *   soạn đẩy một lần để bộ lọc không chạy giữa lúc dấu chưa hoàn chỉnh;
 * - giá trị từ cha đổi từ ngoài (nút xóa, đặt lại) thì ghi vào DOM qua ref,
 *   chỉ khi KHÔNG đang soạn.
 */

export function SearchField({
  value,
  onChange,
  label,
  clearLabel,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Nhãn cho trình đọc màn hình */
  label: string;
  clearLabel: string;
  placeholder?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  /** Giá trị lần cuối chính ô này đẩy lên cha: value từ cha trùng nó là hồi âm
   * của lần gõ của mình, KHÔNG được ghi ngược vào DOM — ghi thì chạy đua với
   * phím kế tiếp khi trang nặng, chữ xáo trộn (đúng họ lỗi C1-08). */
  const lastCommittedRef = useRef(value);
  const [hasText, setHasText] = useState(Boolean(value));

  // Giá trị từ cha đổi từ NGOÀI (nút xóa, đặt lại, chip tìm gần đây) thì áp
  // vào DOM khi KHÔNG đang soạn; hồi âm của lần gõ của mình thì bỏ qua
  useEffect(() => {
    if (value === lastCommittedRef.current) return;
    const el = inputRef.current;
    if (el && !composingRef.current) {
      el.value = value;
      lastCommittedRef.current = value;
      setHasText(Boolean(value));
    }
  }, [value]);

  return (
    <div className={cn("relative", className)}>
      <Search aria-hidden={true} className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-3" strokeWidth={1.75} />
      <input
        ref={inputRef}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        data-search-input="true"
        aria-label={label}
        placeholder={placeholder}
        defaultValue={value}
        onChange={(e) => {
          const next = e.target.value;
          lastCommittedRef.current = next;
          setHasText(Boolean(next));
          if (!composingRef.current) onChange(next);
        }}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          lastCommittedRef.current = e.currentTarget.value;
          setHasText(Boolean(e.currentTarget.value));
          onChange(e.currentTarget.value);
        }}
        className={cn(fieldBase, "pl-10 pr-11")}
      />
      {hasText ? (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={() => {
            composingRef.current = false;
            if (inputRef.current) inputRef.current.value = "";
            lastCommittedRef.current = "";
            setHasText(false);
            onChange("");
          }}
          className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-control text-ink-3 hover:text-ink"
        >
          <X aria-hidden={true} className="size-4" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}

/* ---------- Công tắc ---------- */

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center gap-4 py-1">
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-body text-ink">{label}</span>
        {description ? <span className="block text-small text-ink-2">{description}</span> : null}
      </label>
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill bg-ink-3 transition-colors ease-noteim duration-(--t-quick) data-[state=checked]:bg-sen"
      >
        <SwitchPrimitive.Thumb className="block size-5 translate-x-1 rounded-pill bg-surface transition-transform ease-noteim duration-(--t-quick) data-[state=checked]:translate-x-6" />
      </SwitchPrimitive.Root>
    </div>
  );
}

/* ---------- Thanh tab ---------- */

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <TabsPrimitive.List
      aria-label={label}
      className="flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]"
    >
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={cn(
        "relative inline-flex h-11 shrink-0 items-center rounded-t-control px-3 text-small font-medium text-ink-2",
        "transition-colors ease-noteim duration-(--t-base) hover:text-ink",
        "data-[state=active]:text-ink",
        "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-pill after:bg-sen after:opacity-0",
        "after:transition-opacity after:duration-(--t-base) data-[state=active]:after:opacity-100",
      )}
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}
