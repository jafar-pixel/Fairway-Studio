/** Vercel-compatible, packaged binaries. No system FFmpeg/ImageMagick/prlimit dependency. */
import {spawn} from 'node:child_process';
import {access,readFile,stat} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {MAX_MEDIA_BYTES,mediaKind} from '../media';
import {MediaError} from './validation';
import {NATIVE_LIMITS,validateProbe,videoFilter,type NativeProbe} from './native';
export function portablePaths(){const root=process.cwd();return {ffmpeg:join(root,'vendor/media-runtime/bin/ffmpeg'),ffprobe:join(root,'vendor/media-runtime/bin/ffprobe'),limiter:join(root,'vendor/media-runtime/media-limit'),imageWorker:join(root,'vendor/media-runtime/image/worker.cjs')};}
export async function runPortable(executable:string,args:string[],cwd:string,timeout=150000){
 const p=portablePaths();if(![p.ffmpeg,p.ffprobe,process.execPath].includes(executable)||!isAbsolute(executable))throw new MediaError('WORKER_SETUP_REQUIRED','The packaged media runtime is unavailable.',503);
 return new Promise<string>((resolve,reject)=>{
  const child=spawn(p.limiter,[executable,...args],{cwd,shell:false,detached:true,stdio:['ignore','pipe','pipe'],env:{NODE_ENV:'production',PATH:'/usr/bin:/bin',LANG:'C.UTF-8',HOME:cwd,TMPDIR:cwd,UV_THREADPOOL_SIZE:'1',MALLOC_ARENA_MAX:'2',OMP_NUM_THREADS:'2',SHARP_IGNORE_GLOBAL_LIBVIPS:'1'}});
  let stdout='',stderr='',bytes=0,killed=false;const kill=()=>{killed=true;try{if(child.pid)process.kill(-child.pid,'SIGKILL')}catch{child.kill('SIGKILL')}};
  const timer=setTimeout(kill,Math.max(1,timeout));
  child.stdout.on('data',(b:Buffer)=>{bytes+=b.length;if(bytes>128*1024)kill();else stdout+=b.toString()});
  child.stderr.on('data',(b:Buffer)=>{bytes+=b.length;if(bytes>128*1024)kill();else stderr+=b.toString()});
  child.once('error',()=>{clearTimeout(timer);reject(new MediaError('WORKER_SETUP_REQUIRED','The packaged native media runtime could not start.',503))});
  child.once('close',code=>{clearTimeout(timer);if(code===0&&!killed)resolve(stdout);else{const complex=killed||code===null||stderr.includes('PROCESSING_TOO_COMPLEX');reject(new MediaError(complex?'PROCESSING_TOO_COMPLEX':'INVALID_MEDIA',complex?'This file exceeded the bounded preview-processing budget. Your original is preserved.':'This file could not be decoded safely. Your original is preserved.'))}});
 });
}
let checked:Promise<boolean>|undefined;
export async function nativeAvailable(){return checked??=(async()=>{try{
 if(process.platform!=='linux'||process.arch!=='x64')return false;const p=portablePaths();for(const path of Object.values(p))await access(path,path===p.imageWorker?4:1);
 const cwd='/tmp',decoders=await runPortable(p.ffmpeg,['-hide_banner','-decoders'],cwd,10000),encoders=await runPortable(p.ffmpeg,['-hide_banner','-encoders'],cwd,10000),filters=await runPortable(p.ffmpeg,['-hide_banner','-filters'],cwd,10000);
 const has=(text:string,name:string)=>new RegExp('(?:^|\\s)'+name+'(?:[ ,]|$)','m').test(text);
 return ['hevc','h264','aac','mp3'].every(v=>has(decoders,v))&&['libx264','aac'].every(v=>has(encoders,v))&&['zscale','tonemap'].every(v=>has(filters,v));
 }catch{return false}})();}
const inputArgs=(type:string)=>['-protocol_whitelist','file','-format_whitelist',type==='audio/mpeg'?'mp3':type==='video/x-matroska'?'matroska,webm':'mov','-probesize','5000000','-analyzeduration','5000000','-max_alloc','268435456','-threads','2'];
export async function probeMedia(input:string,type:string,cwd:string,budget=20000):Promise<NativeProbe>{
 const result=await runPortable(portablePaths().ffprobe,['-v','error',...inputArgs(type),'-show_entries','format=format_name,duration:stream=index,codec_type,codec_name,width,height,pix_fmt,duration,avg_frame_rate,channels,color_transfer,color_primaries,color_space:stream_disposition=attached_pic:stream_side_data=rotation','-of','json',input],cwd,Math.min(20000,budget));
 try{return JSON.parse(result)}catch{throw new MediaError('INVALID_MEDIA','Media details could not be read safely.')}
}
export async function convertNative(input:string,type:string,cwd:string){
 if(!await nativeAvailable())throw new MediaError('WORKER_SETUP_REQUIRED','The packaged media runtime is not available.',503);
 const deadline=Date.now()+150000,remaining=()=>Math.max(1,deadline-Date.now()),p=portablePaths();
 if(mediaKind(type)==='image'){
  const result=await runPortable(process.execPath,['--disable-wasm-trap-handler','--max-old-space-size=256',p.imageWorker,input,type,cwd],cwd,Math.min(100000,remaining()));
  const line=result.split('\n').find(line=>line.startsWith('FAIRWAY_MEDIA_RESULT='));if(!line)throw new MediaError('INVALID_MEDIA','Image decoding could not be verified.');return JSON.parse(line.slice('FAIRWAY_MEDIA_RESULT='.length)) as {output:string|null;type:string;metadata:Record<string,unknown>;originalReady:boolean};
 }
 const probe=await probeMedia(input,type,cwd,remaining()),{video,audio,duration}=validateProbe(probe,type);
 const metadata={duration,width:video?.width,height:video?.height,videoCodec:video?.codec_name,audioCodec:audio?.codec_name,hdr:['smpte2084','arib-std-b67'].includes(video?.color_transfer??'')};
 if(type==='audio/mpeg'){
  await runPortable(p.ffmpeg,['-nostdin','-v','error','-xerror',...inputArgs(type),'-i',input,'-map','0:a:0','-vn','-sn','-dn','-threads','2','-f','null','-'],cwd,remaining());return {output:null,type,metadata,originalReady:true};
 }
 const output=join(cwd,'preview.mp4');
 await runPortable(p.ffmpeg,['-nostdin','-v','error','-xerror',...inputArgs(type),'-i',input,'-map',`0:${video!.index}`,'-map','0:a:0?','-sn','-dn','-map_metadata','-1','-map_chapters','-1','-filter_threads','2','-vf',videoFilter(probe),'-c:v','libx264','-threads','2','-preset','veryfast','-crf','24','-maxrate','1100k','-bufsize','2200k','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-ac','2','-ar','48000','-movflags','+faststart','-metadata:s:v:0','rotate=0','-f','mp4',output],cwd,remaining());
 const out=validateProbe(await probeMedia(output,'video/mp4',cwd,remaining()),'video/mp4');
 if(out.video?.codec_name!=='h264'||out.video.pix_fmt!=='yuv420p'||(audio&&out.audio?.codec_name!=='aac')||Math.abs(out.duration-duration)>Math.max(1,duration*.02))throw new MediaError('OUTPUT_INVALID','The converted preview did not pass playback verification. Your original is preserved.');
 return {output,type:'video/mp4',metadata,originalReady:false};
}
export async function inspectOutput(path:string){const s=await stat(path);if(!s.isFile()||s.size<1||s.size>MAX_MEDIA_BYTES)throw new MediaError('OUTPUT_TOO_LARGE','The preview exceeded the safe output budget.');const bytes=await readFile(path);return {bytes,size:s.size,sha256:createHash('sha256').update(bytes).digest('hex')};}
