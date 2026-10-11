"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useMediaUploads } from "./media-upload";

type Mark = {kind:"logo"; image:HTMLImageElement; x:number; y:number; width:number} | { kind: "line"; points: number[][]; color: string; width: number } | { kind: "text"; x: number; y: number; text: string; color: string; size: number };
export function ManualImageEditor({ workspaceId, userId, projectId, versionId, onClose, onSaved, embedded = false }: {
  workspaceId: string; userId: string; projectId: string; versionId: string;
  embedded?: boolean; onClose: () => void; onSaved: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const original = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [tool, setTool] = useState("draw"), [color, setColor] = useState("#760d24"), [size, setSize] = useState(12), [text, setText] = useState("H&H");
  const [rotation, setRotation] = useState(0), [flip, setFlip] = useState(false), [crop, setCrop] = useState(0), [brightness, setBrightness] = useState(100);
  const [marks, setMarks] = useState<Mark[]>([]);
  const logo = useRef<HTMLImageElement | null>(null);
  const drawing = useRef(false), saveId = useRef(crypto.randomUUID());
  const uploads = useMediaUploads({ workspaceId, userId });
  useEffect(() => {
    if (!embedded) dialog.current?.showModal();
    const image = new Image();
    image.onload = () => { original.current = image; setReady(true); };
    image.onerror = () => setError("This image could not be opened. Close and retry.");
    image.src = `/api/studio/media?workspaceId=${workspaceId}&versionId=${versionId}`;
    return () => { image.onload = null; image.onerror = null; };
  }, [workspaceId, versionId, embedded]);
  useEffect(() => {
    const el = canvas.current, image = original.current;
    if (!el || !image || !ready) return;
    const ctx = el.getContext("2d"); if (!ctx) return;
    const inset = crop / 100, sw = image.naturalWidth * (1 - inset * 2), sh = image.naturalHeight * (1 - inset * 2);
    const turn = rotation % 180 !== 0;
    el.width = Math.round(turn ? sh : sw); el.height = Math.round(turn ? sw : sh);
    ctx.save(); ctx.translate(el.width / 2, el.height / 2); ctx.rotate(rotation * Math.PI / 180); ctx.scale(flip ? -1 : 1, 1);
    ctx.filter = `brightness(${brightness}%)`;
    ctx.drawImage(image, image.naturalWidth * inset, image.naturalHeight * inset, sw, sh, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();
    for (const mark of marks) {
      if (mark.kind === "logo") { const width = mark.width * el.width; ctx.drawImage(mark.image,mark.x * el.width,mark.y * el.height,width,width * mark.image.naturalHeight / mark.image.naturalWidth); continue; }
      ctx.fillStyle = mark.color; ctx.strokeStyle = mark.color;
      if (mark.kind === "text") { ctx.font = `bold ${mark.size}px sans-serif`; ctx.fillText(mark.text, mark.x * el.width, mark.y * el.height); }
      else {
        ctx.lineWidth = mark.width; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath();
        mark.points.forEach(([x,y],i) => i ? ctx.lineTo(x * el.width,y * el.height) : ctx.moveTo(x * el.width,y * el.height)); ctx.stroke();
      }
    }
  }, [ready, rotation, flip, crop, brightness, marks]);
  function point(e: PointerEvent<HTMLCanvasElement>) { const r = e.currentTarget.getBoundingClientRect(); return [(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height]; }
  async function save() {
    setBusy(true); setError("");
    try {
      if (!uploads.items.length) {
        const blob = await new Promise<Blob>((resolve,reject) => canvas.current?.toBlob(b => b ? resolve(b) : reject(Error("Image could not be exported.")), "image/png"));
        uploads.addFiles([new File([blob], "Manually-edited-design.png", {type:"image/png"})]);
      }
      let savedId = "";
      const result = await uploads.uploadAll({ onRegistered: async (file) => {
        const response = await fetch("/api/studio/workspace", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({workspaceId,operation:"createVersion",requestId:saveId.current,input:{project_id:projectId,parent_id:versionId,file_id:file.id,title:"Manual design edit",body:"Edited manually: drawing, text, rotation, crop or brightness.",provenance:{source:"manual_edit",status:"draft"}}}) });
        const saved = await response.json(); if (!response.ok) throw Error(saved.error || "Edited version could not be saved."); savedId = saved.data.id;
      }});
      if (!result.complete) throw Error(result.failures[0]?.message || "Save unfinished. Retry to continue.");
      if (!savedId) throw Error("The saved version could not be confirmed. Retry.");
      onSaved(savedId);
    } catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const Root = embedded ? "section" : "dialog";
  return <Root ref={dialog as any} className={`fc-manual ${embedded ? "fc-manual-embedded" : ""}`} aria-label="Edit image manually" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
    <header><h2>Edit image manually</h2><button type="button" disabled={busy} onClick={onClose}>Close editor</button></header>
    <p>Draw or add text on the image. Save creates a new version and preserves the original.</p>
    <div className="fc-manual-tools">
      <label>Tool<select value={tool} onChange={e=>setTool(e.target.value)} disabled={busy || uploads.items.length > 0}><option value="draw">Draw</option><option value="text">Place text</option><option value="logo">Place logo / image</option></select></label>
      <label>Add logo / image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || uploads.items.length > 0} onChange={e=>{
        const file=e.target.files?.[0];if(!file)return;
        if(file.size>10*1024*1024){setError("Choose a logo image under 10 MB.");return;}
        const url=URL.createObjectURL(file),image=new Image();image.onload=()=>{URL.revokeObjectURL(url);logo.current=image;setTool("logo");setMarks(v=>[...v,{kind:"logo",image,x:0.35,y:0.35,width:0.3}]);};image.onerror=()=>{URL.revokeObjectURL(url);setError("Logo image could not be opened.");};image.src=url;e.target.value="";
      }}/></label>
      <label>Color<input type="color" value={color} onChange={e=>setColor(e.target.value)} disabled={busy || uploads.items.length > 0}/></label>
      <label>Size<input type="range" min="2" max="100" value={size} onChange={e=>setSize(Number(e.target.value))} disabled={busy || uploads.items.length > 0}/></label>
      {tool==="text"&&<label>Text<input value={text} onChange={e=>setText(e.target.value)} maxLength={120} disabled={busy || uploads.items.length > 0}/></label>}
      <button type="button" disabled={busy || uploads.items.length > 0} onClick={()=>setRotation(v=>(v+90)%360)}>Rotate 90°</button>
      <button type="button" disabled={busy || uploads.items.length > 0} onClick={()=>setFlip(v=>!v)}>Flip image</button>
      <label>Crop edges<input type="range" min="0" max="35" value={crop} onChange={e=>setCrop(Number(e.target.value))} disabled={busy || uploads.items.length > 0}/></label>
      <label>Brightness<input type="range" min="50" max="150" value={brightness} onChange={e=>setBrightness(Number(e.target.value))} disabled={busy || uploads.items.length > 0}/></label>
      <button type="button" disabled={busy||!marks.length} onClick={()=>setMarks(v=>v.slice(0,-1))}>Undo mark</button>
      <button type="button" disabled={busy} onClick={()=>{setMarks([]);setCrop(0);setRotation(0);setFlip(false);setBrightness(100);}}>Reset edits</button>
    </div>
    <div className="fc-manual-preview"><canvas ref={canvas} aria-label="Editable design" onPointerDown={e=>{
      if(!ready||busy||uploads.items.length)return;
      const [x,y]=point(e);
      if(tool==="logo"){if(logo.current)setMarks(v=>[...v,{kind:"logo",image:logo.current!,x,y,width:size/100}]);return;}
      if(tool==="text"){setMarks(v=>[...v,{kind:"text",x,y,text,color,size:size*3}]);return;}
      drawing.current=true;e.currentTarget.setPointerCapture(e.pointerId);setMarks(v=>[...v,{kind:"line",points:[[x,y],[x+0.0001,y+0.0001]],color,width:size}]);
    }} onPointerMove={e=>{if(!drawing.current)return;const p=point(e);setMarks(v=>v.map((m,i)=>i===v.length-1&&m.kind==="line"?{...m,points:[...m.points,p]}:m));}} onPointerUp={()=>{drawing.current=false;}} onPointerCancel={()=>{drawing.current=false;}} /></div>
    {!ready&&!error&&<p role="status">Opening image…</p>}
    {error&&<p role="alert">{error}</p>}
    <footer><span>{tool==="text"?"Click the image to place text.":tool==="logo"?"Click to place another logo. Size controls its width.":"Drag on the image to draw."}</span><button type="button" disabled={!ready||busy} onClick={()=>void save()}>{busy?"Saving edited version…":"Save edited version"}</button></footer>
  </Root>;
}
