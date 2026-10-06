import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createHash } from 'node:crypto';
const root=new URL('../',import.meta.url);
const content=JSON.parse(fs.readFileSync(new URL('lib/studio/mockup-content.json',root),'utf8'));
const hashes=JSON.parse(fs.readFileSync(new URL('lib/studio/mockup-asset-hashes.json',root),'utf8'));
function moduleAt(name,deps={}) {
 const source=fs.readFileSync(new URL(`lib/studio/${name}.ts`,root),'utf8');
 const context={exports:{},Set,Map,structuredClone,crypto:globalThis.crypto,require(n){if(n==='./mockup-content.json')return content;if(n==='./mockup-asset-hashes.json')return hashes;if(deps[n])return deps[n];throw Error(`Unexpected import ${n}`)}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);return context.exports;
}
const adapter=moduleAt('imported-content');
const demo=moduleAt('demo',{'./imported-content':adapter});
const asset=Object.keys(hashes)[0];
const p={import_batch:content.import_batch,mockup_import:true,media_origin:'bundled_exploratory',import_asset_path:asset,asset_sha256:hashes[asset]};
test('only exact allowlisted paths with the reviewed hash can become starter previews',()=>{
 assert.equal(adapter.resolveImportedAsset(p),asset);
 for(const extra of [{import_asset_path:'https://evil.test/pixel'},{import_asset_path:'/mockup-assets/../secret.png'},{import_asset_path:'/api/studio/media?secret=1'},{asset_sha256:'f'.repeat(64)},{import_batch:'unrelated'},{mockup_import:false},{media_origin:'upload'}])assert.equal(adapter.resolveImportedAsset({...p,...extra}),null);
});
test('bundled source manifest is complete and matches actual PNG bytes',()=>{
 const expected=new Set(content.versions.map(v=>v.asset).filter(Boolean));assert.equal(expected.size,19);
 for(const path of expected){assert.ok(hashes[path]);const bytes=fs.readFileSync(new URL(`public${path}`,root));assert.equal(createHash('sha256').update(bytes).digest('hex'),hashes[path]);assert.equal(bytes.subarray(1,4).toString(),'PNG');}
});
test('demo includes all six ideas, four projects, six board tasks and pending reviews only',()=>{
 const d=demo.createDemoData();assert.equal(d.ideas.length,6);assert.equal(d.projects.length,4);assert.equal(d.tasks.length,12);assert.equal(d.versions.length,24);assert.equal(d.nodes.length,13);assert.equal(d.reviews.length,0);assert.equal(d.decisions.length,0);assert.equal(d.kits.length,0);assert.equal(d.tasks.filter(t=>t.surface==='board' && t.status==='open').length,3);assert.equal(d.tasks.filter(t=>t.surface==='board' && t.status==='in_progress').length,2);assert.equal(d.tasks.filter(t=>t.surface==='board' && t.status==='done').length,1);
 assert.ok(d.ideas.every(i=>i.cover_url?.startsWith('/mockup-assets/')));assert.ok(d.projects.every(i=>i.cover_url?.startsWith('/mockup-assets/')));assert.ok(d.rounds.every(r=>r.reviewers.length===3 && r.status==='open'));assert.equal(d.versions.filter(v=>v.provenance.library_kind).length,6);
});
test('hydration never mutates records or creates remote authors, approvals, files or storage handles',()=>{
 const input={versions:[{id:'v',project_id:'p',source_url:null,provenance:{...p,project_cover:true,task_ids:['t']}}],projects:[{id:'p',title:'Project'}],tasks:[{id:'t',title:'Task',project_id:'p',details:'Work\n\n[Fairway starter] Source'}],ideas:[],members:[{user_id:'real'}],reviews:[],files:[],decisions:[]};
 const before=JSON.stringify(input),after=adapter.hydrateImportedContent(input);assert.equal(JSON.stringify(input),before);assert.equal(after.versions[0].source_url,null);assert.equal(after.versions[0].requires_upload_for_generation,true);assert.equal(after.tasks[0].details,'Work');assert.equal(after.tasks[0].attachment_ids[0],'v');assert.equal(after.members.length,1);assert.equal(after.files.length,0);assert.equal(after.reviews.length,0);assert.equal(after.decisions.length,0);
});
test('prepared SQL never updates, deletes, grants, creates users, or inserts approvals',()=>{
 const sql=fs.readFileSync(new URL('supabase/mockup-content-import.sql',root),'utf8');assert.doesNotMatch(sql,/\b(update|delete|grant|revoke|alter)\s+(?:public\.|auth\.|table)/i);assert.doesNotMatch(sql,/insert into (?:auth\.|public\.studio_(?:reviews|review_rounds|decisions|kits)\b|public\.workspace_(?:members|invites)\b)/i);assert.match(sql,/role='owner'/);assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/Example response \(not sent by Arlin\)/);assert.match(sql,/'open',null,project/);
});

test('private originals render only as version-bound authenticated endpoints and never enter demo',()=>{
 const originalPath=Object.keys(hashes).find(k=>k.startsWith('/original-assets/'));
 const provenance={...p,media_origin:'bundled_original',import_asset_path:originalPath,asset_sha256:hashes[originalPath]};
 const id='11111111-1111-4111-8111-111111111111',workspace='22222222-2222-4222-8222-222222222222';
 assert.equal(adapter.resolveImportedAsset(provenance),null);assert.equal(adapter.resolveImportedAsset(provenance,'demo','demo'),null);
 assert.equal(adapter.resolveImportedAsset(provenance,id,workspace),`/api/studio/starter-asset?versionId=${id}`);
 assert.equal(adapter.resolveImportedAsset({...provenance,import_asset_path:'/original-assets/../../secret.png'},id,workspace),null);
 const d=adapter.hydrateImportedContent({workspace:{id:workspace},versions:[{id,workspace_id:workspace,provenance}]});
 assert.equal(d.versions[0].source_kind,'original');assert.equal(d.versions[0].image_url,`/api/studio/starter-asset?versionId=${id}`);
 assert.equal(adapter.hydrateImportedContent({workspace:{id:'demo'},versions:[{id,provenance}]}).versions.length,0);
 assert.ok(!JSON.stringify(content).includes('library_file_id'));
});
test('canonical file preview and library dedupe use only an actual saved file/version node link',()=>{
 const provenance={...p,library_kind:'reference'};
 const d=adapter.hydrateImportedContent({versions:[{id:'v',project_id:'p',provenance}],files:[{id:'f',title:'Editable canonical title',url:'https://example.org/source'}],nodes:[{id:'n',version_id:'v',file_id:'f'}]});
 assert.equal(d.versions[0].canonical_file_id,'f');assert.equal(d.files[0].concept_version_id,'v');assert.equal(d.files[0].title,'Editable canonical title');assert.equal(d.files[0].image_url,asset);
 const absent=adapter.hydrateImportedContent({versions:[{id:'v',provenance}],files:[],nodes:[{id:'n',version_id:'v',file_id:'private-file'}]});assert.equal(absent.versions[0].canonical_file_id,undefined);
});

test('starter task media survives title and details edits, and hydration is idempotent',()=>{
 const input={versions:[{id:'v',project_id:'p',provenance:{...p,task_ids:['t']}}],tasks:[{id:'t',project_id:'p',title:'User renamed task',details:'User rewrote every word.'}],home_actions:[{id:'t'}]};
 const once=adapter.hydrateImportedContent(input),twice=adapter.hydrateImportedContent(once);
 assert.equal(once.tasks[0].title,'User renamed task');assert.equal(once.tasks[0].details,'User rewrote every word.');assert.equal(once.tasks[0].cover_url,asset);assert.equal(JSON.stringify(once.tasks[0].attachment_ids),JSON.stringify(['v']));assert.deepEqual(twice.tasks,once.tasks);assert.equal(once.home_actions[0],once.tasks[0]);
});

test('a changed or missing starter hash clears a previously hydrated preview',()=>{
 const data={versions:[{id:'v',image_url:asset,preview_url:asset,provenance:{...p,asset_sha256:'0'.repeat(64)}}]};
 const hydrated=adapter.hydrateImportedContent(data);assert.equal(hydrated.versions[0].image_url,null);assert.equal(hydrated.versions[0].preview_url,null);assert.equal(hydrated.versions[0].import_asset_unavailable,true);
});
