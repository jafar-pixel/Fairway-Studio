import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadModule, plain } from './media-test-harness.mjs';
const route = loadModule('lib/studio/workflows/routes.ts');
const id='11111111-1111-4111-8111-111111111111', book='22222222-2222-4222-8222-222222222222', row='33333333-3333-4333-8333-333333333333';
const base=`/w/${id}`;
const src=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Business reserved sections are parsed before plan IDs and cannot reach plan API',()=>{
 for(const tab of ['documents','finance']){
  assert.deepEqual(plain(route.parseWorkflowRoute(['business',tab])),{kind:'private',tab});
  assert.deepEqual(plain(route.parseWorkflowRoute(['business',tab,book,row])),{kind:'private',tab,bookId:book,recordId:row});
 }
 assert.deepEqual(plain(route.parseWorkflowRoute(['business',id])),{kind:'plans',planId:id});
 for(const parts of [['business','documents','title'],['business','finance',book,'bad'],['business','other'],['business',id,'documents'],['business','documents',book,row,'extra']]) assert.equal(route.parseWorkflowRoute(parts).kind,'invalid');
});
test('every content view and exact record roundtrips to a deep link',()=>{
 for(const view of ['board','calendar','feedback'])for(const postId of [null,id]){
  const url=route.contentUrl(base,view,postId);
  assert.deepEqual(plain(route.parseWorkflowRoute(url.split('/').slice(3))),{kind:'content',view,...(postId?{postId}: {})});
 }
 for(const parts of [['content','documents'],['content','calendar','caption'],['content',id,'extra']])assert.equal(route.parseWorkflowRoute(parts).kind,'invalid');
});
test('private URLs contain only validated canonical IDs and tab, never titles or search',()=>{
 const location={tab:'finance',bookId:book,recordId:row};assert.equal(route.privateBusinessUrl(base,location),`${base}/business/finance/${book}/${row}`);
 assert.deepEqual(plain(route.parseWorkflowRoute(['business','finance',book,row])),{kind:'private',...location});
 for(const value of ['javascript:alert(1)','secret title','../../other','bad?id=private']){assert.throws(()=>route.contentUrl(base,'board',value));assert.throws(()=>route.privateBusinessUrl(base,{tab:'documents',bookId:value}));}
 assert.throws(()=>route.privateBusinessUrl(base,{tab:'finance',recordId:row}));
 assert.equal(route.parseWorkflowRoute(['business','10000000-0000-0000-0000-000000000001']).kind,'plans','canonical database UUIDs with legacy version bits remain supported');
});
const styles={__esModule:true,default:new Proxy({},{get:(_,key)=>key})};
const help=loadModule('components/studio/workflows/context-help.tsx',{'react/jsx-runtime':jsx,'./workflows.module.css':styles});
test('contextual guidance is opt-in read-only content with truthful capability boundaries',()=>{
 for(const current of [{kind:'plans'},{kind:'private',tab:'documents'},{kind:'private',tab:'finance'},{kind:'content',view:'board'}]){
  const html=renderToStaticMarkup(React.createElement(help.WorkflowHelp,{route:current}));
  assert.match(html,/<details/);assert.doesNotMatch(html,/<details[^>]*open/);assert.doesNotMatch(html,/<form|<button|autoplay|Home onboarding/);
  if(current.kind==='private'){assert.match(html,/Document uploads and app-served document downloads are unavailable/);assert.match(html,/whole current and historical contents/);assert.match(html,/backgrounded/);}
  if(current.kind==='content'){assert.match(html,/Creative approval alone does not approve/);assert.match(html,/missing metrics stay unknown/);}
 }
 assert.doesNotMatch(src('components/studio/workflows/context-help.tsx'),/fetch\(|localStorage|mutate\(|onAction|useEffect/);
});
test('Business navigation supplies mobile-reachable real links and per-section active state',()=>{
 const html=renderToStaticMarkup(React.createElement(help.BusinessSubnav,{base,route:{kind:'private',tab:'finance'},onNavigate(){}}));
 for(const path of ['/business','/business/documents','/business/finance'])assert.ok(html.includes(`href="${base}${path}"`));
 assert.match(html,new RegExp(`href="${base}/business/finance" aria-current="page"`));
 assert.match(src('components/studio/workflows/workflows.module.css'),/@media\(max-width:600px\)/);
});
test('shell preserves auth/workspace route keys and excludes operational routes from creative guide and AI',()=>{
 const app=src('components/studio/app.tsx');
 assert.match(app,/\["content", "Content", Send\]/);assert.match(app,/\["", "tasks", "business", "content"\]\.includes\(key\)/);
 assert.match(app,/parseWorkflowRoute\(route, canonicalBusinessProject\)/);assert.match(app,/workflowRoute\.kind === "plans" \? workflowRoute\.planId : undefined/);
 assert.match(app,/key=\{`\$\{userId\}:\$\{workspaceId\}:\$\{route\.join\("\/"\)\}`\}/);
 assert.match(app,/onboardingScopeReady && !operationalRoute/);assert.match(app,/generation && !operationalRoute/);assert.match(app,/ai && !operationalRoute/);
 assert.match(app,/operationalRoute \? \(contentRoute \? "content"/);
 assert.match(app,/onNavigationStateChange=\{setBusinessNavigation\}/);assert.match(app,/businessNavigation\.dirty \|\| businessNavigation\.pending \|\| businessNavigation\.uncertain/);
 assert.doesNotMatch(src('lib/studio/server.ts'),/private_business|studio_private_books|studio_private_records/);
 assert.doesNotMatch(src('public/sw.js'),/studio\/private-business|studio\/social/,'no new private cache inclusion');
});
test('isolated integration preserves reviewed private backend routes and migration hashes',()=>{
 const manifest=JSON.parse(src('tests/fixtures/private-business-owned-files.json'));
 for(const file of manifest.owned_production_files.filter(f=>f.path.startsWith('lib/')||f.path.startsWith('app/api/')||f.path.startsWith('supabase/')))assert.equal(createHash('sha256').update(src(file.path)).digest('hex'),file.sha256,file.path);
});
