"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, Download, FileImage, Film, Music2, RefreshCw } from "lucide-react";
import { mediaOriginalUrl, mediaPreviewUrl, type MediaJob } from "@/lib/studio/media";
import { mediaPresentation } from "@/lib/studio/media-preview-state";
import type { MediaWorkerStatus } from "@/lib/studio/media-upload-controller";
import "./media.css";

type PreviewState = { scope: string; job: MediaJob | null; worker: MediaWorkerStatus | null; legacy: boolean; loading: boolean; error: string | null };
export type MediaPlayerProps = {
  workspaceId: string; fileId: string; title?: string; mimeType?: string;
  userId?: string; addedBy?: string; compact?: boolean; className?: string;
  initialJob?: MediaJob | null; initialWorker?: MediaWorkerStatus | null;
};

/** Polls durable server state; it never marks an upload or session-only blob as a shared preview. */
export function useMediaPreview({ workspaceId, fileId, initialJob, initialWorker }: Pick<MediaPlayerProps, "workspaceId" | "fileId" | "initialJob" | "initialWorker">) {
  const scope = `${workspaceId}/${fileId}`;
  const validInitial = initialJob?.file_id === fileId && initialJob.workspace_id === workspaceId ? initialJob : null;
  const [state, setState] = useState<PreviewState>({ scope, job: validInitial, worker: initialWorker ?? null, legacy: false, loading: true, error: null });
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const retryRequest = useRef<AbortController | null>(null);
  const latest = useRef({ scope, validInitial, initialWorker });
  latest.current = { scope, validInitial, initialWorker };
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    setRetrying(false);
    const schedule = (milliseconds: number) => { if (timer) clearTimeout(timer); if (!abort.signal.aborted) timer = setTimeout(() => { void load(); }, milliseconds); };
    setState((current) => current.scope === scope ? { ...current, loading: true, error: null } : { scope, job: latest.current.validInitial, worker: latest.current.initialWorker ?? null, legacy: false, loading: true, error: null });
    async function load() {
      if (abort.signal.aborted || inFlight) return;
      if (document.visibilityState === "hidden") { schedule(30_000); return; }
      if (timer) clearTimeout(timer);
      inFlight = true;
      try {
        const query = new URLSearchParams({ workspaceId, fileIds: fileId });
        const response = await fetch(`/api/studio/media/jobs?${query}`, { credentials: "same-origin", cache: "no-store", signal: abort.signal });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (!abort.signal.aborted) setState({ scope, job: null, worker: null, legacy: false, loading: false, error: response.status === 401 ? "Sign in again to view this media." : body.error || "Preview status is temporarily unavailable." });
          if (![401, 403, 404].includes(response.status)) schedule(15_000);
          return;
        }
        if (abort.signal.aborted) return;
        const job: MediaJob | null = Array.isArray(body.jobs) ? body.jobs.find((candidate: MediaJob) => candidate.file_id === fileId && candidate.workspace_id === workspaceId) ?? null : null;
        const worker: MediaWorkerStatus | null = body.worker ?? null;
        const legacy = Array.isArray(body.legacyFileIds) && body.legacyFileIds.includes(fileId);
        setState({ scope, job, worker, legacy, loading: false, error: !job && !legacy ? "No preview job is available for this file. The original can still be downloaded if you have access." : null });
        if (job && ["queued", "processing", "blocked"].includes(job.status)) schedule(worker?.automatic ? 4_000 : 30_000);
      } catch {
        if (!abort.signal.aborted) {
          setState((current) => ({ ...current, loading: false, error: navigator.onLine ? "Preview status could not be checked. Try again." : "You're offline. Reconnect to view shared media." }));
          schedule(15_000);
        }
      } finally { inFlight = false; }
    }
    const wake = () => { if (document.visibilityState !== "hidden") void load(); };
    void load();
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      abort.abort();
      if (timer) clearTimeout(timer);
      retryRequest.current?.abort();
      retryRequest.current = null;
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [workspaceId, fileId, scope, refreshIndex]);
  const refresh = useCallback(() => setRefreshIndex((value) => value + 1), []);
  const retry = useCallback(async () => {
    if (retryRequest.current || state.scope !== scope || !state.job) return;
    const abort = new AbortController();
    retryRequest.current = abort;
    setRetrying(true);
    try {
      const response = await fetch("/api/studio/media/jobs", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, jobId: state.job.id, action: "retry" }), signal: abort.signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "The preview could not be retried. The original is preserved.");
      if (!abort.signal.aborted) { setState((current) => ({ ...current, job: body.job ?? current.job, worker: body.worker ?? current.worker, error: null })); refresh(); }
    } catch (error) {
      if (!abort.signal.aborted) setState((current) => ({ ...current, error: error instanceof Error ? error.message : "The preview could not be retried." }));
    } finally {
      if (retryRequest.current === abort) retryRequest.current = null;
      if (latest.current.scope === scope) setRetrying(false);
    }
  }, [workspaceId, scope, state.scope, state.job, refresh]);
  return { ...(state.scope === scope ? state : { scope, job: validInitial, worker: initialWorker ?? null, legacy: false, loading: true, error: null }), refresh, retry, retrying };
}

export function MediaPlayer(props: MediaPlayerProps) {
  const { title = "Media attachment", mimeType, fileId, compact = false, userId, className = "" } = props;
  const preview = useMediaPreview(props);
  const presentation = mediaPresentation(preview.job, preview.worker, preview.legacy, mimeType);
  const [playbackError, setPlaybackError] = useState(false);
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setPlaybackError(false); setLoaded(false); }, [fileId, preview.job?.updated_at, reload]);
  const src = `${mediaPreviewUrl(fileId)}&v=${encodeURIComponent(preview.job?.updated_at || "legacy")}&reload=${reload}`;
  const Icon = presentation.kind === "video" ? Film : presentation.kind === "audio" ? Music2 : FileImage;
  const canRetry = Boolean(preview.job && ["failed", "blocked"].includes(preview.job.status) && preview.job.created_by === userId && preview.job.attempts < 3);
  const failed = () => setPlaybackError(true);
  return <figure className={`fm-player${compact ? " fm-player-compact" : ""} ${className}`} aria-label={title}>
    {presentation.ready && !playbackError && !preview.error ? <div className="fm-media-surface">
      {presentation.kind === "video" ? <video key={src} src={src} controls playsInline preload="metadata" aria-label={title} onError={failed} onLoadedMetadata={() => setLoaded(true)} /> : presentation.kind === "audio" ? <div className="fm-audio-surface"><Music2 aria-hidden="true" size={32} /><audio key={src} src={src} controls preload="metadata" aria-label={title} onError={failed} onLoadedMetadata={() => setLoaded(true)} /></div> : <img key={src} src={src} alt={title} loading="lazy" onError={failed} onLoad={() => setLoaded(true)} />}
      {!loaded && <span className="fm-media-loading" role="status">Loading shared preview…</span>}
    </div> : <div className="fm-preview-placeholder"><Icon size={compact ? 25 : 34} aria-hidden="true" /><div><strong>{playbackError ? "Preview could not be played" : preview.error ? "Preview unavailable" : presentation.label}</strong><p>{playbackError ? "The shared preview could not load in this browser. Reload it to request a fresh private media link." : preview.error || presentation.detail}</p></div></div>}
    <figcaption className="fm-preview-caption">
      <span className={`fm-status${presentation.ready && !playbackError && !preview.error ? " fm-status-ready" : ""}`} role="status">{playbackError ? <CircleAlert size={14} aria-hidden="true" /> : null}{preview.error ? "Preview unavailable" : playbackError ? "Original saved" : presentation.label}</span>
      <span className="fm-preview-actions">
        {canRetry && <button className="fm-button" type="button" disabled={preview.retrying} onClick={() => { void preview.retry(); }}><RefreshCw size={14} aria-hidden="true" />{preview.retrying ? "Retrying…" : "Retry preview"}</button>}
        {(playbackError || preview.error || (!presentation.ready && !preview.loading)) && <button className="fm-button" type="button" disabled={preview.loading || preview.retrying} onClick={() => { setReload((value) => value + 1); preview.refresh(); }}><RefreshCw size={14} aria-hidden="true" />{playbackError ? "Reload preview" : "Check status"}</button>}
        <a className="fm-button" href={mediaOriginalUrl(fileId)} download><Download size={14} aria-hidden="true" />Original</a>
      </span>
    </figcaption>
  </figure>;
}
