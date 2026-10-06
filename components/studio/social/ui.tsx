'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SocialMember, SocialMutation, SocialMutationResult, SocialOperation } from '../../../lib/studio/social/contracts';
import { asSocialError, createSocialRequest, sendSocialRequest, SocialApiError } from '../../../lib/studio/social/client';
import styles from './social.module.css';
export type SocialNavigationState = {dirty:boolean;pending:boolean;uncertain:boolean};
export function useSocialNavigationState(state:SocialNavigationState, onChange?: (state:SocialNavigationState)=>void) {
  const callback=useRef(onChange); useEffect(()=>{callback.current=onChange;},[onChange]);
  useEffect(()=>{onChange?.({...state});},[onChange,state.dirty,state.pending,state.uncertain]);
  useEffect(()=>()=>callback.current?.({dirty:false,pending:false,uncertain:false}),[]);
}
export function useLeaveWarning(active:boolean) { useEffect(()=>{if(!active)return; const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';}; window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[active]); }
export function mayLeave(dirty:boolean,blocked:boolean) { return !blocked && (!dirty || window.confirm('Discard your unsaved changes?')); }
export const label=(value:string)=>value.replaceAll('_',' ').replace(/^\w/,s=>s.toUpperCase());
export const stateLabel=(value:string)=>({approved:'Approved for publication',posted:'Manually posted',in_review:'In review'}[value] || label(value));
export function dateLabel(value:string|null,timezone='UTC') { if(!value)return 'Not planned';try{return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short',timeZone:timezone}).format(new Date(value));}catch{return 'Unknown date';} }
export function memberName(members:SocialMember[],id:string|null) {if(!id)return 'Unassigned'; const member=members.find(m=>m.id===id);return member?.name?.trim() || `${member?'Workspace member':'Former or unavailable member'} · …${id.slice(-8)}`;}
export function Badge({children,tone}:{children:ReactNode;tone?:string}) {return <span className={styles.badge} data-tone={tone}>{children}</span>;}
export function Empty({title,children}:{title:string;children:ReactNode}) {return <div className={styles.empty}><h3>{title}</h3><p className={styles.muted}>{children}</p></div>;}
export function ErrorState({error,retry}:{error:SocialApiError;retry:()=>void}) {return <div className={styles.error} role="alert"><h3>{error.unavailable?'Social is unavailable for this workspace':'Social could not load'}</h3><p>{error.message}</p>{error.unavailable?<p>Sign in with workspace access. If Social has not been set up, its database migration must be applied before writes are available.</p>:null}<button type="button" className={styles.button} onClick={retry}>Try again</button></div>;}
export function MemberSelect({members,value,onChange,heading='Owner',required=false,disabled=false}:{members:SocialMember[];value:string;onChange:(value:string)=>void;heading?:string;required?:boolean;disabled?:boolean}) {return <label className={styles.field}>{heading}<select value={value} required={required} disabled={disabled} onChange={e=>onChange(e.target.value)}><option value="">{required?'Choose a current member':'Unassigned'}</option>{value&&!members.some(m=>m.id===value)?<option value={value}>{memberName(members,value)} (choose a current member)</option>:null}{members.map(m=><option key={m.id} value={m.id}>{memberName(members,m.id)}</option>)}</select></label>;}
type Pending={request:SocialMutation;message:string;callback?:(result:SocialMutationResult)=>void};
export function useSocialMutation(workspaceId:string,onCommitted:()=>void) {
 const [busy,setBusy]=useState(false),[error,setError]=useState<SocialApiError|null>(null),[success,setSuccess]=useState('');
 const pending=useRef<Pending|null>(null),locked=useRef(false),running=useRef(false),mounted=useRef(true),committed=useRef(onCommitted);
 useEffect(()=>{committed.current=onCommitted;},[onCommitted]); useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function execute(item:Pending) {
  if(running.current)return; running.current=true;locked.current=true;pending.current=item;setBusy(true);setError(null);setSuccess('');
  let result:SocialMutationResult;
  try{result=await sendSocialRequest(item.request);}catch(cause){running.current=false; const issue=asSocialError(cause);locked.current=issue.uncertain||issue.conflict||issue.unavailable;if(mounted.current){setError(issue);setBusy(false);}return;}
  running.current=false;locked.current=false;pending.current=null;if(!mounted.current)return;setBusy(false);setError(null);setSuccess(item.message);
  // The write is already confirmed. Never turn a UI refresh failure into a new write.
  try{item.callback?.(result);committed.current();}catch{setSuccess(`${item.message} Refresh to see the latest saved data.`);}
 }
 function mutate(operation:SocialOperation,input:Record<string,unknown>,message:string,callback?:(result:SocialMutationResult)=>void){if(locked.current||running.current)return;try{void execute({request:createSocialRequest(workspaceId,operation,input),message,callback});}catch{setError(new SocialApiError('A secure request ID could not be created. Use a secure connection.','REQUEST_ID'));}}
 function retry(){if(pending.current&&!running.current)void execute(pending.current);}
 function clear(){if(running.current||error?.uncertain)return;pending.current=null;locked.current=false;setError(null);}
 return {mutate,retry,clear,busy,error,success,blocked:busy||Boolean(error?.uncertain||error?.conflict||error?.unavailable),hasRequest:Boolean(pending.current)};
}
export type MutationController=ReturnType<typeof useSocialMutation>;
export function MutationFeedback({mutation,onRefresh}:{mutation:MutationController;onRefresh:()=>void}) {
 if(mutation.busy)return <p className={styles.notice} role="status">Saving. Keep this page open until the result is confirmed.</p>;
 if(mutation.error)return <div className={styles.error} role="alert"><p>{mutation.error.message}</p>{mutation.error.uncertain?<p>Other changes are paused. Retry reuses this exact request, so a delayed save will not create a duplicate.</p>:null}{mutation.error.conflict?<p>A newer revision was saved. Your unsaved form is retained. Refresh, then explicitly reload the editor to use the newer revision.</p>:null}<div className={styles.row}>{mutation.hasRequest&&!mutation.error.conflict?<button className={styles.button} onClick={mutation.retry}>Retry same request</button>:null}{!mutation.error.uncertain?<button className={styles.button} onClick={()=>{mutation.clear();onRefresh();}}>Refresh saved content</button>:null}{!mutation.error.uncertain&&!mutation.error.conflict&&!mutation.error.unavailable?<button className={styles.button} onClick={mutation.clear}>Return to editing</button>:null}</div></div>;
 return mutation.success?<p className={styles.success} role="status">{mutation.success}</p>:null;
}
