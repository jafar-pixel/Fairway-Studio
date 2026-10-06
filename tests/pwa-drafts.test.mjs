import test from 'node:test'
import assert from 'node:assert/strict'
import { saveDraft, listDrafts, queueDraft, syncDrafts, keepMineAsNewDraft, clearScopeDrafts, prepareScopeSignOut, createIdeaDraftSyncAdapter } from '../lib/studio/offline.ts'
// Small IndexedDB test double. Browser/device tests are still required for real persistence.
const records = new Map()
globalThis.IDBKeyRange = { bound: (lower, upper) => ({ lower, upper }) }
globalThis.indexedDB = { open() {
  const request = {}
  queueMicrotask(() => {
    request.result = { close() {}, transaction() {
      const tx = { objectStore() { return {
        put(value, key) { records.set(key, structuredClone(value)); queueMicrotask(() => tx.oncomplete?.()) },
        delete(key) { records.delete(key); queueMicrotask(() => tx.oncomplete?.()) },
        getAll(range) { const result = {}; queueMicrotask(() => { result.result = [...records].filter(([key]) => key >= range.lower && key <= range.upper).map(([,value]) => structuredClone(value)); result.onsuccess?.() }); return result },
      } } }; return tx
    } }
    request.onsuccess?.()
  }); return request
} }
const scope = { accountId: 'account-a', workspaceId: 'workspace-a' }

test('scope isolation, idempotent retry, conflict handling and guarded clearing', async () => {
  const first = await saveDraft(scope, { kind: 'idea', title: 'First', text: 'A private idea' })
  await saveDraft({ ...scope, accountId: 'account-b' }, { kind: 'note', title: 'Other account', text: 'not visible' })
  await saveDraft({ ...scope, workspaceId: 'workspace-b' }, { kind: 'note', title: 'Other workspace', text: 'not visible' })
  assert.deepEqual((await listDrafts(scope)).map(d => d.id), [first.id])
  await assert.rejects(clearScopeDrafts(scope), /Unsynced/)
  await queueDraft(scope, first.id)
  const sent = []
  let attempts = 0
  const adapter = { verifyScope: async () => true, send: async draft => {
    sent.push(draft.requestId)
    if (++attempts === 1) throw new Error('Temporary failure')
    return { status: 'saved', revision: 'r1' }
  } }
  assert.equal((await syncDrafts(scope, adapter))[0].status, 'error')
  assert.equal((await syncDrafts(scope, adapter))[0].status, 'saved')
  assert.deepEqual(sent, [first.requestId, first.requestId])
  await syncDrafts(scope, adapter); assert.equal(sent.length, 2)
  const conflicted = await saveDraft(scope, { kind: 'note', title: 'Conflict', text: 'Mine', baseRevision: 'old' })
  await queueDraft(scope, conflicted.id)
  await syncDrafts(scope, { verifyScope: async () => true, send: async () => ({ status: 'conflict', revision: 'new', text: 'Theirs' }) })
  const current = (await listDrafts(scope)).find(d => d.id === conflicted.id)
  assert.equal(current.status, 'conflict'); assert.equal(current.payload.text, 'Mine'); assert.equal(current.remoteText, 'Theirs')
  const replacement = await keepMineAsNewDraft(scope, conflicted.id)
  assert.equal(replacement.status, 'local'); assert.equal(replacement.baseRevision, null); assert.notEqual(replacement.requestId, conflicted.requestId)
  await clearScopeDrafts(scope, true)
  assert.equal((await listDrafts(scope)).length, 0)
  assert.equal((await listDrafts({ ...scope, accountId: 'account-b' })).length, 1)
})

test('failed earlier operation blocks later dependent operations and membership denies replay', async () => {
  const isolated = { accountId: 'account-c', workspaceId: 'workspace-c' }
  const first = await saveDraft(isolated, { kind: 'idea', title: 'Parent', text: 'Parent' })
  const second = await saveDraft(isolated, { kind: 'note', title: 'Child', text: 'Child', dependsOn: first.id })
  await queueDraft(isolated, first.id); await queueDraft(isolated, second.id)
  let sent = 0
  await assert.rejects(syncDrafts(isolated, { verifyScope: async () => false, send: async () => { sent++; return { status: 'saved', revision: 'r' } } }), /Sign in/)
  assert.equal(sent, 0)
  await syncDrafts(isolated, { verifyScope: async () => true, send: async () => { sent++; throw new Error('Blocked') } })
  assert.equal(sent, 1)
  assert.equal((await listDrafts(isolated)).find(d => d.id === second.id).status, 'pending')
})


test('signout cancellation preserves drafts and explicit discard clears only the scope', async () => {
  const scope = { accountId: 'logout-user', workspaceId: 'logout-workspace' }
  await saveDraft(scope, { kind: 'note', title: 'Keep me', text: 'unsynced' })
  assert.equal(await prepareScopeSignOut(scope, async () => 'cancel'), false)
  assert.equal((await listDrafts(scope)).length, 1)
  assert.equal(await prepareScopeSignOut(scope, async () => 'discard'), true)
  assert.equal((await listDrafts(scope)).length, 0)
})

test('concrete idea adapter verifies server identity and transmits stable idempotency key', async () => {
  const originalFetch = globalThis.fetch
  const scope = { accountId: 'adapter-user', workspaceId: 'adapter-workspace' }
  const draft = await saveDraft(scope, { kind: 'idea', title: 'Idea', text: 'Body' })
  const requests = []
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init })
    return init.method === 'POST' ? new Response(JSON.stringify({ data: { id: 'created', revision: 1 } })) : new Response(JSON.stringify({ userId: scope.accountId, workspace: { id: scope.workspaceId } }))
  }
  try {
    const adapter = createIdeaDraftSyncAdapter()
    assert.equal(await adapter.verifyScope(scope), true)
    assert.equal(await adapter.verifyScope({ ...scope, accountId: 'wrong' }), false)
    assert.deepEqual(await adapter.send(draft), { status: 'saved', revision: '1' })
    const payload = JSON.parse(requests.at(-1).init.body)
    assert.equal(payload.requestId, draft.requestId)
    assert.equal(payload.operation, 'createIdea')
    assert.equal(payload.input.body, 'Body')
    await adapter.send({ ...draft, kind: 'note' }); assert.equal(JSON.parse(requests.at(-1).init.body).input.category, 'Note');
    await assert.rejects(adapter.send({ ...draft, baseRevision: 'old' }), /Only new idea or note/)
  } finally { globalThis.fetch = originalFetch }
})
