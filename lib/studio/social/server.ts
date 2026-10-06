import { authorize, databaseError } from '../server';
import { StudioError, uuidPattern } from '../contracts';
import { SOCIAL_SCHEMA_VERSION, type SocialMutation } from './contracts';
function socialDatabaseError(error:{code?:string;message?:string}) {
 if(['23502','22007','22008','22032','22003','2201B'].includes(error.code??''))return new StudioError('Complete the required fields using valid values.','VALIDATION',422);
 return databaseError(error);
}
async function capability(workspaceId:string) {
 const auth=await authorize(workspaceId);
 const {data,error}=await auth.client.rpc('studio_social_capabilities',{p_workspace:workspaceId});
 if(error)throw socialDatabaseError(error);
 if(data?.schemaVersion!==SOCIAL_SCHEMA_VERSION||data?.manualPackages!==true)throw new StudioError('Social setup is required. Apply the reviewed social schema before saving.','SCHEMA_REQUIRED',503);
 return auth;
}
export async function readSocial(params:URLSearchParams) {
 const workspaceId=params.get('workspaceId')??'';
 const {client}=await capability(workspaceId);
 const snapshot=params.get('package')||params.get('snapshotId');
 if(snapshot){
  if(!uuidPattern.test(snapshot))throw new StudioError('Choose a valid package.','VALIDATION');
  if(params.has('asset')){
   const index=Number(params.get('asset'));
   if(!Number.isSafeInteger(index)||index<0||index>19)throw new StudioError('Choose an available asset.','VALIDATION');
   const {data,error}=await client.rpc('studio_social_asset',{p_workspace:workspaceId,p_snapshot:snapshot,p_index:index});
   if(error)throw socialDatabaseError(error);
   if(typeof data!=='string'||!uuidPattern.test(data))throw new StudioError('The asset response is incomplete.','DATABASE_ERROR',503);
   // Redirect only to the existing authenticated exact-version original route, never a storage URL.
   return {kind:'asset' as const,versionId:data};
  }
  const {data,error}=await client.rpc('studio_social_export',{p_workspace:workspaceId,p_snapshot:snapshot});
  if(error)throw socialDatabaseError(error);
  if(data?.kind!=='manual_publication_package'||data?.schemaVersion!==1)throw new StudioError('The package response is incomplete.','DATABASE_ERROR',503);
  return {kind:'package' as const,data};
 }
 const page=Number(params.get('page')??0),postId=params.get('postId');
 if(!Number.isSafeInteger(page)||page<0||page>100000||(postId&&!uuidPattern.test(postId))||(params.get('q')??'').length>200)throw new StudioError('Invalid social query.','VALIDATION');
 const {data,error}=await client.rpc('studio_social_read',{p_workspace:workspaceId,p_post:postId||null,p_page:page,p_options:params.get('options')==='1',p_query:params.get('q')??''});
 if(error)throw socialDatabaseError(error);
 return {kind:'data' as const,data};
}
export async function mutateSocial(mutation:SocialMutation){
 const {client}=await capability(mutation.workspaceId);
 const {data,error}=await client.rpc('studio_social_mutate',{p_workspace:mutation.workspaceId,p_operation:mutation.operation,p_request:mutation.requestId,p_input:mutation.input});
 if(error)throw socialDatabaseError(error);
 return data;
}
