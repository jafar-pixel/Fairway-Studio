import { StudioError, uuidPattern, type StudioRow } from "../contracts";

export type CanonicalTargetKind = "task" | "file" | "project";
export const canonicalTargetCollections = [
  "tasks", "files", "projects", "versions", "nodes", "rounds", "reviews", "decisions", "threads",
] as const;
export type CanonicalTargetCollection = typeof canonicalTargetCollections[number];
export type CanonicalTargetRecords = Partial<Record<CanonicalTargetCollection, StudioRow[]>>;

type WorkspaceScope = { workspace: { id: string }; userId: string };

/** Merge only a fresh authenticated response for the active workspace/account.
 * Returned rows replace older copies in full; absent collections and unrelated rows survive.
 * This is a presentation helper, not a substitute for the API's authentication and RLS.
 */
export function mergeCanonicalTarget<T extends WorkspaceScope>(workspace: T, records: CanonicalTargetRecords): T {
  if (!uuidPattern.test(workspace?.workspace?.id ?? "") || !uuidPattern.test(workspace?.userId ?? "")) {
    throw new StudioError("An authenticated workspace is required.", "UNAUTHENTICATED", 401);
  }
  if (!records || typeof records !== "object" || Array.isArray(records)) {
    throw new StudioError("Canonical target data is incomplete.", "INVALID_RESPONSE", 502);
  }
  const merged = { ...workspace } as T & CanonicalTargetRecords;
  for (const key of canonicalTargetCollections) {
    if (!(key in records)) continue;
    const incoming = records[key];
    if (!Array.isArray(incoming)) {
      throw new StudioError("Canonical target data is incomplete.", "INVALID_RESPONSE", 502);
    }
    for (const row of incoming) {
      if (!row || !uuidPattern.test(row.id ?? "") || row.workspace_id !== workspace.workspace.id) {
        throw new StudioError("Target is outside this workspace.", "FORBIDDEN", 403);
      }
      if (key === "files" && row.permission_scope !== "workspace" && row.added_by !== workspace.userId) {
        throw new StudioError("File not found or access denied.", "FORBIDDEN", 403);
      }
    }
    const replacements = new Map(incoming.map(row => [row.id, row]));
    const current = (workspace as T & CanonicalTargetRecords)[key] ?? [];
    merged[key] = current.map(row => {
      const replacement = replacements.get(row.id);
      replacements.delete(row.id);
      if (replacement && typeof row.revision === "number" && typeof replacement.revision === "number" && row.revision > replacement.revision) return row;
      return replacement ?? row;
    }).concat([...replacements.values()]);
  }
  return merged;
}
