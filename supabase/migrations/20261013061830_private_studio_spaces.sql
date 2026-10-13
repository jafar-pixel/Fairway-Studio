-- Personal creative spaces are physical workspaces: existing RLS, media and AI
-- authorization applies without an owner bypass across founders' drafts.
alter table public.workspaces add column studio_kind text not null default 'team' check(studio_kind in ('personal','team'));
alter table public.workspaces add column parent_workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.workspaces add constraint personal_studio_parent check(studio_kind <> 'personal' or parent_workspace_id is not null);
create unique index one_personal_studio_per_team on public.workspaces(created_by,parent_workspace_id) where studio_kind='personal';

create or replace function studio_private.guard_studio_space() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='workspaces' then
  if tg_op='UPDATE' and (new.studio_kind,new.parent_workspace_id,new.created_by) is distinct from (old.studio_kind,old.parent_workspace_id,old.created_by) then
   raise exception 'Studio ownership and privacy cannot be changed' using errcode='42501';
  end if;
 elsif tg_table_name='workspace_members' then
  if exists(select 1 from public.workspaces w where w.id=new.workspace_id and w.studio_kind='personal' and (new.user_id<>w.created_by or new.role<>'owner')) then
   raise exception 'Personal studios cannot have other members' using errcode='42501';
  end if;
  if tg_op='UPDATE' and exists(select 1 from public.workspaces w where w.id=old.workspace_id and w.studio_kind='personal') and (new.workspace_id,new.user_id) is distinct from (old.workspace_id,old.user_id) then
   raise exception 'Personal studio membership is immutable' using errcode='42501';
  end if;
 elsif tg_table_name='workspace_invites' then
  if exists(select 1 from public.workspaces w where w.id=new.workspace_id and w.studio_kind='personal') then
   raise exception 'Use Team Workspace to invite collaborators' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
revoke all on function studio_private.guard_studio_space() from public,anon,authenticated;
create trigger studio_space_identity before update on public.workspaces for each row execute function studio_private.guard_studio_space();
create trigger studio_personal_members before insert or update on public.workspace_members for each row execute function studio_private.guard_studio_space();
create trigger studio_personal_invites before insert or update on public.workspace_invites for each row execute function studio_private.guard_studio_space();

create or replace function studio_private.ensure_personal_studio(p_team uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); personal uuid;
begin
 if actor is null or not exists(select 1 from public.workspace_members m join public.workspaces w on w.id=m.workspace_id where m.workspace_id=p_team and m.user_id=actor and w.studio_kind='team') then
  raise exception 'Team membership is required' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_team::text,0));
 select id into personal from public.workspaces where created_by=actor and parent_workspace_id=p_team and studio_kind='personal';
 if personal is null then
  insert into public.workspaces(name,created_by,studio_kind,parent_workspace_id) values('My Studio',actor,'personal',p_team) returning id into personal;
 end if;
 insert into public.workspace_members(workspace_id,user_id,role,is_founder) values(personal,actor,'owner',false) on conflict(workspace_id,user_id) do nothing;
 return personal;
end $$;
revoke all on function studio_private.ensure_personal_studio(uuid) from public,anon;
grant execute on function studio_private.ensure_personal_studio(uuid) to authenticated;
create or replace function public.studio_ensure_personal(p_team uuid) returns uuid
language sql security invoker set search_path='' as $$ select studio_private.ensure_personal_studio(p_team) $$;
revoke all on function public.studio_ensure_personal(uuid) from public,anon;
grant execute on function public.studio_ensure_personal(uuid) to authenticated;

create or replace function studio_private.name_matching_sample() returns trigger
language plpgsql security invoker set search_path='' as $$
declare source_title text; target text:=new.provenance#>>'{prompt,target}';
begin
 if target in ('Matching shell','Realistic sample') and new.parent_id is not null then
  select title into source_title from public.studio_versions where id=new.parent_id and workspace_id=new.workspace_id and project_id=new.project_id;
  if source_title is not null then new.title:=left(source_title,200)||' · '||target; end if;
 end if;
 return new;
end $$;
revoke all on function studio_private.name_matching_sample() from public,anon,authenticated;
create trigger studio_matching_sample_name before insert on public.studio_versions for each row execute function studio_private.name_matching_sample();
