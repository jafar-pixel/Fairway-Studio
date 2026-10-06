import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'
export function mediaModules() {
 const root=new URL('../',import.meta.url).pathname
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'fairway-media-tests-'))
 for(const file of ['lib/studio/media.ts','lib/studio/media/validation.ts','lib/studio/media/storage.ts','lib/studio/media/native.ts','lib/studio/media/request.ts']) {
  const dest=path.join(out,file.replace(/\.ts$/,'.js'));fs.mkdirSync(path.dirname(dest),{recursive:true})
  fs.writeFileSync(dest,ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)
 }
 const require=createRequire(import.meta.url)
 return {media:require(path.join(out,'lib/studio/media.js')),validation:require(path.join(out,'lib/studio/media/validation.js')),native:require(path.join(out,'lib/studio/media/native.js')),request:require(path.join(out,'lib/studio/media/request.js')),storage:require(path.join(out,'lib/studio/media/storage.js')),cleanup:()=>fs.rmSync(out,{recursive:true,force:true})}
}
