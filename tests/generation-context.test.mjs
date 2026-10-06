import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const helperSource = fs.readFileSync(
  new URL('../lib/studio/generation-context.ts', import.meta.url),
  'utf8',
)
const context = { exports: {} }
vm.runInNewContext(
  ts.transpileModule(helperSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText,
  context,
)
const { filterGenerationSourceVersions, resolveGenerationProjectId } = context.exports
const projects = [{ id: 'first' }, { id: 'current' }, { id: 'requested' }]

test('project route context takes priority over a prior project selection', () => {
  assert.equal(resolveGenerationProjectId('current', 'first', projects), 'current')
  assert.equal(resolveGenerationProjectId('another-route', 'first', projects), 'another-route')
})

test('Image Studio keeps the existing valid selection or falls back to the first project', () => {
  assert.equal(resolveGenerationProjectId(undefined, 'requested', projects), 'requested')
  assert.equal(resolveGenerationProjectId(undefined, 'removed-project', projects), 'first')
  assert.equal(resolveGenerationProjectId(undefined, undefined, projects), 'first')
  assert.equal(resolveGenerationProjectId(undefined, undefined, []), '')
})

test('source version options contain only versions belonging to the selected project', () => {
  const versions = [
    { id: 'source-a', project_id: 'first' },
    { id: 'source-b', project_id: 'current' },
    { id: 'unscoped', project_id: null },
  ]
  assert.deepEqual(
    filterGenerationSourceVersions(versions, 'current').map((version) => version.id),
    ['source-b'],
  )
})

test('route context reaches Image Studio and a route switch resets the source selection', () => {
  const app = fs.readFileSync(new URL('../components/studio/app.tsx', import.meta.url), 'utf8')
  const panel = fs.readFileSync(new URL('../components/studio/generation-panel.tsx', import.meta.url), 'utf8')
  const compactApp = app.replace(/\s/g, '')
  const compactPanel = panel.replace(/\s/g, '')
  assert.match(compactApp, /constcurrentProjectId=view==="projects"\?route\[1\]:undefined/)
  assert.match(compactApp, /projectId:currentProjectId\|\|detail\.projectId/)
  assert.match(compactApp, /currentProjectId=\{currentProjectId\}/)
  assert.match(compactPanel, /filterGenerationSourceVersions\(data\.versions,projectId\)\.map/)
  assert.match(compactPanel, /setProjectId\(resolveGenerationProjectId\(currentProjectId,undefined,data\.projects\),?\)/)
  assert.match(compactPanel, /setVersionId\(""\)/)
})
