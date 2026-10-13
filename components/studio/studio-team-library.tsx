"use client";
import {useState} from "react";
import useSWR from "swr";
async function read(url:string) {const r=await fetch(url,{cache:"no-store"});const value=await r.json();if(!r.ok)throw Error(value.error || "Team Library unavailable");return value;}
export function StudioTeamLibrary({workspaceId,teamId,projectId,userId,onMutate,onAdded}:{workspaceId:string;teamId:string;projectId:string;userId:string;onMutate:(op:string,input:Record<string,unknown>)=>Promise<any>;onAdded:(id:string,reference:boolean)=>void}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const library=useSWR(teamId?[`/api/studio/team-library?workspaceId=${teamId}`,userId]:null,async([url,actor]:string[])=>{const value=await read(url);if(value.userId!==actor || value.workspaceId!==teamId)throw Error("Your session changed. Reopen Team Library.");return value;});
 async function add(file:any) {
  setBusy(true);setError("");
  try {
   const r=await fetch("/api/studio/library",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspaceId:teamId,input:{action:"copy",kind:"file",asset_id:file.id,destination_workspace_id:workspaceId}})});
   const copy=await r.json();if(!r.ok)throw Error(copy.error || "Sample could not be copied");
   const version=await onMutate("createVersion",{project_id:projectId,file_id:copy.data.id,title:file.title,body:"Sample copied from Team Library.",provenance:{source:"team_library"}});
   onAdded(version.id,(file.tags||[]).some((tag:string)=>["fabric","logo","reference"].includes(tag)));
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section><h3>Team Library</h3><p>Choose a shared sample to copy into your private board.</p>{library.error&&<p role="alert">{library.error.message}</p>}{error&&<p role="alert">{error}</p>}{library.isLoading&&<p>Loading shared samples…</p>}<div className="fas-samples">{(library.data?.files||[]).map((f:any)=><button className="fas-sample" key={f.id} disabled={busy} onClick={()=>void add(f)}><img src={`/api/studio/media?workspaceId=${teamId}&id=${f.id}`} alt={f.title}/><strong>{f.title}</strong><small>Use sample in my board</small></button>)}</div>{library.data&&!library.data.files.length&&<p>No shared image samples yet.</p>}</section>;
}
