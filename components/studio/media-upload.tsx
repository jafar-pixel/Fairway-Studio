"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CheckCircle2, CircleAlert, FileImage, Film, Music2, UploadCloud, X } from "lucide-react";
import { MEDIA_ACCEPT, mediaKind } from "@/lib/studio/media";
import {
  MediaUploadController, mediaBytes, mediaContextNote, validateUploadMetadata,
  type StagedMedia, type UploadBatchOptions, type UploadMetadata,
} from "@/lib/studio/media-upload-controller";
import { registerMediaOriginal, uploadMediaOriginal } from "@/lib/studio/media-upload-transport";
import { MediaPlayer } from "./media-player";
import "./media.css";

export type MediaUploadOptions = { workspaceId: string; userId: string; demo?: boolean };

/** Keep this hook mounted for the lifetime of an Idea draft, including partial-save retries. */
export function useMediaUploads({ workspaceId, userId, demo = false }: MediaUploadOptions) {
  const controller = useMemo(() => new MediaUploadController({
    workspaceId, userId, disabled: demo,
    uploadOriginal: (item, signal, progress) => uploadMediaOriginal(item, userId, signal, progress),
    register: registerMediaOriginal,
  }), [workspaceId, userId, demo]);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const hasUnfinished = snapshot.items.some((item) => !item.registered || item.state === "error" || item.state === "linking");
  useEffect(() => { controller.activate(); return () => controller.dispose(); }, [controller]);
  useEffect(() => {
    if (!hasUnfinished && !snapshot.busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnfinished, snapshot.busy]);
  return {
    ...snapshot, hasUnfinished, workspaceId, userId, demo,
    addFiles: (files: Iterable<File>) => controller.addFiles(files),
    updateMetadata: (id: string, metadata: Partial<UploadMetadata>) => controller.updateMetadata(id, metadata),
    cancel: (id: string) => controller.cancel(id),
    remove: (id: string) => controller.remove(id),
    retry: (id: string, options?: UploadBatchOptions) => controller.retry(id, options),
    uploadAll: controller.uploadAll,
    clearSelectionErrors: () => controller.clearSelectionErrors(),
  };
}
export type MediaUploads = ReturnType<typeof useMediaUploads>;

export function mediaUploadLabel(item: StagedMedia): string {
  if (item.state === "error" && item.registered) return "Original saved · attachment needs retry";
  if (item.state === "error" && item.uploaded) return "Original uploaded · Library save needs retry";
  switch (item.state) {
    case "uploading": return `Uploading original · ${Math.floor(item.progress)}%`;
    case "registering": return "Original uploaded · saving to Library";
    case "saved": return "Original saved to Library";
    case "linking": return "Original saved · attaching to idea";
    case "attached": return "Original saved and attached";
    case "canceled": return "Upload paused";
    case "error": return "Upload needs retry";
    default: return "Ready to upload";
  }
}

function LocalThumbnail({ item }: { item: StagedMedia }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const kind = mediaKind(item.type);
  const Icon = kind === "video" ? Film : kind === "audio" ? Music2 : FileImage;
  useEffect(() => {
    setFailed(false);
    if (!/^image\/(jpeg|png|gif|webp|avif)$/.test(item.type)) { setUrl(null); return; }
    const local = URL.createObjectURL(item.file);
    setUrl(local);
    return () => URL.revokeObjectURL(local);
  }, [item.file, item.type]);
  return <span className="fm-file-icon" aria-hidden="true">
    {url && !failed ? <img src={url} alt="" onError={() => setFailed(true)} /> : <Icon size={23} />}
  </span>;
}

function UploadRow({ item, uploads, disabled, compact }: { item: StagedMedia; uploads: MediaUploads; disabled: boolean; compact: boolean }) {
  const id = useId();
  let validation: string | null = null;
  let characters: number | null = null;
  try { characters = mediaContextNote(item.metadata).length; validateUploadMetadata(item.metadata); }
  catch (error) { validation = error instanceof Error ? error.message : "Check the file details."; }
  const frozen = disabled || uploads.busy || Boolean(item.registered);
  const update = (metadata: Partial<UploadMetadata>) => uploads.updateMetadata(item.id, metadata);
  return <article className="fm-upload-row" aria-labelledby={`${id}-name`}>
    <div className="fm-file-summary">
      <LocalThumbnail item={item} />
      <div className="fm-file-text">
        <strong id={`${id}-name`} title={item.file.name}>{item.file.name}</strong>
        <span>{mediaBytes(item.file.size)} · {mediaKind(item.type)} · {item.type}</span>
      </div>
      {!uploads.busy && <button className="fm-icon-button" type="button" disabled={disabled} onClick={() => uploads.remove(item.id)} aria-label={`Remove ${item.file.name} from this selection`} title={item.registered ? "Remove from this list; saved originals remain in Library" : "Remove from selection"}><X size={18} /></button>}
    </div>
    <div className="fm-upload-state" role="status" aria-live="polite">
      {item.registered ? <CheckCircle2 size={15} aria-hidden="true" /> : item.error ? <CircleAlert size={15} aria-hidden="true" /> : null}
      <span>{mediaUploadLabel(item)}</span>
    </div>
    {item.state === "uploading" && <progress className="fm-progress" aria-label={`Uploading ${item.file.name}`} max={100} value={item.progress} />}
    {(item.error || validation) && <p className="fm-error" role="alert">{validation || item.error}</p>}
    <details className="fm-details">
      <summary>Title, tags, notes and source credit{item.registered ? " (saved)" : " (optional)"}</summary>
      <div className="fm-metadata">
        <label className="fm-field fm-wide">Title<input value={item.metadata.title} maxLength={160} disabled={frozen} onChange={(event) => update({ title: event.target.value })} /></label>
        <label className="fm-field fm-wide">Tags<input defaultValue={item.metadata.tags.join(", ")} disabled={frozen} onChange={(event) => update({ tags: [...new Set(event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))] })} placeholder="Up to 10 tags, separated by commas" /></label>
        <label className="fm-field">Source creator / credit<input value={item.metadata.creatorName} disabled={frozen} onChange={(event) => update({ creatorName: event.target.value })} placeholder="Person or studio to credit" /></label>
        <label className="fm-field">Origin<select value={item.metadata.sourceKind} disabled={frozen} onChange={(event) => update({ sourceKind: event.target.value as UploadMetadata["sourceKind"] })}><option value="manual">Manual</option><option value="ai">AI-assisted</option><option value="reference">Reference</option></select></label>
        <label className="fm-field fm-wide">Source URL<input type="url" inputMode="url" value={item.metadata.sourceUrl} disabled={frozen} onChange={(event) => update({ sourceUrl: event.target.value })} placeholder="https://…" /></label>
        <label className="fm-field fm-wide">Context / notes<textarea rows={2} value={item.metadata.contextNote} disabled={frozen} onChange={(event) => update({ contextNote: event.target.value })} placeholder="What should the team notice?" aria-describedby={`${id}-limit`} /></label>
        <p id={`${id}-limit`} className="fm-help fm-wide">{characters !== null ? `${characters}/500 characters` : "500 characters maximum"} across notes, origin and source credit. Credit does not change who uploaded this file.</p>
      </div>
    </details>
    {!item.registered && item.state === "uploading" && <button className="fm-button" type="button" onClick={() => uploads.cancel(item.id)}>Pause upload</button>}
    {!uploads.busy && (item.state === "error" || item.state === "canceled") && <button className="fm-button" type="button" disabled={disabled || Boolean(validation)} onClick={() => { void uploads.retry(item.id); }}>Retry {item.registered ? "attachment" : item.uploaded ? "Library save" : "upload"}</button>}
    {item.registered && <MediaPlayer workspaceId={uploads.workspaceId} fileId={item.registered.id} title={item.metadata.title || item.file.name} mimeType={item.type} initialJob={item.registered.job} initialWorker={item.registered.worker} userId={uploads.userId} compact={compact} />}
  </article>;
}

/** Staging UI only. The enclosing form owns Save/create/link via uploads.uploadAll(). */
export function MediaUploadQueue({ uploads, disabled = false, compact = false, title = "Images, video and audio", description }: {
  uploads: MediaUploads; disabled?: boolean; compact?: boolean; title?: string; description?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [dragging, setDragging] = useState(false);
  const locked = disabled || uploads.busy || uploads.demo;
  return <section className={`fm-upload${compact ? " fm-compact" : ""}`} aria-labelledby={`${id}-title`}>
    <div className="fm-section-heading"><h3 id={`${id}-title`}>{title}</h3><span>100 MB per file</span></div>
    {description && <p className="fm-help">{description}</p>}
    <div className={`fm-dropzone${dragging && !locked ? " fm-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); if (!locked) setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); if (!locked) uploads.addFiles(event.dataTransfer.files); }}>
      <UploadCloud size={25} aria-hidden="true" />
      <div><strong>Drop media here</strong><p id={`${id}-formats`}>JPG, PNG, GIF, WebP, AVIF, HEIC, HEIF, MP3, MP4, MOV or MKV. Up to 100,000,000 bytes each.</p></div>
      <input ref={input} className="fm-hidden-input" type="file" tabIndex={-1} multiple accept={MEDIA_ACCEPT} disabled={locked} aria-label="Choose media files" aria-describedby={`${id}-formats`} onChange={(event) => { if (event.target.files) uploads.addFiles(event.target.files); event.target.value = ""; }} />
      <button className="fm-button fm-primary" type="button" disabled={locked} aria-describedby={`${id}-formats`} onClick={() => input.current?.click()}>Choose files</button>
    </div>
    <p className="fm-help">Originals stay in Library. Shared in-app previews appear after automatic processing. Uploading and preview processing have separate statuses.</p>
    {uploads.demo && <p className="fm-notice">Sign in to a workspace to upload. Demo files are not stored.</p>}
    {uploads.selectionErrors.length > 0 && <div className="fm-error-box" role="alert"><ul>{uploads.selectionErrors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul><button className="fm-button" type="button" onClick={uploads.clearSelectionErrors}>Dismiss</button></div>}
    <div className="fm-upload-list">{uploads.items.map((item) => <UploadRow key={item.id} item={item} uploads={uploads} disabled={disabled} compact={compact} />)}</div>
  </section>;
}
