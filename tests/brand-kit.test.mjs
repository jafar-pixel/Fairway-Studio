import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const source = fs.readFileSync(new URL('../components/studio/brand-kit.tsx',import.meta.url),'utf8')
const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText
const context={exports:{},require:()=>({}),Blob,Uint8Array,DataView,TextEncoder,Date,Map,Set}
vm.runInNewContext(js,context)
const {resolveKitComponent,ownedKitFiles,kitManifest,kitDifference,kitZip}=context.exports
function fixture(){return {workspace:{id:'w'},decisions:[{id:'d-name',workspace_id:'w',scope:'name',outcome:'approved',version_id:'v-name'},{id:'d-logo',workspace_id:'w',scope:'wordmark',outcome:'approved',version_id:'v-logo'}],versions:[{id:'v-name',workspace_id:'w',title:'New Name'},{id:'v-logo',workspace_id:'w',title:'Logo',file_id:'f-logo',source_url:'supabase-storage://workspace-media/w/file.png'}],files:[{id:'f-logo',workspace_id:'w',provider:'other',permission_scope:'workspace',url:'https://changed-later.test/image.png',title:'Logo PNG'}]}}
const kit={id:'k',title:'Identity',components:{name:'d-name',wordmark:'d-logo'},usage_note:'For approved work only'}
test('a name approval never implies a logo or palette approval',()=>{const data=fixture();assert.equal(resolveKitComponent(data,{components:{name:'d-name'}},'name').version.title,'New Name');assert.equal(resolveKitComponent(data,{components:{name:'d-name'}},'palette').decision,undefined);assert.equal(resolveKitComponent(data,{components:{wordmark:'d-name'}},'wordmark').decision,undefined)})
test('exports include approved linked internal snapshots, never arbitrary provenance or references',()=>{const data=fixture();assert.equal(ownedKitFiles(data,kit).length,1);data.versions[1].file_id=undefined;data.versions[1].provenance={file_id:'f-logo'};assert.equal(ownedKitFiles(data,kit).length,0);data.versions[1].file_id='f-logo';data.versions[1].source_url='https://pinterest.com/reference';assert.equal(ownedKitFiles(data,kit).length,0)})
test('wrong account workspace and non-approved decisions cannot resolve into a kit',()=>{const data=fixture();data.decisions[1].outcome='rejected';assert.equal(ownedKitFiles(data,kit).length,0);data.decisions[1].outcome='approved';data.versions[1].workspace_id='other';assert.equal(ownedKitFiles(data,kit).length,0)})
test('manifest preserves decisions/version IDs without private URLs; diff compares immutable decision IDs',()=>{const data=fixture();const manifest=kitManifest(data,kit);assert.equal(manifest.components[1].version_id,'v-logo');assert.equal(JSON.stringify(manifest).includes('supabase-storage'),false);assert.equal(kitDifference(kit,{...kit,components:{...kit.components,palette:'d-palette'}})[0].scope,'palette')})
test('zip contains UTF-8 filenames, content and central directory with correct signatures',async()=>{const bytes=new Uint8Array(await kitZip([{name:'manifest.json',bytes:new TextEncoder().encode('{"kit":"v1"}')}]).arrayBuffer());const view=new DataView(bytes.buffer);assert.equal(view.getUint32(0,true),0x04034b50);assert.equal(view.getUint32(bytes.length-22,true),0x06054b50);assert.equal(view.getUint16(bytes.length-14,true),1);assert.equal(new TextDecoder().decode(bytes).includes('{"kit":"v1"}'),true)})
