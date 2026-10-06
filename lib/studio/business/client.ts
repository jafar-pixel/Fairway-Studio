import type { BusinessDetail, BusinessList, BusinessMutation, BusinessOperation } from "./contracts";

export type BusinessView = "all" | "finals" | "ideas";
export type BusinessOption = { id: string; title: string };
export type BusinessOptionKind = "tasks" | "projects" | "files";

/** The same frozen envelope must be replayed after an uncertain write result. */
export function createBusinessRequest(workspaceId: string, operation: BusinessOperation, input: Record<string, unknown>): BusinessMutation {
  const request: BusinessMutation = {
    workspaceId,
    requestId: crypto.randomUUID(),
    operation,
    input: JSON.parse(JSON.stringify(input)) as Record<string, unknown>,
  };
  const freeze = (value: unknown): void => {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
  };
  freeze(request);
  return request;
}

export class BusinessApiError extends Error {
  constructor(message: string, public code: string, public status: number, public uncertain = false) {
    super(message);
    this.name = "BusinessApiError";
  }
  get conflict() { return this.status === 409 || this.code === "CONFLICT"; }
  get unavailable() {
    return this.status === 401 || this.status === 403 || ["NOT_CONFIGURED", "CONFIGURATION_REQUIRED", "SCHEMA_REQUIRED", "SETUP_REQUIRED", "SCHEMA_MISSING", "BUSINESS_SCHEMA_MISSING", "UNAUTHENTICATED", "UNAUTHORIZED", "FORBIDDEN"].includes(this.code);
  }
}

export function asBusinessError(error: unknown): BusinessApiError {
  return error instanceof BusinessApiError ? error : new BusinessApiError(
    error instanceof Error ? error.message : "The request could not be completed.", "NETWORK", 0,
  );
}

async function requestJson<T>(url: string, init: RequestInit, mutation = false): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store" });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new BusinessApiError(mutation ? "The connection was interrupted. This change may have been saved. Retry the same request to check safely." : "Business could not connect. Check your connection and try again.", "NETWORK", 0, mutation);
  }
  let body: unknown;
  try { body = await response.json(); } catch {
    throw new BusinessApiError(mutation ? "The server response could not be read. The change may have been saved. Retry the same request." : "Business returned an unreadable response. Try again.", "INVALID_RESPONSE", response.status, mutation);
  }
  const envelope = body && typeof body === "object" ? body as Record<string, unknown> : null;
  if (!response.ok) {
    const message = typeof envelope?.error === "string" ? envelope.error : "Business could not complete the request.";
    const code = typeof envelope?.code === "string" ? envelope.code : "REQUEST_FAILED";
    throw new BusinessApiError(message, code, response.status, mutation && response.status >= 500 && !["CONFIGURATION_REQUIRED", "SCHEMA_REQUIRED", "SETUP_REQUIRED"].includes(code));
  }
  return body as T;
}

function url(workspaceId: string, values: Record<string, string>): string {
  return `/api/studio/business?${new URLSearchParams({ workspaceId, ...values }).toString()}`;
}
function unwrap<T>(body: T | { data: T }): T {
  return body && typeof body === "object" && "data" in body ? (body as { data: T }).data : body as T;
}
export async function readBusinessList(workspaceId: string, page: number, view: BusinessView, signal?: AbortSignal): Promise<BusinessList> {
  const result = unwrap(await requestJson<BusinessList | { data: BusinessList }>(url(workspaceId, { page: String(page), view }), { signal }));
  if (!result || result.schemaVersion !== 1 || !Array.isArray(result.plans) || !Array.isArray(result.members) || !result.overview || !Number.isInteger(result.pageSize) || result.pageSize < 1 || !Number.isInteger(result.total) || result.total < 0 || !["active", "ideas", "awaitingReview", "finals", "overdue", "blockedTasks", "overdueTasks"].every(key => Number.isInteger(result.overview[key as keyof BusinessList["overview"]]) && result.overview[key as keyof BusinessList["overview"]] >= 0)) throw new BusinessApiError("Business list data is incomplete. Try refreshing.", "INVALID_RESPONSE", 502);
  return result;
}
export async function readBusinessDetail(workspaceId: string, planId: string, signal?: AbortSignal): Promise<BusinessDetail> {
  const result = unwrap(await requestJson<BusinessDetail | { data: BusinessDetail }>(url(workspaceId, { planId }), { signal }));
  if (!result?.plan || result.schemaVersion !== 1 || !Array.isArray(result.versions) || !Array.isArray(result.reviews) || !Array.isArray(result.swot) || !Array.isArray(result.tasks) || !Array.isArray(result.projects) || !Array.isArray(result.documents) || !Array.isArray(result.decisions)) throw new BusinessApiError("Business plan data is incomplete. Try refreshing.", "INVALID_RESPONSE", 502);
  return result;
}
export async function readBusinessOptions(workspaceId: string, kind: BusinessOptionKind, query: string, signal?: AbortSignal): Promise<BusinessOption[]> {
  const result = unwrap(await requestJson<{ options: BusinessOption[] } | { data: { options: BusinessOption[] } }>(url(workspaceId, { options: kind, q: query }), { signal }));
  if (!Array.isArray(result?.options)) throw new BusinessApiError("Available links could not be read. Try again.", "INVALID_RESPONSE", 502);
  return result.options;
}
export async function sendBusinessRequest(request: BusinessMutation): Promise<unknown> {
  const result = await requestJson<{ data: unknown }>("/api/studio/business", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
  }, true);
  if (!result || typeof result !== "object" || !("data" in result)) throw new BusinessApiError("The server did not confirm the saved change. Retry the same request to check safely.", "INVALID_RESPONSE", 502, true);
  return result.data;
}

/** Only ordinary HTTPS references can become document links. Never render active URL schemes. */
export function safeBusinessUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : null;
  } catch { return null; }
}
