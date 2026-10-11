// Isolated Postgres verification; no production users or content are modified.
import fs from "node:fs";
import assert from "node:assert/strict";
const { PGlite } = await import(
  process.env.PGLITE_MODULE || "@electric-sql/pglite"
);
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;
create table workspaces(id uuid primary key);
create table workspace_members(workspace_id uuid,user_id uuid);
grant select on workspace_members to authenticated;
create table studio_versions(id uuid primary key);
create table studio_generation_jobs(id uuid primary key);
`);
await db.exec(
  fs.readFileSync(
    new URL(
      "../supabase/migrations/20261011055223_creative_conversations.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = id(1),
  founder = id(2),
  outsider = id(3),
  w = id(4),
  other = id(5),
  privateChat = id(6),
  sharedChat = id(7);
await db.exec(`insert into auth.users values('${owner}'),('${founder}'),('${outsider}');insert into workspaces values('${w}'),('${other}');insert into workspace_members values('${w}','${owner}'),('${w}','${founder}'),('${other}','${outsider}');
insert into studio_creative_chats(id,workspace_id,created_by,title,visibility) values('${privateChat}','${w}','${owner}','Private draft','private'),('${sharedChat}','${w}','${owner}','Team draft','workspace');
insert into studio_creative_turns(id,workspace_id,chat_id,author_id,prompt,mode,request_hash,status) values('${id(8)}','${w}','${privateChat}','${owner}','Secret idea','chat','a','complete'),('${id(9)}','${w}','${sharedChat}','${owner}','Shared idea','chat','b','pending');`);
async function as(user) {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${user}',false)`,
  );
}
await as(owner);
assert.equal(
  (await db.query("select * from studio_creative_chats")).rows.length,
  2,
);
await as(founder);
assert.equal(
  (await db.query("select * from studio_creative_chats")).rows.length,
  1,
);
assert.equal(
  (await db.query("select * from studio_creative_turns")).rows[0].prompt,
  "Shared idea",
);
await assert.rejects(
  db.exec(`update studio_creative_turns set answer='Forged approval'`),
);
await assert.rejects(
  db.exec(
    `insert into studio_creative_chats(workspace_id,created_by,title) values('${w}','${founder}','Direct write')`,
  ),
);
await as(outsider);
assert.equal(
  (await db.query("select * from studio_creative_chats")).rows.length,
  0,
);
assert.equal(
  (await db.query("select * from studio_creative_turns")).rows.length,
  0,
);
await db.exec("reset role;set role anon");
await assert.rejects(db.query("select * from studio_creative_chats"));
await db.exec("reset role");
await assert.rejects(
  db.exec(
    `insert into studio_creative_turns(id,workspace_id,chat_id,author_id,prompt,mode,request_hash) values('${id(10)}','${w}','${sharedChat}','${founder}','Concurrent prompt','chat','c')`,
  ),
);
await db.exec(
  `update studio_creative_turns set status='complete' where id='${id(9)}'`,
);
await db.exec(
  `insert into studio_creative_turns(id,workspace_id,chat_id,author_id,prompt,mode,request_hash) values('${id(10)}','${w}','${sharedChat}','${founder}','Next prompt','chat','c')`,
);
await assert.rejects(
  db.exec(
    `insert into studio_creative_turns(id,workspace_id,chat_id,author_id,prompt,mode,request_hash) values('${id(11)}','${other}','${privateChat}','${outsider}','Cross workspace','chat','d')`,
  ),
);
await db.exec(`delete from workspace_members where user_id='${founder}'`);
await as(founder);
assert.equal(
  (await db.query("select * from studio_creative_turns")).rows.length,
  0,
);
console.log(
  "Creative chat SQL passed: owner/private/shared visibility, cross-workspace isolation, revocation, anonymous access, forged assistant writes, duplicate active turns, and composite workspace FK.",
);
await db.close();
