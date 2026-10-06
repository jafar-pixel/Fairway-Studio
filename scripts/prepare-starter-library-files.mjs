/** Stage 2: verify deployed bytes, then prepare SQL. Never writes to Supabase. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_ORIGIN='https://sports-brand-collaboration-setup.vercel.app';
export function buildLibraryFileSql(manifest, verifiedAssets) {
 const rows=verifiedAssets.map((asset,index)=>({...asset,index}));
 const payload={workspace:manifest.workspace,actor:manifest.actor,batch:manifest.batch,assets:rows};
 const body=JSON.stringify(payload);
 if(body.includes('$content$'))throw Error('Unsafe delimiter');
 return `-- STAGE 2, INSERT ONLY. Execute only after the target deployment and all asset SHA256 values verify.
-- Canonical external files remain externally hosted. This does not grant upload ownership or create storage objects.
begin;
set local statement_timeout='30s';
do $library$
declare p jsonb := $content$${body}$content$::jsonb; w uuid := (p->>'workspace')::uuid; actor uuid := (p->>'actor')::uuid; r jsonb; v public.studio_versions; fid uuid; n integer;
begin
 if not exists(select 1 from public.workspace_members where workspace_id=w and user_id=actor and role='owner') then raise exception 'Existing owner required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('fairway-starter:'||w::text,0));
 for r in select value from jsonb_array_elements(p->'assets') loop
  select count(*) into n from public.studio_versions where workspace_id=w and provenance->>'import_batch'=p->>'batch' and provenance->>'import_key'=r->>'key' and provenance->>'asset_sha256'=r->>'sha256';
  if n<>1 then raise exception 'Exactly one matching source version and hash required: %',r->>'key'; end if;
  select * into v from public.studio_versions where workspace_id=w and provenance->>'import_batch'=p->>'batch' and provenance->>'import_key'=r->>'key' and provenance->>'asset_sha256'=r->>'sha256';
  fid:=null;
  select id into fid from public.workspace_files where workspace_id=w and id=md5(w::text||':starter-file:'||(r->>'key'))::uuid;
  if fid is null then
   select count(*),min(id::text)::uuid into n,fid from public.workspace_files where workspace_id=w and url=r->>'url' and permission_scope='workspace';
   if n>1 then raise exception 'Ambiguous canonical asset URL: %',r->>'key'; end if;
  end if;
  if fid is null then
   fid:=md5(w::text||':starter-file:'||(r->>'key'))::uuid;
   insert into public.workspace_files(id,workspace_id,title,url,provider,context_note,tags,permission_scope,added_by)
    values(fid,w,r->>'title',r->>'url','other',r->>'note',array['Starter collection',r->>'source_tag'],'workspace',actor);
  end if;
  insert into public.studio_canvas_nodes(id,workspace_id,project_id,version_id,file_id,kind,body,x,y,width,height)
   values(md5(w::text||':starter-file-node:'||(r->>'key'))::uuid,w,v.project_id,v.id,fid,'file',r->>'title',((r->>'index')::int%3)*340,1800+((r->>'index')::int/3)*340,320,300) on conflict(id) do nothing;
 end loop;
end $library$;
commit;
`;
}
async function main() {
 const args=Object.fromEntries(process.argv.slice(2).reduce((list,arg,i,all)=>{if(arg.startsWith('--'))list.push([arg.slice(2),all[i+1]]);return list;},[]));
 if(args.origin!==EXPECTED_ORIGIN)throw Error(`Supply verified --origin ${EXPECTED_ORIGIN}. No unknown origin is accepted.`);
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'supabase/mockup-content-import.manifest.json'),'utf8'));
 const assets=manifest.versions.filter(v=>v.provenance.library_kind && v.provenance.media_origin==='bundled_exploratory');
 const checked=[];
 for(const v of assets) {
  const url=new URL(v.asset,EXPECTED_ORIGIN).href;
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30_000)});
  if(!response.ok)throw Error(`${v.title}: asset not deployed (${response.status}); no SQL prepared.`);
  if(!response.headers.get('content-type')?.startsWith('image/png'))throw Error(`${v.title}: response is not PNG.`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>10*1024*1024)throw Error(`${v.title}: unexpected asset size.`);
  const sha256=createHash('sha256').update(bytes).digest('hex');
  if(sha256!==v.provenance.asset_sha256)throw Error(`${v.title}: deployed bytes do not match reviewed source; no SQL prepared.`);
  const original=v.provenance.media_origin==='bundled_original';
  checked.push({key:v.key,title:v.title,url,sha256,source_tag:original?'Original source':'Exploratory concept',note:original?'User-supplied original artwork. Preserved as reusable source material; not an approved brand asset.':'Recreated exploratory artwork from the supplied Fairway Studio mockup. Reusable starter asset; not an approved design or verified in-app generation.'});
 }
 const output=path.resolve(args.output||path.join(root,'supabase/starter-library-files.sql'));
 fs.writeFileSync(output,buildLibraryFileSql(manifest,checked));
 fs.writeFileSync(output.replace(/\.sql$/,'.verification.json'),JSON.stringify({verified_at:new Date().toISOString(),origin:EXPECTED_ORIGIN,assets:checked},null,2)+'\n');
 console.log(JSON.stringify({prepared_only:true,output,verified_assets:checked.length},null,2));
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
