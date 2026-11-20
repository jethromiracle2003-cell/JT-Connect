import { useMemo, useRef, useState } from "react";
import { Archive, Bell, BellOff, Check, Copy, Pin, PinOff, QrCode, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Button, ChatSkeleton, fieldClass, IconButton, Mark, Modal } from "@/components/nc/bits";
import { ShareCard } from "@/components/nc/share-card";
import { acceptRequest, blockUser, createGroup, ignoreRequest, listContacts, setChatPrefs } from "@/lib/numberchat/api";
import { formatChatTime, formatNumber } from "@/lib/numberchat/format";
import { compressImage } from "@/lib/numberchat/media";
import { copyNumber, errorText, shareNumber } from "@/lib/numberchat/share";
import type { AppSearch, ChatSummary, Contact, Profile } from "@/lib/numberchat/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function ChatsPane({
  profile,
  chats,
  loading,
  error,
  onRetry,
  activeId,
  go,
}: {
  profile: Profile;
  chats: ChatSummary[] | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  activeId?: string;
  go: (search: AppSearch) => void;
}) {
  const [query, setQuery] = useState("");
  const [groupOpen, setGroupOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [box, setBox] = useState<"inbox" | "requests" | "archived">("inbox");
  const [menu, setMenu] = useState<ChatSummary | null>(null);
  const requests = (chats ?? []).filter((chat) => chat.requestStatus === "pending").length;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const scoped = (chats ?? []).filter((chat) => {
      if (box === "requests") return chat.requestStatus === "pending";
      if (chat.requestStatus === "pending") return false;
      if (box === "archived") return chat.archived;
      return !chat.archived;
    });
    if (!needle) return scoped;
    return scoped.filter((chat) => {
      const hay = `${chat.title} ${chat.peerNumber ?? ""} ${chat.preview}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [chats, query, box]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="px-4 pt-safe pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Chats</h1>
            <button
              type="button"
              className="mt-1 inline-flex min-h-11 items-center gap-2 text-sm text-muted tabular-nums"
              onClick={() => void copyNumber(profile.number)}
            >
              {formatNumber(profile.number)}
              <Copy className="size-4" />
              <span className="sr-only">Copy your number</span>
            </button>
          </div>
          <div className="flex gap-2">
            <IconButton label="Share your number" className="bg-surface-2" onClick={() => setCardOpen(true)}>
              <QrCode className="size-5" />
            </IconButton>
            <IconButton label="New group" className="bg-surface-2" onClick={() => setGroupOpen(true)}>
              <Users className="size-5" />
            </IconButton>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 rounded-2xl bg-surface-2 p-1 text-sm font-medium">
          {(
            [
              ["inbox", "Chats"],
              ["requests", requests ? `Requests ${requests}` : "Requests"],
              ["archived", "Archived"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`min-h-11 rounded-xl ${box === id ? "bg-bg text-fg" : "text-muted"}`}
              onClick={() => setBox(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {chats && chats.length > 0 && box === "inbox" ? (
          <label className="relative mt-2 block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chats"
              className={`${fieldClass} pl-10`}
              aria-label="Search chats"
            />
          </label>
        ) : null}
      </header>

      {loading ? <ChatSkeleton /> : null}
      {error ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-muted">Couldn't load chats.</p>
          <Button variant="ghost" className="mt-4" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}

      {!loading && !error && filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <Mark className="size-16" />
          <h2 className="mt-5 text-xl font-semibold text-balance">
            {chats && chats.length > 0 && query.trim()
              ? "No matches"
              : box === "requests"
                ? "No requests"
                : box === "archived"
                  ? "Nothing archived"
                  : "Your line is quiet"}
          </h2>
          <p className="mt-2 max-w-xs text-sm text-pretty text-muted">
            {chats && chats.length > 0 && query.trim()
              ? "Try another name or number."
              : box === "requests"
                ? "When someone you haven't saved messages you, it lands here."
                : box === "archived"
                  ? "Archived chats stay out of the main list."
                  : "Share your number. When someone messages it, the conversation lands here."}
          </p>
          {box === "inbox" && !(chats && chats.length > 0 && query.trim()) ? (
            <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
              <Button onClick={() => void shareNumber(profile.number)}>Share my number</Button>
              <Button variant="ghost" onClick={() => go({ tab: "contacts" })}>
                Add a contact
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && filtered.length > 0 ? (
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {filtered.map((chat) => (
            <li key={chat.id}>
              <ChatRow
                chat={chat}
                active={activeId === chat.id}
                onOpen={() => go({ tab: "chats", c: chat.id })}
                onMenu={() => setMenu(chat)}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <GroupDialog open={groupOpen} onOpenChange={setGroupOpen} go={go} />
      <Modal open={cardOpen} onOpenChange={setCardOpen} title="Your line">
        <ShareCard name={profile.displayName} number={profile.number} />
      </Modal>
      <ChatMenu chat={menu} onClose={() => setMenu(null)} go={go} activeId={activeId} />
    </div>
  );
}

function ChatRow({
  chat,
  active,
  onOpen,
  onMenu,
}: {
  chat: ChatSummary;
  active: boolean;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const timer = useRef(0);
  const hold = useRef(false);
  return (
    <button
      type="button"
      onPointerDown={() => {
        hold.current = false;
        timer.current = window.setTimeout(() => {
          hold.current = true;
          onMenu();
        }, 480);
      }}
      onPointerUp={() => window.clearTimeout(timer.current)}
      onPointerLeave={() => window.clearTimeout(timer.current)}
      onPointerCancel={() => window.clearTimeout(timer.current)}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu();
      }}
      onClick={() => {
        if (hold.current) return;
        onOpen();
      }}
      className={`flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left ${
        active ? "bg-surface-2" : ""
      }`}
    >
      <Avatar name={chat.title} src={chat.avatar} online={chat.online} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1">
            {chat.pinned ? <Pin className="size-3.5 shrink-0 text-muted" /> : null}
            {chat.muted ? <BellOff className="size-3.5 shrink-0 text-muted" /> : null}
            <span className="truncate font-semibold">{chat.title}</span>
          </span>
          <span className={`shrink-0 text-xs tabular-nums ${chat.unread ? "text-fg" : "text-muted"}`}>
            {formatChatTime(chat.lastMessageAt)}
          </span>
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-sm text-muted">{chat.preview}</span>
          {chat.unread > 0 ? (
            <span className="grid min-w-5 place-items-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-fg tabular-nums">
              {chat.unread > 99 ? "99+" : chat.unread}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

function ChatMenu({
  chat,
  onClose,
  go,
  activeId,
}: {
  chat: ChatSummary | null;
  onClose: () => void;
  go: (search: AppSearch) => void;
  activeId?: string;
}) {
  const client = useQueryClient();
  async function run(work: () => Promise<unknown>, done?: () => void) {
    try {
      await work();
      await client.invalidateQueries({ queryKey: ["chats"] });
      done?.();
      onClose();
    } catch (caught) {
      toast.error(errorText(caught, "Couldn't update that chat"));
    }
  }
  if (!chat) return null;
  return (
    <Modal open={Boolean(chat)} onOpenChange={(open) => !open && onClose()} title={chat.title}>
      <div className="grid gap-2">
        {chat.requestStatus === "pending" ? (
          <>
            <Button
              onClick={() =>
                void run(() => acceptRequest({ data: { conversationId: chat.id } }))
              }
            >
              Accept request
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                void run(
                  () => ignoreRequest({ data: { conversationId: chat.id } }),
                  () => {
                    if (activeId === chat.id) go({ tab: "chats" });
                  },
                )
              }
            >
              Ignore
            </Button>
          </>
        ) : null}
        <Button
          variant="ghost"
          onClick={() => void run(() => setChatPrefs({ data: { conversationId: chat.id, pinned: !chat.pinned } }))}
        >
          {chat.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
          {chat.pinned ? "Unpin" : "Pin"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => void run(() => setChatPrefs({ data: { conversationId: chat.id, muted: !chat.muted } }))}
        >
          {chat.muted ? <Bell className="size-4" /> : <BellOff className="size-4" />}
          {chat.muted ? "Unmute" : "Mute"}
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            void run(() => setChatPrefs({ data: { conversationId: chat.id, archived: !chat.archived } }))
          }
        >
          <Archive className="size-4" />
          {chat.archived ? "Unarchive" : "Archive"}
        </Button>
        {chat.peerId ? (
          <Button
            variant="danger"
            onClick={() =>
              void run(
                () => blockUser({ data: { userId: chat.peerId! } }),
                () => {
                  if (activeId === chat.id) go({ tab: "chats" });
                },
              )
            }
          >
            Block
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}

function GroupDialog({
  open,
  onOpenChange,
  go,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  go: (search: AppSearch) => void;
}) {
  const contacts = useQuery({
    queryKey: ["contacts"],
    queryFn: () => listContacts(),
    enabled: open,
  });
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggle(id: string) {
    setPicked((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function create() {
    setError("");
    setBusy(true);
    try {
      const result = await createGroup({ data: { name, avatar, memberIds: picked } });
      onOpenChange(false);
      setName("");
      setAvatar(null);
      setPicked([]);
      go({ tab: "chats", c: result.id });
    } catch (caught) {
      setError(errorText(caught, "Couldn't create the group"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="New group">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <label className="relative shrink-0 cursor-pointer">
            <Avatar name={name || "Group"} src={avatar} />
            <span className="sr-only">Group photo</span>
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
          <input
            className={fieldClass}
            placeholder="Group name"
            value={name}
            maxLength={48}
            aria-label="Group name"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <p className="text-sm text-muted">Choose people by the numbers already in your contacts.</p>
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {(contacts.data ?? []).map((contact: Contact) => {
            const on = picked.includes(contact.userId);
            return (
              <li key={contact.userId}>
                <button
                  type="button"
                  onClick={() => toggle(contact.userId)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-1 text-left"
                >
                  <Avatar name={contact.displayName} src={contact.avatar} size="sm" online={contact.online} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{contact.displayName}</span>
                    <span className="block text-sm text-muted tabular-nums">{formatNumber(contact.number)}</span>
                  </span>
                  <span
                    className={`grid size-6 place-items-center rounded-full border ${
                      on ? "border-accent bg-accent text-accent-fg" : "border-line"
                    }`}
                    aria-hidden="true"
                  >
                    {on ? <Check className="size-3.5" /> : null}
                  </span>
                </button>
              </li>
            );
          })}
          {contacts.data && contacts.data.length === 0 ? (
            <li className="px-1 py-6 text-sm text-muted">Add contacts before starting a group.</li>
          ) : null}
        </ul>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button className="w-full" disabled={busy || !name.trim() || picked.length === 0} onClick={() => void create()}>
          {busy ? "Creating…" : `Create group${picked.length ? ` · ${picked.length}` : ""}`}
        </Button>
      </div>
    </Modal>
  );
}
