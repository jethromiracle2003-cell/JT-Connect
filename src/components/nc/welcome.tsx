import { useState } from "react";
import { authClient, GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { Button, fieldClass, Mark } from "@/components/nc/bits";

export function Welcome() {
  const [emailOpen, setEmailOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "signin">("create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitEmail(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes("@") || !trimmed.includes(".")) {
      setError("Enter a valid email.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    setBusy(true);
    const name = trimmed.split("@")[0]?.replace(/[^a-z0-9]+/gi, " ").trim() || "Member";
    const result =
      mode === "create"
        ? await authClient.signUp.email({ email: trimmed, password, name })
        : await authClient.signIn.email({ email: trimmed, password });
    if (result.error) {
      setBusy(false);
      setError(result.error.message || "That didn't work. Try again.");
      return;
    }
    window.location.assign("/");
  }

  return (
    <main className="mx-auto flex h-full w-full max-w-md flex-col justify-center overflow-y-auto px-6 py-10">
      <div className="rise">
        <Mark className="size-14" />
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance">
          A number that belongs to you.
        </h1>
        <p className="mt-3 text-base text-pretty text-muted">
          NumberChat gives every person a private 10-digit line. Add someone with their number.
          No phone contacts, no noise.
        </p>
      </div>

      <div className="mt-8 space-y-3">
        {GROK_PROVIDERS.map((provider) => (
          <Button
            key={provider.providerId}
            variant="ghost"
            className="w-full"
            onClick={() => {
              if (window.location.hostname.endsWith(".workers.dev")) {
                setEmailOpen(true);
                setError("Google and X sign-in aren't available on this link yet. Use email below.");
                return;
              }
              void signIn(provider.providerId, { callbackURL: "/" });
            }}
          >
            Continue with {provider.label}
          </Button>
        ))}

        {!emailOpen ? (
          <button
            type="button"
            className="min-h-11 w-full text-sm font-medium text-muted"
            onClick={() => setEmailOpen(true)}
          >
            Use email instead
          </button>
        ) : (
          <form className="space-y-3 pt-2" onSubmit={(event) => void submitEmail(event)}>
            <label className="block text-sm font-medium" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className={fieldClass}
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <label className="block text-sm font-medium" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className={fieldClass}
              autoComplete={mode === "create" ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Please wait…" : mode === "create" ? "Create account" : "Sign in"}
            </Button>
            <button
              type="button"
              className="min-h-11 w-full text-sm text-muted"
              onClick={() => {
                setMode(mode === "create" ? "signin" : "create");
                setError("");
              }}
            >
              {mode === "create" ? "Already have an account? Sign in" : "New here? Create an account"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
