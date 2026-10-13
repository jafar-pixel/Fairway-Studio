import {NextRequest,NextResponse} from "next/server";
import {authorize,databaseError} from "@/lib/studio/server";
import {StudioError} from "@/lib/studio/contracts";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest) {
 try {
  const id=request.nextUrl.searchParams.get("workspaceId")||"";
  const {client,user}=await authorize(id);
  const {data:workspace,error:wError}=await client.from("workspaces").select("studio_kind").eq("id",id).single();
  if(wError)throw databaseError(wError);
  if(workspace.studio_kind!=="team")throw new StudioError("Select a Team Library.","FORBIDDEN",403);
  const {data,error}=await client.from("workspace_files").select("id,title,url,tags").eq("workspace_id",id).eq("permission_scope","workspace").not("tags","cs","{catalog}").order("created_at",{ascending:false}).limit(100);
  if(error)throw databaseError(error);
  const files=(data||[]).filter(f=>/^supabase-storage:\/\/workspace-media\/.*\.(png|jpe?g|webp)$/i.test(f.url)).map(({id,title,tags})=>({id,title,tags}));
  return NextResponse.json({files,userId:user.id,workspaceId:id},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){const known=error instanceof StudioError?error:new StudioError("Team Library could not be opened.","INTERNAL",500);return NextResponse.json({error:known.message},{status:known.status,headers:{"Cache-Control":"no-store"}});}
}
