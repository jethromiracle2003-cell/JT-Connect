create table if not exists profiles (
  user_id text primary key,
  display_name text not null,
  number text not null unique,
  avatar text,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint profiles_number_digits check (number ~ '^[0-9]{10}$')
);

create table if not exists contacts (
  owner_id text not null,
  contact_user_id text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, contact_user_id)
);

create index if not exists contacts_owner_idx on contacts (owner_id);

create table if not exists conversations (
  id text primary key,
  kind text not null check (kind in ('dm', 'group')),
  name text,
  avatar text,
  dm_key text unique,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversation_members (
  conversation_id text not null references conversations (id) on delete cascade,
  user_id text not null,
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx on conversation_members (user_id);

create table if not exists messages (
  id text primary key,
  conversation_id text not null references conversations (id) on delete cascade,
  sender_id text not null,
  kind text not null check (kind in ('text', 'image', 'voice')),
  body text,
  media text,
  reply_to text,
  deleted_for_everyone boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists messages_conv_created_idx on messages (conversation_id, created_at desc);

create table if not exists message_hides (
  message_id text not null references messages (id) on delete cascade,
  user_id text not null,
  primary key (message_id, user_id)
);

create table if not exists reactions (
  message_id text not null references messages (id) on delete cascade,
  user_id text not null,
  emoji text not null,
  primary key (message_id, user_id, emoji)
);

create table if not exists typing (
  conversation_id text not null references conversations (id) on delete cascade,
  user_id text not null,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
