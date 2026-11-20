export const REACTIONS = ["❤️", "😂", "😮", "😢", "👍", "🔥", "👏", "🎉"] as const;
export type ReactionEmoji = (typeof REACTIONS)[number];

export type Profile = {
  userId: string;
  displayName: string;
  number: string;
  avatar: string | null;
  lastSeen: string;
  online: boolean;
};

export type Contact = {
  userId: string;
  displayName: string;
  number: string;
  avatar: string | null;
  online: boolean;
  lastSeen: string;
};

export type AddContactResult =
  | { ok: true; already: boolean; contact: Contact }
  | { ok: false; reason: "not_found" | "self" | "invalid" | "blocked" };

export type LookupResult =
  | { ok: true; self: false; contact: Contact; already: boolean; blocked: boolean }
  | { ok: false; reason: "not_found" | "self" | "invalid" };

export type ChatSummary = {
  id: string;
  kind: "dm" | "group";
  title: string;
  avatar: string | null;
  peerId: string | null;
  peerNumber: string | null;
  online: boolean;
  lastSeen: string | null;
  preview: string;
  lastMessageAt: string;
  unread: number;
  memberCount: number;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  requestStatus: "pending" | "accepted";
};

export type ThreadMember = {
  userId: string;
  displayName: string;
  number: string;
  avatar: string | null;
  online: boolean;
  lastSeen: string;
  lastReadAt: string | null;
  role: "admin" | "member";
};

export type ThreadMessage = {
  id: string;
  senderId: string;
  kind: "text" | "image" | "voice";
  body: string | null;
  media: string | null;
  mediaSkipped: boolean;
  createdAt: string;
  editedAt: string | null;
  forwarded: boolean;
  deleted: boolean;
  reply: { id: string; senderName: string; preview: string } | null;
  reactions: { emoji: ReactionEmoji; userIds: string[]; mine: boolean }[];
};

export type Thread = {
  conversation: {
    id: string;
    kind: "dm" | "group";
    name: string | null;
    avatar: string | null;
    disappearSeconds: number;
  };
  me: {
    role: "admin" | "member";
    requestStatus: "pending" | "accepted" | "ignored";
    pinned: boolean;
    muted: boolean;
    archived: boolean;
  };
  peerRequestStatus: "pending" | "accepted" | "ignored" | null;
  blocked: boolean;
  members: ThreadMember[];
  messages: ThreadMessage[];
  typingUserIds: string[];
};

export type ThreadHit = {
  id: string;
  body: string;
  createdAt: string;
  senderName: string;
};

export type TabId = "chats" | "contacts" | "settings";

export type AppSearch = {
  tab: TabId;
  c?: string;
};
