import { NextRequest, NextResponse } from "next/server";
import { authorize, databaseError } from "@/lib/studio/server";
import { StudioError } from "@/lib/studio/contracts";
import { validateShare, shareRequestId, orderSharedVersions } from "@/lib/studio/share";
import { copyUploadedFile } from "@/lib/studio/media-copy";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=300;
export async function POST(request:NextRequest) {
 try {
  if(request.headers.get("origin") && request.headers.get("origin")!==request.nextUrl.origin) throw new StudioError("Cross-origin writes are not allowed.","FORBIDDEN",403);
  const input=validateShare(await request.json());
  const {client,user}=await authorize(input.workspaceId); await authorize(input.teamId);
  const {data:workspace,error:workspaceError}=await client.from("workspaces").select("studio_kind,parent_workspace_id,created_by").eq("id",input.workspaceId).single();
  if(workspaceError) throw databaseError(workspaceError);
  if(workspace.studio_kind!=="personal" || workspace.parent_workspace_id!==input.teamId || workspace.created_by!==user.id) throw new StudioError("Share only from your personal studio to its Team Workspace.","FORBIDDEN",403);
  const {data:versions,error:versionError}=await client.from("studio_versions").select("*").eq("workspace_id",input.workspaceId).eq("project_id",input.projectId).in("id",input.versionIds);
  if(versionError) throw databaseError(versionError);
  if(!versions || versions.length!==input.versionIds.length || versions.some(v=>!v.file_id || v.created_by!==user.id)) throw new StudioError("Save every selected image before sharing.","VALIDATION");
  const mutation=async(operation:string,part:string,value:any)=>{
   const {data,error}=await client.rpc("studio_mutate",{p_workspace:input.teamId,p_operation:operation,p_request:shareRequestId(input.requestId,part),p_input:value});
   if(error) throw databaseError(error);return data;
  };
  // The same snapshot request always resolves to the same project. Never copy chats,
  // review history, unrelated assets or private workspace identifiers into provenance.
  const project=await mutation("createProject","project",{title:input.title || "Shared golf design",category:"Golf collection",brief:"Design snapshot shared explicitly by its creator.",lead_id:user.id});
  const sharedVersions=new Map<string,string>();
  for(const original of orderSharedVersions(versions,input.versionIds)) {
   const id=original.id;
   const requestId=shareRequestId(input.requestId,`version:${id}`);
   const {data:prior,error:priorError}=await client.from("studio_requests").select("result").eq("workspace_id",input.teamId).eq("actor_id",user.id).eq("operation","createVersion").eq("request_id",requestId).maybeSingle();
   if(priorError) throw databaseError(priorError);
   if(prior) {sharedVersions.set(id,prior.result.id);continue;}
   const file=await copyUploadedFile(client,input.workspaceId,input.teamId,user.id,original.file_id);
   if(!file) throw new StudioError("This image could not be copied to the Team Library.","VALIDATION");
   const pairingTarget=original.provenance?.prompt?.target;
   const parentId=sharedVersions.get(original.parent_id);
   const saved=await mutation("createVersion",`version:${id}`,{project_id:project.id,file_id:file.id,title:original.title,body:"Shared design snapshot. Original stays in its creator’s personal studio.",...(parentId?{parent_id:parentId}:{}),provenance:{source:"shared_snapshot",...(["Matching shell","Realistic sample"].includes(pairingTarget)&&parentId?{prompt:{target:pairingTarget}}:{})}});
   sharedVersions.set(id,saved.id);
  }
  return NextResponse.json({projectId:project.id,workspaceId:input.teamId},{headers:{"Cache-Control":"private, no-store"}});
 } catch(error) {
  const known=error instanceof StudioError?error:new StudioError("Sharing could not finish. Retry to continue your saved snapshot.","INTERNAL",500);
  return NextResponse.json({error:known.message,code:known.code},{status:known.status,headers:{"Cache-Control":"no-store"}});
 }
}
