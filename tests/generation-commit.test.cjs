const fs=require('fs'),vm=require('vm'),crypto=require('node:crypto'),ts=require('typescript');
const source=fs.readFileSync(require('node:path').join(__dirname,'../lib/studio/generation.ts'),'utf8');
const w='11111111-1111-4111-8111-111111111111',u='22222222-2222-4222-8222-222222222222';
const job={id:'33333333-3333-4333-8333-333333333333',workspace_id:w,project_id:w,created_by:u,request:{projectId:w,sourceVersionId:null,kitVersionId:null,prompt:'test',count:1},model:'test/model',status:'running',attempts:1,lease_id:w,outputs:[],retained_version_ids:[]};
const removed=[];
const service={rpc:async()=>({data:[{...job}]}),storage:{from:()=>({upload:async()=>({}),remove:async(paths)=>{removed.push(...paths);return {}}})},from(table){let patch=null;const q={select(){return q},eq(){return q},update(p){patch=p;return q},async maybeSingle(){if(table==='workspace_members')return {data:{user_id:u}};if(table==='studio_projects')return {data:{id:w}};if(patch?.status==='succeeded'){Object.assign(job,patch);return {data:null,error:{message:'Response lost after commit'}}}return {data:null}},async single(){return {data:job}},then(resolve){return Promise.resolve({data:null}).then(resolve)}};return q}};
class StudioError extends Error{};
const env={SUPABASE_SERVICE_ROLE_KEY:'test',STUDIO_IMAGE_MODEL:'test/model',AI_GATEWAY_API_KEY:'test',NEXT_PUBLIC_SUPABASE_URL:'https://xljhxmyigtxhjtxxzuwk.supabase.co'};
const sandbox={exports:{},Buffer,URL,Date,AbortSignal,process:{env},require(n){if(n==='node:crypto')return crypto;if(n==='@supabase/supabase-js')return {createClient:()=>service};if(n==='./contracts')return {StudioError,uuidPattern:/^[a-f0-9-]{36}$/};if(n==='./server')return {databaseError:e=>e};if(n==='ai')return {gateway:{imageModel:()=>({})},generateImage:async()=>({images:[{uint8Array:Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0])}],usage:{}})};return {}}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
require('node:test')('completion commit followed by lost response preserves succeeded output bytes',async()=>{
 const result=await sandbox.exports.runGeneration();
 require('node:assert/strict').equal(result.status,'succeeded');
 require('node:assert/strict').equal(result.outputs.length,1);
 require('node:assert/strict').equal(removed.length,0);
});
