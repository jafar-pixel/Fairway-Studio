'use client';
import { useCallback, useRef, useState } from 'react';
import { SocialBoard } from '@/components/studio/social';
import { PrivateBusinessBoard } from '@/components/studio/private-business';
import { useCreatorNavigationGuard } from '../creator-navigation';
import { canonicalBusinessDestination, cleanBusinessNavigation, sameBusinessNavigation, type NavigationState } from '@/lib/studio/business/shell';
import { contentUrl, privateBusinessUrl, type WorkflowRoute, type ContentView, type PrivateLocation } from '@/lib/studio/workflows/routes';
export function ConnectedWorkflowBoundary({workspaceId,userId,route,base,demo,onNavigate,onChanged,onBlocked,onNavigationStateChange}:{workspaceId:string;userId:string;route:WorkflowRoute;base:string;demo:boolean;onNavigate:(url:string)=>boolean;onChanged:()=>void;onBlocked:(message:string)=>void;onNavigationStateChange:(state:NavigationState)=>void}) {
 const [state,setState]=useState<NavigationState>(cleanBusinessNavigation);
 const stateRef=useRef(state);
 const report=useCallback((next:NavigationState)=>{stateRef.current=next;setState(old=>sameBusinessNavigation(old,next)?old:next);onNavigationStateChange(next);},[onNavigationStateChange]);
 const privateView=route.kind==='private', label=privateView?'private register':'content';
 const leave=useCreatorNavigationGuard({dirty:state.dirty,busy:state.pending||state.uncertain,onBlocked,onNativeNavigate:onNavigate,
  dirtyMessage:`Leave this unfinished ${label} form? Unsaved inputs will be lost. Saved records remain unchanged. Choose Cancel to keep editing.`,
  busyMessage:state.uncertain?'The last save has an unknown outcome. Retry that exact request before leaving.':'A save is in progress. Wait for confirmation before leaving.'});
 function confirmedDestination(url:string) {
  if(stateRef.current.pending||stateRef.current.uncertain){onBlocked('Resolve the pending or unconfirmed save before leaving.');return false;}
  // Called after a component's local discard gate, or after a confirmed save.
  return leave.confirmed(()=>onNavigate(url));
 }
 const contentRoute=useCallback((view:ContentView,postId:string|null)=>confirmedDestination(contentUrl(base,view,postId)),[base,state.pending,state.uncertain,onNavigate]);
 const privateRoute=useCallback((location:PrivateLocation)=>confirmedDestination(privateBusinessUrl(base,location)),[base,state.pending,state.uncertain,onNavigate]);
 function canonical(kind:'task'|'file'|'project'|'business',id:string) { confirmedDestination(canonicalBusinessDestination(base,kind,id,window.location.origin)); }
 if(demo) return <section className="fs-card"><h1>{privateView?'Restricted Business records':'Content planning'}</h1><p>This feature requires a connected workspace. Demo mode does not save contracts, finances, content or approvals, and no sample records are substituted.</p></section>;
 if(!workspaceId||!userId) return <section className="fs-card"><h1>Choose a connected workspace</h1><p>Sign in with current workspace access to open this area.</p></section>;
 if(route.kind==='private') return <PrivateBusinessBoard key={`${userId}:${workspaceId}`} externalNavigationGuard workspaceId={workspaceId} userId={userId} initialTab={route.tab} initialBookId={route.bookId} initialRecordId={route.recordId} onRouteChange={privateRoute} onOpenPlan={id=>canonical('business',id)} onNavigationStateChange={report}/>;
 if(route.kind==='content') return <SocialBoard key={`${userId}:${workspaceId}`} externalNavigationGuard workspaceId={workspaceId} initialView={route.view} initialPostId={route.postId} onRouteChange={contentRoute} onOpenTask={id=>canonical('task',id)} onOpenProject={id=>canonical('project',id)} onOpenFile={id=>canonical('file',id)} onChanged={onChanged} onNavigationStateChange={report}/>;
 return <section className="fs-card"><h1>Page unavailable</h1><p>Choose an existing Business or Content destination.</p></section>;
}
