"use client";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { OnboardingGuide } from "@/components/studio/onboarding-guide";
import {
  filterGenerationSourceVersions,
  resolveGenerationProjectId,
} from "@/lib/studio/generation-context";
import {
  X,
  Sparkles,
  RefreshCw,
  Check,
  ImagePlus,
  AlertCircle,
} from "lucide-react";
type Props = {
  data: any;
  workspaceId: string;
  demo: boolean;
  currentProjectId?: string;
  initial?: any;
  onClose: () => void;
  onSaved: () => void;
  onboardingGuide?: any;
};
export function GenerationPanel({
  data,
  workspaceId,
  demo,
  currentProjectId,
  initial = {},
  onClose,
  onSaved,
  onboardingGuide,
}: Props) {
  const [projectId, setProjectId] = useState(() =>
      resolveGenerationProjectId(
        currentProjectId,
        initial.projectId,
        data.projects,
      ),
    ),
    [versionId, setVersionId] = useState(initial.sourceVersionId || ""),
    [prompt, setPrompt] = useState(
      initial.prompt ||
        "Keep the silhouette and material. Explore a new color direction.",
    ),
    [target, setTarget] = useState(initial.target || "trim"),
    [palette, setPalette] = useState(initial.palette?.join(", ") || "#760D24"),
    [count, setCount] = useState(1),
    [usageAcknowledged, setUsageAcknowledged] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef(crypto.randomUUID());
  const previousContextProjectId = useRef(currentProjectId);
  useEffect(() => {
    if (typeof initial.prompt === "string" && initial.prompt.trim()) setPrompt(initial.prompt);
  }, [initial.prompt]);
  useEffect(() => {
    if (previousContextProjectId.current === currentProjectId) return;
    previousContextProjectId.current = currentProjectId;
    setProjectId(
      resolveGenerationProjectId(currentProjectId, undefined, data.projects),
    );
    setVersionId("");
  }, [currentProjectId]);
  const jobs = useSWR(
    !demo && projectId
      ? `/api/studio/generation?workspaceId=${workspaceId}&projectId=${projectId}`
      : null,
    async (url) => {
      const r = await fetch(url, { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw Error(b.error || "Image jobs unavailable");
      return b;
    },
    {
      refreshInterval: (v: any) =>
        v?.jobs?.some((j: any) => ["queued", "running"].includes(j.status))
          ? 4000
          : 0,
    },
  );
  useEffect(() => {
    const prevent = (e: Event) => {
      if (busy || prompt.trim()) e.preventDefault();
    };
    window.addEventListener("fairway-before-update", prevent);
    return () => window.removeEventListener("fairway-before-update", prevent);
  }, [busy, prompt]);
  async function action(action: string, extra: any = {}) {
    setError("");
    if (["create", "retry", "run"].includes(action) && !usageAcknowledged) {
      setError("Review and acknowledge the usage notice before starting or retrying image generation.");
      return;
    }
    setBusy(true);
    try {
      if (demo)
        throw Error(
          "Image generation is unavailable in the isolated demo. No image was generated or modified.",
        );
      const r = await fetch("/api/studio/generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, workspaceId, projectId, ...extra }),
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error || "Image operation failed.");
      await jobs.mutate();
      if (action === "retain") onSaved();
      return result;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const result = await action("create", {
      sourceVersionId: versionId || undefined,
      prompt,
      target,
      palette,
      kitVersionId:
        data.projects.find((p: any) => p.id === projectId)?.kit_id || undefined,
      preserve:
        "Keep source composition, silhouette, and material except the selected target.",
      count,
      idempotencyKey: request.current,
    });
    if (result?.job) {
      request.current = crypto.randomUUID();
      void action("run", { jobId: result.job.id });
    }
  }
  return (
    <div className="fs-ai-overlay">
      <button
        className="fs-scrim"
        aria-label="Close image studio"
        onClick={onClose}
      />
      <aside className="fs-ai-panel">
        <header>
          <h2 className="fs-icon-title">
            <Sparkles />
            Image studio
          </h2>
          <button
            className="fs-icon"
            aria-label="Close image studio"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {onboardingGuide && <OnboardingGuide {...onboardingGuide} pageId="generation" />}
        <p>Create logo concepts, product mockups, or a selected-source image edit. Your original stays unchanged.</p>
        <div className="fs-ai-model-note">
          <strong>Image Studio</strong>
          <small>GPT Image 2 · OpenAI</small>
          <span>Write a brief → create a draft image → refine it → review and save deliberately.</span>
          <span>Exploratory raster concepts only: no native vector output, trademark clearance, or production-ready final asset is implied.</span>
        </div>
        {(demo || jobs.data?.available === false || jobs.error) && (
          <p className="fs-inline-note">
            <AlertCircle size={17} />
            {demo
              ? "Demo mode cannot start provider jobs."
              : jobs.data?.setupMessage || jobs.error?.message}
          </p>
        )}
        <form onSubmit={create}>
          <label>
            Project
            <select
              className="rounded-lg border p-3"
              value={projectId}
              required
              onChange={(e) => {
                setProjectId(e.target.value);
                setVersionId("");
              }}
            >
              {data.projects.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Source version
            <select
              className="rounded-lg border p-3"
              value={versionId}
              onChange={(e) => setVersionId(e.target.value)}
            >
              <option value="">New concept (no source edit)</option>
              {filterGenerationSourceVersions(data.versions, projectId).map(
                (v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.title} · v{v.version_number}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Instruction
            <textarea
              required
              maxLength={2000}
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
          <label>
            Edit target
            <select
              className="rounded-lg border p-3"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              {[
                "trim",
                "bag body",
                "garment body",
                "wordmark",
                "monogram",
                "hardware",
                "background",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Palette (hex colors, separated by commas)
            <input
              className="rounded-lg border p-3"
              value={palette}
              onChange={(e) => setPalette(e.target.value)}
            />
          </label>
          <label>
            Images
            <select
              className="rounded-lg border p-3"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            >
              <option value={1}>1 draft image</option>
              <option value={2}>2 draft images</option>
            </select>
          </label>
          <p className="fs-inline-note">
            Pinned kit:{" "}
            {data.kits.find(
              (k: any) =>
                k.id ===
                data.projects.find((p: any) => p.id === projectId)?.kit_id,
            )?.title || "None selected"}
            . This exact snapshot is included when selected.
          </p>
          <label className="fs-ai-usage-consent">
            <input
              type="checkbox"
              checked={usageAcknowledged}
              onChange={(event) => setUsageAcknowledged(event.target.checked)}
            />
            <span>Image requests and retries may incur provider usage charges. No price is estimated here. I will review every draft before keeping it.</span>
          </label>
          <p className="fs-muted">
            Only authorized source bytes are used; Pinterest embeds are not image inputs.
          </p>
          <button className="fs-button" disabled={busy || !projectId || !usageAcknowledged}>
            <ImagePlus size={17} />
            {busy ? "Working…" : "Generate draft variation"}
          </button>
        </form>
        {error && (
          <p role="alert" className="fs-alert error">
            {error}
          </p>
        )}
        <div className="fs-section-head mt-8">
          <h2>Recent image jobs</h2>
          <button
            className="fs-icon"
            aria-label="Refresh jobs"
            onClick={() => void jobs.mutate()}
          >
            <RefreshCw size={17} />
          </button>
        </div>
        {!(jobs.data?.jobs || []).length && (
          <p className="fs-muted">
            No generation jobs yet. Results appear only after the provider
            succeeds.
          </p>
        )}
        {(jobs.data?.jobs || []).map((job: any) => (
          <section className="fs-card mb-3" key={job.id}>
            <div className="flex justify-between gap-3">
              <strong className="text-sm">
                {job.request?.target || "Concept variation"}
              </strong>
              <span className="fs-badge">{job.status}</span>
            </div>
            <p className="fs-muted fs-space">{job.request?.prompt}</p>
            {job.error && (
              <p role="alert" className="text-xs text-red-800">
                {typeof job.error === "string"
                  ? job.error
                  : "The provider could not complete this job."}
              </p>
            )}
            {job.status === "succeeded" &&
              (job.outputs || []).map((output: any, index: number) => (
                <img
                  className="rounded-lg my-3 w-full"
                  key={output.path || index}
                  src={`/api/studio/generation?workspaceId=${workspaceId}&jobId=${job.id}&output=${index}`}
                  alt={`Generated draft ${index + 1} for ${job.request?.target || "concept"}`}
                />
              ))}
            {job.status === "succeeded" &&
              !job.retained_version_ids?.length && (
                <button
                  className="fs-button secondary"
                  disabled={busy}
                  onClick={() => void action("retain", { jobId: job.id })}
                >
                  <Check size={16} />
                  Keep as new versions
                </button>
              )}
            {!!job.retained_version_ids?.length && (
              <p className="fs-inline-note">
                Retained as {job.retained_version_ids.length} new draft
                versions.
              </p>
            )}
            {["queued", "running"].includes(job.status) && (
              <button
                className="fs-link"
                onClick={() => void action("cancel", { jobId: job.id })}
              >
                Cancel (best effort)
              </button>
            )}
            {["failed", "queued"].includes(job.status) && (
              <button
                className="fs-button secondary"
                disabled={busy}
                onClick={async () => {
                  if (job.status === "failed") {
                    const r = await action("retry", { jobId: job.id });
                    if (!r) return;
                  }
                  void action("run", { jobId: job.id });
                }}
              >
                Retry / resume
              </button>
            )}
            <small className="block mt-3 text-gray-500">
              Job {job.id.slice(0, 8)} ·{" "}
              {new Date(job.created_at).toLocaleString()}
            </small>
          </section>
        ))}
        {jobs.data && !jobs.data.automaticRecovery && (
          <p className="fs-inline-note">
            Automatic recovery is not verified. Configure and verify a scheduled
            worker. Use Retry / resume for a queued job.
          </p>
        )}
        <p className="fs-inline-note">
          Keeping outputs creates new draft versions. It does not approve a
          concept or insert it into a canvas automatically.
        </p>
      </aside>
    </div>
  );
}
