/** Client-side cache isolation only. Server authorization and RLS remain authoritative. */
type Row = Record<string, any>;
export function authIdentityTransition(currentId: string | null | undefined, nextId: string | null | undefined) {
  const current = currentId || null;
  const next = nextId || null;
  return { nextId: next, clearPrivate: next === null || current !== next };
}
export function accessReadFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { status?: number; code?: string };
  return [400, 401, 403, 404].includes(value.status || 0) || ["42501", "UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "SCOPE_CHANGED", "PGRST301", "PGRST302", "PGRST303"].includes(value.code || "");
}
function scopeError(message = "Your session changed. Reload this workspace.") {
  return Object.assign(new Error(message), { status: 403, code: "SCOPE_CHANGED" });
}
export function verifiedWorkspace(data: unknown, workspaceId: string | undefined, userId: string | undefined): boolean {
  const value = data as Row | undefined;
  return Boolean(workspaceId && userId && value?.workspace?.id === workspaceId && value.userId === userId && Array.isArray(value.members) && value.members.some((member: Row) => member.user_id === userId && member.workspace_id === workspaceId));
}
export function assertWorkspaceResponse<T>(data: T, url: string, expectedUserId: string): T {
  const workspaceId = new URL(url, "https://fairway.invalid").searchParams.get("workspaceId") || "";
  const value = data as Row | undefined;
  if (url.startsWith("/api/studio/workflow?")) {
    if (value?.notificationPreferences?.user_id !== expectedUserId || value.notificationPreferences.workspace_id !== workspaceId) throw scopeError();
  } else if (!verifiedWorkspace(value, workspaceId, expectedUserId)) throw scopeError();
  return data;
}
export function workspaceDiscoveryGate(explicitWorkspace: boolean, workspaces: unknown): "target" | "loading" | "first" | "ready" {
  if (explicitWorkspace) return "target";
  if (!Array.isArray(workspaces)) return "loading";
  return workspaces.length ? "ready" : "first";
}
/** A list response must belong to the actor whose SWR key is being populated. */
export async function readIdentityWorkspaces(client: {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null }; error: any }> };
  from: (table: string) => { select: (fields: string) => PromiseLike<{ data: unknown; error: any }> };
}, expectedUserId: string) {
  const check = async () => {
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    if (!data.user || data.user.id !== expectedUserId) throw scopeError();
  };
  await check();
  const { data, error } = await client.from("workspaces").select("id,name");
  if (error) throw error;
  await check();
  if (!Array.isArray(data) || data.some((row) => !row || typeof row.id !== "string" || typeof row.name !== "string")) {
    throw Object.assign(new Error("The workspace list could not be verified. Retry loading it."), { status: 502, code: "INVALID_WORKSPACE_LIST" });
  }
  return data as Array<{ id: string; name: string }>;
}

export function workspaceCacheKey(key: unknown, workspaceId: string | undefined, userId: string): boolean {
  if (!Array.isArray(key) || key[1] !== userId || typeof key[0] !== "string" || !workspaceId) return false;
  try {
    const url = new URL(key[0], "https://fairway.invalid");
    return url.pathname.startsWith("/api/studio/") && url.searchParams.get("workspaceId") === workspaceId;
  } catch { return false; }
}
