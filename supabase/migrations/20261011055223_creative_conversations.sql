-- Conversations are private by default. Only server routes may write turns:
-- a browser must never be able to forge an assistant reply or a generation ID.
create table public.studio_creative_chats (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text not null check(length(title) between 1 and 120),
  visibility text not null default 'private' check(visibility in ('private','workspace')),
  created_at timestamptz not null default now(),
  unique(workspace_id,id)
);
create table public.studio_creative_turns (
  id uuid primary key,
  workspace_id uuid not null,
  chat_id uuid not null,
  author_id uuid not null references auth.users(id),
  prompt text not null check(length(prompt) between 1 and 2000),
  mode text not null check(mode in ('chat','image','comment')),
  request_hash text not null,
  answer text not null default '',
  status text not null default 'pending' check(status in ('pending','complete','failed')),
  error text,
  job_id uuid references public.studio_generation_jobs(id),
  source_version_id uuid references public.studio_versions(id),
  created_at timestamptz not null default now(),
  foreign key(workspace_id,chat_id) references public.studio_creative_chats(workspace_id,id) on delete cascade
);
create index studio_creative_chats_workspace on public.studio_creative_chats(workspace_id,created_at desc);
create index studio_creative_turns_chat on public.studio_creative_turns(chat_id,created_at);
create unique index studio_creative_one_pending on public.studio_creative_turns(chat_id) where status='pending';
alter table public.studio_creative_chats enable row level security;
alter table public.studio_creative_turns enable row level security;
revoke all on public.studio_creative_chats,public.studio_creative_turns from anon,authenticated;
grant select on public.studio_creative_chats,public.studio_creative_turns to authenticated;
grant all on public.studio_creative_chats,public.studio_creative_turns to service_role;
create policy creative_chat_read on public.studio_creative_chats for select to authenticated using (
  (visibility='workspace' or created_by=(select auth.uid()))
  and exists(select 1 from public.workspace_members m where m.workspace_id=studio_creative_chats.workspace_id and m.user_id=(select auth.uid()))
);
create policy creative_turn_read on public.studio_creative_turns for select to authenticated using (
  exists(select 1 from public.studio_creative_chats c where c.id=chat_id and c.workspace_id=studio_creative_turns.workspace_id)
);
