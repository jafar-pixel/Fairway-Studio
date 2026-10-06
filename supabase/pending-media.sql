-- REVIEW ONLY. Additive media pipeline; do not apply to production without approval.
-- Requires pending-schema.sql. Keeps original bucket private, policies, memberships and data.
begin;
update storage.buckets set public=false, file_size_limit=100000000,
 allowed_mime_types=array['image/avif','image/gif','image/jpeg','image/png','image/webp','image/heic','image/heif','audio/mpeg','video/mp4','video/quicktime','video/x-matroska','audio/mp3','audio/x-mp3','video/matroska','application/x-matroska','image/heic-sequence','image/heif-sequence','image/jpg']
 where id='workspace-media';
-- Keep exact three-segment path ownership semantics of the existing helper.
create or replace function app_private.workspace_media_workspace_id(object_name text)
returns uuid language sql immutable set search_path='' as $$
 select case when object_name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/[a-zA-Z0-9_-]+\.(avif|gif|jpe?g|png|webp|heic|heif|mp3|mp4|mov|mkv)$'
 then split_part(object_name,'/',1)::uuid else null end
$$;
alter table public.workspace_files drop constraint if exists workspace_files_url_check;
alter table public.workspace_files add constraint workspace_files_url_check check (
 url ~ '^https://' or
 url ~ ('^supabase-storage://workspace-media/' || workspace_id::text || '/' || added_by::text || '/[a-zA-Z0-9_-]+\.(avif|gif|jpe?g|png|webp|heic|heif|mp3|mp4|mov|mkv)$') or
 url ~ ('^blob://workspace-assets/' || workspace_id::text || '/' || added_by::text || '/[a-zA-Z0-9_-]+\.(avif|gif|jpe?g|png|webp)$')
);
create table if not exists public.studio_media_jobs (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 file_id uuid not null unique references public.workspace_files(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 source_path text not null, source_size bigint not null check(source_size between 1 and 100000000),
 source_type text not null check(source_type in ('image/avif','image/gif','image/jpeg','image/png','image/webp','image/heic','image/heif','audio/mpeg','video/mp4','video/quicktime','video/x-matroska')),
 source_sha256 text check(source_sha256 ~ '^[0-9a-f]{64}$'), recipe text not null default 'review-v1' check(recipe='review-v1'),
 status text not null default 'queued' check(status in ('queued','processing','ready','failed','blocked')),
 attempts integer not null default 0 check(attempts between 0 and 3), lease_id uuid, lease_until timestamptz,
 next_attempt_at timestamptz not null default now(),
 preview_path text, preview_type text check(preview_type in ('image/jpeg','video/mp4')), preview_size bigint check(preview_size between 1 and 100000000),
 preview_sha256 text check(preview_sha256 ~ '^[0-9a-f]{64}$'), original_ready boolean not null default false,
 error_code text, error_message text, metadata jsonb not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,source_path,recipe),
 check(app_private.workspace_media_workspace_id(source_path)=workspace_id and split_part(source_path,'/',2)=created_by::text),
 check(preview_path is null or preview_path ~ ('^' || workspace_id::text || '/' || id::text || '/[0-9a-f-]{36}\.(jpg|mp4)$')),
 check(status<>'ready' or (source_sha256 is not null and (original_ready or (preview_path is not null and preview_type is not null and preview_size is not null and preview_sha256 is not null)))),
 check((status='processing')=(lease_id is not null and lease_until is not null)),
 check(octet_length(metadata::text)<=16000)
);
alter table public.studio_media_jobs enable row level security;
revoke all on public.studio_media_jobs from public,anon,authenticated;
grant select on public.studio_media_jobs to authenticated;
grant all on public.studio_media_jobs to service_role;
create policy studio_media_job_read on public.studio_media_jobs for select to authenticated using (
 exists(select 1 from public.workspace_files f join public.workspace_members m on m.workspace_id=f.workspace_id
 where f.id=file_id and f.workspace_id=studio_media_jobs.workspace_id and f.url='supabase-storage://workspace-media/' || studio_media_jobs.source_path
 and m.user_id=(select auth.uid()) and (f.permission_scope='workspace' or f.added_by=(select auth.uid())))
);
create index if not exists studio_media_queue_idx on public.studio_media_jobs(next_attempt_at,created_at) where status in ('queued','processing');
create index if not exists studio_media_workspace_idx on public.studio_media_jobs(workspace_id,file_id);
create index if not exists studio_media_created_by_idx on public.studio_media_jobs(created_by,status);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('studio-media-previews','studio-media-previews',false,100000000,array['image/jpeg','video/mp4'])
 on conflict(id) do update set public=false,file_size_limit=100000000,allowed_mime_types=excluded.allowed_mime_types;
-- No authenticated INSERT, UPDATE or DELETE permission on derivative storage.
create policy studio_media_preview_read on storage.objects for select to authenticated using (
 bucket_id='studio-media-previews' and exists(select 1 from public.studio_media_jobs j
 join public.workspace_files f on f.id=j.file_id join public.workspace_members m on m.workspace_id=j.workspace_id
 where j.preview_path=storage.objects.name and j.status='ready' and f.workspace_id=j.workspace_id
 and f.url='supabase-storage://workspace-media/' || j.source_path
 and m.user_id=(select auth.uid()) and (f.permission_scope='workspace' or f.added_by=(select auth.uid())))
);
-- Restrictive guard defends against existing/future broad storage policies.
create policy studio_media_preview_no_client_write on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'studio-media-previews');
create policy studio_media_preview_no_client_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'studio-media-previews') with check(bucket_id<>'studio-media-previews');
create policy studio_media_preview_no_client_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'studio-media-previews');
create policy studio_media_preview_visibility on storage.objects as restrictive for select to authenticated using (
 bucket_id<>'studio-media-previews' or exists(select 1 from public.studio_media_jobs j
 join public.workspace_files f on f.id=j.file_id join public.workspace_members m on m.workspace_id=j.workspace_id
 where j.preview_path=storage.objects.name and j.status='ready' and f.workspace_id=j.workspace_id
 and f.url='supabase-storage://workspace-media/' || j.source_path
 and m.user_id=(select auth.uid()) and (f.permission_scope='workspace' or f.added_by=(select auth.uid())))
);
-- Narrow authenticated registration. It never declares a file validated/ready.
-- SECURITY DEFINER is confined to the private schema; caller identity, path, membership,
-- bucket metadata, canonical ownership and queue quota are independently checked here.
create or replace function app_private.studio_register_media(w uuid,p text,t text,n text,tags_in text[] default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); f public.workspace_files; j public.studio_media_jobs; o storage.objects; mime text; expected text;
begin
 if uid is null or app_private.workspace_media_workspace_id(p) is distinct from w or split_part(p,'/',2)<>uid::text
 or not exists(select 1 from public.workspace_members where workspace_id=w and user_id=uid) then raise exception 'Media access denied' using errcode='42501'; end if;
 -- Per-uploader lock makes the pending-job quota safe under concurrent registrations.
 perform pg_advisory_xact_lock(hashtextextended('studio-media-user:' || uid::text,0));
 -- Lock current membership after waiting for the uploader lock; revocation cannot pass mid-transaction.
 perform 1 from public.workspace_members where workspace_id=w and user_id=uid for key share;
 if not found then raise exception 'Media access denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('studio-media:' || w::text || ':' || p,0));
 if cardinality(tags_in)>10 then raise exception 'Too many media tags' using errcode='22023'; end if;
 select * into j from public.studio_media_jobs where workspace_id=w and source_path=p and recipe='review-v1';
 if found then return jsonb_build_object('id',j.file_id,'job',to_jsonb(j)); end if;
 if (select count(*) from public.studio_media_jobs where created_by=uid and status in ('queued','processing','blocked'))>=20 then raise exception 'Finish pending uploads before adding more' using errcode='22023'; end if;
 select * into o from storage.objects where bucket_id='workspace-media' and name=p;
 if not found or coalesce((o.metadata->>'size')::bigint,0) not between 1 and 100000000 then raise exception 'Invalid stored media size' using errcode='22023'; end if;
 expected:=case split_part(p,'.',array_length(string_to_array(p,'.'),1)) when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'png' then 'image/png' when 'gif' then 'image/gif' when 'webp' then 'image/webp' when 'avif' then 'image/avif' when 'heic' then 'image/heic' when 'heif' then 'image/heif' when 'mp3' then 'audio/mpeg' when 'mp4' then 'video/mp4' when 'mov' then 'video/quicktime' when 'mkv' then 'video/x-matroska' end;
 mime:=lower(trim(split_part(coalesce(o.metadata->>'mimetype',''),';',1)));
 mime:=case mime when 'audio/mp3' then 'audio/mpeg' when 'audio/x-mp3' then 'audio/mpeg' when 'video/matroska' then 'video/x-matroska' when 'application/x-matroska' then 'video/x-matroska' when 'image/heic-sequence' then 'image/heic' when 'image/heif-sequence' then 'image/heif' when 'image/jpg' then 'image/jpeg' else mime end;
 if expected is null or mime is distinct from expected then raise exception 'Invalid stored media type' using errcode='22023'; end if;
 select * into f from public.workspace_files where workspace_id=w and url='supabase-storage://workspace-media/' || p order by created_at,id limit 1;
 if found and f.added_by<>uid then raise exception 'Media ownership differs' using errcode='42501'; end if;
 if not found then
  insert into public.workspace_files(workspace_id,added_by,title,url,provider,context_note,tags,permission_scope)
  values(w,uid,left(coalesce(nullif(trim(t),''),'Untitled reference'),160),'supabase-storage://workspace-media/' || p,'other',left(coalesce(n,''),500),
   array(select distinct x from unnest(coalesce(tags_in,'{}')) x where x=any(array['Inspiration','Silhouette','Materials','Color','Product','Dev handoff'])),'workspace') returning * into f;
 end if;
 insert into public.studio_media_jobs(workspace_id,file_id,created_by,source_path,source_size,source_type)
 values(w,f.id,uid,p,(o.metadata->>'size')::bigint,expected) returning * into j;
 return jsonb_build_object('id',f.id,'job',to_jsonb(j));
end $$;
revoke all on function app_private.studio_register_media(uuid,text,text,text,text[]) from public,anon;
grant execute on function app_private.studio_register_media(uuid,text,text,text,text[]) to authenticated;
create or replace function public.studio_register_media(w uuid,p text,t text,n text,tags_in text[] default '{}') returns jsonb
 language sql security invoker set search_path='' as $$ select app_private.studio_register_media(w,p,t,n,tags_in) $$;
revoke all on function public.studio_register_media(uuid,text,text,text,text[]) from public,anon;
grant execute on function public.studio_register_media(uuid,text,text,text,text[]) to authenticated;
create or replace function app_private.studio_media_source_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.url is distinct from old.url or new.workspace_id is distinct from old.workspace_id or new.added_by is distinct from old.added_by) and exists(select 1 from public.studio_media_jobs where file_id=old.id) then raise exception 'Media originals are immutable; upload a new file' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function app_private.studio_media_source_guard() from public,anon,authenticated;
create trigger studio_media_source_guard before update of url,workspace_id,added_by on public.workspace_files for each row execute function app_private.studio_media_source_guard();
-- Retrying joins the same pending quota and lock as registration, including direct RPC callers.
create or replace function app_private.studio_retry_media(w uuid,jid uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); j public.studio_media_jobs;
begin
 if uid is null or not exists(select 1 from public.workspace_members where workspace_id=w and user_id=uid) then raise exception 'Media access denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('studio-media-user:' || uid::text,0));
 -- Lock current membership after waiting for the uploader lock; revocation cannot pass mid-transaction.
 perform 1 from public.workspace_members where workspace_id=w and user_id=uid for key share;
 if not found then raise exception 'Media access denied' using errcode='42501'; end if;
 select * into j from public.studio_media_jobs where id=jid and workspace_id=w and created_by=uid for update;
 if not found or not exists(select 1 from public.workspace_files f where f.id=j.file_id and f.workspace_id=w and f.added_by=uid and f.url='supabase-storage://workspace-media/' || j.source_path) then raise exception 'Media access denied' using errcode='42501'; end if;
 -- A killed invocation can leave an expired processing lease. It is already a pending slot.
 if j.status='processing' and j.lease_until<now() then j.status:='blocked'; end if;
 -- Covers a committed registration whose invocation died before claiming the job.
 if j.status='queued' and j.updated_at<now()-interval '10 minutes' then j.status:='blocked'; end if;
 if j.status not in ('failed','blocked') then return to_jsonb(j); end if;
 if j.attempts>=3 then raise exception 'ATTEMPT_LIMIT' using errcode='22023'; end if;
 -- A blocked job already occupies a pending slot. Only failed->queued adds one.
 if j.status='failed' and (select count(*) from public.studio_media_jobs where created_by=uid and status in ('queued','processing','blocked'))>=20 then raise exception 'QUEUE_LIMIT' using errcode='22023'; end if;
 update public.studio_media_jobs set status='queued',lease_id=null,lease_until=null,error_code=null,error_message=null,next_attempt_at=now(),updated_at=now() where id=jid returning * into j;
 return to_jsonb(j);
end $$;
revoke all on function app_private.studio_retry_media(uuid,uuid) from public,anon;
grant execute on function app_private.studio_retry_media(uuid,uuid) to authenticated;
create or replace function public.studio_retry_media(w uuid,jid uuid) returns jsonb
 language sql security invoker set search_path='' as $$ select app_private.studio_retry_media(w,jid) $$;
revoke all on function public.studio_retry_media(uuid,uuid) from public,anon;
grant execute on function public.studio_retry_media(uuid,uuid) to authenticated;
-- Worker RPCs are invoker-rights and service_role-only, never authenticated client APIs.
create or replace function public.studio_claim_media(job_id uuid default null) returns setof public.studio_media_jobs
language plpgsql security invoker set search_path='' as $$
begin
 update public.studio_media_jobs set status='failed',error_code='ATTEMPT_LIMIT',error_message='Preview processing exhausted its retries. Your original is preserved.',lease_id=null,lease_until=null,updated_at=now()
 where status='processing' and lease_until<now() and attempts>=3;
 return query with candidate as (
  select id from public.studio_media_jobs where (job_id is null or id=job_id) and attempts<3
  and ((status='queued' and next_attempt_at<=now()) or (status='processing' and lease_until<now()))
  order by created_at for update skip locked limit 1
 ) update public.studio_media_jobs j set status='processing',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '600 seconds',updated_at=now(),error_code=null,error_message=null
 from candidate where j.id=candidate.id returning j.*;
end $$;
revoke all on function public.studio_claim_media(uuid) from public,anon,authenticated;
grant execute on function public.studio_claim_media(uuid) to service_role;
-- A healthy daemon reports actual native capability every 20 seconds. No public writes.
create table if not exists public.studio_media_worker_health(id text primary key check(id='native-loop'),heartbeat_at timestamptz not null,capable boolean not null);
alter table public.studio_media_worker_health enable row level security;
revoke all on public.studio_media_worker_health from public,anon,authenticated;
grant all on public.studio_media_worker_health to service_role;
commit;
