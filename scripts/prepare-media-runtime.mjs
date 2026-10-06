/** Fetch a verified upstream build at build time; never download executable code during requests. */
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';
const URL='https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-09-30-13-08/ffmpeg-n9.0.2-17-g2a571b6068-linux64-gpl-shared-9.0.tar.xz';
// Exact BtbN asset #600951813, upstream FFmpeg 9.0.2 branch, build 2026-09-30.
// Last September build: upstream retains each month-end build for two years.
// https://github.com/BtbN/FFmpeg-Builds#release-retention-policy
// Date-pinned release and SHA-256; never trust an unverified replacement. Review before September 2028.
const SHA256='01a9764d0b5364b66cfeb4617557c64321b0e232e172ec73f0a701c5f7694326';
if(process.platform!=='linux'||process.arch!=='x64')throw new Error('The reviewed media runtime targets Linux x64.');
const stage=await fs.mkdtemp(path.join(os.tmpdir(),'fairway-media-package-')),destination=path.resolve('vendor/media-runtime');
try{
 const response=await fetch(URL,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw new Error('Media runtime download failed.');
 const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>100000000||createHash('sha256').update(bytes).digest('hex')!==SHA256)throw new Error('Media runtime checksum changed; review a new pinned release.');
 const archive=path.join(stage,'ffmpeg.tar.xz');await fs.writeFile(archive,bytes);execFileSync('tar',['-xJf',archive,'-C',stage,'--strip-components=1'],{timeout:60000});
 await fs.mkdir(path.join(destination,'bin'),{recursive:true});await fs.mkdir(path.join(destination,'lib'),{recursive:true});
 for(const file of ['ffmpeg','ffprobe'])await fs.copyFile(path.join(stage,'bin',file),path.join(destination,'bin',file));
 for(const file of await fs.readdir(path.join(stage,'lib'))){if(/^lib[a-z0-9]+\.so\.\d+$/.test(file))await fs.copyFile(path.join(stage,'lib',file),path.join(destination,'lib',file));}
 await fs.copyFile(path.join(stage,'LICENSE.txt'),path.join(destination,'FFMPEG-LICENSE.txt'));
 execFileSync('cc',['-O2','-s','scripts/vendor/media-limit.c','-o',path.join(destination,'media-limit')],{timeout:60000});
 for(const file of ['bin/ffmpeg','bin/ffprobe','media-limit'])await fs.chmod(path.join(destination,file),0o755);
 // Resolve from the package's real location: works for both pnpm's isolated store and npm.
 const rootRequire=createRequire(import.meta.url),image=path.join(destination,'image');
 await fs.mkdir(path.join(image,'node_modules'),{recursive:true});
 async function packageRoot(name,entry,resolver){let folder=path.dirname(await fs.realpath(resolver.resolve(entry)));while(true){try{const p=JSON.parse(await fs.readFile(path.join(folder,'package.json'),'utf8'));if(p.name===name)return folder}catch{}const parent=path.dirname(folder);if(parent===folder)throw new Error('Could not locate reviewed image dependency '+name);folder=parent;}}
 async function copyPackage(name,entry,resolver=rootRequire){const source=await packageRoot(name,entry,resolver);const dest=path.join(image,'node_modules',name);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.cp(source,dest,{recursive:true,dereference:true});return source;}
 const sharpRoot=await copyPackage('sharp','sharp'),sharpRequire=createRequire(path.join(sharpRoot,'package.json'));
 for(const name of ['@img/colour','detect-libc','semver'])await copyPackage(name,name,sharpRequire);
 await copyPackage('@img/sharp-linux-x64','@img/sharp-linux-x64/sharp.node',sharpRequire);
 await copyPackage('@img/sharp-libvips-linux-x64','@img/sharp-libvips-linux-x64/lib',sharpRequire);
 const heifRoot=await packageRoot('libheif-js','libheif-js/wasm-bundle',rootRequire),heifDest=path.join(image,'node_modules/libheif-js');
 for(const file of ['package.json','LICENSE','wasm-bundle.js','libheif-wasm/libheif-bundle.js','libheif-wasm/LICENSE']){await fs.mkdir(path.dirname(path.join(heifDest,file)),{recursive:true});await fs.copyFile(path.join(heifRoot,file),path.join(heifDest,file));}
 await fs.writeFile(path.join(image,'package.json'),'{"private":true,"type":"commonjs"}');
 await fs.copyFile('scripts/media-image-worker.cjs',path.join(image,'worker.cjs'));
 console.log('Pinned packaged FFmpeg, hard process limits and self-contained image dependencies prepared.');
}finally{await fs.rm(stage,{recursive:true,force:true});}
