import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {loadModule} from './media-test-harness.mjs';
const {fashionSamples,garmentCategories}=loadModule('lib/studio/fashion-samples.ts');
test('golf product shells each have actual distinct front, back and construction-detail assets',()=>{
 const shells=fashionSamples.filter(s=>s.kind==='shell');assert.equal(shells.length,60);assert.equal(new Set(shells.map(s=>s.id)).size,60);
 for(const front of shells.filter(s=>s.view==='front')){const stem=front.id.replace(/-front$/,'');const views=['front','back','detail'].map(view=>shells.find(s=>s.id===`${stem}-${view}`));assert.ok(views.every(Boolean));const assets=views.map(v=>fs.readFileSync(new URL(`../public${v.image}`,import.meta.url),'utf8'));assert.equal(new Set(assets).size,3);assert.ok(assets.every(svg=>svg.includes('<svg')));}
 for(const c of ['Polos','Skorts','Layers','Outerwear','Headwear','Golf bags','Accessories'])assert.ok(garmentCategories.includes(c));
});
test('golf material references avoid claiming verified fabric performance',()=>{
 const fabrics=fashionSamples.filter(s=>s.kind==='fabric');assert.equal(fabrics.length,10);assert.ok(fabrics.some(s=>s.title==='Performance pique'));assert.ok(fabrics.some(s=>s.title==='Breathable mesh'));
 for(const f of fabrics){assert.match(f.description,/require verification/);assert.ok(fs.existsSync(new URL(`../public${f.image}`,import.meta.url)));}
});
