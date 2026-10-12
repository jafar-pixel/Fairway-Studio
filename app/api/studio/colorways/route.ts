import {authorize,databaseError} from "@/lib/studio/server";
import {StudioError,uuidPattern} from "@/lib/studio/contracts";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
export async function GET(request:Request){
 try{
  const q=new URL(request.url).searchParams,workspaceId=q.get("workspaceId"),versionId=q.get("versionId");
  if(!workspaceId||!versionId||!uuidPattern.test(workspaceId)||!uuidPattern.test(versionId))throw new StudioError("Choose a saved concept.","VALIDATION");
  const {client}=await authorize(workspaceId);
  const {data:version,error:versionError}=await client.from("studio_versions").select("id").eq("id",versionId).eq("workspace_id",workspaceId).maybeSingle();
  if(versionError)throw databaseError(versionError);if(!version)throw new StudioError("Design unavailable.","NOT_FOUND",404);
  const [{data:colors,error:colorsError},{data:options,error:optionsError}]=await Promise.all([client.from("studio_sample_colors").select("hex,name,sort_order").order("sort_order"),client.from("studio_colorway_options").select("color_hex,scope,generated_version_id").eq("workspace_id",workspaceId).eq("source_version_id",versionId)]);
  if(colorsError||optionsError)throw databaseError((colorsError||optionsError)!);
  return Response.json({colors,options},{headers});
 }catch(error){const e=error instanceof StudioError?error:new StudioError("Stored palette is temporarily unavailable.","PALETTE_UNAVAILABLE",503);return Response.json({error:e.message,code:e.code},{status:e.status,headers});}
}
