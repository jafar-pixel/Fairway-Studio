import type { FounderUpdateMutation, FounderUpdateOperation, FounderUpdatesFeed } from "./contracts";

export class FounderUpdatesApiError extends Error {
  constructor(message: string, public code: string, public status: number, public uncertain = false) { super(message); this.name = "FounderUpdatesApiError"; }
  get unavailable() { return this.status === 401 || this.status === 403 || ["SCHEMA_REQUIRED", "CONFIGURATION_REQUIRED", "UNAUTHENTICATED", "FORBIDDEN"].includes(this.code); }
}

async function requestJson<T>(url: string, init: RequestInit, mutation = false): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store" }); }
  catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new FounderUpdatesApiError(mutation ? "The connection was interrupted. This change may have been saved; retry the same action." : "Founder Updates could not connect. Try again.", "NETWORK", 0, mutation);
  }
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new FounderUpdatesApiError("Founder Updates returned an unreadable response.", "INVALID_RESPONSE", response.status, mutation); }
  const envelope = body && typeof body === "object" ? body as Record<string, unknown> : null;
  if (!response.ok) throw new FounderUpdatesApiError(typeof envelope?.error === "string" ? envelope.error : "Founder Updates could not complete the request.", typeof envelope?.code === "string" ? envelope.code : "REQUEST_FAILED", response.status, mutation && response.status >= 500);
  return body as T;
}

export function createFounderUpdateRequest(workspaceId: string, operation: FounderUpdateOperation, input: Record<string, unknown>): FounderUpdateMutation {
  return Object.freeze({ workspaceId, requestId: crypto.randomUUID(), operation, input: Object.freeze(JSON.parse(JSON.stringify(input)) as Record<string, unknown>) });
}

export async function readFounderUpdates(workspaceId: string, preview = false, signal?: AbortSignal): Promise<FounderUpdatesFeed> {
  const result = await requestJson<FounderUpdatesFeed>(`/api/studio/founder-updates?${new URLSearchParams({ workspaceId, ...(preview ? { preview: "1" } : {}) })}`, { signal });
  if (!result || result.schemaVersion !== 1 || !Array.isArray(result.posts)) throw new FounderUpdatesApiError("Founder Updates data is incomplete.", "INVALID_RESPONSE", 502);
  return result;
}

export async function sendFounderUpdateRequest(request: FounderUpdateMutation): Promise<FounderUpdatesFeed> {
  return requestJson<FounderUpdatesFeed>("/api/studio/founder-updates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }, true);
}
