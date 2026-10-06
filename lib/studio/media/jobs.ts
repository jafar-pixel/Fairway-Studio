import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdtemp, rm, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MEDIA_BUCKET, PREVIEW_BUCKET, type MediaJob } from "../media";
import { MediaError, safeMediaFailure, validateHeader } from "./validation";
import { downloadBounded } from "./storage";
import { convertNative, inspectOutput, nativeAvailable } from "./portable-native";
export const MEDIA_JOB_TABLE="studio_media_jobs";
export function mediaService():SupabaseClient {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(url!=="https://xljhxmyigtxhjtxxzuwk.supabase.co"||!key)throw new MediaError("WORKER_SETUP_REQUIRED","Preview conversion needs the approved server worker connection. Your original is preserved.",503);
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)})}});
}
export async function mediaWorkerStatus() {
  try {
    const client=mediaService();
    const {error}=await client.from(MEDIA_JOB_TABLE).select("id").limit(1);
    const available=!error&&await nativeAvailable();
    return {available,automatic:available,mode:"after_response",recovery:"manual",code:available?null:"WORKER_SETUP_REQUIRED",message:available?"Previews run automatically after uploads. If an invocation is interrupted, retry resumes the saved original.":"Original saved. The packaged preview runtime or media schema needs setup."};
  }catch{return {available:false,automatic:false,mode:"after_response",recovery:"manual",code:"WORKER_SETUP_REQUIRED",message:"Original saved. The approved server connection is unavailable."};}
}
export async function authorizedMediaJob(client:SupabaseClient,workspaceId:string,fileId:string) {
  const {data,error}=await client.from(MEDIA_JOB_TABLE).select("*").eq("workspace_id",workspaceId).eq("file_id",fileId).maybeSingle();
  if(error)throw new MediaError("SCHEMA_REQUIRED","Media preview setup is required.",503);return data as MediaJob|null;
}
async function jobSourceStillAuthorized(client:SupabaseClient,job:MediaJob) {
  const [{data:file,error},{data:member,error:memberError}]=await Promise.all([
    client.from("workspace_files").select("url,workspace_id,added_by").eq("id",job.file_id).maybeSingle(),
    client.from("workspace_members").select("user_id").eq("workspace_id",job.workspace_id).eq("user_id",job.created_by).maybeSingle(),
  ]);
  if(error||memberError)throw new MediaError("STORAGE_UNAVAILABLE","Workspace authorization could not be verified.",503,true);
  if(!file||!member||file.workspace_id!==job.workspace_id||file.added_by!==job.created_by||file.url!==`supabase-storage://${MEDIA_BUCKET}/${job.source_path}`)throw new MediaError("SOURCE_UNAVAILABLE","The original is no longer available to its uploading workspace member.",403);
}
async function cleanupAbandonedPreviews(client:SupabaseClient,job:MediaJob) {
  // At most three attempts exist. A reclaimed lease may have left an uncommitted derivative.
  const folder=`${job.workspace_id}/${job.id}`;
  const {data,error}=await client.storage.from(PREVIEW_BUCKET).list(folder,{limit:20});
  if(error)throw new MediaError("STORAGE_UNAVAILABLE","Preview storage is temporarily unavailable.",503,true);
  const stale=(data??[]).filter(object=>/^[0-9a-f-]{36}\.(jpg|mp4)$/.test(object.name))
    .map(object=>`${folder}/${object.name}`).filter(path=>path!==job.preview_path&&!path.includes(`/${job.lease_id}.`));
  if(stale.length){const {error:removeError}=await client.storage.from(PREVIEW_BUCKET).remove(stale);if(removeError)throw new MediaError("STORAGE_UNAVAILABLE","Unfinished preview cleanup is temporarily unavailable.",503,true);}
}
export async function runMediaJob(jobId?:string) {
  const client=mediaService();
  if(!await nativeAvailable())throw new MediaError("WORKER_SETUP_REQUIRED","The FFmpeg/libheif native runtime is not installed on this server.",503);
  const {data,error}=await client.rpc("studio_claim_media",{job_id:jobId??null});
  if(error)throw new MediaError("SCHEMA_REQUIRED","Media job setup is required.",503);
  const job=(data?.[0]??null) as MediaJob|null;if(!job)return null;
  let directory:string|undefined,uploadedPath:string|undefined;
  try {
    await jobSourceStillAuthorized(client,job);
    await cleanupAbandonedPreviews(client,job);
    directory=await mkdtemp(join(tmpdir(),"fairway-media-"));const input=join(directory,"original");
    const sourceSha=await downloadBounded(client,job.source_path,input,job.source_size);
    if(job.source_sha256&&sourceSha!==job.source_sha256)throw new MediaError("SOURCE_CHANGED","The original no longer matches the previously verified content.");
    const handle=await open(input,"r");const header=Buffer.alloc(Math.min(job.source_size,65536));try{await handle.read(header,0,header.length,0);}finally{await handle.close();}
    validateHeader(job.source_path,job.source_type,job.source_size,header);
    const result=await convertNative(input,job.source_type,directory);
    let preview:Record<string,unknown>={preview_path:null,preview_type:null,preview_size:null,preview_sha256:null};
    if(result.output) {
      const output=await inspectOutput(result.output),extension=result.type==="video/mp4"?"mp4":"jpg";
      const path=`${job.workspace_id}/${job.id}/${job.lease_id}.${extension}`;
      const {error:uploadError}=await client.storage.from(PREVIEW_BUCKET).upload(path,output.bytes,{contentType:result.type,upsert:false,cacheControl:"0"});
      if(uploadError)throw new MediaError("STORAGE_UNAVAILABLE","The converted preview could not be saved. Please retry.",503,true);
      uploadedPath=path;preview={preview_path:path,preview_type:result.type,preview_size:output.size,preview_sha256:output.sha256};
    }
    await jobSourceStillAuthorized(client,job);
    const {data:saved,error:saveError}=await client.from(MEDIA_JOB_TABLE).update({...preview,source_sha256:sourceSha,original_ready:result.originalReady,metadata:result.metadata,status:"ready",lease_id:null,lease_until:null,error_code:null,error_message:null,updated_at:new Date().toISOString()}).eq("id",job.id).eq("status","processing").eq("lease_id",job.lease_id!).gt("lease_until",new Date().toISOString()).select("*").maybeSingle();
    if(saveError)throw new MediaError("STORAGE_UNAVAILABLE","The preview completion could not be recorded. Please retry.",503,true);
    if(!saved){if(uploadedPath)await client.storage.from(PREVIEW_BUCKET).remove([uploadedPath]);return null;}
    return saved as MediaJob;
  } catch(error) {
    if(uploadedPath)await client.storage.from(PREVIEW_BUCKET).remove([uploadedPath]).catch(()=>undefined);
    const failure=safeMediaFailure(error),retry=failure.retryable&&job.attempts<3;
    const {data:saved}=await client.from(MEDIA_JOB_TABLE).update({status:retry?"queued":failure.code==="WORKER_SETUP_REQUIRED"?"blocked":"failed",lease_id:null,lease_until:null,error_code:failure.code,error_message:failure.message,next_attempt_at:new Date(Date.now()+Math.min(300,15*2**job.attempts)*1000).toISOString(),updated_at:new Date().toISOString()}).eq("id",job.id).eq("status","processing").eq("lease_id",job.lease_id!).select("*").maybeSingle();
    return (saved??job) as MediaJob;
  } finally {if(directory)await rm(directory,{recursive:true,force:true});}
}
export async function retryMediaJob(client:SupabaseClient,workspaceId:string,jobId:string,userId:string) {
  const {data:job,error}=await client.from(MEDIA_JOB_TABLE).select("*").eq("id",jobId).eq("workspace_id",workspaceId).maybeSingle();
  if(error||!job)throw new MediaError("NOT_FOUND","This preview job is unavailable.",404);
  // Retry only by its uploader; teammates can view but cannot spend unbounded conversion resources.
  if(job.created_by!==userId)throw new MediaError("FORBIDDEN","Only the uploader can retry this preview.",403);
  if(job.attempts>=3)throw new MediaError("ATTEMPT_LIMIT","This preview reached its retry limit. Your original is preserved.");
  // The RPC rechecks authorization and takes the same uploader lock/quota as registration.
  const {data:saved,error:saveError}=await client.rpc("studio_retry_media",{w:workspaceId,jid:jobId});
  if(saveError){
    if(saveError.message?.includes("QUEUE_LIMIT"))throw new MediaError("QUEUE_LIMIT","Finish pending previews before retrying more files.",429);
    if(saveError.message?.includes("ATTEMPT_LIMIT"))throw new MediaError("ATTEMPT_LIMIT","This preview reached its retry limit. Your original is preserved.");
    if(saveError.code==="42501")throw new MediaError("FORBIDDEN","This preview is no longer available to your account.",403);
    if(["42P01","PGRST202","PGRST205"].includes(saveError.code??""))throw new MediaError("SCHEMA_REQUIRED","Media retry setup is required.",503);
    throw new MediaError("PROCESSING_FAILED","The preview could not be retried.",503,true);
  }
  return (saved??job) as MediaJob;
}

/** UI classification only; the atomic retry RPC checks lease expiry again in Postgres. */
export function clientMediaJob(job:MediaJob):MediaJob {
 const expired=job.status==="processing"&&Boolean(job.lease_until)&&Date.parse(job.lease_until!)<Date.now();
 const unclaimed=job.status==="queued"&&Date.parse(job.updated_at)<Date.now()-600000;
 if(!expired&&!unclaimed)return job;
 return {...job,status:job.attempts>=3?"failed":"blocked",error_code:job.attempts>=3?"ATTEMPT_LIMIT":"RECOVERY_REQUIRED",error_message:job.attempts>=3?"This preview reached its retry limit. Your original is preserved.":"Preview processing was interrupted. Retry to continue from your saved original."};
}
