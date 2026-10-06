import { StudioError, uuidPattern } from '../contracts';
export const PRIVATE_BUSINESS_SCHEMA = 1;
export const currencies = {USD:2,EUR:2,GBP:2,AUD:2,CAD:2,CHF:2,CNY:2,NZD:2,SEK:2,NOK:2,DKK:2,INR:2,SGD:2,HKD:2,JPY:0,KRW:0,KWD:3,BHD:3,OMR:3} as const;
export type Currency = keyof typeof currencies;
export const recordKinds = ['document','contract','budget','commitment','expense','income'] as const;
export type RecordKind = typeof recordKinds[number];
export type PrivateRecord = {id:string;workspace_id:string;book_id:string;kind:RecordKind;title:string;notes:string;owner_id:string;category:string;counterparty:string;status:string;amount_minor:string|null;currency:Currency|null;effective_date:string|null;due_date:string|null;renewal_date:string|null;notice_date:string|null;budget_id:string|null;commitment_id:string|null;document_version_id:string|null;approved_snapshot_id:string|null;signed_marked_at:string|null;signed_marked_by:string|null;revision:number;created_by:string;created_at:string;updated_at:string};
export type PrivateBook = {id:string;workspace_id:string;title:string;plan_id:string|null;created_by:string;revision:number;created_at:string;updated_at:string;can_manage?:boolean;can_edit?:boolean};
export type Totals = {currency:Currency;planned_minor:string;approved_minor:string;paid_minor:string;income_minor:string;outstanding_minor:string;record_count:number};
export type DocumentVersion = {id:string;document_id:string;ordinal:number;label:string;url:string;created_at:string;created_by:string};
export type Approval = {id:string;record_revision:number;purpose:'manual_budget_plan_only';snapshot:PrivateRecord;rationale:string;approved_by:string;created_at:string};
export type RecordDetail = {record:PrivateRecord;history:{revision:number;snapshot:PrivateRecord;reason:string;actor_id:string;created_at:string}[];historyTotal:number;versions:DocumentVersion[];versionsTotal:number;approvedSnapshot:Approval|null;documentVersion:DocumentVersion|null;page:number;pageSize:number};
export type RegisterPage = {book:PrivateBook;records:PrivateRecord[];total:number;page:number;pageSize:number;totals:Totals[];asOf:string;lastUpdated:string;plan:{id:string;title:string}|null;grants:{user_id:string;permission:'read'|'edit'}[]};
export type BooksPage = {books:PrivateBook[];total:number;page:number;pageSize:number;asOf:string};
export type OptionsPage = {items:{id:string;title:string}[];total:number;page:number;pageSize:number};
export type Operation = 'createBook'|'updateBook'|'saveRecord'|'addDocumentVersion'|'approveBudget'|'setGrant';
export type PrivateMutation = {workspaceId:string;expectedUserId:string;requestId:string;operation:Operation;input:Record<string,unknown>};
const fields:Record<Operation,string[]> = {createBook:['title','plan_id'],updateBook:['book_id','expected_revision','title','plan_id'],saveRecord:['book_id','id','expected_revision','record','reason'],addDocumentVersion:['book_id','id','expected_revision','label','url'],approveBudget:['book_id','id','expected_revision','rationale','purpose'],setGrant:['book_id','expected_revision','user_id','permission']};
const recordFields = ['kind','title','notes','owner_id','category','counterparty','status','amount_minor','currency','effective_date','due_date','renewal_date','notice_date','budget_id','commitment_id','document_version_id'];
function fail(message:string):never {throw new StudioError(message,'VALIDATION',422)}
function object(value:unknown):Record<string,unknown> {if (!value || typeof value!=='object' || Array.isArray(value)) fail('Object required.');return value as Record<string,unknown>}
function id(value:unknown,nullable=false) {if(nullable && (value===null || value===undefined))return;if(typeof value!=='string'||!uuidPattern.test(value))fail('Valid identifier required.')}
function text(value:unknown,max:number,required=false) {if (value===undefined&&!required)return;if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail('Invalid text field.')}
function revision(value:unknown) {if(!Number.isSafeInteger(value)||Number(value)<0)fail('Current revision required.')}
export function validateHttpsReference(value:unknown) {text(value,3000,true);let url:URL;try{url=new URL(value as string)}catch{fail('Valid HTTPS reference required.')};if(url!.protocol!=='https:'||url!.username||url!.password||/\s/.test(value as string)||/[?&#](access_token|token|password|secret|signature|sig|api_key|key|authorization|auth|oauth_token|awsaccesskeyid|resourcekey|rlkey|x-amz-[^=&#]+|x-goog-[^=&#]+)=/i.test(value as string)||/[?&#][^=&#]*%/.test(value as string))fail('HTTPS reference without credentials or signed access tokens required.');}
export function amountToMinor(value:string,currency:Currency):string {const places=currencies[currency];if(places===undefined)fail('Unsupported currency.');const match=/^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value.trim());if(!match|| (match[2]?.length??0)>places)fail(`Use a nonnegative amount with at most ${places} decimal places.`);const minor=BigInt(match[1]+(match[2]??'').padEnd(places,'0'));if(minor>BigInt('9000000000000'))fail('Amount exceeds the supported limit.');return minor.toString();}
export function minorToAmount(value:string,currency:Currency):string {const places=currencies[currency];if(!/^\d+$/.test(value)||places===undefined)return 'Unavailable';if(!places)return value;const digits=value.padStart(places+1,'0');return `${digits.slice(0,-places)}.${digits.slice(-places)}`;}
export function validatePrivateMutation(value:unknown):PrivateMutation {
 const body=object(value);if(Object.keys(body).some(k=>!['workspaceId','expectedUserId','requestId','operation','input'].includes(k)))fail('Unknown request field.');id(body.workspaceId);id(body.expectedUserId);id(body.requestId);
 const op=body.operation as Operation;if(!Object.hasOwn(fields,op))fail('Unknown operation.');const input=object(body.input);if(Object.keys(input).some(k=>!fields[op].includes(k)))fail('Unknown input field.');
 if(op!=='createBook'){id(input.book_id);if(op!=='saveRecord'||input.id){revision(input.expected_revision)}}
 if(['addDocumentVersion','approveBudget'].includes(op))id(input.id);if(op==='saveRecord'&&input.id)id(input.id);
 if(op==='createBook'||op==='updateBook'){text(input.title,160,true);id(input.plan_id,true)}
 if(op==='setGrant'){id(input.user_id);if(!['none','read','edit'].includes(String(input.permission)))fail('Invalid permission.')}
 if(op==='addDocumentVersion'){text(input.label,100,true);validateHttpsReference(input.url)}
 if(op==='approveBudget'){text(input.rationale,2000,true);if(input.purpose!=='manual_budget_plan_only')fail('Plan-only approval is required.')}
 if(op==='saveRecord'){
  const r=object(input.record);if(Object.keys(r).some(k=>!recordFields.includes(k)))fail('Unknown record field.');if(!recordKinds.includes(r.kind as RecordKind))fail('Invalid record kind.');text(r.title,240,true);text(r.notes,10000);text(r.category,120);text(r.counterparty,240);id(r.owner_id,true);
  for(const key of ['budget_id','commitment_id','document_version_id'])id(r[key],true);
  const status=String(r.status??(r.kind==='contract'?'draft':'active'));const statuses=r.kind==='contract'?['draft','under_review','marked_signed','expired','archived']:r.kind==='document'?['active','archived']:['active','void'];if(!statuses.includes(status))fail('Invalid record status.');
  if(r.amount_minor!==null&&r.amount_minor!==undefined){if(typeof r.amount_minor!=='string'||!/^(0|[1-9]\d{0,12})$/.test(r.amount_minor)||BigInt(r.amount_minor)>BigInt('9000000000000'))fail('Exact nonnegative minor units required.');if(!Object.hasOwn(currencies,String(r.currency)))fail('Supported currency required.');}else if(['budget','commitment','expense','income'].includes(String(r.kind)))fail('Amount is required.');
  for(const key of ['effective_date','due_date','renewal_date','notice_date']){const v=r[key];if(v!==undefined&&v!==null){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))fail('Valid date required.');const date=new Date(v+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==v)fail('Valid date required.')}}
  if(input.id)text(input.reason,1000,true);
 }
 if(new TextEncoder().encode(JSON.stringify(body)).byteLength>30000)fail('Request too large.');return body as unknown as PrivateMutation;
}
