import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

export const workspaceId = '11111111-1111-4111-8111-111111111111';
export const userId = '22222222-2222-4222-8222-222222222222';
export const otherUserId = '33333333-3333-4333-8333-333333333333';

export function loadModule(relativePath, dependencies = {}, globals = {}) {
  const source = fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const context = {
    exports: {}, URL, URLSearchParams, AbortController, AbortSignal, DOMException,
    Error, TypeError, Date, Promise, Map, Set, JSON, Object, Array, Number,
    crypto: globalThis.crypto, setTimeout, clearTimeout,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    ...globals,
  };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, context, { filename: relativePath });
  return context.exports;
}

const mediaPath = fs.existsSync(new URL('../lib/studio/media.ts', import.meta.url))
  ? 'lib/studio/media.ts' : '.verification/lib/studio/media.ts';
export const media = loadModule(mediaPath);
export const controller = loadModule('lib/studio/media-upload-controller.ts', { '@/lib/studio/media': media });

export function fakeFile(name = 'original.png', extra = {}) {
  return { name, type: 'image/png', size: 1234, lastModified: 123456, ...extra };
}
export function registered(id = 'canonical-1') {
  return { id, job: null, worker: { available: false, automatic: false, code: 'worker_unavailable', message: 'Original saved; preview processing is unavailable.' } };
}
export function metadata(extra = {}) {
  return { title: 'Original', contextNote: '', creatorName: '', sourceUrl: '', sourceKind: 'manual', tags: [], ...extra };
}
export function staged(extra = {}) {
  return {
    id: 'upload-1', file: fakeFile(), type: 'image/png', path: `${workspaceId}/${userId}/upload-1.png`,
    metadata: metadata(), state: 'staged', progress: 0, uploaded: false, registered: null, attached: false, error: null,
    ...extra,
  };
}
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export const tick = () => new Promise(resolve => setImmediate(resolve));
export const plain = value => JSON.parse(JSON.stringify(value));
