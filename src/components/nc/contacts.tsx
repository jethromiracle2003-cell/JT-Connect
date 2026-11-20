import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Button, ChatSkeleton, fieldClass, Modal } from "@/components/nc/bits";
import { addContact, blockUser, ensureDm, listBlocked, listContacts, lookupNumber, unblockUser } from "@/lib/numberchat/api";
import { formatNumber } from "@/lib/numberchat/format";
import { errorText } from "@/lib/numberchat/share";
import type { AppSearch, Contact } from "@/lib/numberchat/types";

export function ContactsPane({ go }: { go: (search: AppSearch) => void }) {
  const queryClient = useQueryClient();
  const contacts = useQuery({
    queryKey: ["contacts"],
    queryFn: () => listContacts(),
    refetchInterval: 6000,
  });
  const blocked = useQuery({
    queryKey: ["blocked"],
    queryFn: () => listBlocked(),
    refetchInterval: 8000,
  });
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const needle = query.replace(/\s/g, "").toLowerCase();
    const nameNeedle = query.trim().toLowerCase();
    return (contacts.data ?? []).filter((contact) => {
      if (!nameNeedle) return true;
      return (
        contact.displayName.toLowerCase().includes(nameNeedle) ||
        contact.number.includes(needle)
      );
    });
  }, [contacts.data, query]);

  async function openChat(contact: Contact) {
    try {
      const result = await ensureDm({ data: { userId: contact.userId } });
      go({ tab: "chats", c: result.id });
    } catch (caught) {
      toast.error(errorText(caught, "Couldn't open that chat"));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="px-4 pt-safe pb-3">
        <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
        <label className="relative mt-3 block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or number"
            aria-label="Search contacts"
            className={`${fieldClass} pl-10`}
          />
        </label>
      </header>

      {contacts.isLoading ? <ChatSkeleton /> : null}
      {contacts.isError ? (
        <div className="px-6 py-8 text-center">
          <p className="text-sm text-muted">Couldn't load contacts.</p>
          <Button variant="ghost" className="mt-4" onClick={() => void contacts.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}

      {!contacts.isLoading && !contacts.isError && filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <h2 className="text-xl font-semibold text-balance">
            {contacts.data && contacts.data.length > 0 ? "No matches" : "No contacts yet"}
          </h2>
          <p className="mt-2 max-w-xs text-sm text-pretty text-muted">
            Add someone with their 10-digit NumberChat line.
          </p>
        </div>
      ) : null}

      {filtered.length > 0 ? (
        <ul className="min-h-0 flex-1 overflow-y-auto px-2">
          {filtered.map((contact) => (
            <li key={contact.userId} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void openChat(contact)}
                className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2 text-left"
              >
                <Avatar name={contact.displayName} src={contact.avatar} online={contact.online} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{contact.displayName}</span>
                  <span className="block text-sm text-muted tabular-nums">{formatNumber(contact.number)}</span>
                </span>
              </button>
              <button
                type="button"
                className="min-h-11 px-3 text-sm text-muted"
                onClick={() =>
                  void blockUser({ data: { userId: contact.userId } })
                    .then(() => {
                      void queryClient.invalidateQueries({ queryKey: ["blocked"] });
                      void queryClient.invalidateQueries({ queryKey: ["chats"] });
                      toast.success(`${contact.displayName} blocked`);
                    })
                    .catch((caught) => toast.error(errorText(caught, "Couldn't block them")))
                }
              >
                Block
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {(blocked.data ?? []).length > 0 ? (
        <div className="px-4 pb-2">
          <p className="text-sm font-medium text-muted">Blocked</p>
          <ul className="mt-1">
            {(blocked.data ?? []).map((person) => (
              <li key={person.userId} className="flex min-h-14 items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{person.displayName}</span>
                  <span className="block text-sm text-muted tabular-nums">{formatNumber(person.number)}</span>
                </span>
                <button
                  type="button"
                  className="min-h-11 text-sm font-medium"
                  onClick={() =>
                    void unblockUser({ data: { userId: person.userId } })
                      .then(() => {
                        void queryClient.invalidateQueries({ queryKey: ["blocked"] });
                        void queryClient.invalidateQueries({ queryKey: ["chats"] });
                        toast.success("Unblocked");
                      })
                      .catch((caught) => toast.error(errorText(caught, "Couldn't unblock them")))
                  }
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="px-4 py-3">
        <Button className="w-full" onClick={() => setOpen(true)}>
          Add contact
        </Button>
      </div>

      <AddContactDialog
        open={open}
        onOpenChange={setOpen}
        go={go}
        onAdded={(contact) => {
          void queryClient.invalidateQueries({ queryKey: ["contacts"] });
          toast.success(`${contact.displayName} added`);
        }}
      />
    </div>
  );
}

function AddContactDialog({
  open,
  onOpenChange,
  onAdded,
  go,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (contact: Contact) => void;
  go: (search: AppSearch) => void;
}) {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [found, setFound] = useState<Contact | null>(null);
  const [already, setAlready] = useState(false);
  const [blocked, setBlocked] = useState(false);

  function reset(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setRaw("");
      setMessage("");
      setFound(null);
      setAlready(false);
      setBlocked(false);
    }
  }

  async function lookUp() {
    setMessage("");
    setFound(null);
    setBusy(true);
    try {
      const result = await lookupNumber({ data: { number: raw } });
      if (!result.ok) {
        setMessage(
          result.reason === "self"
            ? "That's your own number."
            : result.reason === "invalid"
              ? "Enter a 10-digit number."
              : "User not found. Check the 10-digit number and try again.",
        );
        return;
      }
      setFound(result.contact);
      setAlready(result.already);
      setBlocked(result.blocked);
    } catch (caught) {
      setMessage(errorText(caught, "Couldn't look up that number"));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const result = await addContact({ data: { number: raw } });
      if (!result.ok) {
        setMessage(
          result.reason === "not_found"
            ? "User not found. Check the 10-digit number and try again."
            : result.reason === "self"
              ? "That's your own number."
              : result.reason === "blocked"
                ? "Unblock them before adding."
                : "Enter a 10-digit number.",
        );
        return;
      }
      onAdded(result.contact);
      reset(false);
    } catch (caught) {
      setMessage(errorText(caught, "Couldn't add that contact"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={reset} title="Add contact">
      <p className="text-sm text-pretty text-muted">
        Enter the 10-digit NumberChat line. If someone has it, you can add them.
      </p>
      <label className="mt-4 block text-sm font-medium" htmlFor="contact-number">
        Number
      </label>
      <input
        id="contact-number"
        inputMode="numeric"
        autoComplete="off"
        value={raw}
        placeholder="10 digits"
        className={`${fieldClass} mt-2 tabular-nums`}
        onChange={(event) => {
          setRaw(event.target.value.replace(/[^\d\s]/g, "").slice(0, 14));
          setFound(null);
          setMessage("");
        }}
      />
      {message ? <p className="mt-3 text-sm font-medium text-danger">{message}</p> : null}
      {found ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
          <Avatar name={found.displayName} src={found.avatar} online={found.online} />
          <div className="min-w-0">
            <div className="truncate font-semibold">{found.displayName}</div>
            <div className="text-sm text-muted tabular-nums">{formatNumber(found.number)}</div>
          </div>
        </div>
      ) : null}
      <div className="mt-5 grid gap-2">
        {found ? (
          <>
            <Button
              className="w-full"
              disabled={busy || blocked}
              onClick={() =>
                void (async () => {
                  setBusy(true);
                  try {
                    const result = await ensureDm({ data: { userId: found.userId } });
                    reset(false);
                    go({ tab: "chats", c: result.id });
                  } catch (caught) {
                    setMessage(errorText(caught, "Couldn't open that chat"));
                  } finally {
                    setBusy(false);
                  }
                })()
              }
            >
              Message
            </Button>
            <Button variant="ghost" className="w-full" disabled={busy || blocked} onClick={() => void save()}>
              {busy ? "Adding…" : already ? "Already saved" : "Add to contacts"}
            </Button>
            {blocked ? <p className="text-sm text-danger">You blocked this person. Unblock them first.</p> : null}
          </>
        ) : (
          <Button className="w-full" disabled={busy} onClick={() => void lookUp()}>
            {busy ? "Checking…" : "Check number"}
          </Button>
        )}
      </div>
    </Modal>
  );
}
