import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import {createRequire} from 'node:module'
import ts from 'typescript'
import {mediaModules} from './media-test-loader.mjs'
const require=createRequire(import.meta.url),m=mediaModules()
const w='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333',lease='44444444-4444-4444-8444-444444444444'
const sourcePath=`${w}/${user}/photo.png`,png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0])
function setup(options={}){
 const job={id,file_id:id,workspace_id:w,created_by:user,source_path:sourcePath,source_type:'image/png',source_size:png.length,source_sha256:null,status:'processing',attempts:1,lease_id:lease,lease_until:new Date(Date.now()+600000).toISOString()}
 let saved={...job},directory,uploads=[],removals=[],updates=[]
 const client={
  rpc:async()=>({data:[{...job}],error:null}),
  from(table){let changes,conditions=[];const query={select(){return query},update(data){changes=data;updates.push(data);return query},eq(k,v){conditions.push([k,v]);return query},gt(){return query},lt(){return query},in(){return query},async maybeSingle(){
   if(table==='workspace_files')return {data:options.removed?null:{url:`supabase-storage://workspace-media/${sourcePath}`,workspace_id:w,added_by:user},error:null}
   if(table==='workspace_members')return {data:options.removed?null:{user_id:user},error:null}
   if(changes){if(options.staleLease&&changes.status==='ready')return {data:null,error:null};saved={...saved,...changes};return {data:saved,error:null}}
   return {data:saved,error:null}
  }};return query},
  storage:{from(bucket){return {async list(){return {data:options.orphan?[{name:"55555555-5555-4555-8555-555555555555.jpg"}]:[],error:null}},async upload(p,bytes,config){uploads.push({bucket,p,config});return {error:options.uploadFail?{message:'test failure'}:null}},async remove(paths){removals.push({bucket,paths});return {error:null}}}}}
 }
 const mockedStorage={...m.storage,async downloadBounded(_client,_path,dest){directory=path.dirname(dest);fs.writeFileSync(dest,png);return 'a'.repeat(64)}}
 const mockedNative={...m.native,nativeAvailable:async()=>true,async convertNative(_input,_type,cwd){if(options.decodeFail)throw new m.validation.MediaError('INVALID_MEDIA','Unreadable media.');const output=path.join(cwd,'preview.jpg');fs.writeFileSync(output,Buffer.from([255,216,255,0]));return {output,type:'image/jpeg',metadata:{width:1,height:1},originalReady:false}},async inspectOutput(p){return {bytes:fs.readFileSync(p),size:4,sha256:'b'.repeat(64)}}}
 const sandbox={exports:{},process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://xljhxmyigtxhjtxxzuwk.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only-placeholder'}},Date,AbortSignal,fetch,Buffer,require(name){if(name==='@supabase/supabase-js')return {createClient:()=>client};if(name==='../media')return m.media;if(name==='./validation')return m.validation;if(name==='./storage')return mockedStorage;if(name==='./native'||name==='./portable-native')return mockedNative;return require(name)}}
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/studio/media/jobs.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox)
 return {run:()=>sandbox.exports.runMediaJob(),job,saved:()=>saved,uploads,removals,updates,directory:()=>directory}
}
test('job preserves original, uploads immutable private derivative, and clears matching lease only on completion',async()=>{
 const s=setup(),job=await s.run();assert.equal(job.status,'ready');assert.equal(job.source_sha256,'a'.repeat(64));assert.equal(job.lease_id,null);assert.equal(s.uploads[0].bucket,'studio-media-previews');assert.equal(s.uploads[0].config.upsert,false);assert.equal(s.uploads[0].p,`${w}/${id}/${lease}.jpg`);assert.equal(s.removals.length,0);assert.equal(fs.existsSync(s.directory()),false)
})
test('lost completion lease cannot publish derivative and cleans its own orphan without deleting originals',async()=>{
 const s=setup({staleLease:true});assert.equal(await s.run(),null);assert.equal(s.removals.length,1);assert.equal(s.removals[0].bucket,'studio-media-previews');assert.equal(fs.existsSync(s.directory()),false)
})
test('decode failure is persisted without deleting successfully uploaded original',async()=>{
 const s=setup({decodeFail:true}),job=await s.run();assert.equal(job.status,'failed');assert.equal(job.error_code,'INVALID_MEDIA');assert.equal(s.uploads.length,0);assert.equal(s.removals.length,0);assert.equal(fs.existsSync(s.directory()),false)
})
test('transient derivative storage failure requeues with bounded retry, preserving the original',async()=>{
 const s=setup({uploadFail:true}),job=await s.run();assert.equal(job.status,'queued');assert.equal(job.error_code,'STORAGE_UNAVAILABLE');assert.ok(Date.parse(job.next_attempt_at)>Date.now());assert.equal(s.removals.length,0)
})
test('removed uploader cannot start media processing with service privileges',async()=>{
 const s=setup({removed:true}),job=await s.run();assert.equal(job.status,'failed');assert.equal(job.error_code,'SOURCE_UNAVAILABLE');assert.equal(s.directory(),undefined);assert.equal(s.uploads.length,0)
})
test('reclaimed work removes only its abandoned derivative paths before converting',async()=>{
 const s=setup({orphan:true});await s.run();assert.equal(s.removals.length,1);assert.equal(s.removals[0].bucket,'studio-media-previews');assert.equal(s.removals[0].paths[0],`${w}/${id}/55555555-5555-4555-8555-555555555555.jpg`)
})
test.after(()=>m.cleanup())
