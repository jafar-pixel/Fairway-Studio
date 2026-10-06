import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as icons from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadModule, media, workspaceId, userId, otherUserId, staged, registered, plain } from './media-test-harness.mjs';

const previewState = loadModule('lib/studio/media-preview-state.ts', { '@/lib/studio/media': media });
const reactDependencies = { react: React, 'react/jsx-runtime': jsxRuntime, 'lucide-react': icons, './media.css': {} };
const { MediaPlayer } = loadModule('components/studio/media-player.tsx', { ...reactDependencies, '@/lib/studio/media': media, '@/lib/studio/media-preview-state': previewState });
const controller = loadModule('lib/studio/media-upload-controller.ts', { '@/lib/studio/media': media });
const { MediaUploadQueue, mediaUploadLabel } = loadModule('components/studio/media-upload.tsx', {
  ...reactDependencies, '@/lib/studio/media': media, '@/lib/studio/media-upload-controller': controller,
  '@/lib/studio/media-upload-transport': {}, './media-player': { MediaPlayer },
});
const fileId = 'canonical-file-1';
const worker = { available: true, automatic: true, code: null, message: null };
const job = extra => ({
  id: 'preview-job-1', file_id: fileId, workspace_id: workspaceId, created_by: userId,
  source_type: 'image/png', status: 'queued', attempts: 0, preview_path: null, preview_type: null, original_ready: false,
  updated_at: '2026-10-02T00:00:00.000Z', ...extra,
});
function renderPlayer(extra = {}) {
  return renderToStaticMarkup(React.createElement(MediaPlayer, {
    workspaceId, fileId, userId, title: 'Team attachment', initialWorker: worker, ...extra,
  }));
}
const playableTag = /<(?:img|video|audio)\b/;

test('ready image renders a canonical shared preview with accessible title and original download', () => {
  const html = renderPlayer({ initialJob: job({ status: 'ready', preview_path: 'private/preview.webp', preview_type: 'image/webp' }) });
  assert.match(html, /<img\b/);
  assert.match(html, /alt="Team attachment"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /src="\/api\/studio\/media\?id=canonical-file-1&amp;variant=preview/);
  assert.match(html, /href="\/api\/studio\/media\?id=canonical-file-1&amp;variant=original&amp;download=1"/);
  assert.match(html, /download=""/);
  assert.match(html, /Preview ready/);
  assert.doesNotMatch(html, /blob:|supabase-storage:|private\/preview/);
});

test('ready videos use real HTML controls, inline playback and metadata preload', () => {
  const html = renderPlayer({ initialJob: job({ status: 'ready', source_type: 'video/quicktime', preview_type: 'video/mp4', preview_path: 'private/preview.mp4' }) });
  const video = html.match(/<video\b[^>]*>/)?.[0];
  assert.ok(video);
  assert.match(video, /controls=""/);
  assert.match(video, /playsInline=""/i);
  assert.match(video, /preload="metadata"/);
  assert.match(video, /aria-label="Team attachment"/);
  assert.match(video, /src="\/api\/studio\/media\?/);
  assert.doesNotMatch(video, /autoPlay|muted|loop/i);
});

test('ready audio uses HTML audio controls and canonical media source', () => {
  const html = renderPlayer({ initialJob: job({ status: 'ready', source_type: 'audio/mpeg', original_ready: true }) });
  const audio = html.match(/<audio\b[^>]*>/)?.[0];
  assert.ok(audio);
  assert.match(audio, /controls=""/);
  assert.match(audio, /preload="metadata"/);
  assert.match(audio, /src="\/api\/studio\/media\?/);
  assert.match(audio, /aria-label="Team attachment"/);
  assert.doesNotMatch(html, /blob:/);
});

test('pending and invalid-ready jobs never render playable media elements or blob preview URLs', () => {
  for (const status of ['queued', 'processing', 'blocked', 'failed', 'ready']) {
    const html = renderPlayer({ initialJob: job({ status }) });
    assert.doesNotMatch(html, playableTag, status);
    assert.doesNotMatch(html, /src="|blob:/, status);
    assert.match(html, /variant=original/, status);
    assert.doesNotMatch(html, /Preview ready/, status);
  }
});

test('cross-file and cross-workspace initial jobs cannot expose stale ready previews', () => {
  for (const extra of [{ file_id: 'other-file' }, { workspace_id: otherUserId }]) {
    const html = renderPlayer({ initialJob: job({ status: 'ready', preview_path: 'private/preview.webp', ...extra }) });
    assert.doesNotMatch(html, playableTag);
    assert.match(html, /Checking preview/);
    assert.doesNotMatch(html, /private\/preview/);
  }
});

test('preview retry is creator-only, limited to three attempts and never submits enclosing forms', () => {
  for (const status of ['failed', 'blocked']) {
    const html = renderPlayer({ initialJob: job({ status, attempts: 2 }) });
    assert.match(html, /Retry preview/);
    const buttons = html.match(/<button\b[^>]*>/g) ?? [];
    assert.ok(buttons.length > 0);
    assert.ok(buttons.every(button => /type="button"/.test(button)));
    assert.doesNotMatch(renderPlayer({ initialJob: job({ status, attempts: 3 }) }), /Retry preview/);
    assert.doesNotMatch(renderPlayer({ userId: otherUserId, initialJob: job({ status }) }), /Retry preview/);
  }
  assert.doesNotMatch(renderPlayer({ initialJob: job({ status: 'processing' }) }), /Retry preview/);
});

test('upload labels distinguish saved originals, registration failures and idea-link failures', () => {
  assert.match(mediaUploadLabel(staged({ state: 'error', uploaded: true })), /Original uploaded.*Library save/);
  assert.match(mediaUploadLabel(staged({ state: 'error', uploaded: true, registered: registered() })), /Original saved.*attachment/);
  assert.equal(mediaUploadLabel(staged({ state: 'canceled' })), 'Upload paused');
  assert.match(mediaUploadLabel(staged({ state: 'uploading', progress: 42.7 })), /42%/);
  assert.match(mediaUploadLabel(staged({ state: 'attached' })), /saved and attached/);
});

test('upload queue renders accessible multi-file controls, truthful limits and non-submitting buttons', () => {
  const uploads = {
    workspaceId, userId, demo: false, busy: false, items: [staged({ state: 'error', error: 'Retry needed' })], selectionErrors: ['one.png: Unsupported type'],
    addFiles() {}, remove() {}, updateMetadata() {}, cancel() {}, retry() {}, clearSelectionErrors() {},
  };
  const html = renderToStaticMarkup(React.createElement(MediaUploadQueue, { uploads }));
  const input = html.match(/<input\b[^>]*type="file"[^>]*>/)?.[0];
  assert.ok(input);
  assert.match(input, /multiple=""/);
  assert.match(input, /aria-label="Choose media files"/);
  assert.match(input, /accept="[^\"]*\.mkv/);
  assert.match(html, /100,000,000 bytes each/);
  assert.match(html, /Source creator \/ credit/);
  assert.match(html, /Source URL/);
  assert.match(html, /does not change who uploaded this file/);
  assert.match(html, /role="alert"/);
  assert.match(html, /role="status"/);
  assert.ok((html.match(/<button\b[^>]*>/g) ?? []).every(button => /type="button"/.test(button)));
  assert.doesNotMatch(html, /blob:/);
  assert.equal(plain(uploads.items[0]).registered, null);
});

test('demo or busy queue disables the file picker and chooser', () => {
  for (const state of [{ demo: true, busy: false }, { demo: false, busy: true }]) {
    const uploads = { workspaceId, userId, items: [], selectionErrors: [], ...state };
    const html = renderToStaticMarkup(React.createElement(MediaUploadQueue, { uploads }));
    assert.match(html.match(/<input\b[^>]*type="file"[^>]*>/)?.[0] ?? '', /disabled=""/);
    const choose = html.match(/<button\b[^>]*>Choose files<\/button>/)?.[0];
    assert.match(choose, /disabled=""/);
    if (state.demo) assert.match(html, /Demo files are not stored/);
  }
});
