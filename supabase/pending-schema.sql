-- REVIEWED LOCAL DRAFT ONLY. Not applied to any remote database.
-- Prerequisite: existing Fairway public tables from BACKEND-INVENTORY.md.
-- Apply in an isolated database first, run tests, then obtain rollout approval.
begin;
create schema if not exists studio_private;
revoke all on schema studio_private from public, anon;
grant usage on schema studio_private to authenticated;
alter table public.workspace_invites add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists workspace_invites_id_idx on public.workspace_invites(id);
alter table public.workspace_members add column if not exists is_founder boolean not null default false;
alter table public.brand_ideas add column if not exists revision integer not null default 0;
alter table public.brand_ideas add column if not exists tags text[] not null default '{}';
alter table public.brand_ideas add column if not exists archived_at timestamptz;
alter table public.workspace_files add column if not exists revision integer not null default 0;
alter table public.studio_tasks add column if not exists revision integer not null default 0;
alter table public.saved_references add column if not exists revision integer not null default 0;
alter table public.saved_references add column if not exists tags text[] not null default '{}';
alter table public.studio_tasks add column if not exists due_date date;
alter table public.studio_tasks add column if not exists priority text not null default 'normal' check(priority in ('low','normal','high','urgent'));
alter table public.studio_tasks add column if not exists checklist jsonb not null default '[]';
alter table public.studio_tasks add column if not exists blocked_reason text;
alter table public.saved_references add column if not exists archived_at timestamptz;
alter table public.workspaces add column if not exists revision integer not null default 0;
alter table public.workspaces add column if not exists timezone text not null default 'UTC';
alter table public.workspaces add column if not exists review_policy jsonb not null default '{"policy":"unanimous"}';
create table if not exists public.studio_projects (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, created_at timestamptz not null default now(), title text not null check(length(trim(title)) between 1 and 240), brief text not null default '', category text not null default 'Brand', status text not null default 'active', lead_id uuid references auth.users(id), idea_id uuid references public.brand_ideas(id), revision integer not null default 0, created_by uuid not null references auth.users(id), unique(workspace_id,idea_id), unique(workspace_id,id));
alter table public.studio_projects enable row level security;
revoke all on public.studio_projects from anon, authenticated;
grant select on public.studio_projects to authenticated;
create index if not exists studio_projects_workspace_idx on public.studio_projects(workspace_id,created_at desc);
drop policy if exists studio_member_read on public.studio_projects;
create policy studio_member_read on public.studio_projects for select to authenticated using (exists(select 1 from public.workspace_members m where m.workspace_id=studio_projects.workspace_id and m.user_id=(select auth.uid())));
create table if not exists public.studio_versions (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, created_at timestamptz not null default now(), project_id uuid not null, title text not null, body text not null default '', file_id uuid references public.workspace_files(id), image_url text, source_url text, media_verification text not null default 'text_only', parent_id uuid, provenance jsonb not null default '{}', created_by uuid not null references auth.users(id), unique(workspace_id,id), foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id), foreign key(workspace_id,parent_id) references public.studio_versions(workspace_id,id));
alter table public.studio_versions enable row level security;
revoke all on public.studio_versions from anon, authenticated;
grant select on public.studio_versions to authenticated;
create index if not exists studio_versions_workspace_idx on public.studio_versions(workspace_id,created_at desc);
drop policy if exists studio_member_read on public.studio_versions;
create policy studio_member_read on public.studio_versions for select to authenticated using (exists(select 1 from public.workspace_members m where m.workspace_id=studio_versions.workspace_id and m.user_id=(select auth.uid())));
create table if not exists public.studio_canvas_nodes (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, created_at timestamptz not null default now(), project_id uuid not null, version_id uuid, reference_id uuid references public.saved_references(id), file_id uuid references public.workspace_files(id), kind text not null default 'note' check(kind in ('note','annotation','reference','file')), body text not null default '', x double precision not null default 0 check(x between -100000 and 100000), y double precision not null default 0 check(y between -100000 and 100000), width double precision not null default 280 check(width between 40 and 4000), height double precision not null default 200 check(height between 40 and 4000), check(kind <> 'annotation' or (version_id is not null and x between 0 and 1 and y between 0 and 1)), revision integer not null default 0, foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id), foreign key(workspace_id,version_id) references public.studio_versions(workspace_id,id));
alter table public.studio_canvas_nodes enable row level security;
revoke all on public.studio_canvas_nodes from anon, authenticated;
grant select on public.studio_canvas_nodes to authenticated;
create index if not exists studio_canvas_nodes_workspace_idx on public.studio_canvas_nodes(workspace_id,created_at desc);
drop policy if exists studio_member_read on public.studio_canvas_nodes;
create policy studio_member_read on public.studio_canvas_nodes for select to authenticated using (exists(select 1 from public.workspace_members m where m.workspace_id=studio_canvas_nodes.workspace_id and m.user_id=(select auth.uid())));
create table if not exists public.studio_review_rounds (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, created_at timestamptz not null default now(), project_id uuid not null, version_id uuid not null, scope text not null check(scope in ('name','wordmark','monogram','palette','typography','guidelines','concept')), reviewers uuid[] not null check(cardinality(reviewers)>0), policy text not null check(policy in ('unanimous','threshold')), threshold integer not null check(threshold>0), status text not null default 'open' check(status in ('open','closed')), revision integer not null default 0, created_by uuid not null references auth.users(id), unique(workspace_id,id), foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id), foreign key(workspace_id,version_id) references public.studio_versions(workspace_id,id));
alter table public.studio_review_rounds enable row level security;
revoke all on public.studio_review_rounds from anon, authenticated;
grant select on public.studio_review_rounds to authenticated;
create index if not exists studio_review_rounds_workspace_idx on public.studio_review_rounds(workspace_id,created_at desc);
drop policy if exists studio_member_read on public.studio_review_rounds;
create policy studio_member_read on public.studio_review_rounds for select to authenticated using (exists(select 1 from public.workspace_members m where m.workspace_id=studio_review_rounds.workspace_id and m.user_id=(select auth.uid())));
create table if not exists public.studio_reviews (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, created_at timestamptz not null default now(), round_id uuid not null, reviewer_id uuid not null references auth.users(id), disposition text not null check(disposition in ('approve','request_changes','abstain')), rating integer check(rating between 1 and 5), comment text not null default '', revision integer not null default 0, unique(round_id,reviewer_id), foreign key(workspace_id,round_id) references public.studio_review_rounds(workspace_id,id));
alter table public.studio_reviews enable row level security;
revoke all on public.studio_reviews from anon, authenticated;
grant select on public.studio_reviews to authenticated;
create index if not exists studio_reviews_workspace_idx on public.studio_reviews(workspace_id,created_at desc);
drop policy if exists studio_member_read on public.studio_reviews;
create policy studio_member_read on public.studio_reviews for select to authenticated using (exists(select 1 from public.workspace_members m where m.workspace_id=studio_reviews.workspace_id and m.user_id=(select auth.uid())));
create table if not exists public.studio_decisions (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, created_at timestamptz not null default now(), round_id uuid not null unique, project_id uuid not null, version_id uuid not null, scope text not null, rationale text not null default '', outcome text not null default 'approved', evidence jsonb not null, created_by uuid not null references auth.users(id), unique(workspace_id,id), foreign key(workspace_id,round_id) references public.studio_review_rounds(workspace_id,id), foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id), foreign key(workspace_id,version_id) references public.studio_versions(workspace_id,id));
alter table public.studio_decisions enable row level security;
revoke all on public.studio_decisions from anon, authenticated;
grant select on public.studio_decisions to authenticated;
create index if not exists studio_decisions_workspace_idx on public.studio_decisions(workspace_id,created_at desc);
drop policy if exists studio_member_read on public.studio_decisions;
create policy studio_member_read on public.studio_decisions for select to authenticated using (exists(select 1 from public.workspace_members m where m.workspace_id=studio_decisions.workspace_id and m.user_id=(select auth.uid())));
create table if not exists public.studio_kits (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, created_at timestamptz not null default now(), title text not null, components jsonb not null, usage_note text not null, created_by uuid not null references auth.users(id), unique(workspace_id,id));
alter table public.studio_kits enable row level security;
revoke all on public.studio_kits from anon, authenticated;
grant select on public.studio_kits to authenticated;
create index if not exists studio_kits_workspace_idx on public.studio_kits(workspace_id,created_at desc);
drop policy if exists studio_member_read on public.studio_kits;
create policy studio_member_read on public.studio_kits for select to authenticated using (exists(select 1 from public.workspace_members m where m.workspace_id=studio_kits.workspace_id and m.user_id=(select auth.uid())));
create table if not exists public.studio_activity (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, created_at timestamptz not null default now(), actor_id uuid not null references auth.users(id), operation text not null, entity_id uuid, payload jsonb not null default '{}');
alter table public.studio_activity enable row level security;
revoke all on public.studio_activity from anon, authenticated;
grant select on public.studio_activity to authenticated;
create index if not exists studio_activity_workspace_idx on public.studio_activity(workspace_id,created_at desc);
drop policy if exists studio_member_read on public.studio_activity;
create policy studio_member_read on public.studio_activity for select to authenticated using (exists(select 1 from public.workspace_members m where m.workspace_id=studio_activity.workspace_id and m.user_id=(select auth.uid())));
create table if not exists public.studio_threads (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, created_at timestamptz not null default now(), title text not null, project_id uuid, idea_id uuid references public.brand_ideas(id), task_id uuid references public.studio_tasks(id), check(num_nonnulls(idea_id,task_id)<=1), created_by uuid not null references auth.users(id), unique(workspace_id,id), foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id));
alter table public.studio_threads enable row level security;
revoke all on public.studio_threads from anon, authenticated;
grant select on public.studio_threads to authenticated;
create index if not exists studio_threads_workspace_idx on public.studio_threads(workspace_id,created_at desc);
drop policy if exists studio_member_read on public.studio_threads;
create policy studio_member_read on public.studio_threads for select to authenticated using (exists(select 1 from public.workspace_members m where m.workspace_id=studio_threads.workspace_id and m.user_id=(select auth.uid())));
create table if not exists public.studio_requests (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, created_at timestamptz not null default now(), actor_id uuid not null references auth.users(id), operation text not null, request_id uuid not null, input jsonb not null, result jsonb not null, unique(workspace_id,actor_id,operation,request_id));
alter table public.studio_requests enable row level security;
revoke all on public.studio_requests from anon, authenticated;
grant select on public.studio_requests to authenticated;
create index if not exists studio_requests_workspace_idx on public.studio_requests(workspace_id,created_at desc);
drop policy if exists studio_member_read on public.studio_requests;
create policy studio_member_read on public.studio_requests for select to authenticated using (exists(select 1 from public.workspace_members m where m.workspace_id=studio_requests.workspace_id and m.user_id=(select auth.uid()) and studio_requests.actor_id=(select auth.uid())));
alter table public.studio_projects add column if not exists kit_id uuid references public.studio_kits(id);
create unique index if not exists studio_thread_context_idx on public.studio_threads(workspace_id,project_id,idea_id,task_id) nulls not distinct where num_nonnulls(project_id,idea_id,task_id)>0;
alter table public.brand_ideas add column if not exists project_id uuid references public.studio_projects(id);
alter table public.studio_tasks add column if not exists source_message_id uuid references public.workspace_messages(id);
alter table public.studio_tasks add column if not exists project_id uuid references public.studio_projects(id);
alter table public.workspace_messages add column if not exists thread_id uuid;
alter table public.workspace_messages add column if not exists client_request_id uuid;
create unique index if not exists workspace_messages_request_idx on public.workspace_messages(workspace_id,author_id,client_request_id);
alter table public.workspaces add column if not exists active_kit_id uuid references public.studio_kits(id);
-- Enforce workspace boundaries even on direct writes through retained legacy clients.
create unique index if not exists saved_references_workspace_id_idx on public.saved_references(workspace_id,id);
create unique index if not exists workspace_files_workspace_id_idx on public.workspace_files(workspace_id,id);
create unique index if not exists workspace_messages_workspace_id_idx on public.workspace_messages(workspace_id,id);
create unique index if not exists studio_tasks_workspace_id_idx on public.studio_tasks(workspace_id,id);
create unique index if not exists brand_ideas_workspace_id_idx on public.brand_ideas(workspace_id,id);
do $$ begin
 if not exists(select 1 from pg_constraint where conname='studio_project_kit_workspace_fk') then alter table public.studio_projects add constraint studio_project_kit_workspace_fk foreign key(workspace_id,kit_id) references public.studio_kits(workspace_id,id); end if;
 if not exists(select 1 from pg_constraint where conname='studio_version_file_workspace_fk') then alter table public.studio_versions add constraint studio_version_file_workspace_fk foreign key(workspace_id,file_id) references public.workspace_files(workspace_id,id); end if;
 if not exists(select 1 from pg_constraint where conname='studio_node_file_workspace_fk') then alter table public.studio_canvas_nodes add constraint studio_node_file_workspace_fk foreign key(workspace_id,file_id) references public.workspace_files(workspace_id,id); end if;
 if not exists(select 1 from pg_constraint where conname='studio_idea_project_workspace_fk') then alter table public.brand_ideas add constraint studio_idea_project_workspace_fk foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id); end if;
 if not exists(select 1 from pg_constraint where conname='studio_task_source_workspace_fk') then alter table public.studio_tasks add constraint studio_task_source_workspace_fk foreign key(workspace_id,source_message_id) references public.workspace_messages(workspace_id,id); end if;
 if not exists(select 1 from pg_constraint where conname='studio_thread_idea_workspace_fk') then alter table public.studio_threads add constraint studio_thread_idea_workspace_fk foreign key(workspace_id,idea_id) references public.brand_ideas(workspace_id,id); end if;
 if not exists(select 1 from pg_constraint where conname='studio_thread_task_workspace_fk') then alter table public.studio_threads add constraint studio_thread_task_workspace_fk foreign key(workspace_id,task_id) references public.studio_tasks(workspace_id,id); end if;
 if not exists(select 1 from pg_constraint where conname='studio_project_idea_workspace_fk') then alter table public.studio_projects add constraint studio_project_idea_workspace_fk foreign key(workspace_id,idea_id) references public.brand_ideas(workspace_id,id); end if;
 if not exists(select 1 from pg_constraint where conname='studio_node_reference_workspace_fk') then alter table public.studio_canvas_nodes add constraint studio_node_reference_workspace_fk foreign key(workspace_id,reference_id) references public.saved_references(workspace_id,id); end if;
 if not exists(select 1 from pg_constraint where conname='studio_task_project_workspace_fk') then alter table public.studio_tasks add constraint studio_task_project_workspace_fk foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id); end if;
 if not exists(select 1 from pg_constraint where conname='studio_message_thread_workspace_fk') then alter table public.workspace_messages add constraint studio_message_thread_workspace_fk foreign key(workspace_id,thread_id) references public.studio_threads(workspace_id,id); end if;
end $$;
create or replace function studio_private.bump_revision() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if new.revision <= old.revision then new.revision=old.revision+1; end if;
 return new;
end $$;
revoke all on function studio_private.bump_revision() from public,anon;
do $$ declare t text; begin
 foreach t in array array['brand_ideas','studio_tasks','saved_references','workspace_files','workspaces'] loop
  execute format('drop trigger if exists studio_revision_guard on public.%I',t);
  execute format('create trigger studio_revision_guard before update on public.%I for each row execute function studio_private.bump_revision()',t);
 end loop;
end $$;
-- Keep a workspace's active kit inside the same workspace, even for privileged writers.
do $$ begin
 if not exists(select 1 from pg_constraint where conname='studio_active_kit_workspace_fk') then alter table public.workspaces add constraint studio_active_kit_workspace_fk foreign key(id,active_kit_id) references public.studio_kits(workspace_id,id); end if;
end $$;
-- Retained clients may rename workspaces. Governance state changes only through validated RPC.
revoke update on public.workspaces from authenticated;
revoke update(active_kit_id,review_policy,revision,timezone) on public.workspaces from authenticated;
grant update(name,updated_at) on public.workspaces to authenticated;
revoke truncate,references,trigger on public.workspace_rooms,public.workspace_files from authenticated;
-- A restricted file is visible only to its adding member; admin role alone is not disclosure permission.
drop policy if exists studio_files_visibility on public.workspace_files;
create policy studio_files_visibility on public.workspace_files as restrictive for select to authenticated using (
 exists(select 1 from public.workspace_members m where m.workspace_id=workspace_files.workspace_id and m.user_id=(select auth.uid()))
 and (permission_scope='workspace' or added_by=(select auth.uid())));
drop policy if exists studio_files_update_owner on public.workspace_files;
create policy studio_files_update_owner on public.workspace_files as restrictive for update to authenticated using (
 exists(select 1 from public.workspace_members m where m.workspace_id=workspace_files.workspace_id and m.user_id=(select auth.uid())) and added_by=(select auth.uid())
) with check (added_by=(select auth.uid()) and exists(select 1 from public.workspace_members m where m.workspace_id=workspace_files.workspace_id and m.user_id=(select auth.uid())));
drop policy if exists studio_files_delete_owner on public.workspace_files;
create policy studio_files_delete_owner on public.workspace_files as restrictive for delete to authenticated using (
 added_by=(select auth.uid()) and exists(select 1 from public.workspace_members m where m.workspace_id=workspace_files.workspace_id and m.user_id=(select auth.uid())));
-- A retained creator-only DELETE policy must not authorize a demoted or removed owner.
drop policy if exists studio_workspace_delete_current_owner on public.workspaces;
create policy studio_workspace_delete_current_owner on public.workspaces as restrictive for delete to authenticated using (
 exists(select 1 from public.workspace_members m where m.workspace_id=workspaces.id and m.user_id=(select auth.uid()) and m.role='owner'));
-- Metadata RLS alone does not protect direct Storage API downloads. Keep uploader access for
-- verification before the metadata record is inserted, otherwise require a currently shared file.
drop policy if exists studio_workspace_media_visibility on storage.objects;
create policy studio_workspace_media_visibility on storage.objects as restrictive for select to authenticated using (
 bucket_id <> 'workspace-media' or (
  exists(select 1 from public.workspace_members m where m.workspace_id::text=split_part(name,'/',1) and m.user_id=(select auth.uid()))
  and (split_part(name,'/',2)=(select auth.uid())::text or exists(
   select 1 from public.workspace_files f where f.url='supabase-storage://workspace-media/' || storage.objects.name and f.workspace_id::text=split_part(storage.objects.name,'/',1) and f.permission_scope='workspace'
  ))
 ));
-- Prevent delete/reinsert at a referenced immutable version path through the direct Storage API.
-- The caller must still be a member/uploader, so their own file rows and all workspace versions
-- are visible under RLS; no privilege-bypassing lookup helper is needed.
drop policy if exists studio_workspace_media_delete_unreferenced on storage.objects;
create policy studio_workspace_media_delete_unreferenced on storage.objects as restrictive for delete to authenticated using (
 bucket_id <> 'workspace-media' or (
  split_part(name,'/',2)=(select auth.uid())::text
  and exists(select 1 from public.workspace_members m where m.workspace_id::text=split_part(name,'/',1) and m.user_id=(select auth.uid()))
  and not exists(select 1 from public.workspace_files f where f.url='supabase-storage://workspace-media/' || storage.objects.name)
  and not exists(select 1 from public.studio_versions v where v.source_url='supabase-storage://workspace-media/' || storage.objects.name)
 ));
-- Exact compatibility paths used by the existing upload and media routes; no arbitrary custom schemes.
alter table public.workspace_files drop constraint if exists workspace_files_url_check;
alter table public.workspace_files add constraint workspace_files_url_check check (
 url ~ '^https://' or
 url ~ ('^supabase-storage://workspace-media/' || workspace_id::text || '/' || added_by::text || '/[a-zA-Z0-9_-]+\.(avif|gif|jpe?g|png|webp)$') or
 url ~ ('^blob://workspace-assets/' || workspace_id::text || '/' || added_by::text || '/[a-zA-Z0-9_-]+\.(avif|gif|jpe?g|png|webp)$')
);
-- Workspace/creator identity cannot be reassigned by legacy clients or privileged application functions.
create or replace function studio_private.guard_identity() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare k text;
begin
 foreach k in array array['id','workspace_id','author_id','created_by','added_by'] loop
  if to_jsonb(old) ? k and (to_jsonb(new)->k) is distinct from (to_jsonb(old)->k) then raise exception 'Record identity cannot be reassigned' using errcode='42501'; end if;
 end loop;
 return new;
end $$;
revoke all on function studio_private.guard_identity() from public,anon;
do $$ declare t text; begin
 foreach t in array array['brand_ideas','studio_tasks','saved_references','workspace_files','workspace_rooms','workspace_messages','workspaces'] loop
  execute format('drop trigger if exists studio_identity_guard on public.%I',t);
  execute format('create trigger studio_identity_guard before update on public.%I for each row execute function studio_private.guard_identity()',t);
 end loop;
end $$;
-- Private definer is intentional: only this validated transaction can write immutable governance tables.
-- Public invoker wrapper preserves API discoverability without exposing a definer in public.
create or replace function studio_private.mutate(p_workspace uuid,p_operation text,p_request uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
 actor uuid := auth.uid(); member_role text; result jsonb; old_request public.studio_requests;
 entity uuid; project uuid; round_row public.studio_review_rounds; reviewer uuid; reviewer_ids uuid[];
 approvals integer; responses integer; blocking integer; threshold_count integer; scope_name text; decision_id uuid; canonical_url text; default_policy jsonb; version_image text;
begin
 if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_request is null or p_input is null or jsonb_typeof(p_input)<>'object' or length(p_input::text)>100000 then raise exception 'Invalid request' using errcode='22023'; end if;
 if p_input ?| array['actor_id','author_id','created_by','reviewer_id','workspace_id'] then raise exception 'Identity is server assigned' using errcode='22023'; end if;
 -- Serialize operations per workspace; includes decisions/reviews, promotion and idempotent retries.
 perform pg_advisory_xact_lock(hashtextextended(p_workspace::text,0));
 select role into member_role from public.workspace_members where workspace_id=p_workspace and user_id=actor for share;
 if member_role is null then raise exception 'Workspace access denied' using errcode='42501'; end if;
 select * into old_request from public.studio_requests where workspace_id=p_workspace and actor_id=actor and operation=p_operation and request_id=p_request;
 if found then
  if old_request.input<>p_input then raise exception 'CONFLICT: request ID reused with different input' using errcode='40001'; end if;
  return old_request.result;
 end if;
 if p_operation in ('updateProject','updateIdea','archiveIdea','restoreIdea','updateTask','saveCanvas','updateReference','archiveReference','restoreReference','updateFile','updateWorkspace','updateReviewPolicy') and (p_input->>'expected_revision' is null or (p_input->>'expected_revision')::integer<0) then raise exception 'Expected revision required' using errcode='22023'; end if;
 if p_operation in ('openReview','recordDecision','publishKit','updateWorkspace','updateReviewPolicy') and member_role not in ('owner','admin') then raise exception 'Owner or admin required' using errcode='42501'; end if;
 if p_operation in ('createIdea','createTask','createProject','createVersion','publishKit','importPin','createExternalFile','createThread') and (coalesce(length(trim(p_input->>'title')),0) not between 1 and 240) then raise exception 'Title is required (1–240 characters)' using errcode='22023'; end if;
 if p_input->>'source_message_id' is not null and not exists(select 1 from public.workspace_messages where workspace_id=p_workspace and id=(p_input->>'source_message_id')::uuid) then raise exception 'Source message not in workspace' using errcode='22023'; end if;
 if p_input->>'lead_id' is not null and not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=(p_input->>'lead_id')::uuid) then raise exception 'Lead must belong to workspace' using errcode='22023'; end if;
 if p_input->>'assigned_to' is not null and not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=(p_input->>'assigned_to')::uuid) then raise exception 'Assignee must belong to workspace' using errcode='22023'; end if;
 if p_input->>'project_id' is not null and not exists(select 1 from public.studio_projects where workspace_id=p_workspace and id=(p_input->>'project_id')::uuid) then raise exception 'Project not found' using errcode='22023'; end if;
 if p_input->>'version_id' is not null and not exists(select 1 from public.studio_versions where workspace_id=p_workspace and id=(p_input->>'version_id')::uuid and (p_input->>'project_id' is null or project_id=(p_input->>'project_id')::uuid)) then raise exception 'Version does not belong to this project' using errcode='22023'; end if;
 if p_operation='createIdea' then
  if coalesce(p_input->>'status','exploring') not in ('exploring','shortlist') then raise exception 'Approval requires a recorded decision' using errcode='22023'; end if;
  insert into public.brand_ideas(workspace_id,author_id,title,body,category,status) values(p_workspace,actor,trim(p_input->>'title'),coalesce(p_input->>'body',''),coalesce(p_input->>'category','Brand'),coalesce(p_input->>'status','exploring')) returning to_jsonb(brand_ideas.*) into result;
 elsif p_operation in ('updateIdea','archiveIdea','restoreIdea') then
  if p_input ? 'status' and p_input->>'status' not in ('exploring','shortlist') then raise exception 'Approval requires a recorded decision' using errcode='22023'; end if;
  update public.brand_ideas set title=coalesce(p_input->>'title',title),body=coalesce(p_input->>'body',body),category=coalesce(p_input->>'category',category),status=coalesce(p_input->>'status',status),archived_at=case when p_operation='archiveIdea' then now() when p_operation='restoreIdea' then null else archived_at end,revision=revision+1,updated_at=now() where workspace_id=p_workspace and id=(p_input->>'id')::uuid and revision=(p_input->>'expected_revision')::integer returning to_jsonb(brand_ideas.*) into result;
 elsif p_operation='createTask' then
  insert into public.studio_tasks(workspace_id,created_by,title,details,category,status,assigned_to) values(p_workspace,actor,trim(p_input->>'title'),coalesce(p_input->>'details',''),coalesce(p_input->>'category','Brand'),coalesce(p_input->>'status','open'),(p_input->>'assigned_to')::uuid) returning to_jsonb(studio_tasks.*) into result;
 elsif p_operation='updateTask' then
  update public.studio_tasks set title=coalesce(p_input->>'title',title),details=coalesce(p_input->>'details',details),category=coalesce(p_input->>'category',category),status=coalesce(p_input->>'status',status),assigned_to=case when p_input ? 'assigned_to' then (p_input->>'assigned_to')::uuid else assigned_to end,revision=revision+1,updated_at=now() where workspace_id=p_workspace and id=(p_input->>'id')::uuid and revision=(p_input->>'expected_revision')::integer returning to_jsonb(studio_tasks.*) into result;
 elsif p_operation='createProject' then
  insert into public.studio_projects(workspace_id,title,brief,category,lead_id,created_by) values(p_workspace,trim(p_input->>'title'),coalesce(p_input->>'brief',''),coalesce(p_input->>'category','Brand'),(p_input->>'lead_id')::uuid,actor) returning to_jsonb(studio_projects.*) into result;
 elsif p_operation='updateProject' then
  if p_input->>'status' is not null and p_input->>'status' not in ('active','archived','complete') then raise exception 'Invalid project status' using errcode='22023'; end if;
  if p_input->>'kit_id' is not null and not exists(select 1 from public.studio_kits where workspace_id=p_workspace and id=(p_input->>'kit_id')::uuid) then raise exception 'Kit not in workspace' using errcode='22023'; end if;
  update public.studio_projects set title=coalesce(p_input->>'title',title),brief=coalesce(p_input->>'brief',brief),category=coalesce(p_input->>'category',category),status=coalesce(p_input->>'status',status),lead_id=case when p_input ? 'lead_id' then (p_input->>'lead_id')::uuid else lead_id end,kit_id=case when p_input ? 'kit_id' then (p_input->>'kit_id')::uuid else kit_id end,revision=revision+1 where workspace_id=p_workspace and id=(p_input->>'id')::uuid and revision=(p_input->>'expected_revision')::integer returning to_jsonb(studio_projects.*) into result;
 elsif p_operation='promoteIdea' then
  select to_jsonb(p.*) into result from public.studio_projects p where workspace_id=p_workspace and idea_id=(p_input->>'idea_id')::uuid;
  if result is null then
   insert into public.studio_projects(workspace_id,title,brief,category,idea_id,lead_id,created_by) select workspace_id,coalesce(p_input->>'title',title),coalesce(p_input->>'brief',p_input->>'objective',body),coalesce(p_input->>'category',category),id,(p_input->>'lead_id')::uuid,actor from public.brand_ideas where workspace_id=p_workspace and id=(p_input->>'idea_id')::uuid returning to_jsonb(studio_projects.*) into result;
  end if;
 elsif p_operation='createVersion' then
  if p_input->>'file_id' is not null then
   select url into version_image from public.workspace_files where workspace_id=p_workspace and id=(p_input->>'file_id')::uuid and permission_scope='workspace' and (url like 'supabase-storage://workspace-media/%' or url like 'blob://workspace-assets/%');
   if not found then raise exception 'Select an uploaded shared workspace image; external links cannot become owned concept versions' using errcode='22023'; end if;
  end if;
  if p_input->>'parent_id' is not null and not exists(select 1 from public.studio_versions where workspace_id=p_workspace and project_id=(p_input->>'project_id')::uuid and id=(p_input->>'parent_id')::uuid) then raise exception 'Parent version not in project' using errcode='22023'; end if;
  entity=gen_random_uuid();
  insert into public.studio_versions(id,workspace_id,project_id,title,body,file_id,image_url,source_url,media_verification,parent_id,provenance,created_by) values(entity,p_workspace,(p_input->>'project_id')::uuid,p_input->>'title',coalesce(p_input->>'body',''),(p_input->>'file_id')::uuid,case when version_image is not null then '/api/studio/media?versionId=' || entity::text end,version_image,case when version_image is not null then 'unverified_storage_source' else 'text_only' end,(p_input->>'parent_id')::uuid,coalesce(p_input->'provenance','{}'),actor) returning to_jsonb(studio_versions.*) into result;
 elsif p_operation='saveCanvas' then
  if p_input->>'file_id' is not null and not exists(select 1 from public.workspace_files where workspace_id=p_workspace and id=(p_input->>'file_id')::uuid and permission_scope='workspace') then raise exception 'Only shared workspace files can be linked to canvas' using errcode='22023'; end if;
  if p_input->>'reference_id' is not null and not exists(select 1 from public.saved_references where workspace_id=p_workspace and id=(p_input->>'reference_id')::uuid) then raise exception 'Reference not in workspace' using errcode='22023'; end if;
  if p_input->>'id' is null then
   if (p_input->>'expected_revision')::integer<>0 then raise exception 'CONFLICT: new node revision must be zero' using errcode='40001'; end if;
   insert into public.studio_canvas_nodes(workspace_id,project_id,version_id,reference_id,file_id,kind,body,x,y,width,height) values(p_workspace,(p_input->>'project_id')::uuid,(p_input->>'version_id')::uuid,(p_input->>'reference_id')::uuid,(p_input->>'file_id')::uuid,coalesce(p_input->>'kind','note'),coalesce(p_input->>'body',''),coalesce((p_input->>'x')::float,0),coalesce((p_input->>'y')::float,0),coalesce((p_input->>'width')::float,280),coalesce((p_input->>'height')::float,200)) returning to_jsonb(studio_canvas_nodes.*) into result;
  else
   update public.studio_canvas_nodes set body=coalesce(p_input->>'body',body),x=coalesce((p_input->>'x')::float,x),y=coalesce((p_input->>'y')::float,y),width=coalesce((p_input->>'width')::float,width),height=coalesce((p_input->>'height')::float,height),revision=revision+1 where workspace_id=p_workspace and project_id=(p_input->>'project_id')::uuid and id=(p_input->>'id')::uuid and revision=(p_input->>'expected_revision')::integer returning to_jsonb(studio_canvas_nodes.*) into result;
  end if;
 elsif p_operation='openReview' then
  select review_policy into default_policy from public.workspaces where id=p_workspace;
  select array_agg(distinct value::uuid) into reviewer_ids from jsonb_array_elements_text(p_input->'reviewers');
  if coalesce(cardinality(reviewer_ids),0)=0 then raise exception 'Assign at least one reviewer' using errcode='22023'; end if;
  foreach reviewer in array reviewer_ids loop
   if not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=reviewer) then raise exception 'Reviewer not in workspace' using errcode='22023'; end if;
  end loop;
  threshold_count=case when coalesce(p_input->>'policy',default_policy->>'policy','unanimous')='unanimous' then cardinality(reviewer_ids) else coalesce((p_input->>'threshold')::integer,(default_policy->>'threshold')::integer) end;
  if threshold_count is null or threshold_count<1 or threshold_count>cardinality(reviewer_ids) then raise exception 'Invalid approval threshold' using errcode='22023'; end if;
  insert into public.studio_review_rounds(workspace_id,project_id,version_id,scope,reviewers,policy,threshold,created_by) values(p_workspace,(p_input->>'project_id')::uuid,(p_input->>'version_id')::uuid,p_input->>'scope',reviewer_ids,coalesce(p_input->>'policy',default_policy->>'policy','unanimous'),threshold_count,actor) returning to_jsonb(studio_review_rounds.*) into result;
 elsif p_operation in ('submitReview','recordDecision') then
  select * into round_row from public.studio_review_rounds where workspace_id=p_workspace and id=(p_input->>'round_id')::uuid for update;
  if not found then raise exception 'Review round not found' using errcode='22023'; end if;
  if round_row.status<>'open' then raise exception 'CONFLICT: review round is closed' using errcode='40001'; end if;
  if p_operation='submitReview' then
   if p_input->>'disposition'='request_changes' and coalesce(length(trim(p_input->>'comment')),0)=0 then raise exception 'Explain the changes requested' using errcode='22023'; end if;
   if not exists(select 1 from public.studio_reviews where round_id=round_row.id and reviewer_id=actor) and coalesce((p_input->>'expected_revision')::integer,0)<>0 then raise exception 'CONFLICT: initial review revision must be zero' using errcode='40001'; end if;
   if not actor=any(round_row.reviewers) then raise exception 'You are not assigned to this round' using errcode='42501'; end if;
   insert into public.studio_reviews(workspace_id,round_id,reviewer_id,disposition,rating,comment) values(p_workspace,round_row.id,actor,p_input->>'disposition',(p_input->>'rating')::integer,coalesce(p_input->>'comment','')) on conflict(round_id,reviewer_id) do update set disposition=excluded.disposition,rating=excluded.rating,comment=excluded.comment,revision=studio_reviews.revision+1 where studio_reviews.revision=(p_input->>'expected_revision')::integer returning to_jsonb(studio_reviews.*) into result;
  else
   select count(*),count(*) filter(where disposition='approve'),count(*) filter(where disposition='request_changes') into responses,approvals,blocking from public.studio_reviews where round_id=round_row.id and reviewer_id=any(round_row.reviewers);
   if responses<>cardinality(round_row.reviewers) or blocking>0 or approvals<round_row.threshold then raise exception 'All reviewers must respond; changes must be resolved and the approval threshold met' using errcode='22023'; end if;
   insert into public.studio_decisions(workspace_id,round_id,project_id,version_id,scope,rationale,evidence,created_by) values(p_workspace,round_row.id,round_row.project_id,round_row.version_id,round_row.scope,coalesce(p_input->>'rationale',''),jsonb_build_object('round',to_jsonb(round_row),'reviews',(select jsonb_agg(to_jsonb(r.*)) from public.studio_reviews r where round_id=round_row.id)),actor) returning to_jsonb(studio_decisions.*) into result;
   update public.studio_review_rounds set status='closed',revision=revision+1 where id=round_row.id;
  end if;
 elsif p_operation='publishKit' then
  if coalesce(length(trim(p_input->>'usage_note')),0)=0 then raise exception 'A usage note is required' using errcode='22023'; end if;
  if not ((p_input->'components') ? 'wordmark' or (p_input->'components') ? 'monogram') then raise exception 'Kit requires an approved wordmark or monogram' using errcode='22023'; end if;
  if not ((p_input->'components') ? 'name' and (p_input->'components') ? 'palette') then raise exception 'Kit requires approved name and palette' using errcode='22023'; end if;
  for scope_name in select jsonb_object_keys(p_input->'components') loop
   decision_id=(p_input->'components'->>scope_name)::uuid;
   if decision_id is null or not exists(select 1 from public.studio_decisions where workspace_id=p_workspace and id=decision_id and scope=scope_name and outcome='approved') then raise exception 'Every included kit component needs a recorded approval: %',scope_name using errcode='22023'; end if;
  end loop;
  insert into public.studio_kits(workspace_id,title,components,usage_note,created_by) values(p_workspace,p_input->>'title',p_input->'components',p_input->>'usage_note',actor) returning to_jsonb(studio_kits.*) into result;
  update public.workspaces set active_kit_id=(result->>'id')::uuid,revision=revision+1 where id=p_workspace;
 elsif p_operation='importPin' then
  if coalesce(p_input->>'url','') !~ '^https://(www\.)?pinterest\.com/pin/[0-9]+/?([?#].*)?$' then raise exception 'Use an HTTPS pinterest.com/pin/numeric-ID link' using errcode='22023'; end if;
  canonical_url='https://www.pinterest.com/pin/' || substring(p_input->>'url' from '/pin/([0-9]+)') || '/';
  select to_jsonb(r.*) into result from public.saved_references r where workspace_id=p_workspace and url=canonical_url limit 1;
  if result is null then
   insert into public.saved_references(workspace_id,author_id,title,url,note,image_url,source) values(p_workspace,actor,p_input->>'title',canonical_url,coalesce(p_input->>'note',''),p_input->>'image_url','pinterest') returning to_jsonb(saved_references.*) into result;
  end if;
 elsif p_operation in ('archiveReference','restoreReference','updateReference') then
  update public.saved_references set title=coalesce(p_input->>'title',title),note=coalesce(p_input->>'note',note),tags=case when p_input ? 'tags' then array(select jsonb_array_elements_text(p_input->'tags')) else tags end,archived_at=case when p_operation='archiveReference' then now() when p_operation='restoreReference' then null else archived_at end,revision=revision+1 where workspace_id=p_workspace and id=(p_input->>'id')::uuid and revision=(p_input->>'expected_revision')::integer returning to_jsonb(saved_references.*) into result;
 elsif p_operation='createExternalFile' then
  if coalesce(p_input->>'url','') !~ '^https://' then raise exception 'An HTTPS file URL is required' using errcode='22023'; end if;
  insert into public.workspace_files(workspace_id,added_by,title,url,context_note,provider,tags,permission_scope) values(p_workspace,actor,p_input->>'title',p_input->>'url',coalesce(p_input->>'context_note',''),coalesce(p_input->>'provider','other'),array(select jsonb_array_elements_text(coalesce(p_input->'tags','[]'))),'workspace') returning to_jsonb(workspace_files.*) into result;
 elsif p_operation='updateFile' then
  update public.workspace_files set title=coalesce(p_input->>'title',title),context_note=coalesce(p_input->>'context_note',context_note),tags=case when p_input ? 'tags' then array(select jsonb_array_elements_text(p_input->'tags')) else tags end,revision=revision+1 where workspace_id=p_workspace and id=(p_input->>'id')::uuid and revision=(p_input->>'expected_revision')::integer and added_by=actor returning to_jsonb(workspace_files.*) into result;
 elsif p_operation='createThread' then
  if p_input->>'idea_id' is not null and not exists(select 1 from public.brand_ideas where workspace_id=p_workspace and id=(p_input->>'idea_id')::uuid) then raise exception 'Idea not in workspace' using errcode='22023'; end if;
  if p_input->>'task_id' is not null and not exists(select 1 from public.studio_tasks where workspace_id=p_workspace and id=(p_input->>'task_id')::uuid) then raise exception 'Task not in workspace' using errcode='22023'; end if;
  if num_nonnulls(p_input->>'idea_id',p_input->>'task_id')>1 then raise exception 'Choose idea or task context, not both' using errcode='22023'; end if;
  if p_input->>'project_id' is not null and p_input->>'task_id' is not null and not exists(select 1 from public.studio_tasks where workspace_id=p_workspace and id=(p_input->>'task_id')::uuid and project_id=(p_input->>'project_id')::uuid) then raise exception 'Task does not belong to project' using errcode='22023'; end if;
  if num_nonnulls(p_input->>'project_id',p_input->>'idea_id',p_input->>'task_id')>0 then
   select to_jsonb(t.*) into result from public.studio_threads t where workspace_id=p_workspace and project_id is not distinct from (p_input->>'project_id')::uuid and idea_id is not distinct from (p_input->>'idea_id')::uuid and task_id is not distinct from (p_input->>'task_id')::uuid limit 1;
  end if;
  if result is null then
   insert into public.studio_threads(workspace_id,title,project_id,idea_id,task_id,created_by) values(p_workspace,p_input->>'title',(p_input->>'project_id')::uuid,(p_input->>'idea_id')::uuid,(p_input->>'task_id')::uuid,actor) returning to_jsonb(studio_threads.*) into result;
  end if;
 elsif p_operation='sendMessage' then
  if coalesce(length(trim(p_input->>'body')),0) not between 1 and 4000 then raise exception 'Message must contain 1–4000 characters' using errcode='22023'; end if;
  if p_input->>'thread_id' is not null and not exists(select 1 from public.studio_threads where workspace_id=p_workspace and id=(p_input->>'thread_id')::uuid) then raise exception 'Thread not found' using errcode='22023'; end if;
  insert into public.workspace_messages(workspace_id,author_id,body,thread_id,client_request_id) values(p_workspace,actor,trim(p_input->>'body'),(p_input->>'thread_id')::uuid,p_request) returning to_jsonb(workspace_messages.*) into result;
 elsif p_operation='updateWorkspace' then
  if p_input ? 'name' and coalesce(length(trim(p_input->>'name')),0) not between 1 and 120 then raise exception 'Workspace name must contain 1–120 characters' using errcode='22023'; end if;
  if p_input ? 'timezone' and not exists(select 1 from pg_timezone_names where name=p_input->>'timezone') then raise exception 'Invalid timezone' using errcode='22023'; end if;
  update public.workspaces set name=coalesce(p_input->>'name',name),timezone=coalesce(p_input->>'timezone',timezone),revision=revision+1,updated_at=now() where id=p_workspace and revision=(p_input->>'expected_revision')::integer returning to_jsonb(workspaces.*) into result;
 elsif p_operation in ('updateMember','removeMember') then
  if member_role<>'owner' then raise exception 'Only an owner can manage membership' using errcode='42501'; end if;
  if not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=(p_input->>'user_id')::uuid) then raise exception 'Member not found' using errcode='22023'; end if;
  if p_input ? 'role' and p_input->>'role' not in ('owner','admin','editor') then raise exception 'Invalid member role' using errcode='22023'; end if;
  if exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=(p_input->>'user_id')::uuid and role='owner') and (p_operation='removeMember' or (p_input ? 'role' and p_input->>'role'<>'owner')) and (select count(*) from public.workspace_members where workspace_id=p_workspace and role='owner')<=1 then raise exception 'A workspace must retain at least one owner' using errcode='22023'; end if;
  if p_operation='removeMember' then
   delete from public.workspace_members where workspace_id=p_workspace and user_id=(p_input->>'user_id')::uuid returning to_jsonb(workspace_members.*) into result;
  else
   update public.workspace_members set role=coalesce(p_input->>'role',role),is_founder=case when p_input ? 'is_founder' then (p_input->>'is_founder')::boolean else is_founder end where workspace_id=p_workspace and user_id=(p_input->>'user_id')::uuid returning to_jsonb(workspace_members.*) into result;
  end if;
 elsif p_operation='revokeInvite' then
  if member_role not in ('owner','admin') then raise exception 'Owner or admin required' using errcode='42501'; end if;
  update public.workspace_invites set expires_at=now() where workspace_id=p_workspace and id=(p_input->>'id')::uuid returning jsonb_build_object('id',id,'expires_at',expires_at) into result;
 elsif p_operation='updateReviewPolicy' then
  if p_input->>'policy' not in ('unanimous','threshold') or p_input->>'policy' is null then raise exception 'Invalid review policy' using errcode='22023'; end if;
  if p_input->>'policy'='threshold' and coalesce((p_input->>'threshold')::integer,0)<1 then raise exception 'Invalid threshold' using errcode='22023'; end if;
  update public.workspaces set review_policy=jsonb_build_object('policy',p_input->>'policy','threshold',p_input->'threshold'),revision=revision+1,updated_at=now() where id=p_workspace and revision=(p_input->>'expected_revision')::integer returning to_jsonb(workspaces.*) into result;
 else raise exception 'Unknown operation' using errcode='22023';
 end if;
 if result is not null and p_operation='promoteIdea' then
  update public.brand_ideas set project_id=(result->>'id')::uuid where workspace_id=p_workspace and id=(p_input->>'idea_id')::uuid and project_id is distinct from (result->>'id')::uuid;
 end if;
 if result is not null and p_operation in ('createIdea','updateIdea') and p_input ? 'tags' then
  update public.brand_ideas set tags=array(select jsonb_array_elements_text(p_input->'tags')) where id=(result->>'id')::uuid returning to_jsonb(brand_ideas.*) into result;
 end if;
 if result is not null and p_operation in ('createTask','updateTask') then
  if p_input ? 'checklist' and jsonb_typeof(p_input->'checklist')<>'array' then raise exception 'Checklist must be an array' using errcode='22023'; end if;
  update public.studio_tasks set source_message_id=case when p_input ? 'source_message_id' then (p_input->>'source_message_id')::uuid else source_message_id end,due_date=case when p_input ? 'due_date' then (p_input->>'due_date')::date else due_date end,priority=coalesce(p_input->>'priority',priority),checklist=coalesce(p_input->'checklist',checklist),blocked_reason=case when p_input ? 'blocked_reason' then p_input->>'blocked_reason' else blocked_reason end,project_id=case when p_input ? 'project_id' then (p_input->>'project_id')::uuid else project_id end where id=(result->>'id')::uuid returning to_jsonb(studio_tasks.*) into result;
 end if;
 if result is null then raise exception 'CONFLICT: record missing or revision changed' using errcode='40001'; end if;
 entity=(result->>'id')::uuid;
 insert into public.studio_activity(workspace_id,actor_id,operation,entity_id,payload) values(p_workspace,actor,p_operation,entity,case when p_operation='submitReview' then result else '{}'::jsonb end);
 insert into public.studio_requests(workspace_id,actor_id,operation,request_id,input,result) values(p_workspace,actor,p_operation,p_request,p_input,result);
 return result;
end $$;
revoke all on function studio_private.mutate(uuid,text,uuid,jsonb) from public,anon;
grant execute on function studio_private.mutate(uuid,text,uuid,jsonb) to authenticated;
create or replace function public.studio_mutate(p_workspace uuid,p_operation text,p_request uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path=pg_catalog as $$ select studio_private.mutate(p_workspace,p_operation,p_request,p_input) $$;
revoke all on function public.studio_mutate(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.studio_mutate(uuid,text,uuid,jsonb) to authenticated;
commit;
