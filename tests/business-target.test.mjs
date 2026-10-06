import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const uid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const workspaceId = uid(1), userId = uid(2), foreignWorkspace = uid(3), otherUser = uid(4), projectId = uid(5), otherProject = uid(6);
const row = (id, fields = {}) => ({ id, workspace_id: workspaceId, created_at: '2025-01-01T00:00:00Z', ...fields });
function load(path, dependencies = {}) {
  const context = { exports: {}, URL, URLSearchParams, Request, Response, Headers, require(name) {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context, { filename: path });
  return context.exports;
}
const contracts = load('../lib/studio/contracts.ts');
const { mergeCanonicalTarget } = load('../lib/studio/business/canonical-hydration.ts', { '../contracts': contracts });
const json = value => JSON.parse(JSON.stringify(value));

function harness(tables = {}, options = {}) {
  const reads = [], authCalls = [], mutations = [];
  const client = {
    auth: { async getUser() { authCalls.push(true); return { data: { user: options.anonymous ? null : { id: userId } }, error: null }; } },
    from(table) {
      const call = { table, eq: [], in: [], or: [], orders: [] };
      reads.push(call);
      const query = {
        select(value) { call.select = value; return query; },
        eq(key, value) { call.eq.push([key, value]); return query; },
        in(key, values) { call.in.push([key, values]); return query; },
        or(value) { call.or.push(value); return query; },
        order(key, options) { call.orders.push([key, options]); return query; },
        range(start, end) { call.range = [start, end]; return Promise.resolve(result(false)); },
        maybeSingle() { call.single = true; return Promise.resolve(result(true)); },
        insert() { mutations.push('insert'); throw new Error('No mutations allowed'); },
        update() { mutations.push('update'); throw new Error('No mutations allowed'); },
        delete() { mutations.push('delete'); throw new Error('No mutations allowed'); },
      };
      function result(single) {
        if (options.throwOn === table) throw new Error('secret backend implementation detail');
        if (options.errorTable === table && (options.errorAfter === undefined || call.range?.[0] >= options.errorAfter)) return { data: null, error: options.error ?? { code: '42501' } };
        let values = table === 'workspace_members'
          ? options.outsider ? [] : [{ workspace_id: workspaceId, user_id: userId, role: 'editor' }]
          : tables[table] ?? [];
        if (options.ignoreFilters !== table) {
          values = values.filter(value => call.eq.every(([key, expected]) => value[key] === expected) && call.in.every(([key, expected]) => expected.includes(value[key])));
          if (call.or.length) {
            assert.equal(table, 'workspace_files');
            assert.equal(call.or[0], `permission_scope.eq.workspace,added_by.eq.${userId}`);
            values = values.filter(value => value.permission_scope === 'workspace' || value.added_by === userId);
          }
        }
        values = [...values].sort((a, b) => String(a.id).localeCompare(String(b.id)));
        if (single) return { data: values[0] ?? null, error: null };
        const [start, end] = call.range;
        return { data: values.slice(start, Math.min(end + 1, start + (options.serverCap ?? Infinity))), error: null };
      }
      return query;
    },
    rpc() { mutations.push('rpc'); throw new Error('No RPC needed for canonical reads'); },
  };
  const server = load('../lib/studio/server.ts', {
    '@/lib/supabase/server': { createClient: async () => client },
    './contracts': contracts,
    './imported-content': { hydrateImportedContent: value => value },
  });
  const target = load('../lib/studio/business/canonical-target.ts', { '../contracts': contracts, '../server': server });
  const route = load('../app/api/studio/business/target/route.ts', {
    '@/lib/studio/contracts': contracts,
    '@/lib/studio/business/canonical-target': target,
  });
  return { reads, authCalls, mutations, route, async get(kind = 'task', id = uid(20), workspace = workspaceId) {
    return route.GET(new Request(`https://studio.test/api/studio/business/target?${new URLSearchParams({ workspaceId: workspace, kind, id })}`));
  } };
}

function assertPrivate(response) {
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
  assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store');
  assert.equal(response.headers.get('vary'), 'Cookie');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}

test('an exact older task uses the canonical row, current user membership and no newest-500 snapshot', async () => {
  const tasks = Array.from({ length: 701 }, (_, index) => row(uid(index + 1000), { title: `Task ${index}`, revision: index }));
  const h = harness({ studio_tasks: tasks });
  const response = await h.get('task', tasks[700].id);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { records: { tasks: [tasks[700]] } });
  assertPrivate(response);
  assert.equal(h.authCalls.length, 1);
  assert.deepEqual(h.reads.map(read => read.table), ['workspace_members', 'studio_tasks']);
  assert.deepEqual(h.reads[0].eq, [['workspace_id', workspaceId], ['user_id', userId]]);
  assert.deepEqual(h.reads[1].eq, [['workspace_id', workspaceId], ['id', tasks[700].id]]);
  assert.equal(h.reads[1].range, undefined);
  assert.deepEqual(h.mutations, []);
});

test('task hydration also resolves its exact same-workspace project beyond the generic snapshot', async () => {
  const task = row(uid(20), { project_id: projectId });
  const project = row(projectId, { title: 'Current canonical label', category: 'Business' });
  const h = harness({ studio_tasks: [task], studio_projects: [project, row(otherProject)] });
  const response = await h.get();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { records: { tasks: [task], projects: [project] } });
  assert.deepEqual(h.reads.map(read => read.table), ['workspace_members', 'studio_tasks', 'studio_projects']);
  assert.deepEqual(h.reads[2].eq, [['workspace_id', workspaceId], ['id', projectId]]);
  const foreign = harness({ studio_tasks: [task], studio_projects: [row(projectId, { workspace_id: foreignWorkspace })] });
  assert.deepEqual(await (await foreign.get()).json(), { records: { tasks: [task] } });
  const faulty = harness({ studio_tasks: [task], studio_projects: [row(projectId, { workspace_id: foreignWorkspace })] }, { ignoreFilters: 'studio_projects' });
  assert.equal((await faulty.get()).status, 404);
});

test('file hydration requires current workspace visibility or uploader ownership, even with faulty returned rows', async () => {
  for (const [file, status] of [
    [row(uid(20), { permission_scope: 'workspace', added_by: otherUser }), 200],
    [row(uid(20), { permission_scope: 'restricted', added_by: userId }), 200],
    [row(uid(20), { permission_scope: 'restricted', added_by: otherUser }), 404],
    [row(uid(20), { permission_scope: 'private', added_by: otherUser }), 404],
    [row(uid(20), { permission_scope: 'workspace', added_by: userId, workspace_id: foreignWorkspace }), 404],
    [row(uid(21), { permission_scope: 'workspace', added_by: userId }), 404],
  ]) {
    const h = harness({ workspace_files: [file] }, { ignoreFilters: 'workspace_files' });
    const response = await h.get('file');
    assert.equal(response.status, status);
    assertPrivate(response);
    assert.deepEqual(h.reads[1].eq, [['workspace_id', workspaceId], ['id', uid(20)]]);
    assert.deepEqual(h.reads[1].or, [`permission_scope.eq.workspace,added_by.eq.${userId}`]);
    const body = await response.json();
    if (status === 200) assert.deepEqual(body, { records: { files: [file] } });
    else assert.equal(body.code, 'NOT_FOUND');
  }
});

test('invalid kind, missing ID and malformed workspace never query a database', async () => {
  for (const query of [
    { workspaceId, kind: 'finance', id: uid(20) }, { workspaceId, kind: 'task' },
    { workspaceId, kind: 'task', id: 'bad' }, { workspaceId: '', kind: 'task', id: uid(20) },
    { workspaceId, kind: 'project', id: `${uid(20)},id.eq.${uid(21)}` },
  ]) {
    const h = harness();
    const response = await h.route.GET(new Request(`https://studio.test/api/studio/business/target?${new URLSearchParams(query)}`));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'VALIDATION');
    assert.deepEqual(h.reads, []);
    assert.equal(h.authCalls.length, 0);
    assertPrivate(response);
  }
});

test('unauthenticated, nonmember, missing and foreign-workspace targets fail explicitly without fallback data', async () => {
  for (const [options, workspace, status] of [
    [{ anonymous: true }, workspaceId, 401], [{ outsider: true }, workspaceId, 403],
    [{}, foreignWorkspace, 403], [{}, workspaceId, 404],
  ]) {
    const h = harness({}, options);
    const response = await h.get('task', uid(20), workspace);
    assert.equal(response.status, status);
    assert.equal((await response.json()).records, undefined);
    assertPrivate(response);
  }
  const h = harness({ studio_tasks: [row(uid(20), { workspace_id: foreignWorkspace })] }, { ignoreFilters: 'studio_tasks' });
  assert.equal((await h.get()).status, 404);
});

test('database and unexpected errors stay explicit and prohibit caching', async () => {
  for (const [options, status, code] of [
    [{ errorTable: 'studio_tasks', error: { code: '42P01' } }, 503, 'SCHEMA_REQUIRED'],
    [{ errorTable: 'studio_tasks' }, 403, 'FORBIDDEN'],
    [{ throwOn: 'studio_tasks' }, 500, 'INTERNAL'],
  ]) {
    const h = harness({}, options), response = await h.get();
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.code, code);
    assert.doesNotMatch(body.error, /secret backend/);
    assert.equal(body.records, undefined);
    assertPrivate(response);
  }
});

test('Business projects return only the canonical project and never read creative or restricted context', async () => {
  for (const category of ['Business', 'business', ' BUSINESS ']) {
    const project = row(projectId, { category, title: 'Business plan' });
    const h = harness({ studio_projects: [project] });
    const response = await h.get('project', projectId);
    assert.deepEqual(await response.json(), { records: { projects: [project] } });
    assert.deepEqual(h.reads.map(read => read.table), ['workspace_members', 'studio_projects']);
  }
});

test('project hydration exhausts more than 500 rows of every context collection even under a lower API page cap', async () => {
  const project = row(projectId, { category: 'Brand' });
  const versions = Array.from({ length: 603 }, (_, i) => row(uid(1000 + i), { project_id: projectId, file_id: uid(9000 + i) }));
  const nodes = versions.map((version, i) => row(uid(2000 + i), { project_id: projectId, version_id: version.id, file_id: version.file_id, kind: 'file' }));
  const rounds = versions.map((version, i) => row(uid(3000 + i), { project_id: projectId, version_id: version.id }));
  const reviews = rounds.map((round, i) => row(uid(4000 + i), { round_id: round.id }));
  const decisions = rounds.map((round, i) => row(uid(5000 + i), { project_id: projectId, version_id: round.version_id, round_id: round.id }));
  const tasks = versions.map((_, i) => row(uid(6000 + i), { project_id: projectId }));
  const threads = tasks.map((task, i) => row(uid(7000 + i), { project_id: projectId, task_id: task.id }));
  const files = versions.map(version => row(version.file_id, { permission_scope: 'workspace', added_by: otherUser }));
  const h = harness({ studio_projects: [project], studio_versions: versions, studio_canvas_nodes: nodes,
    studio_review_rounds: rounds, studio_reviews: reviews, studio_decisions: decisions, studio_tasks: tasks,
    studio_threads: threads, workspace_files: files }, { serverCap: 173 });
  const response = await h.get('project', projectId);
  assert.equal(response.status, 200);
  const { records } = await response.json();
  for (const [key, expected] of Object.entries({ projects: [project], versions, nodes, rounds, reviews, decisions, tasks, threads, files })) {
    assert.equal(records[key].length, expected.length, key);
    assert.deepEqual(records[key].map(value => value.id).sort(), expected.map(value => value.id).sort(), key);
  }
  assertPrivate(response);
  for (const read of h.reads) {
    assert.ok(read.eq.some(([column, value]) => column === 'workspace_id' && value === workspaceId));
    assert.ok(['workspace_members', 'studio_projects', 'studio_versions', 'studio_canvas_nodes', 'studio_review_rounds', 'studio_reviews', 'studio_decisions', 'studio_tasks', 'studio_threads', 'workspace_files'].includes(read.table));
    if (read.range) assert.deepEqual(json(read.orders), [['id', { ascending: true }]]);
    if (read.table === 'workspace_files') assert.equal(read.or.length, 1);
  }
  assert.ok(h.reads.some(read => read.table === 'studio_versions' && read.range?.[0] > 500));
  assert.deepEqual(h.mutations, []);
});

test('more than 500 responses in one related review query are fully paginated', async () => {
  const version = row(uid(100), { project_id: projectId });
  const round = row(uid(101), { project_id: projectId, version_id: version.id });
  const reviews = Array.from({ length: 705 }, (_, i) => row(uid(1000 + i), { round_id: round.id }));
  const h = harness({ studio_projects: [row(projectId, { category: 'Brand' })],
    studio_versions: [version], studio_review_rounds: [round], studio_reviews: reviews });
  const response = await h.get('project', projectId);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).records.reviews, reviews);
  assert.deepEqual(h.reads.filter(read => read.table === 'studio_reviews').map(read => read.range), [[0, 499], [500, 999], [705, 1204]]);
});

test('a later-page database failure returns an error instead of a partially hydrated project', async () => {
  const versions = Array.from({ length: 600 }, (_, i) => row(uid(1000 + i), { project_id: projectId }));
  const h = harness({ studio_projects: [row(projectId, { category: 'Brand' })], studio_versions: versions },
    { errorTable: 'studio_versions', errorAfter: 500, error: { code: '08006' } });
  const response = await h.get('project', projectId);
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, 'DATABASE_ERROR');
  assert.equal(body.records, undefined);
  assertPrivate(response);
});

test('reused same-workspace versions, their reviews/outcomes, task threads and permitted files are included without unrelated rows', async () => {
  const versionId = uid(100), ownRoundId = uid(110), reusedRoundId = uid(111), taskId = uid(120);
  const h = harness({
    studio_projects: [row(projectId, { category: 'Brand' })],
    studio_canvas_nodes: [row(uid(130), { project_id: projectId, version_id: versionId, file_id: uid(141) }), row(uid(131), { project_id: projectId, file_id: uid(142) }), row(uid(132), { project_id: projectId, file_id: uid(143) })],
    studio_versions: [row(versionId, { project_id: otherProject, file_id: uid(140) }), row(uid(101), { project_id: otherProject })],
    studio_review_rounds: [row(ownRoundId, { project_id: projectId, version_id: versionId }), row(reusedRoundId, { project_id: otherProject, version_id: versionId }), row(uid(112), { project_id: otherProject, version_id: uid(101) })],
    studio_reviews: [row(uid(150), { round_id: ownRoundId }), row(uid(151), { round_id: reusedRoundId }), row(uid(152), { round_id: uid(112) })],
    studio_decisions: [row(uid(160), { project_id: otherProject, round_id: reusedRoundId }), row(uid(161), { project_id: otherProject, round_id: uid(112) })],
    studio_tasks: [row(taskId, { project_id: projectId }), row(uid(121), { project_id: otherProject })],
    studio_threads: [row(uid(170), { project_id: projectId }), row(uid(171), { project_id: null, task_id: taskId }), row(uid(172), { project_id: otherProject })],
    workspace_files: [row(uid(140), { permission_scope: 'workspace', added_by: otherUser }), row(uid(141), { permission_scope: 'private', added_by: userId }), row(uid(142), { permission_scope: 'restricted', added_by: otherUser }), row(uid(143), { permission_scope: 'workspace', added_by: userId, workspace_id: foreignWorkspace }), row(uid(144), { permission_scope: 'workspace', added_by: userId })],
  });
  const response = await h.get('project', projectId);
  assert.equal(response.status, 200);
  const { records } = await response.json();
  for (const [key, expected] of Object.entries({ versions: [versionId], rounds: [ownRoundId, reusedRoundId], reviews: [uid(150), uid(151)], decisions: [uid(160)], tasks: [taskId], threads: [uid(170), uid(171)], files: [uid(140), uid(141)] })) {
    assert.deepEqual(records[key].map(value => value.id).sort(), expected.sort(), key);
  }
});

test('foreign project-context rows cannot leak even if a backend response ignores the scope filter', async () => {
  const h = harness({ studio_projects: [row(projectId, { category: 'Brand' })],
    studio_versions: [row(uid(20), { project_id: projectId, workspace_id: foreignWorkspace })] }, { ignoreFilters: 'studio_versions' });
  const response = await h.get('project', projectId);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).records, undefined);
});

test('canonical merge replaces stale matching rows in full and preserves every unrelated collection without mutation', () => {
  const originalTask = row(uid(20), { title: 'Old', stale_field: true });
  const otherTask = row(uid(21), { title: 'Unrelated' });
  const newTask = row(uid(22), { title: 'New target' });
  const updatedTask = row(uid(20), { title: 'Fresh', revision: 7 });
  const workspace = { workspace: { id: workspaceId }, userId, tasks: [originalTask, otherTask],
    projects: [row(projectId)], files: [], ideas: [row(uid(30))], workflow: { outcomes: [{ id: 'outcome' }] }, role: 'editor', missingSchema: [] };
  const records = { tasks: [updatedTask, newTask], versions: [row(uid(40))] };
  const beforeWorkspace = json(workspace), beforeRecords = json(records);
  const merged = mergeCanonicalTarget(workspace, records);
  assert.deepEqual(json(merged.tasks), [updatedTask, otherTask, newTask]);
  assert.equal(merged.tasks[0].stale_field, undefined);
  assert.equal(merged.tasks[1], otherTask);
  for (const key of ['projects', 'files', 'ideas', 'workflow', 'workspace', 'missingSchema']) assert.equal(merged[key], workspace[key]);
  assert.deepEqual(json(workspace), beforeWorkspace);
  assert.deepEqual(json(records), beforeRecords);
  assert.notEqual(merged, workspace);
  assert.notEqual(merged.tasks, workspace.tasks);
  assert.deepEqual(json(mergeCanonicalTarget(merged, { tasks: [] }).tasks), [updatedTask, otherTask, newTask]);
});

test('merge rejects unauthenticated/demo scope, malformed records, foreign rows and another user’s private file', () => {
  const workspace = { workspace: { id: workspaceId }, userId, tasks: [row(uid(20))], files: [] };
  for (const invalidWorkspace of [{ ...workspace, userId: '' }, { ...workspace, userId: 'demo-jafar' }, { ...workspace, workspace: { id: 'demo' } }]) {
    assert.throws(() => mergeCanonicalTarget(invalidWorkspace, { tasks: [] }), error => error.code === 'UNAUTHENTICATED');
  }
  for (const records of [
    { tasks: [row(uid(21), { workspace_id: foreignWorkspace })] },
    { tasks: [{ id: uid(21) }] }, { tasks: [{ ...row(uid(21)), id: 'bad' }] },
    { files: [row(uid(22), { permission_scope: 'private', added_by: otherUser })] },
  ]) assert.throws(() => mergeCanonicalTarget(workspace, records), error => error.code === 'FORBIDDEN');
  for (const records of [null, [], { tasks: null }]) assert.throws(() => mergeCanonicalTarget(workspace, records), error => error.code === 'INVALID_RESPONSE');
  const file = row(uid(22), { permission_scope: 'restricted', added_by: userId });
  assert.deepEqual(json(mergeCanonicalTarget(workspace, { files: [file] }).files), [file]);
});

test('an older targeted cache row cannot overwrite a newer canonical revision',()=>{
 const workspace={workspace:{id:workspaceId},userId,projects:[row(projectId,{revision:8,title:'Newest saved brief'})]};
 const merged=mergeCanonicalTarget(workspace,{projects:[row(projectId,{revision:7,title:'Old targeted response'})]});
 assert.equal(merged.projects[0].title,'Newest saved brief');assert.equal(merged.projects[0].revision,8);
});
