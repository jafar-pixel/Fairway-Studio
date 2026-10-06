/** Only canonical IDs belong in workflow URLs. Private text never enters the URL. */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type ContentView = 'board' | 'calendar' | 'feedback';
export type PrivateLocation = { tab: 'documents' | 'finance'; bookId?: string; recordId?: string };
export type WorkflowRoute =
 | { kind: 'plans'; planId?: string }
 | ({ kind: 'private' } & PrivateLocation)
 | { kind: 'content'; view: ContentView; postId?: string }
 | { kind: 'invalid' };
export function parseWorkflowRoute(route: string[], canonicalBusinessProject = false): WorkflowRoute {
 const [root, section, id, record, ...extra] = route;
 if (canonicalBusinessProject) return section && uuid.test(section) ? {kind:'plans',planId:section} : {kind:'invalid'};
 if (root === 'business') {
  if (!section) return {kind:'plans'};
  if (section === 'documents' || section === 'finance') {
   if (extra.length || (id && !uuid.test(id)) || (record && !uuid.test(record))) return {kind:'invalid'};
   return {kind:'private',tab:section,bookId:id,recordId:record};
  }
  return uuid.test(section) && !id ? {kind:'plans',planId:section} : {kind:'invalid'};
 }
 if (root === 'content') {
  if (!section) return {kind:'content',view:'board'};
  if (section === 'calendar' || section === 'feedback') return !record && (!id || uuid.test(id)) ? {kind:'content',view:section,postId:id} : {kind:'invalid'};
  return uuid.test(section) && !id ? {kind:'content',view:'board',postId:section} : {kind:'invalid'};
 }
 return {kind:'invalid'};
}
function canonical(id: string) { if (!uuid.test(id)) throw new Error('A canonical record ID is required.'); return encodeURIComponent(id); }
export function contentUrl(base: string, view: ContentView, postId?: string | null) {
 return `${base}/content${view === 'board' ? '' : `/${view}`}${postId ? `/${canonical(postId)}` : ''}`;
}
export function privateBusinessUrl(base: string, location: PrivateLocation) {
 if (location.recordId && !location.bookId) throw new Error('A register is required for a private record.');
 return `${base}/business/${location.tab}${location.bookId ? `/${canonical(location.bookId)}` : ''}${location.recordId ? `/${canonical(location.recordId)}` : ''}`;
}
export function workflowRouteLabel(route: WorkflowRoute): string {
 if (route.kind === 'private') return route.tab === 'finance' ? 'Budget & Finance' : 'Documents & Contracts';
 if (route.kind === 'content') return route.postId ? 'Content detail' : route.view === 'board' ? 'Content Board' : route.view === 'calendar' ? 'Calendar' : 'Feedback';
 return route.kind === 'plans' ? route.planId ? 'Plan detail' : 'Drafts & Plans' : 'Page unavailable';
}
