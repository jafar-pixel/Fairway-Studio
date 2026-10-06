import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, media, workspaceId, userId } from './media-test-harness.mjs';

export const previewState = loadModule('lib/studio/media-preview-state.ts', { '@/lib/studio/media': media });
const { mediaPresentation } = previewState;
export const availableWorker = { available: true, automatic: true, code: null, message: null };
export const blockedWorker = { available: false, automatic: false, code: 'missing_worker', message: 'Workspace preview worker has not been configured.' };
export function job(extra = {}) {
  return {
    id: 'preview-job-1', file_id: 'canonical-file-1', workspace_id: workspaceId, created_by: userId,
    source_path: `${workspaceId}/${userId}/upload.png`, source_size: 1234, source_type: 'image/png', source_sha256: null,
    recipe: 'review-v1', status: 'queued', attempts: 0, lease_id: null, lease_until: null,
    preview_path: null, preview_type: null, preview_size: null, preview_sha256: null, original_ready: false,
    error_code: null, error_message: null, metadata: {}, updated_at: '2026-10-02T00:00:00.000Z', ...extra,
  };
}

test('ready status needs either a real preview path or explicitly verified original readiness', () => {
  const unavailable = mediaPresentation(job({ status: 'ready' }), availableWorker);
  assert.equal(unavailable.ready, false);
  assert.equal(unavailable.label, 'Preview unavailable');
  assert.match(unavailable.detail, /original is preserved/i);
  assert.equal(mediaPresentation(job({ status: 'ready', preview_path: 'private/preview.webp' }), availableWorker).ready, true);
  assert.equal(mediaPresentation(job({ status: 'ready', original_ready: true }), availableWorker).ready, true);
});

test('queued, processing, failed and blocked status never becomes playable because a path exists', () => {
  for (const status of ['queued', 'processing', 'failed', 'blocked']) {
    assert.equal(mediaPresentation(job({ status, preview_path: 'private/stale-preview.webp', original_ready: true }), availableWorker).ready, false, status);
  }
});

test('queued and processing previews communicate that original is already saved', () => {
  const queued = mediaPresentation(job(), availableWorker);
  assert.equal(queued.label, 'Preview queued');
  assert.match(queued.detail, /original is saved/i);
  assert.equal(queued.ready, false);
  const processing = mediaPresentation(job({ status: 'processing' }), availableWorker);
  assert.equal(processing.label, 'Processing preview');
  assert.match(processing.detail, /original is saved/i);
  assert.equal(processing.ready, false);
});

test('blocked or nonautomatic queued worker has truthful setup status and specific explanation', () => {
  for (const status of ['queued', 'blocked']) {
    const state = mediaPresentation(job({ status }), blockedWorker);
    assert.equal(state.ready, false);
    assert.equal(state.label, 'Preview waiting for setup');
    assert.equal(state.detail, blockedWorker.message);
  }
  const jobMessage = 'Preview processor cannot decode this source yet.';
  assert.equal(mediaPresentation(job({ status: 'blocked', error_message: jobMessage }), blockedWorker).detail, jobMessage);
  assert.equal(mediaPresentation(job({ status: 'blocked' }), null).label, 'Preview waiting for setup');
});

test('failed processing preserves the original and uses available failure detail', () => {
  const failed = mediaPresentation(job({ status: 'failed' }), availableWorker);
  assert.equal(failed.ready, false);
  assert.equal(failed.label, 'Preview failed');
  assert.match(failed.detail, /original is preserved/i);
  assert.equal(mediaPresentation(job({ status: 'failed', error_message: 'Unsupported codec' }), availableWorker).detail, 'Unsupported codec');
});

test('type selection follows shared preview MIME, then original MIME, then explicit fallback', () => {
  const converted = mediaPresentation(job({ status: 'ready', source_type: 'video/quicktime', preview_type: 'video/mp4', preview_path: 'private/preview.mp4' }), availableWorker);
  assert.equal(converted.kind, 'video');
  assert.equal(converted.type, 'video/mp4');
  assert.equal(mediaPresentation(job({ source_type: 'audio/mpeg' }), availableWorker).kind, 'audio');
  assert.equal(mediaPresentation(null, null, false, 'video/mp4').kind, 'video');
  assert.equal(mediaPresentation(null, null).kind, 'image');
});

test('missing job remains checking; only explicit server-classified legacy media is ready', () => {
  const missing = mediaPresentation(null, null);
  assert.equal(missing.ready, false);
  assert.equal(missing.label, 'Checking preview');
  const legacy = mediaPresentation(null, null, true, 'audio/mpeg');
  assert.equal(legacy.ready, true);
  assert.equal(legacy.kind, 'audio');
  assert.equal(legacy.label, 'Preview ready');
});
