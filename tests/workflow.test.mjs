import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../lib/studio/workflow.ts',import.meta.url),'utf8');
class StudioError extends Error {constructor(message,code,status=400){super(message);this.code=code;this.status=status}}
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sandbox={exports:{},require(name){if(name==='./contracts')return {StudioError,uuidPattern};return {}}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
const {validateWorkflow,workflowOperations}=sandbox.exports;
const value={workspaceId:'11111111-1111-4111-8111-111111111111',requestId:'22222222-2222-4222-8222-222222222222',operation:'linkIdeaAsset',input:{}};
test('workflow accepts only the bounded operation contract',()=>{assert.equal(workflowOperations.length,8);for(const operation of workflowOperations)assert.equal(validateWorkflow({...value,operation}).operation,operation);});
test('workflow rejects malformed envelope and identifiers',()=>{for(const malformed of [null,[],{},'x',{...value,workspaceId:'other'},{...value,requestId:null},{...value,operation:'deleteWorkspace'},{...value,input:[]},{...value,input:null}])assert.throws(()=>validateWorkflow(malformed),e=>e.code==='VALIDATION');});
test('workflow route authenticates, bounds payload, rejects cross-origin writes and disables caching',()=>{const route=fs.readFileSync(new URL('../app/api/studio/workflow/route.ts',import.meta.url),'utf8');assert.match(route,/authorize\(input.workspaceId\)/);assert.match(route,/import \{ isSameOriginWrite \} from "@\/lib\/studio\/request-origin"/);assert.match(route,/if \(!isSameOriginWrite\(request\)\)/);assert.match(route,/raw.length > 20000/);assert.match(route,/private, no-store/);assert.doesNotMatch(route,/service_role|SERVICE_ROLE/);});
test('workflow reads advertise actual delivery support',()=>{assert.match(source,/email: false, push: false/);for(const name of ['ideaAssets','ideaProjects','notificationPreferences','supersessions','outcomes'])assert.ok(source.includes(name));});
