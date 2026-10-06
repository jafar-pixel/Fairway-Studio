import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const src=fs.readFileSync(new URL('../lib/studio/contracts.ts',import.meta.url),'utf8')
const out=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const sandbox={exports:{}};vm.runInNewContext(out,sandbox)
const {validateMutation}=sandbox.exports
const id='11111111-1111-4111-8111-111111111111'
const mutation=(operation,input)=>({workspaceId:id,requestId:id,operation,input})
test('valid createIdea and task updates accepted',()=>{assert.equal(validateMutation(mutation('createIdea',{title:'New idea'})).operation,'createIdea');assert.equal(validateMutation(mutation('updateTask',{id,expected_revision:0,status:'done'})).input.status,'done')})
test('invalid IDs, malformed input and unknown operations rejected',()=>{for(const value of [null,[],{}, {...mutation('createIdea',{title:'Title'}),workspaceId:'bad'},mutation('destroyEverything',{}),mutation('createIdea',[])]) assert.throws(()=>validateMutation(value))})
test('auth identity cannot be forged',()=>{for(const key of ['actor_id','author_id','reviewer_id','workspace_id','created_by']) assert.throws(()=>validateMutation(mutation('createIdea',{title:'Title',[key]:id})))})
test('stale-write protection requires revision on edits',()=>{for(const operation of ['updateTask','updateIdea','saveCanvas','updateReference','updateWorkspace']) assert.throws(()=>validateMutation(mutation(operation,{id})))})
test('review rating never substitutes for explicit disposition',()=>{assert.throws(()=>validateMutation(mutation('submitReview',{round_id:id,rating:5})));assert.equal(validateMutation(mutation('submitReview',{round_id:id,rating:5,disposition:'request_changes',comment:'Adjust spacing'})).input.disposition,'request_changes')})
test('bounded payloads and required titles',()=>{assert.throws(()=>validateMutation(mutation('createIdea',{title:' '})));assert.throws(()=>validateMutation(mutation('createIdea',{title:'x',body:'x'.repeat(100001)})))})
const sql=fs.readFileSync(new URL('../supabase/pending-schema.sql',import.meta.url),'utf8')
test('SQL includes transaction lock, idempotency payload equality, ownership and scoped read policies',()=>{for(const text of ['pg_advisory_xact_lock','old_request.input<>p_input','actor uuid := auth.uid()','reviewer_id=actor','enable row level security','studio_message_thread_workspace_fk']) { if(text==='reviewer_id=actor') assert.match(sql,/actor=any\(round_row.reviewers\)/);else assert.ok(sql.includes(text),text) }})
test('governance checks all assigned responses, veto and scope-specific evidence',()=>{for(const text of ['responses<>cardinality(round_row.reviewers)','blocking>0','approvals<round_row.threshold','scope=scope_name','review_policy=jsonb_build_object']) assert.ok(sql.includes(text),text)})
test('new domain tables cannot be written directly by authenticated clients',()=>{assert.ok(!sql.includes('grant insert'));assert.ok(sql.includes('revoke all on function studio_private.mutate(uuid,text,uuid,jsonb) from public,anon'));assert.ok(sql.includes('security invoker'))})
