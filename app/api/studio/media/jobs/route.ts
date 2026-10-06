import { scheduleMediaProcessing } from "@/lib/studio/media/dispatch";
import { StudioError } from "@/lib/studio/contracts";
import { readMediaJson } from "@/lib/studio/media/request";
import { isSameOriginWrite } from "@/lib/studio/request-origin";
import { authorize } from "@/lib/studio/server";
import { MEDIA_UUID, MEDIA_PREFIX } from "@/lib/studio/media";
import { MEDIA_JOB_TABLE, mediaWorkerStatus, retryMediaJob, clientMediaJob } from "@/lib/studio/media/jobs";
import { PRIVATE_HEADERS } from "@/lib/studio/media/storage";
import { MediaError, safeMediaFailure } from "@/lib/studio/media/validation";
export const runtime="nodejs";export const dynamic="force-dynamic";
function failure(e:unknown){if(e instanceof StudioError)return Response.json({error:e.message,code:e.code},{status:e.status,headers:PRIVATE_HEADERS});const f=safeMediaFailure(e);return Response.json({error:f.message,code:f.code},{status:f.status,headers:PRIVATE_HEADERS});}
export async function GET(request:Request) {
  try {
    const url=new URL(request.url),workspaceId=url.searchParams.get("workspaceId")??"",ids=(url.searchParams.get("fileIds")??"").split(",").filter(Boolean);
    if(!MEDIA_UUID.test(workspaceId)||ids.length>100||ids.some(id=>!MEDIA_UUID.test(id)))throw new MediaError("VALIDATION","Choose valid media IDs.",400);
    const {client}=await authorize(workspaceId);
    let query=client.from(MEDIA_JOB_TABLE).select("*").eq("workspace_id",workspaceId).order("created_at",{ascending:false}).limit(100);
    if(ids.length)query=query.in("file_id",ids);
    const {data:jobs,error}=await query;if(error)throw new MediaError("SCHEMA_REQUIRED","Media preview setup is required.",503);
    let legacyFileIds:string[]=[];
    if(ids.length){const {data:files,error:filesError}=await client.from("workspace_files").select("id,url").eq("workspace_id",workspaceId).in("id",ids);if(filesError)throw new MediaError("STORAGE_UNAVAILABLE","Media details are unavailable.",503);legacyFileIds=(files??[]).filter(f=>!jobs?.some(j=>j.file_id===f.id)&&((f.url.startsWith(MEDIA_PREFIX)||f.url.startsWith("blob://workspace-assets/"))&&/\.(avif|gif|jpe?g|png|webp)$/.test(f.url))).map(f=>f.id);}
    scheduleMediaProcessing((jobs??[]).filter(job=>job.status==="queued"&&Date.parse(job.updated_at)>=Date.now()-600000).map(job=>job.id));
    return Response.json({jobs:(jobs??[]).map(clientMediaJob),legacyFileIds,worker:await mediaWorkerStatus()},{headers:PRIVATE_HEADERS});
  }catch(e){return failure(e);}
}
export async function POST(request:Request) {
  try {
    if(!isSameOriginWrite(request))throw new MediaError("FORBIDDEN","Cross-origin writes are not allowed.",403);
    const body=await readMediaJson(request,4096);if(body.action!=="retry"||typeof body.workspaceId!=="string"||!MEDIA_UUID.test(body.workspaceId)||typeof body.jobId!=="string"||!MEDIA_UUID.test(body.jobId))throw new MediaError("VALIDATION","Choose a valid preview job.",400);
    const {client,user}=await authorize(body.workspaceId);
    const job=await retryMediaJob(client,body.workspaceId,body.jobId,user.id);
    if(job.status==="queued")scheduleMediaProcessing([job.id]);
    return Response.json({job:clientMediaJob(job),worker:await mediaWorkerStatus()},{headers:PRIVATE_HEADERS});
  }catch(e){return failure(e);}
}

export const maxDuration = 300;
