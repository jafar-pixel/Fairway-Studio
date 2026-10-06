import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const src=fs.readFileSync(new URL('../lib/studio/collection-helpers.ts',import.meta.url),'utf8')
const out=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const sandbox={exports:{},URL,URLSearchParams,Intl,Date};vm.runInNewContext(out,sandbox)
const {canonicalPinUrl,safeExternalUrl,normalizedTags,matchesCollectionQuery,isTaskOverdue,taskStatus}=sandbox.exports

test('canonical Pins deduplicate tracking variants',()=>{
 assert.equal(canonicalPinUrl('https://pinterest.com/pin/123456/?utm_source=x'),'https://www.pinterest.com/pin/123456/')
 assert.equal(canonicalPinUrl(' https://www.pinterest.com/pin/123456 '),'https://www.pinterest.com/pin/123456/')
})
test('Pin validation rejects deceptive hosts, credentials, redirects, boards and short links',()=>{
 for(const url of ['http://pinterest.com/pin/123/','https://pinterest.com.evil.test/pin/123/','https://user:pass@pinterest.com/pin/123/','https://pin.it/123','https://pinterest.com/user/board/','https://pinterest.com/pin/notnumeric/','javascript:alert(1)','https://pinterest.com:444/pin/123/']) assert.throws(()=>canonicalPinUrl(url),url)
})
test('safe source links exclude executable schemes and credential-bearing URLs',()=>{
 assert.equal(safeExternalUrl('javascript:alert(1)'),undefined)
 assert.equal(safeExternalUrl('https://user:pass@example.com'),undefined)
 assert.equal(safeExternalUrl('https://example.com/file'),'https://example.com/file')
})
test('tags normalized and deduplicated',()=>assert.equal(JSON.stringify(normalizedTags(' Burgundy, burgundy, Golf bag, ,LEATHER')),JSON.stringify(['burgundy','golf bag','leather'])))
test('queries match all words across title and notes',()=>{
 assert.equal(matchesCollectionQuery({title:'Golf bag',note:'Burgundy leather'},'golf leather'),true)
 assert.equal(matchesCollectionQuery({title:'Golf bag'},'golf blue'),false)
})
test('overdue dates use supplied workspace date and exclude completed tasks',()=>{
 assert.equal(isTaskOverdue({due_date:'2026-10-01',status:'open'},'2026-10-02'),true)
 assert.equal(isTaskOverdue({due_date:'2026-10-02',status:'open'},'2026-10-02'),false)
 assert.equal(isTaskOverdue({due_date:'2026-10-01',status:'done'},'2026-10-02'),false)
 assert.equal(isTaskOverdue({status:'open'},'2026-10-02'),false)
 assert.equal(taskStatus('to_do'),'open')
})

test('deep links resolve exact query or path item without cross-section leakage',()=>{
 const {collectionItemId}=sandbox.exports
 assert.equal(collectionItemId('/w/123/ideas/idea-a','','ideas'),'idea-a')
 assert.equal(collectionItemId('/w/123/tasks','item=task-b&tasks_view=list','tasks'),'task-b')
 assert.equal(collectionItemId('/demo/ideas','','ideas'),'')
 assert.equal(collectionItemId('/demo/tasks/task-a','','ideas'),'')
})
test('routed detail and close preserve collection filters and remove old path IDs',()=>{
 const {collectionDetailUrl}=sandbox.exports
 assert.equal(collectionDetailUrl('https://studio.test/demo/ideas/old?ideas_tag=leather','ideas','new'),'https://studio.test/demo/ideas?ideas_tag=leather&item=new')
 assert.equal(collectionDetailUrl('https://studio.test/w/123/tasks/task-a?tasks_view=list&item=task-a','tasks'),'https://studio.test/w/123/tasks?tasks_view=list')
})

test('idea asset choices preserve source type and canonical IDs without copying rows',()=>{
 const reference={id:'same-id',title:'Source Pin',url:'https://www.pinterest.com/pin/123/'}
 const file={id:'same-id',title:'Owned image',permission_scope:'workspace',added_by:'founder-a'}
 const choices=sandbox.exports.ideaAssetChoices({references:[reference,reference],files:[file],versions:[{id:'version-1',version_number:2}]})
 assert.equal(choices.length,3)
 assert.equal(choices[0].key,'reference_id:same-id')
 assert.equal(choices[1].key,'file_id:same-id')
 assert.equal(choices[0].row,reference)
 assert.equal(choices[1].row,file)
 assert.equal(choices[2].target,'version_id')
})
test('idea asset picker excludes archived and non-workspace-shared files',()=>{
 const choices=sandbox.exports.ideaAssetChoices({references:[{id:'old',archived_at:'2026-10-02'}],files:[{id:'private',permission_scope:'private'},{id:'restricted',permission_scope:'restricted'},{id:'shared',permission_scope:'workspace'}]})
 assert.equal(choices.length,1)
 assert.equal(choices[0].row.id,'shared')
})
test('idea relationship keys require exactly one canonical target',()=>{
 const key=sandbox.exports.ideaAssetLinkKey
 assert.equal(key({idea_id:'idea',reference_id:'pin'}),'reference_id:pin')
 assert.equal(key({idea_id:'idea',file_id:'file'}),'file_id:file')
 assert.equal(key({idea_id:'idea',version_id:'v3'}),'version_id:v3')
 assert.equal(key({idea_id:'idea'}),'')
 assert.equal(key({file_id:'file',reference_id:'pin'}),'')
})
