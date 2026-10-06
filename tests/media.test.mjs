import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mediaModules } from './media-test-loader.mjs'
const {media,validation,native,storage,request,cleanup}=mediaModules();after(cleanup)
const id='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222'
const ftyp=(brand,compatible=[])=>{const b=Buffer.alloc(16+compatible.length*4);b.writeUInt32BE(b.length);b.write('ftyp',4);b.write(brand,8);compatible.forEach((s,i)=>b.write(s,16+4*i));return b}
test('decimal 100 MB boundary is shared: exact allowed, +1/empty/fraction/NaN denied',()=>{
 assert.equal(media.MAX_MEDIA_BYTES,100000000);assert.ok(media.validateMediaSize(100000000));for(const n of [0,-1,100000001,NaN,1.5,Infinity])assert.equal(media.validateMediaSize(n),false)
})
test('supported aliases and empty MIME are inferred only from an allowed extension',()=>{
 for(const [name,type] of [['IMG.HEIC','image/heic'],['i.heif','image/heif'],['i.MOV','video/quicktime'],['i.mkv','video/x-matroska'],['i.mp3','audio/mpeg']])assert.equal(media.inferMediaType(name,''),type)
 assert.equal(media.inferMediaType('a.mp3','audio/mp3'),'audio/mpeg');assert.equal(media.inferMediaType('a.mkv','application/x-matroska'),'video/x-matroska')
 for(const [name,type] of [['a.mp4','image/jpeg'],['x.svg','image/svg+xml'],['x.html',''],['x.heic.exe','image/heic']])assert.equal(media.inferMediaType(name,type),null)
})
test('storage paths enforce current workspace, uploader and immutable safe filenames',()=>{
 const p=`${id}/${user}/some-random_file.heic`;assert.ok(media.isMediaPath(p,id,user))
 for(const path of [p+'/x',p.replace('some-random_file','../file'),p.replace('heic','html'),p.replace(user,id)])assert.equal(media.isMediaPath(path,id,user),false)
})
test('signature verification rejects mismatches, fake SVG/HTML and fake ftyp brands',()=>{
 assert.equal(validation.validateHeader('a.heic','image/heic',100,ftyp('heic')),'image/heic')
 assert.equal(validation.validateHeader('a.heif','image/heif',100,ftyp('heic')),'image/heif')
 assert.equal(validation.validateHeader('a.mov','video/quicktime',100,ftyp('qt  ')),'video/quicktime')
 for(const b of [Buffer.from('<svg width="12"></svg>'),Buffer.from('<html>evil</html>'),Buffer.from('0000ftypnotvalidheic'),ftyp('xxxx')])assert.throws(()=>validation.validateHeader('a.heic','image/heic',100,b))
 const bad=ftyp('xxxx');assert.equal(validation.detectSignature(Buffer.concat([bad,Buffer.from('heic')])),null)
 assert.throws(()=>validation.validateHeader('a.mp4','video/mp4',100,ftyp('heic')))
})
test('bounded video probe and explicit HDR tone-mapping contract',()=>{
 const probe={format:{format_name:'mov,mp4',duration:'2'},streams:[{index:0,codec_type:'video',codec_name:'hevc',width:1920,height:1080,avg_frame_rate:'30/1',color_transfer:'smpte2084'}]}
 assert.equal(native.validateProbe(probe,'video/quicktime').duration,2);assert.match(native.videoFilter(probe),/tonemap=tonemap=hable/)
 assert.throws(()=>native.validateProbe({...probe,format:{...probe.format,duration:'601'}},'video/mp4'))
 assert.throws(()=>native.validateProbe({...probe,streams:[{...probe.streams[0],width:16384}]},'video/mp4'))
 assert.throws(()=>native.validateProbe({...probe,streams:[{...probe.streams[0],avg_frame_rate:'0/0'}]},'video/mp4'))
})
test('signed storage destinations never allow external hosts, HTTP or credentials',()=>{
 storage.approvedStorageUrl('https://xljhxmyigtxhjtxxzuwk.supabase.co/storage/v1/object/sign/b/p?token=x')
 for(const url of ['https://evil.test/storage/v1/x','http://xljhxmyigtxhjtxxzuwk.supabase.co/storage/v1/x','https://xljhxmyigtxhjtxxzuwk.supabase.co:444/storage/v1/x','https://user:pass@xljhxmyigtxhjtxxzuwk.supabase.co/storage/v1/x'])assert.throws(()=>storage.approvedStorageUrl(url))
})
test('migration retains private originals and makes completion/service leases privileged',()=>{
 const sql=fs.readFileSync(new URL('../supabase/pending-media.sql',import.meta.url),'utf8')
 for(const token of ['file_size_limit=100000000','public=false','enable row level security','studio_media_preview_visibility','studio_media_preview_no_client_write','for update skip locked','lease_until<now()','studio-media-user:','grant execute on function public.studio_claim_media(uuid) to service_role'])assert.ok(sql.includes(token),token)
 assert.doesNotMatch(sql,/drop policy.*studio_workspace_media/);assert.match(sql,/revoke all on public.studio_media_jobs from public,anon,authenticated/)
})

test('metadata body reader enforces streaming bytes and rejects malformed JSON',async()=>{
 assert.deepEqual(await request.readMediaJson(new Request('https://app.test',{method:'POST',body:'{"title":"okay"}'})),{title:'okay'})
 for(const body of ['null','[]','{'])await assert.rejects(request.readMediaJson(new Request('https://app.test',{method:'POST',body})),{status:400})
 await assert.rejects(request.readMediaJson(new Request('https://app.test',{method:'POST',body:'x'.repeat(16001)})),{status:413})
})

test('Apple image container MIME variants canonicalize by extension without accepting unrelated types',()=>{
 for(const name of ['image.heic','image.heif'])for(const type of ['image/heic','image/heif','image/heic-sequence','image/heif-sequence'])assert.equal(media.inferMediaType(name,type),name.endsWith('heic')?'image/heic':'image/heif');
 for(const type of ['image/jpeg','video/mp4','application/pdf'])assert.equal(media.inferMediaType('image.heic',type),null);
})
