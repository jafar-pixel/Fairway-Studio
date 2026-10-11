import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createOpenAI } from '@ai-sdk/openai';
import { generateImage, generateText } from 'ai';

const source = fs.readFileSync(new URL('../lib/studio/openai-ai.ts', import.meta.url), 'utf8');
function load(env) {
  let options;
  class StudioError extends Error {}
  const context = { exports: {}, process: { env }, require(name) {
    if (name === '@ai-sdk/openai') return { createOpenAI: o => { options = o; return {}; } };
    if (name === './contracts') return { StudioError };
    throw Error(name);
  }};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  return { ...context.exports, options: () => options };
}
test('only the OpenAI credential can enable AI; Google and Gateway settings are ignored', () => {
  const f = load({ AI_GATEWAY_API_KEY: 'old', GEMINI_API_KEY: 'old', GOOGLE_GENERATIVE_AI_API_KEY: 'old', STUDIO_TEXT_MODEL: 'arbitrary-model' });
  assert.equal(f.openaiConfigured(), false);
  assert.throws(() => f.studioOpenAI(), /OPENAI_API_KEY/);
});
test('existing OpenAI key is trimmed and passed only to the direct server provider', () => {
  const f = load({ OPENAI_API_KEY: '  test-only  ' });
  assert.equal(f.openaiConfigured(), true);
  f.studioOpenAI();
  assert.deepEqual(Object.keys(f.options()), ['apiKey']);
  assert.equal(f.options().apiKey, 'test-only');
});
test('installed SDK routes chat, generation and reference edits directly to OpenAI', async () => {
  const calls = [];
  const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  const openai = createOpenAI({ apiKey: 'test-only', fetch: async (url, options) => {
    const path = new URL(url).pathname;
    assert.equal(new URL(url).hostname, 'api.openai.com');
    assert.equal(new Headers(options.headers).get('authorization'), 'Bearer test-only');
    calls.push(path);
    const response = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
    if (path === '/v1/responses') {
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'gpt-5.4-mini');
      assert.equal(body.store, false);
      assert.equal(body.reasoning.effort, 'low');
      return response({ id: 'resp_test', created_at: 1, model: body.model, status: 'completed', output: [{ type: 'message', id: 'msg_test', role: 'assistant', content: [{ type: 'output_text', text: 'An original golf jacket concept.', annotations: [] }] }], usage: { input_tokens: 12, output_tokens: 20, total_tokens: 32 } });
    }
    if (path === '/v1/images/edits') {
      const form = options.body;
      assert.equal(form.get('model'), 'gpt-image-2.5-flare');
      assert.equal(form.get('n'), '2');
      assert.equal(form.get('size'), '1024x1024');
      assert.equal(form.get('quality'), 'medium');
      assert.equal(form.get('output_format'), 'png');
      const file = [...form.values()].find(v => typeof v !== 'string');
      assert.deepEqual(Buffer.from(await file.arrayBuffer()), png);
      return response({ data: [{ b64_json: png.toString('base64') }, { b64_json: png.toString('base64') }] });
    }
    assert.equal(path, '/v1/images/generations');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-image-2.5-flare');
    assert.equal(body.quality, 'medium');
    assert.equal(body.size, '1024x1024');
    return response({ data: [{ b64_json: png.toString('base64') }] });
  }});
  const chat = await generateText({ model: openai('gpt-5.4-mini'), providerOptions: { openai: { store: false, reasoningEffort: 'low', reasoningSummary: null } }, prompt: 'Develop a jacket.', maxRetries: 0 });
  assert.match(chat.text, /original golf jacket/);
  const settings = { model: openai.image('gpt-image-2.5-flare'), size: '1024x1024', providerOptions: { openai: { quality: 'medium', outputFormat: 'png' } }, maxRetries: 0 };
  const generated = await generateImage({ ...settings, prompt: 'Create a jacket.', n: 1 });
  assert.equal(generated.images.length, 1);
  const edits = await generateImage({ ...settings, prompt: { text: 'Make the trim burgundy.', images: [png] }, n: 2 });
  assert.equal(edits.images.length, 2);
  assert.deepEqual(calls, ['/v1/responses', '/v1/images/generations', '/v1/images/edits']);
});
