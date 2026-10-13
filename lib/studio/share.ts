import { createHash } from "node:crypto";
import { StudioError, uuidPattern } from "./contracts";
export function shareRequestId(request:string, part:string) {
 const h=createHash("sha256").update(`${request}:${part}`).digest("hex").slice(0,32);
 return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20)}`;
}
export function validateShare(body:any) {
 if(!body || ![body.workspaceId,body.projectId,body.teamId,body.requestId].every(v=>typeof v==="string" && uuidPattern.test(v)) || !Array.isArray(body.versionIds) || !body.versionIds.length || body.versionIds.length>6 || body.versionIds.some((v:any)=>typeof v!=="string" || !uuidPattern.test(v))) throw new StudioError("Select up to six saved designs to share.","VALIDATION");
 if(body.title !== undefined && (typeof body.title !== "string" || !body.title.trim() || body.title.length>160)) throw new StudioError("Use a shorter shared design name.","VALIDATION");
 return {...body, versionIds:[...new Set<string>(body.versionIds)]};
}

export function orderSharedVersions(versions:Record<string,any>[], ids:string[]) {
 const pending=ids.map(id=>versions.find(v=>v.id===id)!);
 const result:Record<string,any>[]=[];
 while(pending.length) {
  const index=pending.findIndex(v=>!pending.some(p=>p.id===v.parent_id));
  if(index<0) throw new StudioError("Design ancestry could not be verified.","VALIDATION");
  result.push(...pending.splice(index,1));
 }
 return result;
}
