// Optional isolated verifier. Install @electric-sql/pglite@0.3.14 outside the app and set PGLITE_MODULE to its dist/index.js.
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
import fs from 'node:fs'
const db=new PGlite()
const root=new URL('../',import.meta.url).pathname
const baseline=`
create role anon; create role authenticated;
create schema auth; create schema app_private; create schema storage;
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null);
grant usage on schema storage to authenticated; grant select,insert,update,delete on storage.objects to authenticated;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,app_private to authenticated;
create table public.profiles(id uuid primary key references auth.users(id),display_name text not null default '');
create table public.workspaces(id uuid primary key default gen_random_uuid(),name text not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.workspace_members(workspace_id uuid references public.workspaces(id),user_id uuid references auth.users(id),role text not null default 'editor' check(role in ('owner','admin','editor')),joined_at timestamptz default now(),primary key(workspace_id,user_id));
create table public.brand_ideas(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),author_id uuid not null references auth.users(id),title text not null check(length(title) between 1 and 160),body text not null default '' check(length(body)<=3000),category text not null default 'Brand',status text not null default 'exploring' check(status in ('exploring','shortlist','approved')),created_at timestamptz default now(),updated_at timestamptz default now());
create table public.studio_tasks(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),created_by uuid not null references auth.users(id),title text not null,details text not null default '',category text not null default 'Brand',status text not null default 'open' check(status in ('open','in_progress','done')),assigned_to uuid references public.profiles(id),created_at timestamptz default now(),updated_at timestamptz default now());
create table public.saved_references(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),author_id uuid not null references auth.users(id),title text not null,url text not null,image_url text,note text not null default '',source text not null default 'pinterest',created_at timestamptz default now());
create table public.workspace_files(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),added_by uuid not null references auth.users(id),title text not null,url text not null constraint workspace_files_url_check check(url ~ '^https://'),provider text not null default 'other',context_note text not null default '',tags text[] not null default '{}',permission_scope text not null default 'workspace' check(permission_scope in ('workspace','restricted')),created_at timestamptz default now());
create table public.workspace_rooms(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),created_by uuid not null references auth.users(id),title text not null,work_mode text,etiquette text,calendar_intent text,starts_at timestamptz,ends_at timestamptz,meeting_url text,created_at timestamptz default now());
create table public.workspace_invites(token uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),created_by uuid not null references auth.users(id),created_at timestamptz default now(),expires_at timestamptz default now()+interval '14 days');
create table public.workspace_messages(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),author_id uuid not null references auth.users(id),body text not null check(length(trim(body)) between 1 and 4000),created_at timestamptz default now());
create function app_private.is_workspace_member(w uuid) returns bool language sql security definer set search_path=public as $$ select exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid()) $$;
create function app_private.is_workspace_admin(w uuid) returns bool language sql security definer set search_path=public as $$ select exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid() and role in ('owner','admin')) $$;
grant select,insert,update,delete,truncate,references,trigger on all tables in schema public to authenticated;
`
await db.exec(baseline)
await db.exec(`alter table storage.objects enable row level security; create policy legacy_storage_owner_delete on storage.objects for delete to authenticated using(split_part(name,'/',2)=auth.uid()::text); create policy legacy_storage_member_read on storage.objects for select to authenticated using(exists(select 1 from public.workspace_members m where m.workspace_id::text=split_part(name,'/',1) and m.user_id=auth.uid()));`)
for (const table of ['workspaces','workspace_members','brand_ideas','studio_tasks','saved_references','workspace_files','workspace_rooms','workspace_messages']) {
 await db.exec(`alter table ${table} enable row level security; create policy legacy_read on ${table} for select to authenticated using(app_private.is_workspace_member(${table==='workspaces'?'id':'workspace_id'}));`)
 if(table!=='workspace_members') await db.exec(`create policy legacy_write on ${table} for all to authenticated using(app_private.is_workspace_member(${table==='workspaces'?'id':'workspace_id'})) with check(app_private.is_workspace_member(${table==='workspaces'?'id':'workspace_id'}));`)
}
try {
 await db.exec(fs.readFileSync(root+'supabase/pending-schema.sql','utf8'))
 console.log('Migration compiles successfully on local PGlite PostgreSQL.')
 await db.exec(fs.readFileSync(root+'supabase/tests/studio-integration.sql','utf8'))
 console.log('Rollback integration tests passed.')
} catch(e) {console.error('SQL validation failed:',e.message,e.where??'',e.query?.slice(0,150)??'');process.exitCode=1}
await db.close()
