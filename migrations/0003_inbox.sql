alter table conversations add column if not exists disappear_seconds integer not null default 0;

alter table conversation_members add column if not exists role text not null default 'member';
alter table conversation_members add column if not exists pinned boolean not null default false;
alter table conversation_members add column if not exists muted boolean not null default false;
alter table conversation_members add column if not exists archived boolean not null default false;
alter table conversation_members add column if not exists request_status text not null default 'accepted';

alter table messages add column if not exists edited_at timestamptz;
alter table messages add column if not exists expires_at timestamptz;
alter table messages add column if not exists forwarded boolean not null default false;

update conversation_members cm
set role = 'admin'
from conversations c
where c.id = cm.conversation_id
  and c.kind = 'group'
  and c.created_by = cm.user_id
  and cm.role is distinct from 'admin';

create table if not exists blocks (
  owner_id text not null,
  blocked_id text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, blocked_id)
);

create index if not exists blocks_owner_idx on blocks (owner_id);
create index if not exists messages_expires_idx on messages (expires_at);
