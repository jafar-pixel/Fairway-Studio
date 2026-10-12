import test from 'node:test';
import assert from 'node:assert/strict';
import {loadModule,plain,tick} from './media-test-harness.mjs';
const samples=loadModule('lib/studio/fashion-samples.ts');
const data={workspace:{id:'workspace'},userId:'owner',role:'owner',members:[{user_id:'owner',display_name:'Jafar'}],projects:[],versions:[],nodes:[],references:[],files:[],rounds:[],reviews:[],decisions:[],threads:[],messages:[],ideas:[],tasks:[]};
function harness(extra={}){
 const slots=[],calls=[],items=[],uploads=[];let cursor=0;
 const react={useRef(value){const i=cursor++;if(!(i in slots))slots[i]={current:value};return slots[i];},useCallback:f=>f,useEffect(){},useState(v){const i=cursor++;if(!(i in slots))slots[i]=typeof v==='function'?v():v;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}];}};
 const upload={items,hasUnfinished:false,remove(id){const n=items.findIndex(i=>i.id===id);if(n>=0)items.splice(n,1);},addFiles(files){const ids=[];for(const file of files){const id=`file-${items.length}`;items.push({id,file,metadata:{title:file.name,contextNote:''}});ids.push(id);}return ids;},updateMetadata(id,meta){Object.assign(items.find(i=>i.id===id).metadata,meta);},async uploadAll({onRegistered}){for(const item of items.filter(i=>!i.attached)){uploads.push(item);await onRegistered({id:item.id},item);item.attached=true;}return{complete:true};}};
 const jsx=(type,props)=>({type,props});
 const f=loadModule('components/studio/fashion-art-studio.tsx',{react,'react/jsx-runtime':{jsx,jsxs:jsx},swr:{default:key=>({data:String(key).includes('/colorways?')?{colors:samples.fashionColors,options:[]}:{states:[]},mutate:async()=>{}})},'./canvas-board':{CanvasBoard:'CanvasBoard'},'@/lib/studio/colorways':loadModule('lib/studio/colorways.ts'),'@/lib/studio/product-design':loadModule('lib/studio/product-design.ts'),'./creator-navigation':{useCreatorNavigationGuard:()=>action=>action()},'./product-editor':{ProductEditor:'ProductEditor'},'./manual-image-editor':{ManualImageEditor:'ManualImageEditor'},'./creative-chat':{CreativeChat:'CreativeChat'},'./media-upload':{useMediaUploads:()=>upload},'@/lib/studio/fashion-samples':samples,'./fashion-art-studio.css':{}},{window:{location:{href:'https://app.example/',origin:'https://app.example'}},Blob,fetch:async(url,options)=>{const body=options?.body?JSON.parse(options.body):null;calls.push({url,api:body});if(String(url).includes('/mockup-assets/'))return{ok:true,blob:async()=>new Blob(['preview'],{type:'image/png'})};if(!body)return{ok:true,json:async()=>({colors:samples.fashionColors,options:extra.cachedColorway?[{color_hex:'#244a3a',scope:'body',generated_version_id:'cached-colorway'}]:[]})};if(body.action==='create')return{ok:true,json:async()=>({job:{id:'job',status:'queued'}})};if(body.action==='run')return{ok:true,json:async()=>({job:{id:'job',status:'succeeded'}})};if(body.action==='retain')return{ok:true,json:async()=>({versionIds:['saved-colorway']})};throw Error('Unexpected action');},Image:class{async decode(){}},File:class{constructor(parts,name,opts){this.name=name;this.type=opts.type;}},document:{createElement:()=>({getContext:()=>({drawImage(){}}),toBlob:f=>f({type:'image/png'})})}});
 const props={initialSourceVersionId:extra.initialSourceVersionId,initialManual:extra.initialManual,data:{...data,...extra},workspaceId:'workspace',userId:'owner',projectId:'project',versions:extra.versions||[],nodes:[],onMutate:async(op,input)=>{calls.push({op,input});return{id:`saved-${calls.length}`,title:input.title};},onNavigate:url=>calls.push({url})};
 const render=(name='FashionArtStudio')=>{cursor=0;return f[name](props);};
 function nodes(t){if(!t||typeof t!=='object')return[];if(Array.isArray(t))return t.flatMap(nodes);return[t,...nodes(t.props?.children)];}
 function text(t){if(t==null)return'';if(typeof t!=='object')return String(t);if(Array.isArray(t))return t.map(text).join('');return text(t.props?.children);}
 const find=(predicate,name)=>nodes(render(name)).find(predicate);
 return{calls,items,uploads,render,find,text,button(label){const b=find(n=>n.type==='button'&&text(n)===label);assert.ok(b,`Missing button ${label}`);return b;},async flush(){for(let i=0;i<6;i++)await tick();}};
}
test('founder Home excludes verification and sample projects and separates personal from team work',()=>{
 const projects=[{id:'mine',created_by:'owner'},{id:'team',created_by:'arlin'},{id:'78c8ba89-4339-4b84-a2c1-975333c500fd',created_by:'owner'},{id:'sample',created_by:'owner',is_sample:true}];
 assert.deepEqual(plain(samples.founderProjects(projects,'owner')).map(p=>p.id),['mine']);
 const h=harness({projects});const html=h.text(h.render('FashionHome'));assert.match(html,/Continue your projects/);assert.doesNotMatch(html,/Creative Assistant verification|Capture an idea/);
});
test('starting a design creates a founder-led project then opens its persisted canvas',async()=>{
 const h=harness();h.find(n=>n.type==='input','FashionStart').props.onChange({target:{value:'Summer golf collection'}});
 await h.find(n=>n.type==='form','FashionStart').props.onSubmit({preventDefault(){}});
 assert.equal(h.calls[0].op,'createProject');assert.equal(h.calls[0].input.lead_id,'owner');assert.equal(h.calls[0].input.category,'Polos');assert.equal(h.calls[1].url,'/w/workspace/projects/saved-1/canvas');
});
test('garment shell is uploaded to Library, saved as a project version, then selected as the AI source',async()=>{
 const h=harness();h.find(n=>n.type==='button'&&h.text(n).includes('Golf wind jacket · frontAdd shell')).props.onClick();await h.flush();
 assert.equal(h.items[0].file.type,'image/png');assert.equal(h.items[0].metadata.tags.includes('Outerwear'),true);
 assert.equal(h.calls[0].op,'createVersion');assert.equal(h.calls[0].input.project_id,'project');assert.equal(h.calls[0].input.file_id,'file-0');assert.equal(h.calls[0].input.provenance.sample_id,'golf-wind-jacket-front');
 assert.equal(h.find(n=>n.type==='CreativeChat').props.initialSourceVersionId,'saved-1');
});
test('fabric sample becomes a visual AI reference rather than replacing the garment source',async()=>{
 const h=harness({versions:[{id:'jacket',file_id:'existing',title:'Jacket',project_id:'project'}]});h.find(n=>n.type==='button'&&h.text(n).includes('Performance piqueAdd as AI reference')).props.onClick();await h.flush();
 const ai=h.find(n=>n.type==='CreativeChat');assert.equal(ai.props.initialSourceVersionId,'jacket');assert.deepEqual(plain(ai.props.referenceVersionIds),['saved-1']);
});
test('canvas selection feeds the embedded AI and manual editor retains the selected source',async()=>{
 const h=harness({versions:[{id:'v1',file_id:'f1',title:'First'},{id:'v2',file_id:'f2',title:'Second'}]});h.find(n=>n.type==='CanvasBoard').props.onVersionSelect('v2');assert.equal(h.find(n=>n.type==='CreativeChat').props.initialSourceVersionId,'v2');
 h.button('Edit manually').props.onClick();await h.flush();const manual=h.find(n=>n.type==='ManualImageEditor');assert.equal(manual.props.embedded,true);assert.equal(manual.props.versionId,'v2');
 manual.props.onSaved('v3');assert.equal(h.find(n=>n.type==='CreativeChat').props.initialSourceVersionId,'v3');
});
test('AI variations and moodboard curation operate on the artboard sources',()=>{
 const h=harness({versions:[{id:'v1',file_id:'f1',title:'Jacket'}]});h.button('Variations').props.onClick();let ai=h.find(n=>n.type==='CreativeChat');assert.equal(ai.props.outputCount,2);assert.equal(ai.props.initialSourceVersionId,'v1');
 h.button('Curate moodboard').props.onClick();ai=h.find(n=>n.type==='CreativeChat');assert.equal(ai.props.initialSourceVersionId,'');assert.match(ai.props.initialQuestion,/cohesive original golf collection moodboard/);
});

test('Library edit deep links select the requested design rather than another project version',()=>{
 const h=harness({initialSourceVersionId:'v2',initialManual:true,versions:[{id:'v1',file_id:'f1',title:'First'},{id:'v2',file_id:'f2',title:'Second'}]});
 const editor=h.find(n=>n.type==='ManualImageEditor');assert.equal(editor.props.versionId,'v2');assert.equal(editor.props.embedded,true);
});

test('golf shell view selector exposes back and detail samples instead of repeating fronts',()=>{
 const h=harness();const view=()=>h.find(n=>n.type==='select'&&h.text(n).includes('Construction detail'));
 view().props.onChange({target:{value:'back'}});assert.ok(h.find(n=>n.type==='button'&&h.text(n).includes('Golf wind jacket · backAdd shell')));assert.equal(h.find(n=>n.type==='button'&&h.text(n).includes('Golf wind jacket · frontAdd shell')),undefined);
 view().props.onChange({target:{value:'detail'}});assert.ok(h.find(n=>n.type==='button'&&h.text(n).includes('Golf wind jacket · detailAdd shell')));
});

test('studio starts with one selected design and collapsible tools; board remains available',()=>{const h=harness({versions:[{id:'v1',file_id:'f1',title:'Concept A',image_url:'/a.png'}]});assert.equal(h.find(n=>n.type==='aside').props.hidden,true);assert.ok(h.find(n=>n.props?.['aria-label']==='Current design'));h.button('Show project board').props.onClick();assert.equal(h.find(n=>n.props?.['aria-label']==='Current design'),undefined);});
test('clicking a color directly creates, runs and retains a linked AI colorway without a chat prompt step',async()=>{const h=harness({versions:[{id:'v1',file_id:'f1',title:'Concept A',image_url:'/a.png'}]});h.find(n=>n.type==='button'&&n.props['aria-label']==='Use Forest').props.onClick();await h.flush();const actions=h.calls.filter(c=>c.api).map(c=>c.api);assert.deepEqual(actions.map(a=>a.action),['create','run','retain']);assert.equal(actions[0].sourceVersionId,'v1');assert.equal(actions[0].colorway.hex,'#244a3a');assert.match(actions[0].prompt,/Preserve the exact product silhouette/);assert.ok(h.calls.some(c=>c.op==='refresh'));});
test('stored shared colorways reopen without another provider request',async()=>{const h=harness({cachedColorway:true,versions:[{id:'v1',file_id:'f1',title:'Concept A'}]});h.find(n=>n.type==='button'&&n.props['aria-label']==='Use Forest').props.onClick();await h.flush();assert.equal(h.calls.some(c=>c.api?.action==='create'),false);assert.equal(h.find(n=>n.type==='CreativeChat').props.initialSourceVersionId,'cached-colorway');});

test('generate all sample colorways skips cached results and keeps every new request on the original source',async()=>{const h=harness({cachedColorway:true,versions:[{id:'v1',file_id:'f1',title:'Concept A'}]});h.button('Generate / reuse all sample colorways').props.onClick();await h.flush();const requests=h.calls.filter(c=>c.api?.action==='create').map(c=>c.api);assert.equal(requests.length,11);assert.equal(requests.every(r=>r.sourceVersionId==='v1'),true);assert.equal(requests.some(r=>r.colorway.hex==='#244a3a'),false);assert.equal(new Set(requests.map(r=>r.colorway.hex)).size,11);});

test('older bundled concepts open in focus and register an owned source before AI color editing',async()=>{const h=harness({versions:[{id:'legacy',title:'Concept A',provenance:{import_asset_path:'/mockup-assets/golf-bag-cream.png'}}]});assert.ok(h.find(n=>n.type==='img'&&n.props.src==='/mockup-assets/golf-bag-cream.png'));h.find(n=>n.props?.['aria-label']==='Use Forest').props.onClick();await h.flush();const source=h.calls.find(c=>c.op==='createVersion');assert.equal(source.input.parent_id,'legacy');assert.equal(source.input.provenance.source,'canonical_concept_source');const create=h.calls.find(c=>c.api?.action==='create').api;assert.notEqual(create.sourceVersionId,'legacy');assert.equal(h.calls.some(c=>c.op==='createVersion'),true);});
