import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { Button, fieldClass, Mark } from "@/components/nc/bits";
import { completeOnboarding } from "@/lib/numberchat/api";
import { errorText } from "@/lib/numberchat/share";
import type { Profile } from "@/lib/numberchat/types";

export const NEW_LINE_KEY = "nc-new-line";

function displayNameFrom(raw: string) {
  const name = raw.replace(/[\u0000-\u001F]/g, "").trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 40) return null;
  return name;
}

/** Same name always maps to the same hidden login. The person never sees it. */
async function loginEmail(displayName: string) {
  const key = displayName.normalize("NFKC").toLowerCase();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hex = [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${hex}@users.numberchat.app`;
}

function friendlyAuthError(message: string | undefined, mode: "create" | "signin") {
  const text = message ?? "";
  if (/already exists/i.test(text)) return "That name is already taken. Pick another.";
  if (/invalid email or password/i.test(text)) return "That name and password don't match.";
  if (/too short/i.test(text)) return "Use at least 8 characters.";
  return text || (mode === "create" ? "Couldn't create that account." : "That didn't work. Try again.");
}

export function Welcome() {
  const [mode, setMode] = useState<"create" | "signin">("create");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountReady, setAccountReady] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const displayName = displayNameFrom(name);
    if (!displayName) {
      setError("Enter your name.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    setBusy(true);
    const email = await loginEmail(displayName);
    if (mode === "signin") {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setBusy(false);
        setError(friendlyAuthError(result.error.message, mode));
        return;
      }
      window.location.assign("/");
      return;
    }
    if (!accountReady) {
      const result = await authClient.signUp.email({ email, password, name: displayName });
      if (result.error) {
        setBusy(false);
        setError(friendlyAuthError(result.error.message, mode));
        return;
      }
      setAccountReady(true);
    }
    try {
      const profile: Profile = await completeOnboarding({ data: { displayName, avatar: null } });
      sessionStorage.setItem(NEW_LINE_KEY, JSON.stringify(profile));
      window.location.assign("/");
    } catch (caught) {
      setBusy(false);
      setError(errorText(caught, "Your account is ready, but the number wasn't assigned. Try again."));
    }
  }

  return (
    <main className="mx-auto flex h-full w-full max-w-md flex-col justify-center overflow-y-auto px-6 py-10">
      <div className="rise">
        <Mark className="size-14" />
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance">
          A number that belongs to you.
        </h1>
        <p className="mt-3 text-base text-pretty text-muted">
          Sign up with your name. NumberChat gives you a private 10-digit line.
        </p>
      </div>

      <form className="mt-8 space-y-3" onSubmit={(event) => void submit(event)}>
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
            setAccountReady(false);
            setError("");
          }}
        >
          {mode === "create" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </form>
    </main>
  );
}
