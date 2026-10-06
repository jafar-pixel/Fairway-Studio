create or replace function app_private.studio_file_creator_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null
    or actor is distinct from old.added_by
    or new.added_by is distinct from old.added_by
    or new.workspace_id is distinct from old.workspace_id then
    raise exception 'Only the file creator can edit this asset' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app_private.studio_file_creator_guard() from public, anon, authenticated;
drop trigger if exists studio_file_creator_guard on public.workspace_files;
create trigger studio_file_creator_guard
before update on public.workspace_files
for each row execute function app_private.studio_file_creator_guard();

comment on function app_private.studio_file_creator_guard() is 'Restricts SECURITY DEFINER updates of Library uploads to their immutable creator and workspace.';

-- Members can read shared uploads; restricted uploads remain visible only to their uploader.
-- The existing studio_files_visibility policy already enforces this rule.
select 1;

create or replace function public.studio_library_mutate(p_workspace uuid, p_destination uuid, p_asset uuid, p_kind text, p_action text, p_private boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  source_ref public.saved_references%rowtype;
  source_file public.workspace_files%rowtype;
  created_id uuid;
  preview_paths jsonb := '[]'::jsonb;
begin
  if actor is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_workspace is null or p_asset is null or p_kind not in ('reference','file') or p_action not in ('visibility','delete','copy') then raise exception 'Invalid library request' using errcode = '22023'; end if;
  if not exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace and m.user_id=actor) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  if p_action='copy' and (p_destination is null or p_destination=p_workspace or not exists(select 1 from public.workspace_members m where m.workspace_id=p_destination and m.user_id=actor)) then raise exception 'Choose another workspace you belong to' using errcode = '42501'; end if;
  if p_action='visibility' and p_private is null then raise exception 'Choose a visibility' using errcode = '22023'; end if;

  if p_kind='reference' then
    select * into source_ref from public.saved_references r where r.workspace_id=p_workspace and r.id=p_asset for update;
    if not found or (source_ref.permission_scope='restricted' and source_ref.author_id<>actor) then raise exception 'Library asset unavailable' using errcode = '42501'; end if;
    if p_action='visibility' then
      if source_ref.author_id<>actor then raise exception 'Only the creator can change visibility' using errcode = '42501'; end if;
      update public.saved_references set permission_scope=case when p_private then 'restricted' else 'workspace' end,revision=revision+1 where id=p_asset and workspace_id=p_workspace;
      return jsonb_build_object('id',p_asset,'kind',p_kind,'private',p_private);
    elsif p_action='delete' then
      if source_ref.author_id<>actor then raise exception 'Only the creator can permanently delete this asset' using errcode = '42501'; end if;
      delete from public.studio_canvas_nodes where workspace_id=p_workspace and reference_id=p_asset;
      delete from public.studio_idea_assets where workspace_id=p_workspace and reference_id=p_asset;
      delete from public.saved_references where id=p_asset and workspace_id=p_workspace;
      return jsonb_build_object('id',p_asset,'kind',p_kind,'deleted',true);
    else
      insert into public.saved_references(workspace_id,author_id,title,url,image_url,note,source,tags,permission_scope)
      values(p_destination,actor,source_ref.title,source_ref.url,source_ref.image_url,source_ref.note,source_ref.source,source_ref.tags,'workspace') returning id into created_id;
      return jsonb_build_object('id',created_id,'kind',p_kind,'workspace_id',p_destination,'private',false);
    end if;
  end if;

  select * into source_file from public.workspace_files f where f.workspace_id=p_workspace and f.id=p_asset for update;
  if not found or (source_file.permission_scope='restricted' and source_file.added_by<>actor) then raise exception 'Library asset unavailable' using errcode = '42501'; end if;
  if p_action='visibility' then
    if source_file.added_by<>actor then raise exception 'Only the creator can change visibility' using errcode = '42501'; end if;
    update public.workspace_files set permission_scope=case when p_private then 'restricted' else 'workspace' end,revision=revision+1 where id=p_asset and workspace_id=p_workspace;
    return jsonb_build_object('id',p_asset,'kind',p_kind,'private',p_private);
  elsif p_action='delete' then
    if source_file.added_by<>actor then raise exception 'Only the creator can permanently delete this asset' using errcode = '42501'; end if;
    if exists(select 1 from public.studio_versions v where v.workspace_id=p_workspace and v.file_id=p_asset) or exists(select 1 from public.studio_business_documents d where d.workspace_id=p_workspace and d.file_id=p_asset) then
      raise exception 'This file is attached to a saved version or business document. Remove those links before permanently deleting it.' using errcode = '23503';
    end if;
    select coalesce(jsonb_agg(j.preview_path) filter (where j.preview_path is not null),'[]'::jsonb) into preview_paths from public.studio_media_jobs j where j.workspace_id=p_workspace and j.file_id=p_asset;
    delete from public.studio_canvas_nodes where workspace_id=p_workspace and file_id=p_asset;
    delete from public.studio_idea_assets where workspace_id=p_workspace and file_id=p_asset;
    delete from public.workspace_files where id=p_asset and workspace_id=p_workspace;
    return jsonb_build_object('id',p_asset,'kind',p_kind,'deleted',true,'url',source_file.url,'preview_paths',preview_paths);
  end if;

  if source_file.url like 'supabase-storage://workspace-media/%' then raise exception 'Uploaded files must be copied through the media service' using errcode = '22023'; end if;
  insert into public.workspace_files(workspace_id,title,url,provider,context_note,tags,permission_scope,added_by)
  values(p_destination,source_file.title,source_file.url,source_file.provider,source_file.context_note,source_file.tags,'workspace',actor) returning id into created_id;
  return jsonb_build_object('id',created_id,'kind',p_kind,'workspace_id',p_destination,'private',false);
end;
$$;
revoke all on function public.studio_library_mutate(uuid,uuid,uuid,text,text,boolean) from public, anon;
grant execute on function public.studio_library_mutate(uuid,uuid,uuid,text,text,boolean) to authenticated;

comment on function public.studio_library_mutate(uuid,uuid,uuid,text,text,boolean) is 'Creator-scoped visibility and permanent-delete actions; copies always create an independent shared asset. Canvas placements are removed with the source asset.';

select 1;
