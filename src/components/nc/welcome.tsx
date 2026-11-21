import { useState } from "react";
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

function friendlyAuthError(message: string | undefined, mode: "create" | "signin") {
  const text = message ?? "";
  if (/already exists/i.test(text)) return "That name is already taken. Pick another.";
  if (/invalid email or password/i.test(text)) return "That name and password don't match.";
  if (/too short/i.test(text)) return "Use at least 8 characters.";
  return text || (mode === "create" ? "Couldn't create that account." : "That didn't work. Try again.");
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type AuthCall = { ok: true } | { ok: false; message: string; taken?: boolean };

/**
 * Free Workers kill a cold sign-up with an empty 500 (10ms CPU). Retry once the
 * isolate is warm, and read the body ourselves so a non-JSON error is visible.
 */
async function postAuth(
  mode: "create" | "signin",
  body: { name: string; password: string },
): Promise<AuthCall> {
  let last = friendlyAuthError(undefined, mode);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch("/api/line", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ mode, ...body }),
      });
      const text = await response.text();
      let data: { message?: string; code?: string; ok?: boolean; detail?: string } | null = null;
      try {
        data = text ? (JSON.parse(text) as NonNullable<typeof data>) : null;
      } catch {
        data = null;
      }
      if (response.ok && data?.ok) return { ok: true };
      const raw = (data?.message || data?.detail || "").trim();
      const taken =
        /already exists/i.test(raw) || data?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL";
      if (taken) return { ok: false, message: friendlyAuthError(raw, mode), taken: true };
      if (!data || response.status >= 500) {
        last = friendlyAuthError(raw, mode);
        await wait(400 * (attempt + 1));
        continue;
      }
      return { ok: false, message: friendlyAuthError(raw, mode) };
    } catch {
      await wait(400 * (attempt + 1));
    }
  }
  return { ok: false, message: last };
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
    try {
      if (mode === "signin") {
        const result = await postAuth("signin", { name: displayName, password });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        window.location.assign("/");
        return;
      }
      if (!accountReady) {
        const created = await postAuth("create", { name: displayName, password });
        if (!created.ok && created.taken) {
          const signed = await postAuth("signin", { name: displayName, password });
          if (!signed.ok) {
            setError("That name is already taken. Pick another.");
            return;
          }
        } else if (!created.ok) {
          setError(created.message);
          return;
        }
        setAccountReady(true);
      }
      let profile: Profile | null = null;
      let lineError = "Your account is ready, but the number wasn't assigned. Try again.";
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          profile = await completeOnboarding({ data: { displayName, avatar: null } });
          break;
        } catch (caught) {
          lineError = errorText(caught, lineError);
          await wait(400 * (attempt + 1));
        }
      }
      if (!profile) {
        setError(lineError);
        return;
      }
      sessionStorage.setItem(NEW_LINE_KEY, JSON.stringify(profile));
      window.location.assign("/");
    } catch (caught) {
      setError(errorText(caught, "Your account is ready, but the number wasn't assigned. Try again."));
    } finally {
      setBusy(false);
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
