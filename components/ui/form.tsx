"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Search, X } from "lucide-react";
import { forwardRef, useId } from "react";
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
  return (
    <div className={cn("relative", className)}>
      <Search aria-hidden={true} className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-3" strokeWidth={1.75} />
      <input
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(fieldBase, "pl-10 pr-11 [&::-webkit-search-cancel-button]:appearance-none")}
      />
      {value ? (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={() => onChange("")}
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
