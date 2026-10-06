"use client";
import { useCallback, useRef, useState } from "react";
import { BusinessBoard, type BusinessNavigationState } from "./index";
import { useCreatorNavigationGuard } from "../creator-navigation";
import { canonicalBusinessDestination, cleanBusinessNavigation, sameBusinessNavigation } from "@/lib/studio/business/shell";
export function BusinessWorkspaceBoundary({ workspaceId, planId, base, demo, onNavigate, onChanged, onBlocked, onNavigationStateChange }: {
 workspaceId: string; planId?: string; base: string; demo: boolean; onNavigate: (url:string)=>boolean;
 onChanged: ()=>void; onBlocked: (message:string)=>void; onNavigationStateChange: (state:BusinessNavigationState)=>void;
}) {
 const [state,setState]=useState<BusinessNavigationState>(cleanBusinessNavigation);
 const stateRef=useRef(state);
 const report = useCallback((next: BusinessNavigationState)=>{
  stateRef.current=next;setState(previous=>sameBusinessNavigation(previous,next)?previous:next);
  onNavigationStateChange(next);
 },[onNavigationStateChange]);
 const leave=useCreatorNavigationGuard({dirty:state.dirty,busy:state.pending||state.uncertain,onBlocked,onNativeNavigate:onNavigate,
  dirtyMessage:"Leave this unfinished Business draft? Unsaved inputs will be lost. Saved plans and snapshots remain unchanged. Choose Cancel to keep editing.",
  busyMessage:state.uncertain?"The last Business save has an unknown outcome. Retry that same request before leaving so a duplicate cannot be created.":"A Business save is in progress. Wait for confirmation before leaving."});
 function confirmedDestination(kind:"task"|"file"|"project", id:string) {
  // The plan's own navigation gate has already confirmed any discarded inputs.
  // Still fail closed if this callback is invoked while a write is outstanding.
  if(stateRef.current.pending||stateRef.current.uncertain){onBlocked("Resolve the pending Business save before leaving.");return;}
  leave.confirmed(()=>onNavigate(canonicalBusinessDestination(base,kind,id,window.location.origin)));
 }
 if(demo) return <section className="fs-card"><h1>Business</h1><p>Business plans require a connected workspace. This demo does not create business records or approvals.</p></section>;
 return <BusinessBoard externalNavigationGuard workspaceId={workspaceId} initialPlanId={planId} onPlanRouteChange={id=>{if(stateRef.current.pending||stateRef.current.uncertain){onBlocked("Resolve the pending Business save before leaving.");return false;}return leave.confirmed(()=>onNavigate(id?canonicalBusinessDestination(base,"business",id,window.location.origin):`${base}/business`));}} onOpenTask={id=>confirmedDestination("task",id)} onOpenFile={id=>confirmedDestination("file",id)} onOpenProject={id=>confirmedDestination("project",id)} onChanged={onChanged} onNavigationStateChange={report} onBackToBoard={planId?()=>leave.confirmed(()=>onNavigate(`${base}/business`)):undefined} />;
}
