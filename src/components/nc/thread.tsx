import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Forward, ImagePlus, Mic, MoreHorizontal, Pause, Pencil, Play, Search, Send, Trash2, Reply } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Button, IconButton, Modal, Ticks } from "@/components/nc/bits";
import { ChatInfo } from "@/components/nc/chat-info";
import { usePageVisible } from "@/components/nc/use-visible";
import {
  acceptRequest,
  deleteMessage,
  editMessage,
  forwardMessage,
  getThread,
  ignoreRequest,
  listChats,
  markRead,
  searchThread,
  sendMessage,
  setTyping,
  toggleReaction,
  unblockUser,
} from "@/lib/numberchat/api";
import {
  formatBubbleTime,
  formatDayLabel,
  formatLastSeen,
  formatNumber,
  sameDay,
} from "@/lib/numberchat/format";
import { blobToDataUrl, compressImage } from "@/lib/numberchat/media";
import { errorText } from "@/lib/numberchat/share";
import { usePending, type PendingMessage } from "@/lib/numberchat/store";
import { queryClient } from "@/lib/query-client";
import { REACTIONS, type AppSearch, type ReactionEmoji, type ThreadMessage } from "@/lib/numberchat/types";

type ReplyTarget = { id: string; name: string; preview: string };

export function ThreadPane({
  conversationId,
  meId,
  go,
}: {
  conversationId: string;
  meId: string;
  go: (search: AppSearch) => void;
}) {
  const client = useQueryClient();
  const visible = usePageVisible();
  const mediaCache = useRef(new Map<string, string>());
  const thread = useQuery({
    queryKey: ["thread", conversationId],
    queryFn: () =>
      getThread({
        data: { conversationId, haveMedia: [...mediaCache.current.keys()] },
      }),
    refetchInterval: visible ? 1500 : 8000,
  });
  const pending = usePending((state) => state.pending);
  const addPending = usePending((state) => state.add);
  const patchPending = usePending((state) => state.patch);
  const dropPending = usePending((state) => state.drop);

  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState<ReplyTarget | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recMs, setRecMs] = useState(0);
  const [zoom, setZoom] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string } | null>(null);
  const [forwardId, setForwardId] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const [pinned, setPinned] = useState(true);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const discardRef = useRef(false);
  const releasedRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft("");
    setReply(null);
    setActiveId(null);
    setConfirmDelete(false);
    setEditing(null);
    setForwardId(null);
    setFinding(false);
    stickRef.current = true;
    setPinned(true);
  }, [conversationId]);

  useEffect(() => {
    if (!thread.data) return;
    const ids = new Set(thread.data.messages.map((message) => message.id));
    for (const item of pending) {
      if (item.conversationId === conversationId && ids.has(item.id)) dropPending(item.id);
    }
  }, [thread.data, pending, conversationId, dropPending]);

  const lastId = thread.data?.messages.at(-1)?.id ?? "";
  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => {
      void markRead({ data: { conversationId } })
        .then(() => client.invalidateQueries({ queryKey: ["chats"] }))
        .catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [conversationId, lastId, visible, client]);

  const typingOn = draft.trim().length > 0;
  useEffect(() => {
    if (!typingOn) return;
    const ping = () => {
      void setTyping({ data: { conversationId, typing: true } }).catch(() => undefined);
    };
    ping();
    const timer = window.setInterval(ping, 2000);
    return () => {
      window.clearInterval(timer);
      void setTyping({ data: { conversationId, typing: false } }).catch(() => undefined);
    };
  }, [typingOn, conversationId]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecMs(Date.now() - startedRef.current), 200);
    return () => window.clearInterval(timer);
  }, [recording]);

  const members = thread.data?.members ?? [];
  const me = members.find((member) => member.userId === meId);
  const others = members.filter((member) => member.userId !== meId);
  const kind = thread.data?.conversation.kind ?? "dm";
  const title =
    kind === "group"
      ? thread.data?.conversation.name || "Group"
      : others[0]?.displayName || "Chat";
  const avatar = kind === "group" ? thread.data?.conversation.avatar : others[0]?.avatar;
  const typingMembers = others.filter((member) => thread.data?.typingUserIds.includes(member.userId));

  const view = useMemo(() => {
    const server = thread.data?.messages ?? [];
    const known = new Set(server.map((message) => message.id));
    const extras = pending.filter(
      (item) => item.conversationId === conversationId && !known.has(item.id),
    );
    return [
      ...server.map((message) => decorate(message, meId, others, mediaCache.current)),
      ...extras.map((item) => pendingToView(item)),
    ];
  }, [thread.data, pending, conversationId, meId, others]);

  useLayoutEffect(() => {
    if (!stickRef.current) return;
    const node = scrollerRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [view.length, typingMembers.length, conversationId]);

  const active = view.find((message) => message.id === activeId) ?? null;

  async function deliver(input: {
    id: string;
    kind: "text" | "image" | "voice";
    body: string | null;
    media: string | null;
    replyTo: string | null;
  }) {
    try {
      await sendMessage({ data: { ...input, conversationId } });
      await queryClient.invalidateQueries({ queryKey: ["thread", conversationId] });
      await queryClient.invalidateQueries({ queryKey: ["chats"] });
    } catch (caught) {
      patchPending(input.id, { status: "failed" });
      toast.error(errorText(caught, "Couldn't send"));
    }
  }

  function pushPending(partial: Omit<PendingMessage, "status" | "conversationId" | "createdAt">) {
    const message: PendingMessage = {
      ...partial,
      conversationId,
      createdAt: new Date().toISOString(),
      status: "sending",
    };
    addPending(message);
    stickRef.current = true;
    setPinned(true);
    void deliver(message);
  }

  function sendText() {
    const text = draft.trim();
    if (!text) return;
    if (editing) {
      const id = editing.id;
      setEditing(null);
      setDraft("");
      void editMessage({ data: { messageId: id, body: text } })
        .then(() => queryClient.invalidateQueries({ queryKey: ["thread", conversationId] }))
        .catch((caught) => toast.error(errorText(caught, "Couldn't edit that message")));
      return;
    }
    setDraft("");
    const replyTo = reply;
    setReply(null);
    setActiveId(null);
    pushPending({
      id: crypto.randomUUID(),
      kind: "text",
      body: text,
      media: null,
      replyTo: replyTo?.id ?? null,
      replyPreview: replyTo?.preview ?? null,
      replyName: replyTo?.name ?? null,
    });
  }

  async function onImage(file: File | undefined) {
    if (!file) return;
    try {
      const media = await compressImage(file, 1280, 260_000);
      const caption = draft.trim();
      setDraft("");
      const replyTo = reply;
      setReply(null);
      pushPending({
        id: crypto.randomUUID(),
        kind: "image",
        body: caption || null,
        media,
        replyTo: replyTo?.id ?? null,
        replyPreview: replyTo?.preview ?? null,
        replyName: replyTo?.name ?? null,
      });
    } catch (caught) {
      toast.error(errorText(caught, "Couldn't attach that image"));
    }
  }

  function stopRecording(discard = false) {
    releasedRef.current = true;
    if (discard) discardRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") recorder.stop();
  }

  async function startRecording(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (recorderRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Voice notes aren't available in this browser");
      return;
    }
    releasedRef.current = false;
    discardRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (releasedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        toast("Hold to record a voice note");
        return;
      }
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : undefined;
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (chunk) => {
        if (chunk.data.size) chunksRef.current.push(chunk.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const duration = Date.now() - startedRef.current;
        const discard = discardRef.current;
        discardRef.current = false;
        recorderRef.current = null;
        setRecording(false);
        if (discard) return;
        if (duration < 500) {
          toast("Hold to record a voice note");
          return;
        }
        void (async () => {
          try {
            const media = await blobToDataUrl(blob);
            if (media.length > 500_000) {
              toast.error("That voice note is too long");
              return;
            }
            const replyTo = reply;
            setReply(null);
            pushPending({
              id: crypto.randomUUID(),
              kind: "voice",
              body: null,
              media,
              replyTo: replyTo?.id ?? null,
              replyPreview: replyTo?.preview ?? null,
              replyName: replyTo?.name ?? null,
            });
          } catch (caught) {
            toast.error(errorText(caught, "Couldn't send that voice note"));
          }
        })();
      };
      recorder.start();
      recorderRef.current = recorder;
      startedRef.current = Date.now();
      setRecMs(0);
      setRecording(true);
      if (releasedRef.current) {
        recorder.stop();
        return;
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* the pointer may already be up */
      }
      window.setTimeout(() => {
        if (recorderRef.current === recorder && recorder.state === "recording") recorder.stop();
      }, 60_000);
    } catch {
      toast.error("Microphone is blocked");
    }
  }

  const status = statusLine(kind, others, typingMembers, me ? members.length : others.length + 1);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-1 border-b border-line bg-surface px-2 pt-safe pb-2">
        <IconButton label="Back" onClick={() => go({ tab: "chats" })}>
          <ArrowLeft className="size-5" />
        </IconButton>
        <Avatar name={title} src={avatar} online={kind === "dm" ? others[0]?.online : undefined} size="sm" />
        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate font-semibold">{title}</h1>
          <p className={`truncate text-xs ${status.live ? "text-online" : "text-muted"}`}>{status.label}</p>
        </div>
        <IconButton label="Search in chat" onClick={() => setFinding(true)}>
          <Search className="size-5" />
        </IconButton>
        <IconButton label="Chat details" onClick={() => setInfoOpen(true)} disabled={!thread.data}>
          <MoreHorizontal className="size-5" />
        </IconButton>
      </header>

      <div
        ref={scrollerRef}
        className="thread-bg min-h-0 flex-1 overflow-y-auto px-3 py-4"
        onScroll={() => {
          const node = scrollerRef.current;
          if (!node) return;
          const next = node.scrollHeight - node.scrollTop - node.clientHeight < 90;
          stickRef.current = next;
          setPinned(next);
        }}
      >
        {thread.isLoading ? (
          <p className="py-8 text-center text-sm text-muted">Loading messages…</p>
        ) : null}
        {thread.isError ? (
          <div className="py-10 text-center">
            <p className="text-sm text-danger">{errorText(thread.error, "Couldn't open this chat")}</p>
            <button
              type="button"
              className="mt-3 min-h-11 text-sm font-medium"
              onClick={() => void thread.refetch()}
            >
              Try again
            </button>
          </div>
        ) : null}
        {view.map((message, index) => {
          const previous = view[index - 1];
          const showDay = !previous || !sameDay(previous.createdAt, message.createdAt);
          const sender = members.find((member) => member.userId === message.senderId);
          return (
            <div key={message.id}>
              {showDay ? (
                <p className="my-3 text-center text-xs font-medium text-muted">
                  {formatDayLabel(message.createdAt)}
                </p>
              ) : null}
              <article
                id={`msg-${message.id}`}
                className={`mb-2 flex ${message.mine ? "justify-end" : "justify-start"}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveId((current) => (current === message.id ? null : message.id));
                    setConfirmDelete(false);
                  }}
                  className={`max-w-xs rounded-2xl px-3 py-2 text-left sm:max-w-sm ${
                    message.mine
                      ? "rounded-br-md bg-accent text-accent-fg"
                      : "rounded-bl-md border border-line bg-bubble text-fg"
                  } ${activeId === message.id ? "ring-2 ring-fg/30" : ""}`}
                >
                  {message.forwarded && !message.deleted ? (
                    <span className="mb-1 block text-xs italic opacity-70">Forwarded</span>
                  ) : null}
                  {!message.mine && kind === "group" && !message.deleted ? (
                    <span className="mb-1 block text-xs font-semibold">
                      {sender?.displayName || "Someone"}
                    </span>
                  ) : null}
                  {message.reply ? (
                    <span className="mb-1 block rounded-lg bg-accent-fg/10 px-2 py-1 text-xs">
                      <span className="block font-semibold">{message.reply.senderName}</span>
                      <span className="block truncate opacity-80">{message.reply.preview}</span>
                    </span>
                  ) : null}
                  {message.deleted ? (
                    <span className="text-sm italic opacity-70">This message was deleted</span>
                  ) : null}
                  {!message.deleted && message.kind === "image" && message.media ? (
                    <span
                      role="button"
                      tabIndex={0}
                      className="mb-1 block"
                      onClick={(event) => {
                        event.stopPropagation();
                        setZoom(message.media);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.stopPropagation();
                          setZoom(message.media);
                        }
                      }}
                    >
                      <img src={message.media} alt="" className="max-h-64 max-w-full rounded-xl object-contain" />
                    </span>
                  ) : null}
                  {!message.deleted && message.kind === "voice" && message.media ? (
                    <VoiceNote src={message.media} />
                  ) : null}
                  {!message.deleted && message.body ? (
                    <span className="text-sm break-words whitespace-pre-wrap">{message.body}</span>
                  ) : null}
                  <span className="mt-1 flex items-center justify-end gap-1 text-xs opacity-70 tabular-nums">
                    {message.editedAt ? <span>edited</span> : null}
                    {formatBubbleTime(message.createdAt)}
                    {message.mine && !message.deleted ? (
                      <Ticks
                        state={
                          message.pendingStatus === "failed"
                            ? "failed"
                            : message.pendingStatus === "sending"
                              ? "sending"
                              : message.read
                                ? "read"
                                : "sent"
                        }
                      />
                    ) : null}
                  </span>
                </button>
              </article>
              {!message.deleted && message.reactions.length > 0 ? (
                <div className={`-mt-1 mb-2 flex flex-wrap gap-1 ${message.mine ? "justify-end" : "justify-start"}`}>
                  {message.reactions.map((reaction) => (
                    <button
                      key={reaction.emoji}
                      type="button"
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        reaction.mine ? "bg-accent text-accent-fg" : "border border-line bg-surface text-fg"
                      }`}
                      onClick={() =>
                        void toggleReaction({ data: { messageId: message.id, emoji: reaction.emoji } }).then(() =>
                          client.invalidateQueries({ queryKey: ["thread", conversationId] }),
                        )
                      }
                    >
                      {reaction.emoji} {reaction.userIds.length}
                    </button>
                  ))}
                </div>
              ) : null}
              {message.pendingStatus === "failed" ? (
                <div className={`mb-2 flex gap-3 text-xs ${message.mine ? "justify-end" : "justify-start"}`}>
                  <button
                    type="button"
                    className="min-h-11 font-medium text-danger"
                    onClick={() => {
                      patchPending(message.id, { status: "sending" });
                      void deliver({
                        id: message.id,
                        kind: message.kind,
                        body: message.body,
                        media: message.media,
                        replyTo: message.reply?.id ?? null,
                      });
                    }}
                  >
                    Tap to retry
                  </button>
                  <button type="button" className="min-h-11 text-muted" onClick={() => dropPending(message.id)}>
                    Remove
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
        {typingMembers.length > 0 ? (
          <div className="mb-2 flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-line bg-bubble px-3 py-3">
              <span className="typing-dot size-1.5 rounded-full bg-muted" />
              <span className="typing-dot size-1.5 rounded-full bg-muted" />
              <span className="typing-dot size-1.5 rounded-full bg-muted" />
            </div>
          </div>
        ) : null}
      </div>

      {!pinned ? (
        <div className="pointer-events-none absolute right-4 bottom-28">
          <button
            type="button"
            className="pointer-events-auto min-h-11 rounded-full bg-surface px-4 text-sm font-medium shadow-lg"
            onClick={() => {
              stickRef.current = true;
              setPinned(true);
              const node = scrollerRef.current;
              if (node) node.scrollTop = node.scrollHeight;
            }}
          >
            Latest
          </button>
        </div>
      ) : null}

      {active && !active.pendingStatus && !active.deleted ? (
        <div className="border-t border-line bg-surface px-3 py-2">
          <div className="flex gap-1 overflow-x-auto">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="grid size-11 shrink-0 place-items-center rounded-full text-xl"
                onClick={() => {
                  void toggleReaction({ data: { messageId: active.id, emoji } })
                    .then(() => client.invalidateQueries({ queryKey: ["thread", conversationId] }))
                    .catch((caught) => toast.error(errorText(caught, "Couldn't react")));
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
          {confirmDelete ? (
            <div className="mt-1 flex flex-wrap gap-2">
              <button
                type="button"
                className="min-h-11 rounded-full bg-surface-2 px-4 text-sm font-medium"
                onClick={() => void remove(active.id, "me", conversationId, client, () => setActiveId(null))}
              >
                Delete for me
              </button>
              {active.mine ? (
                <button
                  type="button"
                  className="min-h-11 rounded-full bg-surface-2 px-4 text-sm font-medium text-danger"
                  onClick={() =>
                    void remove(active.id, "everyone", conversationId, client, () => setActiveId(null))
                  }
                >
                  Delete for everyone
                </button>
              ) : null}
              <button type="button" className="min-h-11 px-3 text-sm text-muted" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface-2 px-4 text-sm font-medium"
                onClick={() => {
                  const sender = members.find((member) => member.userId === active.senderId);
                  setReply({
                    id: active.id,
                    name: active.mine ? "You" : sender?.displayName || "Someone",
                    preview:
                      active.kind === "image"
                        ? "Photo"
                        : active.kind === "voice"
                          ? "Voice note"
                          : active.body || "Message",
                  });
                  setActiveId(null);
                }}
              >
                <Reply className="size-4" />
                Reply
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface-2 px-4 text-sm font-medium"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-4" />
                Delete
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface-2 px-4 text-sm font-medium"
                onClick={() => setForwardId(active.id)}
              >
                <Forward className="size-4" />
                Forward
              </button>
              {active.mine &&
              active.kind === "text" &&
              Date.now() - new Date(active.createdAt).getTime() < 15 * 60 * 1000 ? (
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface-2 px-4 text-sm font-medium"
                  onClick={() => {
                    setEditing({ id: active.id });
                    setDraft(active.body ?? "");
                    setReply(null);
                    setActiveId(null);
                  }}
                >
                  <Pencil className="size-4" />
                  Edit
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {thread.data?.peerRequestStatus === "pending" ? (
        <p className="border-t border-line bg-surface px-4 py-2 text-sm text-muted">
          They haven't accepted yet. This stays in their requests.
        </p>
      ) : null}

      {thread.data?.me.requestStatus === "pending" ? (
        <div className="grid gap-2 border-t border-line bg-surface px-4 py-3 pb-safe">
          <p className="text-sm text-pretty text-muted">Accept to reply, or ignore to hide this request.</p>
          <Button
            onClick={() =>
              void acceptRequest({ data: { conversationId } })
                .then(() => {
                  void client.invalidateQueries({ queryKey: ["thread", conversationId] });
                  void client.invalidateQueries({ queryKey: ["chats"] });
                })
                .catch((caught) => toast.error(errorText(caught, "Couldn't accept")))
            }
          >
            Accept
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              void ignoreRequest({ data: { conversationId } })
                .then(() => {
                  void client.invalidateQueries({ queryKey: ["chats"] });
                  go({ tab: "chats" });
                })
                .catch((caught) => toast.error(errorText(caught, "Couldn't ignore")))
            }
          >
            Ignore
          </Button>
        </div>
      ) : thread.data?.blocked ? (
        <div className="grid gap-2 border-t border-line bg-surface px-4 py-3 pb-safe">
          <p className="text-sm text-muted">You blocked this person.</p>
          <Button
            variant="ghost"
            onClick={() => {
              const peer = others[0];
              if (!peer) return;
              void unblockUser({ data: { userId: peer.userId } })
                .then(() => {
                  void client.invalidateQueries({ queryKey: ["thread", conversationId] });
                  void client.invalidateQueries({ queryKey: ["chats"] });
                  void client.invalidateQueries({ queryKey: ["blocked"] });
                })
                .catch((caught) => toast.error(errorText(caught, "Couldn't unblock")));
            }}
          >
            Unblock
          </Button>
        </div>
      ) : (
      <>
      {editing ? (
        <div className="flex items-center justify-between border-t border-line bg-surface px-4 py-2">
          <p className="text-sm font-medium">Editing message</p>
          <button
            type="button"
            className="min-h-11 text-sm text-muted"
            onClick={() => {
              setEditing(null);
              setDraft("");
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {reply && !editing ? (
        <div className="flex items-center gap-3 border-t border-line bg-surface px-4 py-2">
          <div className="min-w-0 flex-1 border-l-2 border-accent pl-2">
            <p className="text-xs font-semibold">{reply.name}</p>
            <p className="truncate text-xs text-muted">{reply.preview}</p>
          </div>
          <button type="button" className="min-h-11 text-sm text-muted" onClick={() => setReply(null)}>
            Cancel
          </button>
        </div>
      ) : null}

      <form
        className="flex items-end gap-1 border-t border-line bg-surface px-2 py-2 pb-safe"
        onSubmit={(event) => {
          event.preventDefault();
          sendText();
        }}
      >
        <IconButton label="Attach image" onClick={() => fileRef.current?.click()} disabled={recording}>
          <ImagePlus className="size-5" />
        </IconButton>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void onImage(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {recording ? (
          <div className="flex min-h-11 flex-1 items-center justify-between rounded-2xl bg-bg px-3">
            <span className="text-sm font-medium text-danger tabular-nums">
              {Math.floor(recMs / 1000)}s · release to send
            </span>
            <button
              type="button"
              data-cancel-rec=""
              className="min-h-11 text-sm"
              onClick={() => stopRecording(true)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <textarea
            rows={1}
            value={draft}
            aria-label="Message"
            placeholder={editing ? "Edit message" : "Message"}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl bg-bg px-3 py-2.5 text-base outline-none"
            onChange={(event) => {
              setDraft(event.target.value);
              const node = event.target;
              node.style.height = "auto";
              node.style.height = `${Math.min(node.scrollHeight, 128)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendText();
              }
            }}
          />
        )}
        <IconButton
          label={recording ? "Stop and send voice note" : "Hold to record a voice note"}
          className={`touch-none select-none ${recording ? "bg-danger text-bg" : "bg-surface-2"}`}
          onPointerDown={(event) => void startRecording(event)}
          onPointerUp={(event) => {
            const el = document.elementFromPoint(event.clientX, event.clientY);
            const cancel = el instanceof Element && Boolean(el.closest("[data-cancel-rec]"));
            stopRecording(cancel);
          }}
          onPointerCancel={() => stopRecording(true)}
          onContextMenu={(event) => event.preventDefault()}
        >
          <Mic className="size-5" />
        </IconButton>
        <IconButton
          label="Send"
          className="bg-accent text-accent-fg"
          disabled={!draft.trim() || recording}
          onClick={sendText}
        >
          <Send className="size-5" />
        </IconButton>
      </form>
      </>
      )}

      {thread.data ? (
        <ChatInfo
          open={infoOpen}
          onOpenChange={setInfoOpen}
          thread={thread.data}
          meId={meId}
          go={go}
          onJump={(id) => {
            document.getElementById(`msg-${id}`)?.scrollIntoView({ block: "center" });
          }}
        />
      ) : null}
      <Finder
        open={finding}
        onOpenChange={setFinding}
        conversationId={conversationId}
        onJump={(id) => document.getElementById(`msg-${id}`)?.scrollIntoView({ block: "center" })}
      />
      <ForwardPicker
        messageId={forwardId}
        currentId={conversationId}
        onClose={() => setForwardId(null)}
        go={go}
      />

      {zoom ? (
        <button
          type="button"
          className="fixed inset-0 z-50 grid place-items-center bg-bg/95 p-4"
          onClick={() => setZoom(null)}
          aria-label="Close image"
        >
          <img src={zoom} alt="" className="max-h-full max-w-full object-contain" />
        </button>
      ) : null}

      {kind === "dm" && others[0] ? (
        <p className="sr-only">{formatNumber(others[0].number)}</p>
      ) : null}
    </section>
  );
}

function statusLine(
  kind: "dm" | "group",
  others: { displayName: string; online: boolean; lastSeen: string; number: string }[],
  typing: { displayName: string }[],
  count: number,
) {
  if (typing.length) {
    return {
      live: true,
      label: kind === "dm" ? "typing…" : `${typing[0].displayName} is typing…`,
    };
  }
  if (kind === "dm") {
    const person = others[0];
    if (!person) return { live: false, label: "offline" };
    if (person.online) return { live: true, label: "online" };
    return { live: false, label: `last seen ${formatLastSeen(person.lastSeen)}` };
  }
  const online = others.filter((person) => person.online).length;
  return {
    live: online > 0,
    label: online ? `${count} members · ${online} online` : `${count} members`,
  };
}

type ViewMessage = {
  id: string;
  senderId: string;
  kind: "text" | "image" | "voice";
  body: string | null;
  media: string | null;
  createdAt: string;
  editedAt: string | null;
  forwarded: boolean;
  deleted: boolean;
  reply: { id: string; senderName: string; preview: string } | null;
  reactions: ThreadMessage["reactions"];
  mine: boolean;
  read: boolean;
  pendingStatus?: "sending" | "failed";
};

function decorate(
  message: ThreadMessage,
  meId: string,
  others: { lastReadAt: string | null }[],
  cache: Map<string, string>,
): ViewMessage {
  let media = message.media;
  if (message.deleted) cache.delete(message.id);
  else if (message.mediaSkipped) media = cache.get(message.id) ?? null;
  else if (message.media) cache.set(message.id, message.media);
  else cache.delete(message.id);
  const read =
    message.senderId === meId &&
    others.length > 0 &&
    others.every((person) => {
      if (!person.lastReadAt) return false;
      return new Date(person.lastReadAt).getTime() + 1500 >= new Date(message.createdAt).getTime();
    });
  return {
    id: message.id,
    senderId: message.senderId,
    kind: message.kind,
    body: message.body,
    media,
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    forwarded: message.forwarded,
    deleted: message.deleted,
    reply: message.reply,
    reactions: message.reactions,
    mine: message.senderId === meId,
    read,
  };
}

function pendingToView(item: PendingMessage): ViewMessage {
  return {
    id: item.id,
    senderId: "me",
    kind: item.kind,
    body: item.body,
    media: item.media,
    createdAt: item.createdAt,
    editedAt: null,
    forwarded: false,
    deleted: false,
    reply: item.replyTo
      ? { id: item.replyTo, senderName: item.replyName || "Someone", preview: item.replyPreview || "Message" }
      : null,
    reactions: [],
    mine: true,
    read: false,
    pendingStatus: item.status,
  };
}

function VoiceNote({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  return (
    <span className="flex min-w-44 items-center gap-2">
      <span
        role="button"
        tabIndex={0}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-fg/10"
        onClick={(event) => {
          event.stopPropagation();
          const audio = audioRef.current;
          if (!audio) return;
          if (audio.paused) void audio.play();
          else audio.pause();
        }}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </span>
      <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-accent-fg/15">
        <span className="block h-full bg-current" style={{ width: `${Math.round(progress * 100)}%` }} />
      </span>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={() => {
          const audio = audioRef.current;
          if (audio?.duration) setProgress(audio.currentTime / audio.duration);
        }}
      />
    </span>
  );
}

async function remove(
  messageId: string,
  scope: "me" | "everyone",
  conversationId: string,
  client: ReturnType<typeof useQueryClient>,
  done: () => void,
) {
  try {
    await deleteMessage({ data: { messageId, scope } });
    await client.invalidateQueries({ queryKey: ["thread", conversationId] });
    await client.invalidateQueries({ queryKey: ["chats"] });
    done();
  } catch (caught) {
    toast.error(errorText(caught, "Couldn't delete that message"));
  }
}

function Finder({
  open,
  onOpenChange,
  conversationId,
  onJump,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  onJump: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ id: string; body: string; createdAt: string; senderName: string }[]>([]);
  useEffect(() => {
    const text = query.trim();
    if (!open || text.length < 1) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchThread({ data: { conversationId, query: text } })
        .then(setHits)
        .catch((caught) => toast.error(errorText(caught, "Couldn't search")));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, open, conversationId]);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Search">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Find a message"
        aria-label="Find a message"
        className="min-h-11 w-full rounded-2xl border border-line bg-bg px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
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
      {query.trim() && hits.length === 0 ? <p className="mt-3 text-sm text-muted">No messages match.</p> : null}
    </Modal>
  );
}

function ForwardPicker({
  messageId,
  currentId,
  onClose,
  go,
}: {
  messageId: string | null;
  currentId: string;
  onClose: () => void;
  go: (search: AppSearch) => void;
}) {
  const client = useQueryClient();
  const chats = useQuery({
    queryKey: ["chats"],
    queryFn: () => listChats(),
    enabled: Boolean(messageId),
  });
  const choices = (chats.data ?? []).filter(
    (chat) => chat.id !== currentId && chat.requestStatus === "accepted" && !chat.archived,
  );
  return (
    <Modal open={Boolean(messageId)} onOpenChange={(open) => !open && onClose()} title="Forward to">
      <ul className="max-h-80 space-y-1 overflow-y-auto">
        {choices.map((chat) => (
          <li key={chat.id}>
            <button
              type="button"
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-1 text-left"
              onClick={() => {
                if (!messageId) return;
                void forwardMessage({ data: { messageId, conversationId: chat.id } })
                  .then(() => {
                    void client.invalidateQueries({ queryKey: ["chats"] });
                    void client.invalidateQueries({ queryKey: ["thread", chat.id] });
                    onClose();
                    go({ tab: "chats", c: chat.id });
                  })
                  .catch((caught) => toast.error(errorText(caught, "Couldn't forward that")));
              }}
            >
              <Avatar name={chat.title} src={chat.avatar} size="sm" />
              <span className="truncate font-medium">{chat.title}</span>
            </button>
          </li>
        ))}
        {chats.data && choices.length === 0 ? (
          <li className="py-6 text-sm text-muted">No other chats to forward to.</li>
        ) : null}
      </ul>
    </Modal>
  );
}
