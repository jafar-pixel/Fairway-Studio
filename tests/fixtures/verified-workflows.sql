-- Additive workflow draft. Requires reviewed pending-schema.sql. No remote application.
begin;
create table if not exists public.studio_idea_assets (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 idea_id uuid not null, file_id uuid, version_id uuid, reference_id uuid,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 check(num_nonnulls(file_id,version_id,reference_id)=1),
 foreign key(workspace_id,idea_id) references public.brand_ideas(workspace_id,id),
 foreign key(workspace_id,file_id) references public.workspace_files(workspace_id,id),
 foreign key(workspace_id,version_id) references public.studio_versions(workspace_id,id),
 foreign key(workspace_id,reference_id) references public.saved_references(workspace_id,id),
 unique nulls not distinct(workspace_id,idea_id,file_id,version_id,reference_id)
);
create table if not exists public.studio_idea_projects (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 idea_id uuid not null, project_id uuid not null,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 foreign key(workspace_id,idea_id) references public.brand_ideas(workspace_id,id),
 foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id),
 unique(workspace_id,idea_id,project_id)
);
create table if not exists public.studio_notification_preferences (
 workspace_id uuid not null references public.workspaces(id), user_id uuid not null references auth.users(id),
 events jsonb not null default '{"mentions":true,"assignments":true,"reviews":true,"decisions":true,"generations":true,"sessions":true}',
 revision integer not null default 1 check(revision>0), updated_at timestamptz not null default now(),
 primary key(workspace_id,user_id), check(jsonb_typeof(events)='object')
);
-- Pending intentions do not change the old decision. Only a new approved decision completes a link.
create table if not exists public.studio_decision_supersessions (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 prior_decision_id uuid not null, round_id uuid not null unique, replacement_decision_id uuid unique,
 rationale text not null check(length(trim(rationale)) between 1 and 4000),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), completed_at timestamptz,
 foreign key(workspace_id,prior_decision_id) references public.studio_decisions(workspace_id,id),
 foreign key(workspace_id,round_id) references public.studio_review_rounds(workspace_id,id),
 foreign key(workspace_id,replacement_decision_id) references public.studio_decisions(workspace_id,id),
 check((replacement_decision_id is null)=(completed_at is null)), check(prior_decision_id<>replacement_decision_id)
);
create unique index if not exists studio_one_completed_supersession on public.studio_decision_supersessions(prior_decision_id) where replacement_decision_id is not null;

-- All writes go through the authenticated, narrowly validated transaction below.
do $$ declare t text; begin
 foreach t in array array['studio_idea_assets','studio_idea_projects','studio_notification_preferences','studio_decision_supersessions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create index if not exists %I on public.%I(workspace_id)',t||'_workspace_idx',t);
  execute format('drop policy if exists studio_workflow_read on public.%I',t);
  execute format('create policy studio_workflow_read on public.%I for select to authenticated using(exists(select 1 from public.workspace_members m where m.workspace_id=%I.workspace_id and m.user_id=(select auth.uid())))',t,t);
 end loop;
end $$;
drop policy if exists studio_preferences_own on public.studio_notification_preferences;
create policy studio_preferences_own on public.studio_notification_preferences as restrictive for select to authenticated using(user_id=(select auth.uid()));
-- Linking a restricted asset never broadens its visibility, including version-backed files.
drop policy if exists studio_asset_visibility on public.studio_idea_assets;
create policy studio_asset_visibility on public.studio_idea_assets as restrictive for select to authenticated using (
 (file_id is null or exists(select 1 from public.workspace_files f where f.workspace_id=studio_idea_assets.workspace_id and f.id=studio_idea_assets.file_id and (f.permission_scope='workspace' or f.added_by=(select auth.uid()))))
 and (version_id is null or exists(select 1 from public.studio_versions v where v.workspace_id=studio_idea_assets.workspace_id and v.id=studio_idea_assets.version_id and (v.file_id is null or exists(select 1 from public.workspace_files f where f.workspace_id=v.workspace_id and f.id=v.file_id and (f.permission_scope='workspace' or f.added_by=(select auth.uid()))))))
);

create or replace function studio_private.complete_supersession() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare s public.studio_decision_supersessions; r public.studio_review_rounds; prior public.studio_decisions; responses integer; approvals integer; blocking integer;
begin
 select * into s from public.studio_decision_supersessions where workspace_id=new.workspace_id and round_id=new.round_id for update;
 if not found or new.outcome<>'approved' then return new; end if;
 select * into r from public.studio_review_rounds where workspace_id=new.workspace_id and id=new.round_id;
 select * into prior from public.studio_decisions where workspace_id=new.workspace_id and id=s.prior_decision_id;
 if new.project_id<>prior.project_id or new.scope<>prior.scope or new.version_id<>r.version_id or r.status<>'open' then raise exception 'Invalid superseding decision' using errcode='22023'; end if;
 select count(*),count(*) filter(where disposition='approve'),count(*) filter(where disposition='request_changes') into responses,approvals,blocking from public.studio_reviews where round_id=r.id and reviewer_id=any(r.reviewers);
 if responses<>cardinality(r.reviewers) or blocking>0 or approvals<r.threshold then raise exception 'Supersession requires policy-satisfied approval' using errcode='22023'; end if;
 update public.studio_decision_supersessions set replacement_decision_id=new.id,completed_at=now() where id=s.id;
 return new;
end $$;
revoke all on function studio_private.complete_supersession() from public,anon,authenticated;
drop trigger if exists studio_complete_supersession on public.studio_decisions;
create trigger studio_complete_supersession after insert on public.studio_decisions for each row execute function studio_private.complete_supersession();

create or replace function studio_private.workflow(p_workspace uuid,p_operation text,p_request uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid=auth.uid(); member_role text; old_request public.studio_requests; result jsonb; linked jsonb;
 idea public.brand_ideas; r public.studio_review_rounds; prior public.studio_decisions; new_round jsonb;
 target_file uuid; target_version uuid; target_reference uuid; responses integer; blocking integer; old_revision integer; events jsonb;
begin
 if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_request is null or p_input is null or jsonb_typeof(p_input)<>'object' or length(p_input::text)>16000 then raise exception 'Invalid request' using errcode='22023'; end if;
 if p_input ?| array['actor_id','author_id','created_by','user_id','reviewer_id','workspace_id'] then raise exception 'Identity is server assigned' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace::text,0));
 select role into member_role from public.workspace_members where workspace_id=p_workspace and user_id=actor for share;
 if member_role is null then raise exception 'Workspace access denied' using errcode='42501'; end if;
 select * into old_request from public.studio_requests where workspace_id=p_workspace and actor_id=actor and operation='workflow:'||p_operation and request_id=p_request;
 if found then
  if old_request.input<>p_input then raise exception 'CONFLICT: request ID reused with different input' using errcode='40001'; end if;
  return old_request.result;
 end if;
 if p_operation in ('rejectDecision','deferDecision','supersedeDecision') and member_role<>'owner' then raise exception 'Owner required' using errcode='42501'; end if;
 if p_operation<>'supersedeDecision' and (p_input->>'expected_revision' is null or (p_input->>'expected_revision')::integer<0) then raise exception 'Expected revision required' using errcode='22023'; end if;
 if p_operation in ('linkIdeaAsset','unlinkIdeaAsset','linkIdeaProject','unlinkIdeaProject') then
  select * into idea from public.brand_ideas where workspace_id=p_workspace and id=(p_input->>'idea_id')::uuid for update;
  if not found then raise exception 'Idea not found' using errcode='22023'; end if;
  if idea.revision<>(p_input->>'expected_revision')::integer then raise exception 'CONFLICT: idea changed' using errcode='40001'; end if;
  if p_operation='linkIdeaAsset' then
   target_file=(p_input->>'file_id')::uuid; target_version=(p_input->>'version_id')::uuid; target_reference=(p_input->>'reference_id')::uuid;
   if num_nonnulls(target_file,target_version,target_reference)<>1 then raise exception 'Choose exactly one canonical asset' using errcode='22023'; end if;
   if target_file is not null and not exists(select 1 from public.workspace_files where workspace_id=p_workspace and id=target_file and (permission_scope='workspace' or added_by=actor)) then raise exception 'File unavailable' using errcode='42501'; end if;
   if target_version is not null and not exists(select 1 from public.studio_versions v where v.workspace_id=p_workspace and v.id=target_version and (v.file_id is null or exists(select 1 from public.workspace_files f where f.workspace_id=p_workspace and f.id=v.file_id and (f.permission_scope='workspace' or f.added_by=actor)))) then raise exception 'Version unavailable' using errcode='42501'; end if;
   if target_reference is not null and not exists(select 1 from public.saved_references where workspace_id=p_workspace and id=target_reference) then raise exception 'Pin unavailable' using errcode='22023'; end if;
   insert into public.studio_idea_assets(workspace_id,idea_id,file_id,version_id,reference_id,created_by) values(p_workspace,idea.id,target_file,target_version,target_reference,actor) on conflict do nothing returning to_jsonb(studio_idea_assets.*) into linked;
   if linked is null then select to_jsonb(a.*) into linked from public.studio_idea_assets a where workspace_id=p_workspace and idea_id=idea.id and file_id is not distinct from target_file and version_id is not distinct from target_version and reference_id is not distinct from target_reference; end if;
  elsif p_operation='unlinkIdeaAsset' then
   -- A hidden restricted relation cannot be deleted by guessing its ID.
   delete from public.studio_idea_assets a where a.workspace_id=p_workspace and a.idea_id=idea.id and a.id=(p_input->>'id')::uuid
    and (a.file_id is null or exists(select 1 from public.workspace_files f where f.workspace_id=p_workspace and f.id=a.file_id and (f.permission_scope='workspace' or f.added_by=actor)))
    and (a.version_id is null or exists(select 1 from public.studio_versions v where v.workspace_id=p_workspace and v.id=a.version_id and (v.file_id is null or exists(select 1 from public.workspace_files f where f.workspace_id=p_workspace and f.id=v.file_id and (f.permission_scope='workspace' or f.added_by=actor)))))
    returning to_jsonb(a.*) into linked;
   if linked is null then raise exception 'Asset link unavailable' using errcode='42501'; end if;
  elsif p_operation='linkIdeaProject' then
   if not exists(select 1 from public.studio_projects where workspace_id=p_workspace and id=(p_input->>'project_id')::uuid) then raise exception 'Project not found' using errcode='22023'; end if;
   insert into public.studio_idea_projects(workspace_id,idea_id,project_id,created_by) values(p_workspace,idea.id,(p_input->>'project_id')::uuid,actor) on conflict do nothing returning to_jsonb(studio_idea_projects.*) into linked;
   if linked is null then select to_jsonb(l.*) into linked from public.studio_idea_projects l where workspace_id=p_workspace and idea_id=idea.id and project_id=(p_input->>'project_id')::uuid; end if;
  else
   delete from public.studio_idea_projects where workspace_id=p_workspace and idea_id=idea.id and id=(p_input->>'id')::uuid returning to_jsonb(studio_idea_projects.*) into linked;
   if linked is null then raise exception 'Project link not found' using errcode='22023'; end if;
  end if;
  update public.brand_ideas set revision=revision+1,updated_at=now() where workspace_id=p_workspace and id=idea.id returning revision into old_revision;
  result=jsonb_build_object('link',linked,'idea_revision',old_revision);
 elsif p_operation in ('rejectDecision','deferDecision') then
  if coalesce(length(trim(p_input->>'rationale')),0) not between 1 and 4000 then raise exception 'Explicit owner rationale required (1–4000 characters)' using errcode='22023'; end if;
  select * into r from public.studio_review_rounds where workspace_id=p_workspace and id=(p_input->>'round_id')::uuid for update;
  if not found then raise exception 'Round not found' using errcode='22023'; end if;
  if r.status<>'open' or r.revision<>(p_input->>'expected_revision')::integer then raise exception 'CONFLICT: round changed or closed' using errcode='40001'; end if;
  if p_operation='rejectDecision' then
   select count(*),count(*) filter(where disposition='request_changes') into responses,blocking from public.studio_reviews where round_id=r.id and reviewer_id=any(r.reviewers);
   if responses<>cardinality(r.reviewers) or blocking=0 then raise exception 'Rejection requires all responses and at least one request for changes' using errcode='22023'; end if;
  end if;
  insert into public.studio_decisions(workspace_id,round_id,project_id,version_id,scope,rationale,outcome,evidence,created_by) values(p_workspace,r.id,r.project_id,r.version_id,r.scope,trim(p_input->>'rationale'),case when p_operation='rejectDecision' then 'rejected' else 'deferred' end,jsonb_build_object('round',to_jsonb(r),'reviews',coalesce((select jsonb_agg(to_jsonb(rv.*)) from public.studio_reviews rv where round_id=r.id),'[]'::jsonb)),actor) returning to_jsonb(studio_decisions.*) into result;
  update public.studio_review_rounds set status='closed',revision=revision+1 where id=r.id;
 elsif p_operation='supersedeDecision' then
  if coalesce(length(trim(p_input->>'rationale')),0) not between 1 and 4000 then raise exception 'Explain the proposed replacement' using errcode='22023'; end if;
  select * into prior from public.studio_decisions where workspace_id=p_workspace and id=(p_input->>'decision_id')::uuid;
  if not found then raise exception 'Prior decision not found' using errcode='22023'; end if;
  if exists(select 1 from public.studio_decision_supersessions s join public.studio_review_rounds rr on rr.id=s.round_id where s.prior_decision_id=prior.id and (s.replacement_decision_id is not null or rr.status='open')) then raise exception 'CONFLICT: replacement already active or recorded' using errcode='40001'; end if;
  -- Reuse the established policy/membership validation and frozen round constructor, without editing it.
  new_round=studio_private.mutate(p_workspace,'openReview',gen_random_uuid(),jsonb_strip_nulls(jsonb_build_object('project_id',prior.project_id,'version_id',p_input->>'version_id','scope',prior.scope,'reviewers',p_input->'reviewers','policy',p_input->>'policy','threshold',p_input->'threshold')));
  insert into public.studio_decision_supersessions(workspace_id,prior_decision_id,round_id,rationale,created_by) values(p_workspace,prior.id,(new_round->>'id')::uuid,trim(p_input->>'rationale'),actor) returning jsonb_build_object('supersession',to_jsonb(studio_decision_supersessions.*),'round',new_round) into result;
 elsif p_operation='updateNotificationPreferences' then
  events=p_input->'events';
  if events is null or jsonb_typeof(events)<>'object' or exists(select 1 from jsonb_each(events) kv where kv.key not in ('mentions','assignments','reviews','decisions','generations','sessions') or jsonb_typeof(kv.value)<>'boolean') then raise exception 'Invalid event preferences' using errcode='22023'; end if;
  select revision into old_revision from public.studio_notification_preferences where workspace_id=p_workspace and user_id=actor for update;
  if coalesce(old_revision,0)<>(p_input->>'expected_revision')::integer then raise exception 'CONFLICT: preferences changed' using errcode='40001'; end if;
  insert into public.studio_notification_preferences(workspace_id,user_id,events) values(p_workspace,actor,'{"mentions":true,"assignments":true,"reviews":true,"decisions":true,"generations":true,"sessions":true}'::jsonb||events)
   on conflict(workspace_id,user_id) do update set events=studio_notification_preferences.events||(p_input->'events'),revision=studio_notification_preferences.revision+1,updated_at=now() returning to_jsonb(studio_notification_preferences.*) into result;
 else raise exception 'Unknown workflow operation' using errcode='22023';
 end if;
 insert into public.studio_requests(workspace_id,actor_id,operation,request_id,input,result) values(p_workspace,actor,'workflow:'||p_operation,p_request,p_input,result);
 -- Preferences are private and are deliberately omitted from shared activity.
 if p_operation<>'updateNotificationPreferences' then insert into public.studio_activity(workspace_id,actor_id,operation,entity_id,payload) values(p_workspace,actor,p_operation,coalesce(idea.id,r.id,prior.id),jsonb_build_object('request_id',p_request)); end if;
 return result;
end $$;
revoke all on function studio_private.workflow(uuid,text,uuid,jsonb) from public,anon;
grant execute on function studio_private.workflow(uuid,text,uuid,jsonb) to authenticated;
create or replace function public.studio_workflow(p_workspace uuid,p_operation text,p_request uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path=pg_catalog as $$ select studio_private.workflow(p_workspace,p_operation,p_request,p_input) $$;
revoke all on function public.studio_workflow(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.studio_workflow(uuid,text,uuid,jsonb) to authenticated;
commit;
