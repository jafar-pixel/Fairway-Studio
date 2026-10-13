import {NextRequest,NextResponse} from "next/server";
import {authorize,databaseError} from "@/lib/studio/server";
import {StudioError} from "@/lib/studio/contracts";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest) {
 try {
  const workspaceId=request.nextUrl.searchParams.get("workspaceId")||"";
  const {client,user}=await authorize(workspaceId);
  const {data:workspace,error:wError}=await client.from("workspaces").select("studio_kind,parent_workspace_id").eq("id",workspaceId).single();
  if(wError)throw databaseError(wError);
  const catalogId=workspace.studio_kind === "personal" ? workspace.parent_workspace_id : workspaceId;
  if(catalogId!==workspaceId)await authorize(catalogId);
  const {data,error}=await client.from("studio_sample_catalog").select("sample_key,title,category,view,kind,file_id,description,origin").eq("workspace_id",catalogId).order("title").limit(200);
  if(error)throw databaseError(error);
  const samples=(data||[]).map(({sample_key,file_id,...sample})=>({...sample,id:sample_key,image:`/api/studio/media?workspaceId=${catalogId}&id=${file_id}&variant=original`}));
  return NextResponse.json({samples,workspaceId,userId:user.id},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){const known=error instanceof StudioError?error:new StudioError("Golf samples could not be loaded.","INTERNAL",500);return NextResponse.json({error:known.message},{status:known.status,headers:{"Cache-Control":"no-store"}});}
}
