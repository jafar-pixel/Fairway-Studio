import { StudioError, uuidPattern, type StudioRow } from "../contracts";
import { authorize, databaseError, tables } from "../server";
import type { CanonicalTargetCollection, CanonicalTargetKind, CanonicalTargetRecords } from "./canonical-hydration";

type Authorized = Awaited<ReturnType<typeof authorize>>;
type Client = Authorized["client"];
const PAGE_SIZE = 500;
const ID_BATCH_SIZE = 100;

function notFound(): never {
  throw new StudioError("Target not found or access denied.", "NOT_FOUND", 404);
}
function ids(rows: StudioRow[], column: string): string[] {
  return [...new Set(rows.map(row => row[column]).filter((value): value is string =>
    typeof value === "string" && uuidPattern.test(value),
  ))];
}
function union(...groups: StudioRow[][]): StudioRow[] {
  return [...new Map(groups.flat().map(row => [row.id, row])).values()];
}
function mayReadFile(row: StudioRow, userId: string): boolean {
  return row.permission_scope === "workspace" || row.added_by === userId;
}

/** Every query uses the requesting user's session, RLS and an explicit workspace filter. */
function scopedQuery(client: Client, workspaceId: string, key: CanonicalTargetCollection, userId: string) {
  const query = client.from(tables[key]).select("*").eq("workspace_id", workspaceId);
  return key === "files" ? query.or(`permission_scope.eq.workspace,added_by.eq.${userId}`) : query;
}

async function exact(auth: Authorized, workspaceId: string, key: "tasks" | "files" | "projects", id: string): Promise<StudioRow> {
  const { data, error } = await scopedQuery(auth.client, workspaceId, key, auth.user.id).eq("id", id).maybeSingle();
  if (error) throw databaseError(error);
  if (!data || data.id !== id || data.workspace_id !== workspaceId) notFound();
  const row = data as StudioRow;
  if (key === "files" && !mayReadFile(row, auth.user.id)) notFound();
  return row;
}

/** End only on an empty page, not a short page: a database API may cap below PAGE_SIZE. */
async function pages(auth: Authorized, workspaceId: string, key: CanonicalTargetCollection, column: string, values: string | string[]): Promise<StudioRow[]> {
  const result: StudioRow[] = [];
  const seen = new Set<string>();
  for (let offset = 0; ; ) {
    let query = scopedQuery(auth.client, workspaceId, key, auth.user.id);
    query = typeof values === "string" ? query.eq(column, values) : query.in(column, values);
    const { data, error } = await query.order("id", { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
    if (error) throw databaseError(error);
    if (!data?.length) break;
    for (const item of data) {
      const row = item as StudioRow;
      // Fail closed rather than hydrating a foreign or unexpected record from a faulty response.
      if (row.workspace_id !== workspaceId || !uuidPattern.test(row.id ?? "") ||
          (typeof values === "string" ? row[column] !== values : !values.includes(String(row[column])))) {
        throw new StudioError("Canonical target data could not be verified.", "FORBIDDEN", 403);
      }
      if (seen.has(row.id)) {
        throw new StudioError("Canonical target data changed while loading. Try again.", "CONFLICT", 409);
      }
      seen.add(row.id);
      if (key !== "files" || mayReadFile(row, auth.user.id)) result.push(row);
    }
    offset += data.length;
  }
  return result;
}

async function related(auth: Authorized, workspaceId: string, key: CanonicalTargetCollection, column: string, values: string[]): Promise<StudioRow[]> {
  const result: StudioRow[] = [];
  const unique = [...new Set(values)];
  for (let offset = 0; offset < unique.length; offset += ID_BATCH_SIZE) {
    result.push(...await pages(auth, workspaceId, key, column, unique.slice(offset, offset + ID_BATCH_SIZE)));
  }
  return result;
}

export async function readCanonicalTarget(params: URLSearchParams): Promise<{ records: CanonicalTargetRecords }> {
  const workspaceId = (params.get("workspaceId") ?? "").toLowerCase();
  const id = (params.get("id") ?? "").toLowerCase();
  const kind = params.get("kind") as CanonicalTargetKind | null;
  if (!uuidPattern.test(workspaceId) || !uuidPattern.test(id)) {
    throw new StudioError("Valid workspace and target IDs are required.", "VALIDATION");
  }
  if (kind !== "task" && kind !== "file" && kind !== "project") {
    throw new StudioError("Choose a task, file or project target.", "VALIDATION");
  }
  const auth = await authorize(workspaceId);
  if (kind === "task") {
    const task = await exact(auth, workspaceId, "tasks", id);
    const records: CanonicalTargetRecords = { tasks: [task] };
    if (typeof task.project_id === "string" && uuidPattern.test(task.project_id)) {
      const { data: project, error } = await scopedQuery(auth.client, workspaceId, "projects", auth.user.id)
        .eq("id", task.project_id).maybeSingle();
      if (error) throw databaseError(error);
      if (project) {
        if (project.id !== task.project_id || project.workspace_id !== workspaceId) notFound();
        records.projects = [project as StudioRow];
      }
    }
    return { records };
  }
  if (kind === "file") return { records: { files: [await exact(auth, workspaceId, "files", id)] } };

  const project = await exact(auth, workspaceId, "projects", id);
  // Business plans have their own governed detail endpoint and must never enter creative review hydration.
  if (String(project.category ?? "").trim().toLowerCase() === "business") return { records: { projects: [project] } };

  const [ownVersions, nodes, ownRounds, tasks, ownDecisions, ownThreads] = await Promise.all(
    (["versions", "nodes", "rounds", "tasks", "decisions", "threads"] as const)
      .map(key => pages(auth, workspaceId, key, "project_id", id)),
  );
  // Canvas can reuse another same-workspace project's version; direct rounds can refer to one too.
  const ownVersionIds = new Set(ids(ownVersions, "id"));
  const referencedVersionIds = [...ids(nodes, "version_id"), ...ids(ownRounds, "version_id")]
    .filter(versionId => !ownVersionIds.has(versionId));
  const versions = union(ownVersions, await related(auth, workspaceId, "versions", "id", referencedVersionIds));
  const rounds = union(ownRounds, await related(auth, workspaceId, "rounds", "version_id", ids(versions, "id")));
  const [reviews, relatedDecisions, taskThreads, files] = await Promise.all([
    related(auth, workspaceId, "reviews", "round_id", ids(rounds, "id")),
    related(auth, workspaceId, "decisions", "round_id", ids(rounds, "id")),
    related(auth, workspaceId, "threads", "task_id", ids(tasks, "id")),
    related(auth, workspaceId, "files", "id", [...ids(nodes, "file_id"), ...ids(versions, "file_id")]),
  ]);
  return { records: {
    projects: [project], versions, nodes, rounds, reviews, tasks, files,
    decisions: union(ownDecisions, relatedDecisions), threads: union(ownThreads, taskThreads),
  } };
}
