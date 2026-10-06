import type { Operation, PrivateMutation, BooksPage, RegisterPage, RecordDetail, OptionsPage } from './contracts';

export class PrivateBusinessError extends Error {
  constructor(message: string, public code: string, public status: number, public uncertain = false) { super(message); this.name = 'PrivateBusinessError'; }
  get accessLost() { return this.status === 401 || this.status === 403 || ['UNAUTHENTICATED', 'UNAUTHORIZED', 'FORBIDDEN', 'SCHEMA_REQUIRED', 'CONFIGURATION_REQUIRED', 'NOT_CONFIGURED'].includes(this.code); }
}
export function privateError(error: unknown): PrivateBusinessError { return error instanceof PrivateBusinessError ? error : new PrivateBusinessError(error instanceof Error ? error.message : 'Private records are unavailable.', 'NETWORK', 0); }
export function createPrivateRequest(workspaceId: string, expectedUserId: string, operation: Operation, input: Record<string, unknown>): PrivateMutation {
  requireIntendedUser(expectedUserId);
  const request = { workspaceId, expectedUserId, requestId: crypto.randomUUID(), operation, input: JSON.parse(JSON.stringify(input)) } as PrivateMutation;
  function freeze(value: unknown) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } }
  freeze(request); return request;
}
function requireIntendedUser(expectedUserId: string) {
  if (typeof expectedUserId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(expectedUserId)) throw new PrivateBusinessError('Sign in again to open private records.', 'UNAUTHENTICATED', 401);
}
export function safePrivateUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const secretKey = /^(access_token|token|password|secret|signature|sig|api_key|key|authorization|auth|oauth_token|awsaccesskeyid|resourcekey|rlkey|x-amz-.+|x-goog-.+)$/i;
    const keys = [...parsed.searchParams.keys(), ...new URLSearchParams(parsed.hash.slice(1)).keys()];
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !/\s/.test(url) && !/[?&#][^=&#]*%/.test(url) && !keys.some(key => secretKey.test(key)) ? parsed.href : null;
  } catch { return null; }
}
export type PrivateQuery = { bookId?: string; recordId?: string; kind?: string; page?: number; q?: string; options?: 'plans' | 'members' };
export type PrivateResponse = BooksPage | RegisterPage | RecordDetail | OptionsPage;
export type PrivateMutationResult = { book?: { id: string }; record?: { id: string } };

/** No caches, browser storage, offline queue, or shared workspace state. A single uncertain
 * mutation is retained only in this account-bound instance so retries use the identical
 * frozen envelope, including the original intended user. The server rechecks that user
 * against the current authenticated account before any private RPC. */
export class PrivateBusinessClient {
  private request: PrivateMutation | null = null;
  private sending = false;
  private permissionEpoch = 0;
  constructor(readonly workspaceId: string, readonly expectedUserId: string, private readonly fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init), private readonly timeoutMs = 45000) { }
  get pending() { return this.sending; }
  get uncertain() { return Boolean(this.request) && !this.sending; }
  clearAccess() { this.permissionEpoch++; this.request = null; }
  async read<T extends PrivateResponse>(query: PrivateQuery = {}, signal?: AbortSignal): Promise<T> {
    requireIntendedUser(this.expectedUserId);
    const epoch = this.permissionEpoch;
    const { q, ...identifiers } = query;
    const result = await this.json('/api/studio/private-business', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...identifiers, ...(q ? { query: q } : {}), action: 'read', workspaceId: this.workspaceId, expectedUserId: this.expectedUserId }), signal });
    if (epoch !== this.permissionEpoch) throw new PrivateBusinessError('Access changed. Private records were cleared.', 'FORBIDDEN', 403);
    if (!result || typeof result !== 'object') throw new PrivateBusinessError('Private records returned incomplete data.', 'INVALID_RESPONSE', 502);
    const page = result as Record<string, unknown>;
    const arrayKey = query.options ? 'items' : query.recordId ? 'history' : query.bookId ? 'records' : 'books';
    if (!Array.isArray(page[arrayKey]) || !Number.isSafeInteger(page.page) || !Number.isSafeInteger(page.pageSize) || Number(page.pageSize) < 1 || (query.recordId ? !page.record || !Array.isArray(page.versions) : !Number.isSafeInteger(page.total) || Number(page.total) < 0) || (query.bookId && !query.recordId && !query.options && (!page.book || !Array.isArray(page.totals) || !Array.isArray(page.grants)))) throw new PrivateBusinessError('Private records returned incomplete data. Refresh to try again.', 'INVALID_RESPONSE', 502);
    return result as T;
  }
  async mutate(operation: Operation, input: Record<string, unknown>): Promise<PrivateMutationResult> {
    if (this.sending || this.request) throw new PrivateBusinessError('Resolve the current request before starting another change.', 'REQUEST_PENDING', 409);
    this.request = createPrivateRequest(this.workspaceId, this.expectedUserId, operation, input);
    return this.retry();
  }
  async retry(): Promise<PrivateMutationResult> {
    if (this.sending || !this.request) throw new PrivateBusinessError('There is no retryable request.', 'REQUEST_PENDING', 409);
    this.sending = true; const epoch = this.permissionEpoch;
    try {
      const body = await this.json('/api/studio/private-business', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.request) }, true);
      if (epoch !== this.permissionEpoch) throw new PrivateBusinessError('Access changed. Reload private records.', 'FORBIDDEN', 403);
      const data = body && typeof body === 'object' && 'data' in body ? (body as { data: PrivateMutationResult }).data : null;
      if (!data || (!data.book?.id && !data.record?.id)) throw new PrivateBusinessError('The server did not confirm the result. Retry the same request safely.', 'INVALID_RESPONSE', 502, true);
      this.request = null; return data;
    } catch (cause) {
      const error = privateError(cause);
      if (!error.uncertain || error.accessLost) this.request = null;
      throw error;
    } finally { this.sending = false; }
  }
  private async json(url: string, init: RequestInit, mutation = false): Promise<unknown> {
    const controller = new AbortController();
    const abort = () => controller.abort(init.signal?.reason);
    if (init.signal?.aborted) abort(); else init.signal?.addEventListener('abort', abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => {
      reject(new PrivateBusinessError(mutation ? 'The save timed out and may have succeeded. Retry the same request safely.' : 'Private records took too long to load. Refresh to try again.', 'TIMEOUT', 0, mutation));
      controller.abort();
    }, this.timeoutMs); });
    try { return await Promise.race([this.fetchJson(url, { ...init, signal: controller.signal }, mutation), timeout]); }
    finally { if (timer !== undefined) clearTimeout(timer); init.signal?.removeEventListener('abort', abort); }
  }
  private async fetchJson(url: string, init: RequestInit, mutation: boolean): Promise<unknown> {
    let response: Response;
    try { response = await this.fetcher(url, { ...init, credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' }); }
    catch (cause) { if (!mutation && cause instanceof Error && cause.name === 'AbortError') throw cause; throw new PrivateBusinessError(mutation ? 'Connection interrupted. This change may have saved. Retry the same request safely.' : 'Could not connect. Check your connection and refresh.', 'NETWORK', 0, mutation); }
    let body: unknown;
    try { body = await response.json(); } catch {
      if (response.status === 401 || response.status === 403) { this.clearAccess(); throw new PrivateBusinessError('Your access changed. Private records were cleared.', 'FORBIDDEN', response.status); }
      throw new PrivateBusinessError(mutation ? 'The result could not be read. Retry the same request safely.' : 'Could not read private records. Refresh to try again.', 'INVALID_RESPONSE', response.status, mutation);
    }
    if (!response.ok) {
      const envelope = body && typeof body === 'object' ? body as Record<string, unknown> : {};
      const code = typeof envelope.code === 'string' ? envelope.code : 'REQUEST_FAILED';
      const error = new PrivateBusinessError(typeof envelope.error === 'string' ? envelope.error : 'Private records are unavailable.', code, response.status, mutation && response.status >= 500 && !['SCHEMA_REQUIRED', 'CONFIGURATION_REQUIRED'].includes(code));
      if (error.accessLost) this.clearAccess(); throw error;
    }
    return body;
  }
}
