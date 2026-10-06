import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {createRequire} from 'node:module'
import ts from 'typescript'
import {mediaModules} from './media-test-loader.mjs'
const require=createRequire(import.meta.url),m=mediaModules()
const w='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333',versionId='44444444-4444-4444-8444-444444444444'
const source=`${w}/${user}/clip.mov`,signedCalls=[]
function handler(options={}){
 signedCalls.length=0
 const file={workspace_id:w,added_by:user,permission_scope:'workspace',title:'Clip',url:`supabase-storage://workspace-media/${source}`,...options.file}
 const job=options.job??{status:'ready',source_path:source,preview_path:`${w}/${id}/${versionId}.mp4`,original_ready:false}
 const client={auth:{getUser:async()=>({data:{user:options.anonymous?null:{id:options.userId??user}}})},from(table){let filters=[];const query={select(){return query},eq(key,value){filters.push([key,value]);return query},async maybeSingle(){
  if(table==='workspace_members')return {data:options.notMember?null:{workspace_id:w},error:null}
  if(table==='workspace_files')return {data:options.missing?null:file,error:null}
  if(table==='studio_versions')return {data:{file_id:id,workspace_id:options.versionWorkspace??w,source_url:options.snapshot??file.url},error:null}
  if(table==='studio_media_jobs')return {data:filters.some(([key,value])=>key==='source_path'&&value!==job.source_path)?null:job,error:null}
  throw new Error(table)
 }};return query}}
 const sandbox={exports:{},Buffer,Response,Request,URL,require(name){
  if(name==='@/lib/studio/media/dispatch')return {scheduleMediaProcessing(){}};
  if(name==='@/lib/studio/media')return m.media
  if(name==='@/lib/studio/media/request')return m.request
  if(name==='@/lib/studio/media/validation')return m.validation
  if(name==='@/lib/studio/media/jobs')return {MEDIA_JOB_TABLE:'studio_media_jobs',mediaWorkerStatus:async()=>({automatic:false})}
  if(name==='@/lib/studio/media/storage')return {...m.storage,async signObject(_c,bucket,path,download){signedCalls.push({bucket,path,download});return 'https://xljhxmyigtxhjtxxzuwk.supabase.co/storage/v1/object/sign/private?token=test'}}
  if(name==='@/lib/supabase/server')return {createClient:async()=>client}
  if(name==='@vercel/blob')return {get:async()=>null}
  return require(name)
 }}
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../app/api/studio/media/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox)
 return async(query=`id=${id}`)=>{const nextUrl=new URL(`https://studio.test/api/studio/media?${query}`);return sandbox.exports.GET({nextUrl,headers:new Headers({range:'bytes=0-100'})})}
}
test('preview route signs only the authorized private derivative and preserves Range via 307',async()=>{
 const response=await handler()();assert.equal(response.status,307);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(signedCalls[0].bucket,'studio-media-previews');assert.equal(signedCalls[0].download,undefined)
})
test('original download retains immutable canonical source and attachment filename',async()=>{
 const response=await handler()(`id=${id}&variant=original&download=1`);assert.equal(response.status,307);assert.equal(signedCalls[0].bucket,'workspace-media');assert.equal(signedCalls[0].path,source);assert.equal(signedCalls[0].download,'Clip.mov')
})
test('unauthenticated, outsider, restricted teammate and missing file cannot obtain a signed URL',async()=>{
 for(const options of [{anonymous:true},{notMember:true},{file:{permission_scope:'restricted'},userId:versionId},{missing:true}]){const response=await handler(options)();assert.ok([401,404].includes(response.status));assert.equal(signedCalls.length,0)}
})
test('processing and failed files do not pretend to have a playable preview',async()=>{
 for(const status of ['queued','processing','failed','blocked']){const response=await handler({job:{status,source_path:source,error_code:'TEST',error_message:'Pending'}})();assert.equal(response.status,status==='failed'?422:409);assert.equal(signedCalls.length,0)}
})
test('version source is exact and cross-workspace snapshots cannot sign current preview',async()=>{
 const mismatch=await handler({versionWorkspace:versionId})(`versionId=${versionId}`);assert.equal(mismatch.status,404);assert.equal(signedCalls.length,0)
 const snapshot=await handler({snapshot:`supabase-storage://workspace-media/${w}/${user}/old.mov`})(`versionId=${versionId}`);assert.equal(snapshot.status,409);assert.equal(signedCalls.length,0)
})
test.after(()=>m.cleanup())
