// Local isolated Postgres verification, not a remote mutation.
import fs from 'node:fs'
import assert from 'node:assert/strict'
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite')
const db=new PGlite(),root=new URL('../',import.meta.url).pathname
const existing=fs.readFileSync(root+'tests/studio-sql-runtime.mjs','utf8')
const baseline=existing.slice(existing.indexOf('const baseline=`')+16,existing.indexOf('\n`\nawait db.exec(baseline)'))
await db.exec(baseline)
await db.exec(`create role service_role bypassrls; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`)
await db.exec(fs.readFileSync(root+'supabase/pending-schema.sql','utf8'))
await db.exec(fs.readFileSync(root+'supabase/pending-ai-jobs.sql','utf8'))
await db.exec(fs.readFileSync(root+'supabase/pending-ai-jobs.sql','utf8'))
const w='11111111-1111-4111-8111-111111111111',u='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',p='44444444-4444-4444-8444-444444444444',key='55555555-5555-4555-8555-555555555555'
await db.exec(`insert into auth.users(id) values('${u}'),('${other}');insert into workspaces(id,name,created_by) values('${w}','test','${u}');insert into workspace_members(workspace_id,user_id) values('${w}','${u}'),('${w}','${other}');insert into studio_projects(id,workspace_id,title,created_by) values('${p}','${w}','test','${u}');`)
const enqueue=()=>db.query(`select (public.studio_enqueue_generation('${w}','${p}','${u}','${key}','hash','{"prompt":"test"}','configured/model',2)).*`)
const {rows:[job]}=await enqueue();assert.equal(job.status,'queued');assert.equal((await enqueue()).rows[0].id,job.id)
await assert.rejects(db.query(`select public.studio_enqueue_generation('${w}','${p}','${u}','${key}','different','{}','model',2)`))
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${other}',false)`)
assert.equal((await db.query(`select * from studio_generation_jobs`)).rows.length,0)
await assert.rejects(db.query(`select * from studio_claim_generation(null)`))
await assert.rejects(db.query(`update studio_generation_jobs set status='succeeded'`))
await db.exec(`reset role`)
let claim=(await db.query(`select * from studio_claim_generation('${job.id}')`)).rows[0];assert.equal(claim.attempts,1)
assert.equal((await db.query(`select * from studio_claim_generation('${job.id}')`)).rows.length,0)
const oldLease=claim.lease_id
await db.exec(`update studio_generation_jobs set lease_until=now()-interval '1 second' where id='${job.id}'`)
claim=(await db.query(`select * from studio_claim_generation('${job.id}')`)).rows[0];assert.equal(claim.attempts,2);assert.notEqual(claim.lease_id,oldLease)
assert.equal((await db.query(`update studio_generation_jobs set status='succeeded' where id='${job.id}' and lease_id='${oldLease}' returning id`)).rows.length,0)
await db.exec(`update studio_generation_jobs set status='cancelled',lease_id=null where id='${job.id}'`)
assert.equal((await db.query(`select * from studio_claim_generation('${job.id}')`)).rows.length,0)
// Retention publishes exact immutable output IDs once and never creates canvas nodes.
const fileId='66666666-6666-4666-8666-666666666666',versionId='77777777-7777-4777-8777-777777777777'
await db.exec(`update studio_generation_jobs set status='succeeded',outputs='[{"fileId":"${fileId}","versionId":"${versionId}","retainedPath":"${w}/${u}/generated.png","sha256":"verified-hash"}]' where id='${job.id}'; set role service_role;`)
const retained=(await db.query(`select studio_retain_generation('${job.id}','${u}') as ids`)).rows[0].ids
assert.equal(retained[0],versionId)
assert.equal((await db.query(`select studio_retain_generation('${job.id}','${u}') as ids`)).rows[0].ids[0],versionId)
await assert.rejects(db.query(`select studio_retain_generation('${job.id}','${other}')`))
await db.exec('reset role')
assert.equal((await db.query(`select * from studio_versions where id='${versionId}'`)).rows[0].provenance.origin_job_id,job.id)
assert.equal((await db.query('select * from studio_canvas_nodes')).rows.length,0)
for(let i=1;i<=3;i++)await db.query(`select studio_enqueue_generation('${w}','${p}','${u}','00000000-0000-4000-8000-00000000000${i}','hash','{}','model',2)`)
await assert.rejects(db.query(`select studio_enqueue_generation('${w}','${p}','${u}','00000000-0000-4000-8000-000000000004','hash','{}','model',1)`))
// Retry leases already consumed 4 of the 8 provider-image reservations.
await db.exec('set role service_role')
for(let i=0;i<2;i++)assert.equal((await db.query('select * from studio_claim_generation(null)')).rows.length,1)
assert.equal((await db.query('select * from studio_claim_generation(null)')).rows.length,0)
await db.exec('reset role')
assert.equal(Number((await db.query('select sum(image_count) as used from studio_generation_attempts')).rows[0].used),8)
assert.equal((await db.query("select * from studio_generation_jobs where error like 'Daily provider%' and next_attempt_at>now()")).rows.length,1)
console.log('Generation SQL: migration, idempotency collision, creator RLS, forbidden writes, lease expiry, stale completion, cancellation, exactly-once retain, provenance, no auto-canvas insertion and request/attempt quotas passed.')
await db.close()
