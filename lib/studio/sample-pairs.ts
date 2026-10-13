type Version = Record<string, any>;
export const MATCHING_SHELL = "Matching shell";
export const MATCHING_REAL = "Realistic sample";
/** Follow edits without treating unrelated product shells as matching samples. */
export function samplePair(versions: Version[], selectedId: string): {real?:Version;shell?:Version} {
  const selected=versions.find(v=>v.id===selectedId);
  if(!selected) return {};
  const project=versions.filter(v=>v.project_id===selected.project_id);
  const seen=new Set<string>(); let current:Version|undefined=selected;
  while(current && !seen.has(current.id)) {
    seen.add(current.id);
    const target=current.provenance?.prompt?.target;
    if([MATCHING_SHELL,MATCHING_REAL].includes(target)) {
      const original=project.find(v=>v.id===current?.parent_id);
      return target===MATCHING_SHELL ? {real:original,shell:selected} : {real:selected,shell:original};
    }
    const derived=project.find(v=>[MATCHING_SHELL,MATCHING_REAL].includes(v.provenance?.prompt?.target) && v.parent_id===current?.id);
    if(derived) return derived.provenance.prompt.target===MATCHING_SHELL ? {real:selected,shell:derived} : {real:derived,shell:selected};
    current=project.find(v=>v.id===current?.parent_id);
  }
  return {};
}
export function pairedSamplePrompt(kind:"real"|"shell") {
 return kind === "shell" ? "Create a matching blank technical shell from the supplied product image. Preserve this exact product's silhouette, pocket count and layout, straps, panels, seams, stitching and viewpoint. Show the complete product as a clean neutral unbranded 2D shell on a white background; remove logos and decorative prints. Do not substitute a generic product. This is an image-based shell study, not CAD geometry. Output only the shell image." : "Create a photorealistic blank product sample from this exact shell. Preserve its silhouette, pocket count and layout, straps, panels, seams, stitching and viewpoint. Use neutral cream material and realistic studio lighting. No logos, text or invented branding. Output only the realistic product image.";
}
