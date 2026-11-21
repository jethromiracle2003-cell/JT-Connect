import { useState } from "react";
import { authClient, GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { Button, fieldClass, Mark } from "@/components/nc/bits";
import { completeOnboarding } from "@/lib/numberchat/api";
import { formatNumber } from "@/lib/numberchat/format";
import { copyNumber, errorText, shareNumber } from "@/lib/numberchat/share";
import type { Profile } from "@/lib/numberchat/types";

function displayNameFrom(raw: string) {
  const name = raw.replace(/[\u0000-\u001F]/g, "").trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 40) return null;
  return name;
}

export function Welcome() {
  const [emailOpen, setEmailOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "signin">("create");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountReady, setAccountReady] = useState(false);
  const [line, setLine] = useState<Profile | null>(null);

  async function assignLine(displayName: string) {
    const profile = await completeOnboarding({ data: { displayName, avatar: null } });
    setLine(profile);
  }

  async function submitEmail(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const trimmed = email.trim().toLowerCase();
    const displayName = displayNameFrom(name);
    if (mode === "create" && !displayName) {
      setError("Enter your name.");
      return;
    }
    if (!trimmed.includes("@") || !trimmed.includes(".")) {
      setError("Enter a valid email.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    setBusy(true);
    if (mode === "signin") {
      const result = await authClient.signIn.email({ email: trimmed, password });
      if (result.error) {
        setBusy(false);
        setError(result.error.message || "That didn't work. Try again.");
        return;
      }
      window.location.assign("/");
      return;
    }
    if (!accountReady) {
      const result = await authClient.signUp.email({
        email: trimmed,
        password,
        name: displayName as string,
      });
      if (result.error) {
        setBusy(false);
        setError(result.error.message || "That didn't work. Try again.");
        return;
      }
      setAccountReady(true);
    }
    try {
      await assignLine(displayName as string);
    } catch (caught) {
      setError(errorText(caught, "Your account is ready, but the number wasn't assigned. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (line) {
    return (
      <main className="mx-auto flex h-full w-full max-w-md flex-col justify-center overflow-y-auto px-6 py-10">
        <p className="text-sm font-medium text-muted">This is your line, {line.displayName}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance">
          Share it with anyone you want to hear from.
        </h1>
        <p className="mt-8 text-center text-4xl font-semibold tracking-wide text-balance tabular-nums md:text-5xl">
          {formatNumber(line.number)}
        </p>
        <p className="mt-3 text-center text-sm text-muted">Not a phone number. Just your NumberChat line.</p>
        <div className="mt-8 grid grid-cols-2 gap-3">
          <Button variant="ghost" onClick={() => void copyNumber(line.number)}>
            Copy number
          </Button>
          <Button variant="ghost" onClick={() => void shareNumber(line.number)}>
            Share my number
          </Button>
        </div>
        <Button className="mt-3 w-full" onClick={() => window.location.assign("/")}>
          Open chats
        </Button>
      </main>
    );
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
            {mode === "create" ? (
              <>
                <label className="block text-sm font-medium" htmlFor="name">
                  Your name
                </label>
                <input
                  id="name"
                  className={fieldClass}
                  autoComplete="name"
                  maxLength={40}
                  placeholder="What should people call you?"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </>
            ) : null}
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
              {busy
                ? accountReady
                  ? "Assigning your line…"
                  : "Please wait…"
                : mode === "create"
                  ? accountReady
                    ? "Get my number"
                    : "Create account"
                  : "Sign in"}
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
