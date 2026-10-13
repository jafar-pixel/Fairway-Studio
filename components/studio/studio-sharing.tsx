"use client";
import {useRef,useState} from "react";
export function StudioSharing({workspaceId,projectId,versionIds,teamId,demo,title,onShared}:{workspaceId:string;projectId:string;versionIds:string[];teamId:string;demo:boolean;title:string;onShared:(path:string)=>void}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const pending=useRef<{requestId:string;versionIds:string[];title:string}|null>(null);
 async function share() {
  setBusy(true);setError("");
  try {
   pending.current ||= {requestId:crypto.randomUUID(),versionIds:[...new Set(versionIds)],title:title.slice(0,160) || "Shared golf design"};
   const r=await fetch("/api/studio/share",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspaceId,projectId,teamId,...pending.current})});
   const result=await r.json();if(!r.ok)throw Error(result.error || "Unable to share design");
   pending.current=null;onShared(`/w/${result.workspaceId}/projects/${result.projectId}/canvas`);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="fas-sharing"><button className="fs-button" disabled={demo||busy||!teamId} onClick={()=>void share()}>{busy?"Sharing…":error?"Resume sharing":"Share this design with team"}</button><small>Copies the selected design, matching sample and attached samples to Team Workspace. Your private board stays private.</small>{error&&<p role="alert">{error}</p>}</div>;
}
