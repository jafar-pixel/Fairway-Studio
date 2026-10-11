import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as crypto from 'node:crypto'
import { createOpenAI } from '@ai-sdk/openai'
const source=fs.readFileSync(new URL('../lib/studio/generation.ts',import.meta.url),'utf8')
class StudioError extends Error{constructor(message,code,status=400){super(message);this.code=code;this.status=status}}
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const sandbox={exports:{},Buffer,URL,Date,AbortSignal,process:{env:{}},require(name){if(name==='node:crypto')return crypto;if(name==='./openai-ai')return {OPENAI_IMAGE_MODEL:'gpt-image-2.5-flare',openaiConfigured:()=>false};if(name==='./contracts')return {StudioError,uuidPattern};if(name==='./server')return {databaseError:error=>error};return {}}}
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox)
const f=sandbox.exports,w='11111111-1111-4111-8111-111111111111',u='22222222-2222-4222-8222-222222222222'
test('setup fails closed before pretending to enqueue',()=>{assert.equal(f.generationSetup().available,false);assert.throws(()=>f.requireGenerationSetup(),e=>e.code==='GENERATION_SETUP_REQUIRED')})
test('generation parser bounds count, prompt, target and immutable IDs',()=>{assert.equal(f.parseGenerationInput({projectId:w,prompt:'Create a bag',count:2}).count,2);for(const patch of [{count:3},{count:0},{sourceVersionId:'https://evil.test'},{prompt:''},{preserve:'x'.repeat(1001)}])assert.throws(()=>f.parseGenerationInput({projectId:w,prompt:'test',...patch}))})
test('source paths reject SSRF, cross-workspace paths and traversal',()=>{assert.equal(f.sourceStoragePath(`supabase-storage://workspace-media/${w}/${u}/original.png`,w),`${w}/${u}/original.png`);for(const url of ['https://evil.test/image.png','http://169.254.169.254/latest','supabase-storage://workspace-media/'+u+'/'+w+'/x.png','supabase-storage://workspace-media/'+w+'/'+u+'/../x.png','blob://workspace-assets/x'])assert.throws(()=>f.sourceStoragePath(url,w))})
test('file signatures must be supported image bytes',()=>{assert.equal(f.detectImageType(Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0])),'image/png');assert.equal(f.detectImageType(Buffer.from('<script>bad</script>')),null);assert.equal(f.detectImageType(new Uint8Array(10*1024*1024+1)),null)})
test('bounded retry schedule does not spin',()=>{assert.equal(f.retryDelay(1),15);assert.equal(f.retryDelay(2),30);assert.equal(f.retryDelay(3),60);assert.equal(f.retryDelay(40),300)})
test('provider completion uses lease and cancellation compare-and-set',()=>{const compact=source.replaceAll('"',"'").replace(/\s/g,'');assert.match(compact,/\.eq\('status','running'\)\.eq\('lease_id',job.lease_id\)/);assert.match(compact,/maxRetries:0/);assert.doesNotMatch(source,/fetch\(/)})
test('image-edit capability allows the exact audited OpenAI model only when capability is unknown',()=>{assert.equal(f.supportsImageEditRequest('gpt-image-2.5-flare',undefined,true),true);assert.equal(f.supportsImageEditRequest('gpt-image-2.5-flare',null,true),true);assert.equal(f.supportsImageEditRequest('openai/gpt-image-1',undefined,true),false);assert.equal(f.supportsImageEditRequest('unknown/vendor-model',undefined,true),false)})
test('explicit SDK image-edit support overrides the audited fallback',()=>{assert.equal(f.supportsImageEditRequest('unlisted/model',true,true),true);assert.equal(f.supportsImageEditRequest('gpt-image-2.5-flare',false,true),false)})
test('text-only requests bypass image-edit capability requirements at both gates',()=>{assert.equal(f.supportsImageEditRequest('unlisted/model',false,false),true);const compact=source.replace(/\s/g,'');assert.match(compact,/input\.sourceVersionId\?awaitstudioOpenAI\(\)\.image\(model\)\.supportsFileInputs:undefined/);assert.match(compact,/bytes\?awaitmodel\.supportsFileInputs:undefined/)})
test('installed OpenAI model explicitly supports reference edits',()=>{const model=createOpenAI({apiKey:'test'}).image('gpt-image-2.5-flare');assert.equal(model.supportsFileInputs,true);assert.equal(model.maxImagesPerCall,10);assert.equal(f.supportsImageEditRequest(model.modelId,model.supportsFileInputs,true),true)})

test("generation failures distinguish billing, auth, model access and transient errors without exposing provider data", () => {
  for (const [status, code, retryable] of [
    [401, "IMAGE_AUTH", false],
    [402, "IMAGE_BILLING", false],
    [403, "IMAGE_ACCESS", false],
    [404, "IMAGE_MODEL", false],
    [400, "IMAGE_REQUEST", false],
    [422, "IMAGE_REQUEST", false],
    [429, "IMAGE_RATE_LIMIT", true],
    [500, "IMAGE_TEMPORARY", true],
  ]) {
    const result = f.generationFailure({
      cause: {
        statusCode: status,
        message: "secret-key-and-private-prompt",
        responseBody: "secret",
      },
    });
    assert.match(result.message, new RegExp(code));
    assert.equal(result.retryable, retryable);
    assert.doesNotMatch(result.message, /secret|private-prompt/);
  }
  assert.match(
    f.generationFailure({
      statusCode: 403,
      responseBody: JSON.stringify({
        error: { code: "customer_verification_required", message: "secret" },
      }),
    }).message,
    /IMAGE_VERIFICATION/,
  );
  const circular = {};
  circular.cause = circular;
  assert.equal(f.generationFailure(circular).retryable, true);
  assert.equal(
    f.generationFailure(new StudioError("Source unavailable", "SOURCE", 422))
      .retryable,
    false,
  );
});

test('OpenAI exhausted credit is actionable and is not retried as a temporary rate limit', () => {
  for (const error of [
    { code: 'insufficient_quota' },
    { type: 'insufficient_quota' },
    { code: 'billing_hard_limit_reached' },
  ]) {
    const result = f.generationFailure({ statusCode: 429, responseBody: JSON.stringify({ error }) });
    assert.equal(result.retryable, false);
    assert.match(result.message, /IMAGE_BILLING/);
  }
});

test('reference images accept bounded immutable IDs and reject URLs, invalid IDs and excess context',()=>{
 const parsed=f.parseGenerationInput({projectId:w,prompt:'Apply fabric',referenceVersionIds:[u,u]});assert.equal(parsed.referenceVersionIds.length,1);
 for(const refs of [['https://evil.test/image.png'],[w,u,w,u],"not-an-array"])assert.throws(()=>f.parseGenerationInput({projectId:w,prompt:'test',referenceVersionIds:refs}));
});
test('visual references load only authorized immutable workspace images',async()=>{
 function client(scope='workspace',path=`supabase-storage://workspace-media/${w}/${u}/sample.png`){const tables={workspace_members:{user_id:u},studio_projects:{id:w},studio_versions:{id:u,file_id:u,source_url:path},workspace_files:{id:u,permission_scope:scope,added_by:'someone-else'}};return{from(table){return{select(){return this},eq(){return this},async maybeSingle(){return{data:tables[table],error:null}}}}};}
 const result=await f.validateContext(client(),w,u,{projectId:w,sourceVersionId:null,kitVersionId:null,referenceVersionIds:[u]});assert.equal(result.referencePaths[0],`${w}/${u}/sample.png`);
 await assert.rejects(()=>f.validateContext(client('private'),w,u,{projectId:w,referenceVersionIds:[u]}),e=>e.code==='FORBIDDEN');
 await assert.rejects(()=>f.validateContext(client('workspace','https://evil.test/reference.png'),w,u,{projectId:w,referenceVersionIds:[u]}),e=>e.code==='SOURCE_UNAVAILABLE');
});
