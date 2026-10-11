import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
function harness({fail=false}={}){
  let cursor=0,refCursor=0;const slots=[],refs=[],items=[],requests=[],saved=[];
  const canvas={toBlob:fn=>fn(new Blob(['edited PNG'],{type:'image/png'}))};
  const react={useEffect(){},useRef(initial){const i=refCursor++;if(!(i in refs))refs[i]={current:i===1?canvas:initial};return refs[i];},useState(initial){const i=cursor++;if(!(i in slots))slots[i]=i===0?true:initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}];}};
  const uploads={items,addFiles(files){items.push(...files);},async uploadAll({onRegistered}){await onRegistered({id:'edited-file'});return {complete:true};}};
  const deps={react,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},'./media-upload':{useMediaUploads:()=>uploads}};
  const ctx={exports:{},crypto:{randomUUID},Blob,File:class {constructor(parts,name,options){this.name=name;this.type=options.type;}},fetch:async(url,options)=>{requests.push(JSON.parse(options.body));return {ok:!fail,json:async()=>fail?{error:'Save blocked'}:{data:{id:'edited-version'}}};},require:n=>deps[n]};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../components/studio/manual-image-editor.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,ctx);
  const render=()=>{cursor=0;refCursor=0;return ctx.exports.ManualImageEditor({workspaceId:'workspace',userId:'owner',projectId:'project',versionId:'original-version',onClose(){},onSaved:id=>saved.push(id)});};
  function nodes(t){if(!t||typeof t!=='object')return [];if(Array.isArray(t))return t.flatMap(nodes);return [t,...nodes(t.props?.children)];}
  function text(t){if(t==null)return '';if(typeof t!=='object')return String(t);if(Array.isArray(t))return t.map(text).join('');return text(t.props?.children);}
  return {requests,saved,items,render,async save(){nodes(render()).find(n=>n.type==='button'&&text(n)==='Save edited version').props.onClick();await new Promise(r=>setImmediate(r));},text};
}
test('manual edit exports PNG and saves a new child version through the real workspace endpoint',async()=>{
  const h=harness();await h.save();assert.equal(h.items[0].type,'image/png');assert.equal(h.requests[0].operation,'createVersion');assert.equal(h.requests[0].input.parent_id,'original-version');assert.equal(h.requests[0].input.project_id,'project');assert.equal(h.requests[0].input.file_id,'edited-file');assert.equal(h.requests[0].input.provenance.source,'manual_edit');assert.deepEqual(h.saved,['edited-version']);
});
test('failed manual save keeps one uploaded PNG and retries the same version request identity',async()=>{
  const h=harness({fail:true});await h.save();assert.deepEqual(h.saved,[]);assert.match(h.text(h.render()),/Save blocked/);await h.save();assert.equal(h.items.length,1);assert.equal(h.requests[0].requestId,h.requests[1].requestId);assert.equal(h.requests.every(r=>r.operation==='createVersion'),true);
});
