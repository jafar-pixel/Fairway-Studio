import { collectionDetailUrl } from "../collection-helpers";
export type NavigationState = { dirty: boolean; pending: boolean; uncertain: boolean };
export const cleanBusinessNavigation: NavigationState = { dirty: false, pending: false, uncertain: false };
export function isBusinessProject(project: unknown): boolean {
 return !!project && typeof project === "object" && String((project as {category?: unknown}).category || "").trim().toLowerCase() === "business";
}
/** UI-only purpose projection. Canonical workspace data and task attribution remain intact. */
export function creativeWorkspaceData<T extends Record<string, any>>(data: T): T {
 const ids = new Set((data.projects || []).filter(isBusinessProject).map((row: any) => row.id));
 const rounds = new Set((data.rounds || []).filter((row: any) => ids.has(row.project_id)).map((row: any) => row.id));
 const versions = new Set((data.versions || []).filter((row: any) => ids.has(row.project_id)).map((row: any) => row.id));
 return { ...data,
  projects: (data.projects || []).filter((row: any) => !ids.has(row.id)),
  versions: (data.versions || []).filter((row: any) => !ids.has(row.project_id)),
  nodes: (data.nodes || []).filter((row: any) => !ids.has(row.project_id) && !versions.has(row.version_id)),
  rounds: (data.rounds || []).filter((row: any) => !ids.has(row.project_id)),
  reviews: (data.reviews || []).filter((row: any) => !rounds.has(row.round_id)),
  decisions: (data.decisions || []).filter((row: any) => !ids.has(row.project_id) && !rounds.has(row.round_id)),
 };
}
export function canonicalBusinessDestination(base: string, kind: "task"|"file"|"project"|"business", id: string, origin: string): string {
 if (kind === "business") return `${base}/business/${encodeURIComponent(id)}`;
 if (kind === "project") return `${base}/projects/${encodeURIComponent(id)}/overview`;
 const section = kind === "task" ? "tasks" : "library";
 const url = new URL(collectionDetailUrl(new URL(`${base}/${section}`, origin).href, section, id));
 url.searchParams.set("businessTarget","1");
 return url.pathname + url.search;
}
export function purposeAwareDestination(to: string, base: string, projects: unknown[], origin: string): string {
 const url = new URL(to, origin); const prefix = `${base}/projects/`;
 if (url.origin !== origin || !url.pathname.startsWith(prefix)) return to;
 const id = decodeURIComponent(url.pathname.slice(prefix.length).split("/")[0] || "");
 if ((projects || []).some((row: any) => row.id === id && isBusinessProject(row))) return canonicalBusinessDestination(base,"business",id,origin);
 return to;
}
export function sameBusinessNavigation(a: NavigationState,b: NavigationState) {
 return a.dirty === b.dirty && a.pending === b.pending && a.uncertain === b.uncertain;
}

export function canonicalRouteTarget(route: string[], query: string): {kind:"task"|"file"|"project";id:string}|null {
 const section=route[0]; const params=new URLSearchParams(query);
 if(section!=="projects" && params.get("businessTarget")!=="1") return null;
 const id=section==="projects"?route[1]:params.get("item") || route[1];
 if(!id || !["tasks","library","projects"].includes(section))return null;
 return {kind:section==="tasks"?"task":section==="library"?"file":"project",id};
}

export function accessReadFailure(error: unknown): boolean {
 if(!error || typeof error!=="object")return false;
 const value=error as {status?:number;code?:string};
 return [400,401,403,404].includes(value.status || 0) || ["42501","UNAUTHENTICATED","FORBIDDEN","NOT_FOUND","PGRST301","PGRST302","PGRST303"].includes(value.code || "");
}
export function keepCachedRead(data: unknown,error: unknown): boolean { return Boolean(data) && !accessReadFailure(error); }
