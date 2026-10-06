-- REVIEW ONLY: additive foundation, no remote application authorized by this artifact.
-- Requires verified existing studio_projects, studio_tasks, workspace_files and membership schema.
begin;
-- Defense in depth at kit persistence: Business approvals never enter creative components.
-- Existing creative scopes remain unchanged; valid existing kits are unaffected.
do $$ begin
 if not exists(select 1 from pg_constraint where conname='studio_kits_creative_components_only' and conrelid='public.studio_kits'::regclass) then
  alter table public.studio_kits add constraint studio_kits_creative_components_only check(jsonb_typeof(components)='object' and components-array['name','wordmark','monogram','palette','typography','guidelines','concept']='{}'::jsonb);
 end if;
end $$;
create schema if not exists studio_business_private;
revoke all on schema studio_business_private from public, anon;
grant usage on schema studio_business_private to authenticated;

create table if not exists public.studio_business_plans (
 id uuid primary key, workspace_id uuid not null references public.workspaces(id),
 kind text not null default 'draft' check(kind in ('idea','draft','plan')),
 notes text not null default '' check(length(notes)<=20000), objective text not null default '' check(length(objective)<=4000),
 target_date date, category text not null default '' check(length(category)<=100), tags text[] not null default '{}' check(cardinality(tags)<=20),
 state text not null default 'draft' check(state in ('draft','in_review','approved','archived')),
 revision integer not null default 0 check(revision>=0), approved_version_id uuid,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,id), foreign key(workspace_id,id) references public.studio_projects(workspace_id,id)
);
create table if not exists public.studio_business_swot (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, plan_id uuid not null,
 quadrant text not null check(quadrant in ('strength','weakness','opportunity','threat')), body text not null check(length(trim(body)) between 1 and 4000),
 evidence text not null default '' check(length(evidence)<=2000), owner_id uuid references auth.users(id), task_id uuid,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 foreign key(workspace_id,plan_id) references public.studio_business_plans(workspace_id,id),
 foreign key(workspace_id,task_id) references public.studio_tasks(workspace_id,id), unique(workspace_id,plan_id,id)
);
create table if not exists public.studio_business_task_links (
 workspace_id uuid not null, plan_id uuid not null, task_id uuid not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 primary key(plan_id,task_id), foreign key(workspace_id,plan_id) references public.studio_business_plans(workspace_id,id), foreign key(workspace_id,task_id) references public.studio_tasks(workspace_id,id)
);
create table if not exists public.studio_business_project_links (
 workspace_id uuid not null, plan_id uuid not null, project_id uuid not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 primary key(plan_id,project_id), check(plan_id<>project_id), foreign key(workspace_id,plan_id) references public.studio_business_plans(workspace_id,id), foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id)
);
create table if not exists public.studio_business_documents (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, plan_id uuid not null, file_id uuid, url text, title text not null check(length(trim(title)) between 1 and 240), notes text not null default '' check(length(notes)<=2000),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unlinked_at timestamptz,
 check(num_nonnulls(file_id,url)=1), check(url is null or (length(url)<=3000 and url ~ '^https://[^/@:[:space:]]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$')),
 foreign key(workspace_id,plan_id) references public.studio_business_plans(workspace_id,id), foreign key(workspace_id,file_id) references public.workspace_files(workspace_id,id)
);
create unique index if not exists business_document_file_unique on public.studio_business_documents(plan_id,file_id) where file_id is not null;
create unique index if not exists business_document_url_unique on public.studio_business_documents(plan_id,url) where url is not null;
create table if not exists public.studio_business_versions (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, plan_id uuid not null, ordinal integer not null check(ordinal>0), plan_revision integer not null,
 body jsonb not null check(jsonb_typeof(body)='object'), reviewers uuid[] not null check(cardinality(reviewers) between 1 and 50), policy text not null check(policy='all_reviewers'), supersedes_version_id uuid,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(workspace_id,id), unique(plan_id,ordinal), unique(workspace_id,plan_id,id),
 foreign key(workspace_id,plan_id) references public.studio_business_plans(workspace_id,id), foreign key(workspace_id,plan_id,supersedes_version_id) references public.studio_business_versions(workspace_id,plan_id,id)
);
create table if not exists public.studio_business_reviews (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, plan_id uuid not null, version_id uuid not null unique,
 status text not null default 'open' check(status in ('open','approved','changes_requested','withdrawn')), revision integer not null default 0, decided_at timestamptz, created_at timestamptz not null default now(),
 foreign key(workspace_id,plan_id,version_id) references public.studio_business_versions(workspace_id,plan_id,id)
);
create unique index if not exists business_one_open_review on public.studio_business_reviews(plan_id) where status='open';
create table if not exists public.studio_business_decisions (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, plan_id uuid not null, version_id uuid not null, reviewer_id uuid not null references auth.users(id),
 disposition text not null check(disposition in ('approve','request_changes')), rationale text not null default '' check(length(rationale)<=4000), created_at timestamptz not null default now(),
 check(disposition<>'request_changes' or length(trim(rationale))>0), unique(version_id,reviewer_id), foreign key(workspace_id,plan_id,version_id) references public.studio_business_versions(workspace_id,plan_id,id)
);
do $$ begin
 if not exists(select 1 from pg_constraint where conname='business_final_version_same_plan') then alter table public.studio_business_plans add constraint business_final_version_same_plan foreign key(workspace_id,id,approved_version_id) references public.studio_business_versions(workspace_id,plan_id,id); end if;
end $$;
create table if not exists studio_business_private.requests (
 workspace_id uuid not null references public.workspaces(id), actor_id uuid not null references auth.users(id), request_id uuid not null, operation text not null, input jsonb not null, result jsonb not null, created_at timestamptz not null default now(), primary key(workspace_id,actor_id,request_id)
);
alter table studio_business_private.requests enable row level security;
revoke all on studio_business_private.requests from public, anon, authenticated;
-- Client writes are forbidden, including direct UPDATE, so no incomplete UPDATE policies exist.
-- A narrowly scoped private mutator enforces membership, same-workspace links, revisions and identity.
do $$ declare t text; begin
 foreach t in array array['studio_business_plans','studio_business_swot','studio_business_task_links','studio_business_project_links','studio_business_documents','studio_business_versions','studio_business_reviews','studio_business_decisions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('drop policy if exists business_member_read on public.%I',t);
  execute format('create policy business_member_read on public.%I for select to authenticated using(exists(select 1 from public.workspace_members m where m.workspace_id=%I.workspace_id and m.user_id=(select auth.uid())))',t,t);
  execute format('create index if not exists %I on public.%I(workspace_id,created_at desc)',t||'_workspace_idx',t);
 end loop;
end $$;
-- Ordinary plans may reference only workspace-visible files. A later permission change hides the link too.
drop policy if exists business_document_visibility on public.studio_business_documents;
create policy business_document_visibility on public.studio_business_documents as restrictive for select to authenticated using(file_id is null or exists(select 1 from public.workspace_files f where f.id=studio_business_documents.file_id and f.workspace_id=studio_business_documents.workspace_id and f.permission_scope='workspace'));
create index if not exists business_plan_list_idx on public.studio_business_plans(workspace_id,updated_at desc,id);
create index if not exists business_document_plan_idx on public.studio_business_documents(workspace_id,plan_id);
create index if not exists business_decision_plan_idx on public.studio_business_decisions(workspace_id,plan_id,created_at);
create index if not exists business_swot_plan_idx on public.studio_business_swot(workspace_id,plan_id);
create index if not exists business_swot_task_idx on public.studio_business_swot(workspace_id,task_id);
create index if not exists business_task_reverse_idx on public.studio_business_task_links(workspace_id,task_id);
create index if not exists business_project_reverse_idx on public.studio_business_project_links(workspace_id,project_id);
create index if not exists business_document_file_idx on public.studio_business_documents(workspace_id,file_id);
create index if not exists business_review_plan_idx on public.studio_business_reviews(workspace_id,plan_id);
create index if not exists business_decision_version_idx on public.studio_business_decisions(workspace_id,version_id);
create index if not exists business_version_plan_idx on public.studio_business_versions(workspace_id,plan_id,ordinal desc);

create or replace function studio_business_private.immutable_snapshot() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$ begin raise exception 'Business snapshots and decisions are immutable' using errcode='42501'; end $$;
revoke all on function studio_business_private.immutable_snapshot() from public,anon,authenticated;
drop trigger if exists business_version_immutable on public.studio_business_versions;
create trigger business_version_immutable before update or delete on public.studio_business_versions for each row execute function studio_business_private.immutable_snapshot();
drop trigger if exists business_decision_immutable on public.studio_business_decisions;
create trigger business_decision_immutable before update or delete on public.studio_business_decisions for each row execute function studio_business_private.immutable_snapshot();
-- Legacy project edits must invalidate review, while immutable approved snapshots stay unchanged.
create or replace function studio_business_private.project_changed() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if exists(select 1 from public.studio_business_plans where id=old.id) and (auth.uid() is null or not exists(select 1 from public.workspace_members where workspace_id=old.workspace_id and user_id=auth.uid())) then raise exception 'Business project access denied' using errcode='42501'; end if;
 if new.workspace_id is distinct from old.workspace_id or new.created_by is distinct from old.created_by then
  if exists(select 1 from public.studio_business_plans where id=old.id) then raise exception 'Business project identity is immutable' using errcode='42501'; end if;
 end if;
 if (new.title,new.brief,new.lead_id) is distinct from (old.title,old.brief,old.lead_id) then
  update public.studio_business_plans set revision=revision+1, state=case when state='archived' then state else 'draft' end,updated_at=now() where id=new.id;
  update public.studio_business_reviews set status='withdrawn',revision=revision+1,decided_at=now() where plan_id=new.id and status='open';
 end if;
 return new;
end $$;
revoke all on function studio_business_private.project_changed() from public,anon,authenticated;
drop trigger if exists business_project_revision on public.studio_projects;
create trigger business_project_revision after update on public.studio_projects for each row execute function studio_business_private.project_changed();

create or replace function public.studio_business_capabilities(p_workspace uuid) returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $$
begin
 if auth.uid() is null or not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=auth.uid()) then raise exception 'Access denied' using errcode='42501'; end if;
 return jsonb_build_object('schemaVersion',1,'foundation',true,'restrictedOperations',false,'documentUploads',false,'social',false);
end $$;
revoke all on function public.studio_business_capabilities(uuid) from public,anon;
grant execute on function public.studio_business_capabilities(uuid) to authenticated;

create or replace function studio_business_private.mutate(p_workspace uuid,p_operation text,p_request uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
 actor uuid:=auth.uid(); plan public.studio_business_plans; project public.studio_projects; entry public.studio_business_swot; snapshot public.studio_business_versions; review public.studio_business_reviews; cached studio_business_private.requests;
 pid uuid; target uuid; chosen_owner uuid; new_id uuid; reviewers uuid[]; result jsonb; payload jsonb; k text; allowed text[]; is_edit boolean:=true;
begin
 if actor is null or not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=actor) then raise exception 'Access denied' using errcode='42501'; end if;
 if p_request is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>60000 then raise exception 'Invalid request' using errcode='22023'; end if;
 if p_operation not in ('createPlan','updatePlan','developPlan','archivePlan','upsertSwot','removeSwot','createSwotTask','linkTask','unlinkTask','linkProject','unlinkProject','linkDocument','unlinkDocument','submitPlan','decidePlan') then raise exception 'Unknown business operation' using errcode='22023'; end if;
 allowed:=case p_operation
 when 'createPlan' then array['title','brief','kind','notes','objective','owner_id','target_date','category','tags']
 when 'updatePlan' then array['plan_id','expected_revision','title','brief','notes','objective','owner_id','target_date','category','tags']
 when 'upsertSwot' then array['plan_id','expected_revision','id','quadrant','body','evidence','owner_id']
 when 'removeSwot' then array['plan_id','expected_revision','id']
 when 'createSwotTask' then array['plan_id','expected_revision','id','title','due_date','priority']
 when 'linkTask' then array['plan_id','expected_revision','task_id'] when 'unlinkTask' then array['plan_id','expected_revision','task_id']
 when 'linkProject' then array['plan_id','expected_revision','project_id'] when 'unlinkProject' then array['plan_id','expected_revision','project_id']
 when 'linkDocument' then array['plan_id','expected_revision','file_id','url','title','notes'] when 'unlinkDocument' then array['plan_id','expected_revision','id']
 when 'submitPlan' then array['plan_id','expected_revision','reviewers','policy','supersedes_version_id']
 when 'decidePlan' then array['plan_id','version_id','expected_review_revision','disposition','rationale']
 else array['plan_id','expected_revision'] end;
 for k in select jsonb_object_keys(p_input) loop if not k=any(allowed) then raise exception 'Unsupported input field: %',k using errcode='22023'; end if; end loop;
 -- Serialize retries, then recheck membership before ever returning saved data.
 perform pg_advisory_xact_lock(hashtextextended(p_workspace::text||actor::text||p_request::text,0));
 if not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=actor) then raise exception 'Access denied' using errcode='42501'; end if;
 select * into cached from studio_business_private.requests where workspace_id=p_workspace and actor_id=actor and request_id=p_request;
 if found then
  if cached.operation<>p_operation or cached.input<>p_input then raise exception 'CONFLICT: request ID was used for different input' using errcode='40001'; end if;
  return cached.result;
 end if;
 if p_operation<>'createPlan' then
  pid:=(p_input->>'plan_id')::uuid;
  -- Keep project -> plan lock order, including legacy project trigger, to avoid inverted locks.
  select * into project from public.studio_projects where workspace_id=p_workspace and id=pid for update;
  if not found then raise exception 'Plan unavailable' using errcode='42501'; end if;
  select * into plan from public.studio_business_plans where workspace_id=p_workspace and id=pid for update;
  if not found then raise exception 'Plan unavailable' using errcode='42501'; end if;
  if p_operation<>'decidePlan' and (p_input->>'expected_revision')::integer is distinct from plan.revision then raise exception 'CONFLICT: plan changed' using errcode='40001'; end if;
  if plan.state='archived' and p_operation<>'archivePlan' then raise exception 'Archived plans cannot be changed' using errcode='22023'; end if;
 end if;
 if p_input ? 'owner_id' then
  chosen_owner:=(p_input->>'owner_id')::uuid;
  if chosen_owner is not null and not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=chosen_owner) then raise exception 'Owner must be a current workspace member' using errcode='22023'; end if;
 end if;
 if p_input ? 'title' and (jsonb_typeof(p_input->'title')<>'string' or length(trim(p_input->>'title')) not between 1 and 240) then raise exception 'Title must be 1 to 240 characters' using errcode='22023'; end if;
 if p_input ? 'brief' and length(p_input->>'brief')>4000 then raise exception 'Brief is too long' using errcode='22023'; end if;
 if p_input ? 'tags' and (jsonb_typeof(p_input->'tags')<>'array' or jsonb_array_length(p_input->'tags')>20) then raise exception 'Use at most 20 tags' using errcode='22023'; end if;
 if p_input ? 'tags' and exists(select 1 from jsonb_array_elements(p_input->'tags') x where jsonb_typeof(x)<>'string' or length(x#>>'{}')>60) then raise exception 'Invalid tag' using errcode='22023'; end if;
 case p_operation
 when 'createPlan' then
  if not p_input ? 'title' then raise exception 'Title is required' using errcode='22023'; end if;
  insert into public.studio_projects(workspace_id,title,brief,category,lead_id,created_by) values(p_workspace,trim(p_input->>'title'),coalesce(p_input->>'brief',''),'Business',chosen_owner,actor) returning * into project;
  pid:=project.id;
  insert into public.studio_business_plans(id,workspace_id,kind,notes,objective,target_date,category,tags,created_by)
  values(pid,p_workspace,coalesce(p_input->>'kind','draft'),coalesce(p_input->>'notes',''),coalesce(p_input->>'objective',''),(p_input->>'target_date')::date,coalesce(p_input->>'category',''),coalesce(array(select jsonb_array_elements_text(p_input->'tags')),'{}'),actor);
  is_edit:=false;
 when 'updatePlan' then
  update public.studio_projects set title=case when p_input?'title' then trim(p_input->>'title') else title end, brief=case when p_input?'brief' then coalesce(p_input->>'brief','') else brief end, lead_id=case when p_input?'owner_id' then chosen_owner else lead_id end, revision=revision+1 where id=pid;
  update public.studio_business_plans set notes=case when p_input?'notes' then coalesce(p_input->>'notes','') else notes end, objective=case when p_input?'objective' then coalesce(p_input->>'objective','') else objective end,target_date=case when p_input?'target_date' then (p_input->>'target_date')::date else target_date end,category=case when p_input?'category' then coalesce(p_input->>'category','') else category end,tags=case when p_input?'tags' then array(select jsonb_array_elements_text(p_input->'tags')) else tags end where id=pid;
 when 'developPlan' then
  if plan.kind='plan' then is_edit:=false; else update public.studio_business_plans set kind='plan' where id=pid; end if;
 when 'archivePlan' then update public.studio_business_plans set state='archived' where id=pid;
 when 'upsertSwot' then
  target:=(p_input->>'id')::uuid;
  if target is null then insert into public.studio_business_swot(workspace_id,plan_id,quadrant,body,evidence,owner_id,created_by) values(p_workspace,pid,p_input->>'quadrant',p_input->>'body',coalesce(p_input->>'evidence',''),chosen_owner,actor) returning id into new_id;
  else
   update public.studio_business_swot set quadrant=p_input->>'quadrant',body=p_input->>'body',evidence=coalesce(p_input->>'evidence',''),owner_id=chosen_owner where id=target and workspace_id=p_workspace and plan_id=pid returning id into new_id;
   if not found then raise exception 'SWOT entry unavailable' using errcode='42501'; end if;
  end if;
 when 'removeSwot' then
  delete from public.studio_business_swot where id=(p_input->>'id')::uuid and workspace_id=p_workspace and plan_id=pid returning id into new_id;
  if not found then raise exception 'SWOT entry unavailable' using errcode='42501'; end if;
  -- Removing an entry never deletes its canonical task or its plan task link.
 when 'createSwotTask' then
  select * into entry from public.studio_business_swot where id=(p_input->>'id')::uuid and workspace_id=p_workspace and plan_id=pid for update;
  if not found then raise exception 'SWOT entry unavailable' using errcode='42501'; end if;
  if entry.task_id is not null then new_id:=entry.task_id; is_edit:=false;
  else
   if entry.owner_id is not null and not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=entry.owner_id) then raise exception 'Reassign SWOT entry to a current member first' using errcode='22023'; end if;
   insert into public.studio_tasks(workspace_id,created_by,title,details,category,assigned_to,project_id,due_date,priority) values(p_workspace,actor,coalesce(nullif(trim(p_input->>'title'),''),left(entry.body,240)),left(entry.body,2000),'Business',entry.owner_id,pid,(p_input->>'due_date')::date,coalesce(p_input->>'priority','normal')) returning id into new_id;
   update public.studio_business_swot set task_id=new_id where id=entry.id;
   insert into public.studio_business_task_links(workspace_id,plan_id,task_id,created_by) values(p_workspace,pid,new_id,actor) on conflict do nothing;
  end if;
 when 'linkTask' then
  target:=(p_input->>'task_id')::uuid;
  if not exists(select 1 from public.studio_tasks where workspace_id=p_workspace and id=target) then raise exception 'Task unavailable' using errcode='42501'; end if;
  insert into public.studio_business_task_links(workspace_id,plan_id,task_id,created_by) values(p_workspace,pid,target,actor) on conflict do nothing;
  is_edit:=found;
 when 'unlinkTask' then
  target:=(p_input->>'task_id')::uuid;
  if exists(select 1 from public.studio_business_swot where plan_id=pid and task_id=target) then raise exception 'This task is linked to a SWOT response; remove the SWOT entry first' using errcode='22023'; end if;
  delete from public.studio_business_task_links where workspace_id=p_workspace and plan_id=pid and task_id=target;
  is_edit:=found;
 when 'linkProject' then
  target:=(p_input->>'project_id')::uuid;
  if target=pid or not exists(select 1 from public.studio_projects where workspace_id=p_workspace and id=target) then raise exception 'Creative project unavailable' using errcode='42501'; end if;
  insert into public.studio_business_project_links(workspace_id,plan_id,project_id,created_by) values(p_workspace,pid,target,actor) on conflict do nothing;
  is_edit:=found;
 when 'unlinkProject' then
  delete from public.studio_business_project_links where workspace_id=p_workspace and plan_id=pid and project_id=(p_input->>'project_id')::uuid;
  is_edit:=found;
 when 'linkDocument' then
  target:=(p_input->>'file_id')::uuid;
  if num_nonnulls(target,p_input->>'url')<>1 then raise exception 'Choose a workspace file or an HTTPS link' using errcode='22023'; end if;
  if target is not null then
   if not exists(select 1 from public.workspace_files where workspace_id=p_workspace and id=target and permission_scope='workspace') then raise exception 'Only workspace-visible files may be linked' using errcode='42501'; end if;
   insert into public.studio_business_documents(workspace_id,plan_id,file_id,title,notes,created_by) select p_workspace,pid,target,left(title,240),coalesce(p_input->>'notes',''),actor from public.workspace_files where id=target on conflict(plan_id,file_id) where file_id is not null do update set unlinked_at=null,notes=excluded.notes,title=excluded.title returning id into new_id;
  else
   if not p_input?'title' then raise exception 'Document title is required' using errcode='22023'; end if;
   insert into public.studio_business_documents(workspace_id,plan_id,url,title,notes,created_by) values(p_workspace,pid,p_input->>'url',trim(p_input->>'title'),coalesce(p_input->>'notes',''),actor) on conflict(plan_id,url) where url is not null do update set unlinked_at=null,notes=excluded.notes,title=excluded.title returning id into new_id;
  end if;
 when 'unlinkDocument' then
  update public.studio_business_documents set unlinked_at=now() where workspace_id=p_workspace and plan_id=pid and id=(p_input->>'id')::uuid and unlinked_at is null;
  is_edit:=found;
 when 'submitPlan' then
  if plan.kind<>'plan' then raise exception 'Develop this draft into a plan before review' using errcode='22023'; end if;
  if plan.state='in_review' then raise exception 'CONFLICT: a review is already open' using errcode='40001'; end if;
  if coalesce(p_input->>'policy','')<>'all_reviewers' or jsonb_typeof(p_input->'reviewers') is distinct from 'array' then raise exception 'Select the all-reviewers policy and named reviewers' using errcode='22023'; end if;
  reviewers:=array(select distinct jsonb_array_elements_text(p_input->'reviewers')::uuid);
  if cardinality(reviewers) not between 1 and 50 or exists(select 1 from unnest(reviewers) r where not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=r)) then raise exception 'Reviewers must be current workspace members' using errcode='22023'; end if;
  if (p_input->>'supersedes_version_id')::uuid is distinct from plan.approved_version_id then raise exception 'Explicitly select the current final version to supersede' using errcode='40001'; end if;
  if project.lead_id is not null and not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=project.lead_id) then raise exception 'Reassign this plan to a current member first' using errcode='22023'; end if;
  payload:=jsonb_build_object('title',project.title,'brief',project.brief,'notes',plan.notes,'objective',plan.objective,'owner_id',project.lead_id,'target_date',plan.target_date,'category',plan.category,'tags',plan.tags,
   'swot',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'quadrant',s.quadrant,'body',s.body,'evidence',s.evidence,'owner_id',s.owner_id,'task_id',s.task_id) order by s.created_at,s.id) from public.studio_business_swot s where s.plan_id=pid),'[]'::jsonb),
   'document_ids',coalesce((select jsonb_agg(d.id order by d.id) from public.studio_business_documents d where d.plan_id=pid and d.unlinked_at is null and (d.file_id is null or exists(select 1 from public.workspace_files f where f.id=d.file_id and f.permission_scope='workspace'))),'[]'::jsonb),
   'document_references',coalesce((select jsonb_agg(case when d.file_id is not null then jsonb_build_object('id',d.id,'file_id',d.file_id) else jsonb_build_object('id',d.id,'title',d.title,'url',d.url) end order by d.id) from public.studio_business_documents d where d.plan_id=pid and d.unlinked_at is null and (d.file_id is null or exists(select 1 from public.workspace_files f where f.id=d.file_id and f.permission_scope='workspace'))),'[]'::jsonb),
   'task_ids',coalesce((select jsonb_agg(task_id order by task_id) from public.studio_business_task_links where plan_id=pid),'[]'::jsonb),
   'project_ids',coalesce((select jsonb_agg(project_id order by project_id) from public.studio_business_project_links where plan_id=pid),'[]'::jsonb));
  insert into public.studio_business_versions(workspace_id,plan_id,ordinal,plan_revision,body,reviewers,policy,supersedes_version_id,created_by) values(p_workspace,pid,coalesce((select max(ordinal) from public.studio_business_versions where plan_id=pid),0)+1,plan.revision,payload,reviewers,'all_reviewers',plan.approved_version_id,actor) returning id into new_id;
  insert into public.studio_business_reviews(workspace_id,plan_id,version_id) values(p_workspace,pid,new_id);
  update public.studio_business_plans set state='in_review',revision=revision+1,updated_at=now() where id=pid;
  is_edit:=false;
 when 'decidePlan' then
  select * into snapshot from public.studio_business_versions where workspace_id=p_workspace and plan_id=pid and id=(p_input->>'version_id')::uuid;
  if not found or not actor=any(snapshot.reviewers) then raise exception 'You are not a reviewer for this version' using errcode='42501'; end if;
  select * into review from public.studio_business_reviews where workspace_id=p_workspace and version_id=snapshot.id for update;
  if review.status<>'open' or plan.state<>'in_review' or (p_input->>'expected_review_revision')::integer is distinct from review.revision then raise exception 'CONFLICT: this review changed or closed' using errcode='40001'; end if;
  if exists(select 1 from unnest(snapshot.reviewers) r where not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=r)) then raise exception 'A reviewer left this workspace; edit and open a fresh review' using errcode='22023'; end if;
  insert into public.studio_business_decisions(workspace_id,plan_id,version_id,reviewer_id,disposition,rationale) values(p_workspace,pid,snapshot.id,actor,p_input->>'disposition',coalesce(p_input->>'rationale','')) returning id into new_id;
  update public.studio_business_reviews set revision=revision+1 where id=review.id;
  if p_input->>'disposition'='request_changes' then
   update public.studio_business_reviews set status='changes_requested',decided_at=now() where id=review.id;
   update public.studio_business_plans set state='draft',revision=revision+1,updated_at=now() where id=pid;
  elsif not exists(select 1 from unnest(snapshot.reviewers) r where not exists(select 1 from public.studio_business_decisions d where d.version_id=snapshot.id and d.reviewer_id=r and d.disposition='approve')) then
   if snapshot.supersedes_version_id is distinct from plan.approved_version_id then raise exception 'CONFLICT: final version changed' using errcode='40001'; end if;
   update public.studio_business_reviews set status='approved',decided_at=now() where id=review.id;
   update public.studio_business_plans set state='approved',approved_version_id=snapshot.id,revision=revision+1,updated_at=now() where id=pid;
  end if;
  is_edit:=false;
 end case;
 if is_edit then
  update public.studio_business_plans set revision=greatest(revision,plan.revision+1),state=case when state='archived' then state else 'draft' end,updated_at=now() where id=pid;
  update public.studio_business_reviews set status='withdrawn',revision=revision+1,decided_at=now() where plan_id=pid and status='open';
 end if;
 select studio_business_private.plan_json(p,j) into result from public.studio_business_plans p join public.studio_projects j on j.id=p.id where p.id=pid;
 result:=jsonb_build_object('plan',result,'entityId',new_id);
 -- No business inputs/results are copied into broadly exposed studio_requests/activity.
 insert into studio_business_private.requests(workspace_id,actor_id,request_id,operation,input,result) values(p_workspace,actor,p_request,p_operation,p_input,result);
 return result;
end $$;
revoke all on function studio_business_private.mutate(uuid,text,uuid,jsonb) from public,anon;
grant execute on function studio_business_private.mutate(uuid,text,uuid,jsonb) to authenticated;
create or replace function public.studio_business_mutate(p_workspace uuid,p_operation text,p_request uuid,p_input jsonb) returns jsonb language sql security invoker set search_path=pg_catalog as $$ select studio_business_private.mutate(p_workspace,p_operation,p_request,p_input) $$;
revoke all on function public.studio_business_mutate(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.studio_business_mutate(uuid,text,uuid,jsonb) to authenticated;
-- Included in the single additive Business migration; no live application.
create or replace function studio_business_private.plan_json(p public.studio_business_plans,j public.studio_projects) returns jsonb language sql immutable security invoker set search_path=pg_catalog as $$
select jsonb_build_object('id',p.id,'workspace_id',p.workspace_id,'kind',p.kind,'notes',p.notes,'objective',p.objective,'target_date',p.target_date,'category',p.category,'tags',p.tags,'state',p.state,'revision',p.revision,'approved_version_id',p.approved_version_id,'created_by',p.created_by,'created_at',p.created_at,'updated_at',p.updated_at,'title',j.title,'brief',j.brief,'lead_id',j.lead_id)
$$;
revoke all on function studio_business_private.plan_json(public.studio_business_plans,public.studio_projects) from public,anon;
grant execute on function studio_business_private.plan_json(public.studio_business_plans,public.studio_projects) to authenticated;
create or replace function public.studio_business_read(p_workspace uuid,p_plan uuid default null,p_page integer default 0,p_view text default 'all',p_options text default null,p_query text default '') returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $$
declare result jsonb; plan_json jsonb; counts jsonb; members jsonb; total integer;
begin
 if auth.uid() is null or not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=auth.uid()) then raise exception 'Access denied' using errcode='42501'; end if;
 if p_page<0 or p_page>100000 or p_view not in ('all','finals','ideas') or length(p_query)>160 then raise exception 'Invalid list options' using errcode='22023'; end if;
 if p_options is not null then
  if p_options='tasks' then
   select coalesce(jsonb_agg(x),'[]'::jsonb) into result from (select id,title from public.studio_tasks where workspace_id=p_workspace and (p_query='' or strpos(lower(title),lower(p_query))>0 or id::text=p_query) order by title,id limit 50 offset p_page*50) x;
  elsif p_options='projects' then
   select coalesce(jsonb_agg(x),'[]'::jsonb) into result from (select id,title from public.studio_projects where workspace_id=p_workspace and (p_query='' or strpos(lower(title),lower(p_query))>0 or id::text=p_query) order by title,id limit 50 offset p_page*50) x;
  elsif p_options='files' then
   select coalesce(jsonb_agg(x),'[]'::jsonb) into result from (select id,title from public.workspace_files where workspace_id=p_workspace and permission_scope='workspace' and (p_query='' or strpos(lower(title),lower(p_query))>0 or id::text=p_query) order by title,id limit 50 offset p_page*50) x;
  else raise exception 'Unknown link options' using errcode='22023'; end if;
  return jsonb_build_object('schemaVersion',1,'options',result,'page',p_page,'pageSize',50,'hasMore',jsonb_array_length(result)=50);
 end if;
 if p_plan is not null then
  select studio_business_private.plan_json(p,j) into plan_json from public.studio_business_plans p join public.studio_projects j on j.workspace_id=p.workspace_id and j.id=p.id where p.workspace_id=p_workspace and p.id=p_plan;
  if plan_json is null then raise exception 'Plan unavailable' using errcode='42501'; end if;
  return jsonb_build_object('schemaVersion',1,'plan',plan_json,
   'swot',coalesce((select jsonb_agg(jsonb_build_object('id',id,'plan_id',plan_id,'quadrant',quadrant,'body',body,'evidence',evidence,'owner_id',owner_id,'task_id',task_id,'created_at',created_at) order by created_at,id) from public.studio_business_swot where workspace_id=p_workspace and plan_id=p_plan),'[]'::jsonb),
   'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'details',t.details,'status',t.status,'assigned_to',t.assigned_to,'due_date',t.due_date,'priority',t.priority,'blocked_reason',t.blocked_reason,'revision',t.revision,'project_id',t.project_id) order by t.created_at,t.id) from public.studio_tasks t join public.studio_business_task_links l on l.workspace_id=t.workspace_id and l.task_id=t.id where l.workspace_id=p_workspace and l.plan_id=p_plan),'[]'::jsonb),
   'documents',coalesce((select jsonb_agg(jsonb_build_object('id',id,'plan_id',plan_id,'file_id',file_id,'title',title,'url',url,'notes',notes,'created_by',created_by,'created_at',created_at) order by created_at,id) from public.studio_business_documents where workspace_id=p_workspace and plan_id=p_plan and unlinked_at is null),'[]'::jsonb),
   'projects',coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'title',j.title) order by j.title,j.id) from public.studio_projects j join public.studio_business_project_links l on l.workspace_id=j.workspace_id and l.project_id=j.id where l.workspace_id=p_workspace and l.plan_id=p_plan),'[]'::jsonb),
   'versions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'plan_id',plan_id,'ordinal',ordinal,'plan_revision',plan_revision,'body',body,'reviewers',reviewers,'policy',policy,'supersedes_version_id',supersedes_version_id,'created_by',created_by,'created_at',created_at) order by ordinal desc) from public.studio_business_versions where workspace_id=p_workspace and plan_id=p_plan),'[]'::jsonb),
   'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',id,'plan_id',plan_id,'version_id',version_id,'status',status,'revision',revision,'decided_at',decided_at,'created_at',created_at) order by created_at desc,id) from public.studio_business_reviews where workspace_id=p_workspace and plan_id=p_plan),'[]'::jsonb),
   'decisions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'version_id',version_id,'reviewer_id',reviewer_id,'disposition',disposition,'rationale',rationale,'created_at',created_at) order by created_at,id) from public.studio_business_decisions where workspace_id=p_workspace and plan_id=p_plan),'[]'::jsonb));
 end if;
 select count(*) into total from public.studio_business_plans where workspace_id=p_workspace and (p_view='all' or (p_view='finals' and approved_version_id is not null) or (p_view='ideas' and kind in ('idea','draft')));
 select coalesce(jsonb_agg(x.body order by x.updated_at desc,x.id),'[]'::jsonb) into result from (select studio_business_private.plan_json(p,j) body,p.updated_at,p.id from public.studio_business_plans p join public.studio_projects j on j.workspace_id=p.workspace_id and j.id=p.id where p.workspace_id=p_workspace and (p_view='all' or (p_view='finals' and p.approved_version_id is not null) or (p_view='ideas' and p.kind in ('idea','draft'))) order by p.updated_at desc,p.id limit 50 offset p_page*50) x;
 -- Complete authorized aggregates, never derived from a truncated workspace payload.
 select jsonb_build_object('active',count(*) filter(where state<>'archived'),'ideas',count(*) filter(where kind in ('idea','draft') and state<>'archived'),'awaitingReview',count(*) filter(where state='in_review'),'finals',count(*) filter(where approved_version_id is not null),'overdue',count(*) filter(where target_date<current_date and state<>'archived')) into counts from public.studio_business_plans where workspace_id=p_workspace;
 counts:=counts||jsonb_build_object('blockedTasks',(select count(distinct t.id) from public.studio_tasks t join public.studio_business_task_links l on l.workspace_id=t.workspace_id and l.task_id=t.id join public.studio_business_plans p on p.id=l.plan_id where l.workspace_id=p_workspace and p.state<>'archived' and t.status<>'done' and length(trim(coalesce(t.blocked_reason,'')))>0),'overdueTasks',(select count(distinct t.id) from public.studio_tasks t join public.studio_business_task_links l on l.workspace_id=t.workspace_id and l.task_id=t.id join public.studio_business_plans p on p.id=l.plan_id where l.workspace_id=p_workspace and p.state<>'archived' and t.status<>'done' and t.due_date<current_date));
 select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',coalesce(p.display_name,'')) order by p.display_name,m.user_id),'[]'::jsonb) into members from public.workspace_members m left join public.profiles p on p.id=m.user_id where m.workspace_id=p_workspace;
 return jsonb_build_object('schemaVersion',1,'plans',result,'total',total,'page',p_page,'pageSize',50,'overview',counts,'members',members,'userId',auth.uid());
end $$;
revoke all on function public.studio_business_read(uuid,uuid,integer,text,text,text) from public,anon;
grant execute on function public.studio_business_read(uuid,uuid,integer,text,text,text) to authenticated;

commit;
