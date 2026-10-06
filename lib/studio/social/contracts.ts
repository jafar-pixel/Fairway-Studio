import { StudioError, uuidPattern } from '../contracts';
export const SOCIAL_SCHEMA_VERSION = 1;
export const socialOperations = ['saveDraft','submitReview','decideReview','recordPublication','saveFeedback','createFeedbackTask','archiveDraft'] as const;
export type SocialOperation = typeof socialOperations[number];
export type Channel = 'instagram'|'tiktok'|'linkedin'|'youtube'|'pinterest'|'other';
export type AssetClearance = {version_id:string; rights:'owned'|'licensed'|'link_only'; rights_note:string; consent_confirmed:boolean; attribution:string; public_link:string|null};
export type SocialDraft = {id:string; workspace_id:string; title:string; purpose:string; audience:string; channel:Channel; account_label:string; caption:string; format:'post'|'story'|'reel'|'video'; owner_id:string; reply_owner_id:string|null; idea_id:string|null; project_id:string|null; source_version_id:string|null; planned_at:string|null; timezone:string; embargo_until:string|null; release_note:string; assets:AssetClearance[]; state:'idea'|'draft'|'in_review'|'approved'|'posted'|'archived'; revision:number; approved_snapshot_id:string|null; created_at:string; updated_at:string};
export type SocialSnapshot = {id:string; post_id:string; ordinal:number; draft_revision:number; payload:SocialDraft; reviewers:string[]; created_at:string};
export type SocialReview = {id:string; post_id:string; snapshot_id:string; state:'open'|'approved'|'changes_requested'|'withdrawn'; revision:number; decided_at:string|null};
export type SocialDecision = {id:string;snapshot_id:string;reviewer_id:string;disposition:'approve'|'request_changes';note:string;created_at:string};
export type SocialPublication = {id:string;post_id:string;snapshot_id:string;url:string;posted_at:string;recorded_by:string;created_at:string;verification:'manually_recorded'};
export type SocialMetrics = {views?:number|null;likes?:number|null;comments?:number|null;shares?:number|null;saves?:number|null;replies?:number|null;clicks?:number|null};
export type SocialFeedback = {id:string;post_id:string;publication_id:string;observation:string;observed_at:string;source_url:string|null;metrics:SocialMetrics;metrics_captured_at:string|null;owner_id:string;task_id:string|null;revision:number;created_at:string};
export type SocialMember = {id:string;name:string};
export type SocialOptions = {ideas:{id:string;title:string}[];projects:{id:string;title:string}[];versions:{id:string;title:string;project_id:string;file_id:string|null;creative_approved:boolean}[]};
export type SocialList = {schemaVersion:1;posts:SocialDraft[];members:SocialMember[];total:number;page:number;pageSize:number;actorId:string;capabilities:{automaticPosting:false;metricsSync:false;manualPackages:true}};
export type SocialDetail = {schemaVersion:1;post:SocialDraft;snapshots:SocialSnapshot[];reviews:SocialReview[];decisions:SocialDecision[];publications:SocialPublication[];feedback:SocialFeedback[]};
export type SocialMutation = {workspaceId:string;requestId:string;operation:SocialOperation;input:Record<string,unknown>};
export type SocialMutationResult = {postId:string;revision:number;snapshotId?:string;publicationId?:string;feedbackId?:string;taskId?:string};
export type SocialManifest = {kind:'manual_publication_package';schemaVersion:1;approval:{snapshot:string;version:number;approved_at:string};channel:string;account_label:string;format:string;caption:string;planned_at:string|null;timezone:string;embargo_until:string|null;assets:{number:number;rights:string;attribution:string;public_link:string|null;delivery:'download'|'external_link'}[];instructions:string};
const allowed:Record<SocialOperation,string[]> = {
 saveDraft:['post_id','expected_revision','title','purpose','audience','channel','account_label','caption','format','owner_id','reply_owner_id','idea_id','project_id','source_version_id','planned_at','timezone','embargo_until','release_note','assets','stage'],
 submitReview:['post_id','expected_revision','reviewers'],decideReview:['post_id','snapshot_id','expected_review_revision','disposition','note'],
 recordPublication:['post_id','expected_revision','snapshot_id','url','posted_at'],saveFeedback:['post_id','expected_revision','feedback_id','publication_id','observation','observed_at','source_url','metrics','metrics_captured_at','owner_id'],createFeedbackTask:['post_id','expected_revision','feedback_id','title','due_date'],archiveDraft:['post_id','expected_revision']
};
export function validateSocialMutation(raw:unknown):SocialMutation {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new StudioError('A social request is required.','VALIDATION');
 const body=raw as Record<string,unknown>;
 if(Object.keys(body).some(k=>!['workspaceId','requestId','operation','input'].includes(k))||typeof body.workspaceId!=='string'||!uuidPattern.test(body.workspaceId)||typeof body.requestId!=='string'||!uuidPattern.test(body.requestId)||!socialOperations.includes(body.operation as SocialOperation)||!body.input||typeof body.input!=='object'||Array.isArray(body.input))throw new StudioError('Invalid social request.','VALIDATION');
 const operation=body.operation as SocialOperation,input=body.input as Record<string,unknown>;
 if(Object.keys(input).some(k=>!allowed[operation].includes(k)))throw new StudioError('Unsupported social input.','VALIDATION');
 if(operation!=='saveDraft'||input.post_id){if(typeof input.post_id!=='string'||!uuidPattern.test(input.post_id))throw new StudioError('Choose a saved content draft.','VALIDATION'); const rev=operation==='decideReview'?'expected_review_revision':'expected_revision';if(!Number.isSafeInteger(input[rev])||Number(input[rev])<0)throw new StudioError('A current revision is required.','VALIDATION');}
 for(const [key,value] of Object.entries(input)) {
  if(key.endsWith('_id')&&value!==null&&(typeof value!=='string'||!uuidPattern.test(value)))throw new StudioError('Choose a valid linked record.','VALIDATION');
  if(['title','purpose','audience','channel','account_label','caption','format','timezone','release_note','stage','disposition','note','url','observation'].includes(key)&&typeof value!=='string')throw new StudioError('Text fields must contain text.','VALIDATION');
  if(['planned_at','embargo_until','posted_at','observed_at','metrics_captured_at','due_date'].includes(key)&&value!==null&&(typeof value!=='string'||!Number.isFinite(Date.parse(value))))throw new StudioError('Use a valid date and time.','VALIDATION');
 }
 if(operation==='saveDraft') {
  for(const key of ['title','channel','account_label','format','owner_id','timezone','stage'])if(typeof input[key]!=='string'||!(input[key] as string).trim())throw new StudioError('Complete the required draft fields.','VALIDATION');
  if(!Array.isArray(input.assets)||input.assets.length>20)throw new StudioError('Choose up to 20 media versions.','VALIDATION');
 }
 if(operation==='submitReview'&&(!Array.isArray(input.reviewers)||input.reviewers.length<1||input.reviewers.length>30||input.reviewers.some(x=>typeof x!=='string'||!uuidPattern.test(x))))throw new StudioError('Choose current reviewers.','VALIDATION');
 if(JSON.stringify(input).length>45000)throw new StudioError('Social request too large.','VALIDATION');
 return {workspaceId:body.workspaceId,requestId:body.requestId,operation,input};
}
