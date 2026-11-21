import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Button, fieldClass, Mark } from "@/components/nc/bits";
import { completeOnboarding } from "@/lib/numberchat/api";
import { formatNumber } from "@/lib/numberchat/format";
import { compressImage } from "@/lib/numberchat/media";
import { copyNumber, errorText, shareNumber } from "@/lib/numberchat/share";
import type { Profile } from "@/lib/numberchat/types";
import { useCurrentUser } from "@/lib/auth/use-current-user";

export function AssignedLine({
  profile,
  onReady,
}: {
  profile: Profile;
  onReady: () => void;
}) {
  return (
    <main className="mx-auto flex h-full w-full max-w-md flex-col justify-center overflow-y-auto px-6 py-10">
      <p className="text-sm font-medium text-muted">This is your line, {profile.displayName}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance">
        Share it with anyone you want to hear from.
      </h1>
      <p className="mt-8 text-center text-4xl font-semibold tracking-wide text-balance tabular-nums md:text-5xl">
        {formatNumber(profile.number)}
      </p>
      <p className="mt-3 text-center text-sm text-muted">Not a phone number. Just your NumberChat line.</p>
      <div className="mt-8 grid grid-cols-2 gap-3">
        <Button variant="ghost" onClick={() => void copyNumber(profile.number)}>
          Copy number
        </Button>
        <Button variant="ghost" onClick={() => void shareNumber(profile.number)}>
          Share my number
        </Button>
      </div>
      <Button className="mt-3 w-full" onClick={onReady}>
        Open chats
      </Button>
    </main>
  );
}

export function Onboarding({ onReady }: { onReady: (profile: Profile) => void }) {
  const user = useCurrentUser();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const suggested = user?.displayName;
    if (!suggested || suggested.includes("@")) return;
    setName((current) => current || suggested);
  }, [user?.displayName]);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    try {
      setAvatar(await compressImage(file, 512, 200_000));
    } catch (caught) {
      toast.error(errorText(caught, "Couldn't use that photo"));
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const next = await completeOnboarding({ data: { displayName: name, avatar } });
      setProfile(next);
    } catch (caught) {
      setError(errorText(caught, "Couldn't assign your number"));
    } finally {
      setBusy(false);
    }
  }

  if (profile) {
    return <AssignedLine profile={profile} onReady={() => onReady(profile)} />;
  }

  return (
    <main className="mx-auto flex h-full w-full max-w-md flex-col justify-center overflow-y-auto px-6 py-10">
      <Mark className="size-12" />
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-balance">
        What should people call you?
      </h1>
      <p className="mt-2 text-sm text-pretty text-muted">
        You'll get a unique 10-digit number as soon as you continue.
      </p>
      <form className="mt-8 space-y-5" onSubmit={(event) => void submit(event)}>
        <div className="flex items-center gap-4">
          <label className="relative cursor-pointer">
            <Avatar name={name || "You"} src={avatar} size="lg" />
            <span className="absolute right-0 bottom-0 grid size-8 place-items-center rounded-full bg-accent text-accent-fg">
              <Camera className="size-4" />
            </span>
            <span className="sr-only">Profile photo</span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => void onPhoto(event.target.files?.[0])}
            />
          </label>
          <p className="text-sm text-muted">Photo is optional.</p>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium" htmlFor="display-name">
            Display name
          </label>
          <input
            id="display-name"
            className={fieldClass}
            value={name}
            maxLength={40}
            autoComplete="nickname"
            placeholder="Your name"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={busy || !name.trim()}>
          {busy ? "Assigning your line…" : "Get my number"}
        </Button>
      </form>
    </main>
  );
}
