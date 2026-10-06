import { scheduleMediaProcessing } from "@/lib/studio/media/dispatch";
import { readMediaJson } from "@/lib/studio/media/request";
import { get } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MEDIA_BUCKET, MEDIA_PREFIX as STORAGE_PREFIX, PREVIEW_BUCKET, MEDIA_UUID as UUID_PATTERN, isMediaPath as isStoragePath } from "@/lib/studio/media";
import { readHeader, signObject, PRIVATE_HEADERS } from "@/lib/studio/media/storage";
import { validateHeader, safeMediaFailure } from "@/lib/studio/media/validation";
import { MEDIA_JOB_TABLE, mediaWorkerStatus } from "@/lib/studio/media/jobs";

const LEGACY_BLOB_PREFIX = "blob://";
type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

function isLegacyBlobPath(pathname: string, workspaceId: string) {
  const segments = pathname.split("/");
  return (
    segments.length === 4 &&
    segments[0] === "workspace-assets" &&
    segments[1] === workspaceId &&
    UUID_PATTERN.test(segments[2]) &&
    /^[a-zA-Z0-9_-]+\.(?:avif|gif|jpe?g|png|webp)$/i.test(segments[3])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: PRIVATE_HEADERS });
}

async function isMember(
  supabase: SupabaseServer,
  workspaceId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return !error && Boolean(data);
}

export async function PATCH(request: NextRequest) {
  try {
    if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) return jsonError("Cross-origin writes are not allowed.",403);
    const body = await readMediaJson(request);
    if (!isRecord(body) || typeof body.workspaceId !== "string" || !UUID_PATTERN.test(body.workspaceId) || typeof body.path !== "string" || !isStoragePath(body.path, body.workspaceId) || typeof body.title !== "string") return jsonError("The media details are invalid.",400);
    const {workspaceId,path}=body;
    const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser();
    if(!user)return jsonError("Sign in to save workspace content.",401);
    if(!isStoragePath(path,workspaceId,user.id)||!await isMember(supabase,workspaceId,user.id))return jsonError("The uploaded file is unavailable.",403);
    // Exact object metadata and bounded bytes, never a 100 MB multipart proxy.
    const folder=path.slice(0,path.lastIndexOf("/")),name=path.slice(path.lastIndexOf("/")+1);
    const {data:listing,error:listError}=await supabase.storage.from(MEDIA_BUCKET).list(folder,{search:name,limit:100});
    const stored=listing?.find(item=>item.name===name);
    if(listError||!stored)return jsonError("The uploaded original could not be verified.",404);
    validateHeader(name,String(stored.metadata?.mimetype??""),Number(stored.metadata?.size??0),await readHeader(supabase,path));
    const {data,error}=await supabase.rpc("studio_register_media",{w:workspaceId,p:path,t:body.title,n:typeof body.contextNote==="string"?body.contextNote:"",tags_in:Array.isArray(body.tags)?body.tags.filter((x):x is string=>typeof x==="string").slice(0,10):[]});
    if(error||!data)return NextResponse.json({error:"The original uploaded, but media registration could not finish. Retry registration; the original has been preserved.",code:["42P01","PGRST202","PGRST205"].includes(error?.code??"")?"SCHEMA_REQUIRED":"REGISTRATION_FAILED"},{status:503,headers:PRIVATE_HEADERS});
    if(data.job.status==="queued")scheduleMediaProcessing([data.job.id]);
    return NextResponse.json({...data,worker:await mediaWorkerStatus()},{headers:PRIVATE_HEADERS});
  } catch(error) { const f=safeMediaFailure(error); return NextResponse.json({error:f.message,code:f.code},{status:f.status,headers:PRIVATE_HEADERS}); }
}

export async function DELETE(request: NextRequest) {
  if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) return jsonError("Cross-origin writes are not allowed.",403);
  let body:Record<string,unknown>;
  try{body=await readMediaJson(request,4096);}catch(error){const f=safeMediaFailure(error);return jsonError(f.message,f.status);}
  const workspaceId =
    typeof body?.workspaceId === "string" ? body.workspaceId : "";
  const path = typeof body?.path === "string" ? body.path : "";
  if (!UUID_PATTERN.test(workspaceId) || !isStoragePath(path, workspaceId)) {
    return jsonError("The uploaded file is not available.", 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Sign in to remove workspace content.", 401);
  if (!isStoragePath(path, workspaceId, user.id))
    return jsonError("The uploaded file is not available.", 403);

  const { data: referenced } = await supabase
    .from("workspace_files")
    .select("id")
    .eq("url", `${STORAGE_PREFIX}${path}`)
    .maybeSingle();
  if (referenced)
    return jsonError("This media is still in the shared library.", 409);

  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([path]);
  if (error) return jsonError("The unused media could not be removed.", 500);
  return new NextResponse(null, { status: 204 });
}

const responseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Disposition": 'inline; filename="workspace-reference"',
};

export async function GET(request: NextRequest) {
  let fileId = request.nextUrl.searchParams.get("id");
  const versionId = request.nextUrl.searchParams.get("versionId");
  if (
    (!fileId || !UUID_PATTERN.test(fileId)) &&
    (!versionId || !UUID_PATTERN.test(versionId))
  )
    return jsonError("This file is not available.", 404);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Sign in to view workspace content.", 401);

  let sourceSnapshot: string | null = null;
  let versionWorkspace: string | null = null;
  if (versionId) {
    if(!UUID_PATTERN.test(versionId))return jsonError("This version is unavailable.",404);
    const { data: version, error: versionError } = await supabase
      .from("studio_versions")
      .select("workspace_id,file_id,source_url")
      .eq("id", versionId)
      .maybeSingle();
    if (
      versionError ||
      !version?.file_id ||
      !version.source_url ||
      !(await isMember(supabase, version.workspace_id, user.id))
    )
      return jsonError("This version image is not available.", 404);
    fileId = version.file_id;
    sourceSnapshot = version.source_url;
    versionWorkspace = version.workspace_id;
  }
  const { data: file, error } = await supabase
    .from("workspace_files")
    .select("url,workspace_id,permission_scope,added_by,title")
    .eq("id", fileId)
    .eq("provider", "other")
    .maybeSingle();
  if (
    error ||
    !file ||
    (versionWorkspace !== null && versionWorkspace !== file.workspace_id) ||
    (file.permission_scope === "restricted" && file.added_by !== user.id) ||
    !(await isMember(supabase, file.workspace_id, user.id))
  ) {
    return jsonError("This file is not available.", 404);
  }

  if (sourceSnapshot) file.url = sourceSnapshot;

  if (file.url.startsWith(STORAGE_PREFIX)) {
    const path = file.url.slice(STORAGE_PREFIX.length);
    if (!isStoragePath(path, file.workspace_id))
      return jsonError("This file is not available.", 404);
    const original = request.nextUrl.searchParams.get("variant") === "original" || request.nextUrl.searchParams.get("download") === "1";
    let bucket=MEDIA_BUCKET,objectPath=path;
    // Select by both canonical file and exact snapshot source. Never substitute a different derivative.
    if(!original) {
      const {data:job,error:jobError}=await supabase.from(MEDIA_JOB_TABLE).select("status,source_path,preview_path,original_ready,error_code,error_message").eq("file_id",fileId).eq("source_path",path).maybeSingle();
      const schemaAbsent=["42P01","PGRST205"].includes(jobError?.code??"");
      if(jobError && !schemaAbsent)return jsonError("The preview is temporarily unavailable.",503);
      if(job) {
        if(job.status!=="ready")return NextResponse.json({error:job.error_message??"This preview is still being prepared.",code:job.error_code??"PREVIEW_PENDING",status:job.status},{status:job.status==="failed"?422:409,headers:PRIVATE_HEADERS});
        if(job.preview_path){bucket=PREVIEW_BUCKET;objectPath=job.preview_path;}
        else if(!job.original_ready)return jsonError("The preview is unavailable.",409);
      } else if(!/\.(avif|gif|jpe?g|png|webp)$/.test(path))return jsonError("This preview has not been registered.",409);
    }
    try {
      const extension=path.split(".").pop()??"bin",downloadName=`${file.title.replace(/[^a-zA-Z0-9 _-]/g,"").slice(0,80)||"original"}.${extension}`;
      // 307 preserves Range requests. Storage handles streaming/seeking without function body limits.
      const signed=await signObject(supabase,bucket,objectPath,original?downloadName:undefined);
      return new NextResponse(null,{status:307,headers:{...PRIVATE_HEADERS,Location:signed}});
    }catch{return jsonError("This media file is unavailable.",404);}
  }

  if (file.url.startsWith(`${LEGACY_BLOB_PREFIX}workspace-assets/`)) {
    const pathname = file.url.slice(LEGACY_BLOB_PREFIX.length);
    if (!isLegacyBlobPath(pathname, file.workspace_id))
      return jsonError("This file is not available.", 404);
    const result = await get(pathname, { access: "private" }).catch(() => null);
    if (
      !result ||
      result.statusCode !== 200 ||
      !result.blob.contentType.startsWith("image/")
    ) {
      return jsonError("This file is not available.", 404);
    }
    return new NextResponse(result.stream, {
      headers: { ...responseHeaders, "Content-Type": result.blob.contentType },
    });
  }

  return jsonError("This file is not available.", 404);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const maxDuration = 300;
