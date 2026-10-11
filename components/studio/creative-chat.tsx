"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import useSWR from "swr";
import { X, Sparkles, Plus, Send, ImagePlus } from "lucide-react";
import type { StudioWorkspace } from "@/lib/studio/contracts";
import type { CreativeMode } from "@/lib/studio/creative-chat";
import { useMediaUploads } from "./media-upload";
import "./creative-chat.css";
import { ManualImageEditor } from "./manual-image-editor";

type Chat = { project_id?: string; id: string; title: string; visibility: "private" | "workspace" };
type Turn = {
  id: string;
  author_id: string;
  prompt: string;
  answer: string;
  mode: CreativeMode;
  status: string;
  error?: string;
  job_id?: string;
  created_at: string;
};
type Job = {
  id: string;
  status: string;
  created_by: string;
  project_id: string;
  error?: string;
  outputs: { versionId: string }[];
  retained_version_ids: string[];
};
type Detail = { chat: Chat; turns: Turn[]; jobs: Job[] };
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
  const result = await r.json();
  if (!r.ok) throw Error(result.error || "The request could not finish.");
  return result;
}
export function CreativeChat({
  data,
  demo,
  workspaceId,
  onClose,
  initialQuestion = "",
  currentProjectId,
  initialSourceVersionId = "",
  initialManual = false,
  onSaved,
  embedded = false,
  referenceVersionIds = [],
  outputCount = 1,
  onSourceChange,
}: {
  data: StudioWorkspace;
  demo: boolean;
  workspaceId: string;
  onClose: () => void;
  initialQuestion?: string;
  currentProjectId?: string;
  initialSourceVersionId?: string;
  initialManual?: boolean;
  onSaved: () => void;
  embedded?: boolean;
  referenceVersionIds?: string[];
  outputCount?: 1 | 2;
  onSourceChange?: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    end = useRef<HTMLDivElement>(null);
  const [chatId, setChatId] = useState(""),
    [prompt, setPrompt] = useState(initialQuestion),
    [mode, setMode] = useState<CreativeMode>("image");
  const [visibility, setVisibility] = useState<"private" | "workspace">(
      embedded ? "workspace" : "private",
    ),
    [projectId, setProjectId] = useState(currentProjectId || "");
  const [source, setSource] = useState(initialSourceVersionId),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [consent, setConsent] = useState(false);
  const [localSources, setLocalSources] = useState<
    { id: string; project_id: string; title: string }[]
  >([]);
  const [localProjects, setLocalProjects] = useState<
    { id: string; title: string }[]
  >([]);
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [notice, setNotice] = useState("");
  const [manualEdit, setManualEdit] = useState<{projectId: string; versionId: string} | null>(initialManual && currentProjectId && initialSourceVersionId ? {projectId:currentProjectId,versionId:initialSourceVersionId} : null);
  const saveRequest = useRef<{ key: string; id: string } | null>(null);
  const loadedChat = useRef("");
  const projects = [...data.projects, ...localProjects].filter(
    (p, i, all) => all.findIndex((other) => other.id === p.id) === i,
  );
  async function saveOwnWork(kind: "project" | "idea") {
    setError("");
    setNotice("");
    if (demo) {
      setError("Sign in to save your own ideas and projects.");
      return;
    }
    const title =
      kind === "project" ? projectTitle.trim() : prompt.trim().slice(0, 120);
    if (!title || (kind === "idea" && !prompt.trim())) {
      setError("Add a name or describe your idea first.");
      return;
    }
    setBusy(true);
    try {
      const input =
        kind === "project"
          ? {
              title,
              category: "general",
              brief: prompt.trim(),
              lead_id: data.userId,
            }
          : {
              title,
              body: prompt.trim(),
              category: "General",
              status: "exploring",
            };
      const key = JSON.stringify({ kind, input });
      if (saveRequest.current?.key !== key)
        saveRequest.current = { key, id: crypto.randomUUID() };
      const saved = await json("/api/studio/workspace", {
        workspaceId,
        operation: kind === "project" ? "createProject" : "createIdea",
        requestId: saveRequest.current.id,
        input,
      });
      if (kind === "project") {
        setLocalProjects((previous) =>
          previous.some((p) => p.id === saved.data.id)
            ? previous
            : [...previous, saved.data],
        );
        setProjectId(saved.data.id);
        setSource("");
        setCreatingProject(false);
        setProjectTitle("");
      }
      setNotice(
        kind === "project"
          ? "Your project is ready. Describe a design and click Create image."
          : "Saved to Ideas. Your text is still here to develop with AI.",
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const uploads = useMediaUploads({ workspaceId, userId: data.userId, demo });
  const base = `/api/studio/creative-chat?workspaceId=${workspaceId}${embedded && currentProjectId ? `&projectId=${currentProjectId}` : ""}`;
  // Include the signed-in identity in keys so private data cannot survive an account switch.
  const chats = useSWR<{ chats: Chat[] }>(
    demo ? null : [base, data.userId],
    ([url]: [string, string]) => json(url),
    { refreshInterval: 10000 },
  );
  const detail = useSWR<Detail>(
    !demo && chatId ? [`${base}&chatId=${chatId}`, data.userId] : null,
    ([url]: [string, string]) => json(url),
    { refreshInterval: 4000 },
  );
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    if (!embedded) dialog.current?.showModal();
    return () => previous?.focus();
  }, [embedded]);
  useEffect(() => { if (embedded) setSource(initialSourceVersionId); }, [embedded, initialSourceVersionId]);
  useEffect(() => { if (embedded && initialQuestion) {setPrompt(initialQuestion);setMode("image");} }, [embedded, initialQuestion]);
  useEffect(() => { onSourceChange?.(source); }, [source, onSourceChange]);
  useEffect(() => {
    if (chatId) end.current?.scrollIntoView({ block: "nearest" });
  }, [chatId, detail.data?.turns.length, busy]);
  useEffect(() => {
    if (!chatId || !detail.data || detail.data.chat.id !== chatId || loadedChat.current === chatId) return;
    loadedChat.current = chatId;
    const job = [...detail.data.turns].reverse().map(t => detail.data!.jobs.find(j => j.id === t.job_id)).find(j => j?.retained_version_ids.length);
    if (job) {
      const id = job.retained_version_ids[0]; setProjectId(job.project_id); setSource(id);
      setLocalSources(v => v.some(s => s.id === id) ? v : [...v,{id,project_id:job.project_id,title:"Latest saved design"}]);
    }
  }, [chatId,detail.data]);
  async function createChat() {
    const result = await json("/api/studio/creative-chat", {
      action: "create",
      workspaceId,
      requestId: crypto.randomUUID(),
      title: prompt.trim().slice(0, 80) || "New creative conversation",
      visibility,
      ...(embedded ? {projectId} : {}),
    });
    setChatId(result.chat.id);
    await chats.mutate();
    return result.chat.id as string;
  }
  async function jobAction(action: string, jobId: string) {
    setError("");
    setBusy(true);
    try {
      if (["run", "retry"].includes(action) && !consent)
        throw Error("Acknowledge AI usage before running an image request.");
      await json("/api/studio/generation", { workspaceId, action, jobId });
      if (action === "retry")
        await json("/api/studio/generation", {
          workspaceId,
          action: "run",
          jobId,
        });
      await detail.mutate();
      if (action === "retain") onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function editResult(job: Job, versionId: string, manually = false) {
    setBusy(true); setError("");
    try {
      if (!job.retained_version_ids.includes(versionId)) {
        await json("/api/studio/generation", { workspaceId, action: "retain", jobId: job.id });
        await detail.mutate(); onSaved();
      }
      setProjectId(job.project_id); setSource(versionId); setMode("image"); setPrompt("");
      setLocalSources(v => v.some(s => s.id === versionId) ? v : [...v,{id:versionId,project_id:job.project_id,title:"Selected design"}]);
      setNotice(manually ? "" : "Editing the selected design. Describe what to change below.");
      if (manually) setManualEdit({projectId:job.project_id,versionId});
      else document.getElementById("fc-prompt")?.focus();
    } catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (demo) {
      setError("Sign in to create real conversations and images.");
      return;
    }
    setBusy(true);
    try {
      let destination = projectId;
      if (mode === "image" && !destination) {
        const saved = await json("/api/studio/workspace", {workspaceId,operation:"createProject",requestId:crypto.randomUUID(),input:{title:prompt.trim().slice(0,80) || "New design",category:"general",brief:prompt.trim(),lead_id:data.userId}});
        destination = saved.data.id; setProjectId(destination); setLocalProjects(v=>[...v,saved.data]); onSaved();
      }
      const attachedSource = uploads.hasUnfinished && mode !== "comment"
        ? await uploadSource(destination)
        : source;
      const selected = chatId || (await createChat());
      const result = await json("/api/studio/creative-chat", {
        workspaceId,
        chatId: selected,
        action: "send",
        requestId: crypto.randomUUID(),
        prompt,
        mode,
        projectId: destination || null,
        sourceVersionId: mode !== "comment" ? attachedSource || null : null,
        consent,
        referenceVersionIds,
        count: outputCount,
        kitVersionId: data.workspace?.active_kit_id || null,
      });
      setPrompt("");
      await detail.mutate();
      if (result.turn.job_id) {
        // The durable job is saved before it runs, so closing this panel does not lose it.
        const completed = await json("/api/studio/generation", {
          workspaceId,
          action: "run",
          jobId: result.turn.job_id,
        });
        if (completed.job?.status === "succeeded") {
          await json("/api/studio/generation", {workspaceId,action:"retain",jobId:completed.job.id});
          const id = completed.job.outputs[0]?.versionId;
          if (id) { setSource(id); setLocalSources(v=>v.some(s=>s.id===id)?v:[...v,{id,project_id:destination,title:"Latest saved design"}]); }
          setNotice("Design saved. Describe another change to keep editing, or choose Start a new image."); onSaved();
        }
        await detail.mutate();
      }
    } catch (e) {
      setError((e as Error).message);
      await detail.mutate();
    } finally {
      setBusy(false);
    }
  }
  async function uploadSource(destination = projectId) {
    let attachedSource = source;
    if (!destination)
      throw Error("Select a project before attaching an image.");
    const result = await uploads.uploadAll({
      onRegistered: async (file, item) => {
        const saved = await json("/api/studio/workspace", {
          workspaceId,
          operation: "createVersion",
          requestId: item.id,
          input: {
            project_id: destination,
            file_id: file.id,
            title: item.file.name,
            body: "Uploaded from Creative Assistant.",
          },
        });
        const version = saved.data;
        setLocalSources((previous) =>
          previous.some((v) => v.id === version.id)
            ? previous
            : [...previous, version],
        );
        attachedSource = version.id;
        setSource(version.id);
      },
    });
    if (!result.complete)
      throw Error(
        result.failures[0]?.message ||
          "Upload unfinished. Retry to continue.",
      );
    onSaved();
    setNotice("Image attached. Your next request will use it as the source.");
    return attachedSource;
  }
  async function attach() {
    setBusy(true);
    setError("");
    try {
      await uploadSource();
      setMode("image");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const sources = [
    ...data.versions.filter((v) => v.file_id),
    ...localSources,
  ].filter(
    (v, i, a) =>
      v.project_id === projectId &&
      a.findIndex((other) => other.id === v.id) === i,
  );
  const selectedChat =
    detail.data?.chat || chats.data?.chats.find((c) => c.id === chatId);
  const Root = embedded ? "section" : "dialog";
  return (
    <Root
      ref={dialog as any}
      className={`fc-dialog ${embedded ? "fc-embedded" : ""}`}
      aria-labelledby="fc-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy && !uploads.hasUnfinished) onClose();
      }}
    >
      <header className="fc-header">
        <div>
          <span className="fc-eyebrow">FAIRWAY STUDIO / CREATE TOGETHER</span>
          <h2 id="fc-title">
            <Sparkles size={22} />
            {embedded ? "AI Design Studio" : "Creative Assistant"}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={busy || uploads.hasUnfinished}
          aria-label="Close Creative Assistant"
        >
          <X size={22} />
        </button>
      </header>
      <div className="fc-layout">
        <aside className="fc-sidebar" aria-label="Conversations">
          <button
            className="fc-new"
            disabled={busy}
            onClick={() => {
              setChatId("");
              setPrompt("");
              setSource("");
              setError("");
            }}
          >
            <Plus size={17} />
            New conversation
          </button>
          <p>Pick up where your team left off.</p>
          {chats.isLoading && <p role="status">Loading conversations…</p>}
          {chats.error && <p role="alert">{chats.error.message}</p>}
          {chats.data?.chats.map((c) => (
            <button
              className={`fc-chat-link ${c.id === chatId ? "fc-selected" : ""}`}
              key={c.id}
              disabled={busy}
              onClick={() => {
                setChatId(c.id);
                setPrompt("");
                setSource("");
                setError("");
              }}
            >
              <strong>{c.title}</strong>
              <small>
                {c.visibility === "private"
                  ? "Private conversation"
                  : "Shared with workspace"}
              </small>
            </button>
          ))}
        </aside>
        <main className="fc-main">
          <div className="fc-context">
            <div>
              <strong>{selectedChat?.title || "What are we creating?"}</strong>
              <p>
                {selectedChat?.visibility === "workspace"
                  ? "Everyone in this workspace can contribute."
                  : chatId
                    ? "Only you can read this conversation."
                    : "Choose who can join before sending."}
              </p>
            </div>
            {!chatId && (
              <label>
                Conversation
                <select
                  value={visibility}
                  disabled={busy}
                  onChange={(e) =>
                    setVisibility(e.target.value as typeof visibility)
                  }
                >
                  <option value="private">Private</option>
                  <option value="workspace">Shared workspace</option>
                </select>
              </label>
            )}
          </div>
          <div
            className="fc-messages"
            aria-label="Conversation messages"
            aria-busy={busy}
          >
            {!chatId && (
              <div className="fc-empty">
                <Sparkles size={32} />
                <h3>What would you like to create?</h3>
                <p>
                  Start with your own idea. Describe a design, logo, product, or
                  collection below. No template or existing artwork is required.
                  Choose Shared workspace to create together.
                </p>
              </div>
            )}
            {detail.isLoading && <p role="status">Loading conversation…</p>}
            {detail.error && <p role="alert">{detail.error.message}</p>}
            {detail.data?.turns.map((turn) => {
              const job = detail.data?.jobs.find((j) => j.id === turn.job_id),
                own = job?.created_by === data.userId;
              return (
                <section key={turn.id} className="fc-turn">
                  <article className="fc-human">
                    <header>
                      <strong>
                        {data.members.find((m) => m.user_id === turn.author_id)
                          ?.display_name ||
                          (turn.author_id === data.userId
                            ? "You"
                            : "Workspace member")}
                      </strong>
                      <small>
                        {new Date(turn.created_at).toLocaleString()}
                      </small>
                    </header>
                    <p>{turn.prompt}</p>
                  </article>
                  {turn.mode !== "comment" && (
                    <article className="fc-assistant">
                      <strong>
                        <Sparkles size={15} />
                        Fairway creative partner
                      </strong>
                      {turn.answer && turn.mode !== "image" && (
                        <p>{turn.answer}</p>
                      )}
                      {turn.mode === "image" && job?.status === "succeeded" && (
                        <p>
                          Your image is ready. Edit it below or compare it in your project.
                        </p>
                      )}
                      {turn.mode === "image" && job?.status === "queued" && (
                        <p>
                          Your request is saved and waiting to run. No image has
                          been created yet.
                        </p>
                      )}
                      {turn.mode === "image" && job?.status === "running" && (
                        <p role="status">Creating your image…</p>
                      )}
                      {turn.status === "pending" && (
                        <p role="status">
                          Working on this request… If it was interrupted, send
                          again after three minutes.
                        </p>
                      )}
                      {turn.status === "failed" && (
                        <p role="alert">{turn.error}</p>
                      )}
                      {job && (
                        <div className="fc-result">
                          <small>Image · {job.status}</small>
                          {job.error && <p role="alert">{job.error}</p>}
                          <div className="fc-images">
                            {job.outputs.map((o, i) => (
                              <figure key={o.versionId}>
                                <img
                                  alt={`Generated concept for: ${turn.prompt}`}
                                  src={`${base}&chatId=${chatId}&jobId=${job.id}&output=${i}`}
                                  loading="lazy"
                                />
                                {(own || job.retained_version_ids.includes(o.versionId)) && (
                                  <div className="fc-image-actions">
                                    <button type="button" disabled={busy} onClick={() => void editResult(job,o.versionId)}>Edit with AI</button>
                                    <button type="button" disabled={busy} onClick={() => void editResult(job,o.versionId,true)}>Edit manually</button>
                                    {!job.retained_version_ids.includes(o.versionId) && <small>Editing saves this source in the shared project.</small>}
                                  </div>
                                )}
                              </figure>
                            ))}
                          </div>
                          {own &&
                            job.status === "succeeded" &&
                            !job.retained_version_ids.length && (
                              <button
                                disabled={busy}
                                onClick={() => void jobAction("retain", job.id)}
                              >
                                Keep as shared project version
                              </button>
                            )}
                          {job.retained_version_ids.length > 0 && (
                            <p>
                              Saved in the project. Open Canvas → Versions to compare.{" "}
                              <a
                                href={`/w/${workspaceId}/projects/${job.project_id}/canvas?canvas=versions`}
                              >
                                Open Canvas
                              </a>{" "}
                              ·{" "}
                              <a
                                href={`/w/${workspaceId}/projects/${job.project_id}/reviews`}
                              >
                                Founder Review
                              </a>
                            </p>
                          )}
                          {own &&
                            ["queued", "running"].includes(job.status) && (
                              <button
                                disabled={busy || !consent}
                                onClick={() => void jobAction("run", job.id)}
                              >
                                Continue image request
                              </button>
                            )}
                          {own && job.status === "failed" && (
                            <button
                              disabled={busy || !consent}
                              onClick={() => void jobAction("retry", job.id)}
                            >
                              Retry image creation
                            </button>
                          )}
                          {own &&
                            ["queued", "running"].includes(job.status) && (
                              <button
                                disabled={busy}
                                onClick={() => void jobAction("cancel", job.id)}
                              >
                                Cancel image request
                              </button>
                            )}
                        </div>
                      )}
                    </article>
                  )}
                </section>
              );
            })}
            {busy && (
              <p role="status" className="fc-working">
                Saving your work / waiting for the creative partner…
              </p>
            )}
            <div ref={end} />
          </div>
          <form className="fc-composer" onSubmit={send}>
            <div className="fc-controls">
              <label>
                Action
                <select
                  aria-label="Action"
                  value={mode}
                  disabled={busy}
                  onChange={(e) => setMode(e.target.value as CreativeMode)}
                >
                  <option value="chat">Talk with AI</option>
                  <option value="image">Create / edit image</option>
                  <option value="comment">Comment only</option>
                </select>
              </label>
              <label>
                Save designs in
                <select
                  value={projectId}
                  disabled={embedded || busy || uploads.hasUnfinished}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    setSource("");
                  }}
                >
                  <option value="">Create a project for this design</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {String(p.title)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="fc-own-actions">
              <button
                type="button"
                disabled={busy || uploads.hasUnfinished}
                onClick={() => setCreatingProject(!creatingProject)}
              >
                <Plus size={16} />
                New project / collection
              </button>
              <button
                type="button"
                disabled={busy || !prompt.trim() || demo}
                onClick={() => void saveOwnWork("idea")}
              >
                Save text as idea
              </button>
            </div>
            {creatingProject && (
              <div className="fc-project-create">
                <label>
                  Project or collection name
                  <input
                    value={projectTitle}
                    maxLength={160}
                    onChange={(e) => setProjectTitle(e.target.value)}
                    placeholder="Give your idea a home"
                    disabled={busy}
                  />
                </label>
                <button
                  type="button"
                  className="fc-primary"
                  disabled={busy || !projectTitle.trim() || demo}
                  onClick={() => void saveOwnWork("project")}
                >
                  Create project
                </button>
              </div>
            )}
            {!projectId && mode === "image" && (
              <small>
                Describe your design below. We’ll create a project for it, or you can choose an existing one.
              </small>
            )}
            {notice && <p role="status">{notice}</p>}
            <label htmlFor="fc-prompt" className="fc-sr-only">
              Your message or design instructions
            </label>
            <textarea
              id="fc-prompt"
              value={prompt}
              maxLength={2000}
              disabled={busy}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                mode === "image"
                  ? "Describe your own design, logo, product, or collection. Include the colors, style, materials, and details you want."
                  : "Tell us what you’re thinking…"
              }
              rows={3}
            />
            {mode !== "comment" && (
              <label className="fc-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />{" "}
                I understand AI requests send the selected context to the
                provider and may incur usage charges.
              </label>
            )}
            {mode !== "comment" && (
              <>
                <label>
                  Source image
                  <select
                    value={source}
                    disabled={busy}
                    onChange={(e) => setSource(e.target.value)}
                  >
                    <option value="">
                      {mode === "image"
                        ? "Create a new image"
                        : "No image attached"}
                    </option>
                    {sources.map((v) => (
                      <option key={v.id} value={v.id}>
                        {String(v.title)}
                      </option>
                    ))}
                  </select>
                </label>
                {source && (
                  <div className="fc-selected-source">
                    <img className="fc-source-preview" alt="Selected source image" src={`/api/studio/media?workspaceId=${workspaceId}&versionId=${source}`} />
                    <strong>Editing this image</strong>
                    <button type="button" disabled={busy} onClick={() => setManualEdit({projectId,versionId:source})}>Edit selected image manually</button>
                    <button type="button" disabled={busy} onClick={() => {setSource("");setNotice("");}}>Start a new image</button>
                  </div>
                )}
                <div className="fc-upload">
                  <label>
                    <ImagePlus size={17} /> Upload image
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={
                        busy || demo || uploads.items.length > 0
                      }
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          if (
                            !["image/png", "image/jpeg", "image/webp"].includes(
                              f.type,
                            ) ||
                            f.size > 10 * 1024 * 1024
                          )
                            setError("Choose a PNG, JPEG or WebP under 10 MB.");
                          else uploads.addFiles([f]);
                        }
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {uploads.items.map((item) => (
                    <span key={item.id}>
                      {item.file.name} · {item.state}
                      {item.error && <span role="alert">{item.error}</span>}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => uploads.remove(item.id)}
                      >
                        Remove selection
                      </button>
                    </span>
                  ))}
                  {uploads.hasUnfinished && (
                    <small role="status">This image is ready to upload. Send your instructions below to upload it and use it as the AI source.</small>
                  )}
                  {uploads.hasUnfinished && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void attach()}
                    >
                      Upload & attach to project
                    </button>
                  )}
                </div>
                <small>
                  Uploads and kept versions are shared in the project Library,
                  even when this conversation is private. Image generation uses
                  your prompt and selected source image.
                </small>
              </>
            )}
            {error && (
              <p className="fc-error" role="alert">
                {error}
              </p>
            )}
            <div className="fc-send">
              <small>
                {mode === "chat"
                  ? "AI receives the latest 20 completed turns, project context and selected image. Founders make decisions."
                  : mode === "comment"
                    ? "Adds your message without an AI response."
                    : "Creates and saves a new design version in your shared project."}
              </small>
              <button
                type="submit"
                className="fc-primary"
                disabled={
                  busy ||
                  (uploads.hasUnfinished && mode === "comment") ||
                  !prompt.trim() ||
                  demo ||
                  (mode !== "comment" && !consent)
                }
              >
                <Send size={16} />
                {mode === "image"
                  ? uploads.hasUnfinished
                    ? "Upload & create image"
                    : source ? "Edit image" : "Create image"
                  : mode === "comment"
                    ? "Post comment"
                    : "Send"}
              </button>
            </div>
            {demo && (
              <p>
                Demo preview — sign in to save conversations and generate
                images.
              </p>
            )}
          </form>
        </main>
      </div>
      {manualEdit && <ManualImageEditor workspaceId={workspaceId} userId={data.userId} projectId={manualEdit.projectId} versionId={manualEdit.versionId} onClose={() => setManualEdit(null)} onSaved={id => {
        setSource(id); setLocalSources(v => [...v,{id,project_id:manualEdit.projectId,title:"Manual design edit"}]);
        setManualEdit(null); setNotice("Manual edit saved. You can continue editing this version with AI."); onSaved();
      }} />}
    </Root>
  );
}
