import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {loadModule,plain} from './media-test-harness.mjs';
const collections=loadModule('lib/studio/collection-helpers.ts');
const helpers=loadModule('lib/studio/business/shell.ts',{'../collection-helpers':collections});
const w='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333';
const base=`/w/${w}`;
const source=fs.readFileSync(new URL('../components/studio/app.tsx',import.meta.url),'utf8');
test('canonical callbacks select the destination section and preserve exact IDs',()=>{
 assert.equal(helpers.canonicalBusinessDestination(base,'task',b,'https://studio.example'),`${base}/tasks?item=${b}&businessTarget=1`);
 assert.equal(helpers.canonicalBusinessDestination(base,'file',b,'https://studio.example'),`${base}/library?item=${b}&businessTarget=1`);
 assert.equal(helpers.canonicalBusinessDestination(base,'project',c,'https://studio.example'),`${base}/projects/${c}/overview`);
 assert.equal(helpers.canonicalBusinessDestination(base,'business',b,'https://studio.example'),`${base}/business/${b}`);
});
test('only Business task/file links opt into targeted hydration; ordinary Pin/reference routes stay unchanged',()=>{
 assert.equal(helpers.canonicalRouteTarget(['library'],`item=${b}`),null);
 assert.equal(helpers.canonicalRouteTarget(['tasks'],`item=${b}`),null);
 assert.deepEqual(plain(helpers.canonicalRouteTarget(['library'],`item=${b}&businessTarget=1`)),{kind:'file',id:b});
 assert.deepEqual(plain(helpers.canonicalRouteTarget(['projects',c,'reviews'],'')),{kind:'project',id:c});
 assert.equal(helpers.canonicalRouteTarget(['business',b],''),null);
});
test('Business canonical projects remain identifiable and route away from creative review tabs',()=>{
 const projects=[{id:b,category:' Business '},{id:c,category:'Apparel'}];
 assert.equal(helpers.isBusinessProject(projects[0]),true);
 assert.equal(helpers.purposeAwareDestination(`${base}/projects/${b}/reviews?round=old`,base,projects,'https://studio.example'),`${base}/business/${b}`);
 assert.equal(helpers.purposeAwareDestination(`${base}/projects/${c}/canvas`,base,projects,'https://studio.example'),`${base}/projects/${c}/canvas`);
});
test('creative projection excludes Business approvals/artifacts without deleting or changing canonical workspace rows',()=>{
 const original={projects:[{id:b,category:'Business'},{id:c,category:'Brand'}],tasks:[{id:'task',project_id:b}],files:[{id:'file'}],versions:[{id:'bv',project_id:b},{id:'cv',project_id:c}],nodes:[{id:'bn',project_id:b},{id:'bn2',project_id:c,version_id:'bv'},{id:'cn',project_id:c}],rounds:[{id:'br',project_id:b},{id:'cr',project_id:c}],reviews:[{id:'bre',round_id:'br'},{id:'cre',round_id:'cr'}],decisions:[{id:'bd',project_id:b},{id:'cd',project_id:c}]};
 const before=JSON.stringify(original),out=helpers.creativeWorkspaceData(original);
 assert.deepEqual(plain(out.projects).map(r=>r.id),[c]);assert.deepEqual(plain(out.versions).map(r=>r.id),['cv']);assert.deepEqual(plain(out.nodes).map(r=>r.id),['cn']);assert.deepEqual(plain(out.rounds).map(r=>r.id),['cr']);assert.deepEqual(plain(out.reviews).map(r=>r.id),['cre']);assert.deepEqual(plain(out.decisions).map(r=>r.id),['cd']);assert.equal(out.tasks,original.tasks);assert.equal(out.files,original.files);assert.equal(JSON.stringify(original),before);
});
test('cached reads preserve mounted drafts on network failures but fail closed on access loss',()=>{
 const data={id:b};for(const err of [undefined,new Error('offline'),{status:503},{status:504}])assert.equal(helpers.keepCachedRead(data,err),true);
 for(const err of [{status:400},{status:401},{status:403},{status:404},{code:'42501'},{code:'FORBIDDEN'},{code:'PGRST301'}])assert.equal(helpers.keepCachedRead(data,err),false);
 assert.equal(helpers.keepCachedRead(null,{status:503}),false);
});
function boundaryHarness({dirty=false,pending=false,uncertain=false,demo=false}={}){
 const slots=[];let cursor=0;const effects=[];const listeners=new Map();const history=[];const navigations=[];const messages=[];let confirms=0;let confirm=false;
 const window={location:{href:`https://studio.example${base}/business/${b}`,origin:'https://studio.example',assign:url=>history.push(['assign',url])},history:{state:{business:true},pushState:(...args)=>history.push(['push',...args])},confirm:()=>{confirms++;return confirm},addEventListener:(kind,fn)=>{const list=listeners.get(kind)||[];list.push(fn);listeners.set(kind,list)},removeEventListener:(kind,fn)=>listeners.set(kind,(listeners.get(kind)||[]).filter(x=>x!==fn))};
 const react={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value}]},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i]},useCallback(fn){cursor++;return fn},useEffect(fn){const i=cursor++;if(!(i in slots)){slots[i]=true;effects.push(fn)}}};
 const guard=loadModule('components/studio/creator-navigation.ts',{react},{window});
 const Board=()=>null;
 const boundary=loadModule('components/studio/business/workspace-boundary.tsx',{react,'react/jsx-runtime':jsx,'./index':{BusinessBoard:Board},'../creator-navigation':guard,'@/lib/studio/business/shell':helpers},{window}).BusinessWorkspaceBoundary;
 function navigate(url){let denied=false;(listeners.get('fairway-before-navigate')||[]).forEach(fn=>fn({preventDefault:()=>{denied=true}}));if(!denied)navigations.push(url);return!denied}
 function render(){cursor=0;return boundary({workspaceId:w,planId:b,base,demo,onNavigate:navigate,onChanged(){},onBlocked:m=>messages.push(m),onNavigationStateChange(){}})}
 let tree=render();const cleanup=effects.map(fn=>fn());if(!demo){tree.props.onNavigationStateChange({dirty,pending,uncertain});tree=render()}
 return{tree,window,history,navigations,messages,listeners,navigate,confirm:yes=>{confirm=yes},confirmCount:()=>confirms,cleanup:()=>cleanup.forEach(fn=>fn?.())};
}
test('Business uses the existing creator guard with one native Back listener and a route-scoped history snapshot',()=>{
 const h=boundaryHarness({dirty:true});assert.equal(h.listeners.get('popstate').length,1);
 h.window.location.href='https://studio.example'+base+'/tasks';let stopped=false;h.listeners.get('popstate')[0]({stopImmediatePropagation(){stopped=true}});
 assert.equal(stopped,true);assert.deepEqual(h.history[0],['push',{business:true},'',`https://studio.example${base}/business/${b}`]);assert.equal(h.history.some(row=>row[0]==='assign'),false);
 h.cleanup();assert.equal(h.listeners.get('popstate').length,0);
});
test('pending and uncertain Business writes block shell links, workspace changes and signout preflight',()=>{
 for(const state of [{pending:true},{uncertain:true}]){const h=boundaryHarness(state);assert.equal(h.navigate('/w/another'),false);assert.equal(h.navigations.length,0);assert.equal(h.confirmCount(),0);assert.equal(h.messages.length,1);h.tree.props.onOpenTask(c);assert.equal(h.navigations.length,0);h.cleanup()}
});
test('dirty global navigation stays protected if a later guard or signout step cancels the action',()=>{
 const h=boundaryHarness({dirty:true});assert.equal(h.navigate('/first'),false);h.confirm(true);assert.equal(h.navigate('/first'),true);h.confirm(false);assert.equal(h.navigate('/second'),false);assert.equal(h.confirmCount(),3);h.cleanup();
});
test('locally confirmed canonical callback avoids a second discard prompt and uses exact ID',()=>{
 const h=boundaryHarness({dirty:true});h.tree.props.onOpenFile(c);assert.equal(h.confirmCount(),0);assert.deepEqual(h.navigations,[`${base}/library?item=${c}&businessTarget=1`]);h.cleanup();
});
test('demo Business does not mount a real-data board',()=>{const h=boundaryHarness({demo:true});assert.equal(h.tree.type,'section');assert.match(JSON.stringify(h.tree.props.children),/connected workspace/);h.cleanup()});
test('Business navigation exists on desktop and phone without replacing canonical Tasks',()=>{
 assert.match(source,/\["business", "Business", BriefcaseBusiness\]/);assert.match(source,/\["", "tasks", "business", "content"\]\.includes\(key\)/);assert.match(source,/<TasksView \{\.\.\.common\}/);assert.match(source,/<ProjectsView\s+\{\.\.\.creativeCommon\}/);
});
test('Business board key is account/workspace/route only and revalidation never rekeys or replaces it',()=>{
 assert.match(source,/key=\{`\$\{userId\}:\$\{workspaceId\}:\$\{businessPlanId \|\| "index"\}`\}/);assert.match(source,/Promise\.allSettled\(\[result\.mutate\(\),workflow\.mutate\(\),linkedRecord\.mutate\(\)\]\)/);assert.match(source,/result\.error && !keepCachedRead\(result\.data,result\.error\)/);assert.doesNotMatch(source.match(/BusinessWorkspaceBoundary key=\{[^\n]*?\}\}/)?.[0] || "",/(?:revision|updated_at|refresh)/);
});
test('Business purpose prevents creative assistant generation, tours, and destination pickers',()=>{
 assert.match(source,/<IdeasView \{\.\.\.creativeCommon\}/);assert.match(source,/<LibraryView \{\.\.\.creativeCommon\}/);assert.match(source,/<BrandKitView \{\.\.\.creativeCommon\}/);assert.match(source,/<IdeaEditor[\s\S]*?data=\{creativeData\}/);assert.match(source,/onboardingScopeReady && !operationalRoute/);assert.match(source,/generation && !operationalRoute/);assert.match(source,/if \(operationalRoute\) \{ setNotice/);assert.match(source,/onboardingProjectIds = useMemo\(\s*\(\) => \(creativeData\.projects/);
});
test('Business saves are protected from app-update reload and another creator modal',()=>{assert.match(source,/create \|\| businessNavigation\.dirty \|\| businessNavigation\.pending \|\| businessNavigation\.uncertain/);assert.match(source,/if \(operationalRoute && \(businessNavigation\.dirty \|\| businessNavigation\.pending \|\| businessNavigation\.uncertain\)\)/)});

test('confirmed native Business Back uses SPA routing, never a second native unload prompt, and remains guarded if transition does not commit',()=>{
 const h=boundaryHarness({dirty:true});h.confirm(true);h.window.location.href='https://studio.example'+base+'/tasks';h.listeners.get('popstate')[0]({stopImmediatePropagation(){}});
 assert.equal(h.confirmCount(),1);assert.equal(h.history.some(row=>row[0]==='assign'),false);assert.deepEqual(h.navigations,['https://studio.example'+base+'/tasks']);
 h.confirm(false);assert.equal(h.navigate('/later'),false);h.cleanup();
});
test('integrated Business delegates unload warnings to its single existing shell guard',()=>{
 const board=fs.readFileSync(new URL('../components/studio/business/board.tsx',import.meta.url),'utf8'),detail=fs.readFileSync(new URL('../components/studio/business/plan-detail.tsx',import.meta.url),'utf8'),boundary=fs.readFileSync(new URL('../components/studio/business/workspace-boundary.tsx',import.meta.url),'utf8');
 assert.match(board,/useLeaveWarning\(!externalNavigationGuard/);assert.match(detail,/useLeaveWarning\(!externalNavigationGuard/);assert.match(boundary,/<BusinessBoard externalNavigationGuard/);assert.match(boundary,/onNativeNavigate:onNavigate/);
});
test('canonical target cache revalidates on explicit refresh, confirmed writes and realtime changes',()=>{
 assert.match(source,/Promise\.all\(\[result\.mutate\(\), workflow\.mutate\(\), linkedRecord\.mutate\(\)\]\)/);
 assert.match(source,/Promise\.allSettled\(\[result\.mutate\(\), workflow\.mutate\(\), linkedRecord\.mutate\(\)\]\)/);
 assert.match(source,/Promise\.allSettled\(\[result\.mutate\(\),linkedRecord\.mutate\(\)\]\)/);
});
