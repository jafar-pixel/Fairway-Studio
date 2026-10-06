/** Linux native worker. Never execute user-supplied commands, paths, flags or network inputs. */
import { spawn } from "node:child_process";
import { access, mkdtemp, rm, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { MAX_MEDIA_BYTES, mediaKind } from "../media";
import { MediaError } from "./validation";
export const NATIVE_LIMITS = { imagePixels:50_000_000, videoPixels:8_847_360, videoSeconds:600, audioSeconds:1800, memoryBytes:2_147_483_648, outputBytes:MAX_MEDIA_BYTES, wallMs:150_000 };
export function nativePaths() { return {ffmpeg:process.env.STUDIO_MEDIA_FFMPEG_PATH || "/usr/bin/ffmpeg", ffprobe:process.env.STUDIO_MEDIA_FFPROBE_PATH || "/usr/bin/ffprobe", magick:process.env.STUDIO_MEDIA_MAGICK_PATH || "/usr/bin/magick", prlimit:process.env.STUDIO_MEDIA_PRLIMIT_PATH || "/usr/bin/prlimit"}; }
async function nativeExecutablesExist() { try { if(process.platform!=="linux") return false; for(const p of Object.values(nativePaths())) {if(!isAbsolute(p))return false;await access(p,1);}return true; } catch{return false;} }
export function runNative(executable: string, args: string[], cwd: string, timeoutMs=NATIVE_LIMITS.wallMs, extraEnv: Record<string,string>={}) {
  const paths=nativePaths();
  if(!Object.values(paths).includes(executable) || !isAbsolute(executable)) throw new MediaError("WORKER_SETUP_REQUIRED","The native media worker is not configured.",503);
  return new Promise<string>((resolve,reject)=>{
    const child=spawn(paths.prlimit,[`--as=${NATIVE_LIMITS.memoryBytes}`,"--cpu=155","--nofile=64",`--fsize=${NATIVE_LIMITS.outputBytes}`,"--core=0","--",executable,...args],{
      cwd,stdio:["ignore","pipe","pipe"],env:{NODE_ENV:"production",PATH:"/usr/bin:/bin",LANG:"C.UTF-8",HOME:cwd,TMPDIR:cwd,OMP_NUM_THREADS:"2",...extraEnv},shell:false,detached:true,
    });
    let stdout="",total=0,killed=false;
    const kill=()=>{killed=true;try{if(child.pid)process.kill(-child.pid,"SIGKILL");}catch{child.kill("SIGKILL");}};
    const timer=setTimeout(kill,timeoutMs);
    child.stdout.on("data",b=>{total+=b.length;if(total>128*1024)kill();else stdout+=b.toString();});
    child.stderr.on("data",b=>{total+=b.length;if(total>128*1024)kill();});
    child.once("error",()=>{clearTimeout(timer);reject(new MediaError("WORKER_SETUP_REQUIRED","The native media worker is unavailable.",503));});
    child.once("close",code=>{clearTimeout(timer);if(killed || code!==0)reject(new MediaError(killed || code===null ?"PROCESSING_TOO_COMPLEX":"INVALID_MEDIA",killed || code===null ?"This media exceeds the safe preview-processing budget. Your original is preserved.":"This file could not be decoded safely. Your original is preserved."));else resolve(stdout);});
  });
}
export type NativeCapabilities = { available:boolean; versions?:{ffmpeg:string;imageMagick:string}; reason?:string };
let capabilityPromise:Promise<NativeCapabilities>|undefined;
/** Check decoders, encoders, containers and HDR filters, not merely binary filenames. */
export function nativeCapabilities():Promise<NativeCapabilities> {
  return capabilityPromise??=(async()=>{
    if(!await nativeExecutablesExist())return {available:false,reason:"Required Linux native tools or prlimit are missing."};
    const cwd=await mkdtemp(join(tmpdir(),"fairway-media-check-"));
    try {
      const p=nativePaths();
      const decoders=await runNative(p.ffmpeg,["-hide_banner","-decoders"],cwd,10000);
      const encoders=await runNative(p.ffmpeg,["-hide_banner","-encoders"],cwd,10000);
      const demuxers=await runNative(p.ffmpeg,["-hide_banner","-demuxers"],cwd,10000);
      const muxers=await runNative(p.ffmpeg,["-hide_banner","-muxers"],cwd,10000);
      const filters=await runNative(p.ffmpeg,["-hide_banner","-filters"],cwd,10000);
      const formats=await runNative(p.magick,["-list","format"],cwd,10000);
      const ffmpeg=await runNative(p.ffmpeg,["-version"],cwd,10000);
      await runNative(p.ffprobe,["-version"],cwd,10000);
      const imageMagick=await runNative(p.magick,["-version"],cwd,10000);
      const has=(text:string,name:string)=>new RegExp("(?:^|\\s)"+name+"(?:[ ,]|$)","m").test(text);
      if(!["h264","hevc","mp3","aac"].every(x=>has(decoders,x)) || !["libx264","aac"].every(x=>has(encoders,x)) ||
        !["mov","matroska","mp3"].every(x=>has(demuxers,x)) || !has(muxers,"mp4") ||
        !["zscale","tonemap","scale","fps"].every(x=>has(filters,x)) || !/HEIC\s+HEIC\s+r/.test(formats) || !/heic/.test(imageMagick))
        return {available:false,reason:"The installed FFmpeg/libheif build lacks required codecs or filters."};
      return {available:true,versions:{ffmpeg:ffmpeg.split("\n")[0],imageMagick:imageMagick.split("\n")[0]}};
    } catch{return {available:false,reason:"Native tools failed their resource-constrained capability check."};}
    finally {await rm(cwd,{recursive:true,force:true});}
  })();
}
export async function nativeAvailable(){return (await nativeCapabilities()).available;}
export type NativeProbe = {streams?:Array<{index:number;codec_type:string;codec_name:string;width?:number;height?:number;pix_fmt?:string;duration?:string;avg_frame_rate?:string;channels?:number;color_transfer?:string;color_primaries?:string;color_space?:string;disposition?:{attached_pic?:number};side_data_list?:Array<{rotation?:number}>}>;format?:{format_name?:string;duration?:string};};
const ffInput=(type:string)=>["-protocol_whitelist","file","-format_whitelist",type==="audio/mpeg"?"mp3":type==="video/x-matroska"?"matroska,webm":"mov","-probesize","5000000","-analyzeduration","5000000","-max_alloc","268435456","-threads","2"];
export async function probeMedia(input:string,type:string,cwd:string,budget=20000):Promise<NativeProbe> {
  const raw=await runNative(nativePaths().ffprobe,["-v","error",...ffInput(type),"-show_entries","format=format_name,duration:stream=index,codec_type,codec_name,width,height,pix_fmt,duration,avg_frame_rate,channels,color_transfer,color_primaries,color_space:stream_disposition=attached_pic:stream_side_data=rotation","-of","json",input],cwd,Math.min(20000,budget));
  try{return JSON.parse(raw);}catch{throw new MediaError("INVALID_MEDIA","Media details could not be read safely.");}
}
export function validateProbe(probe:NativeProbe,type:string) {
  const streams=probe.streams??[]; if(streams.length>16) throw new MediaError("PROCESSING_TOO_COMPLEX","This file contains too many streams for a safe preview.");
  const video=streams.find(s=>s.codec_type==="video"&&!s.disposition?.attached_pic), audio=streams.find(s=>s.codec_type==="audio");
  const duration=Number(probe.format?.duration || video?.duration || audio?.duration);
  const format=probe.format?.format_name?.split(",")??[];
  if(!Number.isFinite(duration)||duration<=0||duration>(type==="audio/mpeg"?NATIVE_LIMITS.audioSeconds:NATIVE_LIMITS.videoSeconds)) throw new MediaError("PROCESSING_TOO_COMPLEX","This media exceeds the supported preview duration (10 minutes video or 30 minutes audio). Your original is preserved.");
  if(type==="audio/mpeg") {
    if(!format.includes("mp3")||!audio||audio.codec_name!=="mp3"||video)throw new MediaError("INVALID_MEDIA","This file is not a valid MP3 recording.");
  } else {
    if(!video||!["h264","hevc","vp8","vp9","av1","mpeg4"].includes(video.codec_name)||!video.width||!video.height||video.width*video.height>NATIVE_LIMITS.videoPixels||video.width>4096||video.height>4096)throw new MediaError("PROCESSING_TOO_COMPLEX","This video's codec or dimensions exceed the safe preview limits.");
    if(type==="video/x-matroska"?!format.includes("matroska"):!format.includes("mov"))throw new MediaError("INVALID_MEDIA","Video container does not match its upload type.");
    if((video.color_primaries==="bt2020"||video.color_space==="bt2020nc")&&!["smpte2084","arib-std-b67","bt2020-10","bt2020-12","bt709"].includes(video.color_transfer??""))throw new MediaError("UNSUPPORTED_COLOR","This wide-gamut video is missing the color-transfer details needed for a faithful preview. Your original is preserved.");
    const [n,d]=String(video.avg_frame_rate||"0/1").split("/").map(Number),fps=n/d;
    if(!Number.isFinite(fps)||fps<=0||fps>120)throw new MediaError("PROCESSING_TOO_COMPLEX","This video's frame rate is outside the safe preview limits.");
    if(audio && !["aac","mp3","opus","vorbis","pcm_s16le","pcm_s24le","alac","ac3","eac3","flac"].includes(audio.codec_name))throw new MediaError("UNSUPPORTED_AUDIO","This video's audio codec cannot be converted safely.");
  }
  if(audio && (audio.channels??0)>8)throw new MediaError("PROCESSING_TOO_COMPLEX","This media has too many audio channels.");
  return {video,audio,duration};
}
export function videoFilter(probe:NativeProbe) {
  const v=probe.streams?.find(s=>s.codec_type==="video"&&!s.disposition?.attached_pic);
  const hdr=["smpte2084","arib-std-b67"].includes(v?.color_transfer??"");
  const color=hdr?"zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=limited,":"";
  return `${color}scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,fps=30,format=yuv420p`;
}
async function imagePolicy(cwd:string) {
  const policy=`<policymap><policy domain="delegate" rights="none" pattern="*"/><policy domain="filter" rights="none" pattern="*"/><policy domain="coder" rights="none" pattern="*"/><policy domain="coder" rights="read|write" pattern="{HEIC,JPEG,JPG,PNG,WEBP,GIF,AVIF,NULL}"/><policy domain="path" rights="none" pattern="@*"/><policy domain="resource" name="width" value="16384"/><policy domain="resource" name="height" value="16384"/><policy domain="resource" name="list-length" value="256"/><policy domain="resource" name="memory" value="512MiB"/><policy domain="resource" name="map" value="512MiB"/><policy domain="resource" name="disk" value="256MiB"/><policy domain="resource" name="thread" value="2"/><policy domain="resource" name="time" value="100"/></policymap>`;
  await writeFile(join(cwd,"policy.xml"),policy,{mode:0o600});return {MAGICK_CONFIGURE_PATH:cwd,MAGICK_TEMPORARY_PATH:cwd};
}
export async function convertNative(input:string,type:string,cwd:string) {
  const deadline=Date.now()+NATIVE_LIMITS.wallMs;
  const execute=(tool:string,args:string[],directory:string,timeout=NATIVE_LIMITS.wallMs,env:Record<string,string>={})=>runNative(tool,args,directory,Math.max(1,Math.min(timeout,deadline-Date.now())),env);
  if(!await nativeAvailable())throw new MediaError("WORKER_SETUP_REQUIRED","Native preview conversion is not configured on this server.",503);
  if(mediaKind(type)==="image") {
    const env=await imagePolicy(cwd),coder=type.startsWith("image/hei")?"HEIC":type.slice(6).toUpperCase(),source=`${coder}:${input}`;
    const details=await execute(nativePaths().magick,["identify","-ping","-format","%w %h\\n",source],cwd,20000,env);
    const dimensions=details.trim().split(/\n/).map(line=>line.trim().split(" ").map(Number));
    if(!dimensions.length||dimensions.some(([w,h])=>!w||!h||w*h>NATIVE_LIMITS.imagePixels)||dimensions.reduce((sum,[w,h])=>sum+w*h,0)>100_000_000)throw new MediaError("PROCESSING_TOO_COMPLEX","This image exceeds the safe decoded-pixel budget. Your original is preserved.");
    const [width,height]=dimensions[0];
    if(type.startsWith("image/hei")) {
      const output=join(cwd,"preview.jpg");
      await execute(nativePaths().magick,[`${source}[0]`,"-auto-orient","-colorspace","sRGB","-thumbnail","2560x2560>","-background","white","-alpha","remove","-alpha","off","-strip","-quality","88",output],cwd,100000,env);
      await execute(nativePaths().magick,[`JPEG:${output}`,"null:"],cwd,20000,env);
      return {output,type:"image/jpeg",metadata:{width,height,frames:dimensions.length,conversion:"libheif-to-srgb-jpeg"},originalReady:false};
    }
    // Decode the complete image before claiming native browser compatibility.
    await execute(nativePaths().magick,[source,"null:"],cwd,100000,env);
    return {output:null,type,metadata:{width,height,frames:dimensions.length},originalReady:true};
  }
  const probe=await probeMedia(input,type,cwd,Math.max(1,deadline-Date.now())),{video,audio,duration}=validateProbe(probe,type);
  const metadata={duration,width:video?.width,height:video?.height,videoCodec:video?.codec_name,audioCodec:audio?.codec_name,hdr:["smpte2084","arib-std-b67"].includes(video?.color_transfer??"")};
  if(type==="audio/mpeg") {
    await execute(nativePaths().ffmpeg,["-nostdin","-v","error","-xerror",...ffInput(type),"-i",input,"-map","0:a:0","-vn","-sn","-dn","-threads","2","-f","null","-"],cwd);
    return {output:null,type,metadata,originalReady:true};
  }
  const output=join(cwd,"preview.mp4");
  await execute(nativePaths().ffmpeg,["-nostdin","-v","error","-xerror",...ffInput(type),"-i",input,"-map",`0:${video!.index}`,"-map","0:a:0?","-sn","-dn","-map_metadata","-1","-map_chapters","-1","-filter_threads","2","-vf",videoFilter(probe),"-c:v","libx264","-threads","2","-preset","veryfast","-crf","24","-maxrate","1100k","-bufsize","2200k","-pix_fmt","yuv420p","-c:a","aac","-b:a","128k","-ac","2","-ar","48000","-movflags","+faststart","-metadata:s:v:0","rotate=0","-f","mp4",output],cwd);
  const resultProbe=await probeMedia(output,"video/mp4",cwd,Math.max(1,deadline-Date.now())),out=validateProbe(resultProbe,"video/mp4");
  if(out.video?.codec_name!=="h264"||out.video.pix_fmt!=="yuv420p"||(audio&&out.audio?.codec_name!=="aac")||Math.abs(out.duration-duration)>Math.max(1,duration*0.02))throw new MediaError("OUTPUT_INVALID","The preview did not pass playback verification. Your original is preserved.");
  return {output,type:"video/mp4",metadata,originalReady:false};
}
export async function inspectOutput(path:string) { const s=await stat(path); if(!s.isFile()||s.size<1||s.size>MAX_MEDIA_BYTES)throw new MediaError("OUTPUT_TOO_LARGE","The converted preview exceeds its safe storage budget.");const bytes=await readFile(path);return {bytes,size:s.size,sha256:createHash("sha256").update(bytes).digest("hex")}; }
