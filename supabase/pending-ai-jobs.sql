-- LOCAL REVIEW DRAFT. Apply only after pending studio schema, after rollout approval.
-- Automatic crash recovery requires a scheduler POSTing {"action":"worker"} to
-- /api/studio/generation with Authorization: Bearer STUDIO_IMAGE_WORKER_SECRET.
-- Poll at least every minute. A request claims at most one job; parallel workers are safe.
-- Manual authenticated run resumes the caller's job without relying on Next after().
begin;
create table if not exists public.studio_generation_jobs (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 project_id uuid not null, created_by uuid not null references auth.users(id),
 idempotency_key uuid not null, request_hash text not null, request jsonb not null,
 model text not null, provider text not null default 'vercel-ai-gateway',
 status text not null default 'queued' check(status in ('queued','running','succeeded','failed','cancelled')),
 image_count integer not null check(image_count between 1 and 2), attempts integer not null default 0 check(attempts between 0 and 3),
 lease_id uuid, lease_until timestamptz, next_attempt_at timestamptz not null default now(),
 outputs jsonb not null default '[]', usage jsonb, error text,
 retained_version_ids uuid[] not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,idempotency_key), foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id)
);
alter table public.studio_generation_jobs enable row level security;
revoke all on public.studio_generation_jobs from public,anon,authenticated;
grant select on public.studio_generation_jobs to authenticated;
grant all on public.studio_generation_jobs to service_role;
grant select on public.workspace_members,public.studio_projects,public.studio_versions,public.studio_kits,public.workspace_files to service_role;
grant insert on public.workspace_files,public.studio_versions to service_role;
drop policy if exists studio_generation_owner_read on public.studio_generation_jobs;
create policy studio_generation_owner_read on public.studio_generation_jobs for select to authenticated using
 (created_by=(select auth.uid()) and exists(select 1 from public.workspace_members m where m.workspace_id=studio_generation_jobs.workspace_id and m.user_id=(select auth.uid())));
create index if not exists studio_generation_queue_idx on public.studio_generation_jobs(status,next_attempt_at,lease_until);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('studio-ai-outputs','studio-ai-outputs',false,10485760,array['image/png','image/jpeg','image/webp']) on conflict(id) do update set public=false;
-- No authenticated Storage policies: only the authorized server serves creator-private drafts.
create or replace function public.studio_enqueue_generation(p_workspace uuid,p_project uuid,p_actor uuid,p_key uuid,p_hash text,p_request jsonb,p_model text,p_count integer)
returns public.studio_generation_jobs language plpgsql security invoker set search_path=pg_catalog as $$
declare j public.studio_generation_jobs;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_workspace::text,712));
 if not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=p_actor) then raise exception 'Access denied' using errcode='42501'; end if;
 select * into j from public.studio_generation_jobs where workspace_id=p_workspace and idempotency_key=p_key;
 if found then
  if j.created_by<>p_actor or j.request_hash<>p_hash then raise exception 'Idempotency key already used for a different request' using errcode='22023'; end if;
  return j;
 end if;
 if (select coalesce(sum(image_count),0) from public.studio_generation_jobs where workspace_id=p_workspace and created_at>now()-interval '24 hours')+p_count>8 then raise exception 'Workspace image allowance reached: 8 images per rolling 24 hours' using errcode='22023'; end if;
 insert into public.studio_generation_jobs(workspace_id,project_id,created_by,idempotency_key,request_hash,request,model,image_count)
 values(p_workspace,p_project,p_actor,p_key,p_hash,p_request,p_model,p_count) returning * into j;
 return j;
end $$;
-- Each lease reserves its maximum provider output count immediately before a call.
-- Retries and old queued jobs consume the same rolling-day budget as new jobs.
create table if not exists public.studio_generation_attempts (
 lease_id uuid primary key, job_id uuid not null references public.studio_generation_jobs(id),
 workspace_id uuid not null references public.workspaces(id), image_count integer not null check(image_count between 1 and 2),
 reserved_at timestamptz not null default now()
);
alter table public.studio_generation_attempts enable row level security;
revoke all on public.studio_generation_attempts from public,anon,authenticated;
grant select,insert on public.studio_generation_attempts to service_role;
create index if not exists studio_generation_attempt_budget_idx on public.studio_generation_attempts(workspace_id,reserved_at);
create or replace function public.studio_claim_generation(p_id uuid default null)
returns setof public.studio_generation_jobs language plpgsql security invoker set search_path=pg_catalog as $$
declare j public.studio_generation_jobs; token uuid; resume_at timestamptz;
begin
 update public.studio_generation_jobs set status='failed',error='Worker stopped after the final attempt. Start a new request to try again.',lease_id=null,lease_until=null,updated_at=now()
 where status='running' and lease_until<now() and attempts>=3;
 select * into j from public.studio_generation_jobs where (p_id is null or id=p_id) and attempts<3 and
 ((status='queued' and next_attempt_at<=now()) or (status='running' and lease_until<now())) order by created_at for update skip locked limit 1;
 if not found then return; end if;
 if not exists(select 1 from public.workspace_members where workspace_id=j.workspace_id and user_id=j.created_by) then
  update public.studio_generation_jobs set status='cancelled',error='Creator no longer has workspace access.',updated_at=now() where id=j.id; return;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(j.workspace_id::text,713));
 if (select coalesce(sum(image_count),0) from public.studio_generation_attempts where workspace_id=j.workspace_id and reserved_at>now()-interval '24 hours')+j.image_count>8 then
  select min(reserved_at)+interval '24 hours 1 second' into resume_at from public.studio_generation_attempts where workspace_id=j.workspace_id and reserved_at>now()-interval '24 hours';
  update public.studio_generation_jobs set status='queued',lease_id=null,lease_until=null,next_attempt_at=resume_at,error='Daily provider image-attempt allowance reached. Queued until allowance renews.',updated_at=now() where id=j.id;
  return;
 end if;
 token:=gen_random_uuid();
 insert into public.studio_generation_attempts(lease_id,job_id,workspace_id,image_count) values(token,j.id,j.workspace_id,j.image_count);
 return query update public.studio_generation_jobs set status='running',attempts=attempts+1,lease_id=token,lease_until=now()+interval '4 minutes',updated_at=now(),error=null where id=j.id returning *;
end $$;
create or replace function public.studio_retain_generation(p_id uuid,p_actor uuid)
returns uuid[] language plpgsql security invoker set search_path=pg_catalog as $$
declare j public.studio_generation_jobs; o jsonb; f uuid; v uuid; ids uuid[]:='{}';
begin
 select * into j from public.studio_generation_jobs where id=p_id and created_by=p_actor for update;
 if not found or not exists(select 1 from public.workspace_members where workspace_id=j.workspace_id and user_id=p_actor) then raise exception 'Access denied' using errcode='42501'; end if;
 if j.status<>'succeeded' then raise exception 'Only completed drafts can be retained' using errcode='22023'; end if;
 if cardinality(j.retained_version_ids)>0 then return j.retained_version_ids; end if;
 for o in select value from jsonb_array_elements(j.outputs) loop
  f:=(o->>'fileId')::uuid; v:=(o->>'versionId')::uuid;
  insert into public.workspace_files(id,workspace_id,added_by,title,url,provider,permission_scope,context_note,tags)
  values(f,j.workspace_id,p_actor,'AI concept draft','supabase-storage://workspace-media/'||(o->>'retainedPath'),'other','workspace','Generated concept; no approval implied.',array[]::text[]);
  insert into public.studio_versions(id,workspace_id,project_id,title,body,file_id,image_url,source_url,media_verification,parent_id,provenance,created_by)
  values(v,j.workspace_id,j.project_id,'AI concept draft',j.request->>'prompt',f,'/api/studio/media?versionId='||v::text,'supabase-storage://workspace-media/'||(o->>'retainedPath'),'verified_upload',nullif(j.request->>'sourceVersionId','')::uuid,
   jsonb_build_object('origin_job_id',j.id,'model',j.model,'provider',j.provider,'prompt',j.request,'output_hash',o->>'sha256','usage',j.usage,'status','draft'),p_actor);
  ids:=array_append(ids,v);
 end loop;
 update public.studio_generation_jobs set retained_version_ids=ids,updated_at=now() where id=j.id;
 return ids;
end $$;
revoke all on function public.studio_enqueue_generation(uuid,uuid,uuid,uuid,text,jsonb,text,integer),public.studio_claim_generation(uuid),public.studio_retain_generation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.studio_enqueue_generation(uuid,uuid,uuid,uuid,text,jsonb,text,integer),public.studio_claim_generation(uuid),public.studio_retain_generation(uuid,uuid) to service_role;
commit;
