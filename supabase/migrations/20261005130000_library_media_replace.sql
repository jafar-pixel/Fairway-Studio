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
  replacement_file public.workspace_files%rowtype;
  created_id uuid;
  preview_paths jsonb := '[]'::jsonb;
  old_preview_paths jsonb := '[]'::jsonb;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_workspace is null or p_asset is null or p_kind not in ('reference','file') or p_action not in ('visibility','delete','copy','replace') then raise exception 'Invalid library request' using errcode='22023'; end if;
  if p_action='replace' and (p_kind<>'file' or p_destination is null or p_destination=p_asset) then raise exception 'Choose a replacement upload' using errcode='22023'; end if;
  if not exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace and m.user_id=actor) then raise exception 'Workspace access denied' using errcode='42501'; end if;
  if p_action='copy' and (p_destination is null or p_destination=p_workspace or not exists(select 1 from public.workspace_members m where m.workspace_id=p_destination and m.user_id=actor)) then raise exception 'Choose another workspace you belong to' using errcode='42501'; end if;
  if p_action='visibility' and p_private is null then raise exception 'Choose a visibility' using errcode='22023'; end if;

  if p_kind='reference' then
    select * into source_ref from public.saved_references r where r.workspace_id=p_workspace and r.id=p_asset for update;
    if not found or (source_ref.permission_scope='restricted' and source_ref.author_id<>actor) then raise exception 'Library asset unavailable' using errcode='42501'; end if;
    if p_action='visibility' then
      if source_ref.author_id<>actor then raise exception 'Only the creator can change visibility' using errcode='42501'; end if;
      update public.saved_references set permission_scope=case when p_private then 'restricted' else 'workspace' end,revision=revision+1 where id=p_asset and workspace_id=p_workspace;
      return jsonb_build_object('id',p_asset,'kind',p_kind,'private',p_private);
    elsif p_action='delete' then
      if source_ref.author_id<>actor then raise exception 'Only the creator can permanently delete this asset' using errcode='42501'; end if;
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
  elsif p_action='replace' then
    if source_file.added_by<>actor then raise exception 'Only the uploader can replace this asset' using errcode='42501'; end if;
    select * into replacement_file from public.workspace_files f where f.workspace_id=p_workspace and f.id=p_destination for update;
    if not found or replacement_file.added_by<>actor then raise exception 'Replacement upload unavailable' using errcode='42501'; end if;
    if source_file.url not like 'supabase-storage://workspace-media/%' or replacement_file.url not like 'supabase-storage://workspace-media/%' then raise exception 'Only uploaded media can be replaced with an upload' using errcode='22023'; end if;
    if exists(select 1 from public.studio_media_jobs j where j.file_id=p_asset and j.status='processing') or exists(select 1 from public.studio_media_jobs j where j.file_id=p_destination and j.status='processing') then raise exception 'Wait for media processing to finish before replacing this upload' using errcode='55000'; end if;
    select coalesce(jsonb_agg(j.preview_path) filter (where j.preview_path is not null),'[]'::jsonb) into old_preview_paths from public.studio_media_jobs j where j.workspace_id=p_workspace and j.file_id=p_asset;
    delete from public.studio_media_jobs where workspace_id=p_workspace and file_id=p_asset;
    update public.workspace_files
      set title=replacement_file.title,url=replacement_file.url,provider=replacement_file.provider,context_note=replacement_file.context_note,tags=replacement_file.tags,revision=revision+1
      where workspace_id=p_workspace and id=p_asset;
    update public.studio_media_jobs set file_id=p_asset where workspace_id=p_workspace and file_id=p_destination;
    if not found then raise exception 'Replacement media job unavailable' using errcode='22023'; end if;
    delete from public.workspace_files where workspace_id=p_workspace and id=p_destination;
    return jsonb_build_object('id',p_asset,'kind',p_kind,'replaced',true,'old_url',source_file.url,'preview_paths',old_preview_paths);
  end if;

  if source_file.url like 'supabase-storage://workspace-media/%' then raise exception 'Uploaded files must be copied through the media service' using errcode = '22023'; end if;
  insert into public.workspace_files(workspace_id,title,url,provider,context_note,tags,permission_scope,added_by)
  values(p_destination,source_file.title,source_file.url,source_file.provider,source_file.context_note,source_file.tags,'workspace',actor) returning id into created_id;
  return jsonb_build_object('id',created_id,'kind',p_kind,'workspace_id',p_destination,'private',false);
end;
$$;
revoke all on function public.studio_library_mutate(uuid,uuid,uuid,text,text,boolean) from public, anon;
grant execute on function public.studio_library_mutate(uuid,uuid,uuid,text,text,boolean) to authenticated;
comment on function public.studio_library_mutate(uuid,uuid,uuid,text,text,boolean) is 'Creator-scoped visibility, replacement, and permanent-delete actions; copies create independent shared assets. Canvas placements remain linked when uploads are replaced.';
select 1;
