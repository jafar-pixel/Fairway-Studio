import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
const workspace='00000000-0000-4000-8000-000000000001',chatId='00000000-0000-4000-8000-000000000002',user='00000000-0000-4000-8000-000000000003',requestId='00000000-0000-4000-8000-000000000004';
class StudioError extends Error {constructor(message,code,status=400){super(message);this.code=code;this.status=status;}}
function load({visible=true,prior=null,sameOrigin=true}={}) {
  let serviceCalls=0,providerCalls=0;
  const client={from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:visible?{id:chatId,workspace_id:workspace,created_by:user,visibility:'workspace'}:null,error:null})};}};
  const service={from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:prior,error:null})};}};
  const deps={
    'node:crypto':crypto,
    '@/lib/studio/openai-ai':{OPENAI_TEXT_MODEL:'gpt-5.4-mini',openaiConfigured:()=>true,studioOpenAI:()=>()=>({})},
    ai:{generateText:()=>{providerCalls++;throw Error('Unexpected provider call');},gateway:()=>({})},
    '@/lib/studio/server':{authorize:async()=>({client,user:{id:user}}),databaseError:e=>e},
    '@/lib/studio/contracts':{StudioError,uuidPattern:/^[0-9a-f-]{36}$/i},
    '@/lib/studio/request-origin':{isSameOriginWrite:()=>sameOrigin},
    '@/lib/studio/creative-chat':{validateCreativePrompt:s=>s,creativeHistory:()=>[]},
    '@/lib/studio/generation':{generationService:()=>{serviceCalls++;return service;},createGeneration:()=>{providerCalls++;throw Error('Unexpected generation');}},
  };
  const context={exports:{},Response,Request,URL,Date,AbortSignal,process:{env:{STUDIO_TEXT_MODEL:'openai/gpt-5.4-mini'}},require:name=>{if(!(name in deps))throw Error(name);return deps[name];}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../app/api/studio/creative-chat/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  return {...context.exports,counts:()=>({serviceCalls,providerCalls})};
}
const send=(changes={})=>new Request('https://studio.example/api/studio/creative-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'send',workspaceId:workspace,chatId,requestId,prompt:'Burgundy trim',mode:'chat',consent:true,...changes})});
test('cross-origin writes are rejected before database or provider access',async()=>{
  const route=load({sameOrigin:false});assert.equal((await route.POST(send())).status,403);assert.deepEqual(route.counts(),{serviceCalls:0,providerCalls:0});
});
test('private/inaccessible conversations cannot be used to fetch shared image bytes',async()=>{
  const route=load({visible:false});const result=await route.GET(new Request(`https://studio.example/api/studio/creative-chat?workspaceId=${workspace}&chatId=${chatId}&jobId=${requestId}&output=0`));
  assert.equal(result.status,404);assert.deepEqual(route.counts(),{serviceCalls:0,providerCalls:0});
});
test('AI consent and a selected project are required before image jobs are written',async()=>{
  for(const changes of [{mode:'image',consent:false},{mode:'image',consent:true}]){
    const route=load();assert.equal((await route.POST(send(changes))).status,400);assert.deepEqual(route.counts(),{serviceCalls:0,providerCalls:0});
  }
});
test('same request ID replays a saved turn without charging the provider again',async()=>{
  const hash=crypto.createHash('sha256').update(JSON.stringify({prompt:'Burgundy trim',mode:'chat',projectId:null,sourceVersionId:null})).digest('hex');
  const prior={id:requestId,chat_id:chatId,author_id:user,request_hash:hash,status:'complete',answer:'Saved answer'};
  const route=load({prior});const result=await route.POST(send());assert.equal(result.status,200);assert.equal((await result.json()).turn.answer,'Saved answer');assert.equal(route.counts().providerCalls,0);
});
test('a request ID belonging to another author is rejected without disclosing its answer',async()=>{
  const route=load({prior:{id:requestId,chat_id:chatId,author_id:'other',answer:'Private answer'}});const result=await route.POST(send());assert.equal(result.status,409);assert.doesNotMatch(await result.text(),/Private answer/);assert.equal(route.counts().providerCalls,0);
});
