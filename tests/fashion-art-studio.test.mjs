import test from 'node:test';
import assert from 'node:assert/strict';
import {loadModule,plain,tick} from './media-test-harness.mjs';
const samples=loadModule('lib/studio/fashion-samples.ts');
const data={workspace:{id:'workspace'},userId:'owner',role:'owner',members:[{user_id:'owner',display_name:'Jafar'}],projects:[],versions:[],nodes:[],references:[],files:[],rounds:[],reviews:[],decisions:[],threads:[],messages:[],ideas:[],tasks:[]};
function harness(extra={}){
 const slots=[],calls=[],items=[],uploads=[];let cursor=0;
 const react={useCallback:f=>f,useEffect(){},useState(v){const i=cursor++;if(!(i in slots))slots[i]=typeof v==='function'?v():v;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}];}};
 const upload={items,hasUnfinished:false,addFiles(files){const ids=[];for(const file of files){const id=`file-${items.length}`;items.push({id,file,metadata:{title:file.name,contextNote:''}});ids.push(id);}return ids;},updateMetadata(id,meta){Object.assign(items.find(i=>i.id===id).metadata,meta);},async uploadAll({onRegistered}){for(const item of items.filter(i=>!i.attached)){uploads.push(item);await onRegistered({id:item.id},item);item.attached=true;}return{complete:true};}};
 const jsx=(type,props)=>({type,props});
 const f=loadModule('components/studio/fashion-art-studio.tsx',{react,'react/jsx-runtime':{jsx,jsxs:jsx},swr:{default:()=>({data:{states:[]},mutate:async()=>{}})},'./canvas-board':{CanvasBoard:'CanvasBoard'},'./manual-image-editor':{ManualImageEditor:'ManualImageEditor'},'./creative-chat':{CreativeChat:'CreativeChat'},'./media-upload':{useMediaUploads:()=>upload},'@/lib/studio/fashion-samples':samples,'./fashion-art-studio.css':{}},{Image:class{async decode(){}},File:class{constructor(parts,name,opts){this.name=name;this.type=opts.type;}},document:{createElement:()=>({getContext:()=>({drawImage(){}}),toBlob:f=>f({type:'image/png'})})}});
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
test('canvas selection feeds the embedded AI and manual editor retains the selected source',()=>{
 const h=harness({versions:[{id:'v1',file_id:'f1',title:'First'},{id:'v2',file_id:'f2',title:'Second'}]});h.find(n=>n.type==='CanvasBoard').props.onVersionSelect('v2');assert.equal(h.find(n=>n.type==='CreativeChat').props.initialSourceVersionId,'v2');
 h.button('Edit manually').props.onClick();const manual=h.find(n=>n.type==='ManualImageEditor');assert.equal(manual.props.embedded,true);assert.equal(manual.props.versionId,'v2');
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
