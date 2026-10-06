import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { mediaModules } from './media-test-loader.mjs'
const m=mediaModules(),root=new URL('./fixtures/media/',import.meta.url).pathname
const hash=(file)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const samples=[['pattern.jpg','image/jpeg'],['pattern.png','image/png'],['pattern.webp','image/webp'],['pattern.gif','image/gif'],['pattern.avif','image/avif'],['tone.mp3','audio/mpeg'],['h264.mp4','video/mp4'],['hevc.mov','video/quicktime'],['vp9.mkv','video/x-matroska'],['silent.mp4','video/mp4'],['rotated.mov','video/quicktime'],['hdr.mov','video/quicktime']]
if(process.env.MEDIA_HEIC_FIXTURE)samples.push([process.env.MEDIA_HEIC_FIXTURE,'image/heic'])
try {
 const capabilities=await m.native.nativeCapabilities();assert.equal(capabilities.available,true,JSON.stringify(capabilities));console.log(JSON.stringify(capabilities))
 for(const [name,type] of samples) {
  const input=path.isAbsolute(name)?name:path.join(root,name),cwd=fs.mkdtempSync(path.join(os.tmpdir(),'fairway-media-native-'))
  try {
   const original=hash(input);m.validation.validateHeader(input,type,fs.statSync(input).size,fs.readFileSync(input).subarray(0,65536))
   const result=await m.native.convertNative(input,type,cwd);assert.equal(hash(input),original,'original bytes changed')
   if(result.output){const output=await m.native.inspectOutput(result.output);assert.ok(output.size>0);if(type.startsWith('image/hei'))assert.equal(m.validation.detectSignature(output.bytes),'image/jpeg')}
   if(name==='tone.mp3'){assert.equal(result.originalReady,true);assert.equal(result.output,null)}
   if(name==='silent.mp4'){const p=await m.native.probeMedia(result.output,'video/mp4',cwd);assert.equal(p.streams.filter(s=>s.codec_type==='audio').length,0)}
   if(name==='rotated.mov'){const p=await m.native.probeMedia(result.output,'video/mp4',cwd);const v=p.streams.find(s=>s.codec_type==='video');assert.equal(v.width,96);assert.equal(v.height,160)}
   if(name==='hdr.mov'){const p=await m.native.probeMedia(result.output,'video/mp4',cwd);assert.ok(!['smpte2084','arib-std-b67'].includes(p.streams.find(s=>s.codec_type==='video').color_transfer))}
   console.log(JSON.stringify({file:path.basename(name),status:'passed',originalUnchanged:true,preview:result.type,...result.metadata}))
  }finally{fs.rmSync(cwd,{recursive:true,force:true})}
 }
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'fairway-media-corrupt-'));try{const p=path.join(cwd,'broken.jpg');fs.writeFileSync(p,Buffer.from([255,216,255,...Array(20).fill(0)]));await assert.rejects(m.native.convertNative(p,'image/jpeg',cwd));console.log('Corrupt native decode rejected.')}finally{fs.rmSync(cwd,{recursive:true,force:true})}
}finally{m.cleanup()}
