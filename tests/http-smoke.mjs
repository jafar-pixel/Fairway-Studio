// Run against an isolated local test server; never modifies real workspace records.
import assert from 'node:assert/strict'
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3001'
const screens=[['01 Home','/demo','Your studio, in motion.'],['02 Ideas','/demo/ideas','Every great thing'],['03 Projects','/demo/projects','Make the ideas real'],['04 Library','/demo/library','Inspiration'],['05 Conversations','/demo/conversations/demo-thread','Keep the conversation'],['06 Tasks','/demo/tasks','Turn feedback'],['07 Brand Kit','/demo/brand-kit','One identity'],['08 Team & Settings','/demo/settings/members','The people'],['09 Canvas','/demo/projects/demo-bag/canvas','Signature golf bag'],['10 Founder review','/demo/projects/demo-identity/reviews','Brand identity'],['11 Mobile route','/demo/projects/demo-bag/canvas','More']]
const results=[]
for(const [screen,path,expected] of screens){const r=await fetch(origin+path);const html=await r.text();assert.equal(r.status,200,screen);assert.ok(html.includes(expected),`${screen}: expected content ${expected}`);assert.ok(!html.includes('Internal Server Error'),screen);results.push({screen,status:r.status,bytes:html.length})}
for(const path of ['/manifest.webmanifest','/sw.js','/offline.html','/pwa/icon-192.png','/pwa/icon-512.png']){const r=await fetch(origin+path);assert.equal(r.status,200,path)}
const read=await fetch(origin+'/api/studio/workspace?workspaceId=00000000-0000-0000-0000-000000000001');assert.equal(read.status,401,'unauthenticated workspace read blocked')
const write=await fetch(origin+'/api/studio/workspace',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://outsider.example'},body:'{}'});assert.equal(write.status,403,'cross-origin mutation blocked')
const invalid=await fetch(origin+'/api/studio/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(invalid.status,400,'invalid payload blocked')
console.log(JSON.stringify({passed:results.length,results,security:['unauthenticated read 401','cross-origin write 403','invalid input 400'],pwa:'all assets served'},null,2))
