/** Durable native worker process. Run only in an approved, supervised Linux environment.
 * No credentials are created, transmitted to native subprocesses, or logged. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import ts from 'typescript'
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
// Build only owned worker modules. A full dependency install (including TypeScript) is required.
const out=fs.mkdtempSync(path.join(root,'.media-worker-'))
for(const file of ['lib/studio/media.ts','lib/studio/media/validation.ts','lib/studio/media/storage.ts','lib/studio/media/native.ts','lib/studio/media/jobs.ts']){
 const dest=path.join(out,file.replace(/\.ts$/,'.js'));fs.mkdirSync(path.dirname(dest),{recursive:true})
 fs.writeFileSync(dest,ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)
}
const {mediaService,runMediaJob}=require(path.join(out,'lib/studio/media/jobs.js'))
const {nativeCapabilities,convertNative}=require(path.join(out,'lib/studio/media/native.js'))
let stopping=false;process.on('SIGTERM',()=>{stopping=true});process.on('SIGINT',()=>{stopping=true})
let heartbeat,service
async function selfTest(){
 const capability=await nativeCapabilities()
 if(!capability.available)throw new Error('Native capability verification failed.')
 // The HEIC fixture is explicitly configured by the operator. Do not fetch assets at startup.
 const heic=process.env.STUDIO_MEDIA_HEIC_TEST_PATH
 if(!heic||!path.isAbsolute(heic)||!fs.statSync(heic).isFile()||fs.statSync(heic).size>1000000)throw new Error('Verified HEIC decoder fixture is required.')
 for(const [input,type] of [[heic,'image/heic'],['hevc.mov','video/quicktime'],['vp9.mkv','video/x-matroska'],['silent.mp4','video/mp4'],['hdr.mov','video/quicktime']]){
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'fairway-worker-selftest-'))
  try{await convertNative(path.isAbsolute(input)?input:path.join(root,'tests/fixtures/media',input),type,cwd)}finally{fs.rmSync(cwd,{recursive:true,force:true})}
 }
 return capability
}
try{
 // Crashed processes cannot execute finally; remove only old owned worker temp directories.
 for(const base of [os.tmpdir(),root])for(const name of fs.readdirSync(base)){
  if(!(base===root?/^\.media-worker-/ : /^fairway-media-|^fairway-worker-selftest-/).test(name))continue
  const candidate=path.join(base,name),stat=fs.lstatSync(candidate)
  if(stat.isDirectory()&&stat.uid===process.getuid?.()&&Date.now()-stat.mtimeMs>3600000)fs.rmSync(candidate,{recursive:true,force:true})
 }
 const capability=await selfTest()
 if(process.argv.includes('--check')){
  process.stdout.write(JSON.stringify({selfTest:'passed',...capability})+'\n')
 }else{
  service=mediaService()
  const beat=async()=>{const {error}=await service.from('studio_media_worker_health').upsert({id:'native-loop',heartbeat_at:new Date().toISOString(),capable:true});if(error)throw new Error('Worker heartbeat unavailable.')}
  await beat();heartbeat=setInterval(()=>{beat().catch(()=>{stopping=true})},20000)
  while(!stopping){const job=await runMediaJob();if(job)process.stdout.write(JSON.stringify({jobId:job.id,status:job.status})+'\n');else await new Promise(r=>setTimeout(r,5000))}
 }
}catch{
 process.stderr.write('Media worker stopped: approved database connection, reviewed schema, HEIC fixture, or native runtime is unavailable. No credentials were logged.\n');process.exitCode=1
}finally{
 clearInterval(heartbeat)
 if(service)await service.from('studio_media_worker_health').update({capable:false,heartbeat_at:new Date().toISOString()}).eq('id','native-loop').then(()=>undefined,()=>undefined)
 fs.rmSync(out,{recursive:true,force:true})
}
