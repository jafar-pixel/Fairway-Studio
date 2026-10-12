/** Recolor a saved design through durable generation; never overwrite its source. */
export function colorwayPrompt(name:string,hex:string,scope:"body"|"whole"="body") {
 return `Create one realistic colorway variation of the supplied exact product design. Change ${scope==="body"?"the main fabric/body panels only":"all textile or leather panels"} to ${name} (${hex}). ${scope==="body"?"Preserve contrasting trim, straps, pockets and accents unless they belong to the main body treatment.":"Preserve metal hardware and non-fabric details."} Preserve the exact product silhouette, construction, pocket layout, seams, stitching, logo artwork, letterforms, logo placement, camera angle, lighting and scene. Keep the existing branding; do not invent another logo or words. Output the recolored product image, not a color chart or written explanation.`;
}
export async function completeColorway(job:Record<string,any>,request:(body:Record<string,any>)=>Promise<any>,onJob:(job:Record<string,any>)=>void,retry=false):Promise<string>{
 let current=job;
 if(current.status==="failed"&&retry){current=(await request({action:"retry",jobId:current.id})).job;onJob(current);}
 if(current.status==="queued"||current.status==="running"){current=(await request({action:"run",jobId:current.id})).job;onJob(current);}
 if(current.status!=="succeeded")throw Error(current.error||"Your colorway is still processing. Resume this request to check it.");
 const retained=await request({action:"retain",jobId:current.id});
 const id=retained.versionIds?.[0];if(!id)throw Error("The saved colorway could not be confirmed. Resume to finish saving it.");
 onJob({...current,retained_version_ids:retained.versionIds});return id;
}

export function colorwaySource(versions:Record<string,any>[],id:string):string {
 const seen=new Set<string>();let current=versions.find(v=>v.id===id);while(current?.parent_id && current.provenance?.prompt?.colorway && !seen.has(current.id)){seen.add(current.id);const parentId=current.parent_id,projectId=current.project_id;const parent=versions.find(v=>v.id===parentId&&v.project_id===projectId);if(!parent)break;current=parent;}return current?.id||id;
}
