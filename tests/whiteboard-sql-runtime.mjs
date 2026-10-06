// Runs the idea whiteboard migration against an isolated PGlite database and checks every rule of engagement.
// Usage: PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node tests/whiteboard-sql-runtime.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const root=new URL('../',import.meta.url).pathname;
const owner='10000000-0000-4000-8000-000000000001',mate='10000000-0000-4000-8000-000000000002',outsider='10000000-0000-4000-8000-000000000003';
const w='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002';
let checks=0;
function check(c,m){assert.ok(c,m);checks++;console.log(`PASS ${checks}: ${m}`)}
async function sql(q,p=[]){return (await db.query(q,p)).rows}
async function as(id){await db.exec('reset role; set role authenticated');await sql("select set_config('request.jwt.claim.sub',$1,false)",[id||''])}
async function admin(){await db.exec('reset role')}
async function op(name,input,workspace=w){return (await sql('select public.studio_board_mutate($1,$2,$3::jsonb) data',[workspace,name,JSON.stringify(input)]))[0].data}
async function fails(fn,code,msg){await assert.rejects(fn,err=>{if(err.code!==code)console.error(err.message,err.code);return err.code===code});checks++;console.log(`PASS ${checks}: ${msg}`)}
try {
  await db.exec(fs.readFileSync(root+'tests/fixtures/legacy-schema.sql','utf8'));
  await db.exec(fs.readFileSync(root+'tests/fixtures/verified-studio-schema.sql','utf8'));
  await db.exec("alter table public.saved_references add column if not exists permission_scope text not null default 'workspace'");
  const migration=fs.readFileSync(root+'supabase/migrations/20261006200000_idea_whiteboards.sql','utf8');
  await db.exec(migration);await db.exec(migration);check(true,'Migration compiles and replays safely');
  await sql('insert into auth.users(id) values($1),($2),($3)',[owner,mate,outsider]);
  await sql("insert into workspaces(id,name,created_by) values($1,'Fairway',$3),($2,'Other',$3)",[w,other,owner]);
  await sql("insert into workspace_members(workspace_id,user_id,role) values($1,$2,'owner'),($1,$3,'editor'),($4,$5,'owner') on conflict do nothing",[w,owner,mate,other,outsider]);
  const idea=(await sql("insert into brand_ideas(workspace_id,author_id,title) values($1,$2,'ALD golf collection') returning id",[w,owner]))[0].id;
  const refs=await sql("insert into saved_references(workspace_id,author_id,title,url,image_url,permission_scope) values($1,$2,'Shared pin','https://www.pinterest.com/pin/1/','https://i.pinimg.com/a.jpg','workspace'),($1,$3,'Mate private pin','https://www.pinterest.com/pin/2/',null,'restricted') returning id,title",[w,owner,mate]);
  const ref=t=>refs.find(r=>r.title===t).id;

  await as(mate);
  let boards=(await op('ensureBoards',{idea_id:idea})).boards;
  const team=boards.find(b=>b.scope==='team'),matePrivate=boards.find(b=>b.scope==='private');
  check(team.owner_id===owner,'Team board belongs to the idea author even when a teammate opens it first');
  check(matePrivate.owner_id===mate,'Teammate gets their own private board');
  boards=(await op('ensureBoards',{idea_id:idea})).boards;check(boards.length===2,'Opening again does not duplicate boards');

  await as(owner);
  boards=(await op('ensureBoards',{idea_id:idea})).boards;const ownerPrivate=boards.find(b=>b.scope==='private');
  check(boards.length===2 && boards.find(b=>b.scope==='team').id===team.id,'Owner sees the same Team board plus their own private board');
  check((await sql('select id from studio_boards')).length===2,'RLS hides the teammate private board from the owner');
  const note=await op('addItem',{board_id:team.id,kind:'note',title:'Direction',body:'Heritage, relaxed',x:40,y:40});
  const moved=await op('updateItem',{id:note.id,expected_revision:0,x:300,y:120});
  check(moved.x===300 && moved.revision===1,'Owner can move items');

  await as(mate);
  const swatch=await op('addItem',{board_id:team.id,kind:'swatch',title:'Clubhouse green',color:'#1F4D3A',x:500,y:40});
  check(swatch.created_by===mate,'Teammate can add to the Team board');
  await fails(()=>op('updateItem',{id:note.id,expected_revision:1,x:10,y:10}),'42501','Teammate cannot move the owner\'s item');
  await fails(()=>op('updateItem',{id:swatch.id,expected_revision:0,x:10}),'42501','Teammate cannot move even their own item');
  await fails(()=>op('updateItem',{id:note.id,expected_revision:1,title:'Changed'}),'42501','Teammate cannot edit the owner\'s item');
  check((await op('updateItem',{id:swatch.id,expected_revision:0,title:'Fairway green'})).title==='Fairway green','Teammate can edit the text of what they added');
  await fails(()=>op('deleteItem',{id:note.id}),'42501','Teammate cannot remove the owner\'s item');
  check((await op('checkOut',{id:note.id})).checked_out_by===mate,'Teammate can check an item out');
  await as(owner);
  await fails(()=>op('checkOut',{id:note.id}),'40001','An item cannot be checked out twice');
  check((await op('checkIn',{id:note.id})).checked_out_by===null,'Board owner can check an item back in');
  await as(mate);
  await op('checkOut',{id:note.id});
  check((await op('checkIn',{id:note.id})).checked_out_by===null,'The holder can check an item back in');
  const copy=await op('copyToPrivate',{id:note.id});
  check(copy.board_id===matePrivate.id && copy.created_by===mate,'Teammate can copy a Team item to their private board');
  check((await op('updateItem',{id:copy.id,expected_revision:0,x:5,y:5})).x===5,'Teammate moves freely on their own private board');
  const comment=await op('addComment',{board_id:team.id,item_id:note.id,body:'Love this direction'});
  check(comment.author_id===mate,'Teammate can comment on a Team item');
  await fails(()=>op('addItem',{board_id:ownerPrivate.id,kind:'note',body:'peek'}),'42501','Teammate cannot write to someone else\'s private board');
  await fails(()=>op('addItem',{board_id:team.id,kind:'library',reference_id:ref('Mate private pin')}),'42501','Private Library items cannot be pinned to the Team board');
  check((await op('addItem',{board_id:matePrivate.id,kind:'library',reference_id:ref('Mate private pin')})).title==='Mate private pin','Own private Library item can go on own private board');
  const pinned=await op('addItem',{board_id:team.id,kind:'library',reference_id:ref('Shared pin')});
  check(pinned.image_url==='https://i.pinimg.com/a.jpg' && pinned.url.startsWith('https://www.pinterest.com/'),'Shared Library pin brings its image and link');
  await fails(()=>op('addItem',{board_id:team.id,kind:'note',body:'x',created_by:owner}),'22023','Forged identity rejected');
  await fails(()=>op('addItem',{board_id:team.id,kind:'image',image_url:'javascript:alert(1)'}),'23514','Non-HTTPS image rejected');
  await fails(()=>op('updateItem',{id:swatch.id,expected_revision:0,body:'stale'}),'40001','Stale edit conflicts');

  await as(owner);
  await fails(()=>op('deleteComment',{id:'30000000-0000-4000-8000-000000000009'}),'42501','Unknown comment is not removable');
  check((await op('deleteComment',{id:comment.id})).deleted===true,'Board owner can remove a comment');
  check((await op('deleteItem',{id:swatch.id})).deleted===true,'Board owner can remove a teammate\'s item');

  await as(outsider);
  check((await sql('select id from studio_boards')).length===0 && (await sql('select id from studio_board_items')).length===0,'Non-members see no boards or items');
  await fails(()=>op('ensureBoards',{idea_id:idea}),'42501','Non-members cannot open boards');
  await fails(()=>op('ensureBoards',{idea_id:idea},other),'22023','Idea from another workspace is not found');
  await admin();
  console.log(`\n${checks} whiteboard SQL checks passed`);
} finally { await db.close(); }
