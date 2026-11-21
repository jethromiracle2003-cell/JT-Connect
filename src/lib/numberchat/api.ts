import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import {
  REACTIONS,
  type AddContactResult,
  type ChatSummary,
  type Contact,
  type LookupResult,
  type Profile,
  type ReactionEmoji,
  type Thread,
  type ThreadHit,
  type ThreadMessage,
} from "@/lib/numberchat/types";

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) {
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)
      ? `${value.replace(" ", "T").replace(/(\.\d+)?$/, "")}Z`.replace(/ZZ$/, "Z")
      : value;
    const date = new Date(normalized);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function isoOrNull(value: unknown): string | null {
  if (value == null) return null;
  return iso(value);
}

function flag(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanName(raw: string, max = 40) {
  const name = raw.replace(/[\u0000-\u001F]/g, "").trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > max) return null;
  return name;
}

function digits(raw: string) {
  const number = raw.replace(/\D/g, "");
  return /^[0-9]{10}$/.test(number) ? number : null;
}

function parseAvatar(value: unknown, maxLen: number) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error("That image is too large");
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(value) || value.length > maxLen) {
    throw new Error("That image is too large");
  }
  return value;
}

function mustId(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(value)) {
    throw new Error("That conversation could not be opened");
  }
  return value;
}

function randomTen() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = String((bytes[0] % 9) + 1);
  for (let i = 1; i < 10; i += 1) out += String(bytes[i] % 10);
  return out;
}

type ProfileRow = {
  user_id: string;
  display_name: string;
  number: string;
  avatar: string | null;
  last_seen: unknown;
  online: unknown;
};

function mapProfile(row: ProfileRow): Profile {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    number: row.number,
    avatar: row.avatar,
    lastSeen: iso(row.last_seen),
    online: flag(row.online),
  };
}

const profileSelect = `
  user_id, display_name, number, avatar, last_seen,
  (last_seen > now() - interval '22 seconds') as online
`;

async function loadProfile(sql: Sql, userId: string) {
  const rows = await sql.query<ProfileRow>(
    `select ${profileSelect} from profiles where user_id = $1`,
    [userId],
  );
  return rows[0] ? mapProfile(rows[0]) : null;
}

async function allocateNumber(sql: Sql) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const number = randomTen();
    const taken = await sql<{ one: number }>`select 1 as one from profiles where number = ${number}`;
    if (!taken.length) return number;
  }
  throw new Error("Could not assign a number. Try again.");
}

async function assertMember(sql: Sql, conversationId: string, userId: string) {
  const rows = await sql<{ one: number }>`
    select 1 as one from conversation_members
    where conversation_id = ${conversationId} and user_id = ${userId}
  `;
  if (!rows.length) throw new Error("Conversation not found");
}

async function isBlocked(sql: Sql, a: string, b: string) {
  const rows = await sql<{ one: number }>`
    select 1 as one from blocks
    where (owner_id = ${a} and blocked_id = ${b})
       or (owner_id = ${b} and blocked_id = ${a})
  `;
  return rows.length > 0;
}

async function dmPeer(sql: Sql, conversationId: string, userId: string) {
  const rows = await sql<{ user_id: string }>`
    select user_id from conversation_members
    where conversation_id = ${conversationId} and user_id <> ${userId}
    limit 1
  `;
  return rows[0]?.user_id ?? null;
}

function likeTerm(raw: string) {
  return `%${raw.replace(/[\\%_]/g, "\\$&")}%`;
}

function previewOf(kind: string | null, body: string | null, deleted: boolean) {
  if (!kind) return "No messages yet";
  if (deleted) return "This message was deleted";
  if (kind === "image") return body ? `Photo · ${body}` : "Photo";
  if (kind === "voice") return "Voice note";
  return body || "Message";
}

export const getMe = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Profile | null> => {
    const sql = await getSql();
    return loadProfile(sql, context.userId);
  });

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { displayName: string; avatar: string | null }) => {
    const displayName = cleanName(input?.displayName ?? "");
    if (!displayName) throw new Error("Enter a name people will recognize");
    return { displayName, avatar: parseAvatar(input?.avatar ?? null, 220_000) };
  })
  .handler(async ({ context, data }): Promise<Profile> => {
    const sql = await getSql();
    const existing = await loadProfile(sql, context.userId);
    if (existing) return existing;
    const number = await allocateNumber(sql);
    try {
      await sql`
        insert into profiles (user_id, display_name, number, avatar)
        values (${context.userId}, ${data.displayName}, ${number}, ${data.avatar})
      `;
    } catch {
      const again = await loadProfile(sql, context.userId);
      if (again) return again;
      throw new Error("Could not create your line. Try again.");
    }
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Could not create your line. Try again.");
    return profile;
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { displayName: string; avatar: string | null }) => {
    const displayName = cleanName(input?.displayName ?? "");
    if (!displayName) throw new Error("Enter a name people will recognize");
    return { displayName, avatar: parseAvatar(input?.avatar ?? null, 220_000) };
  })
  .handler(async ({ context, data }): Promise<Profile> => {
    const sql = await getSql();
    const updated = await sql<{ user_id: string }>`
      update profiles
      set display_name = ${data.displayName}, avatar = ${data.avatar}
      where user_id = ${context.userId}
      returning user_id
    `;
    if (!updated.length) throw new Error("Finish setting up your line first");
    const profile = await loadProfile(sql, context.userId);
    if (!profile) throw new Error("Finish setting up your line first");
    return profile;
  });

export const heartbeat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await sql`update profiles set last_seen = now() where user_id = ${context.userId}`;
    await sql`delete from messages where expires_at is not null and expires_at <= now()`;
    return { ok: true as const };
  });

async function contactByUser(sql: Sql, userId: string): Promise<Contact | null> {
  const profile = await loadProfile(sql, userId);
  if (!profile) return null;
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    number: profile.number,
    avatar: profile.avatar,
    online: profile.online,
    lastSeen: profile.lastSeen,
  };
}

export const lookupNumber = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { number: string }) => input?.number ?? "")
  .handler(async ({ context, data }): Promise<LookupResult> => {
    const number = digits(data);
    if (!number) return { ok: false, reason: "invalid" };
    const sql = await getSql();
    const rows = await sql.query<ProfileRow>(
      `select ${profileSelect} from profiles where number = $1`,
      [number],
    );
    const profile = rows[0] ? mapProfile(rows[0]) : null;
    if (!profile) return { ok: false, reason: "not_found" };
    if (profile.userId === context.userId) return { ok: false, reason: "self" };
    const saved = await sql<{ one: number }>`
      select 1 as one from contacts
      where owner_id = ${context.userId} and contact_user_id = ${profile.userId}
    `;
    const blocked = await sql<{ one: number }>`
      select 1 as one from blocks
      where owner_id = ${context.userId} and blocked_id = ${profile.userId}
    `;
    return {
      ok: true,
      self: false,
      already: saved.length > 0,
      blocked: blocked.length > 0,
      contact: {
        userId: profile.userId,
        displayName: profile.displayName,
        number: profile.number,
        avatar: profile.avatar,
        online: profile.online,
        lastSeen: profile.lastSeen,
      },
    };
  });

export const addContact = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { number: string }) => input?.number ?? "")
  .handler(async ({ context, data }): Promise<AddContactResult> => {
    const number = digits(data);
    if (!number) return { ok: false, reason: "invalid" };
    const sql = await getSql();
    const rows = await sql<{ user_id: string }>`select user_id from profiles where number = ${number}`;
    if (!rows.length) return { ok: false, reason: "not_found" };
    if (rows[0].user_id === context.userId) return { ok: false, reason: "self" };
    if (await isBlocked(sql, context.userId, rows[0].user_id)) {
      return { ok: false, reason: "blocked" };
    }
    const existing = await sql<{ one: number }>`
      select 1 as one from contacts
      where owner_id = ${context.userId} and contact_user_id = ${rows[0].user_id}
    `;
    if (!existing.length) {
      await sql`
        insert into contacts (owner_id, contact_user_id)
        values (${context.userId}, ${rows[0].user_id})
      `;
    }
    await sql`
      update conversation_members mem
      set request_status = 'accepted'
      from conversations c
      join conversation_members other
        on other.conversation_id = c.id and other.user_id = ${rows[0].user_id}
      where mem.conversation_id = c.id
        and mem.user_id = ${context.userId}
        and c.kind = 'dm'
        and mem.request_status = 'pending'
    `;
    const contact = await contactByUser(sql, rows[0].user_id);
    if (!contact) return { ok: false, reason: "not_found" };
    return { ok: true, already: existing.length > 0, contact };
  });

export const listContacts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Contact[]> => {
    const sql = await getSql();
    const rows = await sql.query<ProfileRow>(
      `select ${profileSelect}
       from contacts c
       join profiles p on p.user_id = c.contact_user_id
       where c.owner_id = $1
       order by p.display_name asc`,
      [context.userId],
    );
    return rows.map(mapProfile).map((profile) => ({
      userId: profile.userId,
      displayName: profile.displayName,
      number: profile.number,
      avatar: profile.avatar,
      online: profile.online,
      lastSeen: profile.lastSeen,
    }));
  });

export const listChats = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ChatSummary[]> => {
    const sql = await getSql();
    const me = context.userId;
    const rows = await sql<{
      id: string;
      kind: string;
      name: string | null;
      avatar: string | null;
      updated_at: unknown;
      disappear_seconds: unknown;
      member_count: unknown;
      pinned: unknown;
      muted: unknown;
      archived: unknown;
      request_status: string;
      peer_id: string | null;
      peer_name: string | null;
      peer_number: string | null;
      peer_avatar: string | null;
      peer_last_seen: unknown;
      peer_online: unknown;
      others_online: unknown;
      last_body: string | null;
      last_kind: string | null;
      last_sender: string | null;
      last_at: unknown;
      last_deleted: unknown;
      unread: unknown;
    }>`
      select
        c.id,
        c.kind,
        c.name,
        c.avatar,
        c.updated_at,
        c.disappear_seconds,
        mem.pinned,
        mem.muted,
        mem.archived,
        mem.request_status,
        (select count(*) from conversation_members cm where cm.conversation_id = c.id) as member_count,
        peer.user_id as peer_id,
        peer.display_name as peer_name,
        peer.number as peer_number,
        peer.avatar as peer_avatar,
        peer.last_seen as peer_last_seen,
        peer.online as peer_online,
        (
          select count(*) from conversation_members om
          join profiles op on op.user_id = om.user_id
          where om.conversation_id = c.id
            and om.user_id <> ${me}
            and op.last_seen > now() - interval '22 seconds'
        ) as others_online,
        last.body as last_body,
        last.kind as last_kind,
        last.sender_id as last_sender,
        last.created_at as last_at,
        last.deleted_for_everyone as last_deleted,
        (
          select count(*) from messages m
          where m.conversation_id = c.id
            and m.sender_id <> ${me}
            and m.deleted_for_everyone = false
            and (m.expires_at is null or m.expires_at > now())
            and m.created_at > coalesce(mem.last_read_at, '1970-01-01'::timestamptz)
            and not exists (
              select 1 from message_hides h where h.message_id = m.id and h.user_id = ${me}
            )
        ) as unread
      from conversations c
      join conversation_members mem on mem.conversation_id = c.id and mem.user_id = ${me}
      left join lateral (
        select om.user_id, p.display_name, p.number, p.avatar, p.last_seen,
               (p.last_seen > now() - interval '22 seconds') as online
        from conversation_members om
        join profiles p on p.user_id = om.user_id
        where om.conversation_id = c.id and om.user_id <> ${me}
        order by p.display_name asc
        limit 1
      ) peer on true
      left join lateral (
        select m.body, m.kind, m.sender_id, m.created_at, m.deleted_for_everyone
        from messages m
        where m.conversation_id = c.id
          and (m.expires_at is null or m.expires_at > now())
          and not exists (
            select 1 from message_hides h where h.message_id = m.id and h.user_id = ${me}
          )
        order by m.created_at desc
        limit 1
      ) last on true
      where mem.request_status <> 'ignored'
        and not (
          c.kind = 'dm' and exists (
            select 1
            from conversation_members om
            join blocks b on (
              (b.owner_id = ${me} and b.blocked_id = om.user_id)
              or (b.owner_id = om.user_id and b.blocked_id = ${me})
            )
            where om.conversation_id = c.id and om.user_id <> ${me}
          )
        )
      order by mem.pinned desc, coalesce(last.created_at, c.updated_at) desc
    `;

    return rows.map((row) => {
      const kind = row.kind === "group" ? "group" : "dm";
      const deleted = flag(row.last_deleted);
      let preview = previewOf(row.last_kind, row.last_body, deleted);
      if (row.last_sender === me && row.last_kind) preview = `You: ${preview}`;
      const online = kind === "group" ? num(row.others_online) > 0 : flag(row.peer_online);
      const requestStatus = row.request_status === "pending" ? "pending" : "accepted";
      return {
        id: row.id,
        kind,
        title: kind === "group" ? row.name || "Group" : row.peer_name || "Unknown",
        avatar: kind === "group" ? row.avatar : row.peer_avatar,
        peerId: kind === "dm" ? row.peer_id : null,
        peerNumber: kind === "dm" ? row.peer_number : null,
        online,
        lastSeen: kind === "dm" ? isoOrNull(row.peer_last_seen) : null,
        preview,
        lastMessageAt: iso(row.last_at ?? row.updated_at),
        unread: num(row.unread),
        memberCount: num(row.member_count),
        pinned: flag(row.pinned),
        muted: flag(row.muted),
        archived: flag(row.archived),
        requestStatus,
      } satisfies ChatSummary;
    });
  });

export const ensureDm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId: string }) => mustId(input?.userId))
  .handler(async ({ context, data: otherId }) => {
    if (otherId === context.userId) throw new Error("That's your own number");
    const sql = await getSql();
    const other = await sql<{ user_id: string }>`select user_id from profiles where user_id = ${otherId}`;
    if (!other.length) throw new Error("That person isn't on NumberChat");
    if (await isBlocked(sql, context.userId, otherId)) throw new Error("You can't message this person");
    const key = [context.userId, otherId].sort().join(":");
    const id = crypto.randomUUID();
    await sql`
      insert into conversations (id, kind, dm_key, created_by)
      values (${id}, 'dm', ${key}, ${context.userId})
      on conflict (dm_key) do nothing
    `;
    const rows = await sql<{ id: string }>`select id from conversations where dm_key = ${key}`;
    const conversationId = rows[0]?.id;
    if (!conversationId) throw new Error("Couldn't open that chat");
    const known = await sql<{ one: number }>`
      select 1 as one from contacts
      where owner_id = ${otherId} and contact_user_id = ${context.userId}
    `;
    const theirStatus = known.length ? "accepted" : "pending";
    await sql`
      insert into conversation_members (conversation_id, user_id, role, request_status)
      values (${conversationId}, ${context.userId}, 'member', 'accepted')
      on conflict do nothing
    `;
    await sql`
      insert into conversation_members (conversation_id, user_id, role, request_status)
      values (${conversationId}, ${otherId}, 'member', ${theirStatus})
      on conflict do nothing
    `;
    return { id: conversationId };
  });

export const createGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; avatar: string | null; memberIds: string[] }) => {
    const name = cleanName(input?.name ?? "", 48);
    if (!name) throw new Error("Give the group a name");
    const memberIds = Array.isArray(input?.memberIds)
      ? [...new Set(input.memberIds.filter((id) => typeof id === "string"))]
      : [];
    if (memberIds.some((id) => !/^[A-Za-z0-9_-]{8,80}$/.test(id))) {
      throw new Error("Choose people from your contacts");
    }
    if (memberIds.length > 50) throw new Error("Groups can include up to 50 people");
    return { name, avatar: parseAvatar(input?.avatar ?? null, 220_000), memberIds };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const mine = await sql<{ contact_user_id: string }>`
      select contact_user_id from contacts where owner_id = ${context.userId}
    `;
    const allowed = new Set(mine.map((row) => row.contact_user_id));
    const picked = data.memberIds.filter((id) => allowed.has(id) && id !== context.userId);
    if (!picked.length) throw new Error("Choose at least one contact");
    const id = crypto.randomUUID();
    await sql`
      insert into conversations (id, kind, name, avatar, created_by)
      values (${id}, 'group', ${data.name}, ${data.avatar}, ${context.userId})
    `;
    await sql`
      insert into conversation_members (conversation_id, user_id, role, request_status)
      values (${id}, ${context.userId}, 'admin', 'accepted')
    `;
    for (const userId of picked) {
      if (await isBlocked(sql, context.userId, userId)) continue;
      await sql`
        insert into conversation_members (conversation_id, user_id, role, request_status)
        values (${id}, ${userId}, 'member', 'accepted')
        on conflict do nothing
      `;
    }
    const count = await sql<{ n: unknown }>`
      select count(*) as n from conversation_members where conversation_id = ${id}
    `;
    if (num(count[0]?.n) < 2) {
      await sql`delete from conversations where id = ${id}`;
      throw new Error("Choose at least one contact you haven't blocked");
    }
    return { id };
  });

type MessageRow = {
  id: string;
  sender_id: string;
  kind: string;
  body: string | null;
  media: string | null;
  created_at: unknown;
  edited_at: unknown;
  forwarded: unknown;
  deleted_for_everyone: unknown;
  reply_to: string | null;
  reply_kind: string | null;
  reply_body: string | null;
  reply_deleted: unknown;
  reply_name: string | null;
};

export const getThread = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId: string; haveMedia?: string[] }) => {
    const conversationId = mustId(input?.conversationId);
    const haveMedia = Array.isArray(input?.haveMedia)
      ? input.haveMedia.filter((id) => typeof id === "string" && id.length < 80).slice(0, 400)
      : [];
    return { conversationId, haveMedia };
  })
  .handler(async ({ context, data }): Promise<Thread> => {
    const sql = await getSql();
    await assertMember(sql, data.conversationId, context.userId);
    const convRows = await sql<{
      id: string;
      kind: string;
      name: string | null;
      avatar: string | null;
      disappear_seconds: unknown;
    }>`
      select id, kind, name, avatar, disappear_seconds from conversations where id = ${data.conversationId}
    `;
    const conv = convRows[0];
    if (!conv) throw new Error("Conversation not found");

    const meRows = await sql<{
      role: string;
      request_status: string;
      pinned: unknown;
      muted: unknown;
      archived: unknown;
    }>`
      select role, request_status, pinned, muted, archived
      from conversation_members
      where conversation_id = ${data.conversationId} and user_id = ${context.userId}
    `;
    const mine = meRows[0];
    if (!mine) throw new Error("Conversation not found");

    const memberRows = await sql<{
      user_id: string;
      display_name: string;
      number: string;
      avatar: string | null;
      last_seen: unknown;
      online: unknown;
      last_read_at: unknown;
      role: string;
      request_status: string;
    }>`
      select p.user_id, p.display_name, p.number, p.avatar, p.last_seen,
             (p.last_seen > now() - interval '22 seconds') as online,
             cm.last_read_at, cm.role, cm.request_status
      from conversation_members cm
      join profiles p on p.user_id = cm.user_id
      where cm.conversation_id = ${data.conversationId}
      order by p.display_name asc
    `;

    const messageRows = await sql<MessageRow>`
      select m.id, m.sender_id, m.kind, m.body, m.media, m.created_at,
             m.edited_at, m.forwarded,
             m.deleted_for_everyone, m.reply_to,
             r.kind as reply_kind, r.body as reply_body,
             r.deleted_for_everyone as reply_deleted,
             rp.display_name as reply_name
      from (
        select *
        from messages
        where conversation_id = ${data.conversationId}
          and (expires_at is null or expires_at > now())
          and not exists (
            select 1 from message_hides h
            where h.message_id = messages.id and h.user_id = ${context.userId}
          )
        order by created_at desc
        limit 200
      ) m
      left join messages r on r.id = m.reply_to
      left join profiles rp on rp.user_id = r.sender_id
      order by m.created_at asc
    `;

    const reactionRows = await sql<{ message_id: string; user_id: string; emoji: string }>`
      select r.message_id, r.user_id, r.emoji
      from reactions r
      join messages m on m.id = r.message_id
      where m.conversation_id = ${data.conversationId}
    `;

    const typingRows = await sql<{ user_id: string }>`
      select user_id from typing
      where conversation_id = ${data.conversationId}
        and user_id <> ${context.userId}
        and updated_at > now() - interval '4 seconds'
    `;

    const have = new Set(data.haveMedia);
    const byMessage = new Map<string, { emoji: ReactionEmoji; userIds: string[] }[]>();
    for (const reaction of reactionRows) {
      if (!REACTIONS.includes(reaction.emoji as ReactionEmoji)) continue;
      const list = byMessage.get(reaction.message_id) ?? [];
      const found = list.find((item) => item.emoji === reaction.emoji);
      if (found) found.userIds.push(reaction.user_id);
      else list.push({ emoji: reaction.emoji as ReactionEmoji, userIds: [reaction.user_id] });
      byMessage.set(reaction.message_id, list);
    }

    const messages: ThreadMessage[] = messageRows.map((row) => {
      const deleted = flag(row.deleted_for_everyone);
      const skipped = !deleted && Boolean(row.media) && have.has(row.id);
      const kind = row.kind === "image" || row.kind === "voice" ? row.kind : "text";
      return {
        id: row.id,
        senderId: row.sender_id,
        kind,
        body: deleted ? null : row.body,
        media: deleted || skipped ? null : row.media,
        mediaSkipped: skipped,
        createdAt: iso(row.created_at),
        editedAt: deleted ? null : isoOrNull(row.edited_at),
        forwarded: !deleted && flag(row.forwarded),
        deleted,
        reply: row.reply_to
          ? {
              id: row.reply_to,
              senderName: row.reply_name || "Someone",
              preview: previewOf(row.reply_kind, row.reply_body, flag(row.reply_deleted)),
            }
          : null,
        reactions: (byMessage.get(row.id) ?? []).map((reaction) => ({
          ...reaction,
          mine: reaction.userIds.includes(context.userId),
        })),
      };
    });

    const kind = conv.kind === "group" ? "group" : "dm";
    const peer = memberRows.find((row) => row.user_id !== context.userId);
    const blocked = kind === "dm" && peer ? await isBlocked(sql, context.userId, peer.user_id) : false;
    const requestStatus =
      mine.request_status === "pending" || mine.request_status === "ignored"
        ? mine.request_status
        : "accepted";

    return {
      conversation: {
        id: conv.id,
        kind,
        name: conv.name,
        avatar: conv.avatar,
        disappearSeconds: num(conv.disappear_seconds),
      },
      me: {
        role: mine.role === "admin" ? "admin" : "member",
        requestStatus,
        pinned: flag(mine.pinned),
        muted: flag(mine.muted),
        archived: flag(mine.archived),
      },
      peerRequestStatus:
        kind === "dm" && peer
          ? peer.request_status === "pending" || peer.request_status === "ignored"
            ? peer.request_status
            : "accepted"
          : null,
      blocked,
      members: memberRows.map((row) => ({
        userId: row.user_id,
        displayName: row.display_name,
        number: row.number,
        avatar: row.avatar,
        online: flag(row.online),
        lastSeen: iso(row.last_seen),
        lastReadAt: isoOrNull(row.last_read_at),
        role: row.role === "admin" ? "admin" : "member",
      })),
      messages,
      typingUserIds: typingRows.map((row) => row.user_id),
    };
  });

type SendInput = {
  id: string;
  conversationId: string;
  kind: "text" | "image" | "voice";
  body: string | null;
  media: string | null;
  replyTo: string | null;
};

function parseSend(input: SendInput): SendInput {
  const id = mustId(input?.id);
  const conversationId = mustId(input?.conversationId);
  const kind = input?.kind;
  if (kind !== "text" && kind !== "image" && kind !== "voice") throw new Error("Invalid message");
  const replyTo = input.replyTo ? mustId(input.replyTo) : null;
  if (kind === "text") {
    const text = (input.body ?? "").trim();
    if (!text || text.length > 4000) throw new Error("Message is empty or too long");
    return { id, conversationId, kind, body: text, media: null, replyTo };
  }
  if (kind === "image") {
    const media = parseAvatar(input.media, 280_000);
    if (!media) throw new Error("That image is too large");
    const caption = (input.body ?? "").trim();
    if (caption.length > 200) throw new Error("Caption is too long");
    return { id, conversationId, kind, body: caption || null, media, replyTo };
  }
  const media = input.media;
  if (typeof media !== "string" || !media.startsWith("data:audio/") || media.length > 520_000) {
    throw new Error("Voice note is too large");
  }
  return { id, conversationId, kind, body: null, media, replyTo };
}

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: SendInput) => parseSend(input))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await assertMember(sql, data.conversationId, context.userId);
    const convRows = await sql<{ kind: string; disappear_seconds: unknown }>`
      select kind, disappear_seconds from conversations where id = ${data.conversationId}
    `;
    const conv = convRows[0];
    if (!conv) throw new Error("Conversation not found");
    const membership = await sql<{ request_status: string }>`
      select request_status from conversation_members
      where conversation_id = ${data.conversationId} and user_id = ${context.userId}
    `;
    if (membership[0]?.request_status === "pending") {
      throw new Error("Accept the request before you reply");
    }
    if (conv.kind === "dm") {
      const peer = await dmPeer(sql, data.conversationId, context.userId);
      if (peer && (await isBlocked(sql, context.userId, peer))) {
        throw new Error("You can't message this person");
      }
      if (peer) {
        await sql`
          update conversation_members
          set request_status = 'pending'
          where conversation_id = ${data.conversationId}
            and user_id = ${peer}
            and request_status = 'ignored'
        `;
      }
    }
    if (data.replyTo) {
      const reply = await sql<{ conversation_id: string }>`
        select conversation_id from messages where id = ${data.replyTo}
      `;
      if (!reply.length || reply[0].conversation_id !== data.conversationId) {
        throw new Error("Can't reply to that message");
      }
    }
    const existing = await sql<{ conversation_id: string; sender_id: string }>`
      select conversation_id, sender_id from messages where id = ${data.id}
    `;
    if (existing.length) {
      if (existing[0].conversation_id !== data.conversationId || existing[0].sender_id !== context.userId) {
        throw new Error("Couldn't send that message");
      }
      return { ok: true as const };
    }
    const seconds = num(conv.disappear_seconds);
    await sql`
      insert into messages (id, conversation_id, sender_id, kind, body, media, reply_to, expires_at)
      values (
        ${data.id},
        ${data.conversationId},
        ${context.userId},
        ${data.kind},
        ${data.body},
        ${data.media},
        ${data.replyTo},
        case when ${seconds} > 0 then now() + (${seconds} * interval '1 second') else null end
      )
    `;
    await sql`
      update conversations set updated_at = now() where id = ${data.conversationId}
    `;
    await sql`
      update profiles set last_seen = now() where user_id = ${context.userId}
    `;
    await sql`
      delete from typing where conversation_id = ${data.conversationId} and user_id = ${context.userId}
    `;
    return { ok: true as const };
  });

export const markRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId: string }) => mustId(input?.conversationId))
  .handler(async ({ context, data: conversationId }) => {
    const sql = await getSql();
    await sql`
      update conversation_members
      set last_read_at = now()
      where conversation_id = ${conversationId} and user_id = ${context.userId}
    `;
    return { ok: true as const };
  });

export const setTyping = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId: string; typing: boolean }) => ({
    conversationId: mustId(input?.conversationId),
    typing: Boolean(input?.typing),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await assertMember(sql, data.conversationId, context.userId);
    if (data.typing) {
      await sql`
        insert into typing (conversation_id, user_id, updated_at)
        values (${data.conversationId}, ${context.userId}, now())
        on conflict (conversation_id, user_id)
        do update set updated_at = now()
      `;
    } else {
      await sql`
        delete from typing
        where conversation_id = ${data.conversationId} and user_id = ${context.userId}
      `;
    }
    return { ok: true as const };
  });

export const toggleReaction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { messageId: string; emoji: string }) => {
    const messageId = mustId(input?.messageId);
    const emoji = REACTIONS.find((item) => item === input?.emoji);
    if (!emoji) throw new Error("That reaction isn't available");
    return { messageId, emoji };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ conversation_id: string; deleted_for_everyone: unknown }>`
      select conversation_id, deleted_for_everyone from messages where id = ${data.messageId}
    `;
    if (!rows.length) throw new Error("Message not found");
    if (flag(rows[0].deleted_for_everyone)) throw new Error("Message was deleted");
    await assertMember(sql, rows[0].conversation_id, context.userId);
    const existing = await sql<{ one: number }>`
      select 1 as one from reactions
      where message_id = ${data.messageId} and user_id = ${context.userId} and emoji = ${data.emoji}
    `;
    if (existing.length) {
      await sql`
        delete from reactions
        where message_id = ${data.messageId} and user_id = ${context.userId} and emoji = ${data.emoji}
      `;
    } else {
      await sql`
        insert into reactions (message_id, user_id, emoji)
        values (${data.messageId}, ${context.userId}, ${data.emoji})
      `;
    }
    return { ok: true as const };
  });

export const deleteMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { messageId: string; scope: "me" | "everyone" }) => {
    const messageId = mustId(input?.messageId);
    if (input?.scope !== "me" && input?.scope !== "everyone") throw new Error("Couldn't delete that message");
    return { messageId, scope: input.scope };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ sender_id: string; conversation_id: string }>`
      select sender_id, conversation_id from messages where id = ${data.messageId}
    `;
    if (!rows.length) throw new Error("Message not found");
    await assertMember(sql, rows[0].conversation_id, context.userId);
    if (data.scope === "everyone") {
      if (rows[0].sender_id !== context.userId) {
        throw new Error("You can only delete your own messages for everyone");
      }
      await sql`
        update messages
        set deleted_for_everyone = true, body = null, media = null
        where id = ${data.messageId}
      `;
      await sql`delete from reactions where message_id = ${data.messageId}`;
    } else {
      await sql`
        insert into message_hides (message_id, user_id)
        values (${data.messageId}, ${context.userId})
        on conflict do nothing
      `;
    }
    return { ok: true as const };
  });

export const setChatPrefs = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId: string; pinned?: boolean; muted?: boolean; archived?: boolean }) => {
    const conversationId = mustId(input?.conversationId);
    const next: { conversationId: string; pinned?: boolean; muted?: boolean; archived?: boolean } = {
      conversationId,
    };
    if (typeof input?.pinned === "boolean") next.pinned = input.pinned;
    if (typeof input?.muted === "boolean") next.muted = input.muted;
    if (typeof input?.archived === "boolean") next.archived = input.archived;
    if (next.pinned == null && next.muted == null && next.archived == null) {
      throw new Error("Nothing to update");
    }
    return next;
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await assertMember(sql, data.conversationId, context.userId);
    if (data.pinned != null) {
      await sql`
        update conversation_members set pinned = ${data.pinned}
        where conversation_id = ${data.conversationId} and user_id = ${context.userId}
      `;
    }
    if (data.muted != null) {
      await sql`
        update conversation_members set muted = ${data.muted}
        where conversation_id = ${data.conversationId} and user_id = ${context.userId}
      `;
    }
    if (data.archived != null) {
      await sql`
        update conversation_members set archived = ${data.archived}
        where conversation_id = ${data.conversationId} and user_id = ${context.userId}
      `;
    }
    return { ok: true as const };
  });

export const acceptRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId: string }) => mustId(input?.conversationId))
  .handler(async ({ context, data: conversationId }) => {
    const sql = await getSql();
    await sql`
      update conversation_members
      set request_status = 'accepted'
      where conversation_id = ${conversationId} and user_id = ${context.userId}
    `;
    return { ok: true as const };
  });

export const ignoreRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId: string }) => mustId(input?.conversationId))
  .handler(async ({ context, data: conversationId }) => {
    const sql = await getSql();
    await sql`
      update conversation_members
      set request_status = 'ignored'
      where conversation_id = ${conversationId}
        and user_id = ${context.userId}
        and request_status = 'pending'
    `;
    return { ok: true as const };
  });

export const blockUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId: string }) => mustId(input?.userId))
  .handler(async ({ context, data: userId }) => {
    if (userId === context.userId) throw new Error("You can't block yourself");
    const sql = await getSql();
    const exists = await sql<{ one: number }>`select 1 as one from profiles where user_id = ${userId}`;
    if (!exists.length) throw new Error("That person isn't on NumberChat");
    await sql`
      insert into blocks (owner_id, blocked_id)
      values (${context.userId}, ${userId})
      on conflict do nothing
    `;
    return { ok: true as const };
  });

export const unblockUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId: string }) => mustId(input?.userId))
  .handler(async ({ context, data: userId }) => {
    const sql = await getSql();
    await sql`
      delete from blocks where owner_id = ${context.userId} and blocked_id = ${userId}
    `;
    return { ok: true as const };
  });

export const listBlocked = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Contact[]> => {
    const sql = await getSql();
    const rows = await sql.query<ProfileRow>(
      `select ${profileSelect}
       from blocks b
       join profiles p on p.user_id = b.blocked_id
       where b.owner_id = $1
       order by p.display_name asc`,
      [context.userId],
    );
    return rows.map(mapProfile).map((profile) => ({
      userId: profile.userId,
      displayName: profile.displayName,
      number: profile.number,
      avatar: profile.avatar,
      online: profile.online,
      lastSeen: profile.lastSeen,
    }));
  });

async function assertAdmin(sql: Sql, conversationId: string, userId: string) {
  const rows = await sql<{ role: string }>`
    select role from conversation_members
    where conversation_id = ${conversationId} and user_id = ${userId}
  `;
  if (!rows.length) throw new Error("Conversation not found");
  if (rows[0].role !== "admin") throw new Error("Only an admin can do that");
}

export const renameGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId: string; name: string }) => {
    const name = cleanName(input?.name ?? "", 48);
    if (!name) throw new Error("Give the group a name");
    return { conversationId: mustId(input?.conversationId), name };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await assertAdmin(sql, data.conversationId, context.userId);
    const updated = await sql<{ id: string }>`
      update conversations set name = ${data.name}, updated_at = now()
      where id = ${data.conversationId} and kind = 'group'
      returning id
    `;
    if (!updated.length) throw new Error("That isn't a group");
    return { ok: true as const };
  });

export const addGroupMembers = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId: string; memberIds: string[] }) => {
    const memberIds = Array.isArray(input?.memberIds)
      ? [...new Set(input.memberIds.filter((id) => typeof id === "string"))]
      : [];
    if (memberIds.some((id) => !/^[A-Za-z0-9_-]{8,80}$/.test(id))) {
      throw new Error("Choose people from your contacts");
    }
    return { conversationId: mustId(input?.conversationId), memberIds };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await assertAdmin(sql, data.conversationId, context.userId);
    const kind = await sql<{ kind: string }>`select kind from conversations where id = ${data.conversationId}`;
    if (kind[0]?.kind !== "group") throw new Error("That isn't a group");
    const mine = await sql<{ contact_user_id: string }>`
      select contact_user_id from contacts where owner_id = ${context.userId}
    `;
    const allowed = new Set(mine.map((row) => row.contact_user_id));
    const current = await sql<{ n: unknown }>`
      select count(*) as n from conversation_members where conversation_id = ${data.conversationId}
    `;
    let room = 50 - num(current[0]?.n);
    for (const userId of data.memberIds) {
      if (room <= 0) break;
      if (!allowed.has(userId) || userId === context.userId) continue;
      if (await isBlocked(sql, context.userId, userId)) continue;
      const inserted = await sql<{ user_id: string }>`
        insert into conversation_members (conversation_id, user_id, role, request_status)
        values (${data.conversationId}, ${userId}, 'member', 'accepted')
        on conflict do nothing
        returning user_id
      `;
      if (inserted.length) room -= 1;
    }
    return { ok: true as const };
  });

export const removeGroupMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId: string; userId: string }) => ({
    conversationId: mustId(input?.conversationId),
    userId: mustId(input?.userId),
  }))
  .handler(async ({ context, data }) => {
    if (data.userId === context.userId) throw new Error("Leave the group instead");
    const sql = await getSql();
    await assertAdmin(sql, data.conversationId, context.userId);
    await sql`
      delete from conversation_members
      where conversation_id = ${data.conversationId}
        and user_id = ${data.userId}
        and role <> 'admin'
    `;
    return { ok: true as const };
  });

export const leaveGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId: string }) => mustId(input?.conversationId))
  .handler(async ({ context, data: conversationId }) => {
    const sql = await getSql();
    const kind = await sql<{ kind: string }>`select kind from conversations where id = ${conversationId}`;
    if (kind[0]?.kind !== "group") throw new Error("That isn't a group");
    await assertMember(sql, conversationId, context.userId);
    const admins = await sql<{ user_id: string }>`
      select user_id from conversation_members
      where conversation_id = ${conversationId} and role = 'admin' and user_id <> ${context.userId}
    `;
    if (!admins.length) {
      const next = await sql<{ user_id: string }>`
        select user_id from conversation_members
        where conversation_id = ${conversationId} and user_id <> ${context.userId}
        limit 1
      `;
      if (next[0]) {
        await sql`
          update conversation_members set role = 'admin'
          where conversation_id = ${conversationId} and user_id = ${next[0].user_id}
        `;
      }
    }
    await sql`
      delete from conversation_members
      where conversation_id = ${conversationId} and user_id = ${context.userId}
    `;
    const left = await sql<{ n: unknown }>`
      select count(*) as n from conversation_members where conversation_id = ${conversationId}
    `;
    if (num(left[0]?.n) === 0) {
      await sql`delete from conversations where id = ${conversationId}`;
    }
    return { ok: true as const };
  });

export const setDisappear = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId: string; seconds: number }) => {
    const seconds = input?.seconds;
    if (seconds !== 0 && seconds !== 86400 && seconds !== 604800) {
      throw new Error("Choose off, 24 hours, or 7 days");
    }
    return { conversationId: mustId(input?.conversationId), seconds };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await assertMember(sql, data.conversationId, context.userId);
    await sql`
      update conversations set disappear_seconds = ${data.seconds}
      where id = ${data.conversationId}
    `;
    return { ok: true as const };
  });

export const editMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { messageId: string; body: string }) => {
    const body = (input?.body ?? "").trim();
    if (!body || body.length > 4000) throw new Error("Message is empty or too long");
    return { messageId: mustId(input?.messageId), body };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ conversation_id: string }>`
      update messages
      set body = ${data.body}, edited_at = now()
      where id = ${data.messageId}
        and sender_id = ${context.userId}
        and kind = 'text'
        and deleted_for_everyone = false
        and created_at > now() - interval '15 minutes'
      returning conversation_id
    `;
    if (!rows.length) throw new Error("You can edit a text for 15 minutes after sending");
    return { ok: true as const };
  });

export const forwardMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { messageId: string; conversationId: string }) => ({
    messageId: mustId(input?.messageId),
    conversationId: mustId(input?.conversationId),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const source = await sql<{
      conversation_id: string;
      kind: string;
      body: string | null;
      media: string | null;
      deleted_for_everyone: unknown;
    }>`
      select conversation_id, kind, body, media, deleted_for_everyone
      from messages
      where id = ${data.messageId}
        and (expires_at is null or expires_at > now())
    `;
    if (!source.length || flag(source[0].deleted_for_everyone)) throw new Error("That message is gone");
    await assertMember(sql, source[0].conversation_id, context.userId);
    await assertMember(sql, data.conversationId, context.userId);
    const dest = await sql<{ kind: string; disappear_seconds: unknown; request_status: string }>`
      select c.kind, c.disappear_seconds, mem.request_status
      from conversations c
      join conversation_members mem on mem.conversation_id = c.id and mem.user_id = ${context.userId}
      where c.id = ${data.conversationId}
    `;
    if (!dest.length) throw new Error("Conversation not found");
    if (dest[0].request_status === "pending") throw new Error("Accept the request before you reply");
    if (dest[0].kind === "dm") {
      const peer = await dmPeer(sql, data.conversationId, context.userId);
      if (peer && (await isBlocked(sql, context.userId, peer))) {
        throw new Error("You can't message this person");
      }
    }
    const id = crypto.randomUUID();
    const seconds = num(dest[0].disappear_seconds);
    await sql`
      insert into messages (id, conversation_id, sender_id, kind, body, media, forwarded, expires_at)
      values (
        ${id},
        ${data.conversationId},
        ${context.userId},
        ${source[0].kind},
        ${source[0].body},
        ${source[0].media},
        true,
        case when ${seconds} > 0 then now() + (${seconds} * interval '1 second') else null end
      )
    `;
    await sql`update conversations set updated_at = now() where id = ${data.conversationId}`;
    return { id };
  });

export const searchThread = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId: string; query: string }) => {
    const query = (input?.query ?? "").trim().slice(0, 80);
    if (query.length < 1) throw new Error("Type something to search");
    return { conversationId: mustId(input?.conversationId), query };
  })
  .handler(async ({ context, data }): Promise<ThreadHit[]> => {
    const sql = await getSql();
    await assertMember(sql, data.conversationId, context.userId);
    const rows = await sql<{ id: string; body: string; created_at: unknown; sender_name: string | null }>`
      select m.id, m.body, m.created_at, p.display_name as sender_name
      from messages m
      left join profiles p on p.user_id = m.sender_id
      where m.conversation_id = ${data.conversationId}
        and m.kind = 'text'
        and m.deleted_for_everyone = false
        and m.body ilike ${likeTerm(data.query)} escape '\\'
        and (m.expires_at is null or m.expires_at > now())
        and not exists (
          select 1 from message_hides h where h.message_id = m.id and h.user_id = ${context.userId}
        )
      order by m.created_at desc
      limit 30
    `;
    return rows.map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: iso(row.created_at),
      senderName: row.sender_name || "Someone",
    }));
  });
