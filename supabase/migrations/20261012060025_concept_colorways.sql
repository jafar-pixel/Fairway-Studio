create schema if not exists fairway_private;
create table public.studio_sample_colors (
 hex text primary key check(hex ~ '^#[0-9a-f]{6}$'), name text not null check(length(name) between 1 and 60), sort_order integer not null
);
alter table public.studio_sample_colors enable row level security;
create policy sample_colors_read on public.studio_sample_colors for select to authenticated using(true);
revoke all on public.studio_sample_colors from anon,authenticated;
grant select on public.studio_sample_colors to authenticated;
grant all on public.studio_sample_colors to service_role;
insert into public.studio_sample_colors(hex,name,sort_order) values
('#efe9db','Cream',0),('#244a3a','Forest',1),('#760d24','Burgundy',2),('#233247','Navy',3),('#ae7356','Clay',4),('#262626','Black',5),('#fafafa','White',6),('#9ba78a','Sage',7),('#594135','Chocolate',8),('#a2c2d2','Sky',9),('#c9b69a','Sand',10),('#b29760','Gold',11);
create table public.studio_colorway_options (
 workspace_id uuid not null,
 source_version_id uuid not null,
 color_hex text not null references public.studio_sample_colors(hex),
 scope text not null check(scope in ('body','whole')),
 generated_version_id uuid,
 created_at timestamptz not null default now(),
 primary key(source_version_id,color_hex,scope),
 foreign key(workspace_id,source_version_id) references public.studio_versions(workspace_id,id) on delete cascade,
 foreign key(workspace_id,generated_version_id) references public.studio_versions(workspace_id,id)
);
create index colorway_options_workspace_source on public.studio_colorway_options(workspace_id,source_version_id);
create index colorway_options_generated on public.studio_colorway_options(workspace_id,generated_version_id) where generated_version_id is not null;
create index colorway_options_color on public.studio_colorway_options(color_hex);
alter table public.studio_colorway_options enable row level security;
create policy colorway_options_read on public.studio_colorway_options for select to authenticated using(exists(select 1 from public.workspace_members m where m.workspace_id=studio_colorway_options.workspace_id and m.user_id=(select auth.uid())));
revoke all on public.studio_colorway_options from anon,authenticated;
grant select on public.studio_colorway_options to authenticated;
grant all on public.studio_colorway_options to service_role;
-- This private trigger seeds fixed palette options after an already-authorized version insert.
-- Cache links are accepted only from the exact succeeded generation job/output, never client provenance alone.
create function fairway_private.seed_design_colorways() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare request jsonb; color jsonb; label text;
begin
 insert into public.studio_colorway_options(workspace_id,source_version_id,color_hex,scope)
 select new.workspace_id,new.id,c.hex,s.scope from public.studio_sample_colors c cross join (values('body'),('whole')) s(scope) on conflict do nothing;
 if new.parent_id is not null then
  select j.request into request from public.studio_generation_jobs j where j.id::text=new.provenance->>'origin_job_id' and j.workspace_id=new.workspace_id and j.created_by=new.created_by and j.status='succeeded' and j.request->>'sourceVersionId'=new.parent_id::text and j.outputs @> jsonb_build_array(jsonb_build_object('versionId',new.id::text));
  color:=request->'colorway';
  if color is not null then
   update public.studio_colorway_options set generated_version_id=new.id where workspace_id=new.workspace_id and source_version_id=new.parent_id and color_hex=color->>'hex' and scope=color->>'scope' and generated_version_id is null;
   select left(v.title || ' · ' || c.name,160) into label from public.studio_versions v join public.studio_sample_colors c on c.hex=color->>'hex' where v.id=new.parent_id and v.workspace_id=new.workspace_id;
   if label is not null then
    update public.studio_versions set title=label where id=new.id and workspace_id=new.workspace_id;
    update public.workspace_files set title=label where id=new.file_id and workspace_id=new.workspace_id;
   end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function fairway_private.seed_design_colorways() from public,anon,authenticated;
create trigger studio_version_palette after insert on public.studio_versions for each row execute function fairway_private.seed_design_colorways();
-- Existing concepts receive every palette choice without generating images or changing their designs.
insert into public.studio_colorway_options(workspace_id,source_version_id,color_hex,scope)
select v.workspace_id,v.id,c.hex,s.scope from public.studio_versions v cross join public.studio_sample_colors c cross join (values('body'),('whole')) s(scope) on conflict do nothing;
