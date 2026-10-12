"use client";
import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import useSWR from "swr";
import { CanvasBoard } from "./canvas-board";
import { productDocumentFromVersion } from "@/lib/studio/product-design";
import { ProductEditor } from "./product-editor";
import { ManualImageEditor } from "./manual-image-editor";
import { CreativeChat } from "./creative-chat";
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
      <div className="fas-journey">
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
        title: name.trim(),
        category,
        brief: "Original golf collection development for Hunter & Heckard",
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
        Give your artboard a project. Next, choose a shell, upload references,
        or create with AI.
      </p>
      <form onSubmit={start}>
        <label>
          Project or collection name
          <input
            required
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
        <button className={P} disabled={busy || !name.trim()}>
          {busy ? "Opening your artboard…" : "Create project & open artboard"}
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
  const [productEditor, setProductEditor] = useState(initialManual && !!productDocumentFromVersion(versions.find(v=>v.id===initialSourceVersionId)));
  const [manual, setManual] = useState(initialManual),
    [source, setSource] = useState<string>(
      versions.find((v) => v.id === initialSourceVersionId && v.file_id)?.id ||
        versions.find((v) => v.file_id)?.id ||
        "",
    ),
    [panel, setPanel] = useState(initialSourceVersionId ? "ai" : "samples"),
    [category, setCategory] = useState<string>("All"),
    [sampleView, setSampleView] = useState("front"),
    [search, setSearch] = useState(""),
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
  useEffect(() => {
    if (
      initialSourceVersionId &&
      versions.some((v) => v.id === initialSourceVersionId && v.file_id)
    ) {
      setSource(initialSourceVersionId);
      setManual(initialManual);
      setPanel("ai");
    }
    if (initialQuestion) setPrompt(initialQuestion);
  }, [initialSourceVersionId, initialManual, initialQuestion]);
  const uploads = useMediaUploads({ workspaceId, userId, demo });
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
      canvas.width = 800;
      canvas.height = 800;
      canvas.getContext("2d")!.drawImage(image, 0, 0, 800, 800);
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
            source: sample ? "studio_sample" : "reference_upload",
            sample_id: sample?.id,
            kind: sample?.kind || "image",
          },
        });
        if (sample?.kind === "fabric") {
          setReferences((r) => [...new Set([...r, v.id])].slice(-3));
        } else setSource(v.id);
      },
    });
    if (!result.complete)
      throw Error(
        result.failures[0]?.message || "Upload unfinished. Retry to finish.",
      );
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
  function tool(action: string) {
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
    <section className="fas-studio" aria-label="Fashion art studio">
      <div className="fas-studio-bar">
        <div>
          <strong>ART STUDIO</strong>
          <p>Idea → reviewed concept → approved product</p>
        </div>
        <div>
          {[
            "Create",
            "Edit design",
            "Variations",
            "Apply reference",
            "Curate moodboard",
          ].map((a) => (
            <button
              className={a === "Create" ? P : B}
              key={a}
              disabled={
                busy ||
                ((a === "Edit design" ||
                  a === "Variations" ||
                  a === "Apply reference") &&
                  !source)
              }
              onClick={() => tool(a)}
            >
              {a}
            </button>
          ))}
          <button className={P} disabled={busy || reservedByOther} onClick={() => setProductEditor(true)}>Product editor · clothing, bags & logos</button>
          <button
            className={B}
            disabled={!source || reservedByOther || busy}
            onClick={() => productDocumentFromVersion(selected) ? setProductEditor(true) : setManual((v) => !v)}
          >
            {manual ? "Back to artboard" : "Edit manually"}
          </button>
        </div>
      </div>
      <div className="fas-studio-layout">
        <div className="fas-canvas">
          {productEditor ? <ProductEditor workspaceId={workspaceId} userId={userId} projectId={projectId} versions={versions} files={data.files} source={selected} kitVersionId={data.workspace?.active_kit_id || null} demo={demo} locked={!!reservedByOther} onMutate={onMutate} onClose={()=>setProductEditor(false)} onSaved={id=>{setSource(id);void onMutate("refresh", {});}} onAI={(id,p)=>{setSource(id);setPrompt(p);setPanel("ai");}} /> : manual && source ? (
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
          ) : (
            <CanvasBoard
              projectId={projectId}
              demo={demo}
              versions={versions}
              nodes={nodes}
              references={data.references}
              files={data.files}
              onMutate={onMutate}
              onVersionSelect={onSelection}
            />
          )}
        </div>
        <aside className="fas-tools">
          <nav aria-label="Artboard tools">
            {["samples", "ai", "team"].map((p) => (
              <button
                className={panel === p ? P : B}
                aria-pressed={panel === p}
                key={p}
                onClick={() => setPanel(p)}
              >
                {p === "ai"
                  ? "AI design"
                  : p === "team"
                    ? "Team & review"
                    : "Samples & Library"}
              </button>
            ))}
          </nav>
          {notice && (
            <p role="status" className="fas-notice">
              {notice}
            </p>
          )}
          <div className="fas-selection">
            <label>
              Selected design
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="">New design / no selection</option>
                {versions
                  .filter((v) => v.file_id)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.title}
                    </option>
                  ))}
              </select>
            </label>
            {selected && (
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
          <div hidden={panel !== "samples"}>
            <h3>Golf collection samples</h3>
            <p>
              Blank shells for our own collection. Choose front, back or detail
              views, then apply fabrics, colors and approved branding.
            </p>
            <label>
              Find a sample
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Golf polo, quarter-zip, mesh…"
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
              Shell view
              <select
                value={sampleView}
                onChange={(e) => setSampleView(e.target.value)}
              >
                <option value="front">Front</option>
                <option value="back">Back</option>
                <option value="detail">Construction detail</option>
                <option value="all">All views</option>
              </select>
            </label>
            <div className="fas-samples">
              {fashionSamples
                .filter(
                  (s) =>
                    (category === "All" || s.category === category) &&
                    (s.kind === "fabric" ||
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
                      {s.kind === "fabric"
                        ? "Add as AI reference"
                        : "Add shell to board"}
                    </small>
                  </button>
                ))}
            </div>
            <h3>Color samples</h3>
            <div className="fas-colors">
              {fashionColors.map((c) => (
                <button
                  key={c.hex}
                  title={c.name}
                  style={{ background: c.hex }}
                  aria-label={`Use ${c.name}`}
                  disabled={busy}
                  onClick={() => {
                    setPanel("ai");
                    setPrompt(
                      `Change the selected design's fabric to ${c.name} (${c.hex}). Preserve the construction and branding.`,
                    );
                  }}
                />
              ))}
            </div>
            <h3>Your saved designs & references</h3>
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
                    {v.title}
                  </button>
                ))}
            </div>
            <label>
              Upload your own samples
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                disabled={busy || demo}
                onChange={(e) => {
                  if (e.target.files)
                    uploads.addFiles(Array.from(e.target.files));
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
            <h3>Create, edit & generate variations</h3>
            <p>
              AI works with the selected design and the references below.
              Results save as new versions on this artboard.
            </p>
            <label>
              Variations
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value) as 1 | 2)}
              >
                <option value={1}>One design</option>
                <option value={2}>Two variations</option>
              </select>
            </label>
            <fieldset>
              <legend>Visual references · up to three</legend>
              {versions
                .filter((v) => v.file_id && v.id !== source)
                .map((v) => (
                  <label className="fas-reference" key={v.id}>
                    <input
                      type="checkbox"
                      checked={references.includes(v.id)}
                      disabled={
                        !references.includes(v.id) && references.length >= 3
                      }
                      onChange={(e) =>
                        setReferences((r) =>
                          e.target.checked
                            ? [...r, v.id]
                            : r.filter((id) => id !== v.id),
                        )
                      }
                    />
                    {v.title}
                  </label>
                ))}
            </fieldset>
            {reservedByOther ? (
              <p>
                This version is checked out. Select another version or start a
                new design while your teammate edits.
              </p>
            ) : (
              <CreativeChat
                embedded
                data={data}
                demo={demo}
                workspaceId={workspaceId}
                currentProjectId={projectId}
                initialSourceVersionId={source}
                initialQuestion={prompt}
                referenceVersionIds={references.filter((id) => id !== source)}
                outputCount={count}
                onSourceChange={setSource}
                onClose={() => {}}
                onSaved={() => {
                  void onMutate("refresh", {});
                }}
              />
            )}
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
