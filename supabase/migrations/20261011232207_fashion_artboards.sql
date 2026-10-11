-- Project-scoped creative sessions and version-specific production handoff.
alter table public.studio_creative_chats add column if not exists project_id uuid;
alter table public.studio_creative_chats add constraint creative_chat_project_fk foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id);
create index creative_chat_project_idx on public.studio_creative_chats(workspace_id,project_id,created_at desc);
create table public.studio_design_states (
 workspace_id uuid not null, version_id uuid primary key, project_id uuid not null,
 stage text not null default 'idea' check(stage in ('idea','concept','product')),
 concept_decision_id uuid references public.studio_decisions(id), product_decision_id uuid references public.studio_decisions(id),
 concept_at timestamptz, product_at timestamptz, checked_out_by uuid references auth.users(id), checked_out_until timestamptz,
 production_task_id uuid references public.studio_tasks(id),
 foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id),
 foreign key(workspace_id,version_id) references public.studio_versions(workspace_id,id)
);
alter table public.studio_design_states enable row level security;
revoke all on public.studio_design_states from public, anon, authenticated;
grant select on public.studio_design_states to authenticated;
grant all on public.studio_design_states to service_role;
create policy design_state_member_read on public.studio_design_states for select to authenticated using(exists(select 1 from public.workspace_members m where m.workspace_id=studio_design_states.workspace_id and m.user_id=(select auth.uid())));
create function public.studio_design_action(p_workspace uuid,p_actor uuid,p_version uuid,p_action text,p_decision uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.studio_versions; s public.studio_design_states; d public.studio_decisions; task_id uuid; member_role text;
begin
 select role into member_role from public.workspace_members where workspace_id=p_workspace and user_id=p_actor;
 if member_role is null then raise exception 'Workspace access required' using errcode='42501'; end if;
 select * into v from public.studio_versions where workspace_id=p_workspace and id=p_version;
 if not found then raise exception 'Design unavailable' using errcode='22023'; end if;
 insert into public.studio_design_states(workspace_id,version_id,project_id) values(p_workspace,p_version,v.project_id) on conflict(version_id) do nothing;
 select * into s from public.studio_design_states where version_id=p_version for update;
 if p_action='checkOut' then
  if s.checked_out_by is not null and s.checked_out_by<>p_actor and s.checked_out_until>now() then raise exception 'This version is checked out by a teammate' using errcode='40001'; end if;
  update public.studio_design_states set checked_out_by=p_actor,checked_out_until=now()+interval '30 minutes' where version_id=p_version;
 elsif p_action='checkIn' then
  if s.checked_out_by is not null and s.checked_out_by<>p_actor and s.checked_out_until>now() then raise exception 'Only the editor can check this version in' using errcode='42501'; end if;
  update public.studio_design_states set checked_out_by=null,checked_out_until=null where version_id=p_version;
 elsif p_action='advance' then
  if member_role not in ('owner','admin') then raise exception 'An owner or administrator records stage approvals' using errcode='42501'; end if;
  select * into d from public.studio_decisions where workspace_id=p_workspace and project_id=v.project_id and version_id=p_version and id=p_decision and scope='concept' and outcome='approved';
  if not found then raise exception 'Approve a review of this exact version first' using errcode='22023'; end if;
  if s.stage='idea' then
   update public.studio_design_states set stage='concept',concept_decision_id=d.id,concept_at=now() where version_id=p_version;
  elsif s.stage='concept' then
   if d.id=s.concept_decision_id or not exists(select 1 from public.studio_review_rounds where id=d.round_id and created_at>=s.concept_at) then raise exception 'Product approval needs a fresh review after concept approval' using errcode='22023'; end if;
   insert into public.studio_tasks(workspace_id,created_by,project_id,title,details,category,status,assigned_to)
   select p_workspace,p_actor,v.project_id,'Production planning: '||left(v.title,180),'Approved product version: '||p_version::text||E'\nNext steps: source materials, cost the design, arrange a physical sample, and set production dates.','Business','open',coalesce(p.lead_id,p_actor) from public.studio_projects p where p.id=v.project_id returning id into task_id;
   update public.studio_design_states set stage='product',product_decision_id=d.id,product_at=now(),production_task_id=task_id where version_id=p_version;
  elsif s.product_decision_id<>d.id then raise exception 'Product already approved' using errcode='40001'; end if;
 else raise exception 'Unknown artboard action' using errcode='22023'; end if;
 return (select to_jsonb(ds) from public.studio_design_states ds where version_id=p_version);
end $$;
revoke all on function public.studio_design_action(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.studio_design_action(uuid,uuid,uuid,text,uuid) to service_role;
-- A stale client cannot create a child edit of another member's reserved version.
create function public.studio_design_reservation_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.parent_id is not null and exists(select 1 from public.studio_design_states s where s.version_id=new.parent_id and s.workspace_id=new.workspace_id and s.checked_out_by<>new.created_by and s.checked_out_until>now()) then
  raise exception 'This design version is checked out by a teammate. Start a separate direction or wait for check-in.' using errcode='40001';
 end if;
 return new;
end $$;
revoke all on function public.studio_design_reservation_guard() from public,anon,authenticated;
create trigger studio_design_reservation before insert on public.studio_versions for each row execute function public.studio_design_reservation_guard();
