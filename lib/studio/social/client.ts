import type { SocialDetail, SocialList, SocialManifest, SocialMutation, SocialMutationResult, SocialOperation, SocialOptions } from './contracts';

export class SocialApiError extends Error {
  constructor(message: string, public code: string, public status = 0, public uncertain = false) { super(message); this.name = 'SocialApiError'; }
  get conflict() { return this.status === 409 || this.code === 'CONFLICT'; }
  get unavailable() { return [401, 403].includes(this.status) || /SCHEMA|SETUP|CONFIGURATION|NOT_CONFIGURED|UNAUTH|FORBIDDEN/.test(this.code); }
}
export const asSocialError = (cause: unknown) => cause instanceof SocialApiError ? cause : new SocialApiError(cause instanceof Error ? cause.message : 'Social could not complete the request.', 'NETWORK');
export function createSocialRequest(workspaceId: string, operation: SocialOperation, input: Record<string, unknown>): SocialMutation {
  const request = { workspaceId, operation, requestId: crypto.randomUUID(), input: JSON.parse(JSON.stringify(input)) } as SocialMutation;
  function freeze(value: unknown) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } }
  freeze(request); return request;
}
function endpoint(workspaceId: string, params: Record<string, string>) { return `/api/studio/social?${new URLSearchParams({ workspaceId, ...params })}`; }
async function json<T>(url: string, init: RequestInit = {}, mutation = false): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...init, credentials: 'same-origin', cache: 'no-store' }); }
  catch (cause) {
    if (!mutation && cause instanceof Error && cause.name === 'AbortError') throw cause;
    throw new SocialApiError(mutation ? 'The connection stopped before the save was confirmed. Retry the same request to check safely.' : 'Social could not connect. Try again.', 'NETWORK', 0, mutation);
  }
  let body: unknown;
  try { body = await response.json(); } catch { throw new SocialApiError('The server response could not be read. Try again.', 'INVALID_RESPONSE', response.status, mutation); }
  if (!response.ok) {
    const error = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    const code = typeof error.code === 'string' ? error.code : 'REQUEST_FAILED';
    throw new SocialApiError(typeof error.error === 'string' ? error.error : 'The request could not be completed.', code, response.status, mutation && response.status >= 500 && !/SCHEMA|SETUP|CONFIGURATION|NOT_CONFIGURED/.test(code));
  }
  return body as T;
}
function unwrap<T>(body: T | { data: T }): T { return body && typeof body === 'object' && 'data' in body ? (body as {data:T}).data : body as T; }
function invalid(message: string): never { throw new SocialApiError(message, 'INVALID_RESPONSE', 502); }
export async function readSocialList(workspaceId: string, page = 0, signal?: AbortSignal): Promise<SocialList> {
  const data = unwrap(await json<SocialList | {data:SocialList}>(endpoint(workspaceId, {page:String(page)}), {signal}));
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.posts) || !Array.isArray(data.members) || !Number.isInteger(data.total) || data.total < 0 || !Number.isInteger(data.pageSize) || data.pageSize < 1 || data.page !== page || !data.actorId || data.capabilities?.manualPackages !== true || data.capabilities?.automaticPosting !== false || data.capabilities?.metricsSync !== false) invalid('Social is unavailable or its schema is incompatible. Refresh after setup is complete.');
  if (data.posts.some(post => post.workspace_id !== workspaceId)) invalid('Social returned records for a different workspace.');
  return data;
}
export async function readSocialDetail(workspaceId: string, postId: string, signal?: AbortSignal): Promise<SocialDetail> {
  const data = unwrap(await json<SocialDetail | {data:SocialDetail}>(endpoint(workspaceId, {postId}), {signal}));
  if (!data || data.schemaVersion !== 1 || data.post?.id !== postId || data.post?.workspace_id !== workspaceId || !['snapshots','reviews','decisions','publications','feedback'].every(key => Array.isArray(data[key as keyof SocialDetail]))) invalid('Social content could not be read safely. Refresh to try again.');
  return data;
}
export async function readSocialOptions(workspaceId: string, query = '', page = 0, signal?: AbortSignal): Promise<SocialOptions> {
  const data = unwrap(await json<SocialOptions | {data:SocialOptions}>(endpoint(workspaceId, {options:'1',q:query,page:String(page)}), {signal}));
  if (!data || !['ideas','projects','versions'].every(key => Array.isArray(data[key as keyof SocialOptions]))) invalid('Source choices could not be loaded. Try again.');
  return data;
}
export async function sendSocialRequest(request: SocialMutation): Promise<SocialMutationResult> {
  const body = await json<{data:SocialMutationResult}>('/api/studio/social', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)}, true);
  if (!body?.data?.postId || !Number.isInteger(body.data.revision) || body.data.revision < 0) throw new SocialApiError('The server did not confirm the saved change. Retry the same request.', 'INVALID_RESPONSE', 502, true);
  return body.data;
}
export async function readSocialManifest(workspaceId: string, snapshotId: string): Promise<SocialManifest> {
  const data = unwrap(await json<SocialManifest | {data:SocialManifest}>(socialPackageUrl(workspaceId,snapshotId)));
  if (!data || data.kind !== 'manual_publication_package' || data.schemaVersion !== 1 || data.approval?.snapshot !== snapshotId || !Array.isArray(data.assets)) invalid('The approved publication package could not be verified.');
  return data;
}
export const socialPackageUrl = (workspaceId: string, snapshotId: string) => endpoint(workspaceId, {package:snapshotId});
export const socialAssetUrl = (workspaceId: string, snapshotId: string, index: number) => endpoint(workspaceId, {snapshotId,asset:String(index)});
export function safeSocialUrl(value: string | null | undefined): string | null { if (!value) return null; try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; } }

/** Forms display wall-clock times in the explicitly selected IANA zone. */
export function wallTime(instant: string | null, timezone: string): string {
  if (!instant) return '';
  const date = new Date(instant); if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const p = Object.fromEntries(parts.map(part => [part.type,part.value])); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function instantFromWall(value: string, timezone: string): string | null {
  if (!value) return null;
  try { new Intl.DateTimeFormat('en', {timeZone:timezone}); } catch { throw new Error('Enter a valid IANA timezone, such as Europe/London or America/New_York.'); }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Enter a complete date and time.');
  const utc = Date.parse(`${value}:00Z`); if (!Number.isFinite(utc)) throw new Error('Enter a valid date and time.');
  const candidates = new Set<string>();
  // Collect actual offsets around the chosen day, including both sides of DST transitions.
  for (const hours of [-36,-24,-12,0,12,24,36]) {
    const probe = utc + hours * 3600000;
    const local = wallTime(new Date(probe).toISOString(), timezone);
    const offset = Date.parse(`${local}:00Z`) - probe;
    const candidate = new Date(utc - offset).toISOString();
    if (wallTime(candidate,timezone) === value) candidates.add(candidate);
  }
  if (candidates.size !== 1) throw new Error(candidates.size ? 'This time occurs twice when clocks change. Choose an unambiguous time.' : 'This local time does not exist when clocks change. Choose another time.');
  return [...candidates][0];
}
