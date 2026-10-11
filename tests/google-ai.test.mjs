import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createGoogle } from '@ai-sdk/google';
import { generateImage, generateText } from 'ai';

const source = fs.readFileSync(new URL('../lib/studio/google-ai.ts', import.meta.url), 'utf8');
function load(env) {
  let options;
  class StudioError extends Error {}
  const context = { exports: {}, process: { env }, require(name) {
    if (name === '@ai-sdk/google') return { createGoogle: o => { options = o; return {}; } };
    if (name === './contracts') return { StudioError };
    throw Error(name);
  }};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  return { ...context.exports, options: () => options };
}
test('Google credentials are required; legacy Gateway settings cannot enable AI', () => {
  const f = load({ AI_GATEWAY_API_KEY: 'old', STUDIO_TEXT_MODEL: 'openai/gpt-5.4-mini' });
  assert.equal(f.googleConfigured(), false);
  assert.throws(() => f.studioGoogle(), /GEMINI_API_KEY/);
});
test('Google key is passed only to the direct server provider', () => {
  const f = load({ GEMINI_API_KEY: '  test-only  ' });
  assert.equal(f.googleConfigured(), true);
  f.studioGoogle();
  assert.deepEqual(Object.keys(f.options()), ['apiKey']);
  assert.equal(f.options().apiKey, 'test-only');
});
test('direct Google SDK sends chat and reference edits to Google, splitting two images into two calls', async () => {
  const calls = [];
  const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  const google = createGoogle({ apiKey: 'test-only', fetch: async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(new URL(url).hostname, 'generativelanguage.googleapis.com');
    assert.equal(new Headers(options.headers).get('x-goog-api-key'), 'test-only');
    calls.push(body);
    const image = body.generationConfig?.responseModalities?.includes('IMAGE');
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: image ? [{ inlineData: { mimeType: 'image/png', data: png.toString('base64') } }] : [{ text: 'An original golf jacket concept.' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 20, totalTokenCount: 32 } }), { headers: { 'content-type': 'application/json' } });
  }});
  const chat = await generateText({ model: google('gemini-3.8-flash'), prompt: 'Develop a jacket.', maxRetries: 0 });
  assert.match(chat.text, /original golf jacket/);
  const edits = await generateImage({ model: google.image('gemini-nano-banana-2.1'), prompt: { text: 'Make the trim burgundy.', images: [png] }, n: 2, maxRetries: 0 });
  assert.equal(edits.images.length, 2);
  assert.equal(calls.length, 3);
  for (const call of calls.slice(1)) {
    assert.ok(call.contents.some(c => c.parts.some(p => p.inlineData?.data === png.toString('base64'))));
  }
});
