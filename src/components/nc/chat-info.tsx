import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Search } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Button, fieldClass, Modal } from "@/components/nc/bits";
import {
  addGroupMembers,
  blockUser,
  leaveGroup,
  listContacts,
  removeGroupMember,
  renameGroup,
  searchThread,
  setDisappear,
} from "@/lib/numberchat/api";
import { formatBubbleTime, formatNumber } from "@/lib/numberchat/format";
import { errorText } from "@/lib/numberchat/share";
import type { AppSearch, Contact, Thread, ThreadHit } from "@/lib/numberchat/types";

const TIMERS = [
  { seconds: 0, label: "Off" },
  { seconds: 86400, label: "24 hours" },
  { seconds: 604800, label: "7 days" },
] as const;

export function ChatInfo({
  open,
  onOpenChange,
  thread,
  meId,
  go,
  onJump,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  thread: Thread;
  meId: string;
  go: (search: AppSearch) => void;
  onJump: (id: string) => void;
}) {
  const client = useQueryClient();
  const group = thread.conversation.kind === "group";
  const admin = thread.me.role === "admin";
  const [name, setName] = useState(thread.conversation.name ?? "");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ThreadHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    setName(thread.conversation.name ?? "");
  }, [thread.conversation.name]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 1) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setSearching(true);
      void searchThread({ data: { conversationId: thread.conversation.id, query: text } })
        .then(setHits)
        .catch((caught) => toast.error(errorText(caught, "Couldn't search")))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, thread.conversation.id]);

  async function saveName() {
    try {
      await renameGroup({ data: { conversationId: thread.conversation.id, name } });
      await client.invalidateQueries({ queryKey: ["thread", thread.conversation.id] });
      await client.invalidateQueries({ queryKey: ["chats"] });
      toast.success("Group renamed");
    } catch (caught) {
      toast.error(errorText(caught, "Couldn't rename the group"));
    }
  }

  async function timer(seconds: number) {
    try {
      await setDisappear({ data: { conversationId: thread.conversation.id, seconds } });
      await client.invalidateQueries({ queryKey: ["thread", thread.conversation.id] });
      toast.success(seconds === 0 ? "Disappearing messages off" : "New messages will disappear");
    } catch (caught) {
      toast.error(errorText(caught, "Couldn't update that"));
    }
  }

  async function remove(userId: string) {
    try {
      await removeGroupMember({ data: { conversationId: thread.conversation.id, userId } });
      await client.invalidateQueries({ queryKey: ["thread", thread.conversation.id] });
    } catch (caught) {
      toast.error(errorText(caught, "Couldn't remove them"));
    }
  }

  async function leave() {
    try {
      await leaveGroup({ data: { conversationId: thread.conversation.id } });
      await client.invalidateQueries({ queryKey: ["chats"] });
      onOpenChange(false);
      go({ tab: "chats" });
    } catch (caught) {
      toast.error(errorText(caught, "Couldn't leave the group"));
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={group ? "Group" : "Chat"}>
      <label className="relative block">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search in chat"
          aria-label="Search in chat"
          className={`${fieldClass} pl-10`}
        />
      </label>
      {searching ? <p className="mt-3 text-sm text-muted">Searching…</p> : null}
      {hits.length > 0 ? (
        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                className="w-full rounded-2xl px-2 py-2 text-left"
                onClick={() => {
                  onJump(hit.id);
                  onOpenChange(false);
                }}
              >
                <span className="block text-xs text-muted">
                  {hit.senderName} · {formatBubbleTime(hit.createdAt)}
                </span>
                <span className="block truncate text-sm">{hit.body}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {query.trim() && !searching && hits.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No messages match.</p>
      ) : null}

      <p className="mt-6 text-sm font-medium">Disappearing messages</p>
      <p className="mt-1 text-sm text-pretty text-muted">New messages vanish after this. Older ones stay.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {TIMERS.map((option) => {
          const on = thread.conversation.disappearSeconds === option.seconds;
          return (
            <button
              key={option.seconds}
              type="button"
              className={`min-h-11 rounded-2xl px-2 text-sm font-medium ${
                on ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg"
              }`}
              onClick={() => void timer(option.seconds)}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {!group ? (
        <Button
          variant="danger"
          className="mt-6 w-full"
          onClick={() => {
            const peer = thread.members.find((member) => member.userId !== meId);
            if (!peer) return;
            void blockUser({ data: { userId: peer.userId } })
              .then(() => {
                void client.invalidateQueries({ queryKey: ["chats"] });
                void client.invalidateQueries({ queryKey: ["blocked"] });
                onOpenChange(false);
                go({ tab: "chats" });
              })
              .catch((caught) => toast.error(errorText(caught, "Couldn't block them")));
          }}
        >
          Block
        </Button>
      ) : null}

      {group ? (
        <div className="mt-6">
          {admin ? (
            <div className="flex gap-2">
              <input
                className={fieldClass}
                value={name}
                maxLength={48}
                aria-label="Group name"
                onChange={(event) => setName(event.target.value)}
              />
              <Button
                variant="ghost"
                disabled={!name.trim() || name.trim() === (thread.conversation.name ?? "")}
                onClick={() => void saveName()}
              >
                Save
              </Button>
            </div>
          ) : (
            <p className="font-semibold">{thread.conversation.name || "Group"}</p>
          )}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm font-medium">{thread.members.length} people</p>
            {admin ? (
              <button type="button" className="min-h-11 text-sm font-medium" onClick={() => setAddOpen(true)}>
                Add
              </button>
            ) : null}
          </div>
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
            {thread.members.map((member) => (
              <li key={member.userId} className="flex min-h-14 items-center gap-3">
                <Avatar name={member.displayName} src={member.avatar} size="sm" online={member.online} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {member.userId === meId ? "You" : member.displayName}
                  </span>
                  <span className="block text-sm text-muted tabular-nums">
                    {member.role === "admin" ? "Admin · " : ""}
                    {formatNumber(member.number)}
                  </span>
                </span>
                {admin && member.userId !== meId && member.role !== "admin" ? (
                  <button
                    type="button"
                    className="min-h-11 text-sm text-danger"
                    onClick={() => void remove(member.userId)}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <Button variant="danger" className="mt-4 w-full" onClick={() => void leave()}>
            Leave group
          </Button>
          <AddMembers
            open={addOpen}
            onOpenChange={setAddOpen}
            conversationId={thread.conversation.id}
            existing={new Set(thread.members.map((member) => member.userId))}
          />
        </div>
      ) : null}
    </Modal>
  );
}

function AddMembers({
  open,
  onOpenChange,
  conversationId,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  existing: Set<string>;
}) {
  const client = useQueryClient();
  const contacts = useQuery({ queryKey: ["contacts"], queryFn: () => listContacts(), enabled: open });
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const available = (contacts.data ?? []).filter((contact) => !existing.has(contact.userId));

  async function add() {
    setBusy(true);
    try {
      await addGroupMembers({ data: { conversationId, memberIds: picked } });
      await client.invalidateQueries({ queryKey: ["thread", conversationId] });
      setPicked([]);
      onOpenChange(false);
    } catch (caught) {
      toast.error(errorText(caught, "Couldn't add them"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Add people">
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {available.map((contact: Contact) => {
          const on = picked.includes(contact.userId);
          return (
            <li key={contact.userId}>
              <button
                type="button"
                className="flex min-h-14 w-full items-center gap-3 text-left"
                onClick={() =>
                  setPicked((current) =>
                    current.includes(contact.userId)
                      ? current.filter((id) => id !== contact.userId)
                      : [...current, contact.userId],
                  )
                }
              >
                <Avatar name={contact.displayName} src={contact.avatar} size="sm" />
                <span className="min-w-0 flex-1 truncate font-medium">{contact.displayName}</span>
                <span
                  className={`grid size-6 place-items-center rounded-full border ${
                    on ? "border-accent bg-accent text-accent-fg" : "border-line"
                  }`}
                >
                  {on ? <Check className="size-3.5" /> : null}
                </span>
              </button>
            </li>
          );
        })}
        {contacts.data && available.length === 0 ? (
          <li className="py-6 text-sm text-muted">Everyone in your contacts is already here.</li>
        ) : null}
      </ul>
      <Button className="mt-4 w-full" disabled={busy || picked.length === 0} onClick={() => void add()}>
        {busy ? "Adding…" : "Add"}
      </Button>
    </Modal>
  );
}
