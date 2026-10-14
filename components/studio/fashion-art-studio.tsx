"use client";
import {
  useCallback,
  useEffect,
  useState,
  useRef,
  type ReactNode,
  type FormEvent,
} from "react";
import useSWR from "swr";
import { CanvasBoard } from "./canvas-board";
import { productDocumentFromVersion } from "@/lib/studio/product-design";
import { colorwayPrompt, completeColorway, colorwaySource } from "@/lib/studio/colorways";
import { ProductEditor } from "./product-editor";
import { ManualImageEditor } from "./manual-image-editor";
import { samplePair, pairedSamplePrompt, MATCHING_REAL, MATCHING_SHELL } from "@/lib/studio/sample-pairs";
import { StudioTeamLibrary } from "./studio-team-library";
import { StudioSharing } from "./studio-sharing";
import { CreativeChat } from "./creative-chat";
import { useCreatorNavigationGuard } from "./creator-navigation";
import { useMediaUploads } from "./media-upload";
import {
  fashionSamples,
  fashionColors,
  garmentCategories,
  founderProjects,
  isVerificationProject,
  type FashionSample,
} from "@/lib/studio/fashion-samples";
import "./fashion-art-studio.css";
type Row = Record<string, any>;
type Props = {
  data: any;
  workspaceId: string;
  userId: string;
  demo?: boolean;
  onMutate: (op: string, input: Row) => Promise<any>;
  onNavigate: (url: string) => void;
};
const B = "fas-button",
  P = "fas-button fas-primary";
async function json(url: string, body?: unknown) {
  const r = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const b = await r.json();
  if (!r.ok) throw Error(b.error || "This action could not finish.");
  return b;
}
export function FashionHome({ data, userId, workspaceId, onNavigate }: Props) {
  const mine = founderProjects(data.projects || [], userId),
    base = `/w/${workspaceId}`;
  const name =
    data.members.find((m: Row) => m.user_id === userId)?.display_name || "Your";
  const reviews = (data.rounds || []).filter(
    (r: Row) =>
      (r.state || r.status) === "open" &&
      (r.reviewers || r.reviewer_ids || []).includes(userId),
  );
  const others = (data.projects || []).filter(
    (p: Row) =>
      !isVerificationProject(p) &&
      p.status !== "archived" &&
      !mine.some((m) => m.id === p.id) &&
      !p.is_tutorial &&
      !p.is_sample &&
      !p.contains_tutorial_content,
  );
  return (
    <section className="fas-home">
      <header className="fas-hero">
        <span>YOUR FASHION WORKSPACE</span>
        <h1>{name === "Your" ? "Your studio" : `${name}’s studio`}</h1>
        <p>
          Build a design, develop it with your team, and bring the approved
          product to market.
        </p>
        <button className={P} onClick={() => onNavigate(`${base}/studio`)}>
          Start a design
        </button>
        <button className={B} onClick={() => onNavigate(`${base}/library`)}>
          Browse your Library
        </button>
      </header>
      <div className="fas-journey" hidden={data.workspace?.studio_kind === "personal"}>
        <span>1 · Create on an artboard</span>
        <span>2 · Review ideas together</span>
        <span>3 · Develop approved concepts</span>
        <span>4 · Plan production</span>
      </div>
      <h2>Continue your projects</h2>
      <div className="fas-projects">
        {mine.map((p: Row) => (
          <ProjectCard
            key={p.id}
            project={p}
            data={data}
            onOpen={() => onNavigate(`${base}/projects/${p.id}/canvas`)}
          />
        ))}
        {!mine.length && (
          <div className="fas-empty">
            <h3>Your first artboard starts here</h3>
            <p>
              Choose a garment shell, upload a reference, or create your own
              design. Every design has a project and a saved place to return to.
            </p>
            <button className={P} onClick={() => onNavigate(`${base}/studio`)}>
              Start a design
            </button>
          </div>
        )}
      </div>
      {data.workspace?.studio_kind !== "personal" && <>
      <h2>Waiting for your review</h2>
      {reviews.length ? (
        reviews.map((r: Row) => (
          <button
            className={B}
            key={r.id}
            onClick={() =>
              onNavigate(`${base}/projects/${r.project_id}/canvas`)
            }
          >
            {data.projects.find((p: Row) => p.id === r.project_id)?.title ||
              "Design review"}{" "}
            · Open artboard
          </button>
        ))
      ) : (
        <p>No design reviews assigned to you.</p>
      )}
      <h2>Team projects</h2>
      <div className="fas-projects">
        {others.map((p: Row) => (
          <ProjectCard
            key={p.id}
            project={p}
            data={data}
            onOpen={() => onNavigate(`${base}/projects/${p.id}/canvas`)}
          />
        ))}
        {!others.length && (
          <p>Shared team projects appear here as your team creates them.</p>
        )}
      </div>
      </>}
    </section>
  );
}
function ProjectCard({
  project: p,
  data,
  onOpen,
}: {
  project: Row;
  data: any;
  onOpen: () => void;
}) {
  const v = data.versions.find(
    (v: Row) => v.project_id === p.id && v.image_url,
  );
  return (
    <button className="fas-project-card" onClick={onOpen}>
      {v ? (
        <img src={v.image_url} alt="" />
      ) : (
        <div className="fas-project-placeholder">ARTBOARD</div>
      )}
      <strong>{p.title}</strong>
      <span>{p.category || "Fashion design"} · Open artboard</span>
    </button>
  );
}
export function FashionStart(props: Props) {
  const { data, userId, workspaceId, onMutate, onNavigate } = props;
  const [name, setName] = useState(""),
    [category, setCategory] = useState<string>("Polos"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function start(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const p = await onMutate("createProject", {
        title: name.trim() || "New design",
        category,
        brief: "Original sports apparel and accessories development for Hunter & Heckard",
        lead_id: userId,
      });
      onNavigate(`/w/${workspaceId}/projects/${p.id}/canvas`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="fas-start">
      <h1>Start a design</h1>
      <p>
        Name your design, then create directly with the AI assistant. Templates and references are optional.
      </p>
      <form onSubmit={start}>
        <label>
          Project or collection name
          <input
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your own collection or design"
          />
        </label>
        <label>
          Design category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {garmentCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
            <option>Mixed collection</option>
            <option>Brand exploration</option>
          </select>
        </label>
        <button className={P} disabled={busy}>
          {busy ? "Opening your studio…" : "Start designing"}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
      <h2>Or continue an existing project</h2>
      <div className="fas-projects">
        {(data.projects || [])
          .filter(
            (p: Row) => !isVerificationProject(p) && p.status !== "archived",
          )
          .map((p: Row) => (
            <ProjectCard
              key={p.id}
              project={p}
              data={data}
              onOpen={() =>
                onNavigate(`/w/${workspaceId}/projects/${p.id}/canvas`)
              }
            />
          ))}
      </div>
    </section>
  );
}
export function FashionArtStudio({
  projectId,
  versions,
  nodes,
  initialSourceVersionId = "",
  initialManual = false,
  initialQuestion = "",
  ...props
}: Props & {
  projectId: string;
  versions: Row[];
  nodes: Row[];
  initialSourceVersionId?: string;
  initialManual?: boolean;
  initialQuestion?: string;
}) {
  const {
    data,
    workspaceId,
    userId,
    demo = false,
    onMutate,
    onNavigate,
  } = props;
  const colorRequest = useRef<{key:string;input:Row;job?:Row}|null>(null);
  const [colorJob,setColorJob] = useState<Row|null>(null), [colorScope,setColorScope] = useState<"body"|"whole">("body");
  const [toolsOpen, setToolsOpen] = useState(false), [focusDesign, setFocusDesign] = useState(true);
  const [canvasExpanded,setCanvasExpanded] = useState(false);
  useEffect(()=>{
    if(!canvasExpanded) return;
    const previous=document.body.style.overflow;document.body.style.overflow="hidden";
    const escape=(event:KeyboardEvent)=>{if(event.key === "Escape")setCanvasExpanded(false);};
    document.addEventListener("keydown",escape);
    return ()=>{document.body.style.overflow=previous;document.removeEventListener("keydown",escape);};
  },[canvasExpanded]);
  const [productEditor, setProductEditor] = useState(initialManual && !!productDocumentFromVersion(versions.find(v=>v.id===initialSourceVersionId)));
  const [manual, setManual] = useState(initialManual),
    [source, setSource] = useState<string>(
      versions.find((v) => v.id === initialSourceVersionId && (v.file_id || v.image_url || v.provenance?.import_asset_path))?.id ||
        versions.find((v) => v.file_id || v.image_url || v.provenance?.import_asset_path)?.id ||
        "",
    ),
    [panel, setPanel] = useState("samples"),
    [category, setCategory] = useState<string>("All"),
    [sampleView, setSampleView] = useState("front"),
    [search, setSearch] = useState(""),
    [uploadKind, setUploadKind] = useState("real"),
    [prompt, setPrompt] = useState(initialQuestion),
    [count, setCount] = useState<1 | 2>(1),
    [references, setReferences] = useState<string[]>([]),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [comment, setComment] = useState(""),
    [reviewers, setReviewers] = useState<string[]>(
      data.members.map((m: Row) => m.user_id),
    ),
    [rationale, setRationale] = useState("");
  useCreatorNavigationGuard({dirty:false,busy,onBlocked:setNotice});
  useEffect(() => {
    if (
      initialSourceVersionId &&
      versions.some((v) => v.id === initialSourceVersionId && (v.file_id || v.image_url || v.provenance?.import_asset_path))
    ) {
      setSource(initialSourceVersionId);
      setManual(initialManual);
      setPanel("ai");
    }
    if (initialQuestion) setPrompt(initialQuestion);
  }, [initialSourceVersionId, initialManual, initialQuestion]);
  const uploads = useMediaUploads({ workspaceId, userId, demo });
  const catalog = useSWR(!demo ? [`/api/studio/samples?workspaceId=${workspaceId}`,userId] : null, async([url,actor]:string[])=>{const value=await json(url);if(value.userId!==actor || value.workspaceId!==workspaceId)throw Error("Your session changed. Reopen Samples & Library.");return value;});
  const availableSamples:FashionSample[]=[...(catalog.data?.samples || []),...fashionSamples];
  const sourceUploads = useMediaUploads({ workspaceId, userId, demo });
  const canonicalCopies=useRef<Record<string,{id?:string;stagedId?:string;title:string}>>({});
  const states = useSWR(
    demo
      ? null
      : `/api/studio/artboard?workspaceId=${workspaceId}&projectId=${projectId}`,
    json,
    { refreshInterval: 4000 },
  );
  const selected = data.versions.find((v: Row) => v.id === source),
    state = states.data?.states.find((s: Row) => s.version_id === source),
    stage = state?.stage || "idea";
  const rounds = data.rounds.filter((r: Row) => r.version_id === source),
    round = rounds.find((r: Row) => (r.state || r.status) === "open"),
    myReview =
      round &&
      data.reviews.find(
        (r: Row) => r.round_id === round.id && r.reviewer_id === userId,
      );
  const decisions = data.decisions.filter(
      (d: Row) =>
        d.version_id === source &&
        d.scope === "concept" &&
        d.outcome === "approved",
    ),
    nextDecision = decisions.find(
      (d: Row) =>
        d.id !== state?.concept_decision_id &&
        d.id !== state?.product_decision_id,
    );
  const thread = data.threads.find(
      (t: Row) => t.project_id === projectId && !t.task_id && !t.idea_id,
    ),
    messages = data.messages.filter((m: Row) => m.thread_id === thread?.id);
  const canApprove = ["owner", "admin"].includes(data.role),
    reservation =
      state?.checked_out_by && new Date(state.checked_out_until) > new Date(),
    reservedByOther = reservation && state.checked_out_by !== userId;
  const originalPaletteSource=colorwaySource(versions,source);
  const paletteSource=versions.find(v=>v.file_id&&v.provenance?.source==="canonical_concept_source"&&v.provenance?.original_version_id===originalPaletteSource)?.id || canonicalCopies.current[originalPaletteSource]?.id || originalPaletteSource;
  const palette=useSWR(source && !demo ? `/api/studio/colorways?workspaceId=${workspaceId}&versionId=${paletteSource}` : null,json);
  const onSelection = useCallback((id: string) => {
    setSource(id);
    setNotice("");
  }, []);
  async function run(fn: () => Promise<unknown>, message = "Saved") {
    setBusy(true);
    setNotice("");
    try {
      await fn();
      setNotice(message);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(action: string, decisionId?: string) {
    await json("/api/studio/artboard", {
      workspaceId,
      versionId: source,
      action,
      decisionId,
    });
    await states.mutate();
    await onMutate("refresh", {});
  }
  async function addSample(sample: FashionSample) {
    await run(async () => {
      const image = new Image();
      image.src = sample.image;
      await image.decode();
      const canvas = document.createElement("canvas");
      const width=image.naturalWidth || 800,height=image.naturalHeight || 800,scale=Math.min(1,1600/Math.max(width,height));
      canvas.width = Math.round(width*scale);
      canvas.height = Math.round(height*scale);
      canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b ? resolve(b) : reject(Error("Sample could not be prepared.")),
          "image/png",
        ),
      );
      const ids = uploads.addFiles([
        new File([blob], `${sample.id}.png`, { type: "image/png" }),
      ]);
      if (!ids?.length) throw Error("Sample could not be staged.");
      uploads.updateMetadata(ids[0], {
        title: sample.title,
        tags: ["sample", sample.category, sample.kind],
        contextNote: sample.description,
      });
      await saveUploads(sample);
    }, "Sample saved in Library and added to your artboard.");
  }
  async function saveUploads(sample?: FashionSample) {
    const result = await uploads.uploadAll({
      onRegistered: async (file, item) => {
        const v = await onMutate("createVersion", {
          project_id: projectId,
          file_id: file.id,
          title: item.metadata.title || item.file.name,
          body: item.metadata.contextNote,
          provenance: {
            source: sample ? sample.kind === "real" ? "sample_catalog" : "studio_sample" : "reference_upload",
            sample_id: sample?.id,
            kind: sample?.kind || item.metadata.tags?.find((tag:string)=>["real","shell","fabric","logo","reference"].includes(tag)) || "image",
          },
        });
        if ((sample?.kind === "fabric" || sample?.kind === "logo") || item.metadata.tags?.some((tag:string)=>["fabric","logo","reference"].includes(tag))) {
          setReferences((r) => [...new Set([...r, v.id])].slice(-3));
        } else setSource(v.id);
      },
    });
    if (!result.complete)
      throw Error(
        result.failures[0]?.message || "Upload unfinished. Retry to finish.",
      );
  }
  async function ensureCanonicalSource(id:string){
    if(Object.values(canonicalCopies.current).some(copy=>copy.id===id))return id;
    const saved=versions.find(v=>v.id===id);if(saved?.file_id)return id;
    const existing=versions.find(v=>v.file_id&&v.provenance?.source==="canonical_concept_source"&&v.provenance?.original_version_id===id);if(existing)return existing.id;
    const copy=canonicalCopies.current[id] ||= {title:saved?.title || "Saved concept source"};if(copy.id)return copy.id;
    if(!copy.stagedId){
      const path=saved?.image_url||saved?.provenance?.import_asset_path;if(!path)throw Error("This concept has no image to edit. Choose a design with a preview or upload its source.");
      const url=new URL(path,window.location.href);if(url.origin!==window.location.origin)throw Error("Upload the original image before editing an external preview.");
      const response=await fetch(url.href);if(!response.ok)throw Error("The saved concept image could not be loaded.");
      const original=await response.blob();if(original.size>10*1024*1024||!original.type.startsWith("image/"))throw Error("The source must be an image under 10 MB.");
      const blobUrl=URL.createObjectURL(original);let png:Blob;
      try{const image=new Image();image.src=blobUrl;await image.decode();const canvas=document.createElement("canvas");canvas.width=image.naturalWidth||800;canvas.height=image.naturalHeight||800;canvas.getContext("2d")!.drawImage(image,0,0);png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("Source could not be prepared.")),"image/png"));}finally{URL.revokeObjectURL(blobUrl);}
      const ids=sourceUploads.addFiles([new File([png],"saved-concept-source.png",{type:"image/png"})]);if(!ids?.[0])throw Error("Source could not be staged.");copy.stagedId=ids[0];sourceUploads.updateMetadata(ids[0],{title:copy.title,tags:["concept_source"],contextNote:"Canonical AI source copied from an existing concept preview; original preserved."});
    }
    const result=await sourceUploads.uploadAll({onRegistered:async file=>{const v=await onMutate("createVersion",{project_id:projectId,parent_id:id,file_id:file.id,title:copy.title,body:"Registered image source for AI edits. Original concept and artwork preserved.",provenance:{source:"canonical_concept_source",original_version_id:id,approval_status:"unapproved"}});copy.id=v.id;}});
    if(!result.complete||!copy.id)throw Error(result.failures[0]?.message||"Source registration unfinished. Retry to finish.");sourceUploads.remove(copy.stagedId!);await onMutate("refresh",{});return copy.id;
  }
  async function colorway(color?:{name:string;hex:string}) {
    if(color){
      if(!source)throw Error("Select a saved design before choosing its color.");
      const sourceId=await ensureCanonicalSource(paletteSource);
      const stored=await json(`/api/studio/colorways?workspaceId=${workspaceId}&versionId=${sourceId}`);
      const cached=stored.options?.find((o:Row)=>o.color_hex===color.hex&&o.scope===colorScope)?.generated_version_id;
      if(cached){await onMutate("refresh",{});setSource(cached);setFocusDesign(true);return;}
      const input={colorway:{name:color.name,hex:color.hex,scope:colorScope},projectId,sourceVersionId:sourceId,kitVersionId:data.workspace?.active_kit_id||null,prompt:colorwayPrompt(color.name,color.hex,colorScope),target:`${color.name} colorway`,palette:`${color.name} ${color.hex}`,preserve:"Exact design, construction and existing logo artwork",count:1,referenceVersionIds:references.filter(id=>id!==paletteSource)};
      colorRequest.current={key:crypto.randomUUID(),input};setColorJob(null);
    }
    const pending=colorRequest.current;if(!pending)throw Error("Select a color for this design first.");
    const request=(body:Row)=>json("/api/studio/generation",{workspaceId,...body});
    if(!pending.job){const result=await request({action:"create",idempotencyKey:pending.key,...pending.input});pending.job=result.job;setColorJob(result.job);}
    const id=await completeColorway(pending.job!,request,job=>{pending.job=job;setColorJob(job);},!color);
    colorRequest.current=null;await onMutate("refresh",{});await palette.mutate();setSource(id);setFocusDesign(true);
  }
  const pair = samplePair(versions, source);
  const sampleRequest = useRef<{key:string;input:Row;job?:Row} | null>(null);
  async function matchingSample(kind: "real" | "shell") {
    if(!sampleRequest.current) {
      const id=await ensureCanonicalSource(source); setSource(id);
      sampleRequest.current={key:crypto.randomUUID(),input:{projectId,sourceVersionId:id,kitVersionId:null,prompt:pairedSamplePrompt(kind),target:kind === "shell" ? MATCHING_SHELL : MATCHING_REAL,palette:"Neutral blank sample",preserve:"Exact silhouette and construction",count:1}};
    }
    const pending=sampleRequest.current;
    const request=(body:Row)=>json("/api/studio/generation",{workspaceId,...body});
    if(!pending.job) pending.job=(await request({action:"create",idempotencyKey:pending.key,...pending.input})).job;
    const id=await completeColorway(pending.job!,request,job=>{pending.job=job;},true);
    sampleRequest.current=null; await onMutate("refresh",{});setSource(id);setFocusDesign(true);
  }
  async function postComment() {
    let t = thread;
    if (!t)
      t = await onMutate("createThread", {
        project_id: projectId,
        title: "Artboard discussion",
      });
    await onMutate("sendMessage", {
      thread_id: t.id,
      body: `${selected ? `[Design: ${selected.title} · ${selected.id}]\n` : ""}${comment.trim()}`,
    });
    setComment("");
  }
  async function tool(action: string) {
    if(source && !selected?.file_id && !["Create","Curate moodboard"].includes(action)){
      let ready="";await run(async()=>{ready=await ensureCanonicalSource(source);setSource(ready);},"Saved source ready for AI editing.");if(!ready)return;
    }
    setToolsOpen(true);
    setPanel("ai");
    if (action === "Create") {
      setSource("");
      setCount(1);
      setPrompt(
        "Create an original Hunter & Heckard golf capsule concept board: coordinate a performance polo, tailored golf shorts, stretch golf pants, quarter-zip layer and cap. Show clear product studies with a cohesive palette. Use blank shells unless approved branding is attached.",
      );
    } else if (action === "Variations") {
      setCount(2);
      setPrompt(
        `Create a distinct variation of the selected ${selected?.title || "design"}. Preserve its identity and explore a different treatment.`,
      );
    } else if (action === "Curate moodboard") {
      setSource("");
      setCount(1);
      setPrompt(
        "Curate a cohesive original golf collection moodboard using the attached sample references: arrange on-course and clubhouse garment directions, golf fabric textures, a complementary color palette, and detail studies. Keep it useful for developing our own Hunter & Heckard collection.",
      );
    } else {
      setCount(1);
      setPrompt(
        action === "Apply reference"
          ? "Apply the selected reference materials and styling to this design. Preserve its silhouette and unrelated details."
          : "Edit the selected design: describe the colors, fabric, shape, print or logo placement to change.",
      );
    }
  }
  return (
    <section className={`fas-studio ${toolsOpen ? "" : "fas-tools-closed"} ${canvasExpanded ? "fas-expanded" : ""}`} aria-label="Fashion art studio">
      <div className="fas-studio-bar">
        <div>
          <strong>ART STUDIO</strong>
          <p>{data.workspace?.studio_kind === "personal" ? "Your private design board · share when ready" : "Team design board · create and review together"}</p>
        </div>
        <div>
          <button className={B} aria-pressed={canvasExpanded} onClick={()=>setCanvasExpanded(v=>!v)}>{canvasExpanded ? "Exit full canvas" : "Full canvas"}</button>
          <button className={B} onClick={()=>{setPanel("versions");setToolsOpen(true);}}>Version history</button>
          <button className={P} aria-expanded={toolsOpen} onClick={()=>setToolsOpen(v=>!v)}>{toolsOpen ? "Close assets & tools" : "Assets & tools"}</button>
        </div>
      </div>
      <div className="fas-studio-layout">
        <div className="fas-canvas">
          {productEditor ? <ProductEditor workspaceId={workspaceId} userId={userId} projectId={projectId} versions={versions} files={data.files} source={selected} kitVersionId={data.workspace?.active_kit_id || null} demo={demo} locked={!!reservedByOther} onMutate={onMutate} onClose={()=>setProductEditor(false)} onSaved={id=>{setSource(id);void onMutate("refresh", {});}} onAI={(id,p)=>{setSource(id);setPrompt(p);setPanel("ai");setToolsOpen(true);}} /> : manual && source ? (
            <ManualImageEditor
              key={source}
              embedded
              workspaceId={workspaceId}
              userId={userId}
              projectId={projectId}
              versionId={source}
              onClose={() => setManual(false)}
              onSaved={(id) => {
                setSource(id);
                setManual(false);
                void onMutate("refresh", {});
                setNotice(
                  "Manual edit saved as a new version. Continue with AI or team review.",
                );
              }}
            />
          ) : <div>
            {focusDesign && <section className="fas-focused-design" aria-label="Current design">
              <header><div><strong>{selected?.title || data.projects.find((p:Row)=>p.id===projectId)?.title || "New design"}</strong><p>{selected ? `Version ${selected.version_number || selected.version || 1} · ${stage === "idea" ? "Design idea" : stage === "concept" ? "Reviewed concept" : "Approved product"}` : "Describe your design in the AI conversation below."}</p></div>{selected && <button className={B} onClick={()=>{setSource("");setPrompt("");}}>Start new design</button>}</header>
              {(selected?.image_url || selected?.provenance?.import_asset_path) ? (pair.real && pair.shell ? <div className="fas-sample-pair">{[["Real sample",pair.real],["Matching shell",pair.shell]].map(([label,v]:any)=><button key={v.id} className={source === v.id ? "is-selected" : ""} aria-pressed={source === v.id} onClick={()=>setSource(v.id)}><strong>{label}</strong><img src={v.image_url || v.provenance?.import_asset_path} alt={`${label}: ${v.title}`}/><span>{source === v.id ? "Editing this design" : "Select to edit"}</span></button>)}</div> : <img src={selected.image_url || selected.provenance.import_asset_path} alt={selected.title || "Selected design"}/>) : <div className="fas-focus-empty"><h2>Start creating</h2><p>Describe what you want in the AI conversation below. Add a reference or template only if you need one.</p></div>}
              {selected && <div className="fas-focused-actions"><button className={P} disabled={busy} onClick={()=>{setPanel("colors");setToolsOpen(true);}}>Change colors</button>{data.workspace?.studio_kind !== "personal" && <button className={B} onClick={()=>{setPanel("team");setToolsOpen(true);}}>Review with the team</button>}</div>}

              {selected && data.workspace?.studio_kind === "personal" && <StudioSharing key={`${workspaceId}:${projectId}`} title={data.projects.find((p:Row)=>p.id === projectId)?.title || selected.title} workspaceId={workspaceId} projectId={projectId} versionIds={[source, pair.real?.id, pair.shell?.id, ...references].filter((id):id is string=>!!id)} teamId={data.workspace.parent_workspace_id} demo={demo} onShared={path=>onNavigate(path)} />}
              {selected && <p>{productDocumentFromVersion(selected) ? "Editable shell: change panel colors, fabrics and artwork in Product editor." : "Saved visual: use AI to change this image. Its panels and logo are not separate editable layers yet."}</p>}
            </section>}
            <div hidden={focusDesign}><CanvasBoard
              projectId={projectId}
              demo={demo}
              versions={versions}
              nodes={nodes}
              references={data.references}
              files={data.files}
              onMutate={onMutate}
              onVersionSelect={onSelection}
            /></div>
          </div>}
          {!productEditor && !manual && <section className="fas-creative-primary" aria-label="Create and refine design">
            <div className="fas-creative-intro"><strong>AI Creative Assistant</strong><p>Create, edit, and refine your design here. Each saved image stays connected to this project.</p></div>
            {references.length > 0 && <div className="fas-attached-references" aria-label="Attached AI references">
              {references.map(id=>{const v=data.versions.find((item:Row)=>item.id===id);return <div className="fas-reference-chip" key={id}>
                <img src={v?.image_url || `/api/studio/media?workspaceId=${workspaceId}&versionId=${id}`} alt={v?.title || "Attached reference"}/>
                <span>{v?.title || "Reference image"}</span>
                <button type="button" className={B} aria-label={`Remove ${v?.title || "reference"} from AI context`} onClick={()=>setReferences(r=>r.filter(ref=>ref!==id))}>Remove</button>
              </div>})}
            </div>}
            {reservedByOther ? <p role="status">A teammate is editing this version. Choose another version from History or start a new design.</p> : <CreativeChat
              embedded studioSimple data={data} demo={demo} workspaceId={workspaceId}
              currentProjectId={projectId} initialSourceVersionId={source} initialQuestion={prompt}
              referenceVersionIds={references.filter(id=>id!==source)} outputCount={count}
              onSourceChange={setSource}
              prepareSource={id=>versions.some(v=>v.id===id) ? ensureCanonicalSource(id) : Promise.resolve(id)}
              onClose={()=>{}} onSaved={()=>{void onMutate("refresh",{});}}
            />}
          </section>}
        </div>
        <aside className="fas-tools" hidden={!toolsOpen} aria-label="Optional design tools"><button className={B} onClick={()=>setToolsOpen(false)}>Close tools</button>
          <nav aria-label="Artboard tools">
            {["samples", "versions", "ai"].map((p) => (
              <button
                className={panel === p ? P : B}
                aria-pressed={panel === p}
                key={p}
                onClick={() => setPanel(p)}
              >
                {p === "ai" ? "Design options" : p === "versions" ? "History" : "Assets & templates"}
              </button>
            ))}
          </nav>
          {notice && (
            <p role="status" className="fas-notice">
              {notice}
            </p>
          )}
          <div className="fas-selection">
            <p><strong>Current source:</strong> {selected?.title || "New design"}</p>
            <button className={B} onClick={()=>setPanel("versions")}>Choose from history</button>
            {selected && data.workspace?.studio_kind !== "personal" && (
              <>
                <span className="fas-stage">
                  {stage === "product"
                    ? "Approved product"
                    : stage === "concept"
                      ? "Reviewed concept"
                      : "Idea"}
                </span>
                <p>
                  {reservation
                    ? `${data.members.find((m: Row) => m.user_id === state.checked_out_by)?.display_name || "A teammate"} is editing this version`
                    : "Available for editing"}
                </p>
                <button
                  className={B}
                  disabled={busy || reservedByOther || demo}
                  onClick={() =>
                    void run(
                      () => action(reservation ? "checkIn" : "checkOut"),
                      reservation
                        ? "Version checked in."
                        : "Version checked out for 30 minutes.",
                    )
                  }
                >
                  {reservation ? "Check in" : "Check out to edit"}
                </button>
              </>
            )}
          </div>
          <div hidden={panel !== "colors"}>
            <h3>Change this design’s colors</h3>
            <h3>AI colorways · selected design</h3><p>Click a color to generate a new version of this exact design. AI usage charges apply. Your original is preserved.</p><label>Change colors on<select value={colorScope} disabled={busy || !!colorRequest.current} onChange={e=>setColorScope(e.target.value as "body"|"whole")}><option value="body">Main body / fabric</option><option value="whole">All fabric / leather panels</option></select></label>
            {!source && <p>Select a saved design to load its database palette.</p>}
            {palette.error && <p role="status">Stored colors could not be loaded. <button className={B} onClick={()=>void palette.mutate()}>Reload palette</button></p>}
            <div className="fas-colors">
              {(palette.data?.colors || []).map((c: {name:string;hex:string}) => (
                <button
                  key={c.hex}
                  title={`${c.name} · ${palette.data?.options?.some((o:Row)=>o.color_hex===c.hex&&o.scope===colorScope&&o.generated_version_id)?"Saved colorway":"Generate colorway"}`}
                  style={{ background: c.hex }}
                  aria-label={`Use ${c.name}`}
                  disabled={busy || !source || reservedByOther || demo || !!colorRequest.current}
                  onClick={() => void run(()=>colorway(c), `${c.name} colorway saved as a new version. Your original stays in Samples & Library.`)}
                />
              ))}
            </div>
            <button className={B} disabled={busy || !source || reservedByOther || demo || !palette.data?.colors?.length} onClick={()=>void run(async()=>{if(colorRequest.current)await colorway();for(const [index,color] of (palette.data?.colors || []).entries()){setNotice(`Preparing ${color.name} · ${index+1}/${palette.data.colors.length}`);await colorway(color);}},"All sample colorways are saved or reused from the database. Original preserved.")}>Generate / reuse all sample colorways</button>
            <p>Generating all colors creates only missing results. Each new AI image may incur a usage charge.</p>
            {colorJob && <p role="status">{colorJob.retained_version_ids?.length ? "Colorway saved" : `Colorway request: ${colorJob.status}`}</p>}
            {colorRequest.current && <button className={P} disabled={busy || reservedByOther} onClick={()=>void run(()=>colorway(),"Colorway saved. Original preserved.")}>Resume / retry colorway</button>}
          </div>
          <div hidden={panel !== "versions"}>
            <h3>Saved design versions</h3><p>{data.workspace?.studio_kind === "personal" ? "Saved versions of your private design." : "A version is a saved design proposal. Reviewed concepts advance only after team approval."}</p><div className="fas-concept-library">{versions.filter(v=>v.file_id || v.image_url || v.provenance?.import_asset_path).map(v=><button className="fas-sample" key={v.id} disabled={busy} onClick={()=>{setSource(v.id);setFocusDesign(true);setManual(false);setProductEditor(false);}}><img src={v.image_url || `/api/studio/media?workspaceId=${workspaceId}&versionId=${v.id}`} alt={v.title || "Saved design"}/><strong>{v.title} · v{v.version_number || v.version || 1}</strong><small>{productDocumentFromVersion(v)?"Editable shell + preview":`${String(v.provenance?.source || "Saved visual").replace(/_/g," ")} · AI editable`}</small></button>)}</div>
              {selected && <div className="fas-focused-actions"><button className={B} disabled={busy || demo || reservedByOther} onClick={()=>void run(()=>matchingSample("shell"),"Matching shell saved beside your real sample.")}>{sampleRequest.current ? "Resume matching sample" : "Create matching shell · AI"}</button><button className={B} disabled={busy || demo || reservedByOther || !!sampleRequest.current} onClick={()=>void run(()=>matchingSample("real"),"Realistic sample saved beside your shell.")}>Create realistic sample · AI</button><small>Generates one saved image; AI usage charges apply.</small></div>}
          </div>
          <div hidden={panel !== "samples"}>
            <h3>Sports apparel templates</h3>
            {catalog.isLoading && <p role="status">Loading shared product samples…</p>}
            {catalog.error && <p role="alert">{catalog.error.message} <button className={B} onClick={()=>void catalog.mutate()}>Retry samples</button></p>}
            {catalog.data?.samples?.length > 0 && <p>{catalog.data.samples.length} design samples, shells & brand assets · shared Team catalog</p>}
            <p>
              Choose a reusable starting point or reference. Golf is the first available template collection; other sports can be added without changing your workflow.
            </p>
            <label>
              Find a sample
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products, fabrics or logos…"
              />
            </label>
            <label>
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {["All", ...garmentCategories, "Fabrics"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Product view
              <select
                value={sampleView}
                onChange={(e) => setSampleView(e.target.value)}
              >
                <option value="front">Front</option>
                <option value="back">Back</option>
                <option value="side">Side</option>
                <option value="detail">Construction detail</option>
                <option value="all">All views</option>
              </select>
            </label>
            <div className="fas-samples">
              {availableSamples
                .filter(
                  (s) =>
                    (category === "All" || s.category === category) &&
                    (s.kind === "fabric" || s.kind === "logo" ||
                      sampleView === "all" ||
                      s.view === sampleView) &&
                    `${s.title} ${s.category}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                )
                .map((s) => (
                  <button
                    className="fas-sample"
                    key={s.id}
                    disabled={busy || demo}
                    onClick={() => void addSample(s)}
                  >
                    <img src={s.image} alt={s.title} />
                    <strong>{s.title}</strong>
                    <small>
                      {s.kind === "fabric" || s.kind === "logo"
                        ? "Add as AI reference"
                        : s.kind === "real" ? "Add editable real sample" : "Add shell to board"}
                    </small>
                  </button>
                ))}
            </div>
            {data.workspace?.studio_kind === "personal" && !demo && <StudioTeamLibrary key={`${workspaceId}:${userId}`} userId={userId} workspaceId={workspaceId} teamId={data.workspace.parent_workspace_id} projectId={projectId} onMutate={onMutate} onAdded={(id,reference)=>{if(!reference)setSource(id);setReferences(r=>[...new Set([...r,id])].slice(-3));}} />}
            <h3>My Library · saved designs & references</h3>
            <p>Add existing Library images without changing their originals.</p>
            <div className="fas-saved">
              {data.versions
                .filter(
                  (v: Row) =>
                    v.file_id && !isVerificationProject({ id: v.project_id }),
                )
                .slice(0, 60)
                .map((v: Row) => (
                  <button
                    className={B}
                    key={v.id}
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const added = await onMutate("createVersion", {
                          project_id: projectId,
                          file_id: v.file_id,
                          title: v.title,
                          body: v.body,
                          provenance: {
                            source: "library",
                            original_version_id: v.id,
                          },
                        });
                        setReferences((r) =>
                          [...new Set([...r, added.id])].slice(-3),
                        );
                      }, "Library image added to the board and AI references.")
                    }
                  >
                    {v.image_url && <img src={v.image_url} alt="" style={{width:90,height:90,objectFit:"contain"}}/>}<span>{v.title}</span>
                  </button>
                ))}
            </div>
            <label>Upload type<select value={uploadKind} disabled={busy || uploads.hasUnfinished} onChange={e=>setUploadKind(e.target.value)}><option value="real">Real product sample</option><option value="shell">Product shell</option><option value="fabric">Fabric</option><option value="logo">Logo · transparent PNG</option><option value="reference">Visual reference / Pinterest image</option></select></label>
            <label>
              Upload your own samples
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                disabled={busy || demo}
                onChange={(e) => {
                  if (e.target.files) {
                    const ids=uploads.addFiles(Array.from(e.target.files));
                    for(const id of ids || []) uploads.updateMetadata(id,{tags:[uploadKind]});
                  }
                  e.target.value = "";
                }}
              />
            </label>
            {uploads.items
              .filter((i) => !i.attached)
              .map((i) => (
                <p key={i.id}>
                  {i.file.name} · {i.state}
                  {i.error ? ` · ${i.error}` : ""}
                </p>
              ))}
            {uploads.hasUnfinished && (
              <button
                className={P}
                disabled={busy}
                onClick={() =>
                  void run(
                    () => saveUploads(),
                    "References saved to Library and artboard.",
                  )
                }
              >
                Save uploads / retry
              </button>
            )}
          </div>
          <div hidden={panel !== "ai"}>
            <h3>Design options</h3>
            <p>Use these only when needed. The AI conversation stays on your canvas.</p>
            <button className={B} disabled={!source || reservedByOther || busy} onClick={() => productDocumentFromVersion(selected) ? setProductEditor(true) : void run(async()=>{const id=await ensureCanonicalSource(source);setSource(id);setManual(true);},"Image source ready for manual editing.")}>Edit selected image manually</button>
            <label>Images per request<select value={count} onChange={e=>setCount(Number(e.target.value) as 1|2)}><option value={1}>One design</option><option value={2}>Two variations</option></select></label>
            <button className={B} onClick={()=>{setFocusDesign(v=>!v);setToolsOpen(false);}}>{focusDesign ? "Open project comparison board" : "Return to design canvas"}</button>
          </div>
          <div hidden={panel !== "team"}>
            <h3>Team discussion</h3>
            <p>
              Comments identify the selected version. Changes and approvals stay
              connected to this project.
            </p>
            <div className="fas-discussion">
              {messages.map((m: Row) => (
                <article key={m.id}>
                  <strong>
                    {data.members.find((p: Row) => p.user_id === m.author_id)
                      ?.display_name || "Teammate"}
                  </strong>
                  <p>{m.body}</p>
                </article>
              ))}
              {!messages.length && (
                <p>Start the conversation about this artboard.</p>
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(postComment, "Comment saved.");
              }}
            >
              <label>
                Your comment
                <textarea
                  required
                  maxLength={3000}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </label>
              <button className={P} disabled={busy || !comment.trim() || demo}>
                Post to artboard
              </button>
            </form>
            {source && (
              <section className="fas-review">
                <h3>
                  {stage === "idea"
                    ? "Review idea → concept"
                    : stage === "concept"
                      ? "Review concept → product"
                      : "Approved product"}
                </h3>
                {stage !== "product" && !round && canApprove && (
                  <>
                    <fieldset>
                      <legend>Choose reviewers</legend>
                      {data.members.map((m: Row) => (
                        <label className="fas-reference" key={m.user_id}>
                          <input
                            type="checkbox"
                            checked={reviewers.includes(m.user_id)}
                            onChange={(e) =>
                              setReviewers((r) =>
                                e.target.checked
                                  ? [...r, m.user_id]
                                  : r.filter((id) => id !== m.user_id),
                              )
                            }
                          />
                          {m.display_name || "Team member"}
                        </label>
                      ))}
                    </fieldset>
                    <button
                      className={P}
                      disabled={busy || !reviewers.length || demo}
                      onClick={() =>
                        void run(
                          () =>
                            onMutate("openReview", {
                              project_id: projectId,
                              version_id: source,
                              scope: "concept",
                              reviewers,
                              policy: "unanimous",
                            }),
                          "Review opened for this exact design version.",
                        )
                      }
                    >
                      Request unanimous review
                    </button>
                  </>
                )}
                {round && (
                  <>
                    <p>Unanimous review of this saved version</p>
                    {(round.reviewers || round.reviewer_ids || []).map(
                      (id: string) => {
                        const vote = data.reviews.find(
                          (v: Row) =>
                            v.round_id === round.id && v.reviewer_id === id,
                        );
                        return (
                          <p key={id}>
                            {data.members.find((m: Row) => m.user_id === id)
                              ?.display_name || "Reviewer"}
                            : {vote?.disposition || "Awaiting response"}
                          </p>
                        );
                      },
                    )}
                    {(round.reviewers || round.reviewer_ids || []).includes(
                      userId,
                    ) && (
                      <>
                        <label>
                          Review note
                          <textarea
                            value={rationale}
                            onChange={(e) => setRationale(e.target.value)}
                            maxLength={2000}
                          />
                        </label>
                        {["approve", "request_changes", "abstain"].map(
                          (disposition) => (
                            <button
                              className={B}
                              key={disposition}
                              disabled={
                                busy ||
                                demo ||
                                (disposition === "request_changes" &&
                                  !rationale.trim())
                              }
                              onClick={() =>
                                void run(
                                  () =>
                                    onMutate("submitReview", {
                                      round_id: round.id,
                                      disposition,
                                      comment: rationale,
                                      expected_revision:
                                        myReview?.revision || 0,
                                    }),
                                  "Vote saved.",
                                )
                              }
                            >
                              {disposition.replaceAll("_", " ")}
                            </button>
                          ),
                        )}
                      </>
                    )}
                    {canApprove && (
                      <>
                        <label>
                          Decision rationale
                          <input
                            value={rationale}
                            onChange={(e) => setRationale(e.target.value)}
                            maxLength={2000}
                          />
                        </label>
                        <button
                          className={P}
                          disabled={busy || !rationale.trim() || demo}
                          onClick={() =>
                            void run(
                              async () => {
                                const d = await onMutate("recordDecision", {
                                  round_id: round.id,
                                  rationale,
                                });
                                await action("advance", d.id);
                              },
                              stage === "idea"
                                ? "Idea approved as a concept."
                                : "Product approved. Production task created in Founders Studio.",
                            )
                          }
                        >
                          Record approval & advance
                        </button>
                      </>
                    )}
                  </>
                )}
                {!round &&
                  nextDecision &&
                  stage !== "product" &&
                  canApprove && (
                    <button
                      className={P}
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => action("advance", nextDecision.id),
                          "Approved stage updated.",
                        )
                      }
                    >
                      Apply recorded approval
                    </button>
                  )}
                {stage === "product" && (
                  <button
                    className={P}
                    onClick={() => onNavigate(`/w/${workspaceId}/business`)}
                  >
                    Open production work in Founders Studio
                  </button>
                )}
              </section>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
export function FoundersStudioHome({ data, workspaceId, onNavigate }: Props) {
  const base = `/w/${workspaceId}`,
    tasks = data.tasks.filter(
      (t: Row) =>
        t.status !== "done" && (t.category === "Business" || t.project_id),
    );
  return (
    <section className="fas-home">
      <header className="fas-hero">
        <span>ONE SHARED BUSINESS</span>
        <h1>Founders Studio</h1>
        <p>
          Turn approved designs into sourced, costed and scheduled products.
        </p>
      </header>
      <div className="fas-business-links">
        {[
          ["Business profile & Brand Kit", "business/profile"],
          ["Plans & production", "business/plans"],
          ["Documents & contracts", "business/documents"],
          ["Budget & finance", "business/finance"],
          ["Founder updates", "business/founder-updates"],
        ].map(([label, url]) => (
          <button
            className={B}
            key={url}
            onClick={() => onNavigate(`${base}/${url}`)}
          >
            {label}
          </button>
        ))}
      </div>
      <h2>Production & business tasks</h2>
      <button className={B} onClick={() => onNavigate(`${base}/tasks`)}>
        Manage tasks, owners & dates
      </button>
      {tasks.map((t: Row) => (
        <article className="fas-task" key={t.id}>
          <button
            className={B}
            onClick={() => onNavigate(`${base}/tasks?item=${t.id}`)}
          >
            {t.title}
          </button>
          <p>{t.details}</p>
          <small>
            {data.members.find((m: Row) => m.user_id === t.assigned_to)
              ?.display_name || "Unassigned"}{" "}
            · {t.due_date || "Set a date"} · {t.status}
          </small>
          {t.project_id && (
            <button
              className={B}
              onClick={() =>
                onNavigate(`${base}/projects/${t.project_id}/canvas`)
              }
            >
              Open source artboard
            </button>
          )}
        </article>
      ))}
      {!tasks.length && (
        <p>
          Approved products create production planning tasks here. Add other
          business work through Manage tasks.
        </p>
      )}
      <TaskCalendar
        tasks={tasks}
        onOpen={(id) => onNavigate(`${base}/tasks?item=${id}`)}
      />
      <h2>Upcoming dates</h2>
      {tasks
        .filter((t: Row) => t.due_date)
        .sort((a: Row, b: Row) => a.due_date.localeCompare(b.due_date))
        .map((t: Row) => (
          <p key={t.id}>
            <strong>{t.due_date}</strong> · {t.title}
          </p>
        ))}
      {!tasks.some((t: Row) => t.due_date) && (
        <p>Assign task dates to populate the shared production calendar.</p>
      )}
    </section>
  );
}

export function FashionLibrary({
  children,
  ...props
}: Props & { children: ReactNode }) {
  const [tab, setTab] = useState("assets");
  const { data, workspaceId, onNavigate } = props;
  return (
    <section>
      <nav aria-label="Library collections">
        <button
          className={tab === "assets" ? P : B}
          onClick={() => setTab("assets")}
        >
          Designs, samples & references
        </button>
        <button
          className={tab === "ideas" ? P : B}
          onClick={() => setTab("ideas")}
        >
          Ideas & moodboards
        </button>
        <button
          className={B}
          onClick={() => onNavigate(`/w/${workspaceId}/studio`)}
        >
          Create on an artboard
        </button>
      </nav>
      {tab === "assets" ? (
        children
      ) : (
        <>
          <h1>Ideas & moodboards</h1>
          <p>
            Develop these saved ideas on their artboards. New design ideas begin
            in Art Studio.
          </p>
          <div className="fas-projects">
            {data.ideas
              .filter((i: Row) => !i.archived_at)
              .map((i: Row) => {
                const project = data.projects.find(
                  (p: Row) => p.idea_id === i.id,
                );
                return (
                  <button
                    className="fas-project-card"
                    key={i.id}
                    onClick={() =>
                      onNavigate(
                        project
                          ? `/w/${workspaceId}/projects/${project.id}/canvas`
                          : `/w/${workspaceId}/ideas/${i.id}/board`,
                      )
                    }
                  >
                    <strong>{i.title}</strong>
                    <span>{i.category} · Open artboard</span>
                  </button>
                );
              })}
          </div>
        </>
      )}
    </section>
  );
}

function TaskCalendar({
  tasks,
  onOpen,
}: {
  tasks: Row[];
  onOpen: (id: string) => void;
}) {
  const [month, setMonth] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );
  const [year, m] = month.split("-").map(Number),
    first = new Date(year, m - 1, 1),
    days = new Date(year, m, 0).getDate();
  function step(n: number) {
    const d = new Date(year, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return (
    <section className="fas-calendar">
      <h2>Shared production calendar</h2>
      <div>
        <button
          className={B}
          onClick={() => step(-1)}
          aria-label="Previous month"
        >
          ←
        </button>
        <strong>
          {first.toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          })}
        </strong>
        <button className={B} onClick={() => step(1)} aria-label="Next month">
          →
        </button>
      </div>
      <div className="fas-calendar-grid">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <strong key={d}>{d}</strong>
        ))}
        {Array.from({ length: first.getDay() }, (_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`;
          return (
            <div key={date}>
              <span>{i + 1}</span>
              {tasks
                .filter((t) => t.due_date === date)
                .map((t) => (
                  <button key={t.id} onClick={() => onOpen(t.id)}>
                    {t.title}
                  </button>
                ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
