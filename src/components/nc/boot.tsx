import { Mark } from "@/components/nc/bits";

export function BootScreen({ label = "Opening your line" }: { label?: string }) {
  return (
    <main className="grid h-full place-items-center px-6">
      <div className="rise flex flex-col items-center text-center">
        <Mark className="size-16" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">NumberChat</h1>
        <p className="mt-2 text-sm text-muted">{label}</p>
      </div>
    </main>
  );
}

export function FullMessage({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <main className="grid h-full place-items-center px-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-xl font-semibold text-balance">{title}</h1>
        <p className="mt-2 text-sm text-pretty text-muted">{body}</p>
        <button
          type="button"
          onClick={onAction}
          className="mt-6 min-h-11 rounded-2xl bg-accent px-5 font-semibold text-accent-fg"
        >
          {action}
        </button>
      </div>
    </main>
  );
}
