/** Deterministic, synthetic fixtures. No user files, network inputs or API calls. */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
const root=new URL('../tests/fixtures/media/',import.meta.url).pathname
fs.mkdirSync(root,{recursive:true})
const ffmpeg=process.env.STUDIO_MEDIA_FFMPEG_PATH||'/usr/bin/ffmpeg'
const run=(args)=>execFileSync(ffmpeg,['-nostdin','-y','-hide_banner','-loglevel','error',...args],{stdio:'pipe',timeout:60000})
for(const [name,codec,format,extra] of [
 ['h264.mp4','libx264','mp4',[]],
 ['hevc.mov','libx265','mov',['-x265-params','pools=1:frame-threads=1:log-level=error','-tag:v','hvc1']],
 ['vp9.mkv','libvpx-vp9','matroska',[]],
 ['silent.mp4','libx264','mp4',[]],
 ['hdr.mov','libx265','mov',['-x265-params','pools=1:frame-threads=1:log-level=error:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc','-tag:v','hvc1','-pix_fmt','yuv420p10le','-color_trc','smpte2084','-color_primaries','bt2020','-colorspace','bt2020nc']]
]) {
 const silent=name.startsWith('silent')
 run(['-f','lavfi','-i','testsrc2=size=160x96:rate=24',...(!silent?['-f','lavfi','-i','sine=frequency=440:sample_rate=48000']:[]),'-t','0.5','-c:v',codec,'-threads','2',...extra,...(!silent?['-c:a',name==='vp9.mkv'?'libopus':'aac']:[]),'-f',format,path.join(root,name)])
}
run(['-display_rotation','90','-i',path.join(root,'h264.mp4'),'-c','copy',path.join(root,'rotated.mov')])
run(['-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','0.5','-c:a','libmp3lame',path.join(root,'tone.mp3')])
for(const ext of ['jpg','png','webp','gif','avif'])run(['-f','lavfi','-i','testsrc2=size=160x96:rate=1','-frames:v','1','-threads','2',path.join(root,'pattern.'+ext)])
console.log('Synthetic media fixtures generated.')
