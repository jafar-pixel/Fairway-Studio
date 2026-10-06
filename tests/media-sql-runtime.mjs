// Isolated PostgreSQL/WASM verifier; no production credentials, network or migrations.
// PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node tests/media-sql-runtime.mjs
import fs from 'node:fs'
import assert from 'node:assert/strict'
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite')
const db=new PGlite(),root=new URL('../',import.meta.url).pathname
const baselineRoot=fs.existsSync(root+'tests/studio-sql-runtime.mjs')?root:root+'../fairway-media-backend/'
const existing=fs.readFileSync(baselineRoot+'tests/studio-sql-runtime.mjs','utf8')
const baseline=existing.slice(existing.indexOf('const baseline=`')+16,existing.indexOf('`\nawait db.exec(baseline)'))
const w='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222',member='33333333-3333-4333-8333-333333333333',outsider='44444444-4444-4444-8444-444444444444'
const filePath=`${w}/${owner}/sample.mov`
const q=(text,params=[])=>db.query(text,params)
const login=async(user,role='authenticated')=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec(`set role ${role}`)}
const count=async(table)=>Number((await q(`select count(*) as n from ${table}`)).rows[0].n)
async function denied(sql,params=[]){await assert.rejects(q(sql,params))}
try {
 await db.exec(baseline)
 await db.exec(`create role service_role bypassrls; grant usage on schema auth,app_private,storage to service_role; alter table storage.objects add column metadata jsonb; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); insert into storage.buckets values('workspace-media','workspace-media',false,10485760,array['image/png']); alter table storage.objects enable row level security;`)
 for(const table of ['workspaces','workspace_members','brand_ideas','studio_tasks','saved_references','workspace_files','workspace_rooms','workspace_messages']){
  await db.exec(`alter table ${table} enable row level security; create policy legacy_read on ${table} for select to authenticated using(app_private.is_workspace_member(${table==='workspaces'?'id':'workspace_id'}));`)
  if(table!=='workspace_members')await db.exec(`create policy legacy_write on ${table} for all to authenticated using(app_private.is_workspace_member(${table==='workspaces'?'id':'workspace_id'})) with check(app_private.is_workspace_member(${table==='workspaces'?'id':'workspace_id'}));`)
 }
 await db.exec(fs.readFileSync(baselineRoot+'supabase/pending-schema.sql','utf8'))
 await db.exec(fs.readFileSync(root+'supabase/pending-media.sql','utf8'))
 await db.exec('grant all on all tables in schema public,storage to service_role')
 await q('insert into auth.users(id) values($1),($2),($3)',[owner,member,outsider]);await q('insert into profiles(id) values($1),($2),($3)',[owner,member,outsider]);await q("insert into workspaces(id,name,created_by) values($1,'Media test',$2)",[w,owner]);await q("insert into workspace_members(workspace_id,user_id,role) values($1,$2,'owner'),($1,$3,'editor')",[w,owner,member]);
 await q("insert into storage.objects(bucket_id,name,metadata) values('workspace-media',$1,$2)",[filePath,{size:100000000,mimetype:'video/quicktime'}])
 await login(owner);const registered=(await q("select studio_register_media($1,$2,'Sample','',array[]::text[]) as result",[w,filePath])).rows[0].result
 assert.equal(registered.job.source_size,100000000);assert.equal(registered.job.status,'queued');assert.equal(await count('studio_media_jobs'),1)
 const again=(await q("select studio_register_media($1,$2,'Sample retry','',array[]::text[]) as result",[w,filePath])).rows[0].result;assert.equal(again.id,registered.id);assert.equal(await count('workspace_files'),1)
 await denied("update studio_media_jobs set status='ready' where id=$1",[registered.job.id]);await denied('select studio_claim_media(null)');
 await denied("update workspace_files set url='https://example.com/changed' where id=$1",[registered.id])
 await login(member);assert.equal(await count('studio_media_jobs'),1);await denied("select studio_register_media($1,$2,'Steal','',array[]::text[])",[w,filePath]);
 await login(outsider);assert.equal(await count('studio_media_jobs'),0)
 await login(owner,'service_role');const claimed=(await q('select * from studio_claim_media(null)')).rows[0];assert.equal(claimed.attempts,1);assert.equal(claimed.status,'processing');assert.ok(claimed.lease_id)
 assert.equal((await q('select * from studio_claim_media(null)')).rows.length,0,'active lease cannot be double claimed')
 await q("update studio_media_jobs set lease_until=now()-interval '1 second' where id=$1",[claimed.id]);const recovered=(await q('select * from studio_claim_media(null)')).rows[0];assert.equal(recovered.attempts,2);assert.notEqual(recovered.lease_id,claimed.lease_id)
 const preview=`${w}/${claimed.id}/${recovered.lease_id}.mp4`
 await q("insert into storage.objects(bucket_id,name,metadata) values('studio-media-previews',$1,$2)",[preview,{size:123,mimetype:'video/mp4'}])
 await q("update studio_media_jobs set status='ready',lease_id=null,lease_until=null,source_sha256=$2,preview_path=$3,preview_size=123,preview_type='video/mp4',preview_sha256=$2 where id=$1",[claimed.id,'a'.repeat(64),preview])
 await login(member);assert.equal((await q("select * from storage.objects where bucket_id='studio-media-previews'")).rows.length,1,'authorized teammate sees shared derivative')
 await denied("insert into storage.objects(bucket_id,name,metadata) values('studio-media-previews',$1,'{}')",[`${preview}-forged`]);assert.equal((await q("delete from storage.objects where bucket_id='studio-media-previews' returning id")).rows.length,0)
 await login(owner,'service_role');await q("update workspace_files set permission_scope='restricted' where id=$1",[registered.id]);
 await login(member);assert.equal(await count('studio_media_jobs'),0);assert.equal((await q("select * from storage.objects where bucket_id='studio-media-previews'")).rows.length,0,'restricted original hides preview')
 await login(owner);assert.equal(await count('studio_media_jobs'),1)
 await login(owner,'service_role');await q("update workspace_files set permission_scope='workspace' where id=$1",[registered.id]);await q('delete from workspace_members where user_id=$1',[member]);
 await login(member);assert.equal(await count('studio_media_jobs'),0);assert.equal((await q("select * from storage.objects where bucket_id='studio-media-previews'")).rows.length,0,'removed member loses derivative access')
 await login(owner,'service_role');for(const [name,size] of [['oversize.mov',100000001],['empty.mov',0]]){await q("insert into storage.objects(bucket_id,name,metadata) values('workspace-media',$1,$2)",[`${w}/${owner}/${name}`,{size,mimetype:'video/quicktime'}]);}
 await login(owner);for(const name of ['oversize.mov','empty.mov'])await denied("select studio_register_media($1,$2,'Bad','',array[]::text[])",[w,`${w}/${owner}/${name}`])
 await login(owner,'service_role');await q("update studio_media_jobs set status='processing',lease_id=gen_random_uuid(),lease_until=now()-interval '1 second',attempts=3 where id=$1",[claimed.id]);assert.equal((await q('select * from studio_claim_media(null)')).rows.length,0);assert.equal((await q('select status,error_code from studio_media_jobs where id=$1',[claimed.id])).rows[0].error_code,'ATTEMPT_LIMIT')
 // Simultaneous application retry submissions at 19/20 capacity; PGlite serializes one session.
 const retryIds=[];
 await login(owner,'service_role');
 for(let n=0;n<21;n++){
  const p=`${w}/${owner}/quota-${n}.mp4`;
  const f=(await q("insert into workspace_files(workspace_id,added_by,title,url,provider) values($1,$2,'Quota',$3,'other') returning id",[w,owner,`supabase-storage://workspace-media/${p}`])).rows[0].id;
  const j=(await q("insert into studio_media_jobs(workspace_id,file_id,created_by,source_path,source_size,source_type,status,attempts) values($1,$2,$3,$4,20,'video/mp4',$5,1) returning id",[w,f,owner,p,n<19?'queued':'failed'])).rows[0].id;
  if(n>=19)retryIds.push(j);
 }
 await login(owner);
 const results=await Promise.allSettled(retryIds.map(jid=>q('select studio_retry_media($1,$2)',[w,jid])));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.filter(r=>r.status==='rejected').length,1);
 assert.equal(Number((await q("select count(*) as n from studio_media_jobs where status in ('queued','processing','blocked')")).rows[0].n),20);
 const winner=retryIds[results.findIndex(r=>r.status==='fulfilled')],loser=retryIds[results.findIndex(r=>r.status==='rejected')];
 // Exact crash window: registration committed, but no claim ever happened.
 await login(owner,'service_role');await q("update studio_media_jobs set updated_at=now()-interval '11 minutes',attempts=0 where id=$1",[winner]);
 await login(owner);const recoveredQueue=(await q('select studio_retry_media($1,$2) as job',[w,winner])).rows[0].job;
 assert.equal(recoveredQueue.status,'queued');assert.equal(recoveredQueue.attempts,0);assert.ok(Date.now()-Date.parse(recoveredQueue.updated_at)<10000);
 await login(owner,'service_role');await q("update studio_media_jobs set status='processing',lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes' where id=$1",[winner]);
 const active=(await q('select lease_id from studio_media_jobs where id=$1',[winner])).rows[0].lease_id;
 await login(owner);assert.equal((await q('select studio_retry_media($1,$2) as job',[w,winner])).rows[0].job.lease_id,active,'active lease must never be reset by retry');
 await login(owner,'service_role');await q("update studio_media_jobs set lease_until=now()-interval '1 second' where id=$1",[winner]);
 await login(owner);assert.equal((await q('select studio_retry_media($1,$2) as job',[w,winner])).rows[0].job.lease_id,null,'expired lease can be retried atomically');

 await denied('select studio_retry_media($1,$2)',[w,loser]);
 await login(owner,'service_role');await q("update studio_media_jobs set status='blocked' where id=$1",[winner]);
 await login(owner);assert.equal((await q('select studio_retry_media($1,$2) as job',[w,winner])).rows[0].job.status,'queued','blocked retry does not consume a second slot');
 await login(outsider);await denied('select studio_retry_media($1,$2)',[w,loser]);
 await login(owner,'anon');await denied('select studio_retry_media($1,$2)',[w,loser]);
 await login(owner,'service_role');await q("insert into workspace_members(workspace_id,user_id,role) values($1,$2,'editor')",[w,member]);
 await login(member);await denied('select studio_retry_media($1,$2)',[w,loser]);
 await login(owner,'service_role');await q('delete from workspace_members where user_id=$1',[owner]);
 await login(owner);await denied('select studio_retry_media($1,$2)',[w,loser]);
 await login(owner,'service_role');
 const bucket=(await q("select * from storage.buckets where id='workspace-media'")).rows[0];assert.equal(bucket.public,false);assert.equal(bucket.file_size_limit,100000000)
 console.log('PASS: migration compiles; exact 100 MB; idempotency; private teammate/restricted/removed-member RLS; forged completion denied; immutable original; single lease/recovery/attempt ceiling; atomic retry quota at 19/20 with simultaneous submissions; empty and oversize rejected.')
}finally{await db.close()}
