-- Run ONLY in isolated test database after baseline + pending-schema.sql.
-- Everything is rolled back; never use this as a production seed.
begin;
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','studio-owner@example.invalid'),
 ('10000000-0000-4000-8000-000000000002','studio-editor@example.invalid'),
 ('10000000-0000-4000-8000-000000000003','studio-outsider@example.invalid');
insert into public.workspaces(id,name,created_by) values('20000000-0000-4000-8000-000000000001','Studio integration test','10000000-0000-4000-8000-000000000001');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','editor') on conflict do nothing;
insert into storage.objects(bucket_id,name) values
 ('workspace-media','20000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/private.png'),
 ('workspace-media','20000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/shared.png'),
 ('workspace-media','20000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/pending.png');
insert into public.workspace_files(workspace_id,added_by,title,url,permission_scope) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Private image','supabase-storage://workspace-media/20000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/private.png','restricted'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Shared image','supabase-storage://workspace-media/20000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/shared.png','workspace');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin assert (select count(*)=3 from storage.objects where bucket_id='workspace-media'),'Uploader lost own pending/restricted image access'; end $$;
do $$
declare w uuid='20000000-0000-4000-8000-000000000001'; idea jsonb; project jsonb; version jsonb; round jsonb; review jsonb; decision jsonb; again jsonb;
begin
 idea=public.studio_mutate(w,'createIdea','30000000-0000-4000-8000-000000000001','{"title":"Original"}');
 again=public.studio_mutate(w,'createIdea','30000000-0000-4000-8000-000000000001','{"title":"Original"}');
 assert idea=again,'Retry did not return identical result';
 begin
  perform public.studio_mutate(w,'createIdea','30000000-0000-4000-8000-000000000001','{"title":"Changed"}');
  raise exception 'Expected reused request conflict';
 exception when serialization_failure then null; end;
 project=public.studio_mutate(w,'promoteIdea','30000000-0000-4000-8000-000000000002',jsonb_build_object('idea_id',idea->>'id'));
 again=public.studio_mutate(w,'promoteIdea','30000000-0000-4000-8000-000000000003',jsonb_build_object('idea_id',idea->>'id'));
 assert project->>'id'=again->>'id','Promotion duplicated a project';
 perform public.studio_mutate(w,'updateIdea','30000000-0000-4000-8000-000000000004',jsonb_build_object('id',idea->>'id','expected_revision',1,'title','Updated'));
 begin
  perform public.studio_mutate(w,'updateIdea','30000000-0000-4000-8000-000000000005',jsonb_build_object('id',idea->>'id','expected_revision',0,'title','Stale'));
  raise exception 'Expected revision conflict';
 exception when serialization_failure then null; end;
 version=public.studio_mutate(w,'createVersion','30000000-0000-4000-8000-000000000006',jsonb_build_object('project_id',project->>'id','title','v1'));
 round=public.studio_mutate(w,'openReview','30000000-0000-4000-8000-000000000007',jsonb_build_object('project_id',project->>'id','version_id',version->>'id','scope','name','reviewers',jsonb_build_array('10000000-0000-4000-8000-000000000001'),'policy','unanimous'));
 review=public.studio_mutate(w,'submitReview','30000000-0000-4000-8000-000000000008',jsonb_build_object('round_id',round->>'id','disposition','request_changes','rating',5,'comment','Please adjust the spacing'));
 begin
  perform public.studio_mutate(w,'recordDecision','30000000-0000-4000-8000-000000000009',jsonb_build_object('round_id',round->>'id'));
  raise exception 'Rating incorrectly counted as approval';
 exception when invalid_parameter_value then null; end;
 perform public.studio_mutate(w,'submitReview','30000000-0000-4000-8000-000000000010',jsonb_build_object('round_id',round->>'id','disposition','approve','expected_revision',0));
 decision=public.studio_mutate(w,'recordDecision','30000000-0000-4000-8000-000000000011',jsonb_build_object('round_id',round->>'id'));
 assert decision->>'outcome'='approved','Decision was not approved';
 begin
  perform public.studio_mutate(w,'publishKit','30000000-0000-4000-8000-000000000012',jsonb_build_object('title','Incomplete kit','usage_note','Test only','components',jsonb_build_object('name',decision->>'id')));
  raise exception 'Incomplete kit was published';
 exception when invalid_parameter_value then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$ begin
 assert (select count(*)=0 from public.studio_projects where workspace_id='20000000-0000-4000-8000-000000000001'),'Outsider read project';
 begin
  perform public.studio_mutate('20000000-0000-4000-8000-000000000001','createIdea','30000000-0000-4000-8000-000000000020','{"title":"Forbidden"}');
  raise exception 'Outsider wrote idea';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin
 assert (select count(*)=1 from public.studio_projects where workspace_id='20000000-0000-4000-8000-000000000001'),'Member could not read project';
 begin
  insert into public.studio_decisions(workspace_id,round_id,project_id,version_id,scope,evidence,created_by) values('20000000-0000-4000-8000-000000000001',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'name','{}','10000000-0000-4000-8000-000000000002');
  raise exception 'Direct decision write allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$
declare w uuid='20000000-0000-4000-8000-000000000001'; project jsonb; version jsonb; round jsonb; task jsonb; thread jsonb; again jsonb; file jsonb; node jsonb; reference jsonb; rid uuid;
begin
 select to_jsonb(p.*) into project from public.studio_projects p where workspace_id=w limit 1;
 project=public.studio_mutate(w,'updateProject',gen_random_uuid(),jsonb_build_object('id',project->>'id','expected_revision',0,'brief','Updated brief','lead_id','10000000-0000-4000-8000-000000000002'));
 assert project->>'brief'='Updated brief','Project update failed';
 version=public.studio_mutate(w,'createVersion',gen_random_uuid(),jsonb_build_object('project_id',project->>'id','title','Version 2'));
 node=public.studio_mutate(w,'saveCanvas',gen_random_uuid(),jsonb_build_object('project_id',project->>'id','version_id',version->>'id','kind','annotation','body','Alignment','x',0.5,'y',0.25,'expected_revision',0));
 assert node->>'kind'='annotation','Annotation type lost';
 begin
  perform public.studio_mutate(w,'saveCanvas',gen_random_uuid(),jsonb_build_object('project_id',project->>'id','version_id',version->>'id','kind','annotation','body','Outside','x',2,'y',0.25,'expected_revision',0));
  raise exception 'Out-of-range annotation accepted';
 exception when check_violation then null; end;
 round=public.studio_mutate(w,'openReview',gen_random_uuid(),jsonb_build_object('project_id',project->>'id','version_id',version->>'id','scope','palette','reviewers',jsonb_build_array('10000000-0000-4000-8000-000000000001')));
 begin
  perform public.studio_mutate(w,'submitReview',gen_random_uuid(),jsonb_build_object('round_id',round->>'id','disposition','approve','expected_revision',2));
  raise exception 'Nonzero initial review revision accepted';
 exception when serialization_failure then null; end;
 begin
  perform public.studio_mutate(w,'submitReview',gen_random_uuid(),jsonb_build_object('round_id',round->>'id','disposition','request_changes','comment','  '));
  raise exception 'Empty request_changes comment accepted';
 exception when invalid_parameter_value then null; end;
 task=public.studio_mutate(w,'createTask',gen_random_uuid(),jsonb_build_object('title','Task','project_id',project->>'id','due_date','2026-12-31','priority','high','checklist',jsonb_build_array(jsonb_build_object('text','First','done',false))));
 thread=public.studio_mutate(w,'createThread',gen_random_uuid(),jsonb_build_object('title','Task discussion','task_id',task->>'id'));
 again=public.studio_mutate(w,'createThread',gen_random_uuid(),jsonb_build_object('title','Task discussion','task_id',task->>'id'));
 assert thread->>'id'=again->>'id','Context thread duplicated';
 perform public.studio_mutate(w,'sendMessage',gen_random_uuid(),jsonb_build_object('thread_id',thread->>'id','body','Hello team'));
 select id into rid from public.workspace_files where workspace_id=w and title='Shared image';
 version=public.studio_mutate(w,'createVersion',gen_random_uuid(),jsonb_build_object('project_id',project->>'id','title','Image snapshot','file_id',rid));
 assert version->>'image_url' like '/api/studio/media?versionId=%','Image version URL not version-scoped';
 assert version->>'source_url' like 'supabase-storage://workspace-media/%','Image source path not retained';
 begin
  delete from storage.objects where name like '%/shared.png';
  assert not found,'Referenced shared file object deleted';
  delete from storage.objects where name like '%/private.png';
  assert not found,'Referenced restricted file object deleted';
 end;
 reference=public.studio_mutate(w,'importPin',gen_random_uuid(),'{"title":"Pin","url":"https://pinterest.com/pin/123456/?utm_source=test"}');
 again=public.studio_mutate(w,'importPin',gen_random_uuid(),'{"title":"Same Pin","url":"https://www.pinterest.com/pin/123456/"}');
 assert reference->>'id'=again->>'id','Canonical Pin duplicated';
 file=public.studio_mutate(w,'createExternalFile',gen_random_uuid(),'{"title":"Shared file","url":"https://example.invalid/file"}');
 perform public.studio_mutate(w,'saveCanvas',gen_random_uuid(),jsonb_build_object('project_id',project->>'id','file_id',file->>'id','body','Shared file','expected_revision',0));
 insert into public.workspace_files(workspace_id,added_by,title,url,permission_scope) values(w,auth.uid(),'Private file','https://example.invalid/private','restricted') returning id into rid;
 begin
  perform public.studio_mutate(w,'saveCanvas',gen_random_uuid(),jsonb_build_object('project_id',project->>'id','file_id',rid,'body','Private','expected_revision',0));
  raise exception 'Restricted file shared on canvas';
 exception when invalid_parameter_value then null; end;
 begin
  update public.workspaces set active_kit_id=gen_random_uuid() where id=w;
  raise exception 'Direct active kit update allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.brand_ideas set author_id='10000000-0000-4000-8000-000000000002' where workspace_id=w;
  raise exception 'Legacy author reassignment allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.studio_mutate(w,'removeMember',gen_random_uuid(),jsonb_build_object('user_id',auth.uid()));
  raise exception 'Last owner removed';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.studio_mutate(w,'updateMember',gen_random_uuid(),jsonb_build_object('user_id',auth.uid(),'role','editor'));
  raise exception 'Last owner demoted';
 exception when invalid_parameter_value then null; end;
 perform public.studio_mutate(w,'updateMember',gen_random_uuid(),jsonb_build_object('user_id','10000000-0000-4000-8000-000000000002','is_founder',true));
 assert (select is_founder from public.workspace_members where workspace_id=w and user_id='10000000-0000-4000-8000-000000000002'),'Founder designation not persisted';
 assert not has_table_privilege('authenticated','public.workspace_files','TRUNCATE'),'Authenticated TRUNCATE still granted';
 assert not has_table_privilege('authenticated','public.workspace_rooms','TRIGGER'),'Authenticated TRIGGER still granted';
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin
 assert (select count(*)=0 from public.workspace_files where permission_scope='restricted'),'Teammate read a restricted file';
 assert (select count(*)=0 from public.studio_requests),'Teammate read another actor request ledger';
 assert (select count(*)=1 from storage.objects where bucket_id='workspace-media'),'Teammate read restricted or pending objects directly';
 begin
  perform public.studio_mutate('20000000-0000-4000-8000-000000000001','updateMember',gen_random_uuid(),jsonb_build_object('user_id',auth.uid(),'role','owner'));
  raise exception 'Editor escalated their role';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.workspaces(id,name,created_by) values('20000000-0000-4000-8000-000000000002','Other workspace','10000000-0000-4000-8000-000000000003');
insert into public.studio_kits(id,workspace_id,title,components,usage_note,created_by) values('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','Other kit','{}','Test fixture','10000000-0000-4000-8000-000000000003');
do $$ begin
 begin
  update public.workspaces set active_kit_id='40000000-0000-4000-8000-000000000001' where id='20000000-0000-4000-8000-000000000001';
  raise exception 'Cross-workspace kit pointer allowed';
 exception when foreign_key_violation then null; end;
end $$;
update public.workspace_files set url='https://example.invalid/replaced-metadata' where title='Shared image';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ declare affected integer; begin
 delete from storage.objects where name like '%/shared.png'; get diagnostics affected=row_count;
 assert affected=0,'Version-only referenced source object deleted';
 delete from storage.objects where name like '%/pending.png'; get diagnostics affected=row_count;
 assert affected=1,'Unreferenced own upload cleanup blocked';
end $$;
reset role;
-- The legacy creator is now only an editor; retained creator-only DELETE must not suffice.
update public.workspace_members set role='owner' where workspace_id='20000000-0000-4000-8000-000000000001' and user_id='10000000-0000-4000-8000-000000000002';
update public.workspace_members set role='editor' where workspace_id='20000000-0000-4000-8000-000000000001' and user_id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ declare affected integer; begin
 delete from public.workspaces where id='20000000-0000-4000-8000-000000000001';
 get diagnostics affected = row_count;
 assert affected=0,'Demoted creator deleted workspace';
end $$;
rollback;
