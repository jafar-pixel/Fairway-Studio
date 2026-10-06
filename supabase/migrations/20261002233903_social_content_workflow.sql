-- REVIEW ONLY. Additive social workflow; no live application, posting, credential or scheduler.
-- Canonical schema inspected read-only 2026-10-02/03. Requires reviewed creator/media and creative workflow baseline.
-- Effective approvals exclude completed studio_decision_supersessions; pending intentions preserve prior approval.
begin;
create schema if not exists studio_social_private;
revoke all on schema studio_social_private from public,anon;
grant usage on schema studio_social_private to authenticated;
create table if not exists public.studio_social_posts (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
 title text not null check(length(trim(title)) between 1 and 200),purpose text not null default '' check(length(purpose)<=2000),audience text not null default '' check(length(audience)<=1000),
 channel text not null check(channel in ('instagram','tiktok','linkedin','youtube','pinterest','other')),account_label text not null check(length(trim(account_label)) between 1 and 160),
 caption text not null default '' check(length(caption)<=10000),format text not null default 'post' check(format in ('post','story','reel','video')),
 owner_id uuid not null references auth.users(id),reply_owner_id uuid references auth.users(id),idea_id uuid,project_id uuid,source_version_id uuid,
 planned_at timestamptz,timezone text not null default 'Etc/UTC',embargo_until timestamptz,release_note text not null default '' check(length(release_note)<=2000),
 assets jsonb not null default '[]' check(jsonb_typeof(assets)='array' and jsonb_array_length(assets)<=20),
 state text not null default 'idea' check(state in ('idea','draft','in_review','approved','posted','archived')),
 revision integer not null default 0 check(revision>=0),approved_snapshot_id uuid,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(workspace_id,id),foreign key(workspace_id,idea_id) references public.brand_ideas(workspace_id,id),foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id),foreign key(workspace_id,source_version_id) references public.studio_versions(workspace_id,id),check(embargo_until is null or planned_at is null or planned_at>=embargo_until)
);
create table if not exists public.studio_social_snapshots (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,post_id uuid not null,ordinal integer not null check(ordinal>0),draft_revision integer not null,
 payload jsonb not null,reviewers uuid[] not null check(cardinality(reviewers) between 1 and 30),policy text not null default 'all_reviewers' check(policy='all_reviewers'),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),unique(workspace_id,id),unique(workspace_id,post_id,id),unique(post_id,ordinal),foreign key(workspace_id,post_id) references public.studio_social_posts(workspace_id,id)
);
create table if not exists public.studio_social_reviews (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,post_id uuid not null,snapshot_id uuid not null unique,
 state text not null default 'open' check(state in ('open','approved','changes_requested','withdrawn')),revision integer not null default 0,decided_at timestamptz,created_at timestamptz not null default now(),
 foreign key(workspace_id,post_id,snapshot_id) references public.studio_social_snapshots(workspace_id,post_id,id)
);
create unique index if not exists social_one_open_review on public.studio_social_reviews(post_id) where state='open';
create table if not exists public.studio_social_decisions (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,post_id uuid not null,snapshot_id uuid not null,reviewer_id uuid not null references auth.users(id),
 disposition text not null check(disposition in ('approve','request_changes')),note text not null default '' check(length(note)<=2000),created_at timestamptz not null default now(),
 check(disposition<>'request_changes' or length(trim(note))>0),unique(snapshot_id,reviewer_id),foreign key(workspace_id,post_id,snapshot_id) references public.studio_social_snapshots(workspace_id,post_id,id)
);
create table if not exists public.studio_social_publications (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,post_id uuid not null,snapshot_id uuid not null,url text not null,posted_at timestamptz not null,
 verification text not null default 'manually_recorded' check(verification='manually_recorded'),recorded_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(workspace_id,post_id,id),unique(snapshot_id,url),foreign key(workspace_id,post_id,snapshot_id) references public.studio_social_snapshots(workspace_id,post_id,id)
);
create table if not exists public.studio_social_feedback (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,post_id uuid not null,publication_id uuid not null,
 observation text not null check(length(trim(observation)) between 1 and 4000),observed_at timestamptz not null,source_url text,metrics jsonb not null default '{}' check(jsonb_typeof(metrics)='object'),metrics_captured_at timestamptz,
 owner_id uuid not null references auth.users(id),task_id uuid,revision integer not null default 0,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(workspace_id,post_id,publication_id) references public.studio_social_publications(workspace_id,post_id,id),foreign key(workspace_id,task_id) references public.studio_tasks(workspace_id,id)
);
do $$ begin if not exists(select 1 from pg_constraint where conname='social_approved_snapshot_same_post') then alter table public.studio_social_posts add constraint social_approved_snapshot_same_post foreign key(workspace_id,id,approved_snapshot_id) references public.studio_social_snapshots(workspace_id,post_id,id); end if; end $$;
create table if not exists studio_social_private.requests (workspace_id uuid not null,actor_id uuid not null,request_id uuid not null,operation text not null,input jsonb not null,post_id uuid not null,result jsonb not null,created_at timestamptz not null default now(),primary key(workspace_id,actor_id,request_id));
alter table studio_social_private.requests enable row level security;
revoke all on studio_social_private.requests from public,anon,authenticated;
-- This narrow lookup deliberately avoids recursive RLS and returns only an access boolean.
-- Even the file owner cannot move restricted files into this workspace-visible domain.
create or replace function studio_social_private.refs_visible(w uuid,a jsonb,source uuid default null) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and exists(select 1 from public.workspace_members m where m.workspace_id=w and m.user_id=auth.uid())
 and (source is null or exists(select 1 from public.studio_versions v join public.studio_projects p on p.id=v.project_id and p.workspace_id=w where v.id=source and v.workspace_id=w and p.category<>'Business' and (v.file_id is null or exists(select 1 from public.workspace_files f where f.id=v.file_id and f.workspace_id=w and f.permission_scope='workspace'))))
 and not exists(select 1 from jsonb_array_elements(a) x where not exists(select 1 from public.studio_versions v join public.workspace_files f on f.id=v.file_id and f.workspace_id=v.workspace_id join public.studio_projects p on p.id=v.project_id and p.workspace_id=w where v.id=(x->>'version_id')::uuid and v.workspace_id=w and p.category<>'Business' and f.permission_scope='workspace' and (not (x ? 'source_fingerprint') or md5(coalesce(v.source_url,''))=x->>'source_fingerprint')))
$$;
revoke all on function studio_social_private.refs_visible(uuid,jsonb,uuid) from public,anon;
grant execute on function studio_social_private.refs_visible(uuid,jsonb,uuid) to authenticated;
create or replace function studio_social_private.post_visible(w uuid,p uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$ select exists(select 1 from public.studio_social_posts s where s.id=p and s.workspace_id=w and studio_social_private.refs_visible(w,s.assets,s.source_version_id)) $$;
revoke all on function studio_social_private.post_visible(uuid,uuid) from public,anon;
grant execute on function studio_social_private.post_visible(uuid,uuid) to authenticated;
create or replace function studio_social_private.snapshot_visible(w uuid,s uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$ select exists(select 1 from public.studio_social_snapshots v where v.workspace_id=w and v.id=s and studio_social_private.post_visible(w,v.post_id) and studio_social_private.refs_visible(w,v.payload->'assets',nullif(v.payload->>'source_version_id','')::uuid)) $$;
revoke all on function studio_social_private.snapshot_visible(uuid,uuid) from public,anon;
grant execute on function studio_social_private.snapshot_visible(uuid,uuid) to authenticated;
do $$ declare t text; begin foreach t in array array['studio_social_posts','studio_social_snapshots','studio_social_reviews','studio_social_decisions','studio_social_publications','studio_social_feedback'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);
 execute format('drop policy if exists social_read on public.%I',t);
 if t='studio_social_posts' then execute 'create policy social_read on public.studio_social_posts for select to authenticated using(studio_social_private.refs_visible(workspace_id,assets,source_version_id))';
 elsif t='studio_social_snapshots' then execute 'create policy social_read on public.studio_social_snapshots for select to authenticated using(studio_social_private.snapshot_visible(workspace_id,id))';
 elsif t='studio_social_feedback' then execute 'create policy social_read on public.studio_social_feedback for select to authenticated using(studio_social_private.post_visible(workspace_id,post_id) and exists(select 1 from public.studio_social_publications p where p.id=publication_id and p.workspace_id=studio_social_feedback.workspace_id))';
 else execute format('create policy social_read on public.%I for select to authenticated using(studio_social_private.snapshot_visible(workspace_id,snapshot_id))',t);end if;
 execute format('create index if not exists %I on public.%I(workspace_id,created_at desc)',t||'_workspace_idx',t);
 end loop;end $$;
create index if not exists social_calendar_idx on public.studio_social_posts(workspace_id,planned_at,id);
create index if not exists social_snapshot_post_idx on public.studio_social_snapshots(workspace_id,post_id,ordinal desc);
create index if not exists social_review_post_idx on public.studio_social_reviews(workspace_id,post_id);
create index if not exists social_feedback_post_idx on public.studio_social_feedback(workspace_id,post_id);
create or replace function studio_social_private.immutable() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$ begin raise exception 'Social snapshots, decisions and publication facts are immutable' using errcode='42501';end $$;
revoke all on function studio_social_private.immutable() from public,anon,authenticated;
do $$ declare t text;begin foreach t in array array['studio_social_snapshots','studio_social_decisions','studio_social_publications'] loop execute format('drop trigger if exists social_immutable on public.%I',t);execute format('create trigger social_immutable before update or delete on public.%I for each row execute function studio_social_private.immutable()',t);end loop;end $$;
create or replace function studio_social_private.https(u text) returns boolean language sql immutable security invoker set search_path=pg_catalog as $$ select u is not null and length(u)<=3000 and u ~ '^https://[^/@:[:space:]]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' $$;
revoke all on function studio_social_private.https(text) from public,anon,authenticated;
-- One current-eligibility predicate for choices, submission, human approval and export.
-- Legacy supersession leaves prior outcome='approved'; only a completed replacement retires it.
-- Rejected/deferred replacement rounds do not retire the prior approved decision.
create or replace function studio_social_private.creative_eligible(w uuid,v uuid) returns boolean language sql stable security invoker set search_path=pg_catalog as $$
 select auth.uid() is not null
 and exists(select 1 from public.workspace_members m where m.workspace_id=w and m.user_id=auth.uid())
 and exists(select 1 from public.studio_decisions d where d.workspace_id=w and d.version_id=v and d.outcome='approved'
  and d.scope in ('name','wordmark','monogram','palette','typography','guidelines','concept')
  and not exists(select 1 from public.studio_decision_supersessions ss where ss.workspace_id=w and ss.prior_decision_id=d.id and ss.replacement_decision_id is not null));
$$;
revoke all on function studio_social_private.creative_eligible(uuid,uuid) from public,anon;
grant execute on function studio_social_private.creative_eligible(uuid,uuid) to authenticated;
create or replace function public.studio_social_capabilities(p_workspace uuid) returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $$ begin
 if auth.uid() is null or not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=auth.uid()) then raise exception 'Access denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion',1,'manualPackages',true,'automaticPosting',false,'metricsSync',false);end $$;
revoke all on function public.studio_social_capabilities(uuid) from public,anon;grant execute on function public.studio_social_capabilities(uuid) to authenticated;

create or replace function studio_social_private.mutate(w uuid,op text,req uuid,i jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid();p public.studio_social_posts;s public.studio_social_snapshots;r public.studio_social_reviews;cached studio_social_private.requests;f public.studio_social_feedback;pub public.studio_social_publications;
 pid uuid;sid uuid;fid uuid;tid uuid;rev integer;allowed text[];k text;a jsonb;v public.studio_versions;reviewers uuid[];payload jsonb;result jsonb;metric jsonb;src uuid;
begin
 if actor is null or not exists(select 1 from public.workspace_members where workspace_id=w and user_id=actor) then raise exception 'Access denied' using errcode='42501';end if;
 if req is null or jsonb_typeof(i) is distinct from 'object' or octet_length(i::text)>60000 then raise exception 'Invalid request' using errcode='22023';end if;
 allowed:=case op
 when 'saveDraft' then array['post_id','expected_revision','title','purpose','audience','channel','account_label','caption','format','owner_id','reply_owner_id','idea_id','project_id','source_version_id','planned_at','timezone','embargo_until','release_note','assets','stage']
 when 'submitReview' then array['post_id','expected_revision','reviewers'] when 'decideReview' then array['post_id','snapshot_id','expected_review_revision','disposition','note']
 when 'recordPublication' then array['post_id','expected_revision','snapshot_id','url','posted_at'] when 'saveFeedback' then array['post_id','expected_revision','feedback_id','publication_id','observation','observed_at','source_url','metrics','metrics_captured_at','owner_id']
 when 'createFeedbackTask' then array['post_id','expected_revision','feedback_id','title','due_date'] when 'archiveDraft' then array['post_id','expected_revision'] else null end;
 if allowed is null then raise exception 'Unsupported social operation' using errcode='22023';end if;
 for k in select jsonb_object_keys(i) loop if not k=any(allowed) then raise exception 'Unsupported input field' using errcode='22023';end if;end loop;
 perform pg_advisory_xact_lock(hashtextextended(w::text||actor::text||req::text,0));
 select * into cached from studio_social_private.requests where workspace_id=w and actor_id=actor and request_id=req;
 if found then
  if not studio_social_private.post_visible(w,cached.post_id) then raise exception 'Access denied' using errcode='42501';end if;
  if cached.operation<>op or cached.input<>i then raise exception 'CONFLICT: request ID changed' using errcode='40001';end if;
  -- Only canonical IDs/revision are cached; no stale captions, confidential input or asset URLs escape.
  return cached.result;
 end if;
 pid:=(i->>'post_id')::uuid;
 if pid is not null then
  select * into p from public.studio_social_posts where workspace_id=w and id=pid for update;
  if not found or not studio_social_private.post_visible(w,pid) then raise exception 'Content unavailable' using errcode='42501';end if;
  if op<>'decideReview' and (i->>'expected_revision')::integer is distinct from p.revision then raise exception 'CONFLICT: content changed' using errcode='40001';end if;
 elsif op<>'saveDraft' then raise exception 'Saved content required' using errcode='22023';end if;
 if op='saveDraft' then
  if i->>'stage' not in ('idea','draft') or i->>'stage' is null then raise exception 'Choose idea or draft' using errcode='22023';end if;
  if not exists(select 1 from public.workspace_members where workspace_id=w and user_id=(i->>'owner_id')::uuid) or (i->>'reply_owner_id' is not null and not exists(select 1 from public.workspace_members where workspace_id=w and user_id=(i->>'reply_owner_id')::uuid)) then raise exception 'Choose current members' using errcode='22023';end if;
  if not exists(select 1 from pg_timezone_names where name=i->>'timezone') then raise exception 'Choose a valid IANA timezone' using errcode='22023';end if;
  if i->>'idea_id' is not null and not exists(select 1 from public.brand_ideas where workspace_id=w and id=(i->>'idea_id')::uuid) then raise exception 'Idea unavailable' using errcode='42501';end if;
  if i->>'project_id' is not null and not exists(select 1 from public.studio_projects where workspace_id=w and id=(i->>'project_id')::uuid and category<>'Business') then raise exception 'Choose an ordinary creative project' using errcode='42501';end if;
  src:=(i->>'source_version_id')::uuid;
  if src is not null and not exists(select 1 from public.studio_versions where workspace_id=w and id=src and project_id=(i->>'project_id')::uuid) then raise exception 'Source version must belong to the selected project' using errcode='22023';end if;
  if jsonb_typeof(i->'assets') is distinct from 'array' or jsonb_array_length(i->'assets')>20 then raise exception 'Invalid selected media' using errcode='22023';end if;
  if not studio_social_private.refs_visible(w,i->'assets',src) then raise exception 'Only currently shared creative media may be linked' using errcode='42501';end if;
  if (select count(*)<>count(distinct x->>'version_id') from jsonb_array_elements(i->'assets') x) then raise exception 'Duplicate media version' using errcode='22023';end if;
  for a in select * from jsonb_array_elements(i->'assets') loop
   if a-array['version_id','rights','rights_note','consent_confirmed','attribution','public_link']<>'{}'::jsonb or a->>'rights' not in ('owned','licensed','link_only') or a->>'rights' is null or jsonb_typeof(a->'consent_confirmed') is distinct from 'boolean' or coalesce(length(a->>'rights_note'),0)>2000 or coalesce(length(a->>'attribution'),0)>1000 then raise exception 'Invalid rights checklist' using errcode='22023';end if;
   if a->>'public_link' is not null and (not studio_social_private.https(a->>'public_link') or a->>'public_link' ~* '(\?|/storage/v1/object/sign/)') then raise exception 'Use an ordinary public attribution link, never a signed access URL' using errcode='22023';end if;
  end loop;
  if pid is null then
   insert into public.studio_social_posts(workspace_id,title,purpose,audience,channel,account_label,caption,format,owner_id,reply_owner_id,idea_id,project_id,source_version_id,planned_at,timezone,embargo_until,release_note,assets,state,created_by)
   values(w,i->>'title',coalesce(i->>'purpose',''),coalesce(i->>'audience',''),i->>'channel',i->>'account_label',coalesce(i->>'caption',''),i->>'format',(i->>'owner_id')::uuid,(i->>'reply_owner_id')::uuid,(i->>'idea_id')::uuid,(i->>'project_id')::uuid,src,(i->>'planned_at')::timestamptz,i->>'timezone',(i->>'embargo_until')::timestamptz,coalesce(i->>'release_note',''),i->'assets',i->>'stage',actor) returning * into p;pid:=p.id;
  else
   update public.studio_social_posts set title=i->>'title',purpose=coalesce(i->>'purpose',''),audience=coalesce(i->>'audience',''),channel=i->>'channel',account_label=i->>'account_label',caption=coalesce(i->>'caption',''),format=i->>'format',owner_id=(i->>'owner_id')::uuid,reply_owner_id=(i->>'reply_owner_id')::uuid,idea_id=(i->>'idea_id')::uuid,project_id=(i->>'project_id')::uuid,source_version_id=src,planned_at=(i->>'planned_at')::timestamptz,timezone=i->>'timezone',embargo_until=(i->>'embargo_until')::timestamptz,release_note=coalesce(i->>'release_note',''),assets=i->'assets',state=i->>'stage',revision=revision+1,updated_at=now() where id=pid returning * into p;
   update public.studio_social_reviews set state='withdrawn',revision=revision+1,decided_at=now() where post_id=pid and state='open';
  end if;
 elsif op='submitReview' then
  if p.state not in ('idea','draft') or length(trim(p.caption))=0 or p.source_version_id is null or p.planned_at is null then raise exception 'Complete caption, exact source version and intended posting time before review' using errcode='22023';end if;
  if jsonb_typeof(i->'reviewers') is distinct from 'array' then raise exception 'Name current human reviewers' using errcode='22023';end if;
  reviewers:=array(select distinct value::uuid from jsonb_array_elements_text(i->'reviewers'));
  if cardinality(reviewers) not between 1 and 30 or exists(select 1 from unnest(reviewers) x where not exists(select 1 from public.workspace_members where workspace_id=w and user_id=x)) then raise exception 'Name current human reviewers' using errcode='22023';end if;
  if not studio_social_private.creative_eligible(w,p.source_version_id) then raise exception 'The exact source version needs creative approval first' using errcode='22023';end if;
  payload:=to_jsonb(p)-array['created_by','created_at','updated_at','approved_snapshot_id','state','workspace_id'];
  payload:=jsonb_set(payload,'{assets}','[]'::jsonb);
  for a in select * from jsonb_array_elements(p.assets) loop
   select * into v from public.studio_versions where workspace_id=w and id=(a->>'version_id')::uuid;
   if not studio_social_private.creative_eligible(w,v.id) then raise exception 'Every selected exact media version needs creative approval' using errcode='22023';end if;
   if not coalesce((a->>'consent_confirmed')::boolean,false) or length(trim(coalesce(a->>'rights_note','')))=0 then raise exception 'Complete rights evidence and consent for every asset' using errcode='22023';end if;
   if a->>'rights'='link_only' then if not studio_social_private.https(a->>'public_link') then raise exception 'Link-only assets need a permitted public link' using errcode='22023';end if;
   elsif v.source_url is null or not (v.source_url like 'supabase-storage://workspace-media/'||w::text||'/%' or v.source_url like 'blob://workspace-assets/'||w::text||'/%') or not exists(select 1 from public.workspace_files where id=v.file_id and workspace_id=w and provider='other') then raise exception 'This external media can only be used as a permitted link' using errcode='22023';end if;
   payload:=jsonb_set(payload,'{assets}',(payload->'assets')||jsonb_build_array(a||jsonb_build_object('file_id',v.file_id,'source_fingerprint',md5(coalesce(v.source_url,'')))));
  end loop;
  insert into public.studio_social_snapshots(workspace_id,post_id,ordinal,draft_revision,payload,reviewers,created_by) values(w,pid,(select coalesce(max(ordinal),0)+1 from public.studio_social_snapshots where post_id=pid),p.revision,payload,reviewers,actor) returning * into s;
  insert into public.studio_social_reviews(workspace_id,post_id,snapshot_id) values(w,pid,s.id);
  update public.studio_social_posts set state='in_review',revision=revision+1,updated_at=now() where id=pid returning * into p;sid:=s.id;
 elsif op='decideReview' then
  select * into s from public.studio_social_snapshots where workspace_id=w and post_id=pid and id=(i->>'snapshot_id')::uuid;
  if not found or not studio_social_private.snapshot_visible(w,s.id) then raise exception 'Review unavailable' using errcode='42501';end if;
  select * into r from public.studio_social_reviews where snapshot_id=s.id for update;
  if r.state<>'open' or r.revision is distinct from (i->>'expected_review_revision')::integer then raise exception 'CONFLICT: review changed' using errcode='40001';end if;
  if not actor=any(s.reviewers) then raise exception 'Only a named reviewer can decide' using errcode='42501';end if;
  if exists(select 1 from unnest(s.reviewers) x where not exists(select 1 from public.workspace_members where workspace_id=w and user_id=x)) then raise exception 'Review membership changed; edit and resubmit' using errcode='22023';end if;
  if i->>'disposition'='approve' and (not studio_social_private.creative_eligible(w,(s.payload->>'source_version_id')::uuid) or exists(select 1 from jsonb_array_elements(s.payload->'assets') x where not studio_social_private.creative_eligible(w,(x->>'version_id')::uuid))) then raise exception 'Creative source eligibility changed; edit and resubmit publication review' using errcode='22023';end if;
  insert into public.studio_social_decisions(workspace_id,post_id,snapshot_id,reviewer_id,disposition,note) values(w,pid,s.id,actor,i->>'disposition',coalesce(i->>'note',''));
  if i->>'disposition'='request_changes' then update public.studio_social_reviews set state='changes_requested',revision=revision+1,decided_at=now() where id=r.id;update public.studio_social_posts set state='draft',revision=revision+1,updated_at=now() where id=pid returning * into p;
  elsif not exists(select 1 from unnest(s.reviewers) x where not exists(select 1 from public.studio_social_decisions where snapshot_id=s.id and reviewer_id=x and disposition='approve')) then update public.studio_social_reviews set state='approved',revision=revision+1,decided_at=now() where id=r.id;update public.studio_social_posts set state='approved',approved_snapshot_id=s.id,revision=revision+1,updated_at=now() where id=pid returning * into p;
  else update public.studio_social_reviews set revision=revision+1 where id=r.id;end if;sid:=s.id;
 elsif op='recordPublication' then
  sid:=(i->>'snapshot_id')::uuid;
  if p.state not in ('approved','posted') or p.approved_snapshot_id is distinct from sid or not studio_social_private.snapshot_visible(w,sid) then raise exception 'An active approved package is required' using errcode='22023';end if;
  if not studio_social_private.https(i->>'url') or (i->>'posted_at')::timestamptz>now()+interval '5 minutes' or i->>'posted_at' is null then raise exception 'Record a real HTTPS post and actual posting time' using errcode='22023';end if;
  perform public.studio_social_export(w,sid);
  select * into s from public.studio_social_snapshots where id=sid;
  if (s.payload->>'embargo_until')::timestamptz>(i->>'posted_at')::timestamptz then raise exception 'Posting time cannot precede the approved embargo' using errcode='22023';end if;
  insert into public.studio_social_publications(workspace_id,post_id,snapshot_id,url,posted_at,recorded_by) values(w,pid,sid,i->>'url',(i->>'posted_at')::timestamptz,actor) on conflict(snapshot_id,url) do nothing;
  select * into pub from public.studio_social_publications where snapshot_id=sid and url=i->>'url';
  if pub.posted_at is distinct from (i->>'posted_at')::timestamptz then raise exception 'CONFLICT: this post URL is already recorded with a different time' using errcode='40001';end if;
  update public.studio_social_posts set state='posted',revision=revision+1,updated_at=now() where id=pid returning * into p;
 elsif op='saveFeedback' then
  if not exists(select 1 from public.workspace_members where workspace_id=w and user_id=(i->>'owner_id')::uuid) then raise exception 'Choose a current feedback owner' using errcode='22023';end if;
  select * into pub from public.studio_social_publications where workspace_id=w and post_id=pid and id=(i->>'publication_id')::uuid;
  if not found or not studio_social_private.snapshot_visible(w,pub.snapshot_id) then raise exception 'Source post unavailable' using errcode='42501';end if;
  if i->>'source_url' is not null and not studio_social_private.https(i->>'source_url') then raise exception 'Use an ordinary HTTPS source link' using errcode='22023';end if;
  metric:=coalesce(i->'metrics','{}'::jsonb);
  if jsonb_typeof(metric)<>'object' or metric-array['views','likes','comments','shares','saves','replies','clicks']<>'{}'::jsonb then raise exception 'Unsupported manual metric' using errcode='22023';end if;
  for k,a in select key,value from jsonb_each(metric) loop if a<>'null'::jsonb and (jsonb_typeof(a)<>'number' or a::text!~'^[0-9]+$' or a::text::numeric>9007199254740991) then raise exception 'Metrics must be nonnegative whole counts, or unknown' using errcode='22023';end if;end loop;
  if exists(select 1 from jsonb_each(metric) where value<>'null'::jsonb) and i->>'metrics_captured_at' is null then raise exception 'Record when metrics were captured' using errcode='22023';end if;
  if (i->>'observed_at')::timestamptz>now()+interval '5 minutes' or (i->>'metrics_captured_at')::timestamptz>now()+interval '5 minutes' then raise exception 'Observations cannot be future results' using errcode='22023';end if;
  fid:=(i->>'feedback_id')::uuid;
  if fid is null then insert into public.studio_social_feedback(workspace_id,post_id,publication_id,observation,observed_at,source_url,metrics,metrics_captured_at,owner_id,created_by) values(w,pid,pub.id,i->>'observation',(i->>'observed_at')::timestamptz,i->>'source_url',metric,(i->>'metrics_captured_at')::timestamptz,(i->>'owner_id')::uuid,actor) returning id into fid;
  else update public.studio_social_feedback set observation=i->>'observation',observed_at=(i->>'observed_at')::timestamptz,source_url=i->>'source_url',metrics=metric,metrics_captured_at=(i->>'metrics_captured_at')::timestamptz,owner_id=(i->>'owner_id')::uuid,revision=revision+1 where id=fid and workspace_id=w and post_id=pid and publication_id=pub.id;if not found then raise exception 'Feedback unavailable' using errcode='42501';end if;end if;
  update public.studio_social_posts set revision=revision+1,updated_at=now() where id=pid returning * into p;
 elsif op='createFeedbackTask' then
  fid:=(i->>'feedback_id')::uuid;select * into f from public.studio_social_feedback where workspace_id=w and post_id=pid and id=fid for update;
  if not found then raise exception 'Feedback unavailable' using errcode='42501';end if;
  if not exists(select 1 from public.workspace_members where workspace_id=w and user_id=f.owner_id) then raise exception 'Update feedback owner before assigning work' using errcode='22023';end if;
  tid:=f.task_id;
  if tid is null then
   if length(trim(coalesce(i->>'title',''))) not between 1 and 200 then raise exception 'A clear task title is required' using errcode='22023';end if;
   insert into public.studio_tasks(workspace_id,created_by,title,details,category,status,assigned_to,due_date,priority,project_id) values(w,actor,i->>'title','Human-created response to manually recorded social feedback. Open Social to review the source.','Social','open',f.owner_id,(i->>'due_date')::date,'normal',p.project_id) returning id into tid;
   update public.studio_social_feedback set task_id=tid,revision=revision+1 where id=fid;
   update public.studio_social_posts set revision=revision+1,updated_at=now() where id=pid returning * into p;
  end if;
 elsif op='archiveDraft' then update public.studio_social_posts set state='archived',revision=revision+1,updated_at=now() where id=pid returning * into p;update public.studio_social_reviews set state='withdrawn',revision=revision+1,decided_at=now() where post_id=pid and state='open';end if;
 result:=jsonb_strip_nulls(jsonb_build_object('postId',pid,'revision',p.revision,'snapshotId',sid,'publicationId',pub.id,'feedbackId',fid,'taskId',tid));
 insert into studio_social_private.requests(workspace_id,actor_id,request_id,operation,input,post_id,result) values(w,actor,req,op,i,pid,result);
 return result;
end $$;
revoke all on function studio_social_private.mutate(uuid,text,uuid,jsonb) from public,anon;grant execute on function studio_social_private.mutate(uuid,text,uuid,jsonb) to authenticated;
create or replace function public.studio_social_mutate(p_workspace uuid,p_operation text,p_request uuid,p_input jsonb) returns jsonb language sql security invoker set search_path=pg_catalog as $$ select studio_social_private.mutate(p_workspace,p_operation,p_request,p_input) $$;
revoke all on function public.studio_social_mutate(uuid,text,uuid,jsonb) from public,anon;grant execute on function public.studio_social_mutate(uuid,text,uuid,jsonb) to authenticated;

create or replace function public.studio_social_read(p_workspace uuid,p_post uuid default null,p_page integer default 0,p_options boolean default false,p_query text default '') returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $$
declare data jsonb;
begin
 perform public.studio_social_capabilities(p_workspace);
 if p_page not between 0 and 100000 or length(p_query)>200 then raise exception 'Invalid page or search' using errcode='22023';end if;
 if p_options then return jsonb_build_object(
 'ideas',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title)) from (select id,title from public.brand_ideas where workspace_id=p_workspace and title ilike '%'||p_query||'%' order by created_at desc,id limit 50 offset p_page*50) x),'[]'::jsonb),
 'projects',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title)) from (select id,title from public.studio_projects where workspace_id=p_workspace and category<>'Business' and title ilike '%'||p_query||'%' order by created_at desc,id limit 50 offset p_page*50) x),'[]'::jsonb),
 'versions',coalesce((select jsonb_agg(to_jsonb(x)) from (select v.id,v.title,v.project_id,v.file_id,studio_social_private.creative_eligible(p_workspace,v.id) creative_approved from public.studio_versions v join public.studio_projects p on p.id=v.project_id and p.workspace_id=p_workspace left join public.workspace_files f on f.id=v.file_id and f.workspace_id=p_workspace where v.workspace_id=p_workspace and p.category<>'Business' and (v.file_id is null or f.permission_scope='workspace') and v.title ilike '%'||p_query||'%' order by v.created_at desc,v.id limit 50 offset p_page*50) x),'[]'::jsonb));end if;
 if p_post is not null then
  select to_jsonb(p) into data from public.studio_social_posts p where p.workspace_id=p_workspace and p.id=p_post;
  if data is null then raise exception 'Content unavailable' using errcode='42501';end if;
  return jsonb_build_object('schemaVersion',1,'post',data,
   'snapshots',coalesce((select jsonb_agg(to_jsonb(s) order by ordinal desc) from public.studio_social_snapshots s where workspace_id=p_workspace and post_id=p_post),'[]'::jsonb),
   'reviews',coalesce((select jsonb_agg(to_jsonb(s)) from public.studio_social_reviews s where workspace_id=p_workspace and post_id=p_post),'[]'::jsonb),
   'decisions',coalesce((select jsonb_agg(to_jsonb(s)) from public.studio_social_decisions s where workspace_id=p_workspace and post_id=p_post),'[]'::jsonb),
   'publications',coalesce((select jsonb_agg(to_jsonb(s) order by posted_at desc) from public.studio_social_publications s where workspace_id=p_workspace and post_id=p_post),'[]'::jsonb),
   'feedback',coalesce((select jsonb_agg(to_jsonb(s) order by observed_at desc) from public.studio_social_feedback s where workspace_id=p_workspace and post_id=p_post),'[]'::jsonb));end if;
 return jsonb_build_object('schemaVersion',1,'actorId',auth.uid(),'capabilities',jsonb_build_object('manualPackages',true,'automaticPosting',false,'metricsSync',false),'page',p_page,'pageSize',50,'total',(select count(*) from public.studio_social_posts where workspace_id=p_workspace),
 'posts',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.studio_social_posts where workspace_id=p_workspace order by planned_at asc nulls last,created_at desc,id limit 50 offset p_page*50) x),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(p.display_name,'Workspace member'))) from public.workspace_members m left join public.profiles p on p.id=m.user_id where m.workspace_id=p_workspace),'[]'::jsonb));
end $$;
revoke all on function public.studio_social_read(uuid,uuid,integer,boolean,text) from public,anon;grant execute on function public.studio_social_read(uuid,uuid,integer,boolean,text) to authenticated;
-- Export is purpose-specific and allowlisted; no private notes, rationale, document body or storage URLs.
create or replace function public.studio_social_export(p_workspace uuid,p_snapshot uuid) returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $$
declare s public.studio_social_snapshots;p public.studio_social_posts;r public.studio_social_reviews;a jsonb;assets jsonb:='[]';n integer:=0;
begin
 perform public.studio_social_capabilities(p_workspace);
 select * into s from public.studio_social_snapshots where workspace_id=p_workspace and id=p_snapshot;
 if not found then raise exception 'Package unavailable' using errcode='42501';end if;
 select * into p from public.studio_social_posts where workspace_id=p_workspace and id=s.post_id;
 select * into r from public.studio_social_reviews where workspace_id=p_workspace and snapshot_id=s.id;
 if p.state not in ('approved','posted') or p.approved_snapshot_id is distinct from s.id or r.state<>'approved' then raise exception 'This exact package is not currently approved for publication' using errcode='22023';end if;
 if not studio_social_private.creative_eligible(p_workspace,(s.payload->>'source_version_id')::uuid) or exists(select 1 from jsonb_array_elements(s.payload->'assets') x where not studio_social_private.creative_eligible(p_workspace,(x->>'version_id')::uuid)) then raise exception 'Creative source eligibility changed; resubmit publication review' using errcode='22023';end if;
 if (s.payload->>'embargo_until')::timestamptz>now() then raise exception 'The approved release embargo has not passed' using errcode='22023';end if;
 if exists(select 1 from unnest(s.reviewers) x where not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=x)) then raise exception 'An approving reviewer no longer belongs to this workspace; resubmit review' using errcode='22023';end if;
 for a in select * from jsonb_array_elements(s.payload->'assets') loop n:=n+1;assets:=assets||jsonb_build_array(jsonb_build_object('number',n,'rights',a->>'rights','attribution',a->>'attribution','public_link',a->>'public_link','delivery',case when a->>'rights'='link_only' then 'external_link' else 'download' end));end loop;
 return jsonb_build_object('kind','manual_publication_package','schemaVersion',1,'approval',jsonb_build_object('snapshot',s.id,'version',s.ordinal,'approved_at',r.decided_at),'channel',s.payload->>'channel','account_label',s.payload->>'account_label','format',s.payload->>'format','caption',s.payload->>'caption','planned_at',s.payload->'planned_at','timezone',s.payload->>'timezone','embargo_until',s.payload->'embargo_until','assets',assets,'instructions','Publish manually to the approved destination after the embargo. Planned time is not an external schedule. Record the actual post URL and time in Social.');
end $$;
revoke all on function public.studio_social_export(uuid,uuid) from public,anon;grant execute on function public.studio_social_export(uuid,uuid) to authenticated;
create or replace function public.studio_social_asset(p_workspace uuid,p_snapshot uuid,p_index integer) returns uuid language plpgsql stable security invoker set search_path=pg_catalog as $$
declare s public.studio_social_snapshots;a jsonb;begin
 perform public.studio_social_export(p_workspace,p_snapshot);
 select * into s from public.studio_social_snapshots where workspace_id=p_workspace and id=p_snapshot;
 if p_index<0 or p_index>=jsonb_array_length(s.payload->'assets') then raise exception 'Asset unavailable' using errcode='22023';end if;
 a:=s.payload->'assets'->p_index;if a->>'rights'='link_only' then raise exception 'External references are link-only; no download rights were approved' using errcode='22023';end if;
 return (a->>'version_id')::uuid;
end $$;
revoke all on function public.studio_social_asset(uuid,uuid,integer) from public,anon;grant execute on function public.studio_social_asset(uuid,uuid,integer) to authenticated;
commit;
