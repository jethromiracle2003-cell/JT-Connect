import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import { AlertCircle, Check, CheckCheck, Clock, X } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/numberchat/format";

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("text-accent", className)} aria-hidden="true">
      <rect width="40" height="40" rx="13" fill="currentColor" />
      <path
        d="M10 15.5h14M10 21h20M10 26.5h9"
        stroke="var(--nc-accent-fg)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Avatar({
  name,
  src,
  online,
  size = "md",
}: {
  name: string;
  src?: string | null;
  online?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "lg" ? "size-20" : size === "sm" ? "size-9" : "size-11";
  const type = size === "lg" ? "text-2xl" : size === "sm" ? "text-xs" : "text-sm";
  return (
    <span className={cn("relative inline-flex shrink-0", dim)}>
      {src ? (
        <img src={src} alt="" className="size-full rounded-full object-cover" />
      ) : (
        <span
          className={cn(
            "grid size-full place-items-center rounded-full bg-surface-2 font-semibold text-fg",
            type,
          )}
        >
          {initials(name)}
        </span>
      )}
      {online ? (
        <span
          className="absolute right-0 bottom-0 size-3 rounded-full bg-online ring-2 ring-bg"
          aria-label="Online"
        />
      ) : null}
    </span>
  );
}

const press =
  "transition-transform duration-150 ease-out active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-base font-semibold",
        press,
        variant === "primary" && "bg-accent text-accent-fg",
        variant === "ghost" && "bg-surface-2 text-fg",
        variant === "danger" && "bg-surface-2 text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function IconButton({
  label,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full text-fg",
        press,
        className,
      )}
      {...props}
    />
  );
}

export const fieldClass =
  "min-h-11 w-full rounded-2xl border border-line bg-bg px-3 text-base text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function Modal({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-fg/40" />
        <Dialog.Content className="fixed inset-x-0 top-24 bottom-0 z-50 overflow-y-auto rounded-t-3xl bg-surface p-5 text-fg outline-none md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:max-h-[80dvh] md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Dialog.Title className="text-lg font-semibold text-balance">{title}</Dialog.Title>
            <Dialog.Close
              className="grid size-11 place-items-center rounded-full bg-surface-2"
              aria-label="Close"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ToggleRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        {hint ? <div className="text-sm text-pretty text-muted">{hint}</div> : null}
      </div>
      <Switch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={label}
        className="relative h-7 w-12 shrink-0 rounded-full bg-surface-2 transition-colors data-[state=checked]:bg-accent"
      >
        <Switch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-fg transition-transform duration-150 data-[state=checked]:translate-x-5 data-[state=checked]:bg-accent-fg" />
      </Switch.Root>
    </div>
  );
}

export function Ticks({ state }: { state: "sending" | "sent" | "read" | "failed" }) {
  if (state === "sending") return <Clock className="size-3.5" aria-label="Sending" />;
  if (state === "failed") return <AlertCircle className="size-3.5" aria-label="Not sent" />;
  if (state === "read") return <CheckCheck className="size-4 text-read" aria-label="Read" />;
  return <Check className="size-3.5" aria-label="Sent" />;
}

export function ChatSkeleton() {
  return (
    <div className="space-y-1 px-3" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex animate-pulse items-center gap-3 px-2 py-3">
          <div className="size-11 rounded-full bg-surface-2" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded-full bg-surface-2" />
            <div className="h-3 w-2/3 rounded-full bg-surface-2" />
          </div>
        </div>
      ))}
    </div>
  );
}
