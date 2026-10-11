-- Additive, workspace-scoped Founder Updates feed.
begin;

create table if not exists public.studio_founder_updates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 180),
  body text not null check (length(trim(body)) between 1 and 12000),
  author_id uuid not null default auth.uid() references public.profiles(id),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create table if not exists public.studio_founder_update_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  post_id uuid not null,
  body text not null check (length(trim(body)) between 1 and 2000),
  author_id uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, post_id) references public.studio_founder_updates(workspace_id, id) on delete cascade
);

create index if not exists studio_founder_updates_feed_idx on public.studio_founder_updates(workspace_id, is_pinned desc, created_at desc);
create index if not exists studio_founder_update_comments_post_idx on public.studio_founder_update_comments(workspace_id, post_id, created_at);

alter table public.studio_founder_updates enable row level security;
alter table public.studio_founder_update_comments enable row level security;

drop policy if exists founder_updates_member_read on public.studio_founder_updates;
create policy founder_updates_member_read on public.studio_founder_updates for select to authenticated using (
  exists (select 1 from public.workspace_members m where m.workspace_id = studio_founder_updates.workspace_id and m.user_id = (select auth.uid()))
);
drop policy if exists founder_updates_founder_insert on public.studio_founder_updates;
create policy founder_updates_founder_insert on public.studio_founder_updates for insert to authenticated with check (
  author_id = (select auth.uid()) and is_pinned = false and exists (
    select 1 from public.workspace_members m
    where m.workspace_id = studio_founder_updates.workspace_id and m.user_id = (select auth.uid())
      and (m.is_founder = true or m.role in ('owner', 'admin'))
  )
);
drop policy if exists founder_updates_founder_pin on public.studio_founder_updates;
create policy founder_updates_founder_pin on public.studio_founder_updates for update to authenticated using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = studio_founder_updates.workspace_id and m.user_id = (select auth.uid())
      and (m.is_founder = true or m.role in ('owner', 'admin'))
  )
) with check (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = studio_founder_updates.workspace_id and m.user_id = (select auth.uid())
      and (m.is_founder = true or m.role in ('owner', 'admin'))
  )
);

drop policy if exists founder_update_comments_member_read on public.studio_founder_update_comments;
create policy founder_update_comments_member_read on public.studio_founder_update_comments for select to authenticated using (
  exists (select 1 from public.workspace_members m where m.workspace_id = studio_founder_update_comments.workspace_id and m.user_id = (select auth.uid()))
);
drop policy if exists founder_update_comments_member_insert on public.studio_founder_update_comments;
create policy founder_update_comments_member_insert on public.studio_founder_update_comments for insert to authenticated with check (
  author_id = (select auth.uid())
  and exists (select 1 from public.workspace_members m where m.workspace_id = studio_founder_update_comments.workspace_id and m.user_id = (select auth.uid()))
  and exists (select 1 from public.studio_founder_updates p where p.workspace_id = studio_founder_update_comments.workspace_id and p.id = studio_founder_update_comments.post_id)
);

revoke all on public.studio_founder_updates from anon, authenticated;
revoke all on public.studio_founder_update_comments from anon, authenticated;
grant select on public.studio_founder_updates to authenticated;
grant insert (id, workspace_id, title, body) on public.studio_founder_updates to authenticated;
grant update (is_pinned) on public.studio_founder_updates to authenticated;
grant select on public.studio_founder_update_comments to authenticated;
grant insert (id, workspace_id, post_id, body) on public.studio_founder_update_comments to authenticated;

insert into public.studio_founder_updates (workspace_id, title, body, author_id, is_pinned)
select w.id,
  'The Evolution of Fairway Studio',
  $$Fairway Studio began with a shared belief: the strongest creative work does not come from a single prompt or a single person. It comes from people bringing different instincts to the same table, using AI as a collaborative design material while keeping human taste, authorship, and judgment at the center.

Arlin brought forward the Hunter & Heckard name, giving the brand a voice rooted in heritage, character, and the culture of golf. Jafar developed the first logo concept, turning that early direction into a visual starting point the team could see, question, and build on together.

That exchange became the model for Fairway Studio: ideas remain connected to their source, concepts can evolve without erasing who contributed what, and founders can review the same work in one place. AI helps us explore more directions and make iteration faster; it does not replace the people responsible for the story, the design decisions, or the final call.

Founder Updates is where we will share the decisions, context, and milestones that shape that work—so the team can understand not only what changed, but why.$$
  , founder.user_id, true
from public.workspaces w
cross join lateral (
  select m.user_id
  from public.workspace_members m
  join public.profiles p on p.id = m.user_id
  where m.workspace_id = w.id and (m.is_founder = true or m.role in ('owner', 'admin')) and lower(trim(p.display_name)) = 'jafar'
  order by m.user_id
  limit 1
) founder
where lower(trim(w.name)) = 'fairway studio'
and not exists (
  select 1 from public.studio_founder_updates existing
  where existing.workspace_id = w.id and existing.title = 'The Evolution of Fairway Studio'
);

commit;
