import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as React from 'react';
import * as runtime from 'react/jsx-runtime';
import * as icons from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadModule, userId, otherUserId, plain } from './media-test-harness.mjs';
const rules = loadModule('lib/studio/profile-photo.ts');
const avatarModule = loadModule('components/studio/profile-avatar.tsx', {react: React, 'react/jsx-runtime':runtime, '@/lib/studio/profile-photo':rules, './profile-photo.css':{}});
const source = file => fs.readFileSync(new URL('../'+file, import.meta.url),'utf8');
test('profile formats and byte limits are explicit; HEIC SVG GIF spoofed extensions are not advertised', () => {
  for(const type of rules.PROFILE_FORMATS) assert.equal(rules.profileFileError({type,size:rules.PROFILE_INPUT_LIMIT}),null);
  for(const type of ['image/heic','image/gif','image/svg+xml','text/html','']) assert.match(rules.profileFileError({type,size:10}),/JPEG, PNG or WebP/);
  for(const size of [0,-1,rules.PROFILE_INPUT_LIMIT+1]) assert.match(rules.profileFileError({type:'image/jpeg',size}),/8 MB/);
});
test('crop clamps each edge, zoom and extreme inputs, keeps every crop within the source', () => {
  assert.deepEqual(plain(rules.profileCropRect(1000,500,{zoom:1,x:0,y:0})),{x:250,y:0,size:500});
  for(const [width,height] of [[1600,900],[900,1600],[512,512]]) for(const zoom of [0,1,2,3,100,NaN]) for(const x of [-1000,-100,0,100,1000]) for(const y of [-1000,-100,0,100,1000]) {
    const c=rules.profileCropRect(width,height,{zoom,x,y}); assert.ok(c.size>0);assert.ok(c.x>=0&&c.y>=0&&c.x+c.size<=width+.00001&&c.y+c.size<=height+.00001);
  }
  assert.throws(()=>rules.profileCropRect(10000,10000,{zoom:1,x:0,y:0}),/40 megapixels/);
  assert.throws(()=>rules.profileCropRect(NaN,10,{zoom:1,x:0,y:0}));
});
test('avatar never accepts remote URLs or display names as identity',()=>{
  assert.equal(rules.profileImageUrl('Jafar'),null); assert.equal(rules.profileImageUrl('https://example.com/a.jpg'),null);
  assert.equal(rules.profileImageUrl(userId,3),`/api/studio/profile-photo?userId=${userId}&image=1&v=3`);
  assert.equal(rules.avatarInitials('  Jane  Smith '),'JS'); assert.equal(rules.avatarInitials(''),'?');
  const html=renderToStaticMarkup(React.createElement(avatarModule.ProfileAvatar,{name:'Jane Smith',userId}));
  assert.match(html,/profile-avatar/);assert.match(html,/>JS</);assert.doesNotMatch(html,/<img/,'no ambient authenticated context is allowed to request photos');
});
test('exact screenshot regression: activity text can grow, initial/avatar cannot',()=>{
  const css=source('app/globals.css'), photoCss=source('components/studio/profile-photo.css');
  assert.doesNotMatch(css,/\.fs-action-row\s*>\s*span\s*\{[^}]*flex:\s*1/);
  assert.match(css,/\.fs-action-row > span:not\(\.fs-avatar\)/);
  assert.match(photoCss,/\.fs-avatar\.profile-avatar\s*\{[^}]*flex:\s*0 0 auto;[^}]*aspect-ratio:\s*1/);
  assert.match(photoCss,/\.profile-avatar > img\s*\{[^}]*object-fit:\s*cover/);
});
test('actual screenshot operation labels are readable and descriptions remain authoritative',()=>{
  assert.equal(rules.activityLabel({operation:'linkIdeaAsset'}),'Linked an asset to an idea');
  assert.equal(rules.activityLabel({event:'createIdea'}),'Created an idea');
  assert.equal(rules.activityLabel({description:'Saved a particular file',operation:'createIdea'}),'Saved a particular file');
  assert.equal(rules.activityLabel({event:'unknownFutureOperation'}),'Unknown Future Operation');
});
test('all app avatar rendering routes use explicit account IDs and provider identity isolation',()=>{
  const app=source('components/studio/app.tsx'),projects=source('components/studio/projects.tsx'),collections=source('components/studio/collections.tsx');
  assert.match(app,/<ProfilePhotoProvider key=\{`\$\{userId\}:\$\{workspaceId\}`\}/);
  for (const match of app.matchAll(/<Avatar\b[\s\S]*?\/>/g)) assert.match(match[0],/userId=/);
  for (const match of projects.matchAll(/<Avatar\b[\s\S]*?\/>/g)) assert.match(match[0],/userId=/);
  assert.match(collections,/<ProfileAvatar name=\{name\} userId=\{id\}/);
  assert.match(app,/activityLabel\(a\)/);assert.match(app,/Edit your profile photo/);assert.match(app,/section === "profile"/);
});
function harness({demo=true,metadata={photo:null,revision:0},fetchFailure,saveFailure,deferBlob=false}={}) {
  const states=[],refs=[],effects=[];let cursor=0,refCursor=0,effectCursor=0;
  const scope={viewerId:userId,demo,version:0,demoPhoto:null,refresh(){this.version++},setDemoPhoto(url){this.demoPhoto=url}};
  const calls=[],revoked=[],draws=[];let urlNumber=0;
  const ctx={fillStyle:'',fillRect(){},drawImage(...args){draws.push(args)}};
  const image={naturalWidth:1000,naturalHeight:500,decode:async()=>{}};
  let finishBlob; const canvas={getContext:()=>ctx,toBlob:cb=>{const finish=()=>cb(new Blob(['jpeg fixture'],{type:'image/jpeg'}));if(deferBlob)finishBlob=finish;else finish();}};
  const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value}]},useRef(initial){const i=refCursor++;if(!(i in refs))refs[i]={current:initial};return refs[i]},useEffect(effect,deps){const i=effectCursor++,old=effects[i];if(!old||deps.some((v,k)=>v!==old.deps[k]))effects[i]={deps,effect,pending:true,cleanup:old?.cleanup}}};
  const api=loadModule('components/studio/profile-photo-editor.tsx',{react,'react/jsx-runtime':runtime,'lucide-react':icons,'@/lib/studio/profile-photo':{...rules,profilePhotoDimensions:()=>({width:1000,height:500})},'./profile-avatar':{ProfileAvatar:avatarModule.ProfileAvatar,useProfilePhotos:()=>scope},'./profile-photo-navigation':{useProfilePhotoNavigation:()=>fn=>fn()}},{Blob,FormData,Image:function(){return {...image}},URL:{createObjectURL:()=>`blob:fixture-${++urlNumber}`,revokeObjectURL:url=>revoked.push(url)},fetch:async(url,options={})=>{calls.push({url,options});if(fetchFailure)throw Error(fetchFailure);if(saveFailure&&options.method==='POST')return {ok:false,json:async()=>({error:saveFailure})};return {ok:true,json:async()=>options.method==='DELETE'?{photo:null,revision:metadata.revision+1}:options.method==='POST'?{photo:{path:`${userId}/generated.jpg`,revision:metadata.revision+1},revision:metadata.revision+1}:metadata}}});
  let tree;
  function walk(node,match){if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const child of node){const result=walk(child,match);if(result)return result;}return null;}if(match(node))return node;return walk(node.props?.children,match);}
  function text(node){if(node===null||node===undefined||typeof node==='boolean')return '';if(typeof node!=='object')return String(node);if(Array.isArray(node))return node.map(text).join('');return text(node.props?.children);}
  function render(){cursor=refCursor=effectCursor=0;tree=api.ProfilePhotoEditor({name:'Jane',userId});walk(tree,node=>{if(node.type==='canvas')node.props.ref.current=canvas;if(node.type==='input'&&node.props.type==='file')node.props.ref.current={value:'',click(){}};return false;});for(const effect of effects)if(effect.pending){effect.cleanup?.();effect.cleanup=effect.effect();effect.pending=false;}return tree;}
  const button=label=>walk(tree,node=>node.type==='button'&&text(node)===label);
  const fileInput=()=>{const node=walk(tree,node=>node.type==='input'&&node.props.type==='file');const change=node.props.onChange;return {...node,props:{...node.props,onChange: event=>{for(const file of event.target.files)file.arrayBuffer ||= async()=>new ArrayBuffer(0);return change(event);}}};};
  const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));render();};
  render();return {render,button,fileInput,flush,calls,scope,revoked,draws,finishBlob:()=>finishBlob(),text:()=>text(tree),unmount(){for(const effect of effects)effect.cleanup?.()}};
}
test('demo select/crop/save/replace/remove lifecycle uses only local blobs; unmount revokes selected original',async()=>{
  const h=harness();await h.fileInput().props.onChange({target:{files:[{type:'image/png',size:1234}]}});h.render();
  assert.ok(h.button('Save demo preview'));assert.equal(h.draws.length,1);assert.equal(h.draws[0].at(-1),512);
  await h.button('Save demo preview').props.onClick();h.render();assert.equal(h.scope.demoPhoto,'blob:fixture-2');assert.equal(h.calls.length,0);assert.ok(h.button('Replace photo'));assert.match(h.text(),/Nothing was uploaded/);
  h.button('Remove photo').props.onClick();h.render();await h.button('Yes, remove photo').props.onClick();h.render();assert.equal(h.scope.demoPhoto,null);assert.match(h.text(),/initials are shown again/);
  await h.fileInput().props.onChange({target:{files:[{type:'image/jpeg',size:20}]}});h.render();h.unmount();assert.ok(h.revoked.includes('blob:fixture-3'));
});
test('real save includes revision only; no user-chosen identity or upload URL',async()=>{
  const h=harness({demo:false,metadata:{photo:{path:'current.jpg',revision:9},revision:9}});await h.flush();
  await h.fileInput().props.onChange({target:{files:[{type:'image/webp',size:2048}]}});h.render();await h.button('Save photo').props.onClick();h.render();
  const upload=h.calls.find(c=>c.options.method==='POST');assert.equal(upload.url,'/api/studio/profile-photo');assert.equal(upload.options.body.get('expectedRevision'),'9');assert.equal(upload.options.body.get('photo').type,'image/jpeg');assert.equal(upload.options.body.get('userId'),null);assert.equal(upload.options.headers['X-Fairway-Profile-User'],userId);assert.equal(h.scope.version,1);assert.match(h.text(),/Profile photo saved/);
});
test('failed initial metadata load prevents unsafe writes and gives a retry',async()=>{
  const h=harness({demo:false,fetchFailure:'Profile photo setup is required.'});await h.flush();assert.equal(h.button('Add photo').props.disabled,true);assert.ok(h.button('Retry loading profile'));assert.match(h.text(),/setup is required/);
});
test('invalid selection never decodes or sends a photo',async()=>{
  const h=harness();await h.fileInput().props.onChange({target:{files:[{type:'image/heic',size:100}]}});h.render();assert.match(h.text(),/Convert HEIC/);assert.equal(h.button('Save demo preview'),null);assert.equal(h.calls.length,0);assert.equal(h.draws.length,0);
});

test('failed save keeps the crop available for retry, refreshes revision and never claims success',async()=>{
  const h=harness({demo:false,metadata:{photo:null,revision:2},saveFailure:'Your profile photo changed in another tab.'});await h.flush();
  await h.fileInput().props.onChange({target:{files:[{type:'image/jpeg',size:20}]}});h.render();await h.button('Save photo').props.onClick();h.render();
  assert.ok(h.button('Save photo'));assert.match(h.text(),/changed in another tab/);assert.doesNotMatch(h.text(),/Profile photo saved/);assert.equal(h.revoked.length,0);assert.equal(h.calls.filter(c=>!c.options.method).length,2);
});
test('avatar image failure falls back to initials and retries when the scoped revision changes',async()=>{
  const scope={viewerId:userId,demo:false,version:0},calls=[];let states=[],cursor=0,made=0;
  const fakeReact={...React,useContext:()=>scope,useEffect:()=>{},useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value}]}};
  const {ProfileAvatar}=loadModule('components/studio/profile-avatar.tsx',{react:fakeReact,'react/jsx-runtime':runtime,'@/lib/studio/profile-photo':rules,'./profile-photo.css':{}},{window:{},setTimeout:fn=>fn(),URL:{createObjectURL:()=>`blob:jane-${++made}`,revokeObjectURL(){}},fetch:async url=>{calls.push(url);return {ok:true,headers:{get:()=>'image/jpeg'},blob:async()=>({})}}});
  const render=()=>{cursor=0;return ProfileAvatar({name:'Jane Smith',userId})},flush=()=>new Promise(r=>setImmediate(r));
  render();await flush();let tree=render();assert.equal(tree.props.children.type,'img');tree.props.children.props.onError();tree=render();assert.equal(tree.props.children,'JS');
  scope.version++;render();await flush();tree=render();assert.equal(tree.props.children.type,'img');assert.match(calls.at(-1),/v=1$/);
});
function navigationHarness(state) {
  const listeners=new Map(),actions=[];let cleanup,confirmation=false;
  const window={confirm:()=>confirmation,location:{href:'https://studio.example/settings/profile',assign:url=>actions.push(['assign',url])},history:{state:{profile:true},pushState:(...args)=>actions.push(['push',...args])},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  const module=loadModule('components/studio/profile-photo-navigation.ts',{react:{useRef:current=>({current}),useEffect:fn=>{cleanup=fn()}},'./creator-navigation':{CREATOR_NAVIGATION_EVENT:'fairway-before-navigate'}},{window});
  const warnings=[];const guard=module.useProfilePhotoNavigation({...state,onBlocked:msg=>warnings.push(msg)});
  return {listeners,actions,window,warnings,guard,cleanup,approve(){confirmation=true}};
}
test('unsaved crops survive cancelled navigation; in-flight photo work blocks leaving',()=>{
  const h=navigationHarness({dirty:true,busy:false});let left=false;h.guard(()=>left=true);assert.equal(left,false);h.approve();h.guard(()=>left=true);assert.equal(left,true);h.cleanup();assert.equal(h.listeners.size,0);
  const busy=navigationHarness({dirty:false,busy:true});busy.guard(()=>assert.fail('should not leave'));assert.match(busy.warnings[0],/being processed/);
});
test('native Back restores the profile editor before asking; Cancel keeps local crop',()=>{
  const h=navigationHarness({dirty:true,busy:false});h.window.location.href='https://studio.example/home';let stopped=false;h.listeners.get('popstate')({stopImmediatePropagation(){stopped=true}});assert.equal(stopped,true);assert.deepEqual(h.actions[0],['push',{profile:true},'','https://studio.example/settings/profile']);assert.equal(h.actions.length,1);
});

test('raster header preflight bounds PNG JPEG and WebP dimensions before browser decoding',()=>{
  const png=Buffer.alloc(45);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(13,8);png.write('IHDR',12);png.writeUInt32BE(512,16);png.writeUInt32BE(256,20);assert.deepEqual(plain(rules.profilePhotoDimensions(png,'image/png')),{width:512,height:256});
  png.writeUInt32BE(30000,16);assert.throws(()=>rules.profilePhotoDimensions(png,'image/png'),/too large/);png.writeUInt32BE(512,16);png.write('acTL',37);assert.throws(()=>rules.profilePhotoDimensions(png,'image/png'),/animated PNG/);
  const jpeg=Buffer.from([255,216,255,192,0,8,8,1,0,2,0,1,255,217]);assert.deepEqual(plain(rules.profilePhotoDimensions(jpeg,'image/jpeg')),{width:512,height:256});
  const webp=Buffer.alloc(30);webp.write('RIFF',0);webp.write('WEBP',8);webp.write('VP8X',12);webp.writeUInt32LE(10,16);webp[24]=255;webp[25]=1;webp[27]=255;assert.deepEqual(plain(rules.profilePhotoDimensions(webp,'image/webp')),{width:512,height:256});webp[20]=2;assert.throws(()=>rules.profilePhotoDimensions(webp,'image/webp'),/animated WebP/);
  assert.throws(()=>rules.profilePhotoDimensions(Buffer.from('<svg>'),'image/png'),/invalid image header/);assert.throws(()=>rules.profilePhotoDimensions(jpeg,'image/webp'),/invalid image header/);
});

test('unmount during asynchronous crop serialization prevents a late POST under a different account',async()=>{
  const h=harness({demo:false,deferBlob:true});await h.flush();await h.fileInput().props.onChange({target:{files:[{type:'image/jpeg',size:20}]}});h.render();
  const save=h.button('Save photo').props.onClick();h.unmount();h.finishBlob();await save;assert.equal(h.calls.filter(c=>c.options.method==='POST').length,0);assert.equal(h.scope.demoPhoto,null);
});
test('raster preflight reads actual generated PNG, progressive JPEG, lossy WebP and lossless WebP',async()=>{
  const {default:sharp}=await import('sharp');
  const base=()=>sharp({create:{width:400,height:260,channels:3,background:'#760d24'}});
  for(const [type,bytes] of [['image/png',await base().png().toBuffer()],['image/jpeg',await base().jpeg({progressive:true}).toBuffer()],['image/webp',await base().webp().toBuffer()],['image/webp',await base().webp({lossless:true}).toBuffer()]])assert.deepEqual(plain(rules.profilePhotoDimensions(bytes,type)),{width:400,height:260});
});
