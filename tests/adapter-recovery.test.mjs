import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function load(file,mocks={},extras={}){const sandbox={exports:{},Buffer,process,Date,AbortSignal,fetch,setTimeout,require(name){return name in mocks?mocks[name]:require(name)},...extras};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);return sandbox.exports;}
const media=load('lib/studio/media.ts'),validation=load('lib/studio/media/validation.ts',{'../media':media});
const jobs=load('lib/studio/media/jobs.ts',{'@supabase/supabase-js':{createClient(){throw new Error('unexpected database access')}},'../media':media,'./validation':validation,'./storage':{},'./portable-native':{}});
const id='11111111-1111-4111-8111-111111111111';
test('UI exposes committed/unclaimed and expired-lease crash windows as recoverable',()=>{
 const base={id,status:'queued',attempts:0,updated_at:new Date(Date.now()-601000).toISOString()};assert.equal(jobs.clientMediaJob(base).status,'blocked');assert.equal(jobs.clientMediaJob(base).error_code,'RECOVERY_REQUIRED');
 const active={...base,status:'processing',attempts:1,lease_until:new Date(Date.now()+60000).toISOString()};assert.equal(jobs.clientMediaJob(active),active);
 assert.equal(jobs.clientMediaJob({...active,lease_until:new Date(Date.now()-1000).toISOString()}).status,'blocked');assert.equal(jobs.clientMediaJob({...active,attempts:3,lease_until:new Date(Date.now()-1000).toISOString()}).status,'failed');
 const fresh={...base,updated_at:new Date().toISOString()};assert.equal(jobs.clientMediaJob(fresh),fresh);const ready={...base,status:'ready'};assert.equal(jobs.clientMediaJob(ready),ready);
})
test('after-response transient requeues become blocked with compare-and-swap, never orphaned queued',async()=>{
 const callbacks=[],updates=[],filters=[];const query={eq(k,v){filters.push([k,v]);return query},then(resolve){resolve({error:null})}};
 const dispatch=load('lib/studio/media/dispatch.ts',{'next/server':{after(cb){callbacks.push(cb)}},'../media':media,'./jobs':{MEDIA_JOB_TABLE:'studio_media_jobs',runMediaJob:async()=>({status:'queued',attempts:1}),mediaService:()=>({from(){return {update(v){updates.push(v);return query}}}})}});
 dispatch.scheduleMediaProcessing([id]);assert.equal(callbacks.length,1);assert.equal(updates.length,0);await callbacks[0]();assert.equal(updates[0].status,'blocked');assert.equal(updates[0].error_code,'RECOVERY_REQUIRED');assert.ok(filters.some(([k,v])=>k==='status'&&v==='queued'));assert.ok(filters.some(([k,v])=>k==='attempts'&&v===1));
})
test('failure before claim reports setup recovery without deleting original or masking ready state',async()=>{
 const callbacks=[],updates=[],filters=[];const query={eq(k,v){filters.push([k,v]);return query},then(resolve){resolve({error:null})}};
 const dispatch=load('lib/studio/media/dispatch.ts',{'next/server':{after(cb){callbacks.push(cb)}},'../media':media,'./jobs':{MEDIA_JOB_TABLE:'studio_media_jobs',runMediaJob:async()=>{throw new Error('unavailable')},mediaService:()=>({from(){return {update(v){updates.push(v);return query}}}})}});
 dispatch.scheduleMediaProcessing([id]);await callbacks[0]();assert.equal(updates[0].status,'blocked');assert.equal(updates[0].error_code,'WORKER_SETUP_REQUIRED');assert.ok(filters.some(([k,v])=>k==='status'&&v==='queued'));
})
test('retries use the atomic authorized RPC, never a service-role count/update bypass',()=>{
 const source=fs.readFileSync('lib/studio/media/jobs.ts','utf8').split('export async function retryMediaJob')[1].split('/** UI classification')[0];assert.match(source,/client\.rpc\("studio_retry_media"/);assert.doesNotMatch(source,/mediaService\(/);assert.doesNotMatch(source,/\.update\(/);
 const sql=fs.readFileSync('supabase/pending-media.sql','utf8');assert.equal(sql.split("pg_advisory_xact_lock(hashtextextended('studio-media-user:'").length-1,2);assert.equal(sql.split('for key share;').length-1,2);assert.match(sql,/j\.status='queued' and j\.updated_at<now\(\)-interval '10 minutes'/);
})

test('private derivative objects use zero cache lifetime',()=>{assert.match(fs.readFileSync('lib/studio/media/jobs.ts','utf8'),/cacheControl:"0"/);})
