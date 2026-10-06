import fs from 'node:fs';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const root=new URL('../',import.meta.url).pathname;
const u='10000000-0000-4000-8000-000000000001',e='10000000-0000-4000-8000-000000000002',x='10000000-0000-4000-8000-000000000003';
const w='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002';
let checks=0;
function check(c,m){assert.ok(c,m);checks++;console.log(`PASS ${checks}: ${m}`)}
async function sql(q,p=[]){return (await db.query(q,p)).rows}
async function actor(id,role='authenticated'){await db.exec(`reset role; set role ${role}`);await sql("select set_config('request.jwt.claim.sub',$1,false)",[id||''])}
async function owner(){await db.exec('reset role')}
async function op(name,input,key=crypto.randomUUID(),workspace=w){return(await sql('select public.studio_business_mutate($1,$2,$3,$4::jsonb) data',[workspace,name,key,JSON.stringify(input)]))[0].data}
async function read(pid=null,page=0,view='all',options=null,q=''){return(await sql('select public.studio_business_read($1,$2,$3,$4,$5,$6) data',[w,pid,page,view,options,q]))[0].data}
async function fails(fn,code,msg){await assert.rejects(fn,err=>{if(err.code!==code)console.error(err.message,err.code);return err.code===code});checks++;console.log(`PASS ${checks}: ${msg}`)}
try {
 await db.exec(fs.readFileSync(root+'tests/fixtures/legacy-schema.sql','utf8'));
 await db.exec(fs.readFileSync(root+'tests/fixtures/verified-studio-schema.sql','utf8'));
 const migration=fs.readFileSync(root+'supabase/migrations/20261002224730_business_foundation.sql','utf8');
 await db.exec(migration);await db.exec(migration);check(true,'Additive migration compiles and replays without data changes');
 await sql('insert into auth.users(id) values($1),($2),($3)',[u,e,x]);
 await sql('insert into profiles(id,display_name) values($1,\'Owner\'),($2,\'Editor\'),($3,\'Outsider\')',[u,e,x]);
 await sql("insert into workspaces(id,name,created_by) values($1,'Foundation',$3),($2,'Other',$3)",[w,other,u]);
 await sql("insert into workspace_members(workspace_id,user_id,role) values($1,$2,'owner'),($1,$3,'editor'),($4,$2,'owner'),($4,$5,'editor') on conflict do nothing",[w,u,e,other,x]);
 const files=await sql("insert into workspace_files(workspace_id,added_by,title,url,permission_scope) values($1,$3,'private','https://example.invalid/private','restricted'),($1,$3,'shared','https://example.invalid/shared','workspace'),($2,$3,'other','https://example.invalid/other','workspace') returning id,title",[w,other,u]);
 const fid=t=>files.find(f=>f.title===t).id;
 await actor(u);
 check((await read()).total===0,'New workspace starts with truthful empty Business data');
 const key=crypto.randomUUID(),input={title:'Supply plan',kind:'idea',notes:'Original notes',objective:'Useful goal',owner_id:e,tags:['launch']};
 let r=await op('createPlan',input,key);const pid=r.plan.id;let revision=r.plan.revision;
 check(r.plan.lead_id===e && r.plan.kind==='idea','Create persists member owner and idea');
 check(JSON.stringify(await op('createPlan',input,key))===JSON.stringify(r),'Exact retry returns canonical original result');
 await fails(()=>op('createPlan',{...input,title:'different'},key),'40001','Same request ID cannot change input');
 await fails(()=>op('createPlan',{...input,created_by:e}),'22023','Forged actor rejected');
 await fails(()=>op('createPlan',{...input,owner_id:x}),'22023','Cross-workspace owner rejected');
 async function edit(name,input={}){const result=await op(name,{plan_id:pid,expected_revision:revision,...input});revision=result.plan.revision;return result}
 await edit('linkDocument',{title:'Supporting source',url:'https://example.org/source.pdf',notes:'Ordinary workspace reference'});
 await edit('linkDocument',{file_id:fid('shared')});
 await fails(()=>edit('linkDocument',{file_id:fid('private')}),'42501','Restricted file cannot leak into ordinary plan, even to its owner');
 await fails(()=>edit('linkDocument',{file_id:fid('other')}),'42501','Cross-workspace file rejected');
 await fails(()=>edit('linkDocument',{title:'Unsafe',url:'javascript:alert(1)'}),'23514','Non-HTTPS document link rejected');
 await fails(()=>edit('linkDocument',{title:'Credential URL',url:'https://user:password@example.org/file'}),'23514','Credential-bearing external URL rejected');
 check((await read(pid)).documents.length===2,'Supporting document links survive backend reload');
 await edit('developPlan');await edit('developPlan');
 check((await read()).total===1 && (await read(pid)).plan.id===pid,'Repeated develop retains one canonical project and plan identity');
 const sw=await edit('upsertSwot',{quadrant:'threat',body:'Supplier lead time',owner_id:e,evidence:'Source conversation'});const sid=sw.entityId;
 const tk=await edit('createSwotTask',{id:sid,title:'Confirm lead time',due_date:'2026-01-01',priority:'high'});const tid=tk.entityId;
 const again=await edit('createSwotTask',{id:sid,title:'Ignore duplicate'});
 check(tid===again.entityId && (await read(pid)).tasks.length===1,'SWOT response creation is idempotent across distinct requests');
 check((await read(pid)).tasks[0].assigned_to===e,'SWOT response assigns current member');
 const task=(await read(pid)).tasks[0];
 await sql('select public.studio_mutate($1,$2,$3,$4::jsonb)',[w,'updateTask',crypto.randomUUID(),JSON.stringify({id:tid,expected_revision:task.revision,title:'Confirmed lead time',status:'in_progress',blocked_reason:'Await supplier',assigned_to:e})]);
 check((await read(pid)).tasks[0].title==='Confirmed lead time','Canonical Tasks mutation appears in Business, same task ID');
 check((await read()).overview.blockedTasks===1,'Complete Business overview counts blocked canonical tasks');
 await fails(()=>op('updatePlan',{plan_id:pid,expected_revision:0,notes:'stale'}),'40001','Stale plan edit conflicts');
 await owner();const otherTask=(await sql("insert into studio_tasks(workspace_id,created_by,title) values($1,$2,'Other task') returning id",[other,u]))[0].id;await actor(u);
 await fails(()=>edit('linkTask',{task_id:otherTask}),'42501','Cross-workspace task rejected');
 let submission=await edit('submitPlan',{reviewers:[u,e],policy:'all_reviewers',supersedes_version_id:null});const version=submission.entityId;
 let detail=await read(pid);check(detail.versions[0].body.notes==='Original notes','Review freezes the exact notes snapshot');
 await fails(()=>op('decidePlan',{plan_id:pid,version_id:version,expected_review_revision:0,disposition:'approve',reviewer_id:e}),'22023','Impersonated reviewer rejected');
 await actor(x);await fails(()=>read(pid),'42501','Cross-workspace user cannot read Business API');
 check((await sql('select id from studio_business_plans')).length===0,'RLS denies direct cross-workspace select');
 await actor(u);
 const approvalKey=crypto.randomUUID(),approval={plan_id:pid,version_id:version,expected_review_revision:0,disposition:'approve',rationale:'Owner confirms this exact plan'};
 await op('decidePlan',approval,approvalKey);
 check((await read(pid)).plan.approved_version_id===null,'A partial reviewer vote does not approve the plan');
 check(JSON.stringify(await op('decidePlan',approval,approvalKey)).includes(pid),'Decision retry is idempotent');
 await actor(e);let decision=await op('decidePlan',{plan_id:pid,version_id:version,expected_review_revision:1,disposition:'approve',rationale:'Editor confirms version one'});revision=decision.plan.revision;
 detail=await read(pid);check(detail.plan.approved_version_id===version && detail.reviews[0].status==='approved','All named reviewers explicitly approving finalizes exactly that version');
 check(detail.decisions.length===2 && detail.decisions.every(d=>d.rationale),'Final retains actor, time and rationale');
 await actor(u);
 await fails(()=>sql('select public.studio_mutate($1,$2,$3,$4::jsonb)',[w,'publishKit',crypto.randomUUID(),JSON.stringify({title:'Invalid mixed approval',usage_note:'Test only',components:{name:detail.decisions[0].id,wordmark:detail.decisions[0].id,palette:detail.decisions[0].id}})]),'22023','Business decision cannot satisfy creative kit approval');
 await owner();
 await fails(()=>sql("insert into studio_kits(workspace_id,title,components,usage_note,created_by) values($1,'Invalid business scope','{\"business\":\"invalid\"}','Test only',$2)",[w,u]),'23514','Kit persistence enforces creative-only component allowlist');
 await actor(e);
 await fails(()=>sql('update studio_business_versions set body=\'{}\' where id=$1',[version]),'42501','Client cannot edit immutable version');
 await fails(()=>sql('delete from studio_business_decisions where version_id=$1',[version]),'42501','Client cannot delete decisions');
 await fails(()=>sql('select * from studio_business_private.requests'),'42501','Request payloads are not client-readable');
 await actor(u);
 const externalDoc=(await read(pid)).documents.find(d=>d.url);
 await edit('unlinkDocument',{id:externalDoc.id});
 check(!(await read(pid)).documents.some(d=>d.id===externalDoc.id),'Unlink hides current reference');
 check((await sql('select id from studio_business_documents where id=$1',[externalDoc.id])).length===1,'Unlink preserves historic reference identity');
 await edit('linkDocument',{title:'Restored supporting source',url:externalDoc.url,notes:'Updated current link note'});
 check((await read(pid)).documents.some(d=>d.id===externalDoc.id && d.notes==='Updated current link note' && d.title==='Restored supporting source'),'Relinking restores original identity and persists supplied link title/notes');
 check((await read(pid)).versions.find(v=>v.id===version).body.document_references.some(d=>d.url===externalDoc.url),'Approved snapshot retains exact external document reference');
 await edit('updatePlan',{notes:'New draft notes',title:'Supply plan revision'});
 detail=await read(pid);check(detail.plan.state==='draft' && detail.plan.approved_version_id===version && detail.versions[0].body.notes==='Original notes','Editing creates new draft, preserving previous immutable final');
 await fails(()=>edit('submitPlan',{reviewers:[u],policy:'all_reviewers',supersedes_version_id:null}),'40001','Superseding final requires explicit exact previous version');
 submission=await edit('submitPlan',{reviewers:[u,e],policy:'all_reviewers',supersedes_version_id:version});const v2=submission.entityId;
 await op('decidePlan',{plan_id:pid,version_id:v2,expected_review_revision:0,disposition:'request_changes',rationale:'Need a deadline'});
 detail=await read(pid);revision=detail.plan.revision;check(detail.plan.approved_version_id===version && detail.reviews[0].status==='changes_requested','Changes requested closes review without modifying current final');
 await edit('updatePlan',{target_date:'2027-01-01'});
 submission=await edit('submitPlan',{reviewers:[u],policy:'all_reviewers',supersedes_version_id:version});const v3=submission.entityId;
 await actor(e);await fails(()=>op('decidePlan',{plan_id:pid,version_id:v3,expected_review_revision:0,disposition:'approve'}),'42501','Unassigned workspace member cannot approve version');await actor(u);
 decision=await op('decidePlan',{plan_id:pid,version_id:v3,expected_review_revision:0,disposition:'approve',rationale:'Updated deadline confirmed'});revision=decision.plan.revision;
 detail=await read(pid);check(detail.plan.approved_version_id===v3 && detail.versions.find(v=>v.id===v3).supersedes_version_id===version,'New approval explicitly supersedes prior final with complete history');
 check(detail.versions.find(v=>v.id===version).body.title==='Supply plan','Old final title remains unchanged after canonical project rename');
 await edit('updatePlan',{notes:'Another draft'});submission=await edit('submitPlan',{reviewers:[u],policy:'all_reviewers',supersedes_version_id:v3});
 const pr=(await sql('select revision from studio_projects where id=$1',[pid]))[0].revision;
 await sql('select public.studio_mutate($1,$2,$3,$4::jsonb)',[w,'updateProject',crypto.randomUUID(),JSON.stringify({id:pid,expected_revision:pr,title:'Legacy project edit'})]);
 detail=await read(pid);revision=detail.plan.revision;check(detail.plan.state==='draft' && detail.reviews[0].status==='withdrawn','Legacy canonical project edits invalidate open Business review');
 await fails(()=>op('decidePlan',{plan_id:pid,version_id:submission.entityId,expected_review_revision:0,disposition:'approve'}),'40001','Stale review cannot approve after canonical project edit');
 await actor(e);check((await read(pid)).documents.length===2,'Same-workspace editor reads ordinary documents');
 await owner();await sql("update workspace_files set permission_scope='restricted' where id=$1",[fid('shared')]);await actor(e);
 check((await read(pid)).documents.length===1,'Revoking workspace file visibility removes Business link metadata');
 check(!(await read(null,0,'all','files')).options.some(f=>f.id===fid('shared')),'Link selector honors current file access');
 await owner();await sql('delete from workspace_members where workspace_id=$1 and user_id=$2',[w,u]);await actor(u);
 await fails(()=>op('createPlan',input,key),'42501','Revoked member cannot replay old idempotency result');
 await fails(()=>read(pid),'42501','Revoked member cannot read Business');
 await actor(null,'anon');await fails(()=>read(pid),'42501','Anonymous RPC access denied');
 await fails(()=>sql('select * from studio_business_versions'),'42501','Anonymous direct table access denied');
 await owner();await sql("insert into workspace_members(workspace_id,user_id,role) values($1,$2,'owner')",[w,u]);
 // More than legacy 500-row cap: complete summary with deterministic 50-row pages.
 await sql("insert into studio_projects(id,workspace_id,title,created_by) select gen_random_uuid(),$1,'Bulk '||n,$2 from generate_series(1,505)n",[w,u]);
 await sql("insert into studio_business_plans(id,workspace_id,created_by) select id,workspace_id,created_by from studio_projects j where workspace_id=$1 and title like 'Bulk %'",[w]);
 await actor(u);const list=await read();check(list.total===506 && list.overview.active===506 && list.plans.length===50,'More than 500 plans have complete counts and explicit pagination');
 check((await read(null,10)).plans.length===6,'Final pagination page contains all remaining records');
 check((await read(null,0,'finals')).total===1,'Final Plans is a filtered view of approved snapshots');
 check((await sql("select count(*)::int n from studio_activity where operation like '%Plan%'"))[0].n===0,'No Business payloads leak into shared activity');
 for(const table of ['studio_business_plans','studio_business_swot','studio_business_task_links','studio_business_project_links','studio_business_documents','studio_business_versions','studio_business_reviews','studio_business_decisions']) {
  await fails(()=>sql(`insert into ${table} default values`),'42501',`Direct insert denied: ${table}`);
  await fails(()=>sql(`update ${table} set workspace_id=workspace_id where false`),'42501',`Direct update denied: ${table}`);
  await fails(()=>sql(`delete from ${table} where false`),'42501',`Direct delete denied: ${table}`);
 }
 await owner();
 const beforeReplay=JSON.stringify(await sql('select id,body from studio_business_versions order by id'));
 const projectIds=JSON.stringify(await sql('select id from studio_projects order by id'));
 await db.exec(migration);
 check(JSON.stringify(await sql('select id,body from studio_business_versions order by id'))===beforeReplay,'Migration replay preserves all immutable snapshot content');
 check(JSON.stringify(await sql('select id from studio_projects order by id'))===projectIds,'Migration replay preserves canonical project IDs');
 check((await sql("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'studio_business_%' and p.prosecdef"))[0].n===0,'All exposed Business RPC functions are security-invoker');
 await fails(()=>sql("update studio_business_versions set body='{}' where id=$1",[version]),'42501','Snapshot immutability also applies to privileged direct edits');
 check((await sql("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'studio_business_%' and c.relkind='r' and not c.relrowsecurity"))[0].n===0,'Every new public Business table enables RLS');
 console.log(`PASS: ${checks} isolated PostgreSQL checks. No live mutations.`);
} catch(err){console.error('FAIL',err.message,err.code,err.where??'',err.query?.slice(0,300)??'');process.exitCode=1}
finally{await db.close()}
