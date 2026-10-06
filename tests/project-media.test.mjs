import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../components/studio/projects.tsx',import.meta.url),'utf8');
test('canonical private canvas files use shared media viewer rather than image-only placement',()=>{
 assert.match(source,/!demo && n\.file_id && asset\?\.url\?\.startsWith\("supabase-storage:\/\/workspace-media\/"\)/);
 assert.match(source,/<MediaPlayer workspaceId=\{workspaceId\} fileId=\{asset\.id\}/);
 assert.match(source,/userId=\{userId\} addedBy=\{asset\.added_by\}/);
});
test('concept version selector preserves image-only contract',()=>{
 assert.match(source,/Library image \(optional\)/);
 assert.match(source,/avif\|gif\|jpe\?g\|png\|webp/);
 assert.match(source,/Video and audio can be linked to the canvas as references/);
});
test('upload metadata exposes persisted per-file tags',()=>{
 const ui=fs.readFileSync(new URL('../components/studio/media-upload.tsx',import.meta.url),'utf8');
 assert.match(ui,/Tags<input defaultValue=\{item\.metadata\.tags\.join/);
 assert.match(ui,/tags: \[\.\.\.new Set/);
});
