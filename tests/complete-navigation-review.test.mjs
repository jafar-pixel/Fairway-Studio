import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { loadModule, plain, tick, deferred } from './media-test-harness.mjs';

const workspaceId='11111111-1111-4111-8111-111111111111', userId='22222222-2222-4222-8222-222222222222', recordId='33333333-3333-4333-8333-333333333333', bookId='44444444-4444-4444-8444-444444444444';
const base=`/w/${workspaceId}`;
const css={default:new Proxy({},{get:(_,key)=>String(key)})};
const helper=loadModule('lib/studio/business/shell.ts',{'../collection-helpers':loadModule('lib/studio/collection-helpers.ts')});
const routes=loadModule('lib/studio/workflows/routes.ts');
const Dummy=()=>null;

// Explicitly flush a child's passive effects before rendering its parent again.
// React reports from child effects are queued updates, not a synchronous parent render.
function hookRuntime(){
 let active;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const react={...React,useState(initial){const scope=active,i=scope.cursor++;if(!(i in scope.slots))scope.slots[i]=typeof initial==='function'?initial():initial;return[scope.slots[i],value=>{scope.slots[i]=typeof value==='function'?value(scope.slots[i]):value;}]},useRef(initial){const scope=active,i=scope.cursor++;if(!(i in scope.slots))scope.slots[i]={current:initial};return scope.slots[i]},useCallback(fn,deps){const scope=active,i=scope.cursor++;if(!scope.slots[i]||!same(scope.slots[i].deps,deps))scope.slots[i]={deps,value:fn};return scope.slots[i].value},useEffect(fn,deps){const scope=active,i=scope.cursor++;if(!scope.slots[i]||!same(scope.slots[i].deps,deps)){const old=scope.slots[i];scope.slots[i]={deps,cleanup:old?.cleanup};scope.effects.push(()=>{old?.cleanup?.();scope.slots[i].cleanup=fn()});}}};
 const create=()=>({slots:[],effects:[],cursor:0});
 const render=(scope,component,props)=>{scope.cursor=0;active=scope;try{return component(props)}finally{active=null}};
 const flush=scope=>{const pending=scope.effects.splice(0);for(const fn of pending)fn()};
 const cleanup=scope=>scope.slots.forEach(slot=>slot?.cleanup?.());
 return{react,create,render,flush,cleanup};
}
function boundaryHarness({kind='content',route,dirty=false,pending=false,uncertain=false,demo=false,empty=false}={}){
 const h=hookRuntime(),scope=h.create(),listeners=new Map(),navigations=[],history=[],messages=[];
 let accepted=true,confirm=false,confirms=0;
 const initialUrl=kind==='business'?`${base}/business${route?.planId?`/${route.planId}`:''}`:kind==='private'?routes.privateBusinessUrl(base,route||{tab:'documents'}):routes.contentUrl(base,route?.view||'board',route?.postId);
 const window={location:{href:`https://studio.example${initialUrl}`,origin:'https://studio.example',assign:url=>history.push(['assign',url])},history:{state:{workspaceId},pushState:(...args)=>history.push(['push',...args])},confirm:()=>{confirms++;return confirm},addEventListener:(type,fn)=>listeners.set(type,[...(listeners.get(type)||[]),fn]),removeEventListener:(type,fn)=>listeners.set(type,(listeners.get(type)||[]).filter(item=>item!==fn))};
 const guard=loadModule('components/studio/creator-navigation.ts',{react:h.react},{window});
 const module=kind==='business'?loadModule('components/studio/business/workspace-boundary.tsx',{react:h.react,'react/jsx-runtime':jsx,'./index':{BusinessBoard:Dummy},'../creator-navigation':guard,'@/lib/studio/business/shell':helper},{window}):loadModule('components/studio/workflows/connected-boundary.tsx',{react:h.react,'react/jsx-runtime':jsx,'@/components/studio/social':{SocialBoard:Dummy},'@/components/studio/private-business':{PrivateBusinessBoard:Dummy},'../creator-navigation':guard,'@/lib/studio/business/shell':helper,'@/lib/studio/workflows/routes':routes},{window});
 const Component=module.BusinessWorkspaceBoundary||module.ConnectedWorkflowBoundary;
 function navigate(url){let prevented=false;for(const fn of listeners.get('fairway-before-navigate')||[])fn({preventDefault(){prevented=true}});if(!prevented&&accepted)navigations.push(url);return!prevented&&accepted}
 const props={workspaceId:empty?'':workspaceId,userId:empty?'':userId,planId:kind==='business'?route?.planId:undefined,route:route||(kind==='private'?{kind:'private',tab:'documents'}:{kind:'content',view:'board'}),base,demo,onNavigate:navigate,onChanged(){},onBlocked:message=>messages.push(message),onNavigationStateChange(){}};
 let tree;
 const render=()=>{tree=h.render(scope,Component,props);return tree};
 render();h.flush(scope);
 if(tree.type===Dummy){tree.props.onNavigationStateChange({dirty,pending,uncertain});render();h.flush(scope)}
 return{...h,renderComponent:h.render,cleanupComponent:h.cleanup,window,listeners,navigations,history,messages,navigate,render,get tree(){return tree},setAccepted:value=>{accepted=value},setConfirm:value=>{confirm=value},confirms:()=>confirms,cleanup:()=>h.cleanup(scope)};
}

for(const kind of ['business','content','private']){
 test(`${kind}: pending and uncertain writes block shell, native history, and canonical callbacks`,()=>{
  for(const state of [{pending:true},{uncertain:true}]){
   const h=boundaryHarness({kind,...state});
   assert.equal(h.navigate('/w/other'),false);
   h.window.location.href='https://studio.example/previous';let stopped=false;h.listeners.get('popstate')[0]({stopImmediatePropagation(){stopped=true}});assert.equal(stopped,true);
   if(kind==='private')h.tree.props.onOpenPlan(recordId);else h.tree.props.onOpenTask(recordId);
   assert.equal(h.navigations.length,0);assert.equal(h.confirms(),0);assert.ok(h.messages.length>=2);assert.equal(h.history.some(row=>row[0]==='assign'),false);h.cleanup();
  }
 });
 test(`${kind}: native Back/Forward asks once and a cancelled route remains protected`,()=>{
  const h=boundaryHarness({kind,dirty:true});assert.equal(h.listeners.get('popstate').length,1);assert.equal(h.listeners.get('beforeunload').length,1);
  h.window.location.href='https://studio.example/previous';let stopped=false;h.listeners.get('popstate')[0]({stopImmediatePropagation(){stopped=true}});assert.equal(stopped,true);assert.equal(h.confirms(),1);assert.equal(h.navigations.length,0);
  h.setConfirm(true);h.setAccepted(false);h.window.location.href='https://studio.example/next';h.listeners.get('popstate')[0]({stopImmediatePropagation(){}});assert.equal(h.confirms(),2);
  h.setConfirm(false);assert.equal(h.navigate('/later'),false);assert.equal(h.confirms(),3);assert.equal(h.history.some(row=>row[0]==='assign'),false);h.cleanup();assert.equal(h.listeners.get('popstate').length,0);
 });
 test(`${kind}: confirmed save report is observed before parent re-render by route callback`,()=>{
  const h=boundaryHarness({kind,pending:true});
  h.tree.props.onNavigationStateChange({dirty:false,pending:false,uncertain:false});
  if(kind==='business')h.tree.props.onPlanRouteChange(recordId);
  else if(kind==='private')h.tree.props.onRouteChange({tab:'documents',bookId,recordId});
  else h.tree.props.onRouteChange('calendar',recordId);
  const expected=kind==='business'?`${base}/business/${recordId}`:kind==='private'?`${base}/business/documents/${bookId}/${recordId}`:`${base}/content/calendar/${recordId}`;
  assert.deepEqual(h.navigations,[expected]);assert.equal(h.confirms(),0);h.cleanup();
 });
 test(`${kind}: a newly reported pending save fails closed before parent re-render`,()=>{
  const h=boundaryHarness({kind});h.tree.props.onNavigationStateChange({dirty:true,pending:true,uncertain:false});
  if(kind==='private')h.tree.props.onOpenPlan(recordId);else h.tree.props.onOpenTask(recordId);
  assert.deepEqual(h.navigations,[]);h.cleanup();
 });
}

test('content/private wrappers preserve account/workspace keys and seed exact route identity',()=>{
 const content=boundaryHarness({route:{kind:'content',view:'feedback',postId:recordId}});assert.equal(content.tree.key,`${userId}:${workspaceId}`);assert.equal(content.tree.props.initialView,'feedback');assert.equal(content.tree.props.initialPostId,recordId);assert.equal(content.tree.props.externalNavigationGuard,true);content.cleanup();
 const privateView=boundaryHarness({kind:'private',route:{kind:'private',tab:'finance',bookId,recordId}});assert.equal(privateView.tree.key,`${userId}:${workspaceId}`);assert.equal(privateView.tree.props.userId,userId);assert.equal(privateView.tree.props.initialTab,'finance');assert.equal(privateView.tree.props.initialBookId,bookId);assert.equal(privateView.tree.props.initialRecordId,recordId);privateView.cleanup();
});
test('connected demo and missing-identity gates never mount live boards',()=>{
 for(const kind of ['content','private'])for(const flags of [{demo:true},{empty:true}]){const h=boundaryHarness({kind,...flags});assert.equal(h.tree.type,'section');assert.notEqual(h.tree.type,Dummy);h.cleanup()}
});

function elements(node,predicate){if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(child=>elements(child,predicate));return [...(predicate(node)?[node]:[]),...elements(node.props?.children,predicate)]}
function nodeText(node){if(node==null||typeof node==='boolean')return'';if(typeof node==='string'||typeof node==='number')return String(node);if(Array.isArray(node))return node.map(nodeText).join('');return nodeText(node.props?.children)}
function button(tree,label){const found=elements(tree,node=>node.type==='button'&&nodeText(node)===label)[0];assert.ok(found,`Missing button ${label}`);return found}

async function listBoardHarness(kind,{initial=false}={}){
 const h=boundaryHarness({kind,route:kind==='content'?{kind:'content',view:'calendar',...(initial?{postId:recordId}:{})}:initial?{kind:'plans',planId:recordId}:undefined});
 let mutationCallback,committed;
 const mutation={busy:false,error:null,blocked:false,mutate(op,input,message,callback){mutation.busy=true;mutation.blocked=true;mutationCallback=callback},retry(){},clear(){}};
 const isBusiness=kind==='business',prefix=isBusiness?'business':'social',uiFile=`components/studio/${prefix}/ui.tsx`,clientPath=`../../../lib/studio/${prefix}/client`;
 const client={[isBusiness?'readBusinessList':'readSocialList']:async()=>isBusiness?{plans:[],members:[],userId,page:0,pageSize:20,total:0,overview:{}}:{posts:[],members:[],actorId:userId,page:0,pageSize:20,total:0},[isBusiness?'asBusinessError':'asSocialError']:value=>value,[isBusiness?'BusinessApiError':'SocialApiError']:Error};
 const ui=loadModule(uiFile,{react:h.react,'react/jsx-runtime':jsx,[clientPath]:client,[`./${prefix}.module.css`]:css},{window:h.window});
 const editor=()=>null,detail=()=>null;
 const loaded=loadModule(`components/studio/${prefix}/board.tsx`,{react:h.react,'react/jsx-runtime':jsx,[clientPath]:client,'./ui':{...ui,[isBusiness?'useBusinessMutation':'useSocialMutation']:(id,callback)=>{committed=callback;return mutation}},[`./${prefix}.module.css`]:css,...(isBusiness?{'./plan-editor':{PlanEditor:editor},'./plan-detail':{PlanDetail:detail}}:{'./editor':{SocialEditor:editor},'./detail':{SocialContentDetail:detail},'./calendar':{SocialCalendar:Dummy}})},{window:h.window});
 const Board=isBusiness?loaded.BusinessBoard:loaded.SocialBoard,scope=h.create();
 let tree;
 const render=()=>{const inner=Board(h.tree.props);tree=h.renderComponent(scope,inner.type,inner.props);return tree};
 const flush=()=>h.flush(scope);
 render();flush();await tick();render();flush();h.render();render();flush();
 return{...h,mutation,editor,detail,get tree(){return tree},renderBoard:render,flushBoard:flush,renderBoundary:h.render,complete(){mutation.busy=false;mutation.blocked=false;mutationCallback(isBusiness?{plan:{id:recordId}}:{postId:recordId});committed()},cleanup(){h.cleanup();h.cleanupComponent(scope)}};
}
for(const kind of ['business','content'])test(`${kind}: confirmed new record updates the deep link exactly once after child effects`,async()=>{
 const h=await listBoardHarness(kind);button(h.tree,kind==='business'?'New idea or plan':'New content idea').props.onClick();h.renderBoard();h.flushBoard();
 const editor=elements(h.tree,node=>node.type===h.editor)[0];assert.ok(editor);editor.props.onDirty(true);h.renderBoard();h.flushBoard();h.renderBoundary();h.renderBoard();h.flushBoard();
 editor.props.onSave({title:'Local test record'});h.renderBoard();h.flushBoard();h.renderBoundary();h.renderBoard();h.flushBoard();assert.equal(h.navigate('/elsewhere'),false);
 h.complete();h.renderBoard();h.flushBoard();h.renderBoundary();h.renderBoard();h.flushBoard();
 assert.deepEqual(h.navigations,[`${base}/${kind==='business'?'business':'content/calendar'}/${recordId}`]);assert.equal(h.confirms(),0);h.cleanup();
});

test('Content seeded detail stays in its Calendar view and Back produces one board route',async()=>{
 const h=await listBoardHarness('content',{initial:true});const detail=elements(h.tree,node=>node.type===h.detail)[0];assert.ok(detail);assert.equal(detail.props.postId,recordId);assert.equal(detail.props.workspaceId,workspaceId);assert.deepEqual(h.navigations,[]);detail.props.onBack();h.renderBoard();h.flushBoard();h.renderBoundary();h.renderBoard();h.flushBoard();assert.deepEqual(h.navigations,[`${base}/content/calendar`]);h.cleanup();
});

test('integrated boundaries delegate native warnings once and do not leak private records into shell data',()=>{
 const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
 assert.match(read('components/studio/social/board.tsx'),/useLeaveWarning\(!externalNavigationGuard/);assert.match(read('components/studio/social/detail.tsx'),/useLeaveWarning\(!externalNavigationGuard/);assert.match(read('components/studio/private-business/board.tsx'),/!externalNavigationGuard/);
 const app=read('components/studio/app.tsx');assert.match(app,/key=\{`\$\{userId\}:\$\{workspaceId\}:\$\{route\.join\("\/"\)\}`\}/);assert.match(app,/ai && !operationalRoute/);assert.match(app,/generation && !operationalRoute/);assert.match(app,/onboardingScopeReady && !operationalRoute/);assert.match(app,/\["ideas", "projects", "tasks", "references", "files"\]\.flatMap/);assert.doesNotMatch(app,/studio_private_|private-business\/client|private-business\/server/);
});

for(const kind of ['business','content','private'])test(`${kind}: canonical dispatch cancelled by a second guard never disables the local guard`,()=>{
 const h=boundaryHarness({kind,dirty:true});h.setAccepted(false);
 if(kind==='private')h.tree.props.onOpenPlan(recordId);else h.tree.props.onOpenTask(recordId);
 assert.equal(h.confirms(),0);assert.equal(h.navigations.length,0);assert.equal(h.navigate('/second-attempt'),false);assert.equal(h.confirms(),1);h.cleanup();
});

async function privateBoardHarness({initialBook=false,initialRecord=false}={}){
 const h=boundaryHarness({kind:'private',route:{kind:'private',tab:'finance',...(initialBook?{bookId}:{}),...(initialRecord?{recordId}:{})}}),scope=h.create(),reads=[],documentListeners=new Map();
 const document={visibilityState:'visible',addEventListener:(type,fn)=>documentListeners.set(type,[...(documentListeners.get(type)||[]),fn]),removeEventListener:(type,fn)=>documentListeners.set(type,(documentListeners.get(type)||[]).filter(item=>item!==fn))};
 const commit=deferred();let client;
 const record={id:recordId,book_id:bookId,kind:'budget',title:'Saved private fixture',amount_minor:null,currency:null,notes:'',status:'active',updated_at:null,owner_id:userId,category:'',counterparty:'',revision:1};
 class PrivateClient{constructor(){client=this;this.pending=false;this.uncertain=false}clearAccess(){}async read(input){reads.push(plain(input));return input.recordId?{record,history:[],total:0,page:0,pageSize:20}:input.bookId?{book:{id:bookId,title:'Restricted fixture',can_edit:true,can_manage:true},grants:[],records:[],totals:[],total:0,page:0,pageSize:20}:{books:[],total:0,page:0,pageSize:20}}async mutate(){this.pending=true;try{return await commit.promise}finally{this.pending=false}}}
 const BookForm=()=>null,RecordForm=()=>null;
 const module=loadModule('components/studio/private-business/board.tsx',{react:h.react,'react/jsx-runtime':jsx,'../../../lib/studio/private-business/contracts':{minorToAmount:value=>value},'../../../lib/studio/private-business/client':{PrivateBusinessClient:PrivateClient,privateError:value=>value,safePrivateUrl:value=>value},'./forms':{BookForm,RecordForm,ApprovalForm:Dummy,GrantForm:Dummy,Pager:Dummy,VersionForm:Dummy},'./private-business.module.css':css},{window:h.window,document});
 let tree;const render=()=>{const inner=module.PrivateBusinessBoard(h.tree.props);tree=h.renderComponent(scope,inner.type,inner.props);return tree};const flush=()=>h.flush(scope);
 render();flush();await tick();render();flush();h.render();render();flush();
 return{...h,BookForm,RecordForm,commit,client,reads,document,documentListeners,get tree(){return tree},renderBoard:render,flushBoard:flush,renderBoundary:h.render,cleanup(){h.cleanup();h.cleanupComponent(scope)}};
}

test('Private confirmed register save updates the deep link once after child effects',async()=>{
 const h=await privateBoardHarness();button(h.tree,'New register').props.onClick();h.renderBoard();h.flushBoard();const form=elements(h.tree,node=>node.type===h.BookForm)[0];assert.ok(form);form.props.onDirty();h.renderBoard();h.flushBoard();h.renderBoundary();h.renderBoard();h.flushBoard();
 const saving=form.props.onSave('createBook',{title:'Private fixture'});h.renderBoard();h.flushBoard();h.renderBoundary();h.renderBoard();h.flushBoard();assert.equal(h.navigate('/elsewhere'),false);
 h.commit.resolve({book:{id:bookId}});await saving;h.renderBoard();h.flushBoard();h.renderBoundary();h.renderBoard();h.flushBoard();assert.deepEqual(h.navigations,[`${base}/business/finance/${bookId}`]);assert.equal(h.confirms(),0);h.cleanup();
});

test('Private confirmed record save updates the exact register/record deep link once',async()=>{
 const h=await privateBoardHarness({initialBook:true});button(h.tree,'New record').props.onClick();h.renderBoard();h.flushBoard();const form=elements(h.tree,node=>node.type===h.RecordForm)[0];assert.ok(form);const saving=form.props.onSave('createRecord',{book_id:bookId,title:'Private fixture'});h.renderBoard();h.flushBoard();h.renderBoundary();h.renderBoard();h.flushBoard();
 h.commit.resolve({record:{id:recordId}});await saving;h.renderBoard();h.flushBoard();h.renderBoundary();h.renderBoard();h.flushBoard();assert.deepEqual(h.navigations,[`${base}/business/finance/${bookId}/${recordId}`]);h.cleanup();
});

test('Private seeded record reads exact scoped IDs and Back keeps the register and tab',async()=>{
 const h=await privateBoardHarness({initialBook:true,initialRecord:true});assert.ok(h.reads.some(input=>input.bookId===bookId&&input.recordId===recordId));assert.deepEqual(h.navigations,[]);button(h.tree,'Back to register').props.onClick();h.renderBoard();h.flushBoard();h.renderBoundary();h.renderBoard();h.flushBoard();assert.deepEqual(h.navigations,[`${base}/business/finance/${bookId}`]);h.cleanup();
});

for(const kind of ['business','content'])test(`${kind}: declined route dispatch does not mark the selected record URL committed`,async()=>{
 const h=await listBoardHarness(kind);button(h.tree,kind==='business'?'New idea or plan':'New content idea').props.onClick();h.renderBoard();h.flushBoard();const form=elements(h.tree,node=>node.type===h.editor)[0];form.props.onSave({title:'Local retry fixture'});h.renderBoard();h.flushBoard();h.renderBoundary();h.renderBoard();h.flushBoard();
 h.setAccepted(false);h.complete();h.renderBoard();h.flushBoard();assert.deepEqual(h.navigations,[]);
 // Parent renders after the other navigation guard is dismissed.
 h.setAccepted(true);h.renderBoundary();h.renderBoard();h.flushBoard();assert.deepEqual(h.navigations,[`${base}/${kind==='business'?'business':'content/calendar'}/${recordId}`]);h.cleanup();
});

test('Business seeded detail opens the exact plan and Back produces one board route',async()=>{
 const h=await listBoardHarness('business',{initial:true});const detail=elements(h.tree,node=>node.type===h.detail)[0];assert.ok(detail);assert.equal(detail.props.planId,recordId);assert.equal(detail.props.workspaceId,workspaceId);assert.deepEqual(h.navigations,[]);detail.props.onBack();h.renderBoard();h.flushBoard();h.renderBoundary();h.renderBoard();h.flushBoard();assert.deepEqual(h.navigations,[`${base}/business`]);h.cleanup();
});

test('native history cancellation restores the exact canonical seeded record URL',()=>{
 for(const [kind,route,path] of [['business',{kind:'plans',planId:recordId},`${base}/business/${recordId}`],['content',{kind:'content',view:'feedback',postId:recordId},`${base}/content/feedback/${recordId}`],['private',{kind:'private',tab:'finance',bookId,recordId},`${base}/business/finance/${bookId}/${recordId}`]]){
  const h=boundaryHarness({kind,route,dirty:true});h.window.location.href=`https://studio.example${base}`;h.listeners.get('popstate')[0]({stopImmediatePropagation(){}});assert.equal(h.history[0][3],`https://studio.example${path}`);assert.equal(h.navigations.length,0);h.cleanup();
 }
});

test('Private integrated unload causes one warning and backgrounding clears visible data without changing route',async()=>{
 const h=await privateBoardHarness({initialBook:true,initialRecord:true});button(h.tree,'Edit record').props.onClick();h.renderBoard();h.flushBoard();const form=elements(h.tree,node=>node.type===h.RecordForm)[0];assert.ok(form);form.props.onDirty();h.renderBoard();h.flushBoard();h.renderBoundary();h.renderBoard();h.flushBoard();let warnings=0;for(const fn of h.listeners.get('beforeunload')||[])fn({preventDefault(){warnings++}});assert.equal(warnings,1);
 h.document.visibilityState='hidden';for(const fn of h.documentListeners.get('visibilitychange')||[])fn();h.renderBoard();h.flushBoard();h.renderBoundary();h.renderBoard();h.flushBoard();assert.doesNotMatch(nodeText(h.tree),/Saved private fixture|Restricted fixture/);assert.deepEqual(h.navigations,[]);h.cleanup();
});
