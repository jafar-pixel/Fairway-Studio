import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';

// Exercise the real component handlers with isolated hooks and network responses.
// These checks do not claim a live provider or production database connection.
function harness({ staged = false, uploadFails = false, completeJob = false } = {}) {
  const slots=[],calls=[];let cursor=0,saves=0;
  const jsx=(type,props)=>({type,props});
  const react={useEffect(){},useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];}};
  const swr=()=>({data:undefined,mutate:async()=>{}});
  const deps={'react':react,'react/jsx-runtime':{jsx,jsxs:jsx},swr:{default:swr},'lucide-react':{},'./media-upload':{useMediaUploads:()=>({items:[],hasUnfinished:staged,uploadAll:async({onRegistered})=>{ if(uploadFails) return {complete:false,failures:[{message:'Upload blocked'}]}; calls.push({action:'upload'}); await onRegistered({id:'source-file'},{id:'upload-request',file:{name:'reference.png'}}); return {complete:true}; }})},'./creative-chat.css':{},'./manual-image-editor':{ManualImageEditor(){}}};
  const context={exports:{},crypto:{randomUUID},Date,fetch:async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,...body});return {ok:true,json:async()=>body.operation?{data:{id:'custom-project',title:body.input.title}}:body.action==='create'?{chat:{id:'chat'}}:body.action==='send'?{turn:{job_id:'job'}}:body.action==='run'&&completeJob?{job:{id:'job',status:'succeeded',outputs:[{versionId:'generated-source'}]}}:{}};},require:n=>deps[n]};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../components/studio/creative-chat.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
  const render=()=>{cursor=0;return context.exports.CreativeChat({data:{userId:'founder',projects:[],versions:[],members:[]},demo:false,workspaceId:'workspace',onClose(){},onSaved(){saves++;}});};
  function nodes(tree){if(!tree||typeof tree!=='object')return [];if(Array.isArray(tree))return tree.flatMap(nodes);return [tree,...nodes(tree.props?.children)];}
  function text(tree){if(tree==null||typeof tree==='boolean')return '';if(typeof tree!=='object')return String(tree);if(Array.isArray(tree))return tree.map(text).join('');return text(tree.props?.children);}
  const find=predicate=>{const node=nodes(render()).find(predicate);assert.ok(node,'Expected control');return node;};
  const button=name=>find(n=>n.type==='button'&&text(n)===name);
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  return {calls,find,button,flush,get saves(){return saves;}};
}
test('original idea saves user text through workspace API without replacing the prompt',async()=>{
  const h=harness();h.find(n=>n.type==='textarea').props.onChange({target:{value:'My completely new sculpture idea'}});
  h.button('Save text as idea').props.onClick();await h.flush();
  assert.equal(h.calls[0].operation,'createIdea');assert.equal(h.calls[0].input.body,'My completely new sculpture idea');assert.equal(h.calls[0].workspaceId,'workspace');
  assert.equal(h.find(n=>n.type==='textarea').props.value,'My completely new sculpture idea');assert.equal(h.saves,1);
});
test('new project is saved and selected before Create image submits and runs the job',async()=>{
  const h=harness();h.button('New project / collection').props.onClick();
  h.find(n=>n.type==='input'&&n.props.placeholder==='Give your idea a home').props.onChange({target:{value:'My original collection'}});
  h.button('Create project').props.onClick();await h.flush();
  assert.equal(h.calls[0].operation,'createProject');assert.equal(h.calls[0].input.title,'My original collection');
  h.find(n=>n.type==='textarea').props.onChange({target:{value:'Make a silver sculpture'}});
  h.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});
  assert.equal(h.button('Create image').props.disabled,false);
  await h.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.equal(h.calls[2].action,'send');assert.equal(h.calls[2].projectId,'custom-project');assert.equal(h.calls[2].prompt,'Make a silver sculpture');assert.equal(h.calls[2].mode,'image');
  assert.equal(h.calls[3].action,'run');assert.equal(h.calls[3].jobId,'job');
});

test('staged upload is registered as a version and sent as the source before generation runs',async()=>{
  const h=harness({staged:true});
  h.button('New project / collection').props.onClick();
  h.find(n=>n.type==='input'&&n.props.placeholder==='Give your idea a home').props.onChange({target:{value:'Upload flow'}});
  h.button('Create project').props.onClick();await h.flush();
  h.find(n=>n.type==='textarea').props.onChange({target:{value:'Use this image and change its color'}});
  h.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});
  assert.equal(h.button('Upload & create image').props.disabled,false);
  await h.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  const link=h.calls.findIndex(c=>c.operation==='createVersion');
  const send=h.calls.findIndex(c=>c.action==='send');
  assert.ok(link<send);
  assert.equal(h.calls[link].input.file_id,'source-file');
  assert.equal(h.calls[send].sourceVersionId,'custom-project');
  assert.equal(h.calls.at(-1).action,'run');
});
test('upload failure preserves the prompt and prevents an unrelated image request',async()=>{
  const h=harness({staged:true,uploadFails:true});
  h.button('New project / collection').props.onClick();
  h.find(n=>n.type==='input'&&n.props.placeholder==='Give your idea a home').props.onChange({target:{value:'Failure flow'}});
  h.button('Create project').props.onClick();await h.flush();
  h.find(n=>n.type==='textarea').props.onChange({target:{value:'Keep my reference'}});
  await h.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.equal(h.calls.some(c=>c.action==='send'),false);
  assert.equal(h.find(n=>n.type==='textarea').props.value,'Keep my reference');
});

test('a prompt alone creates its project, saves the generated version, and selects it for the next edit',async()=>{
  const h=harness({completeJob:true});
  h.find(n=>n.type==='textarea').props.onChange({target:{value:'Create my cap'}});
  h.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});
  assert.equal(h.button('Create image').props.disabled,false);
  await h.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.equal(h.calls[0].operation,'createProject');
  assert.equal(h.calls.find(c=>c.action==='send').projectId,'custom-project');
  assert.equal(h.calls.at(-1).action,'retain');
  h.find(n=>n.type==='textarea').props.onChange({target:{value:'Make it green'}});
  await h.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.equal(h.calls.filter(c=>c.action==='send').at(-1).sourceVersionId,'generated-source');
});
