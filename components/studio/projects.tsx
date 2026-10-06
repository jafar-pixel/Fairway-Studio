"use client";

import { ProfileAvatar } from "./profile-avatar";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Columns2,
  ChevronDown,
  Eye,
  Lightbulb,
  Palette,
  Shirt,
  SlidersHorizontal,
  Target,
  Download,
  Expand,
  FileImage,
  FileText,
  FolderOpen,
  Grid2X2,
  ImageIcon,
  Link2,
  List,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  StickyNote,
  Upload,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import {
  mergeProjectOutcomes,
  projectReplacementState,
  projectRoundActions,
} from "@/lib/studio/project-helpers";

import { MediaPlayer } from "./media-player";
import { BoardModeSwitch, CanvasBoard } from "./canvas-board";
import "./projects-visual.css";

type Row = Record<string, any>;
type Props = {
  data: Record<string, any>;
  workspaceId: string;
  userId: string;
  demo?: boolean;
  onMutate: (
    operation: string,
    input: Record<string, unknown>,
  ) => Promise<unknown>;
  onNavigate: (path: string) => void;
  projectId?: string;
  tab?: string;
};
const panel = "fp-panel rounded-xl border border-[#e6e2dd] bg-white";
const button =
  "fp-button inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#e4dfda] bg-white px-3 py-2 text-sm font-medium transition hover:bg-[#f7f3ee] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#760d24]";
const primary = `${button} !border-[#760d24] !bg-[#760d24] !text-white hover:!bg-[#590b1b]`;
const input =
  "fp-input w-full rounded-lg border border-[#ded9d3] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#760d24] focus:ring-2 focus:ring-[#760d24]/10";
const colors = [
  { name: "Burgundy", hex: "#760D24" },
  { name: "Chocolate", hex: "#4A3028" },
  { name: "Black", hex: "#181818" },
  { name: "Royal blue", hex: "#2448A6" },
  { name: "Tan", hex: "#C3A17A" },
  { name: "Cream", hex: "#F4EDE1" },
];
const label = (value: unknown) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/^\w/, (c) => c.toUpperCase());
const roundState = (row?: Row) => row?.status || row?.state || "open";
const title = (row?: Row) => row?.title || row?.name || "Untitled";
const imageUrl = (row?: Row) =>
  row?.image_url ||
  row?.preview_url ||
  row?.cover_url ||
  row?.thumbnail_url ||
  "";
const versionName = (row?: Row) =>
  row
    ? `${title(row)} · v${row.version_number || row.version || 1}`
    : "Version unavailable";
const formatDate = (date?: string) =>
  date && !Number.isNaN(Date.parse(date))
    ? new Date(date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "No date";
const rows = (data: Row, key: string): Row[] =>
  Array.isArray(data[key]) ? data[key] : [];

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="fp-badge inline-flex items-center gap-1.5 rounded-full bg-[#f5e8e9] px-2.5 py-1 text-xs font-medium text-[#760d24]">
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
function Empty({
  title: heading,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`${panel} flex min-h-52 flex-col items-center justify-center gap-3 p-8 text-center`}
    >
      <FolderOpen size={28} className="text-[#9a7e66]" />
      <h3 className="text-lg font-semibold">{heading}</h3>
      <div className="max-w-md text-sm leading-relaxed text-[#77716c]">
        {children}
      </div>
    </div>
  );
}
function Picture({ row, className = "" }: { row?: Row; className?: string }) {
  return imageUrl(row) ? (
    <img
      src={imageUrl(row)}
      alt={title(row)}
      className={`h-full w-full object-cover ${className}`}
      style={{
        objectFit:
          (row?.preview_fit || row?.provenance?.preview_fit) === "contain"
            ? "contain"
            : undefined,
      }}
    />
  ) : (
    <div
      className={`flex h-full min-h-32 items-center justify-center bg-[#f4ede1] text-[#9d8975] ${className}`}
    >
      <ImageIcon size={36} strokeWidth={1} />
    </div>
  );
}
function Modal({
  heading,
  children,
  onClose,
  wide = false,
}: {
  heading: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      className={`m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] ${wide ? "max-w-6xl" : "max-w-xl"} overflow-y-auto rounded-2xl border border-[#e6e2dd] bg-[#fffdfa] p-0 text-[#24211e] shadow-xl backdrop:bg-black/60`}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e6e2dd] bg-[#fffdfa] p-5">
        <h2 className="text-lg font-semibold">{heading}</h2>
        <button className={button} onClick={onClose} aria-label="Close dialog">
          <X size={18} />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}

export function ProjectsView({
  data,
  workspaceId,
  userId,
  demo = false,
  onMutate,
  onNavigate,
  projectId,
  tab = "overview",
}: Props) {
  const projects = rows(data, "projects"),
    members = rows(data, "members"),
    allVersions = rows(data, "versions"),
    allRounds = rows(data, "rounds");
  const project = projects.find((p) => p.id === projectId);
  const versions = allVersions.filter(
    (v) =>
      v.project_id === projectId ||
      rows(data, "nodes").some(
        (n) =>
          n.project_id === projectId &&
          n.version_id === v.id &&
          n.kind !== "annotation",
      ),
  );
  const rounds = allRounds.filter(
    (r) =>
      r.project_id === projectId ||
      versions.some((v) => v.id === (r.version_id || r.target_version_id)),
  );
  const decisions = mergeProjectOutcomes(
    rows(data, "decisions"),
    rows(data.workflow || data, "outcomes"),
    projectId || "",
    rounds.map((r) => r.id),
  );
  const supersessions = rows(data.workflow || data, "supersessions");
  const tasks = rows(data, "tasks").filter((t) => t.project_id === projectId);
  const nodes = rows(data, "nodes").filter((n) => n.project_id === projectId);
  const canvasVersions = versions.filter(
    (v) =>
      (!v.provenance?.origin_job_id && !v.provenance?.mockup_import) ||
      nodes.some((n) => n.version_id === v.id && n.kind !== "annotation"),
  );
  const projectFiles = rows(data, "files").filter(
    (f) =>
      f.project_id === projectId ||
      f.project_ids?.includes(projectId) ||
      nodes.some((n) => n.file_id === f.id),
  );
  const requestedRoundId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("round") || ""
      : "";
  const [query, setQuery] = useState(""),
    [archived, setArchived] = useState(false),
    [kind, setKind] = useState("all"),
    [phase, setPhase] = useState("all"),
    [lead, setLead] = useState("all"),
    [view, setView] = useState("grid");
  const [canvasMode, setCanvasMode] = useState<"board" | "versions">("board");
  const [filtersReady, setFiltersReady] = useState(false);
  useEffect(() => {
    if (projectId) return;
    const q = new URLSearchParams(window.location.search);
    setQuery(q.get("q") || "");
    setKind(q.get("type") || "all");
    setPhase(q.get("phase") || "all");
    setLead(q.get("lead") || "all");
    setView(q.get("view") || "grid");
    setArchived(q.get("status") === "archived");
    setFiltersReady(true);
  }, [projectId]);
  useEffect(() => {
    if (projectId || !filtersReady) return;
    const u = new URL(window.location.href);
    for (const [k, v] of Object.entries({
      q: query,
      type: kind === "all" ? "" : kind,
      phase: phase === "all" ? "" : phase,
      lead: lead === "all" ? "" : lead,
      view: view === "grid" ? "" : view,
      status: archived ? "archived" : "",
    })) {
      if (v) u.searchParams.set(k, v);
      else u.searchParams.delete(k);
    }
    window.history.replaceState(window.history.state, "", u);
  }, [query, kind, phase, lead, view, archived, projectId, filtersReady]);
  const [modal, setModal] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]),
    [focusId, setFocusId] = useState(""),
    [zoom, setZoom] = useState(1),
    [color, setColor] = useState(colors[0]),
    [target, setTarget] = useState("trim"),
    [prompt, setPrompt] = useState(
      "Keep the silhouette and material. Explore a new color direction.",
    );
  const [showColors, setShowColors] = useState(false);
  const [secondaryColor, setSecondaryColor] = useState(colors[4]);
  const [decisionOutcome, setDecisionOutcome] = useState<
    "approve" | "reject" | "defer"
  >("approve");
  const [supersededDecision, setSupersededDecision] = useState<Row | null>(
    null,
  );
  const [replacementPolicy, setReplacementPolicy] = useState("unanimous");
  const [editRevision, setEditRevision] = useState(0);
  const [selectedKitId, setSelectedKitId] = useState("");
  const [roundId, setRoundId] = useState(""),
    [annotation, setAnnotation] = useState<{ x: number; y: number } | null>(
      null,
    ),
    [annotating, setAnnotating] = useState(false);
  const canManageReviews = ["owner", "admin"].includes(
    data.role || members.find((m) => m.user_id === userId)?.role,
  );
  const selectedVersion = versions.find((v) => v.id === focusId) || versions[0];
  const round = roundId
    ? rounds.find((r) => r.id === roundId)
    : rounds.find((r) => roundState(r) === "open") || rounds[0];
  const reviewedVersion = versions.find(
    (v) => v.id === (round?.version_id || round?.target_version_id),
  );
  const name = (id: string) =>
    members.find((m) => m.user_id === id || m.id === id)?.display_name ||
    members.find((m) => m.user_id === id || m.id === id)?.name ||
    (id === userId ? "You" : "Workspace member");
  const go = (id: string, page = "overview") =>
    onNavigate(
      `/w/${workspaceId}/projects/${id}${page === "overview" ? "" : `/${page}`}`,
    );
  useEffect(() => {
    setSelected([]);
    setFocusId("");
    setCanvasMode("board");
    setRoundId(requestedRoundId);
    setError("");
    setNotice("");
  }, [projectId, requestedRoundId]);
  async function act(operation: string, payload: Row, close = true) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await onMutate(operation, payload);
      if (close) setModal("");
      setNotice(demo ? "Updated in this demo only." : "Saved to workspace.");
      return true;
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "Could not save. Your changes are still here.";
      if (!demo && /changed|conflict/i.test(message)) {
        try {
          await onMutate("refresh", {});
        } catch {}
      }
      setError(message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const unavailable = (message: string) => {
    setError(message);
    setModal("");
  };
  const requestVariation = (
    source = selectedVersion,
    editTarget = target,
    instructions = prompt,
  ) => {
    if (!source) return;
    if (
      source.requires_upload_for_generation ||
      source.media_origin === "bundled_exploratory"
    ) {
      setFocusId(source.id);
      setModal("generation-source");
      return;
    }
    window.dispatchEvent(
      new CustomEvent("fairway-generation", {
        detail: {
          projectId: project?.id,
          sourceVersionId: source.id,
          prompt: instructions,
          target: editTarget,
          palette: [color.hex, secondaryColor.hex],
        },
      }),
    );
  };
  const choose = (id: string) => {
    setFocusId(id);
    setSelected((s) =>
      s.includes(id)
        ? s.filter((x) => x !== id)
        : s.length < 4
          ? [...s, id]
          : s,
    );
  };
  const filtered = projects
    .filter(
      (p) =>
        (p.phase === "archived" ||
          p.status === "archived" ||
          p.archived === true) === archived,
    )
    .filter((p) =>
      `${title(p)} ${p.objective || p.brief || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .filter((p) => kind === "all" || (p.type || p.category) === kind)
    .filter((p) => phase === "all" || (p.phase || p.status) === phase)
    .filter((p) => lead === "all" || p.lead_id === lead);
  const nextTask = (id: string) =>
    [...rows(data, "projectNextActions"), ...rows(data, "tasks")].find(
      (t) => t.project_id === id && !["done", "completed"].includes(t.status),
    );
  const availableIdeas = rows(data, "ideas").filter(
    (idea) => !idea.promoted_project_id,
  );
  const ideaSuggestions = availableIdeas.some((idea) => idea.project_suggestion)
    ? availableIdeas
        .filter((idea) => idea.project_suggestion)
        .sort(
          (a, b) =>
            (a.project_suggestion_order || 0) -
            (b.project_suggestion_order || 0),
        )
        .slice(0, 2)
    : availableIdeas.slice(0, 2);
  const feedback = (
    <>
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-[#e3b8b5] bg-[#fff1ee] p-4 text-sm text-[#7c251a]"
        >
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mb-4 rounded-lg bg-[#edf5ed] p-3 text-sm text-[#355637]"
        >
          {notice}
        </div>
      )}
    </>
  );
  const creation = (
    <Modal heading="Create a project" onClose={() => setModal("")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void act("createProject", {
            title: f.get("title"),
            category: f.get("type"),
            brief: f.get("objective"),
            lead_id: f.get("lead_id"),
          });
        }}
        className="space-y-4"
      >
        <p className="text-sm text-[#77716c]">
          A shared home for one collection, product, or campaign.{" "}
          {demo ? "This project will stay in the demo." : ""}
        </p>
        <Field text="Project name">
          <input
            name="title"
            required
            maxLength={180}
            className={input}
            placeholder="A new direction"
            autoFocus
          />
        </Field>
        <Field text="Type">
          <select name="type" className={input}>
            {[
              "brand_identity",
              "product",
              "apparel",
              "campaign",
              "general",
            ].map((t) => (
              <option key={t} value={t}>
                {label(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field text="Objective">
          <textarea
            name="objective"
            required
            className={input}
            rows={3}
            placeholder="What are we making, and who is it for?"
          />
        </Field>
        <Field text="Project lead">
          <select
            name="lead_id"
            required
            defaultValue={userId}
            className={input}
          >
            {members.map((m) => (
              <option key={m.user_id || m.id} value={m.user_id || m.id}>
                {m.display_name || m.name || "Workspace member"}
              </option>
            ))}
          </select>
        </Field>
        {error && (
          <p role="alert" className="text-sm text-red-800">
            {error}
          </p>
        )}
        <button disabled={busy} className={`${primary} w-full`}>
          {busy ? "Creating…" : "Create project"}
        </button>
      </form>
    </Modal>
  );
  if (!projectId)
    return (
      <section className="fp-projects fp-project-index">
        {feedback}
        <div className="fp-index-heading">
          <div>
            <h1>Make the ideas real.</h1>
            <p>A shared home for every collection, product, and campaign.</p>
          </div>
          <button
            className="fp-kit-summary"
            onClick={() => onNavigate(`/w/${workspaceId}/brand-kit`)}
          >
            <Box size={25} />
            <span>
              <strong>
                {data.workspace?.active_kit_id
                  ? "Active brand kit"
                  : "No active brand kit"}
              </strong>
              <small>
                {data.workspace?.active_kit_id
                  ? "A shared foundation for your work."
                  : "Concepts remain exploratory."}
              </small>
            </span>
          </button>
        </div>
        <div className="fp-index-layout">
          <div className="fp-index-main">
            <div className="fp-project-filters">
              <div className="fp-segmented" aria-label="Project status">
                {["Active", "Archived"].map((s, i) => (
                  <button
                    key={s}
                    onClick={() => setArchived(!!i)}
                    aria-pressed={archived === !!i}
                    className={archived === !!i ? "is-active" : ""}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <label className="fp-project-search">
                <Search size={18} />
                <input
                  aria-label="Search projects"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search projects..."
                />
              </label>
              <div className="fp-view-switch" aria-label="Project layout">
                <button
                  aria-label="Show grid"
                  aria-pressed={view === "grid"}
                  className={view === "grid" ? "is-active" : ""}
                  onClick={() => setView("grid")}
                >
                  <Grid2X2 size={18} />
                  Grid
                </button>
                <button
                  aria-label="Show list"
                  aria-pressed={view === "list"}
                  className={view === "list" ? "is-active" : ""}
                  onClick={() => setView("list")}
                >
                  <List size={18} />
                  List
                </button>
              </div>
              <details className="fp-filter-menu">
                <summary aria-label="Filter projects">
                  <SlidersHorizontal size={17} />
                </summary>
                <div>
                  <label>
                    Type
                    <select
                      aria-label="Project type"
                      className={input}
                      value={kind}
                      onChange={(e) => setKind(e.target.value)}
                    >
                      <option value="all">All types</option>
                      {Array.from(
                        new Set(
                          projects
                            .map((p) => p.type || p.category)
                            .filter(Boolean),
                        ),
                      ).map((t) => (
                        <option key={t} value={t}>
                          {label(t)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Phase
                    <select
                      aria-label="Project phase"
                      className={input}
                      value={phase}
                      onChange={(e) => setPhase(e.target.value)}
                    >
                      <option value="all">All phases</option>
                      {Array.from(
                        new Set(
                          projects
                            .map((p) => p.phase || p.status)
                            .filter(Boolean),
                        ),
                      ).map((t) => (
                        <option key={t} value={t}>
                          {label(t)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Lead
                    <select
                      aria-label="Project lead"
                      className={input}
                      value={lead}
                      onChange={(e) => setLead(e.target.value)}
                    >
                      <option value="all">All leads</option>
                      {members.map((m) => (
                        <option
                          key={m.user_id || m.id}
                          value={m.user_id || m.id}
                        >
                          {m.display_name || m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className={button}
                    onClick={() => {
                      setError("");
                      setModal("create");
                    }}
                  >
                    <Plus size={16} />
                    New project
                  </button>
                </div>
              </details>
            </div>
            {filtered.length ? (
              <div
                className={`fp-project-grid ${view === "list" ? "is-list" : ""}`}
              >
                {filtered.map((p) => (
                  <article
                    key={p.id}
                    className={`fp-project-card ${String(p.type || p.category).toLowerCase() === "campaign" ? "is-campaign" : ""}`}
                  >
                    <button
                      onClick={() => go(p.id)}
                      aria-label={`Open ${title(p)}`}
                      className="fp-project-cover"
                    >
                      <Picture row={p} />
                    </button>
                    <details className="fp-card-menu">
                      <summary aria-label={`More actions for ${title(p)}`}>
                        <MoreHorizontal size={19} />
                      </summary>
                      <div>
                        <button onClick={() => go(p.id)}>Open project</button>
                        <button
                          onClick={() => {
                            void navigator.clipboard
                              .writeText(
                                `${window.location.origin}/w/${workspaceId}/projects/${p.id}`,
                              )
                              .then(() => setNotice("Project link copied."))
                              .catch(() =>
                                setError(
                                  "Your browser could not copy the link. Open the project and copy its address.",
                                ),
                              );
                          }}
                        >
                          Copy link
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            void act(
                              "updateProject",
                              {
                                id: p.id,
                                expected_revision: p.revision ?? 0,
                                status: archived ? "active" : "archived",
                              },
                              false,
                            );
                          }}
                        >
                          {archived ? "Restore project" : "Archive project"}
                        </button>
                      </div>
                    </details>
                    <div className="fp-project-card-body">
                      <button
                        className="fp-project-title"
                        onClick={() => go(p.id)}
                      >
                        {title(p)}
                      </button>
                      <span
                        className={`fp-project-state ${p.phase === "in_review" ? "is-review" : ""}`}
                      >
                        <Badge>{label(p.phase || p.status || "draft")}</Badge>
                      </span>
                      <p className="fp-project-category">
                        {label(p.type || p.category || "general")}
                        {p.contains_tutorial_content && (
                          <span className="fp-starter-badge">
                            Starter collection
                          </span>
                        )}
                      </p>
                      <div className="fp-project-lead">
                        <Avatar name={name(p.lead_id)} userId={p.lead_id} />
                        <span>
                          <small>Project lead</small>
                          <strong>{name(p.lead_id)}</strong>
                        </span>
                      </div>
                      <button
                        className="fp-project-next"
                        onClick={() =>
                          go(p.id, nextTask(p.id) ? "overview" : "canvas")
                        }
                      >
                        <FileText size={22} />
                        <span>
                          <small>Next step</small>
                          {p.next_step ||
                            nextTask(p.id)?.title ||
                            "Explore the project"}
                        </span>
                        <ChevronRight size={17} />
                      </button>
                    </div>
                  </article>
                ))}
                {view === "grid" && (
                  <div className="fp-start-idea fp-panel">
                    <header>
                      <Lightbulb size={28} />
                      <span>
                        <h2>Start from an idea</h2>
                        <p>Turn a spark into a project.</p>
                      </span>
                    </header>
                    {ideaSuggestions.map((i) => (
                      <button
                        key={i.id}
                        onClick={() =>
                          onNavigate(`/w/${workspaceId}/ideas/${i.id}`)
                        }
                      >
                        <span className="fp-idea-thumb">
                          <Picture row={i} />
                        </span>
                        <span>
                          <strong>{title(i)}</strong>
                          <small>{i.body || "Explore a new direction."}</small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                    {!rows(data, "ideas").length && (
                      <button
                        onClick={() => onNavigate(`/w/${workspaceId}/ideas`)}
                      >
                        Capture your first idea <ArrowRight size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <Empty
                title={
                  projects.length
                    ? "No projects match"
                    : "Your next project starts here"
                }
              >
                Create a project from an idea, or give a new direction its own
                space.
                <button
                  className={`${button} mt-4`}
                  onClick={() => {
                    if (projects.length) {
                      setQuery("");
                      setKind("all");
                      setPhase("all");
                      setLead("all");
                      setArchived(false);
                    } else setModal("create");
                  }}
                >
                  {projects.length ? "Clear filters" : "Create project"}
                </button>
              </Empty>
            )}
          </div>
          <aside className="fp-index-aside">
            <div className="fp-panel fp-project-ai">
              <h2>
                <Sparkles size={23} />
                Studio AI
              </h2>
              <p className="fp-ai-prompt">What should move forward?</p>
              <button
                className={button}
                onClick={() =>
                  filtered[0] ? go(filtered[0].id) : setModal("create")
                }
              >
                <FileText size={23} />
                Prepare a project brief
                <ChevronRight size={17} />
              </button>
              <button
                className={button}
                onClick={() => {
                  const open = allRounds.find((r) => roundState(r) === "open");
                  const id = open?.project_id || filtered[0]?.id;
                  if (id) go(id, open ? "reviews" : "decisions");
                  else setNotice("Create a project to begin making decisions.");
                }}
              >
                <Target size={23} />
                Find open decisions
                <ChevronRight size={17} />
              </button>
            </div>
            <div className="fp-panel fp-project-activity">
              <h2>Recent activity</h2>
              {members.map((m) => {
                const id = m.user_id || m.id;
                const response = rows(data, "reviews").find(
                  (r) =>
                    r.reviewer_id === id &&
                    r.status !== "draft" &&
                    r.state !== "draft",
                );
                return (
                  <div key={id} className="fp-team-member">
                    <Avatar name={m.display_name || m.name || "Member"} userId={m.user_id || m.id} />
                    <span>
                      <strong>
                        {m.display_name || m.name || "Workspace member"}
                      </strong>
                      <small>
                        {response
                          ? label(response.disposition)
                          : allRounds.length
                            ? "Not reviewed"
                            : "No review requested"}
                      </small>
                    </span>
                    <MoreHorizontal size={17} aria-hidden="true" />
                  </div>
                );
              })}
              <button
                className={`${primary} fp-comment-button`}
                onClick={() => onNavigate(`/w/${workspaceId}/conversations`)}
              >
                <MessageSquare size={21} />
                Add comment
              </button>
            </div>
          </aside>
        </div>
        {modal === "create" && creation}
      </section>
    );
  if (!project)
    return (
      <Empty title="Project not found">
        This project may be unavailable or outside your workspace.
        <button
          className={`${button} mt-4`}
          onClick={() => onNavigate(`/w/${workspaceId}/projects`)}
        >
          Back to projects
        </button>
      </Empty>
    );
  return (
    <section className={`fp-projects fp-project-detail fp-tab-${tab}`}>
      {feedback}
      <button
        onClick={() => onNavigate(`/w/${workspaceId}/projects`)}
        className="fp-project-back"
      >
        Projects <span>/</span>
        <strong>{title(project)}</strong>
      </button>
      <div className="fp-detail-heading">
        <div className="fp-title-status">
          <h1 className="fp-detail-title">
            {tab === "reviews" && reviewedVersion?.review_title
              ? reviewedVersion.review_title
              : title(project)}
          </h1>
          <details className="fp-status-menu">
            <summary>
              <Badge>
                {tab === "reviews" && reviewedVersion
                  ? `Version ${reviewedVersion.version_number || reviewedVersion.version || 1}`
                  : label(project.phase || project.status || "exploring")}
                <ChevronDown size={14} />
              </Badge>
            </summary>
            <div>
              {tab === "reviews" ? (
                rounds.map((r) => (
                  <button key={r.id} onClick={() => setRoundId(r.id)}>
                    {versionName(
                      versions.find(
                        (v) => v.id === (r.version_id || r.target_version_id),
                      ),
                    )}{" "}
                    · {label(roundState(r))}
                  </button>
                ))
              ) : (
                <>
                  <button onClick={() => go(project.id)}>
                    Project overview
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(
                        "updateProject",
                        {
                          id: project.id,
                          expected_revision: project.revision ?? 0,
                          status:
                            project.status === "archived"
                              ? "active"
                              : "archived",
                        },
                        false,
                      )
                    }
                  >
                    {project.status === "archived"
                      ? "Restore project"
                      : "Archive project"}
                  </button>
                </>
              )}
            </div>
          </details>
        </div>
        <button
          className={`${button} fp-project-kit`}
          onClick={() => {
            setSelectedKitId(project.kit_id || project.kit_version_id || "");
            setEditRevision(project.revision ?? 0);
            setError("");
            setModal("kit");
          }}
        >
          <Box size={16} />
          <span className="text-xs">
            Brand kit:{" "}
            {project.kit_id || project.kit_version_id
              ? data.workspace?.active_kit_id &&
                data.workspace.active_kit_id !==
                  (project.kit_id || project.kit_version_id)
                ? "Update available"
                : "Pinned version"
              : "None selected"}
          </span>
        </button>
      </div>
      {project.contains_tutorial_content && (
        <span className="fp-detail-starter fp-starter-badge">
          Starter collection · exploratory concepts
        </span>
      )}
      <nav aria-label="Project sections" className="fp-project-tabs">
        {["overview", "canvas", "reviews", "decisions", "files"].map((t) => (
          <button
            key={t}
            onClick={() => go(project.id, t)}
            aria-current={tab === t ? "page" : undefined}
            className={`${tab === t ? "is-active" : ""} fp-tab-${t}`}
          >
            {label(t)}
          </button>
        ))}
      </nav>
      {tab === "overview" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-5">
            <div className={`${panel} p-6`}>
              <p className="mb-3 text-xs uppercase tracking-[.16em] text-[#9a7e66]">
                The brief
              </p>
              <h2 className="mb-3 text-xl font-semibold">
                What we’re here to make.
              </h2>
              <p className="whitespace-pre-wrap text-sm leading-7 text-[#71685f]">
                {project.brief ||
                  project.objective ||
                  "Add a clear objective to guide the next direction."}
              </p>
              <button
                className={`${button} mt-5`}
                data-onboarding="project-brief"
                onClick={() => {
                  setError("");
                  setEditRevision(project.revision ?? 0);
                  setModal("brief");
                }}
              >
                Edit brief
              </button>
            </div>
            <div className={`${panel} p-5`}>
              <div className="mb-4 flex justify-between">
                <h2 className="font-semibold">Latest concepts</h2>
                <button
                  className="flex items-center gap-2 text-xs text-[#760d24]"
                  onClick={() => go(project.id, "canvas")}
                >
                  Open canvas
                  <ArrowRight size={14} />
                </button>
              </div>
              {versions.length ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  {versions.slice(0, 3).map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        setFocusId(v.id);
                        go(project.id, "canvas");
                      }}
                      className="overflow-hidden rounded-lg border border-[#eee7de] text-left"
                    >
                      <div className="aspect-square">
                        <Picture row={v} />
                      </div>
                      <p className="p-3 text-xs font-medium">
                        {versionName(v)}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#81766b]">
                  Your saved concepts will appear here.
                </p>
              )}
            </div>
            <div className={`${panel} p-5`}>
              <h2 className="mb-4 font-semibold">Next tasks</h2>
              {tasks.filter((t) => t.status !== "done").length ? (
                tasks
                  .filter((t) => t.status !== "done")
                  .map((t) => (
                    <button
                      key={t.id}
                      className="flex w-full items-center gap-3 border-t border-[#eee9e3] py-3 text-left text-sm"
                      onClick={() =>
                        onNavigate(`/w/${workspaceId}/tasks?task=${t.id}`)
                      }
                    >
                      <span className="h-4 w-4 rounded border border-[#c5b8aa]" />
                      <span className="flex-1">{title(t)}</span>
                      <Badge>{label(t.status)}</Badge>
                    </button>
                  ))
              ) : (
                <p className="text-sm text-[#81766b]">
                  No open tasks linked to this project.
                </p>
              )}
            </div>
          </div>
          <aside className="space-y-5">
            <div className={`${panel} p-5`}>
              <h2 className="mb-4 font-semibold">Project details</h2>
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="mb-1 text-xs text-[#958574]">Lead</dt>
                  <dd>
                    {project.lead_id ? name(project.lead_id) : "Not assigned"}
                  </dd>
                </div>
                <div>
                  <dt className="mb-1 text-xs text-[#958574]">Category</dt>
                  <dd>
                    {label(project.type || project.category || "General")}
                  </dd>
                </div>
                <div>
                  <dt className="mb-1 text-xs text-[#958574]">Deliverables</dt>
                  <dd>
                    {Array.isArray(project.deliverables)
                      ? project.deliverables.join(", ")
                      : project.deliverables || "Not defined yet"}
                  </dd>
                </div>
              </dl>
            </div>
            <div className={`${panel} p-5`}>
              <h2 className="mb-3 font-semibold">Open reviews</h2>
              {rounds
                .filter((r) => roundState(r) === "open")
                .map((r) => (
                  <button
                    key={r.id}
                    className="flex w-full items-center justify-between border-t border-[#eee9e3] py-3 text-left text-sm"
                    onClick={() => {
                      setRoundId(r.id);
                      go(project.id, "reviews");
                    }}
                  >
                    {label(r.scope)}
                    <ChevronRight size={15} />
                  </button>
                ))}
              {!rounds.some((r) => roundState(r) === "open") && (
                <p className="text-sm text-[#81766b]">
                  No review rounds are open.
                </p>
              )}
            </div>
            <div className={`${panel} p-5`}>
              <h2 className="mb-3 font-semibold">Linked ideas</h2>
              {rows(data, "ideas")
                .filter(
                  (i) =>
                    i.id === project.idea_id ||
                    i.promoted_project_id === project.id,
                )
                .map((i) => (
                  <button
                    key={i.id}
                    className="block py-2 text-sm text-[#760d24]"
                    onClick={() =>
                      onNavigate(`/w/${workspaceId}/ideas/${i.id}`)
                    }
                  >
                    {title(i)} →
                  </button>
                ))}
              {!project.idea_id && (
                <p className="text-sm text-[#81766b]">
                  This project starts a new direction.
                </p>
              )}
            </div>
          </aside>
        </div>
      )}
      {tab === "canvas" && (
        <section className="fp-project-canvas" aria-label="Project canvas">
          <BoardModeSwitch mode={canvasMode} onChange={setCanvasMode} />
          {canvasMode === "board" ? (
            <CanvasBoard
              projectId={project.id}
              demo={demo}
              versions={canvasVersions}
              nodes={nodes}
              references={rows(data, "references")}
              files={rows(data, "files")}
              onMutate={onMutate}
            />
          ) : (
        <div className="fp-canvas-layout">
          <div className="fp-canvas-main">
            <div className="fp-mobile-canvas-toolbar">
              <details className="fp-mobile-workspace-menu">
                <summary>
                  <Users size={21} />
                  <span>
                    {demo
                      ? "Demo workspace"
                      : data.workspace?.name || "Workspace"}
                  </span>
                  <ChevronDown size={15} />
                </summary>
                <div>
                  <button
                    onClick={() => onNavigate(`/w/${workspaceId}/settings`)}
                  >
                    Team & settings
                  </button>
                  <button onClick={() => go(project.id, "decisions")}>
                    Project decisions
                  </button>
                  <button onClick={() => go(project.id, "files")}>
                    Project files
                  </button>
                </div>
              </details>
              <details className="fp-mobile-add-menu">
                <summary className={button}>
                  <Plus size={19} />
                  Add
                </summary>
                <div>
                  <button onClick={() => setModal("version")}>
                    New saved version
                  </button>
                  <button
                    onClick={() =>
                      onNavigate(
                        `/w/${workspaceId}/library?project=${project.id}&action=pin`,
                      )
                    }
                  >
                    Add Pin link
                  </button>
                  <button
                    onClick={() =>
                      onNavigate(
                        `/w/${workspaceId}/library?project=${project.id}&action=upload`,
                      )
                    }
                  >
                    Upload image
                  </button>
                  <button
                    data-onboarding="canvas-note"
                    onClick={() => {
                      setError("");
                      setModal("note");
                    }}
                  >
                    Canvas note
                  </button>
                </div>
              </details>
              <button
                className={button}
                disabled={canvasVersions.length < 2}
                onClick={() => {
                  if (selected.length < 2)
                    setSelected(canvasVersions.slice(0, 2).map((v) => v.id));
                  setModal("compare");
                }}
              >
                <Columns2 size={19} />
                Compare
              </button>
            </div>
            <div className="fp-canvas-toolbar fp-panel">
              <button
                className={button}
                onClick={() =>
                  onNavigate(
                    `/w/${workspaceId}/library?project=${project.id}&action=pin`,
                  )
                }
              >
                <Link2 size={18} />
                Add Pin link
              </button>
              <button
                className={button}
                onClick={() =>
                  onNavigate(
                    `/w/${workspaceId}/library?project=${project.id}&action=upload`,
                  )
                }
              >
                <Upload size={18} />
                Upload
              </button>
              <button
                className={button}
                data-guide-target="canvas-note"
                onClick={() => {
                  setError("");
                  setModal("note");
                }}
              >
                <StickyNote size={18} />
                Note
              </button>
              <button
                className={button}
                disabled={canvasVersions.length < 2}
                onClick={() => {
                  if (selected.length < 2)
                    setSelected(canvasVersions.slice(0, 2).map((v) => v.id));
                  setModal("compare");
                }}
              >
                <Columns2 size={18} />
                Compare{selected.length > 0 ? ` (${selected.length})` : ""}
              </button>
              <span className="fp-save-status">
                <Check size={14} />
                {busy
                  ? "Saving..."
                  : error
                    ? "Check unsaved changes"
                    : demo
                      ? "Demo changes saved"
                      : "All changes saved"}
              </span>
              <details className="fp-canvas-options">
                <summary aria-label="Canvas view options">
                  <MoreHorizontal size={20} />
                </summary>
                <div>
                  <button
                    className={button}
                    aria-label="Zoom out"
                    onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))}
                  >
                    <ZoomOut size={16} />
                  </button>
                  <button
                    className={button}
                    aria-label="Fit canvas"
                    onClick={() => setZoom(1)}
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    className={button}
                    aria-label="Zoom in"
                    onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}
                  >
                    <ZoomIn size={16} />
                  </button>
                  <button
                    className={button}
                    aria-label="Toggle canvas list view"
                    onClick={() => setView(view === "list" ? "grid" : "list")}
                  >
                    <List size={16} />
                  </button>
                </div>
              </details>
            </div>
            {canvasVersions.length ? (
              <div
                className={`fp-concept-grid ${view === "list" ? "is-list" : ""}`}
                style={{ zoom }}
              >
                {canvasVersions.map((v, index) => (
                  <Fragment key={v.id}>
                    <article
                      className={`fp-concept-card fp-panel ${selectedVersion?.id === v.id ? "is-focused" : ""} ${selected.includes(v.id) ? "is-selected" : ""}`}
                    >
                      <header>
                        <div>
                          <h2>
                            {title(v)}
                            <span className="fp-version-desktop">
                              {" "}
                              v{v.version_number || v.version || 1}
                            </span>
                          </h2>
                          <span className="fp-version-mobile">
                            Version {v.version_number || v.version || 1}
                          </span>
                          <span className="fp-concept-kind">
                            {v.provenance?.mockup_source_kind?.replace(
                              / sample$/,
                              "",
                            ) ||
                              (v.source_kind === "ai"
                                ? "AI concept"
                                : "Saved concept")}
                          </span>
                          <p>
                            {v.provenance?.proposed_kit
                              ? `Exploratory ${v.provenance.proposed_kit === "Common Form" ? "CF mark" : v.provenance.proposed_kit}`
                              : v.provenance?.source || "Saved source snapshot"}
                          </p>
                        </div>
                        <details className="fp-concept-menu">
                          <summary aria-label={`Actions for ${versionName(v)}`}>
                            <MoreHorizontal size={20} />
                          </summary>
                          <div>
                            <label>
                              <input
                                type="checkbox"
                                checked={selected.includes(v.id)}
                                onChange={() => choose(v.id)}
                                aria-label={`Select ${versionName(v)} for comparison`}
                              />
                              Select for comparison
                            </label>
                            <button onClick={() => setFocusId(v.id)}>
                              Use for color study
                            </button>
                            <button
                              disabled={!canManageReviews}
                              onClick={() => {
                                setFocusId(v.id);
                                setModal("request");
                              }}
                            >
                              Request review
                            </button>
                          </div>
                        </details>
                      </header>
                      <button
                        className="fp-concept-image"
                        onClick={() => {
                          setFocusId(v.id);
                          setAnnotation(null);
                          setModal("viewer");
                        }}
                        aria-label={`View ${versionName(v)}`}
                      >
                        <Picture row={v} />
                        {nodes
                          .filter(
                            (n) =>
                              n.kind === "annotation" && n.version_id === v.id,
                          )
                          .map((n, i) => (
                            <span
                              key={n.id}
                              title={n.body}
                              className="fp-annotation"
                              style={{
                                left: `${n.x * 100}%`,
                                top: `${n.y * 100}%`,
                              }}
                            >
                              {i + 1}
                            </span>
                          ))}
                        <span className="fp-expand-image">
                          <Expand size={16} />
                        </span>
                      </button>
                      {selectedVersion?.id === v.id && (
                        <>
                          <div
                            className="fp-concept-swatches"
                            role="radiogroup"
                            aria-label="Exploratory color"
                          >
                            {colors.map((c) => (
                              <button
                                key={c.hex}
                                role="radio"
                                aria-checked={color.hex === c.hex}
                                aria-label={`${c.name} ${c.hex}`}
                                title={`${c.name} ${c.hex}`}
                                onClick={() => setColor(c)}
                                className={
                                  color.hex === c.hex ? "is-selected" : ""
                                }
                                style={{ backgroundColor: c.hex }}
                              />
                            ))}
                          </div>
                          <div className="fp-mobile-concept-actions">
                            <button
                              className={button}
                              onClick={() => setShowColors(!showColors)}
                            >
                              <Palette size={21} />
                              Edit colors
                            </button>
                            <button
                              className={button}
                              onClick={() => requestVariation(v)}
                            >
                              <Sparkles size={21} />
                              Ask Studio AI
                            </button>
                          </div>
                        </>
                      )}
                    </article>
                    {index === 0 && (
                      <button
                        className="fp-mobile-founder-review fp-panel"
                        onClick={() => go(project.id, "reviews")}
                      >
                        <span>
                          <strong>Founder review</strong>
                          <small>
                            {round
                              ? `${rows(data, "reviews").filter((r) => r.round_id === round.id && r.status !== "draft" && r.state !== "draft").length} of ${(round.reviewers || round.reviewer_ids || round.required_reviewer_ids || []).length} submitted`
                              : "No round requested"}
                          </small>
                          <ChevronRight size={20} />
                        </span>
                        <span>
                          {members
                            .filter((m) => m.is_founder)
                            .map((m) => (
                              <Avatar
                                key={m.user_id || m.id}
                                userId={m.user_id || m.id}
                                name={m.display_name || m.name || "Member"}
                              />
                            ))}
                        </span>
                      </button>
                    )}
                  </Fragment>
                ))}
              </div>
            ) : (
              <Empty title="A blank canvas. A new direction.">
                Bring in references, add a note, or save your first concept
                version.
                <button
                  className={`${button} mt-4`}
                  onClick={() => setModal("version")}
                >
                  <Plus size={16} />
                  New concept version
                </button>
              </Empty>
            )}
            <div
              id="fp-color-variation"
              className={`fp-color-variation fp-panel ${showColors ? "is-open" : ""}`}
            >
              <h2>Color variation</h2>
              <div>
                <label>
                  <span>Target</span>
                  <select
                    aria-label="Edit target"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    {[
                      "wordmark",
                      "monogram",
                      "garment body",
                      "trim",
                      "bag body",
                      "hardware",
                      "background",
                    ].map((t) => (
                      <option key={t} value={t}>
                        {label(t)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="fp-color-select">
                  <span>Primary color</span>
                  <i style={{ backgroundColor: color.hex }} />
                  <select
                    aria-label="Primary color"
                    value={color.hex}
                    onChange={(e) =>
                      setColor(
                        colors.find((c) => c.hex === e.target.value) ||
                          colors[0],
                      )
                    }
                  >
                    {colors.map((c) => (
                      <option key={c.hex} value={c.hex}>
                        {c.name} {c.hex}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="fp-color-select fp-secondary-color">
                  <span>Secondary</span>
                  <i style={{ backgroundColor: secondaryColor.hex }} />
                  <select
                    aria-label="Secondary color"
                    value={secondaryColor.hex}
                    onChange={(e) =>
                      setSecondaryColor(
                        colors.find((c) => c.hex === e.target.value) ||
                          colors[4],
                      )
                    }
                  >
                    {colors.map((c) => (
                      <option key={c.hex} value={c.hex}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className={button}
                  disabled={!selectedVersion}
                  onClick={() => setModal("color-preview")}
                >
                  <Eye size={21} />
                  Preview
                </button>
                <button
                  className={primary}
                  disabled={!selectedVersion}
                  onClick={() => requestVariation()}
                >
                  <Sparkles size={21} />
                  Generate variation
                </button>
              </div>
            </div>

            {nodes.filter((n) => !n.version_id).length > 0 && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {nodes
                  .filter((n) => !n.version_id)
                  .map((n) => (
                    <article
                      key={n.id}
                      className="rounded-xl border border-[#e4d4b9] bg-[#fff8e9] p-5"
                    >
                      {n.reference_id || n.file_id ? (
                        <>
                          {(() => {
                            const asset = rows(data, n.file_id ? "files" : "references")
                              .find((r) => r.id === (n.file_id || n.reference_id));
                            return !demo && n.file_id && asset?.url?.startsWith("supabase-storage://workspace-media/") ? (
                              <div className="mb-3">
                                <MediaPlayer workspaceId={workspaceId} fileId={asset.id}
                                  userId={userId} addedBy={asset.added_by} title={title(asset)} compact />
                              </div>
                            ) : (
                              <div className="mb-3 h-32 overflow-hidden rounded-lg">
                                <Picture row={asset} />
                              </div>
                            );
                          })()}
                          <button
                            className="text-sm font-semibold text-[#760d24]"
                            onClick={() =>
                              onNavigate(
                                `/w/${workspaceId}/library?asset=${n.file_id || n.reference_id}`,
                              )
                            }
                          >
                            {title(
                              rows(
                                data,
                                n.file_id ? "files" : "references",
                              ).find(
                                (r) => r.id === (n.file_id || n.reference_id),
                              ),
                            )}{" "}
                            →
                          </button>
                        </>
                      ) : (
                        <StickyNote size={17} className="mb-3 text-[#9a7c48]" />
                      )}
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                        {n.body || n.text || "Linked reference"}
                      </p>
                    </article>
                  ))}
              </div>
            )}

            <div className="fp-canvas-additions">
              <button
                className={button}
                onClick={() => {
                  setError("");
                  setModal("version");
                }}
              >
                <Plus size={16} />
                New saved version
              </button>
              <button
                className={button}
                onClick={() =>
                  onNavigate(`/w/${workspaceId}/library?project=${project.id}`)
                }
              >
                Add saved draft from Library
              </button>
            </div>
          </div>
          <aside className="fp-canvas-aside">
            <div className="fp-panel fp-canvas-ai">
              <h2>
                <Sparkles size={24} />
                Studio AI
              </h2>
              <textarea
                className="fp-ai-prompt"
                rows={3}
                aria-label="Variation instructions"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              <div className="fp-ai-context">
                <span>
                  {selectedVersion
                    ? versionName(selectedVersion)
                    : "Select a concept"}
                </span>
                <span>{label(target)}</span>
              </div>
              <button
                className={button}
                onClick={() => {
                  setShowColors(true);
                  document
                    .getElementById("fp-color-variation")
                    ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                }}
              >
                <Palette size={22} />
                Edit colors
              </button>
              <button
                className={button}
                disabled={!selectedVersion}
                onClick={() => requestVariation()}
              >
                <Sparkles size={22} />
                Explore alternatives
              </button>
              <button
                className={button}
                disabled={!selectedVersion}
                onClick={() =>
                  requestVariation(
                    selectedVersion,
                    "garment body",
                    "Explore this design on apparel. " + prompt,
                  )
                }
              >
                <Shirt size={22} />
                Show on apparel
              </button>
              <p className="fp-ai-output-label">AI output</p>
              <div className="fp-ai-output">
                <Sparkles size={22} />
                <p>
                  Results will appear in Studio AI after you request a
                  variation.
                </p>
              </div>
              <p className="fp-color-disclaimer">
                Exploratory screen colors. Swatches do not edit the original
                image.
              </p>
            </div>
            <div className="fp-panel fp-team-review">
              <h2>Team review</h2>
              {members.map((m) => {
                const id = m.user_id || m.id;
                const response = round
                  ? rows(data, "reviews").find(
                      (r) =>
                        r.round_id === round.id &&
                        r.reviewer_id === id &&
                        r.status !== "draft" &&
                        r.state !== "draft",
                    )
                  : null;
                return (
                  <div key={id} className="fp-team-member">
                    <Avatar name={m.display_name || m.name || "Member"} userId={m.user_id || m.id} />
                    <span>
                      <strong>
                        {m.display_name || m.name || "Workspace member"}
                      </strong>
                      <small>
                        {response
                          ? label(response.disposition)
                          : round
                            ? "Not reviewed"
                            : "No round requested"}
                      </small>
                    </span>
                    <MoreHorizontal size={17} aria-hidden="true" />
                  </div>
                );
              })}
              <button
                className={`${primary} fp-request-review`}
                disabled={!selectedVersion || !canManageReviews}
                onClick={() => setModal("request")}
              >
                <MessageSquare size={21} />
                Request review
              </button>
            </div>
          </aside>
        </div>
          )}
        </section>
      )}
      {tab === "reviews" &&
        (round ? (
          <>
            <div
              className={`fp-review-round-picker ${rounds.length === 1 ? "is-single" : ""}`}
            >
              <p className="text-sm text-[#877a6d]">
                Review an exact version. Ratings and approval are separate.
              </p>
              <select
                aria-label="Review round"
                className={`${input} !w-auto`}
                value={round.id}
                onChange={(e) => setRoundId(e.target.value)}
              >
                {rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {label(r.scope)} · {roundState(r)} ·{" "}
                    {String(r.id).slice(-6)}
                  </option>
                ))}
              </select>
            </div>
            <ReviewPanel
              key={round.id}
              round={round}
              version={reviewedVersion}
              data={data}
              userId={userId}
              name={name}
              busy={busy}
              demo={demo}
              onSubmit={(payload) => act("submitReview", payload, false)}
              onDecision={(outcome) => {
                setDecisionOutcome(outcome);
                setEditRevision(round.revision ?? 0);
                setError("");
                setModal("decision");
              }}
              compareAvailable={versions.length >= 2}
              onCompare={() => {
                setSelected(versions.slice(0, 4).map((v) => v.id));
                setModal("compare");
              }}
            />
          </>
        ) : (
          <Empty
            title={
              roundId
                ? "Review round unavailable"
                : "Ready for a fresh perspective?"
            }
          >
            Choose a saved concept on the canvas and request a scoped review
            from your team.
            <button
              onClick={() => go(project.id, "canvas")}
              className={`${button} mt-4`}
            >
              Open canvas
              <ArrowRight size={15} />
            </button>
          </Empty>
        ))}
      {tab === "decisions" && (
        <div className="space-y-4">
          <div className={`${panel} !bg-[#f8f3ec] p-5`}>
            <h2 className="flex items-center gap-2 font-semibold">
              <ShieldCheck size={20} className="text-[#760d24]" />A clear record
              of what you decided.
            </h2>
            <p className="mt-2 text-sm text-[#877a6d]">
              Decisions retain their exact version and approval evidence. A new
              direction requires a new review.
            </p>
          </div>
          {decisions.length ? (
            decisions.map((d) => (
              <article
                key={d.id}
                id={`decision-${d.id}`}
                data-onboarding="decision-evidence"
                tabIndex={-1}
                className={`${panel} p-5`}
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <h3 className="font-semibold">
                    {label(d.scope || "Design direction")}{" "}
                    <Badge>{label(d.result || d.outcome || "Approved")}</Badge>
                  </h3>
                  <span className="text-xs text-[#877a6d]">
                    {formatDate(d.created_at)}
                  </span>
                </div>
                <p className="my-3 text-sm leading-relaxed">{d.rationale}</p>
                <p className="text-xs text-[#877a6d]">
                  Version:{" "}
                  {d.version_id ||
                    d.snapshot?.version_id ||
                    "See review snapshot"}{" "}
                  · Recorded by {name(d.actor_id || d.created_by)}
                </p>
                <details className="mt-4 rounded-lg bg-[#faf7f2] p-3 text-xs">
                  <summary className="cursor-pointer font-medium">
                    Immutable review evidence
                  </summary>
                  <p className="mt-2 break-all">Round: {d.round_id}</p>
                  {(d.evidence?.reviews || d.reviews || []).map((r: Row) => (
                    <p key={r.id || r.reviewer_id} className="mt-2">
                      {name(r.reviewer_id)} · {label(r.disposition)} · response{" "}
                      {r.id || "retained in snapshot"}
                    </p>
                  ))}
                </details>
                {supersessions
                  .filter(
                    (link) =>
                      link.prior_decision_id === d.id ||
                      link.replacement_decision_id === d.id,
                  )
                  .map((link) => (
                    <div
                      key={link.id}
                      className="mt-3 rounded-lg border border-[#e4d9c9] bg-[#fffaf2] p-3 text-xs"
                    >
                      {link.prior_decision_id === d.id ? (
                        <>
                          <strong>
                            {link.replacement_decision_id
                              ? "Superseded by a newer approved decision"
                              : projectReplacementState(link, allRounds) ===
                                  "closed_without_approval"
                                ? "Replacement review closed without approval"
                                : "Replacement review in progress"}
                          </strong>
                          <p className="mt-1">
                            {link.replacement_decision_id
                              ? "This historical decision remains unchanged."
                              : "This prior decision remains unchanged. Only a policy-approved replacement can supersede it."}
                          </p>
                          {link.replacement_decision_id ? (
                            <a
                              className="mt-2 inline-block text-[#760d24] underline"
                              href={`#decision-${link.replacement_decision_id}`}
                            >
                              View replacement decision
                            </a>
                          ) : (
                            <button
                              className="mt-2 text-[#760d24] underline"
                              onClick={() =>
                                onNavigate(
                                  `/w/${workspaceId}/projects/${project.id}/reviews?round=${link.round_id}`,
                                )
                              }
                            >
                              Open replacement review
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <strong>Supersedes prior decision</strong>
                          <p className="mt-1">
                            <a
                              className="text-[#760d24] underline"
                              href={`#decision-${link.prior_decision_id}`}
                            >
                              {link.prior_decision_id}
                            </a>
                          </p>
                        </>
                      )}
                    </div>
                  ))}
                {data.role === "owner" && (
                  <button
                    className={`${button} mr-2 mt-4`}
                    disabled={supersessions.some(
                      (link) =>
                        link.prior_decision_id === d.id &&
                        projectReplacementState(link, allRounds) !==
                          "closed_without_approval",
                    )}
                    onClick={() => {
                      setSupersededDecision(d);
                      setReplacementPolicy(
                        data.workspace?.review_policy?.policy ||
                          data.workspace?.review_policy?.mode ||
                          "unanimous",
                      );
                      setError("");
                      setModal("supersede");
                    }}
                  >
                    Start replacement review
                  </button>
                )}
                <button
                  className={`${button} mt-4`}
                  onClick={() => {
                    const blob = new Blob(
                      [
                        JSON.stringify(
                          {
                            ...d,
                            supersessions: supersessions.filter(
                              (link) =>
                                link.prior_decision_id === d.id ||
                                link.replacement_decision_id === d.id,
                            ),
                            source_url: `${window.location.origin}/w/${workspaceId}/projects/${project.id}/decisions`,
                          },
                          null,
                          2,
                        ),
                      ],
                      { type: "application/json" },
                    );
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `decision-${d.id}.json`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  <Download size={15} />
                  Export decision
                </button>
              </article>
            ))
          ) : (
            <Empty title="No recorded decisions yet">
              Completed review rounds lead here. A project phase or star rating
              never counts as an approval.
            </Empty>
          )}
        </div>
      )}
      {tab === "files" && (
        <div className="space-y-4">
          <div className="flex justify-between">
            <h2 className="font-semibold">Project files</h2>
            <button
              className={button}
              data-onboarding="files-library-link"
              onClick={() =>
                onNavigate(
                  `/w/${workspaceId}/library?project=${project.id}&action=upload`,
                )
              }
            >
              <Upload size={16} />
              Upload
            </button>
          </div>
          {projectFiles.length ? (
            <div className={`${panel} overflow-x-auto`}>
              <table className="w-full text-left text-sm">
                <thead className="bg-[#faf7f3] text-xs text-[#877a6d]">
                  <tr>
                    {[
                      "Name",
                      "Source",
                      "Version",
                      "Added by",
                      "Modified",
                      "",
                    ].map((t, i) => (
                      <th key={i} className="p-4 font-medium">
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {projectFiles.map((f) => (
                    <tr key={f.id} className="border-t border-[#eee9e3]">
                      <td className="p-4 font-medium">
                        {f.name || f.title || f.filename}
                      </td>
                      <td className="p-4">{label(f.source || "upload")}</td>
                      <td className="p-4">{f.version_number || "Original"}</td>
                      <td className="p-4">
                        {name(f.added_by || f.uploaded_by || f.author_id)}
                      </td>
                      <td className="p-4">
                        {formatDate(f.updated_at || f.created_at)}
                      </td>
                      <td className="p-4">
                        <button
                          className={button}
                          onClick={() =>
                            onNavigate(
                              `/w/${workspaceId}/library?asset=${f.id}`,
                            )
                          }
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Keep your work together">
              No files are linked to this project yet. Library keeps the
              original asset and its provenance.
            </Empty>
          )}
        </div>
      )}
      {modal === "brief" && (
        <Modal heading="Edit project details" onClose={() => setModal("")}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act("updateProject", {
                id: project.id,
                expected_revision: editRevision,
                title: f.get("title"),
                brief: f.get("brief"),
                category: f.get("category"),
                lead_id: f.get("lead_id"),
              });
            }}
          >
            <Field text="Project title">
              <input
                name="title"
                defaultValue={title(project)}
                required
                className={input}
              />
            </Field>
            <Field text="Creative brief">
              <textarea
                name="brief"
                defaultValue={project.brief || project.objective || ""}
                rows={7}
                required
                className={input}
              />
            </Field>
            <Field text="Category">
              <input
                name="category"
                defaultValue={project.category || project.type || "General"}
                required
                className={input}
              />
            </Field>
            <Field text="Lead">
              <select
                name="lead_id"
                defaultValue={project.lead_id || userId}
                className={input}
              >
                {members.map((m) => (
                  <option key={m.user_id || m.id} value={m.user_id || m.id}>
                    {m.display_name || m.name || "Workspace member"}
                  </option>
                ))}
              </select>
            </Field>
            <p className="text-xs text-[#877a6d]">
              Revision {editRevision}. If someone changes the brief while you
              edit, saving pauses so you can merge deliberately.
            </p>
            {error && (
              <div
                role="alert"
                className="rounded-lg bg-[#fff1ee] p-3 text-sm text-red-800"
              >
                <p>{error}</p>
                <p className="mt-3 font-medium">Current workspace brief</p>
                <p className="mt-1 whitespace-pre-wrap">
                  {project.brief || project.objective || "No brief"}
                </p>
                <p className="mt-2">
                  Your unsaved text stays above. Compare both versions before
                  trying again.
                </p>
                {editRevision !== (project.revision ?? 0) && (
                  <button
                    type="button"
                    className={`${button} mt-3`}
                    onClick={() => {
                      setEditRevision(project.revision ?? 0);
                      setError("");
                    }}
                  >
                    I’ve merged my text; use current revision
                  </button>
                )}
              </div>
            )}
            <button className={primary} disabled={busy}>
              {busy ? "Saving…" : "Save details"}
            </button>
          </form>
        </Modal>
      )}
      {modal === "kit" && (
        <Modal heading="Pin a brand kit version" onClose={() => setModal("")}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void act("updateProject", {
                id: project.id,
                expected_revision: editRevision,
                kit_id: selectedKitId || null,
              });
            }}
          >
            <p className="text-sm leading-relaxed text-[#877a6d]">
              Projects keep their pinned snapshot when the workspace publishes a
              newer kit. Applying a different kit changes future project
              guidance; existing concept versions remain unchanged.
            </p>
            <Field text="Kit version">
              <select
                className={input}
                value={selectedKitId}
                onChange={(e) => setSelectedKitId(e.target.value)}
              >
                <option value="">None selected</option>
                {rows(data, "kits").map((k) => (
                  <option key={k.id} value={k.id}>
                    {title(k)} · {formatDate(k.created_at)} · {k.id.slice(-6)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="rounded-lg bg-[#f7f3ed] p-4">
              <h3 className="mb-3 text-sm font-semibold">
                Changes to project guidance
              </h3>
              {[
                "name",
                "wordmark",
                "monogram",
                "palette",
                "typography",
                "guidelines",
                "logo",
              ].map((scope) => {
                const oldKit = rows(data, "kits").find(
                  (k) => k.id === (project.kit_id || project.kit_version_id),
                );
                const nextKit = rows(data, "kits").find(
                  (k) => k.id === selectedKitId,
                );
                const oldValue = oldKit?.components?.[scope];
                const newValue = nextKit?.components?.[scope];
                if (JSON.stringify(oldValue) === JSON.stringify(newValue))
                  return null;
                return (
                  <div
                    key={scope}
                    className="border-t border-[#e4ded5] py-2 text-xs"
                  >
                    <strong>{label(scope)}</strong>
                    <p className="mt-1 break-all text-[#877a6d]">
                      {oldValue ? JSON.stringify(oldValue) : "Not selected"} →{" "}
                      {newValue ? JSON.stringify(newValue) : "Not selected"}
                    </p>
                  </div>
                );
              })}
              {selectedKitId ===
                (project.kit_id || project.kit_version_id || "") && (
                <p className="text-xs text-[#877a6d]">No change selected.</p>
              )}
            </div>
            {!rows(data, "kits").length && (
              <p className="text-sm text-[#877a6d]">
                No published kit snapshots are available yet. Approve the
                required components in Brand Kit first.
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-red-800">
                {error}
              </p>
            )}
            <button
              className={primary}
              disabled={
                busy ||
                selectedKitId ===
                  (project.kit_id || project.kit_version_id || "")
              }
            >
              {busy ? "Applying…" : "Apply to project"}
            </button>
            {error && editRevision !== (project.revision ?? 0) && (
              <button
                type="button"
                className={button}
                onClick={() => {
                  setEditRevision(project.revision ?? 0);
                  setError("");
                }}
              >
                I’ve reviewed the changes; use current revision
              </button>
            )}
          </form>
        </Modal>
      )}
      {modal === "note" && (
        <Modal heading="Add a canvas note" onClose={() => setModal("")}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act("saveCanvas", {
                project_id: project.id,
                body: f.get("body"),
                x: 40,
                y: nodes.length * 160,
                width: 280,
                height: 160,
                expected_revision: 0,
              });
            }}
            className="space-y-4"
          >
            <textarea
              name="body"
              required
              autoFocus
              rows={5}
              placeholder="What should we keep in mind?"
              className={input}
            />
            {error && (
              <p role="alert" className="text-sm text-red-800">
                {error}
              </p>
            )}
            <button className={primary} disabled={busy}>
              {busy ? "Saving…" : "Add note"}
            </button>
          </form>
        </Modal>
      )}
      {modal === "version" && (
        <Modal
          heading="Save a new concept version"
          onClose={() => setModal("")}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act("createVersion", {
                project_id: project.id,
                title: f.get("title"),
                body: f.get("body"),
                ...(f.get("parent_id")
                  ? { parent_id: f.get("parent_id") }
                  : {}),
                ...(f.get("file_id") ? { file_id: f.get("file_id") } : {}),
              });
            }}
          >
            <p className="text-sm text-[#877a6d]">
              A new immutable concept, optionally linked to an owned Library
              file. Existing versions, image binaries, and reviews remain
              unchanged.
            </p>
            <Field text="Concept title">
              <input name="title" required className={input} />
            </Field>
            <Field text="Concept description">
              <textarea name="body" required rows={5} className={input} />
            </Field>
            <Field text="Library image (optional)">
              <select className={input} name="file_id">
                <option value="">Text concept only</option>
                {rows(data, "files")
                  .filter(
                    (f) =>
                      !f.archived_at &&
                      f.permission_scope === "workspace" &&
                      /^(supabase-storage:\/\/workspace-media\/|blob:\/\/workspace-assets\/)/.test(
                        f.url || "",
                      ) && /\.(avif|gif|jpe?g|png|webp)$/i.test(f.url || ""),
                  )
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.title || f.name || f.filename || "Owned file"}
                    </option>
                  ))}
              </select>
            </Field>
            <p className="text-sm text-[#877a6d]">Video and audio can be linked to the canvas as references. Concept version images use JPG, PNG, WebP, GIF or AVIF.</p>
            <Field text="Based on">
              <select className={input} name="parent_id">
                <option value="">New direction</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {versionName(v)}
                  </option>
                ))}
              </select>
            </Field>
            {error && (
              <p role="alert" className="text-sm text-red-800">
                {error}
              </p>
            )}
            <button className={primary} disabled={busy}>
              {busy ? "Saving…" : "Save version"}
            </button>
          </form>
        </Modal>
      )}
      {modal === "request" && selectedVersion && (
        <Modal
          heading="Request an exact-version review"
          onClose={() => setModal("")}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const reviewers = f.getAll("reviewers");
              if (!reviewers.length) {
                setError("Choose at least one reviewer.");
                return;
              }
              void act("openReview", {
                project_id: project.id,
                version_id: selectedVersion.id,
                scope: f.get("scope"),
                reviewers,
              });
            }}
          >
            <div className="rounded-lg bg-[#f4ede1] p-4">
              <p className="font-medium">{versionName(selectedVersion)}</p>
              <p className="mt-1 break-all text-xs text-[#877a6d]">
                {selectedVersion.id}
              </p>
            </div>
            <Field text="Approval scope">
              <select className={input} name="scope">
                {[
                  "concept",
                  "name",
                  "wordmark",
                  "monogram",
                  "palette",
                  "typography",
                  "guidelines",
                ].map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">
                Required reviewers
              </legend>
              {members.map((m) => (
                <label
                  key={m.user_id || m.id}
                  className="flex min-h-11 items-center gap-3"
                >
                  <input
                    type="checkbox"
                    name="reviewers"
                    value={m.user_id || m.id}
                    defaultChecked
                    className="h-4 w-4 accent-[#760d24]"
                  />
                  {m.display_name || m.name || "Workspace member"}
                </label>
              ))}
            </fieldset>
            <p className="rounded-lg bg-[#f7f3ed] p-3 text-xs leading-relaxed text-[#877a6d]">
              {(data.workspace?.review_policy?.mode ||
                data.workspace?.review_policy?.policy) === "threshold"
                ? `Threshold approval: ${data.workspace.review_policy.threshold} approvals required. All assigned reviewers must respond; any requested changes block approval.`
                : "Unanimous approval: every selected reviewer must explicitly approve this version and scope. Abstentions and requested changes block approval."}{" "}
              Ratings never determine approval. The workspace’s current rule and
              selected reviewers are frozen when the round opens.
            </p>
            {error && (
              <p role="alert" className="text-sm text-red-800">
                {error}
              </p>
            )}
            <button className={`${primary} w-full`} disabled={busy}>
              {busy ? "Opening…" : "Open review round"}
            </button>
          </form>
        </Modal>
      )}
      {modal === "compare" && (
        <Modal
          heading="Compare immutable versions"
          wide
          onClose={() => setModal("")}
        >
          <p className="mb-4 text-sm text-[#877a6d]">
            Compare the saved source versions. This selection does not approve
            either direction.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {versions
              .filter((v) => selected.includes(v.id))
              .map((v) => (
                <div key={v.id} className={panel}>
                  <h3 className="sticky top-0 bg-white p-4 font-semibold">
                    {versionName(v)}
                  </h3>
                  <div className="h-96 overflow-hidden">
                    <Picture row={v} />
                  </div>
                  <p className="p-4 text-sm text-[#877a6d]">
                    {v.body || v.description || "Saved concept"}
                  </p>
                  <p className="break-all px-4 pb-4 text-[10px] text-[#877a6d]">
                    Version ID: {v.id}
                  </p>
                </div>
              ))}
          </div>
        </Modal>
      )}
      {modal === "viewer" && selectedVersion && (
        <Modal
          heading={versionName(selectedVersion)}
          wide
          onClose={() => {
            setModal("");
            setAnnotating(false);
            setAnnotation(null);
          }}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="break-all text-xs text-[#877a6d]">
              Exact version: {selectedVersion.id}
            </span>
            <button
              className={button}
              disabled={!imageUrl(selectedVersion)}
              onClick={() => setAnnotating((a) => !a)}
            >
              <MessageSquare size={15} />
              {annotating ? "Cancel annotation" : "Place annotation"}
            </button>
          </div>
          <div
            className={`relative mx-auto w-fit max-w-full ${annotating ? "cursor-crosshair" : ""}`}
            onClick={(e) => {
              if (!annotating) return;
              const bounds = e.currentTarget.getBoundingClientRect();
              setAnnotation({
                x: Math.max(
                  0,
                  Math.min(1, (e.clientX - bounds.left) / bounds.width),
                ),
                y: Math.max(
                  0,
                  Math.min(1, (e.clientY - bounds.top) / bounds.height),
                ),
              });
            }}
          >
            {imageUrl(selectedVersion) ? (
              <img
                src={imageUrl(selectedVersion)}
                alt={title(selectedVersion)}
                className="max-h-[65dvh] max-w-full rounded-lg object-contain"
              />
            ) : (
              <div className="max-w-xl rounded-lg bg-[#f4ede1] p-10">
                <h3 className="mb-4 text-xl font-semibold">
                  {title(selectedVersion)}
                </h3>
                <p className="whitespace-pre-wrap">{selectedVersion.body}</p>
              </div>
            )}
            {nodes
              .filter(
                (n) =>
                  n.kind === "annotation" &&
                  n.version_id === selectedVersion.id,
              )
              .map((n, i) => (
                <span
                  key={n.id}
                  title={n.body}
                  aria-label={`Annotation ${i + 1}: ${n.body}`}
                  className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[#760d24] text-xs text-white"
                  style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%` }}
                >
                  {i + 1}
                </span>
              ))}
            {annotation && (
              <span
                className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[#760d24] text-xs text-white"
                style={{
                  left: `${annotation.x * 100}%`,
                  top: `${annotation.y * 100}%`,
                }}
              >
                1
              </span>
            )}
          </div>
          {annotating && !annotation && (
            <button
              className={`${button} mt-3`}
              onClick={() => setAnnotation({ x: 0.5, y: 0.5 })}
            >
              Place at center using keyboard
            </button>
          )}
          {annotation && (
            <form
              key={`${annotation.x}:${annotation.y}`}
              className="mt-4 space-y-3 rounded-lg border border-[#e6d1b4] bg-[#fff7e8] p-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const saved = await act(
                  "saveCanvas",
                  {
                    project_id: project.id,
                    version_id: selectedVersion.id,
                    kind: "annotation",
                    body: f.get("body"),
                    x: Number(f.get("x")),
                    y: Number(f.get("y")),
                    width: 280,
                    height: 160,
                    expected_revision: 0,
                  },
                  false,
                );
                if (saved) {
                  setAnnotation(null);
                  setAnnotating(false);
                }
              }}
            >
              <p className="text-sm font-medium">
                Pin a comment to this exact image version
              </p>
              <div className="flex gap-3">
                <Field text="Horizontal position (0–1)">
                  <input
                    name="x"
                    className={input}
                    type="number"
                    min="0"
                    max="1"
                    step="0.001"
                    defaultValue={annotation.x.toFixed(3)}
                    required
                  />
                </Field>
                <Field text="Vertical position (0–1)">
                  <input
                    name="y"
                    className={input}
                    type="number"
                    min="0"
                    max="1"
                    step="0.001"
                    defaultValue={annotation.y.toFixed(3)}
                    required
                  />
                </Field>
              </div>
              <textarea
                name="body"
                required
                maxLength={3000}
                rows={3}
                className={input}
                placeholder="What should change here?"
              />
              {error && (
                <p role="alert" className="text-sm text-red-800">
                  {error}
                </p>
              )}
              <button disabled={busy} className={primary}>
                {busy ? "Saving…" : "Save annotation"}
              </button>
            </form>
          )}
          {nodes
            .filter(
              (n) =>
                n.kind === "annotation" && n.version_id === selectedVersion.id,
            )
            .map((n, i) => (
              <div
                key={n.id}
                className="mt-3 rounded-lg border border-[#e6e2dd] p-3 text-sm"
              >
                <strong className="mr-2 text-[#760d24]">{i + 1}</strong>
                {n.body}
              </div>
            ))}
        </Modal>
      )}
      {modal === "generation-source" && (
        <Modal
          heading="Use this concept for an image edit"
          onClose={() => setModal("")}
        >
          <p className="text-sm leading-6">
            This starter concept is available to view, compare, annotate, and
            review. Image editing needs an uploaded source image in your
            workspace, so the edit is linked to a stored file you control.
          </p>
          <p className="mt-3 text-sm leading-6">
            {demo
              ? "Open a live workspace and upload the source image to generate a new variation."
              : "Upload the source image to the Library, save it as a concept version, and choose that version for your variation."}
          </p>
          <button
            className={`${primary} mt-5`}
            onClick={() =>
              onNavigate(
                `/w/${workspaceId}/library?project=${project.id}&action=upload`,
              )
            }
          >
            <Upload size={17} />
            Upload source image
          </button>
        </Modal>
      )}
      {modal === "color-preview" && selectedVersion && (
        <Modal heading="Color variation preview" onClose={() => setModal("")}>
          <div className="fp-preview-source">
            <Picture row={selectedVersion} />
          </div>
          <p className="mt-4 text-sm">
            Source: {versionName(selectedVersion)}. Target: {label(target)}.
          </p>
          <div className="fp-preview-colors">
            <span style={{ background: color.hex }} />
            <span style={{ background: secondaryColor.hex }} />
            <p>
              {color.name} with {secondaryColor.name}
            </p>
          </div>
          <p className="mt-3 text-xs text-[#6b6b7a]">
            This previews your selected source and palette. Generate a variation
            to create a new exploratory image; the original stays unchanged.
          </p>
          <button
            className={`${primary} mt-4`}
            onClick={() => {
              setModal("");
              requestVariation();
            }}
          >
            <Sparkles size={18} />
            Generate variation
          </button>
        </Modal>
      )}
      {modal === "supersede" && data.role === "owner" && supersededDecision && (
        <Modal
          heading="Start a replacement review"
          onClose={() => setModal("")}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const reviewers = f.getAll("reviewers");
              if (!reviewers.length) {
                setError("Choose at least one reviewer.");
                return;
              }
              void act("supersedeDecision", {
                decision_id: supersededDecision.id,
                version_id: f.get("version_id"),
                reviewers,
                policy: replacementPolicy,
                ...(replacementPolicy === "threshold"
                  ? { threshold: Number(f.get("threshold")) }
                  : {}),
                rationale: f.get("rationale"),
              });
            }}
          >
            <div className="rounded-lg bg-[#f4ede1] p-4 text-sm">
              <strong>
                Prior decision: {label(supersededDecision.scope)} ·{" "}
                {label(supersededDecision.outcome || "approved")}
              </strong>
              <p className="mt-2 text-xs leading-relaxed text-[#877a6d]">
                This opens a fresh review with no carried-over votes. The old
                decision and its evidence remain immutable. Only a new
                policy-approved decision can complete the supersession link;
                rejection or deferral does not replace the prior decision.
              </p>
            </div>
            <Field text="Replacement concept version">
              <select
                name="version_id"
                required
                className={input}
                defaultValue=""
              >
                <option value="" disabled>
                  Select a saved version
                </option>
                {versions
                  .filter((v) => v.project_id === project.id)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {versionName(v)} · {v.id.slice(-6)}
                    </option>
                  ))}
              </select>
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">
                Required reviewers
              </legend>
              {members.map((m) => (
                <label
                  key={m.user_id || m.id}
                  className="flex min-h-11 items-center gap-3 text-sm"
                >
                  <input
                    type="checkbox"
                    name="reviewers"
                    value={m.user_id || m.id}
                    defaultChecked
                    className="h-4 w-4 accent-[#760d24]"
                  />
                  {m.display_name || m.name || "Workspace member"}
                </label>
              ))}
            </fieldset>
            <Field text="Frozen review policy">
              <select
                className={input}
                value={replacementPolicy}
                onChange={(e) => setReplacementPolicy(e.target.value)}
              >
                <option value="unanimous">Unanimous approval</option>
                <option value="threshold">Approval threshold</option>
              </select>
            </Field>
            {replacementPolicy === "threshold" && (
              <Field text="Approvals required">
                <input
                  className={input}
                  type="number"
                  name="threshold"
                  min={1}
                  max={members.length}
                  defaultValue={data.workspace?.review_policy?.threshold || 1}
                  required
                />
              </Field>
            )}
            <p className="text-xs text-[#877a6d]">
              All assigned reviewers must respond. Any request for changes
              blocks approval. Under unanimous approval, abstentions also block;
              threshold approval requires the selected number of approvals.
            </p>
            <Field text="Why is a replacement needed?">
              <textarea
                required
                name="rationale"
                maxLength={3000}
                rows={4}
                className={input}
              />
            </Field>
            {error && (
              <p role="alert" className="text-sm text-red-800">
                {error}
              </p>
            )}
            <button className={`${primary} w-full`} disabled={busy}>
              {busy ? "Opening fresh review…" : "Open replacement review"}
            </button>
          </form>
        </Modal>
      )}
      {modal === "decision" &&
        round &&
        (decisionOutcome === "approve" || data.role === "owner") && (
          <Modal heading="Record the decision" onClose={() => setModal("")}>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(
                  decisionOutcome === "approve"
                    ? "recordDecision"
                    : decisionOutcome === "reject"
                      ? "rejectDecision"
                      : "deferDecision",
                  {
                    round_id: round.id,
                    rationale: f.get("rationale"),
                    ...(decisionOutcome === "approve"
                      ? {}
                      : { expected_revision: editRevision }),
                  },
                );
              }}
            >
              <div className="rounded-lg bg-[#f4ede1] p-4">
                <p className="font-semibold">{versionName(reviewedVersion)}</p>
                <p className="mt-2 text-sm">
                  Scope: {label(round.scope)} · Result: {label(decisionOutcome)}
                </p>
                <p className="mt-2 text-xs text-[#877a6d]">
                  {decisionOutcome === "approve"
                    ? "The server rechecks the frozen approval policy before recording an immutable approval and closing this round."
                    : decisionOutcome === "reject"
                      ? "Rejecting records this exact version as rejected and closes the round. Every assigned reviewer must have submitted, with at least one request for changes. Their original responses remain unchanged."
                      : "Deferring closes this round without approving or rejecting the design. Your rationale and the current responses, including pending reviewers, are retained. Further review requires a new round."}
                </p>
              </div>
              <div className="rounded-lg border border-[#e6e2dd] p-3 text-xs">
                <h3 className="font-semibold">Required reviewer evidence</h3>
                {(round.reviewers || round.reviewer_ids || []).map(
                  (id: string) => {
                    const r = rows(data, "reviews").find(
                      (r) =>
                        r.round_id === round.id &&
                        r.reviewer_id === id &&
                        r.state !== "draft" &&
                        r.status !== "draft",
                    );
                    return (
                      <p key={id} className="mt-2">
                        {name(id)} · {r ? label(r.disposition) : "Pending"}
                        {r?.id ? ` · response ${r.id}` : ""}
                      </p>
                    );
                  },
                )}
              </div>
              <Field text="Decision rationale">
                <textarea
                  name="rationale"
                  required
                  rows={4}
                  className={input}
                />
              </Field>
              {error && (
                <p role="alert" className="text-sm text-red-800">
                  {error}
                </p>
              )}
              <button disabled={busy} className={`${primary} w-full`}>
                {busy
                  ? "Recording…"
                  : decisionOutcome === "approve"
                    ? "Record approval"
                    : decisionOutcome === "reject"
                      ? "Record rejection"
                      : "Defer and close round"}
              </button>
            </form>
          </Modal>
        )}
    </section>
  );
}
function Field({ text, children }: { text: string; children: ReactNode }) {
  return (
    <label className="my-3 block">
      <span className="mb-1.5 block text-xs font-medium text-[#766a5f]">
        {text}
      </span>
      {children}
    </label>
  );
}
function Avatar({ name, userId }: { name: string; userId?: string }) {
  return <ProfileAvatar name={name} userId={userId} className={`fp-avatar fp-avatar-${name?.startsWith("J") ? 1 : (name?.charCodeAt(0) || 0) % 3} flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f0e4de] text-sm font-semibold text-[#760d24]`} />;
}

function ReviewPanel({
  round,
  version,
  data,
  userId,
  name,
  busy,
  demo,
  onSubmit,
  onDecision,
  onCompare,
  compareAvailable,
}: {
  round: Row;
  version?: Row;
  data: Row;
  userId: string;
  name: (id: string) => string;
  busy: boolean;
  demo: boolean;
  onSubmit: (p: Row) => Promise<boolean>;
  onDecision: (outcome: "approve" | "reject" | "defer") => void;
  onCompare: () => void;
  compareAvailable: boolean;
}) {
  const reviewerIds: string[] =
    round.reviewers || round.reviewer_ids || round.required_reviewer_ids || [];
  const responses = rows(data, "reviews").filter(
    (r) =>
      r.round_id === round.id && r.status !== "draft" && r.state !== "draft",
  );
  const mine = responses.find((r) => r.reviewer_id === userId);
  const [rating, setRating] = useState<number | null>(mine?.rating ?? null),
    [disposition, setDisposition] = useState(mine?.disposition || ""),
    [comment, setComment] = useState(mine?.comment || ""),
    [draftNotice, setDraftNotice] = useState(""),
    [validation, setValidation] = useState("");
  const [reviewRevision, setReviewRevision] = useState(mine?.revision ?? 0);
  const draftKey = `fairway-review-draft:${userId}:${round.workspace_id || data.workspace?.id || "demo"}:${round.id}`;
  useEffect(() => {
    try {
      const draft = JSON.parse(sessionStorage.getItem(draftKey) || "null");
      if (
        draft &&
        draft.version_id === (round.version_id || round.target_version_id)
      ) {
        setReviewRevision(draft.base_revision ?? mine?.revision ?? 0);
        setRating(draft.rating);
        setDisposition(draft.disposition);
        setComment(draft.comment);
        setDraftNotice("Restored your private draft from this browser tab.");
      }
    } catch {}
  }, [draftKey, round.version_id, round.target_version_id]);
  const approvals = reviewerIds.filter((id) =>
    responses.some((r) => r.reviewer_id === id && r.disposition === "approve"),
  ).length;
  const allResponded =
    reviewerIds.length > 0 &&
    reviewerIds.every((id) => responses.some((r) => r.reviewer_id === id));
  const changes = responses.some(
    (r) =>
      reviewerIds.includes(r.reviewer_id) &&
      r.disposition === "request_changes",
  );
  const threshold =
    round.policy === "threshold" || round.policy?.mode === "threshold"
      ? Number(round.threshold || round.policy?.threshold || reviewerIds.length)
      : reviewerIds.length;
  const eligible =
    roundState(round) === "open" &&
    allResponded &&
    !changes &&
    approvals >= threshold;
  const member = rows(data, "members").find((m) => m.user_id === userId);
  const mayDecide = member?.role === "owner" || member?.role === "admin";
  const outcomeActions = projectRoundActions(
    round,
    rows(data, "reviews"),
    data.role || member?.role || "",
  );
  const ratings = responses.filter(
    (r) => typeof r.rating === "number" && r.rating >= 1 && r.rating <= 5,
  );
  const canSubmit =
    roundState(round) === "open" && reviewerIds.includes(userId);
  const applicationPreviews: Row[] =
    version?.application_previews ||
    version?.provenance?.application_previews ||
    [];
  return (
    <div className="fp-review-panel">
      <div className="fp-review-layout">
        <div className={`${panel} fp-review-design`}>
          <div className="fp-review-design-heading">
            <h2 className="font-semibold">
              Design to review{" "}
              <span className="fp-scope-label">
                {demo ? "Demo review" : label(round.scope)}
              </span>
            </h2>
            <button
              className={button}
              disabled={!compareAvailable}
              onClick={onCompare}
            >
              <Columns2 size={15} />
              Compare versions
            </button>
          </div>
          <div className="fp-review-art">
            {imageUrl(version) ? (
              <div className="fp-review-art-image">
                <Picture row={version} />
              </div>
            ) : (
              <div className="min-h-80 p-8">
                <h3 className="mb-5 text-2xl font-semibold">
                  {title(version)}
                </h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {version?.body ||
                    "Preview unavailable. The round remains pinned to its saved version."}
                </p>
              </div>
            )}
          </div>
          {applicationPreviews.length > 0 && (
            <div className="fp-application-previews">
              <h3>Application previews</h3>
              <div>
                {applicationPreviews.slice(0, 3).map((preview, i) => (
                  <figure key={preview.id || preview.image_url || i}>
                    <Picture row={preview} />
                    <figcaption>{title(preview)}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}
          <details className="fp-review-evidence">
            <summary>Exact-version review details</summary>
            <div>
              <strong>{versionName(version)}</strong>
              <Badge>{label(roundState(round))}</Badge>
            </div>
            <p className="break-all">
              {round.version_id || round.target_version_id}
            </p>
            {version?.media_verification === "unverified_storage_source" && (
              <p>Stored source snapshot · file integrity unverified</p>
            )}
            <p>
              {version?.body ||
                "Evaluate the specific design and approval scope. This review does not clear trademarks or certify manufacturing readiness."}
            </p>
          </details>
        </div>
        <form
          className={`${panel} fp-review-form`}
          data-onboarding="review-response"
          tabIndex={-1}
          onSubmit={async (e) => {
            e.preventDefault();
            setValidation("");
            if (!disposition) {
              setValidation("Choose approve, request changes, or abstain.");
              return;
            }
            if (disposition === "request_changes" && !comment.trim()) {
              setValidation("Explain what needs to change before submitting.");
              return;
            }
            const ok = await onSubmit({
              round_id: round.id,
              disposition,
              rating,
              comment,
              ...(mine ? { expected_revision: reviewRevision } : {}),
            });
            if (ok) {
              setReviewRevision(mine ? reviewRevision + 1 : 0);
              sessionStorage.removeItem(draftKey);
              setDraftNotice("Review submitted for this exact version.");
            }
          }}
        >
          <h2 className="fp-review-form-title">Your review</h2>
          <div className="fp-current-reviewer">
            <Avatar name={name(userId)} userId={userId} />
            <p className="text-sm font-semibold">{name(userId)}</p>
            <span className="rounded-full bg-[#f2efeb] px-2.5 py-1 text-[11px] text-[#877a6d]">
              {canSubmit
                ? "Current reviewer"
                : roundState(round) === "closed"
                  ? "Round closed"
                  : "Not assigned"}
            </span>
          </div>
          <fieldset disabled={!canSubmit || busy}>
            <legend className="fp-rating-label">
              Overall rating{" "}
              <span className="font-normal text-[#958574]">(optional)</span>
            </legend>
            <div
              className="fp-rating-stars"
              role="radiogroup"
              aria-label="Overall rating"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  type="button"
                  key={n}
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} out of 5`}
                  className="rounded p-1.5 text-[#760d24] focus-visible:outline-2"
                  onClick={() => setRating(n)}
                >
                  <Star
                    size={33}
                    strokeWidth={1.3}
                    fill={rating && rating >= n ? "#760D24" : "none"}
                  />
                </button>
              ))}
              <button
                type="button"
                className="ml-auto text-[11px] text-[#877a6d] underline"
                onClick={() => setRating(null)}
              >
                {rating ? "Clear" : "Not rated"}
              </button>
            </div>
            <div className="fp-review-criteria">
              {[
                {
                  label: "Brand fit",
                  Icon: Target,
                  hint: "Does this direction reflect the intended brand personality and audience?",
                },
                {
                  label: "Distinctiveness",
                  Icon: Sparkles,
                  hint: "What feels recognizable, ownable, and different from other golf brands?",
                },
                {
                  label: "Product fit",
                  Icon: Box,
                  hint: "Consider how the design works across the products shown in this exact version.",
                },
                {
                  label: "Wearability",
                  Icon: Shirt,
                  hint: "Consider everyday use, visibility, and how the design looks on apparel.",
                },
              ].map(({ label: criterion, Icon, hint }) => (
                <details key={criterion}>
                  <summary>
                    <Icon size={22} />
                    <span>{criterion}</span>
                    <ChevronDown size={17} />
                  </summary>
                  <p>{hint} Add your observations in the comments below.</p>
                </details>
              ))}
            </div>
            <Field text="Your comments">
              <textarea
                className={input}
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What works? What should change?"
              />
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">
                Feedback status
              </legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  ["approve", "Approve"],
                  ["request_changes", "Request changes"],
                  ["abstain", "Abstain"],
                ].map(([v, t]) => (
                  <label
                    key={v}
                    className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border p-2 text-xs ${disposition === v ? "border-[#760d24] bg-[#fbf1f0]" : "border-[#e6e2dd]"}`}
                  >
                    <input
                      type="radio"
                      name="disposition"
                      value={v}
                      checked={disposition === v}
                      onChange={() => setDisposition(v)}
                      className="accent-[#760d24]"
                    />
                    {t}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                className={button}
                onClick={() => {
                  try {
                    sessionStorage.setItem(
                      draftKey,
                      JSON.stringify({
                        rating,
                        disposition,
                        comment,
                        base_revision: reviewRevision,
                        version_id: round.version_id || round.target_version_id,
                      }),
                    );
                    setDraftNotice(
                      "Draft saved privately in this browser tab. It is not submitted and is not a durable backup.",
                    );
                  } catch {
                    setDraftNotice(
                      "Browser storage is unavailable. Keep this tab open to preserve your text.",
                    );
                  }
                }}
              >
                Save draft
              </button>
              <button className={primary} disabled={busy}>
                {busy
                  ? "Submitting…"
                  : mine
                    ? "Update review"
                    : "Submit review"}
              </button>
            </div>
          </fieldset>
          {!canSubmit && (
            <p className="mt-3 text-xs text-[#877a6d]">
              {roundState(round) === "closed"
                ? "This round is immutable. Start a fresh round for new feedback."
                : "Only assigned reviewers can submit their own feedback."}
            </p>
          )}
          {validation && (
            <p role="alert" className="mt-3 text-sm text-red-800">
              {validation}
            </p>
          )}
          {mine && reviewRevision !== (mine.revision ?? 0) && (
            <div className="mt-3 rounded-lg bg-[#fff4e5] p-3 text-xs">
              <p>
                Your submitted review changed elsewhere. Compare your text with
                the saved response below.
              </p>
              <p className="mt-2">{mine.comment}</p>
              <button
                type="button"
                className={`${button} mt-2`}
                onClick={() => setReviewRevision(mine.revision ?? 0)}
              >
                I’ve merged my review
              </button>
            </div>
          )}
          {draftNotice && (
            <p role="status" className="mt-3 text-xs text-[#6c745b]">
              {draftNotice}
            </p>
          )}
        </form>
      </div>
      <div className="fp-review-bottom">
        <section className={`${panel} fp-founder-responses`}>
          <h2 className="fp-summary-heading">Founder responses</h2>
          <div className="fp-founder-response-list">
            {reviewerIds.map((id) => {
              const r = responses.find((r) => r.reviewer_id === id);
              return (
                <div key={id} className="fp-founder-response">
                  <div className="flex items-center gap-2">
                    <Avatar name={name(id)} userId={id} />
                    <div>
                      <h3 className="text-sm font-semibold">{name(id)}</h3>
                      <p
                        className={`fp-response-status ${r ? "has-response" : "is-pending"}`}
                      >
                        {r ? label(r.disposition) : "Pending"}
                      </p>
                    </div>
                  </div>
                  {r?.comment && (
                    <p className="mt-3 text-xs leading-relaxed text-[#877a6d]">
                      {r.comment}
                    </p>
                  )}
                  {r?.rating != null && (
                    <p className="mt-2 text-xs text-[#760d24]">
                      {r.rating}/5 rating
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {ratings.length > 0 && (
            <p className="mt-4 text-xs text-[#877a6d]">
              Average rating:{" "}
              {(
                ratings.reduce((s, r) => s + r.rating, 0) / ratings.length
              ).toFixed(1)}{" "}
              / 5 · {ratings.length} rated{" "}
              {ratings.length === 1 ? "response" : "responses"}
            </p>
          )}
        </section>
        <section className={`${panel} fp-review-decision`}>
          <h2 className="fp-summary-heading">Decision</h2>
          <div className="flex items-center justify-between gap-3">
            <strong>
              {approvals} of {reviewerIds.length} approvals
            </strong>
            <button
              className={primary}
              disabled={!outcomeActions.approve || busy}
              onClick={() => onDecision("approve")}
            >
              <CheckCircle2 size={15} />
              Record decision
            </button>
          </div>
          {data.role === "owner" && roundState(round) === "open" && (
            <details className="fp-owner-decision-actions">
              <summary>Other decision actions</summary>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className={button}
                  disabled={!outcomeActions.reject || busy}
                  onClick={() => onDecision("reject")}
                >
                  Reject direction
                </button>
                <button
                  className={button}
                  disabled={!outcomeActions.defer || busy}
                  onClick={() => onDecision("defer")}
                >
                  Defer decision
                </button>
              </div>
            </details>
          )}
          <p className="mt-4 text-xs leading-relaxed text-[#877a6d]">
            {round.policy === "threshold" || round.policy?.mode === "threshold"
              ? `${threshold} approvals required, all assigned reviewers must respond, and any request for changes blocks approval.`
              : "Every assigned reviewer must explicitly approve this exact version. Ratings do not replace approval."}
            {!mayDecide ? " Only an owner or admin may record a decision." : ""}
          </p>
        </section>
        <section className={`${panel} fp-review-ai`}>
          <h2>
            <Sparkles size={23} />
            Studio AI
          </h2>
          <div>
            <MessageSquare size={21} />
            <p>
              {responses.length
                ? `${responses.length} submitted ${responses.length === 1 ? "response" : "responses"}. Review each founder’s feedback before recording a decision.`
                : "Summarize feedback when reviews arrive."}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
