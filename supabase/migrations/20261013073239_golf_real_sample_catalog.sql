-- Shared starter assets, separate from founders' private or shared design projects.
create table public.studio_sample_catalog (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 sample_key text not null check(sample_key ~ '^[a-z0-9-]{1,100}$'),
 title text not null check(length(title) between 1 and 160),
 category text not null,
 view text not null check(view in ('front','back','side','detail')),
 kind text not null default 'real' check(kind in ('real','shell','fabric','logo')),
 file_id uuid not null,
 foreign key(workspace_id,file_id) references public.workspace_files(workspace_id,id),
 description text not null,
 origin text not null default 'ai_sample_render' check(origin in ('ai_sample_render','logo_design_proposal')),
 source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 primary key(workspace_id,sample_key)
);
alter table public.studio_sample_catalog enable row level security;
revoke all on public.studio_sample_catalog from anon,authenticated;
grant select on public.studio_sample_catalog to authenticated;
create policy studio_sample_catalog_member_read on public.studio_sample_catalog for select to authenticated using(exists(select 1 from public.workspace_members m where m.workspace_id=studio_sample_catalog.workspace_id and m.user_id=(select auth.uid())));

-- One-time, manifest-bound import. Only the server service role can call these
-- RPCs; the temporary uploader holds a separate expiring opaque token.
create table studio_private.catalog_import_sessions (
 token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
 workspace_id uuid not null references public.workspaces(id),
 created_by uuid not null references auth.users(id),
 manifest jsonb not null,
 expires_at timestamptz not null
);
alter table studio_private.catalog_import_sessions enable row level security;
revoke all on studio_private.catalog_import_sessions from public,anon,authenticated;
create or replace function studio_private.catalog_import_asset(p_hash text,p_key text,p_finish boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare session studio_private.catalog_import_sessions; item jsonb; file_uuid uuid; path text; existing public.workspace_files; sample public.studio_sample_catalog;
begin
 select * into session from studio_private.catalog_import_sessions where token_hash=p_hash and expires_at>now() for update;
 if not found then raise exception 'Import authorization expired' using errcode='42501'; end if;
 if not exists(select 1 from public.workspace_members m join public.workspaces w on w.id=m.workspace_id where m.workspace_id=session.workspace_id and m.user_id=session.created_by and m.role='owner' and w.studio_kind='team') then raise exception 'Import owner is no longer authorized' using errcode='42501'; end if;
 item:=session.manifest->p_key;
 if item is null then raise exception 'Asset is not in this import manifest' using errcode='42501'; end if;
 file_uuid:=(item->>'file_id')::uuid;
 path:=session.workspace_id::text||'/'||session.created_by::text||'/'||file_uuid::text||'.png';
 select * into sample from public.studio_sample_catalog where workspace_id=session.workspace_id and sample_key=p_key;
 if found and sample.file_id<>file_uuid then raise exception 'Catalog item already exists' using errcode='23505'; end if;
 if p_finish and sample.file_id is null then
  if not exists(select 1 from storage.objects where bucket_id='workspace-media' and name=path and (metadata->>'size')::bigint between 1 and 6291456 and metadata->>'mimetype'='image/png') then raise exception 'Verified uploaded image is required' using errcode='22023'; end if;
  select * into existing from public.workspace_files where id=file_uuid;
  if found and (existing.workspace_id<>session.workspace_id or existing.added_by<>session.created_by or existing.url<>'supabase-storage://workspace-media/'||path) then raise exception 'File identity collision' using errcode='42501'; end if;
  insert into public.workspace_files(id,workspace_id,added_by,title,url,provider,permission_scope,context_note,tags)
  values(file_uuid,session.workspace_id,session.created_by,item->>'title','supabase-storage://workspace-media/'||path,'other','workspace',item->>'description',array['sample',item->>'kind',item->>'category']) on conflict(id) do nothing;
  insert into public.studio_sample_catalog(workspace_id,sample_key,title,category,view,kind,file_id,description,origin,source_sha256,created_by)
  values(session.workspace_id,p_key,item->>'title',item->>'category',item->>'view',item->>'kind',file_uuid,item->>'description',coalesce(item->>'origin','ai_sample_render'),item->>'sha256',session.created_by) returning * into sample;
 end if;
 return jsonb_build_object('path',path,'sha256',item->>'sha256','file_id',file_uuid,'complete',sample.file_id is not null);
end $$;
revoke all on function studio_private.catalog_import_asset(text,text,boolean) from public,anon,authenticated;
grant execute on function studio_private.catalog_import_asset(text,text,boolean) to service_role;
create or replace function public.studio_catalog_import_asset(p_hash text,p_key text,p_finish boolean default false) returns jsonb
language sql security invoker set search_path='' as $$ select studio_private.catalog_import_asset(p_hash,p_key,p_finish) $$;
revoke all on function public.studio_catalog_import_asset(text,text,boolean) from public,anon,authenticated;
grant execute on function public.studio_catalog_import_asset(text,text,boolean) to service_role;
grant usage on schema studio_private to service_role;
