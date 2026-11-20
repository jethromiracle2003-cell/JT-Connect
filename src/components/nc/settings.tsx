import { useEffect, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, LogOut, QrCode, Share2 } from "lucide-react";
import { toast } from "sonner";
import { authEnabled, signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { Avatar, Button, fieldClass, Modal, ToggleRow } from "@/components/nc/bits";
import { ShareCard } from "@/components/nc/share-card";
import { useTheme } from "@/components/nc/theme";
import { updateProfile } from "@/lib/numberchat/api";
import { formatNumber } from "@/lib/numberchat/format";
import { compressImage } from "@/lib/numberchat/media";
import { copyNumber, errorText, shareNumber } from "@/lib/numberchat/share";
import type { Profile } from "@/lib/numberchat/types";

const subscribeNothing = () => () => {};

export function SettingsPane({ profile }: { profile: Profile }) {
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const [name, setName] = useState(profile.displayName);
  const [avatar, setAvatar] = useState<string | null>(profile.avatar);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [notify, setNotify] = useState(false);
  const [card, setCard] = useState(false);
  const gateSession = useSyncExternalStore(subscribeNothing, hasGateSessionMarker, () => false);

  useEffect(() => {
    setName(profile.displayName);
    setAvatar(profile.avatar);
  }, [profile.displayName, profile.avatar]);

  useEffect(() => {
    try {
      setNotify(localStorage.getItem("nc-notify") === "on");
    } catch {
      setNotify(false);
    }
  }, []);

  const dirty = name.trim() !== profile.displayName || avatar !== profile.avatar;

  async function save() {
    setBusy(true);
    try {
      const next = await updateProfile({ data: { displayName: name, avatar } });
      queryClient.setQueryData(["me", profile.userId], next);
      toast.success("Profile updated");
    } catch (caught) {
      toast.error(errorText(caught, "Couldn't update your profile"));
    } finally {
      setBusy(false);
    }
  }

  async function onNotify(next: boolean) {
    if (next && typeof Notification !== "undefined") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Notifications are blocked in this browser");
        setNotify(false);
        return;
      }
    }
    setNotify(next);
    try {
      localStorage.setItem("nc-notify", next ? "on" : "off");
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-safe pb-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <div className="mt-6 flex items-center gap-4">
        <label className="relative cursor-pointer">
          <Avatar name={name || profile.displayName} src={avatar} size="lg" />
          <span className="sr-only">Change photo</span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void compressImage(file, 512, 200_000)
                .then(setAvatar)
                .catch((caught) => toast.error(errorText(caught, "Couldn't use that photo")));
            }}
          />
        </label>
        <div className="min-w-0 flex-1">
          <label className="mb-2 block text-sm font-medium" htmlFor="settings-name">
            Display name
          </label>
          <input
            id="settings-name"
            className={fieldClass}
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
      </div>
      {dirty ? (
        <Button className="mt-4 w-full" disabled={busy || !name.trim()} onClick={() => void save()}>
          {busy ? "Saving…" : "Save profile"}
        </Button>
      ) : null}
      {avatar ? (
        <button
          type="button"
          className="mt-3 min-h-11 text-sm text-muted"
          onClick={() => setAvatar(null)}
        >
          Remove photo
        </button>
      ) : null}

      <section className="mt-8 rounded-3xl bg-surface p-4">
        <p className="text-sm text-muted">Your line</p>
        <p className="mt-1 text-2xl font-semibold tracking-wide tabular-nums">{formatNumber(profile.number)}</p>
        <p className="mt-1 text-sm text-pretty text-muted">
          People reach you with this number. It isn't a phone number.
        </p>
        <div className="mt-4 grid gap-3">
          <Button onClick={() => setCard(true)}>
            <QrCode className="size-4" />
            Share card
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="ghost" onClick={() => void copyNumber(profile.number)}>
              <Copy className="size-4" />
              Copy
            </Button>
            <Button variant="ghost" onClick={() => void shareNumber(profile.number)}>
              <Share2 className="size-4" />
              Share
            </Button>
          </div>
        </div>
      </section>
      <Modal open={card} onOpenChange={setCard} title="Share card">
        <ShareCard name={profile.displayName} number={profile.number} />
      </Modal>

      <section className="mt-6 divide-y divide-line border-t border-line">
        <ToggleRow
          label="Light mode"
          hint="Dark is the default."
          checked={theme === "light"}
          onCheckedChange={(checked) => setTheme(checked ? "light" : "dark")}
        />
        <ToggleRow
          label="Notifications"
          hint="A ping when a new message arrives and NumberChat is in the background."
          checked={notify}
          onCheckedChange={(checked) => void onNotify(checked)}
        />
      </section>

      {authEnabled && !gateSession ? (
        <Button
          variant="danger"
          className="mt-8 w-full"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true);
            void signOut().catch(() => {
              setSigningOut(false);
              toast.error("Couldn't log out. Try again.");
            });
          }}
        >
          <LogOut className="size-4" />
          {signingOut ? "Logging out…" : "Log out"}
        </Button>
      ) : (
        <p className="mt-8 text-sm text-muted">Signed in with Grok.</p>
      )}
    </div>
  );
}
