// Uses the exact existing creative workflow and its completion trigger. No direct decision writes.
import fs from 'node:fs';import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite(),root=new URL('../',import.meta.url).pathname;
const u='10000000-0000-4000-8000-000000000001',w='20000000-0000-4000-8000-000000000001';let n=0;
const check=(value,message)=>{assert.ok(value,message);console.log(`PASS ${++n}: ${message}`)};
const sql=async(q,p=[])=>(await db.query(q,p)).rows;
const rpc=async(fn,op,input)=>(await sql(`select public.${fn}($1,$2,$3,$4::jsonb) data`,[w,op,crypto.randomUUID(),JSON.stringify(input)]))[0].data;
const creative=(op,i)=>rpc('studio_mutate',op,i),workflow=(op,i)=>rpc('studio_workflow',op,i),social=(op,i)=>rpc('studio_social_mutate',op,i);
const exp=async(s)=>(await sql('select public.studio_social_export($1,$2) data',[w,s]))[0].data;
const asset=async(s)=>(await sql('select public.studio_social_asset($1,$2,0) data',[w,s]))[0].data;
const options=async()=>(await sql('select public.studio_social_read($1,null,0,true) data',[w]))[0].data;
const eligibility=async(v)=>(await options()).versions.find(x=>x.id===v)?.creative_approved;
const detail=async(p)=>(await sql('select public.studio_social_read($1,$2) data',[w,p]))[0].data;
async function fails(fn,message){await assert.rejects(fn,error=>error.code==='22023');check(true,message)}
async function approveCreative(project,version){const r=await creative('openReview',{project_id:project,version_id:version,scope:'concept',reviewers:[u],policy:'unanimous'});await creative('submitReview',{round_id:r.id,disposition:'approve',expected_revision:0});return creative('recordDecision',{round_id:r.id,rationale:'Human creative decision'});}
async function replace(decision,version){return workflow('supersedeDecision',{decision_id:decision,version_id:version,rationale:'Proposed replacement',reviewers:[u],policy:'unanimous'});}
async function complete(round){await creative('submitReview',{round_id:round,disposition:'approve',expected_revision:0});return creative('recordDecision',{round_id:round,rationale:'Explicitly approve replacement'});}
try {
 for(const f of ['legacy-schema.sql','verified-studio-schema.sql','verified-workflows.sql'])await db.exec(fs.readFileSync(root+'tests/fixtures/'+f,'utf8'));
 await db.exec(fs.readFileSync(process.env.SOCIAL_MIGRATION||root+'supabase/migrations/20261002233903_social_content_workflow.sql','utf8'));
 await sql('insert into auth.users(id) values($1)',[u]);await sql("insert into profiles(id,display_name) values($1,'Owner')",[u]);await sql("insert into workspaces(id,name,created_by) values($1,'Supersession regression',$2)",[w,u]);await sql("insert into workspace_members(workspace_id,user_id,role) values($1,$2,'owner') on conflict do nothing",[w,u]);await db.exec('set role authenticated');await sql("select set_config('request.jwt.claim.sub',$1,false)",[u]);
 const project=await creative('createProject',{title:'Creative source',brief:'Ordinary creative context'});
 const file=(await sql("insert into workspace_files(workspace_id,added_by,title,url,provider,permission_scope) values($1,$2,'Owned fixture media',$3,'other','workspace') returning id",[w,u,`supabase-storage://workspace-media/${w}/${u}/original.png`]))[0];
 const source=await creative('createVersion',{project_id:project.id,title:'Source A',body:'Original'}),sourceB=await creative('createVersion',{project_id:project.id,title:'Source B',body:'Replacement'});
 const media=await creative('createVersion',{project_id:project.id,title:'Media A',file_id:file.id}),mediaB=await creative('createVersion',{project_id:project.id,title:'Media B',file_id:file.id});
 const sourceDecision=await approveCreative(project.id,source.id),mediaDecision=await approveCreative(project.id,media.id);
 const base={title:'Publication under review',purpose:'Ask a focused question',audience:'Community',channel:'instagram',account_label:'@fairway',caption:'Exact caption',format:'post',owner_id:u,reply_owner_id:null,idea_id:null,project_id:project.id,source_version_id:source.id,planned_at:'2026-01-01T12:00:00Z',timezone:'Etc/UTC',embargo_until:null,release_note:'Internal only',assets:[{version_id:media.id,rights:'owned',rights_note:'Owned fixture asset',consent_confirmed:true,attribution:'Fairway',public_link:null}],stage:'draft'};
 async function makePost(fields={},approve=true){const p=await social('saveDraft',{...base,...fields});const sub=await social('submitReview',{post_id:p.postId,expected_revision:p.revision,reviewers:[u]});if(approve)await social('decideReview',{post_id:p.postId,snapshot_id:sub.snapshotId,expected_review_revision:0,disposition:'approve',note:'Exact package reviewed'});return{postId:p.postId,snapshotId:sub.snapshotId};}
 const first=await makePost(),pending=await makePost({},false);const originalSnapshot=JSON.stringify((await detail(first.postId)).snapshots[0]);
 check(await eligibility(source.id)&&await eligibility(media.id),'Independent source and asset approvals are initially eligible');
 check((await exp(first.snapshotId)).kind==='manual_publication_package','Separately approved social package initially exports');
 const deferred=await replace(sourceDecision.id,sourceB.id);
 check((await sql('select replacement_decision_id from studio_decision_supersessions where id=$1',[deferred.supersession.id]))[0].replacement_decision_id===null,'Actual pending supersession stores an intention without a replacement');
 check(await eligibility(source.id),'Pending supersession keeps prior source eligible');check((await exp(first.snapshotId)).caption===base.caption,'Pending supersession does not prematurely revoke publication package');
 await workflow('deferDecision',{round_id:deferred.round.id,expected_revision:0,rationale:'Not ready for replacement'});
 check(await eligibility(source.id)&&!await eligibility(sourceB.id),'Deferred replacement preserves prior approval and does not approve proposed version');
 check((await exp(first.snapshotId)).kind==='manual_publication_package','Deferred replacement leaves prior package valid');
 const rejected=await replace(sourceDecision.id,sourceB.id);await creative('submitReview',{round_id:rejected.round.id,expected_revision:0,disposition:'request_changes',comment:'Needs work'});await workflow('rejectDecision',{round_id:rejected.round.id,expected_revision:0,rationale:'Do not adopt this replacement'});
 check(await eligibility(source.id)&&!await eligibility(sourceB.id),'Rejected replacement preserves prior approval and does not approve rejected version');
 check((await exp(first.snapshotId)).kind==='manual_publication_package','Rejected replacement leaves prior package valid');
 const completed=await replace(sourceDecision.id,sourceB.id);const sourceDecisionB=await complete(completed.round.id);
 const priorRow=(await sql('select outcome from studio_decisions where id=$1',[sourceDecision.id]))[0];
 check(priorRow.outcome==='approved','Real supersession intentionally leaves old outcome approved');
 check((await sql('select replacement_decision_id from studio_decision_supersessions where id=$1',[completed.supersession.id]))[0].replacement_decision_id===sourceDecisionB.id,'Real completion trigger records replacement decision identity');
 check(!await eligibility(source.id)&&await eligibility(sourceB.id),'Options exclude completed-superseded source and include replacement');
 await fails(()=>exp(first.snapshotId),'Completed source supersession blocks old public manifest');await fails(()=>asset(first.snapshotId),'Completed source supersession also blocks asset download authorization');
 const staleSource=await social('saveDraft',base);await fails(()=>social('submitReview',{post_id:staleSource.postId,expected_revision:0,reviewers:[u]}),'Completed-superseded source cannot submit a new social review');
 await fails(()=>social('decideReview',{post_id:pending.postId,snapshot_id:pending.snapshotId,expected_review_revision:0,disposition:'approve',note:'Too late'}),'Source supersession during social review blocks a stale human approval');
 const p1=(await detail(first.postId)).post;await fails(()=>social('recordPublication',{post_id:p1.id,expected_revision:p1.revision,snapshot_id:first.snapshotId,url:'https://example.org/post/old-source',posted_at:'2026-01-02T12:00:00Z'}),'Completed source supersession blocks manual publication recording');
 check(JSON.stringify((await detail(first.postId)).snapshots[0])===originalSnapshot,'Invalidated package remains intact in immutable review history');
 await social('decideReview',{post_id:pending.postId,snapshot_id:pending.snapshotId,expected_review_revision:0,disposition:'request_changes',note:'Update superseded source'});check((await detail(pending.postId)).post.state==='draft','Reviewer can request changes after source becomes ineligible');
 const second=await makePost({source_version_id:sourceB.id}),pendingMedia=await makePost({source_version_id:sourceB.id},false);
 check((await exp(second.snapshotId)).kind==='manual_publication_package','Explicit new social review with replacement source exports');
 const assetReplacement=await replace(mediaDecision.id,mediaB.id);check(await eligibility(media.id),'Pending media supersession keeps original exact media eligible');check(await asset(second.snapshotId)===media.id,'Pending media replacement preserves exact original media authorization');
 const mediaDecisionB=await complete(assetReplacement.round.id);
 check((await sql('select outcome from studio_decisions where id=$1',[mediaDecision.id]))[0].outcome==='approved','Superseded media decision also remains approved in legacy history');
 check(!await eligibility(media.id)&&await eligibility(mediaB.id),'Options exclude superseded media while replacement is eligible');
 await fails(()=>exp(second.snapshotId),'Superseded selected media blocks export even with a current source');await fails(()=>asset(second.snapshotId),'Superseded selected media blocks direct asset resolver');
 const staleAsset=await social('saveDraft',{...base,source_version_id:sourceB.id});await fails(()=>social('submitReview',{post_id:staleAsset.postId,expected_revision:0,reviewers:[u]}),'Every selected media eligibility is enforced at submission');
 await fails(()=>social('decideReview',{post_id:pendingMedia.postId,snapshot_id:pendingMedia.snapshotId,expected_review_revision:0,disposition:'approve',note:'Too late'}),'Media supersession during review blocks stale social approval');
 const p2=(await detail(second.postId)).post;await fails(()=>social('recordPublication',{post_id:p2.id,expected_revision:p2.revision,snapshot_id:second.snapshotId,url:'https://example.org/post/old-media',posted_at:'2026-01-02T12:00:00Z'}),'Superseded selected media blocks publication recording');
 const final=await makePost({source_version_id:sourceB.id,assets:[{...base.assets[0],version_id:mediaB.id}]});check((await exp(final.snapshotId)).kind==='manual_publication_package'&&await asset(final.snapshotId)===mediaB.id,'New exact package with both replacements requires and passes its own publication approval');
 check((await sql('select count(*)::int n from studio_decision_supersessions where replacement_decision_id is not null'))[0].n===2,'Only two genuinely approved replacement workflows are completed');
 check((await sql('select count(*)::int n from studio_decision_supersessions where replacement_decision_id is null'))[0].n===2,'Rejected and deferred attempts remain incomplete rather than revoking approval');
 console.log(`PASS: ${n} real-workflow supersession assertions. No direct decision outcome updates or live changes.`);
}catch(error){console.error('FAIL',error.message,error.code,error.where||'');process.exitCode=1}finally{await db.close()}
