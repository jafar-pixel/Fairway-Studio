"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  Link2,
  Upload,
  ExternalLink,
  X,
  Lightbulb,
  ImageIcon,
  CheckSquare,
  ArrowUpRight,
  Archive,
  Copy,
  FolderOpen,
  Presentation,
  MoreHorizontal,
  Sparkles,
  MessageCircle,
  SlidersHorizontal,
  ChevronDown,
  Info,
  Eye,
  EyeOff,
  Trash2,
  Replace,
} from "lucide-react";
import "./collections-visual.css";
import "./creator-flow.css";
import Script from "next/script";
import { MediaPlayer } from "./media-player";
import { ProfileAvatar } from "./profile-avatar";
import { MediaUploadQueue, useMediaUploads } from "./media-upload";
import { useCreatorNavigationGuard } from "./creator-navigation";
import { CREATOR_SOURCES, IdeaSaveSession, creatorBody, creatorTags, normalizeIdeaCategory, sourceContext } from "@/lib/studio/creator-flow";
import { usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  canonicalPinUrl,
  safeExternalUrl,
  normalizedTags,
  matchesCollectionQuery,
  taskStatus,
  isTaskOverdue,
  localDate,
  collectionItemId,
  collectionDetailUrl,
  ideaAssetChoices,
  ideaAssetLinkKey,
} from "@/lib/studio/collection-helpers";

export type CollectionProps = {
  data: any;
  workspaceId: string;
  userId: string;
  demo: boolean;
  onMutate: (
    operation: string,
    input: Record<string, unknown>,
  ) => Promise<unknown>;
  onNavigate: (path: string) => void;
  search?: string;
  workspaces?: Array<{ id: string; name: string }>;
};
type Row = Record<string, any>;
const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#760D24]/40";
const button =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} !border-[#760D24] !bg-[#760D24] !text-white hover:!bg-[#590a1b]`;
const types = [
  "Brand identity",
  "Product",
  "Apparel",
  "Campaign",
  "Material",
  "General",
];
const statuses = ["open", "in_progress", "blocked", "done"];
const statusName: Record<string, string> = {
  open: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "This did not save. Your changes are still here; try again.";
function memberName(data: any, id?: string) {
  return (
    data.members?.find((m: Row) => m.user_id === id)?.display_name ||
    (id ? "Workspace member" : "Unassigned")
  );
}
function Avatar({ data, id }: { data: any; id?: string }) {
  const index = Math.max(
    0,
    (data.members || []).findIndex((member: Row) => member.user_id === id),
  );
  const name = memberName(data, id);
  return (
    <ProfileAvatar name={name} userId={id} className={`fc-avatar fc-avatar-${index % 4}`} />
  );
}
function Contributors({ data, item }: { data: any; item: Row }) {
  const ids = Array.from(
    new Set<string>(
      [
        item.author_id || item.created_by,
        ...(item.contributor_ids || []),
      ].filter(Boolean),
    ),
  );
  return (
    <span className="fc-contributors" aria-label="Contributors">
      {ids.map((id) => (
        <Avatar key={id} data={data} id={id} />
      ))}
    </span>
  );
}
function assetVisualKind(item: Row): string {
  if (item.source_kind === "original") return "upload";
  const kind = item.provenance?.library_kind;
  return kind === "ai_concept"
    ? "concept"
    : ["reference", "upload", "campaign"].includes(kind)
      ? kind
      : item.kind;
}
function AssetKind({ item }: { item: Row }) {
  const kind = assetVisualKind(item);
  const Icon =
    kind === "reference" ? ImageIcon : kind === "upload" ? Upload : Sparkles;
  const label =
    item.source_kind === "original"
      ? "Original artwork"
      : kind === "reference"
        ? "Reference"
        : kind === "concept"
          ? item.provenance?.mockup_import
            ? "Exploratory concept"
            : "AI concept"
          : kind === "campaign"
            ? "Campaign"
            : kind === "version"
              ? "Concept version"
              : "Upload";
  return (
    <span className={`fc-asset-kind fc-asset-kind-${kind}`}>
      <Icon size={16} />
      {label}
    </span>
  );
}

function DetailPanel({
  title,
  onClose,
  children,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside className={`fc-detail-panel ${className}`} aria-label={title}>
      <header className="fc-detail-heading">
        <h2>{title}</h2>
        <button
          type="button"
          className="fc-icon-button"
          aria-label={`Close ${title}`}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className="fc-detail-content">{children}</div>
    </aside>
  );
}
function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-full bg-[#F4EDE1] px-2.5 py-1 text-xs font-medium text-[#602c31]">
      {children}
    </span>
  );
}
function Label({ children, title }: { children: ReactNode; title: string }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-stone-700">
      {title}
      {children}
    </label>
  );
}
function Empty({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 p-10 text-center text-sm text-stone-600">
      <p>{text}</p>
      {children}
    </div>
  );
}
function Notice({ text }: { text: string }) {
  return text ? (
    <p
      role="alert"
      className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
    >
      {text}
    </p>
  ) : null;
}
function Title({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <header className="fc-page-heading flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-950">
          {title}
        </h1>
        <p className="mt-2 text-base text-stone-500">{subtitle}</p>
      </div>
      <div className="flex gap-2">{children}</div>
    </header>
  );
}
function Toggle({
  value,
  onChange,
  board = false,
}: {
  value: string;
  onChange: (v: string) => void;
  board?: boolean;
}) {
  return (
    <div className="fc-view-toggle flex rounded-lg border border-stone-200 p-1">
      {[
        [board ? "board" : "grid", board ? "Board" : "Grid", LayoutGrid],
        ["list", "List", List],
      ].map(([v, label, Icon]: any) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          aria-label={`${label} view`}
          className={`rounded-md px-3 py-1.5 text-sm ${value === v ? "bg-[#f7e5e8] text-[#760D24]" : "text-stone-500"}`}
        >
          <Icon className="inline size-4" />
          <span className="ml-1.5">{label}</span>
        </button>
      ))}
    </div>
  );
}
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[min(94vw,640px)] overflow-auto rounded-2xl border border-stone-200 bg-white p-0 text-stone-900 shadow-2xl backdrop:bg-black/35"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button aria-label="Close dialog" onClick={onClose} className={button}>
          <X className="size-4" />
        </button>
      </div>
      <div className="space-y-4 p-6">{children}</div>
    </dialog>
  );
}
function useFilters(prefix: string) {
  const read = () =>
    typeof window === "undefined"
      ? {}
      : Object.fromEntries(new URLSearchParams(window.location.search));
  const [params, setParams] = useState<Record<string, string>>(read);
  useEffect(() => {
    const sync = () => setParams(read());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  function set(key: string, value: string) {
    const url = new URL(window.location.href);
    const next = {
      ...Object.fromEntries(url.searchParams),
      [`${prefix}_${key}`]: value,
    };
    setParams(next);
    value
      ? url.searchParams.set(`${prefix}_${key}`, value)
      : url.searchParams.delete(`${prefix}_${key}`);
    window.history.pushState({}, "", url);
  }
  return {
    get: (key: string, fallback = "") => params[`${prefix}_${key}`] || fallback,
    set,
  };
}
function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative min-w-48 flex-1">
      <Search className="absolute left-3 top-3 size-4 text-stone-400" />
      <input
        aria-label={placeholder}
        className={`${field} pl-9`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function referenceCredit(item: Row) {
  return (
    String(item.note || item.context_note || "")
      .match(/Source creator \/ credit:\s*([^\r\n]+)/i)?.[1]
      ?.trim()
      .toLocaleLowerCase() || ""
  );
}

function matchingReferenceUploads(item: Row, files: Row[]) {
  const credit = item.kind === "reference" ? referenceCredit(item) : "";
  if (!credit) return [];
  return files
    .filter(
      (file) =>
        /^\s*Origin: Reference\b/i.test(String(file.context_note || "")) &&
        referenceCredit(file) === credit &&
        /^(supabase-storage|blob):\/\//.test(String(file.url || "")),
    )
    .sort((a, b) =>
      String(b.created_at || "").localeCompare(String(a.created_at || "")),
    );
}

function Preview({
  item,
  className = "",
  eager = false,
  workspaceId,
  userId,
  relatedFiles = [],
}: {
  item: Row;
  className?: string;
  eager?: boolean;
  workspaceId?: string;
  userId?: string;
  relatedFiles?: Row[];
}) {
  const privateMedia = /^(supabase-storage|blob):\/\//.test(String(item.url || ""));
  if (privateMedia) return <div className={`min-w-0 ${className}`}><MediaPlayer workspaceId={workspaceId || item.workspace_id || ""} fileId={item.id} title={item.title} userId={userId} mimeType={item.mime_type} compact={!eager} /></div>;
  const image =
    item.cover_url ||
    item.image_url ||
    item.preview_url ||
    item.provenance?.image_url;
  const relatedImage = relatedFiles[0];
  if (!image && relatedImage) {
    return (
      <div className={`fc-reference-media-preview ${className}`}>
        <MediaPlayer
          workspaceId={workspaceId || item.workspace_id || ""}
          fileId={relatedImage.id}
          title={relatedImage.title || item.title}
          userId={userId}
          compact
          className="fc-reference-media-player"
        />
        {relatedFiles.length > 1 && (
          <span className="fc-reference-media-count">
            {relatedFiles.length} saved images
          </span>
        )}
      </div>
    );
  }
  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-lg bg-[#F4EDE1] ${className}`}
    >
      {image ? (
        <img
          src={image}
          alt={item.title || "Creative reference"}
          className="h-full w-full object-cover"
          style={{
            objectFit:
              item.preview_fit === "contain" ||
              item.provenance?.preview_fit === "contain"
                ? "contain"
                : "cover",
          }}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <ImageIcon className="size-10 text-[#760D24]/30" />
      )}
    </div>
  );
}

function useRoutedItem(section: string) {
  const pathname = usePathname();
  const params = useSearchParams();
  const routeId = collectionItemId(pathname, params.toString(), section);
  const [id, setId] = useState(routeId);
  const opened = useRef(false);
  useEffect(() => {
    setId(routeId);
  }, [routeId]);
  function select(next: string) {
    const url = collectionDetailUrl(window.location.href, section, next);
    window.history.pushState(
      { ...window.history.state, collectionDetail: true },
      "",
      url,
    );
    opened.current = true;
    setId(next);
  }
  function close() {
    if (opened.current && window.history.state?.collectionDetail) {
      opened.current = false;
      window.history.back();
      setId("");
      return;
    }
    const url = collectionDetailUrl(window.location.href, section);
    window.history.replaceState(window.history.state, "", url);
    setId("");
  }
  return { id, select, close };
}
export function IdeasView(props: CollectionProps) {
  return (
    <Suspense fallback={<p role="status">Loading ideas…</p>}>
      <IdeasCollection {...props} />
    </Suspense>
  );
}
export function TasksView(props: CollectionProps) {
  return (
    <Suspense fallback={<p role="status">Loading tasks…</p>}>
      <TasksCollection {...props} />
    </Suspense>
  );
}
export function LibraryView(props: CollectionProps) {
  return (
    <Suspense fallback={<p role="status">Loading library…</p>}>
      <LibraryCollection {...props} />
    </Suspense>
  );
}

function PinterestEmbed({ url, title }: { url: string; title: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  function build() {
    const fn = (
      window as unknown as {
        FairwayPinterestBuild?: (element?: HTMLElement) => void;
      }
    ).FairwayPinterestBuild;
    if (fn && root.current) {
      try {
        fn(root.current);
      } catch {
        setState("unavailable");
      }
    }
  }
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    el.replaceChildren();
    const link = document.createElement("a");
    link.href = url;
    link.dataset.pinDo = "embedPin";
    link.dataset.pinWidth = "medium";
    link.textContent = title;
    el.appendChild(link);
    setState("loading");
    const observer = new MutationObserver(() => {
      if (el.querySelector("iframe,img")) setState("ready");
    });
    observer.observe(el, { childList: true, subtree: true });
    build();
    const timer = window.setTimeout(() => {
      if (!el.querySelector("iframe,img")) setState("unavailable");
    }, 8000);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [url, title]);
  return (
    <section
      aria-label="Pinterest source preview"
      className="rounded-xl border border-stone-200 bg-stone-50 p-4"
    >
      <Script
        id="fairway-pinterest-widgets"
        src="https://assets.pinterest.com/js/pinit.js"
        strategy="afterInteractive"
        data-pin-build="FairwayPinterestBuild"
        data-pin-hover="false"
        onReady={build}
        onError={() => setState("unavailable")}
      />
      <div ref={root} className="flex justify-center overflow-hidden" />
      {state === "loading" && (
        <p role="status" className="mt-2 text-xs text-stone-500">
          Loading the official Pinterest preview…
        </p>
      )}
      {state === "unavailable" && (
        <div className="mt-2 text-xs text-stone-600">
          <p>
            The preview is unavailable or blocked. Your source link and notes
            are still saved.
          </p>
          <button
            type="button"
            className="mt-2 underline"
            onClick={() => {
              build();
            }}
          >
            Retry preview
          </button>
        </div>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-2 text-sm text-[#760D24]"
      >
        <ExternalLink className="size-4" />
        Open original Pin
      </a>
    </section>
  );
}
function ContextConversation({
  kind,
  item,
  ...props
}: CollectionProps & { kind: "idea" | "task"; item: Row }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = kind === "idea" ? "idea_id" : "task_id";
  async function open() {
    setBusy(true);
    setError("");
    try {
      const existing = (props.data.threads || []).find(
        (t: Row) => t[key] === item.id,
      );
      const thread =
        existing ||
        ((await props.onMutate("createThread", {
          title: item.title,
          [key]: item.id,
          ...(item.project_id ? { project_id: item.project_id } : {}),
        })) as Row);
      if (!thread?.id)
        throw new Error("The conversation could not be opened. Try again.");
      props.onNavigate(`/w/${props.workspaceId}/conversations/${thread.id}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2 border-t border-stone-200 pt-4">
      <h3 className="text-sm font-semibold">Discussion</h3>
      <p className="text-xs text-stone-500">
        Keep comments attached to this {kind} in a shared conversation.
      </p>
      <Notice text={error} />
      <button type="button" className={button} disabled={busy} onClick={open}>
        {busy ? "Opening…" : "Open comments"}
      </button>
    </div>
  );
}

function CanvasDestination({
  item,
  compact = false,
  ...props
}: CollectionProps & { item: Row; compact?: boolean }) {
  const [choosing, setChoosing] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const projects = (props.data.projects || []).filter(
    (p: Row) => !p.archived_at && p.phase !== "archived",
  );
  const sourceKey =
    item.kind === "reference"
      ? "reference_id"
      : item.kind === "upload"
        ? "file_id"
        : "version_id";
  async function add() {
    if (!projectId) return;
    setBusy(true);
    setError("");
    try {
      const nodes = (props.data.nodes || []).filter(
        (n: Row) => n.project_id === projectId,
      );
      const existing = nodes.find((n: Row) => n[sourceKey] === item.id);
      if (!existing)
        await props.onMutate("saveCanvas", {
          project_id: projectId,
          [sourceKey]: item.id,
          body: note.trim() || item.title,
          x: 40 + (nodes.length % 3) * 320,
          y: 40 + Math.floor(nodes.length / 3) * 260,
          width: 280,
          height: 220,
          expected_revision: 0,
        });
      props.onNavigate(`/w/${props.workspaceId}/projects/${projectId}/canvas`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className={`fc-canvas-destination ${compact ? "fc-canvas-destination-compact" : "space-y-3 border-t border-stone-200 pt-4"}`}
    >
      <button
        className={primary}
        type="button"
        onClick={() => setChoosing(!choosing)}
      >
        {compact ? <ArrowUpRight className="size-4" /> : <Plus className="size-4" />}
        {compact ? "Open in canvas" : "Add to canvas"}
      </button>
      {choosing && (
        <div className={`space-y-3 rounded-xl bg-[#F4EDE1]/50 p-4 ${compact ? "fc-canvas-destination-chooser" : ""}`}>
          <h3 className="text-sm font-semibold">Choose a destination</h3>
          <p className="text-xs text-stone-500">
            Reuses this asset and its attribution. No copy of the source file is
            made.
          </p>
          <Notice text={error} />
          {projects.length ? (
            <>
              <Label title="Project canvas">
                <select
                  className={field}
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  <option value="">Choose a project</option>
                  {projects.map((p: Row) => (
                    <option key={p.id} value={p.id}>
                      {p.title || p.name}
                    </option>
                  ))}
                </select>
              </Label>
              <Label title="Context for this canvas">
                <textarea
                  rows={2}
                  className={field}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What should the team notice?"
                />
              </Label>
              <button
                type="button"
                className={button}
                disabled={!projectId || busy}
                onClick={add}
              >
                {busy ? "Adding…" : compact ? "Open full canvas" : "Add and open canvas"}
              </button>
            </>
          ) : (
            <p className="text-sm">
              Create a project before adding this asset to a canvas.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function IdeasCollection(props: CollectionProps) {
  const { data, onMutate, onNavigate, workspaceId, search = "" } = props;
  const f = useFilters("ideas");
  const routed = useRoutedItem("ideas");
  const selected =
    (data.ideas || []).find((i: Row) => i.id === routed.id) || null;
  const setSelected = (item: Row | null) =>
    item ? routed.select(item.id) : routed.close();
  const [creating, setCreating] = useState(false);
  const [editorAction, setEditorAction] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // Clicking an idea opens its Team/Private whiteboard; details stay in the card menu.
  const openBoard = (item: Row) =>
    onNavigate(`${workspaceId === "demo" ? "/demo" : `/w/${workspaceId}`}/ideas/${encodeURIComponent(item.id)}/board`);
  const all: Row[] = (data.ideas || []).map((i: Row) => ({
    ...i,
    status: i.archived_at ? "archived" : i.status,
  }));
  const tags = [
    ...new Set<string>(
      all.flatMap((i) =>
        (i.tags || []).filter((tag: string) => !tag.startsWith("mockup-idea:")),
      ),
    ),
  ];
  const view = f.get("view", "grid");
  const items = all
    .filter(
      (i) =>
        matchesCollectionQuery(i, `${search} ${f.get("q")}`) &&
        (!f.get("type") || i.category === f.get("type")) &&
        (!f.get("tag") || (i.tags || []).includes(f.get("tag"))) &&
        (f.get("status")
          ? i.status === f.get("status")
          : i.status !== "archived"),
    )
    .sort((a, b) =>
      f.get("sort") === "title"
        ? a.title.localeCompare(b.title)
        : String(b.updated_at || "").localeCompare(String(a.updated_at || "")),
    );
  async function archive(item: Row) {
    setBusy(true);
    setNotice("");
    try {
      await onMutate(
        item.status === "archived" ? "restoreIdea" : "archiveIdea",
        { id: item.id, expected_revision: item.revision },
      );
      setSelected(null);
      setNotice(
        item.status === "archived"
          ? "Idea restored."
          : "Idea archived. Choose Archived in the status filter to restore it.",
      );
    } catch (e) {
      setNotice(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="fc-collection fc-ideas">
      <Title
        title="Every great thing starts here."
        subtitle="Jafar’s ideas start the conversation. Every teammate: add your own photos, sketches, references, and thoughts."
      >
        <button className={primary} data-onboarding="idea-create" onClick={() => setCreating(true)}>
          <Plus className="size-5" />
          New idea
        </button>
      </Title>
      <Notice text={notice} />
      {routed.id && !selected && (
        <Empty text="This idea is not available in this workspace." />
      )}
      <div className="fc-idea-toolbar">
        <SearchField
          placeholder="Search ideas…"
          value={f.get("q")}
          onChange={(v) => f.set("q", v)}
        />
        <select
          aria-label="Idea type"
          className={`${field} !w-auto`}
          value={f.get("type")}
          onChange={(e) => f.set("type", e.target.value)}
        >
          <option value="">All types</option>
          {[
            ...new Set([
              ...types,
              ...all.map((item) => item.category).filter(Boolean),
            ]),
          ].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select
          aria-label="Idea status"
          className={`${field} !w-auto`}
          value={f.get("status")}
          onChange={(e) => f.set("status", e.target.value)}
        >
          <option value="">Status</option>
          {["captured", "exploring", "shortlist", "promoted", "archived"].map(
            (status) => (
              <option key={status} value={status}>
                {status[0].toUpperCase() + status.slice(1)}
              </option>
            ),
          )}
        </select>
        <div className="fc-tag-filters">
          {tags.map((tag) => (
            <button
              key={tag}
              aria-pressed={f.get("tag") === tag}
              onClick={() => f.set("tag", f.get("tag") === tag ? "" : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
        <details className="fc-filter-menu">
          <summary aria-label="Idea display options">
            <SlidersHorizontal size={18} />
          </summary>
          <div className="fc-popover">
            <label className="fc-filter-label">
              Sort ideas
              <select
                aria-label="Sort ideas"
                className={field}
                value={f.get("sort")}
                onChange={(e) => f.set("sort", e.target.value)}
              >
                <option value="">Recently updated</option>
                <option value="title">Title</option>
              </select>
            </label>
            <Toggle value={view} onChange={(v) => f.set("view", v)} />
          </div>
        </details>
      </div>
      <div className={view === "grid" ? "fc-idea-grid" : "fc-idea-list"}>
        {items.map((item) => (
          <article key={item.id} className="fc-idea-card">
            <div className="fc-idea-card-head">
              <Badge>{item.category || "General"}</Badge>
              <span className={`fc-idea-status fc-status-${item.status}`}>
                <i />
                {item.status}
              </span>
              <details className="fc-card-menu">
                <summary aria-label={`Actions for ${item.title}`}>
                  <MoreHorizontal size={20} />
                </summary>
                <div className="fc-popover">
                  <button onClick={() => openBoard(item)}>
                    <Presentation size={16} />
                    Open whiteboard
                  </button>
                  <button onClick={() => setSelected(item)}>
                    <FolderOpen size={16} />
                    Edit details
                  </button>
                  <button
                    onClick={() => {
                      setSelected(item);
                      setEditorAction("link");
                    }}
                  >
                    <Plus size={16} />
                    Add to project
                  </button>
                  <button
                    onClick={() => {
                      setSelected(item);
                      setEditorAction("promote");
                    }}
                  >
                    <ArrowUpRight size={16} />
                    Promote to project
                  </button>
                  <button disabled={busy} onClick={() => archive(item)}>
                    <Archive size={16} />
                    {item.status === "archived" ? "Restore" : "Archive"}
                  </button>
                </div>
              </details>
            </div>
            <button
              className="fc-idea-image"
              onClick={() => openBoard(item)}
              aria-label={`Open the whiteboard for ${item.title}`}
            >
              <Preview workspaceId={props.workspaceId} userId={props.userId} item={item} />
            </button>
            <div className="fc-idea-card-copy">
              <button
                className="fc-card-title"
                onClick={() => openBoard(item)}
              >
                {item.title}
              </button>
              <p>{item.body || "Add a brief to develop this direction."}</p>
              <Contributors data={data} item={item} />
            </div>
          </article>
        ))}
      </div>
      {!items.length && (
        <Empty
          text={
            all.length
              ? "No ideas match these filters."
              : "Your next direction starts with one idea."
          }
        >
          <button
            className={`${button} mt-4`}
            onClick={() => {
              if (!all.length) setCreating(true);
              else
                for (const key of ["q", "type", "tag", "status"])
                  f.set(key, "");
            }}
          >
            {all.length ? "Clear filters" : "Capture an idea"}
          </button>
        </Empty>
      )}
      {items.length > 1 && (
        <div className="fc-connect-ideas">
          <Sparkles size={30} />
          <div>
            <h2>Connect these ideas</h2>
            <p>
              Find shared tags, themes, and new directions across your ideas.
            </p>
          </div>
          <button
            className={primary}
            onClick={() => {
              const shared = tags.filter(
                (tag) =>
                  items.filter((item) => (item.tags || []).includes(tag))
                    .length > 1,
              );
              setNotice(
                shared.length
                  ? `Shared themes: ${shared.join(", ")}. Choose a tag above to explore related ideas.`
                  : "No shared tags yet. Add tags to your ideas to connect related directions.",
              );
            }}
          >
            <Sparkles size={20} />
            Find shared themes
          </button>
        </div>
      )}
      {(creating || selected) && (
        <IdeaEditor
          key={selected?.id || "new"}
          {...props}
          idea={selected}
          initialAction={editorAction}
          onClose={() => {
            setSelected(null);
            setCreating(false);
            setEditorAction("");
          }}
        />
      )}
    </section>
  );
}

export function IdeaEditor({
  idea,
  initialAction = "",
  initial = {},
  onClose,
  onSaved,
  ...props
}: CollectionProps & {
  idea: Row | null;
  initialAction?: string;
  initial?: Row;
  onClose: () => void;
  onSaved?: (idea: Row) => void;
}) {
  const dataRef = useRef(props.data);
  dataRef.current = props.data;
  const mutateRef = useRef(props.onMutate);
  mutateRef.current = props.onMutate;
  const session = useRef<IdeaSaveSession | null>(null);
  if (!session.current) session.current = new IdeaSaveSession(props.workspaceId, idea, (op, input) => mutateRef.current(op, input), () => dataRef.current);
  const [savedIdea, setSavedIdea] = useState<Row | null>(idea);
  const refreshedIdea = (props.data.ideas || []).find((row: Row) => row.id === savedIdea?.id);
  const currentIdea = refreshedIdea && Number(refreshedIdea.revision) >= Number(savedIdea?.revision || 0) ? refreshedIdea : savedIdea;
  const linkedProjectId = currentIdea?.promoted_project_id || (props.data.projects || []).find((p: Row) => p.idea_id === currentIdea?.id)?.id;
  const [title, setTitle] = useState(idea?.title || initial.title || "");
  const [body, setBody] = useState(idea?.body || initial.body || "");
  const [category, setCategory] = useState(idea?.category || normalizeIdeaCategory(initial.category || "General"));
  const [tags, setTags] = useState((idea?.tags || initial.tags || []).join(", "));
  const [status, setStatus] = useState(idea?.status === "shortlist" ? "shortlist" : "exploring");
  const [origin, setOrigin] = useState("");
  const [credit, setCredit] = useState("");
  const [story, setStory] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [sourceCredit, setSourceCredit] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [promote, setPromote] = useState(initialAction === "promote");
  const [lead, setLead] = useState(props.userId);
  const uploads = useMediaUploads({ workspaceId: props.workspaceId, userId: props.userId, demo: props.demo });
  const initialSnapshot = useRef(JSON.stringify([title, body, category, tags, status]));
  const dirty = uploads.hasUnfinished || Boolean(sourceUrl || origin || credit || story) || initialSnapshot.current !== JSON.stringify([title, body, category, tags, status]);
  const leave = useCreatorNavigationGuard({ dirty, busy: busy || uploads.busy, onBlocked: setError });
  const close = () => leave(onClose);
  const navigate = (path: string) => props.onNavigate(path);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy || uploads.busy) return;
    setBusy(true);
    setError("");
    try {
      const draft = { title: title.trim(), body: creatorBody(body, origin, credit, story), category, tags: creatorTags(tags), status };
      if (!draft.title) throw new Error("Give your idea a title.");
      // Validate optional source metadata before creating any canonical rows.
      let source: { operation: "importPin" | "createExternalFile"; input: Row } | null = null;
      if (sourceUrl.trim()) {
        const safe = safeExternalUrl(sourceUrl.trim());
        if (!safe) throw new Error("Use an HTTPS source link without sign-in details.");
        const note = sourceContext(sourceNote, sourceCredit);
        const isPinterest = /(^|\.)pinterest\.com$/.test(new URL(safe).hostname);
        source = isPinterest
          ? { operation: "importPin", input: { url: canonicalPinUrl(safe), title: sourceTitle.trim() || draft.title, note, tags: draft.tags } }
          : { operation: "createExternalFile", input: { url: safe, title: sourceTitle.trim() || draft.title, context_note: note, tags: draft.tags, provider: "other" } };
      }
      if (source) draft.body = creatorBody(body, origin, credit, [story, `Source reference: ${source.input.url}`, sourceContext(sourceNote, sourceCredit)].filter(Boolean).join("\n"));
      session.current!.sync(dataRef.current);
      const row = await session.current!.save(draft);
      setSavedIdea(row);
      if (source) await session.current!.saveSource(source.operation, source.input);
      const result = await uploads.uploadAll({ onRegistered: async (registered) => {
        await session.current!.link("file_id", registered.id);
        setSavedIdea({ ...session.current!.idea! });
      } });
      if (!result.complete) throw new Error("Your idea is saved. Some attachments still need attention below. Retry them here; this will reuse the same idea and saved originals.");
      await props.onMutate("refresh", {});
      initialSnapshot.current = JSON.stringify([title, body, category, tags, status]);
      leave.complete(() => { onSaved ? onSaved(session.current!.idea!) : onClose(); });
    } catch (cause) {
      setSavedIdea(session.current!.idea);
      setError(errorText(cause));
    } finally { setBusy(false); }
  }
  async function promoteIdea() {
    if (dirty || uploads.hasUnfinished) { setError("Save this draft and its attachments before promoting it."); return; }
    setBusy(true); setError("");
    try {
      const result: any = await props.onMutate("promoteIdea", { idea_id: currentIdea!.id, title: title.trim(), category, type: category, objective: body, lead_id: lead });
      const id = result?.project_id || result?.id || currentIdea?.promoted_project_id;
      if (id) leave.complete(() => { onClose(); props.onNavigate(`/w/${props.workspaceId}/projects/${id}`); });
      else setError("Promotion saved. Refresh Projects to open the linked project.");
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  return (
    <Dialog title={idea ? "Idea details" : "Capture a new idea"} onClose={close}>
      <form onSubmit={save} className="space-y-4" aria-busy={busy || uploads.busy}>
        <Notice text={error} />
        {savedIdea && !idea && <p role="status" className="text-sm text-stone-600">Idea saved. Any unfinished attachments will be added to this same idea.</p>}
        <p className="text-sm text-stone-600">Contributed by {memberName(props.data, idea?.author_id || props.userId)}. Source creator credit is separate and never changes the contributor.</p>
        <fieldset disabled={busy || uploads.busy} className="space-y-4 disabled:opacity-70">
          <div className="space-y-2">
            <h3 className="font-semibold">What sparked the idea?</h3>
            <p className="text-xs text-stone-500">Choose any starting point, or just write. All sources are welcome.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CREATOR_SOURCES.map((source) => <button key={source} type="button" className={origin === source ? primary : button} aria-pressed={origin === source} onClick={() => setOrigin(origin === source ? "" : source)}>{source}</button>)}
            </div>
            {origin === "AI-assisted" && <p className="text-sm text-stone-600">AI is optional. Add an idea or image you already made, or save this draft and open Creative Assistant when you choose. Selecting this source does not run AI.</p>}
          </div>
          <Label title="Title"><input autoFocus className={field} required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A working title is enough" /></Label>
          <Label title="Description"><textarea className={field} rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What are you imagining?" /></Label>
          <details className="rounded-xl border border-stone-200 p-3">
            <summary className="cursor-pointer text-sm font-medium">Tell the story (optional)</summary>
            <div className="mt-3 space-y-3">
              <p className="text-sm text-stone-600">Who is it for? Why does it matter? What inspired you? What should the team notice or discuss?</p>
              <Label title="Story and team context"><textarea className={field} rows={3} value={story} onChange={(e) => setStory(e.target.value)} placeholder="A few words, a personal story, or one detail worth noticing" /></Label>
              <Label title="Source creator / credit (optional)"><input className={field} value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="Person, artist, photographer, or studio" /></Label>
            </div>
          </details>
          {(origin || credit || story) && <p className="text-xs text-stone-500">Origin, source credit, and story will be saved as labeled creative context after your description. Combined limit: 3,000 characters.</p>}
          <div className="grid grid-cols-2 gap-3">
            <Label title="Type"><select className={field} value={category} onChange={(e) => setCategory(e.target.value)}>{[...new Set([...types, category])].map((t) => <option key={t}>{t}</option>)}</select></Label>
            <Label title="Stage"><select className={field} value={status} onChange={(e) => setStatus(e.target.value)}>{["exploring", "shortlist"].map((s) => <option key={s}>{s}</option>)}</select></Label>
          </div>
          <Label title="Tags, separated by commas"><input className={field} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. clubhouse, texture, summer" /></Label>
          <details open={origin === "Pinterest / reference" || undefined} className="rounded-xl border border-stone-200 p-3">
            <summary className="cursor-pointer text-sm font-medium">Add a Pinterest or source link</summary>
            <div className="mt-3 space-y-3">
              <Label title="Source URL"><input type="url" className={field} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://… or a full Pinterest Pin URL" /></Label>
              <Label title="Source title"><input className={field} maxLength={160} value={sourceTitle} onChange={(e) => setSourceTitle(e.target.value)} placeholder={title || "Name this reference"} /></Label>
              <Label title="Source creator / credit"><input className={field} value={sourceCredit} onChange={(e) => setSourceCredit(e.target.value)} placeholder="Credit the original creator" /></Label>
              <Label title="What should we notice?"><textarea className={field} rows={2} value={sourceNote} onChange={(e) => setSourceNote(e.target.value)} /></Label>
              <p className="text-xs text-stone-500">Saved in Library and linked here. Notes and credit: 500 characters total. Your source context is also saved in the idea description. Existing Library references keep their original credit and notes. A reference does not grant reuse rights.</p>
            </div>
          </details>
        </fieldset>
        <MediaUploadQueue uploads={uploads} compact disabled={busy} title="Add photos, sketches, video or audio" description="Choose files now; Save idea uploads them to Library and attaches them here. Add a title, source credit, and notes for each file." />
        <div className="flex flex-wrap gap-2">
          <button className={primary} disabled={busy || uploads.busy || !title.trim()}>{busy ? "Saving idea and attachments…" : savedIdea ? "Save changes and attachments" : "Save idea"}</button>
          <button type="button" className={button} onClick={close}>Cancel</button>
          <button type="button" className={button} onClick={() => navigate(`/w/${props.workspaceId}/library`)}><Link2 className="size-4" />Browse Library</button>
          {currentIdea && <button type="button" className={button} disabled={busy || uploads.busy} onClick={() => linkedProjectId ? navigate(`/w/${props.workspaceId}/projects/${linkedProjectId}`) : setPromote(!promote)}><ArrowUpRight className="size-4" />{linkedProjectId ? "Open project" : "Promote to project"}</button>}
        </div>
      </form>
      {promote && <div className="space-y-3 rounded-xl border bg-[#F4EDE1]/40 p-4">
        <h3 className="font-semibold">Develop this idea into a project</h3>
        <p className="text-sm text-stone-600">The saved title, type and description become the project title, type and objective. The original idea and history are preserved.</p>
        <Label title="Project lead"><select className={field} value={lead} onChange={(e) => setLead(e.target.value)}>{(props.data.members || []).map((m: Row) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></Label>
        <button className={primary} disabled={busy || !title.trim() || !body.trim()} onClick={promoteIdea}>Create linked project</button>
        {!body.trim() && <p className="text-xs">Add an objective in the description before promoting.</p>}
      </div>}
      {currentIdea?.id && <fieldset disabled={busy || uploads.busy}><div ref={(element) => { if (element && initialAction === "link") element.scrollIntoView({ block: "start" }); }}><IdeaRelationships {...props} idea={currentIdea} /></div></fieldset>}
      {currentIdea?.id && <ContextConversation {...props} kind="idea" item={currentIdea} />}
    </Dialog>
  );
}

function IdeaRelationships({
  idea,
  ...props
}: CollectionProps & { idea: Row }) {
  const { data, onMutate, onNavigate, workspaceId } = props;
  const [assetKey, setAssetKey] = useState("");
  const [projectId, setProjectId] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const choices = ideaAssetChoices(data);
  const assetLinks: Row[] = (data.ideaAssets || []).filter(
    (link: Row) => link.idea_id === idea.id,
  );
  const projectLinks: Row[] = (data.ideaProjects || []).filter(
    (link: Row) => link.idea_id === idea.id,
  );
  const attached = new Set(assetLinks.map(ideaAssetLinkKey));
  const projects: Row[] = (data.projects || []).filter(
    (project: Row) => !project.archived_at && project.phase !== "archived",
  );
  const available = choices.filter(
    (choice) =>
      !attached.has(choice.key) && matchesCollectionQuery(choice.row, query),
  );
  const destination = choices.find((choice) => choice.key === assetKey);
  async function mutate(
    operation: string,
    input: Record<string, unknown>,
    message: string,
  ) {
    setBusy(operation);
    setError("");
    setSuccess("");
    try {
      await onMutate(operation, {
        ...input,
        idea_id: idea.id,
        expected_revision: idea.revision,
      });
      setSuccess(message);
      setAssetKey("");
      setProjectId("");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy("");
    }
  }
  return (
    <section
      aria-label="Idea references and linked projects"
      className="space-y-5 border-t border-stone-200 pt-5"
    >
      <Notice text={data.workflowError || error} />
      {success && (
        <p
          role="status"
          className="rounded-lg bg-green-50 p-3 text-sm text-green-900"
        >
          {success}
        </p>
      )}
      <div className="space-y-3">
        <h3 className="font-semibold">References and attachments</h3>
        <p className="text-xs leading-relaxed text-stone-500">
          Reuse canonical Library files, Pins, and saved concept versions.
          Source ownership and attribution stay with the original asset.
        </p>
        {assetLinks.map((link) => {
          const choice = choices.find(
            (item) => item.key === ideaAssetLinkKey(link),
          );
          const row = choice?.row;
          const source = safeExternalUrl(row?.url);
          return (
            <article
              key={link.id}
              className="flex flex-wrap items-start gap-3 rounded-xl border border-stone-200 p-3"
            >
              {row && <Preview workspaceId={props.workspaceId} userId={props.userId} item={row} className="w-full max-w-64 shrink-0" />}
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-medium">
                  {row?.title || "Asset unavailable"}
                </h4>
                <p className="mt-1 text-xs text-stone-500">
                  {choice?.kind || "Linked asset"}
                  {row?.version_number
                    ? ` · Version ${row.version_number}`
                    : ""}
                </p>
                {row && (
                  <p className="mt-1 text-xs text-stone-500">
                    Added by{" "}
                    {memberName(
                      data,
                      row.added_by || row.author_id || row.created_by,
                    )}
                    {row.source ? ` · ${row.source}` : ""}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {row && (
                    <button
                      type="button"
                      className="text-[#760D24] underline"
                      onClick={() =>
                        onNavigate(
                          `/w/${workspaceId}/library?item=${encodeURIComponent(row.id)}`,
                        )
                      }
                    >
                      Inspect provenance
                    </button>
                  )}
                  {source && (
                    <a
                      href={source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#760D24] underline"
                    >
                      Open original
                    </a>
                  )}
                </div>
              </div>
              <button
                type="button"
                className={button}
                disabled={Boolean(busy) || Boolean(data.workflowError)}
                aria-label={`Unlink ${row?.title || "unavailable asset"} from idea`}
                onClick={() =>
                  void mutate(
                    "unlinkIdeaAsset",
                    { id: link.id },
                    "Attachment unlinked. The Library asset was preserved.",
                  )
                }
              >
                Unlink
              </button>
            </article>
          );
        })}
        {!assetLinks.length && !data.workflowError && (
          <p className="text-sm text-stone-500">
            No references linked to this idea yet.
          </p>
        )}
        <div className="space-y-3 rounded-xl bg-[#F4EDE1]/40 p-4">
          <Label title="Find an existing Library asset">
            <input
              className={field}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, notes, or tags"
            />
          </Label>
          <Label title="Reference, file, or concept version">
            <select
              className={field}
              value={assetKey}
              onChange={(event) => setAssetKey(event.target.value)}
            >
              <option value="">Choose an asset</option>
              {available.map((choice) => (
                <option key={choice.key} value={choice.key}>
                  {choice.kind}: {choice.row.title || choice.row.id}
                  {choice.row.version_number
                    ? ` · v${choice.row.version_number}`
                    : ""}
                </option>
              ))}
            </select>
          </Label>
          {destination && (
            <p className="text-xs text-stone-600">
              {destination.kind === "Reference"
                ? "Source reference only. Linking does not grant image ownership or reuse permission."
                : `Added by ${memberName(data, destination.row.added_by || destination.row.author_id || destination.row.created_by)}. The original stays in Library.`}
            </p>
          )}
          <button
            type="button"
            className={button}
            disabled={
              !destination ||
              attached.has(assetKey) ||
              Boolean(busy) ||
              Boolean(data.workflowError)
            }
            onClick={() => {
              if (destination)
                void mutate(
                  "linkIdeaAsset",
                  { [destination.target]: destination.row.id },
                  "Asset linked to this idea.",
                );
            }}
          >
            <Plus className="size-4" />
            {busy === "linkIdeaAsset" ? "Linking…" : "Link selected asset"}
          </button>
          {!available.length && (
            <p className="text-xs text-stone-500">
              No unlinked assets match. Save a reference or upload a
              workspace-shared file in Library first.
            </p>
          )}
        </div>
      </div>
      <div className="space-y-3">
        <h3 className="font-semibold">Used in projects</h3>
        <p className="text-xs text-stone-500">
          One idea can inform several projects. Linking does not promote the
          idea, change its stage, or copy its assets.
        </p>
        {projectLinks.map((link) => {
          const project = (data.projects || []).find(
            (item: Row) => item.id === link.project_id,
          );
          return (
            <div
              key={link.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 p-3"
            >
              <button
                type="button"
                disabled={!project}
                className="text-left text-sm font-medium text-[#760D24] disabled:text-stone-500"
                onClick={() =>
                  onNavigate(
                    `/w/${workspaceId}/projects/${link.project_id}/overview`,
                  )
                }
              >
                {project?.title || project?.name || "Project unavailable"}
              </button>
              <button
                type="button"
                className={button}
                disabled={Boolean(busy) || Boolean(data.workflowError)}
                aria-label={`Unlink ${project?.title || "project"} from idea`}
                onClick={() =>
                  void mutate(
                    "unlinkIdeaProject",
                    { id: link.id },
                    "Project unlinked. Its content and the idea were preserved.",
                  )
                }
              >
                Unlink
              </button>
            </div>
          );
        })}
        {!projectLinks.length && !data.workflowError && (
          <p className="text-sm text-stone-500">
            No additional project links yet.
          </p>
        )}
        <Label title="Add to an existing project">
          <select
            className={field}
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">Choose a project</option>
            {projects
              .filter(
                (project) =>
                  !projectLinks.some((link) => link.project_id === project.id),
              )
              .map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title || project.name}
                </option>
              ))}
          </select>
        </Label>
        <button
          type="button"
          className={button}
          disabled={!projectId || Boolean(busy) || Boolean(data.workflowError)}
          onClick={() =>
            void mutate(
              "linkIdeaProject",
              { project_id: projectId },
              "Idea linked to the project. Its stage is unchanged.",
            )
          }
        >
          <Link2 className="size-4" />
          {busy === "linkIdeaProject" ? "Linking…" : "Link project"}
        </button>
      </div>
    </section>
  );
}

function TasksCollection(props: CollectionProps) {
  const { data, userId, search = "" } = props;
  const f = useFilters("tasks");
  const routed = useRoutedItem("tasks");
  const [draft, setDraft] = useState<Row | null | undefined>(undefined);
  const [defaultClosed, setDefaultClosed] = useState(false);
  const automatic = !routed.id && draft === undefined && !defaultClosed;
  const editing = routed.id
    ? (data.tasks || []).find((task: Row) => task.id === routed.id)
    : draft !== undefined
      ? draft
      : automatic
        ? data.tasks?.[0]
        : undefined;
  const setEditing = (item: Row | null | undefined) => {
    setDefaultClosed(true);
    if (item?.id) {
      routed.select(item.id);
      setDraft(undefined);
    } else {
      if (routed.id) routed.close();
      setDraft(item);
    }
  };
  const view = f.get("view", "board");
  const today = localDate(data.workspace?.timezone || "UTC");
  const all: Row[] = (data.tasks || []).map((task: Row) => ({
    ...task,
    status:
      task.blocked_reason && task.status !== "done" ? "blocked" : task.status,
  }));
  const items = all.filter(
    (task) =>
      matchesCollectionQuery(task, `${search} ${f.get("q")}`) &&
      (f.get("scope") !== "mine" || task.assigned_to === userId) &&
      (!f.get("owner") || task.assigned_to === f.get("owner")) &&
      (!f.get("project") || task.project_id === f.get("project")) &&
      (!f.get("priority") || task.priority === f.get("priority")) &&
      (!f.get("status") || taskStatus(task.status) === f.get("status")) &&
      (f.get("due") !== "overdue" || isTaskOverdue(task, today)),
  );
  function taskCard(task: Row) {
    const project = (data.projects || []).find(
      (project: Row) => project.id === task.project_id,
    );
    const threadIds = (data.threads || [])
      .filter((thread: Row) => thread.task_id === task.id)
      .map((thread: Row) => thread.id);
    const commentCount = (data.messages || []).filter((message: Row) =>
      threadIds.includes(message.thread_id),
    ).length;
    return (
      <button
        key={task.id}
        onClick={() => setEditing(task)}
        className={`fc-task-card ${editing?.id === task.id ? "is-selected" : ""}`}
        aria-pressed={editing?.id === task.id}
      >
        <div className="fc-task-card-main">
          {(task.cover_url || task.preview_url || task.image_url) && (
            <Preview workspaceId={props.workspaceId} userId={props.userId} item={task} className="fc-task-thumb" />
          )}
          <div>
            <h3>{task.title}</h3>
            <p>
              <FolderOpen size={14} />
              {project?.title ||
                project?.name ||
                task.category ||
                "Workspace task"}
            </p>
          </div>
        </div>
        <div className="fc-task-card-footer">
          <span>
            <Avatar data={data} id={task.assigned_to} />
            {memberName(data, task.assigned_to)}
          </span>
          <span className="fc-task-comments">
            <MessageCircle size={17} />
            {commentCount || <span className="sr-only">No comments</span>}
          </span>
          <MoreHorizontal size={18} />
        </div>
        {task.due_date && (
          <p
            className={`fc-task-due ${isTaskOverdue(task, today) ? "is-overdue" : ""}`}
          >
            {isTaskOverdue(task, today) ? "Overdue · " : "Due "}
            {task.due_date.slice(0, 10)}
          </p>
        )}
      </button>
    );
  }
  const visibleStatuses = all.some((task) => task.status === "blocked")
    ? statuses
    : statuses.filter((status) => status !== "blocked");
  return (
    <section
      className={`fc-collection fc-tasks ${editing?.id ? "fc-has-detail" : ""} ${automatic ? "fc-default-selection" : ""}`}
    >
      <div className="fc-task-workspace">
        <Title title="Turn feedback into forward motion." subtitle="">
          <span className="fc-workspace-pill">
            <i />
            {data.workspace?.name || "Workspace"}
          </span>
          <button
            className={`${primary} fc-task-new`}
            data-onboarding="task-create"
            onClick={() => setEditing(null)}
          >
            <Plus size={18} />
            New task
          </button>
        </Title>
        <div className="fc-task-toolbar">
          <div className="fc-segmented">
            {[
              ["mine", "My tasks"],
              ["", "All tasks"],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={f.get("scope") === value}
                onClick={() => f.set("scope", value)}
              >
                {label}
              </button>
            ))}
          </div>
          <Toggle
            board
            value={view}
            onChange={(value) => f.set("view", value)}
          />
          <select
            aria-label="Task owner"
            className={`${field} !w-auto`}
            value={f.get("owner")}
            onChange={(event) => f.set("owner", event.target.value)}
          >
            <option value="">All owners</option>
            {(data.members || []).map((member: Row) => (
              <option key={member.user_id} value={member.user_id}>
                {member.display_name}
              </option>
            ))}
          </select>
          <select
            aria-label="Task project"
            className={`${field} !w-auto`}
            value={f.get("project")}
            onChange={(event) => f.set("project", event.target.value)}
          >
            <option value="">All projects</option>
            {(data.projects || []).map((project: Row) => (
              <option key={project.id} value={project.id}>
                {project.title || project.name}
              </option>
            ))}
          </select>
          <details className="fc-filter-menu">
            <summary aria-label="More task filters">
              <SlidersHorizontal size={18} />
            </summary>
            <div className="fc-popover">
              <SearchField
                value={f.get("q")}
                onChange={(value) => f.set("q", value)}
                placeholder="Search tasks…"
              />
              <select
                aria-label="Task status"
                className={field}
                value={f.get("status")}
                onChange={(event) => f.set("status", event.target.value)}
              >
                <option value="">All statuses</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {statusName[status]}
                  </option>
                ))}
              </select>
              <select
                aria-label="Task priority"
                className={field}
                value={f.get("priority")}
                onChange={(event) => f.set("priority", event.target.value)}
              >
                <option value="">All priorities</option>
                {["low", "normal", "high", "urgent"].map((priority) => (
                  <option key={priority}>{priority}</option>
                ))}
              </select>
              <button
                aria-pressed={f.get("due") === "overdue"}
                className={button}
                onClick={() => f.set("due", f.get("due") ? "" : "overdue")}
              >
                Overdue
              </button>
            </div>
          </details>
        </div>
        {view === "board" ? (
          <div
            className={`fc-task-board ${visibleStatuses.length > 3 ? "fc-board-four" : ""}`}
          >
            {visibleStatuses.map((status) => (
              <section key={status} className="fc-task-column">
                <header>
                  <h2>
                    {statusName[status]}
                    <span>
                      {
                        items.filter(
                          (task) => taskStatus(task.status) === status,
                        ).length
                      }
                    </span>
                  </h2>
                  <button
                    className="fc-icon-button"
                    aria-label={`Add ${statusName[status].toLowerCase()} task`}
                    onClick={() => setEditing({ status })}
                  >
                    <MoreHorizontal size={20} />
                  </button>
                </header>
                <div className="fc-task-stack">
                  {items
                    .filter((task) => taskStatus(task.status) === status)
                    .map(taskCard)}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="fc-task-list">
            {items.map((task) => (
              <div key={task.id}>
                <span className="fc-list-status">
                  {statusName[taskStatus(task.status)] || task.status}
                </span>
                {taskCard(task)}
              </div>
            ))}
          </div>
        )}
        {!items.length && (
          <Empty
            text={
              all.length
                ? "No tasks match your filters."
                : "No tasks yet. Create a next step for the team."
            }
          />
        )}
        {routed.id && !editing && (
          <Empty text="This task is not available in this workspace." />
        )}
      </div>
      {editing !== undefined && (
        <TaskEditor
          key={editing?.id || "new"}
          {...props}
          task={editing || null}
          onClose={() => setEditing(undefined)}
        />
      )}
    </section>
  );
}

function TaskEditor({
  task,
  onClose,
  ...props
}: CollectionProps & { task: Row | null; onClose: () => void }) {
  const [title, setTitle] = useState(task?.title || "");
  const [details, setDetails] = useState(task?.details || "");
  const [status, setStatus] = useState(
    task?.blocked_reason && task.status !== "done"
      ? "blocked"
      : taskStatus(task?.status || "open"),
  );
  const [owner, setOwner] = useState(task?.assigned_to || "");
  const [due, setDue] = useState(task?.due_date?.slice(0, 10) || "");
  const [project, setProject] = useState(task?.project_id || "");
  const [priority, setPriority] = useState(task?.priority || "normal");
  const [checklist, setChecklist] = useState<
    Array<{ id: string; text: string; done: boolean }>
  >(task?.checklist || []);
  const [newItem, setNewItem] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestKey = useRef<string>("");
  const [reason, setReason] = useState(task?.blocked_reason || "");
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      requestKey.current ||= crypto.randomUUID();
      await props.onMutate(task?.id ? "updateTask" : "createTask", {
        ...(task?.id
          ? { id: task.id, expected_revision: task.revision }
          : { request_key: requestKey.current }),
        title: title.trim(),
        details,
        status: status === "blocked" ? "open" : status,
        assigned_to: owner || null,
        due_date: due || null,
        project_id: project || null,
        priority,
        checklist,
        blocked_reason: status === "blocked" ? reason : null,
      });
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const assetChoices = ideaAssetChoices(props.data);
  const attachments: Row[] = (task?.attachment_ids || [])
    .map(
      (id: string) => assetChoices.find((choice) => choice.row.id === id)?.row,
    )
    .filter(Boolean);
  const sourceThread =
    task?.source_thread_id ||
    (props.data.threads || []).find(
      (thread: Row) => thread.task_id === task?.id,
    )?.id;
  const content = (
    <form onSubmit={save} className="fc-task-form">
      <Notice text={error} />
      {!task?.id && (
        <Label title="Title">
          <input
            autoFocus
            required
            className={field}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={160}
          />
        </Label>
      )}
      <div className="fc-task-properties">
        <Label title="Status">
          <select
            className={field}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {statuses.map((value) => (
              <option key={value} value={value}>
                {statusName[value]}
              </option>
            ))}
          </select>
        </Label>
        <Label title="Assignee">
          <div className="fc-assignee-control">
            <Avatar data={props.data} id={owner} />
            <select
              className={field}
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
            >
              <option value="">Unassigned</option>
              {(props.data.members || []).map((member: Row) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.display_name}
                </option>
              ))}
            </select>
          </div>
        </Label>
        <Label title="Due date">
          <input
            type="date"
            className={field}
            value={due}
            onChange={(event) => setDue(event.target.value)}
          />
        </Label>
        <Label title="Project">
          <select
            className={field}
            value={project}
            onChange={(event) => setProject(event.target.value)}
          >
            <option value="">Workspace task</option>
            {(props.data.projects || []).map((item: Row) => (
              <option key={item.id} value={item.id}>
                {item.title || item.name}
              </option>
            ))}
          </select>
        </Label>
      </div>
      <Label title="Description">
        <textarea
          rows={3}
          className={field}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
        />
      </Label>
      {status === "blocked" && (
        <Label title="What is blocking this task?">
          <input
            required
            className={field}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Label>
      )}
      <fieldset className="fc-task-checklist">
        <legend>Checklist</legend>
        {checklist.map((item, index) => (
          <div key={item.id || index}>
            <input
              aria-label={item.text}
              type="checkbox"
              checked={item.done}
              onChange={(event) =>
                setChecklist(
                  checklist.map((step, at) =>
                    at === index
                      ? { ...step, done: event.target.checked }
                      : step,
                  ),
                )
              }
            />
            <span className={item.done ? "is-done" : ""}>{item.text}</span>
            <button
              type="button"
              className="fc-icon-button"
              aria-label={`Remove ${item.text}`}
              onClick={() =>
                setChecklist(checklist.filter((_, at) => at !== index))
              }
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <div className="fc-add-checklist">
          <input
            aria-label="New checklist item"
            className={field}
            value={newItem}
            onChange={(event) => setNewItem(event.target.value)}
            placeholder="Add a step"
          />
          <button
            type="button"
            className={button}
            disabled={!newItem.trim()}
            onClick={() => {
              setChecklist([
                ...checklist,
                { id: crypto.randomUUID(), text: newItem.trim(), done: false },
              ]);
              setNewItem("");
            }}
          >
            <Plus size={16} />
            Add item
          </button>
        </div>
      </fieldset>
      {(safeExternalUrl(task?.source_url) || sourceThread) && (
        <div className="fc-task-source">
          <h3>Source link</h3>
          {safeExternalUrl(task?.source_url) ? (
            <a
              className={button}
              href={safeExternalUrl(task?.source_url)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Link2 size={18} />
              Open source
              <ArrowUpRight size={15} />
            </a>
          ) : (
            <button
              type="button"
              className={button}
              onClick={() =>
                props.onNavigate(
                  `/w/${props.workspaceId}/conversations/${sourceThread}`,
                )
              }
            >
              <Link2 size={18} />
              From design discussion
              <ArrowUpRight size={15} />
            </button>
          )}
        </div>
      )}
      {attachments.length > 0 && (
        <div className="fc-task-attachments">
          <h3>Attachments</h3>
          <div>
            {attachments.map((asset: Row) => (
              <div key={asset.id} className="min-w-0">
                <Preview workspaceId={props.workspaceId} userId={props.userId} item={asset} />
                <button type="button" className="mt-2 text-sm underline" onClick={() => props.onNavigate(`/w/${props.workspaceId}/library?item=${encodeURIComponent(asset.id)}`)}>Inspect {asset.title}</button>
              </div>
            ))}
            <button
              type="button"
              className="fc-add-attachment"
              onClick={() =>
                props.onNavigate(`/w/${props.workspaceId}/library`)
              }
            >
              <Plus size={22} />
              Browse Library
            </button>
          </div>
        </div>
      )}
      <details className="fc-task-options">
        <summary>
          Task settings
          <ChevronDown size={14} />
        </summary>
        <div>
          {task?.id && (
            <Label title="Title">
              <input
                required
                className={field}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={160}
              />
            </Label>
          )}
          <Label title="Priority">
            <select
              className={field}
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            >
              {["low", "normal", "high", "urgent"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Label>
          <p>Completing a task does not approve a design or close a review.</p>
        </div>
      </details>
      {task?.id && <TaskDiscussion {...props} task={task} />}
      <div className="fc-task-save">
        <button className={primary} disabled={busy || !title.trim()}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
  return task?.id ? (
    <DetailPanel
      title={task.title}
      onClose={onClose}
      className="fc-task-detail"
    >
      {content}
    </DetailPanel>
  ) : (
    <Dialog title="New task" onClose={onClose}>
      {content}
    </Dialog>
  );
}
function TaskDiscussion({ task, ...props }: CollectionProps & { task: Row }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const request = useRef<string>("");
  const createdThread = useRef<string>("");
  const thread = (props.data.threads || []).find(
    (item: Row) => item.task_id === task.id,
  );
  async function send() {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError("");
    setSent(false);
    try {
      let threadId = thread?.id || createdThread.current;
      if (!threadId) {
        const result = (await props.onMutate("createThread", {
          title: task.title,
          task_id: task.id,
          ...(task.project_id ? { project_id: task.project_id } : {}),
        })) as Row;
        if (!result?.id)
          throw new Error(
            "The task discussion could not be opened. Your comment is still here.",
          );
        threadId = result.id;
        createdThread.current = result.id;
      }
      request.current ||= crypto.randomUUID();
      await props.onMutate("sendMessage", {
        thread_id: threadId,
        body: body.trim(),
        client_request_id: request.current,
      });
      setBody("");
      request.current = "";
      setSent(true);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="fc-task-discussion">
      <h3>Add comment</h3>
      <Notice text={error} />
      <div>
        <Avatar data={props.data} id={props.userId} />
        <input
          aria-label="Task comment"
          className={field}
          placeholder="Share an update or ask a question…"
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setSent(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="button"
          className="fc-icon-button"
          aria-label="Send comment"
          disabled={!body.trim() || busy}
          onClick={() => void send()}
        >
          <ArrowUpRight size={18} />
        </button>
      </div>
      {sent && <p role="status">Comment saved.</p>}
      {(thread?.id || createdThread.current) && (
        <button
          type="button"
          className="fc-text-link"
          onClick={() =>
            props.onNavigate(
              `/w/${props.workspaceId}/conversations/${thread?.id || createdThread.current}`,
            )
          }
        >
          Open discussion
        </button>
      )}
    </section>
  );
}

function LibraryCollection(props: CollectionProps) {
  const { data, search = "" } = props;
  const f = useFilters("library");
  const routed = useRoutedItem("library");
  const [adding, setAdding] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const action = new URLSearchParams(window.location.search).get("action");
    return action === "pin" || action === "upload" ? action : null;
  });
  const [notice, setNotice] = useState("");
  const [defaultClosed, setDefaultClosed] = useState(false);
  const view = f.get("view", "grid");
  const all: Row[] = [
    ...(data.references || []).map((r: Row) => ({ ...r, kind: "reference" })),
    ...(data.files || []).map((r: Row) => ({ ...r, kind: "upload" })),
    ...(data.versions || data.concept_versions || [])
      .filter((r: Row) => r.image_url)
      .map((r: Row) => ({
        ...r,
        title:
          r.title || `Concept version ${r.version_number || r.id.slice(0, 8)}`,
        kind:
          r.source_kind === "ai" || r.provenance?.type === "ai"
            ? "concept"
            : "version",
      })),
  ];
  const setSelected = (item: Row | null) => {
    setDefaultClosed(true);
    item ? routed.select(item.id) : routed.close();
  };
  const items = all
    .filter(
      (r) =>
        !(
          r.canonical_file_id &&
          (data.files || []).some(
            (file: Row) => file.id === r.canonical_file_id,
          )
        ) &&
        (f.get("archived") === "yes"
          ? Boolean(r.archived_at)
          : !r.archived_at) &&
        matchesCollectionQuery(r, `${search} ${f.get("q")}`) &&
        (!f.get("kind") ||
          assetVisualKind(r) === f.get("kind") ||
          (f.get("kind") === "approved" &&
            (data.decisions || []).some(
              (d: Row) =>
                (d.version_id === r.id ||
                  d.version_id === r.concept_version_id) &&
                (d.outcome || d.result) === "approved",
            ))) &&
        (!f.get("tag") || (r.tags || []).includes(f.get("tag"))),
    )
    .sort((a, b) =>
      f.get("sort") === "title"
        ? a.title.localeCompare(b.title)
        : String(b.created_at || "").localeCompare(
            String(a.created_at || ""),
          ) ||
          Number(a.provenance?.library_order ?? 1000) -
            Number(b.provenance?.library_order ?? 1000),
    );
  const automatic = !routed.id && !defaultClosed;
  const selected = routed.id
    ? all.find((item) => item.id === routed.id) || null
    : automatic
      ? items[0] || null
      : null;
  const tags = [...new Set<string>(all.flatMap((item) => item.tags || []))];
  return (
    <section
      className={`fc-collection fc-library ${selected ? "fc-has-detail" : ""} ${automatic ? "fc-default-selection" : ""}`}
    >
      <Title
        title="Inspiration, with a place to belong."
        subtitle="References, original work, and approved assets."
      >
        <details className="fc-library-add">
          <summary className={primary}>
            <Plus size={18} />
            Add to library
            <ChevronDown size={15} />
          </summary>
          <div className="fc-popover">
            <button onClick={() => setAdding("upload")}>
              <Upload size={16} />
              Upload a file
            </button>
            <button onClick={() => setAdding("external")}>
              <Link2 size={16} />
              Link a file
            </button>
          </div>
        </details>
        <button className={button} onClick={() => setAdding("pin")}>
          <Link2 size={18} />
          Paste Pin link
        </button>
      </Title>
      <Notice text={notice} />
      <div className="fc-library-layout">
        <div className="fc-library-workspace">
          <div className="fc-library-toolbar">
            <div className="fc-segmented">
              {[
                ["", "All"],
                ["reference", "References"],
                ["concept", "AI concepts"],
                ["upload", "Uploads"],
                ["approved", "Approved"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={f.get("kind") === value}
                  onClick={() => f.set("kind", value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="fc-tag-filters">
              {tags.slice(0, 4).map((tag) => (
                <button
                  key={tag}
                  aria-pressed={f.get("tag") === tag}
                  onClick={() => f.set("tag", f.get("tag") === tag ? "" : tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
          <div className="fc-library-display">
            <details className="fc-filter-menu">
              <summary aria-label="Search and filter library">
                <Search size={17} />
              </summary>
              <div className="fc-popover">
                <SearchField
                  value={f.get("q")}
                  onChange={(value) => f.set("q", value)}
                  placeholder="Search library…"
                />
                <button
                  className={button}
                  aria-pressed={f.get("archived") === "yes"}
                  onClick={() =>
                    f.set("archived", f.get("archived") ? "" : "yes")
                  }
                >
                  Archived
                </button>
                {tags.length > 4 && (
                  <select
                    aria-label="Library tag"
                    className={field}
                    value={f.get("tag")}
                    onChange={(event) => f.set("tag", event.target.value)}
                  >
                    <option value="">All tags</option>
                    {tags.map((tag) => (
                      <option key={tag}>{tag}</option>
                    ))}
                  </select>
                )}
              </div>
            </details>
            <select
              aria-label="Sort library"
              className={`${field} !w-auto`}
              value={f.get("sort")}
              onChange={(event) => f.set("sort", event.target.value)}
            >
              <option value="">Newest first</option>
              <option value="title">Title</option>
            </select>
            <Toggle value={view} onChange={(value) => f.set("view", value)} />
          </div>
          <div
            className={view === "grid" ? "fc-library-grid" : "fc-library-list"}
          >
          {items.map((item) => {
            const relatedFiles = matchingReferenceUploads(item, data.files || []);
            return (
              <article
                key={`${item.kind}-${item.id}`}
                className={`fc-library-card ${selected?.id === item.id ? "is-selected" : ""}`}
              >
                <div className="fc-library-image">
                  {/^(supabase-storage|blob):\/\//.test(String(item.url || "")) ? (
                    <Preview workspaceId={props.workspaceId} userId={props.userId} item={item} />
                  ) : <button type="button" className="block w-full" aria-label={`Inspect ${item.title}`} onClick={() => setSelected(item)}><Preview workspaceId={props.workspaceId} userId={props.userId} item={item} relatedFiles={relatedFiles} /></button>}
                  <span className="fc-library-card-more" aria-hidden="true">
                    <MoreHorizontal size={18} />
                  </span>
                </div>
                <div className="fc-library-copy">
                  <AssetKind item={item} />
                  <h2><button type="button" className="text-left hover:underline" aria-pressed={selected?.id === item.id} onClick={() => setSelected(item)}>{item.title}</button></h2>
                  <p>
                    {item.note ||
                      item.context_note ||
                      item.library_description ||
                      item.source ||
                      "Workspace asset"}
                  </p>
                  {relatedFiles.length > 0 && (
                    <span className="fc-related-upload-label">
                      {relatedFiles.length} saved collection {relatedFiles.length === 1 ? "image" : "images"}
                    </span>
                  )}
                  {(item.is_sample || item.provenance?.mockup_import) && (
                    <span className="fc-example-label">Starter collection</span>
                  )}
                  <CanvasDestination {...props} item={item} compact />
                </div>
              </article>
            );
          })}

          </div>
          {!items.length && (
            <Empty
              text={
                all.length
                  ? "No assets match these filters."
                  : "Keep inspiration and original work together. Upload photos, sketches, video or audio, or save your first Pin."
              }
            />
          )}
          {routed.id && !selected && (
            <Empty text="This asset is not available in this workspace." />
          )}
        </div>
        {selected && (
          <AssetInspector
            key={selected.id}
            {...props}
            item={selected}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
      {adding && (
        <LibraryComposer
          {...props}
          mode={adding}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null);
            setNotice("Saved to the shared library.");
          }}
        />
      )}
    </section>
  );
}

function AssetInspector({
  item,
  onClose,
  ...props
}: CollectionProps & { item: Row; onClose: () => void }) {
  const [title, setTitle] = useState(item.title || "");
  const [note, setNote] = useState(
    item.note || item.context_note || item.library_description || "",
  );
  const [tags, setTags] = useState<string>((item.tags || []).join(", "));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [actionNotice, setActionNotice] = useState("");
  const [destinationWorkspaceId, setDestinationWorkspaceId] = useState("");
  const [replacementOpen, setReplacementOpen] = useState(false);
  const [replacementAssetId, setReplacementAssetId] = useState("");
  const replacementUploads = useMediaUploads({
    workspaceId: props.workspaceId,
    userId: props.userId,
    demo: props.demo,
  });
  const isReference = item.kind === "reference";
  const fileRecord = isReference
    ? null
    : (props.data.files || []).find(
        (file: Row) =>
          file.id === (item.file_id || item.canonical_file_id || item.id),
      ) || null;
  const recordId = isReference ? item.id : fileRecord?.id || "";
  const recordRevision = isReference
    ? item.revision
    : fileRecord?.revision ?? item.revision;
  const creatorId = isReference
    ? item.author_id
    : item.kind === "upload"
      ? item.added_by
      : item.created_by;
  const canEdit =
    creatorId === props.userId &&
    (isReference || Boolean(fileRecord && fileRecord.added_by === props.userId));
  const canReplace =
    !props.demo && canEdit && item.kind === "upload" && Boolean(fileRecord);
  const copyWorkspaces = (props.workspaces || []).filter(
    (workspace) => workspace.id !== props.workspaceId && workspace.id !== "demo",
  );
  let canonicalPin: string | undefined;
  try {
    canonicalPin = canonicalPinUrl(item.url);
  } catch {}
  const original = safeExternalUrl(item.url);
  const owned =
    String(item.url || "").startsWith("supabase-storage://") ||
    String(item.url || "").startsWith("blob://");
  const usages = (props.data.nodes || []).filter(
    (n: Row) =>
      n.asset_id === item.id ||
      n.reference_id === item.id ||
      n.file_id === item.id ||
      n.version_id === item.id,
  );
  async function postLibraryAction(input: Record<string, unknown>) {
    const response = await fetch("/api/studio/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: props.workspaceId, input }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "The Library action failed.");
    return body.data as Row;
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!canEdit || !recordId) return;
    setError("");
    setBusy(true);
    try {
      await props.onMutate(
        isReference ? "updateReference" : "updateFile",
        {
          id: recordId,
          expected_revision: recordRevision,
          title,
          note,
          context_note: note,
          tags: normalizedTags(tags),
        },
      );
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function replaceUpload() {
    setError("");
    setBusy(true);
    try {
      let nextAssetId = replacementAssetId;
      if (!nextAssetId) {
        if (replacementUploads.items.length !== 1)
          throw new Error("Choose exactly one replacement file.");
        const uploaded = await replacementUploads.uploadAll();
        if (!uploaded.complete || uploaded.saved.length !== 1)
          throw new Error("The replacement upload needs attention. Retry it below.");
        nextAssetId = uploaded.saved[0].id;
        setReplacementAssetId(nextAssetId);
      }
      const result = await postLibraryAction({
        action: "replace",
        kind: "file",
        asset_id: recordId,
        replacement_asset_id: nextAssetId,
      });
      await props.onMutate("refresh", {});
      if (result.cleanupWarning)
        setActionNotice("The file was replaced, but the previous stored original needs cleanup.");
      setReplacementOpen(false);
      onClose();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  const usedProjects = [
    ...new Set<string>(usages.map((node: Row) => node.project_id)),
  ];
  const sample = item.is_sample || item.provenance?.mockup_import;
  const suppliedOriginal =
    item.media_origin === "bundled_original" ||
    item.provenance?.media_origin === "bundled_original" ||
    item.source_kind === "original";
  return (
    <DetailPanel
      title="Reference details"
      onClose={onClose}
      className="fc-asset-detail"
    >
      {canonicalPin ? (
        <PinterestEmbed
          url={canonicalPin}
          title={item.title || "Pinterest reference"}
        />
      ) : owned ? (
        <Preview workspaceId={props.workspaceId} userId={props.userId} item={item} className="w-full" eager />
      ) : (
        <button
          type="button"
          className="fc-asset-zoom"
          aria-label={`View full-size ${item.title}`}
          onClick={() => setZoomed(true)}
        >
          <Preview workspaceId={props.workspaceId} userId={props.userId} item={item} className="fc-asset-detail-image" eager />
          <span>
            <ExternalLink size={16} />
          </span>
        </button>
      )}
      {zoomed && (
        <Dialog
          title={item.title || "Full-size artwork"}
          onClose={() => setZoomed(false)}
        >
          <Preview
            workspaceId={props.workspaceId}
            userId={props.userId}
            item={{ ...item, preview_fit: "contain" }}
            className="h-[65dvh] w-full"
            eager
          />
        </Dialog>
      )}
      <div className="fc-asset-source">
        <h3>Source</h3>
        <div>
          <span className="fc-source-icon">
            <ImageIcon size={21} />
          </span>
          <div>
            <strong>
              {assetVisualKind(item) === "reference"
                ? "Reference"
                : assetVisualKind(item) === "upload"
                  ? "Upload"
                  : "Concept"}
            </strong>
            <p>{item.title}</p>
          </div>
        </div>
        {sample && (
          <span className="fc-example-label">
            Starter collection ·{" "}
            {suppliedOriginal
              ? "original supplied artwork"
              : "exploratory artwork"}
          </span>
        )}
      </div>
      {assetVisualKind(item) === "reference" && (
        <div className="fc-original-field">
          <h3>Pinterest link</h3>
          <div>
            <Link2 size={17} />
            <input
              aria-label="Pinterest source link"
              readOnly
              value={canonicalPin || ""}
              placeholder="No Pinterest source linked"
            />
          </div>
          <p>
            {canonicalPin
              ? "The original source is preserved with this reference."
              : "Add a real Pin from Library to preserve its original source."}
          </p>
        </div>
      )}
      <form className="fc-asset-form" onSubmit={save}>
        <Notice text={error} />
        <Label title="Notes">
          <textarea
            readOnly={!canEdit}
            rows={3}
            className={field}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Label>
        <fieldset className="fc-asset-tags">
          <legend>Tags</legend>
          <div>
            {tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean)
              .map((tag, index) => (
                <span key={`${tag}-${index}`}>
                  {tag}
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={`Remove ${tag} tag`}
                      onClick={() =>
                        setTags(
                          tags
                            .split(",")
                            .map((value) => value.trim())
                            .filter((value) => value !== tag)
                            .join(", "),
                        )
                      }
                    >
                      <X size={13} />
                    </button>
                  )}
                </span>
              ))}
          </div>
          {canEdit && (
            <details>
              <summary>
                <Plus size={14} />
                Edit tags
              </summary>
              <input
                aria-label="Tags, separated by commas"
                className={field}
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
            </details>
          )}
        </fieldset>
        <details className="fc-asset-metadata">
          <summary>
            {canEdit ? "Edit title and view provenance" : "View provenance"}
            <ChevronDown size={14} />
          </summary>
          <div>
            <Label title="Title">
              <input
                readOnly={!canEdit}
                className={field}
                value={title}
                required
                onChange={(event) => setTitle(event.target.value)}
              />
            </Label>
            <p>
              Added by{" "}
              {memberName(
                props.data,
                item.author_id || item.added_by || item.created_by,
              )}
              {item.created_at
                ? ` · ${new Date(item.created_at).toLocaleDateString()}`
                : ""}
            </p>
            {sample && (
              <p>
                {suppliedOriginal
                  ? "This original artwork was supplied for the starter collection. Its source file is preserved."
                  : "This exploratory artwork was recreated from the supplied mockup. It is not a retrieved Pinterest Pin or a recorded in-app generation."}
              </p>
            )}
            {item.provenance?.note && <p>{item.provenance.note}</p>}
          </div>
        </details>
        {canEdit && (
          <button
            className={`${button} fc-save-asset`}
            disabled={busy || !title.trim()}
          >
            {busy ? "Saving…" : "Save details"}
          </button>
        )}
      </form>
        <div className="fc-library-owner-actions" aria-labelledby="fc-library-access-title">
          <h3 id="fc-library-access-title">Library access</h3>
          <p>
            {item.permission_scope === "restricted"
              ? "Private to you"
              : "Shared with this team"}
            {canEdit ? " · You manage this asset" : " · Only its creator can edit or remove it"}
          </p>
          {!props.demo && canEdit && recordId && (
            <div className="fc-library-owner-controls">
              <button
                type="button"
                className={button}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await postLibraryAction({
                      action: "visibility",
                      kind: isReference ? "reference" : "file",
                      asset_id: recordId,
                      private: item.permission_scope !== "restricted",
                    });
                    await props.onMutate("refresh", {});
                    setActionNotice(
                      item.permission_scope === "restricted"
                        ? "Shared with your team."
                        : "Made private. Only you can access it.",
                    );
                  } catch (cause) {
                    setError(errorText(cause));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {item.permission_scope === "restricted" ? <Eye size={16} /> : <EyeOff size={16} />}
                {item.permission_scope === "restricted" ? "Share with team" : "Make private"}
              </button>
              {canReplace && (
                <button
                  type="button"
                  className={button}
                  disabled={busy || replacementUploads.busy}
                  onClick={() => setReplacementOpen((open) => !open)}
                >
                  <Replace size={16} />
                  Replace upload
                </button>
              )}
              <button
                type="button"
                className={`${button} fc-library-delete`}
                disabled={busy}
                onClick={async () => {
                  const placements = usages.length;
                  const detail = placements
                    ? ` This also removes ${placements} linked canvas ${placements === 1 ? "placement" : "placements"}.`
                    : "";
                  if (!window.confirm(`Permanently delete “${item.title}”?${detail} This cannot be undone.`)) return;
                  setBusy(true);
                  setError("");
                  try {
                    const result = await postLibraryAction({
                      action: "delete",
                      kind: isReference ? "reference" : "file",
                      asset_id: recordId,
                    });
                    await props.onMutate("refresh", {});
                    if (result.cleanupWarning)
                      setActionNotice("The asset was deleted, but its stored media needs cleanup.");
                    onClose();
                  } catch (cause) {
                    setError(errorText(cause));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Trash2 size={16} />
                Permanently delete
              </button>
            </div>
          )}
          {!props.demo && copyWorkspaces.length > 0 && (
            <div className="fc-library-copy-controls">
              <label>
                Copy an independent duplicate to
                <select
                  className={field}
                  value={destinationWorkspaceId}
                  onChange={(event) => setDestinationWorkspaceId(event.target.value)}
                >
                  <option value="">Choose a workspace</option>
                  {copyWorkspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={button}
                disabled={busy || !destinationWorkspaceId}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await postLibraryAction({
                      action: "copy",
                      kind: isReference ? "reference" : "file",
                      asset_id: recordId || item.id,
                      destination_workspace_id: destinationWorkspaceId,
                    });
                    const destination = copyWorkspaces.find((workspace) => workspace.id === destinationWorkspaceId);
                    props.onNavigate(`/w/${destinationWorkspaceId}/library`);
                    setActionNotice(`Independent copy added to ${destination?.name || "the destination workspace"}.`);
                  } catch (cause) {
                    setError(errorText(cause));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Copy size={16} />
                Copy to workspace
              </button>
            </div>
          )}
          {actionNotice && <p className="fc-library-action-notice" role="status">{actionNotice}</p>}
          {replacementOpen && canReplace && (
            <div className="fc-library-replacement">
              <p>Upload one new original. Canvas placements stay attached to this Library item.</p>
              <MediaUploadQueue
                uploads={replacementUploads}
                disabled={busy}
                compact
                title="Replacement original"
                description="The current Library item and its canvas placements remain in place; the new original replaces its media."
              />
              <div className="fc-library-owner-controls">
                <button
                  type="button"
                  className={primary}
                  disabled={busy || replacementUploads.busy || !replacementUploads.items.length}
                  onClick={() => void replaceUpload()}
                >
                  {busy ? "Replacing upload…" : "Replace original"}
                </button>
                <button
                  type="button"
                  className={button}
                  disabled={busy || replacementUploads.busy}
                  onClick={() => {
                    setReplacementOpen(false);
                    setReplacementAssetId("");
                    replacementUploads.items.forEach((upload) => replacementUploads.remove(upload.id));
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="fc-asset-usages">
          <h3>Used in</h3>
        {usedProjects.length ? (
          usedProjects.map((projectId) => {
            const project = (props.data.projects || []).find(
              (row: Row) => row.id === projectId,
            );
            const count = usages.filter(
              (node: Row) => node.project_id === projectId,
            ).length;
            return (
              <button
                key={projectId}
                onClick={() =>
                  props.onNavigate(
                    `/w/${props.workspaceId}/projects/${projectId}/canvas`,
                  )
                }
              >
                {project && <Preview workspaceId={props.workspaceId} userId={props.userId} item={project} />}
                <span>
                  <strong>
                    {project?.title || project?.name || "Project canvas"}
                  </strong>
                  <small>
                    Project · {count}{" "}
                    {count === 1 ? "canvas placement" : "canvas placements"}
                  </small>
                </span>
                <ArrowUpRight size={16} />
              </button>
            );
          })
        ) : (
          <p>No linked canvas nodes yet.</p>
        )}
      </div>
      <CanvasDestination {...props} item={item} />
      <div className="fc-original-actions">
        {original ? (
          <a
            className={button}
            href={original}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={19} />
            {sample ? "Open supplied asset" : "Open original"}
          </a>
        ) : (
          <>
            <button className={button} disabled>
              <ExternalLink size={19} />
              Open original
            </button>
            <p>Link an original source to enable.</p>
          </>
        )}
      </div>
      <details className="fc-asset-more">
        <summary>
          More actions
          <ChevronDown size={14} />
        </summary>
        <div>
          {original && (
            <button
              className={button}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(original);
                  setCopied(true);
                } catch {
                  setError(
                    "Clipboard unavailable. Use Open original to copy the source URL.",
                  );
                }
              }}
            >
              <Copy size={16} />
              {copied ? "Copied" : "Copy source link"}
            </button>
          )}
          {item.kind === "reference" && (
            <button
              className={button}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await props.onMutate(
                    item.archived_at ? "restoreReference" : "archiveReference",
                    { id: item.id, expected_revision: item.revision },
                  );
                  onClose();
                } catch (cause) {
                  setError(errorText(cause));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Archive size={16} />
              {item.archived_at ? "Restore reference" : "Archive reference"}
            </button>
          )}
          {owned && (
            <a
              className={button}
              href={`/api/studio/media?id=${encodeURIComponent(item.id)}&variant=original&download=1`}
              download
            >
              Download upload
            </a>
          )}
          <button
            className={button}
            onClick={() => props.onNavigate(`/w/${props.workspaceId}/projects`)}
          >
            <FolderOpen size={16} />
            Open project canvases
          </button>
        </div>
      </details>
      {assetVisualKind(item) === "reference" && (
        <div className="fc-source-notice">
          <Info size={20} />
          <div>
            <strong>
              {canonicalPin ? "Source attribution" : "Source unavailable?"}
            </strong>
            <p>
              {canonicalPin
                ? "Saving a reference does not grant image ownership or reuse permission."
                : "Keep the link and your notes. A starter reference does not establish source ownership."}
            </p>
          </div>
        </div>
      )}
    </DetailPanel>
  );
}

function LibraryLinkComposer({
  mode,
  onClose,
  onSaved,
  ...props
}: CollectionProps & {
  mode: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const destinationId = useSearchParams().get("project") || "";
  const destination = (props.data.projects || []).find(
    (p: Row) => p.id === destinationId,
  );
  const savedAsset = useRef<{ id: string; kind: string } | null>(null);
  const linked = useRef(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [existing, setExisting] = useState<Row | null>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (destinationId && !destination)
        throw new Error(
          "The destination project is not available in this workspace.",
        );
      if (!savedAsset.current) {
        if (mode === "pin") {
          const canonical = canonicalPinUrl(url);
          const match = (props.data.references || []).find((r: Row) => {
            try {
              return canonicalPinUrl(r.url) === canonical;
            } catch {
              return false;
            }
          });
          if (match) {
            if (!destinationId) {
              setExisting(match);
              return;
            }
            savedAsset.current = { id: match.id, kind: "reference" };
          } else {
            const result: any = await props.onMutate("importPin", {
              url: canonical,
              title: title.trim() || "Pinterest reference",
              note,
              tags: normalizedTags(tags),
            });
            if (!result?.id)
              throw new Error(
                "The reference was saved but its ID was not returned. Refresh Library before retrying.",
              );
            savedAsset.current = { id: result.id, kind: "reference" };
          }
        } else if (mode === "external") {
          const safe = safeExternalUrl(url);
          if (!safe) throw new Error("Enter a valid HTTPS file URL.");
          const result: any = await props.onMutate("createExternalFile", {
            title: title.trim(),
            url: safe,
            context_note: note,
            tags: normalizedTags(tags),
            provider:
              new URL(safe).hostname === "drive.proton.me"
                ? "proton_drive"
                : "other",
          });
          if (!result?.id)
            throw new Error(
              "The file ID was not returned. Refresh Library before retrying.",
            );
          savedAsset.current = { id: result.id, kind: "upload" };
        }
      }
      if (destinationId && savedAsset.current && !linked.current) {
        const asset = savedAsset.current;
        const key = asset.kind === "reference" ? "reference_id" : "file_id";
        const exists = (props.data.nodes || []).some(
          (n: Row) => n.project_id === destinationId && n[key] === asset.id,
        );
        if (!exists)
          await props.onMutate("saveCanvas", {
            project_id: destinationId,
            [key]: asset.id,
            body: note || title || "Linked asset",
            x: 40,
            y: 40,
            width: 280,
            height: 220,
            expected_revision: 0,
          });
        linked.current = true;
      }
      onSaved();
      if (destinationId)
        props.onNavigate(
          `/w/${props.workspaceId}/projects/${destinationId}/canvas`,
        );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={
        mode === "pin"
          ? "Save a Pinterest Pin"
          : mode === "external"
            ? "Link a shared file"
            : "Save a source link"
      }
      onClose={onClose}
    >
      <form className="space-y-4" onSubmit={save}>
        <Notice text={error} />
        {savedAsset.current && error && (
          <p className="text-sm text-stone-600">
            The asset is already saved in Library. Retrying will reuse it when
            linking the canvas.
          </p>
        )}
        <p className="text-xs text-stone-500">
          Destination: Library
          {destination
            ? ` and ${destination.title || destination.name} canvas`
            : ""}
        </p>
        <Label
            title={mode === "pin" ? "Full Pinterest Pin URL" : "HTTPS file URL"}
          >
            <input
              autoFocus
              type="url"
              required
              className={field}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setExisting(null);
              }}
              placeholder={
                mode === "pin"
                  ? "https://www.pinterest.com/pin/123456789/"
                  : "https://…"
              }
            />
          </Label>
        <Label title="Title">
          <input
            className={field}
            required={mode === "external"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={160}
          />
        </Label>
        <Label
          title={
            mode === "pin"
              ? "What do you like about this?"
              : "Context and notes"
          }
        >
          <textarea
            rows={3}
            className={field}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Label>
        <Label
          title={
            mode === "upload"
              ? "Tags: Inspiration, Silhouette, Materials, Color, Product, Dev handoff"
              : "Tags, separated by commas"
          }
        >
          <input
            className={field}
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </Label>
        {existing && (
          <div className="rounded-lg bg-[#F4EDE1] p-3">
            <p className="text-sm">
              Already saved as “{existing.title}”. The original notes have not
              been changed.
            </p>
            <a
              href={safeExternalUrl(existing.url)}
              target="_blank"
              rel="noopener noreferrer"
              className={`${button} mt-2`}
            >
              Open existing Pin
            </a>
            <button
              type="button"
              className={`${button} ml-2 mt-2`}
              onClick={onClose}
            >
              Keep existing reference
            </button>
          </div>
        )}
        <button className={primary} disabled={busy}>
          {busy
            ? "Saving…"
            : destination
              ? "Save and add to canvas"
              : "Save to Library"}
        </button>
        {mode === "pin" && (
          <p className="text-xs text-stone-500">
            Short Pin links must be opened in Pinterest first. Paste the full
            Pin URL; no Pinterest account connection is required.
          </p>
        )}
      </form>
    </Dialog>
  );
}

function LibraryComposer(props: CollectionProps & { mode: string; onClose: () => void; onSaved: () => void }) {
  return props.mode === "upload" ? <LibraryMediaComposer {...props} /> : <LibraryLinkComposer {...props} />;
}
function LibraryMediaComposer({ onClose, onSaved, ...props }: CollectionProps & { onClose: () => void; onSaved: () => void }) {
  const destinationId = useSearchParams().get("project") || "";
  const destination = (props.data.projects || []).find((row: Row) => row.id === destinationId && (!row.workspace_id || row.workspace_id === props.workspaceId));
  const uploads = useMediaUploads({ workspaceId: props.workspaceId, userId: props.userId, demo: props.demo });
  const latest = useRef(props);
  latest.current = props;
  const linked = useRef(new Set<string>());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const leave = useCreatorNavigationGuard({ dirty: uploads.hasUnfinished, busy: busy || uploads.busy, onBlocked: setError });
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || uploads.busy) return;
    setBusy(true); setError("");
    try {
      if (destinationId && !destination) throw new Error("The destination project is not available in this workspace.");
      if (!uploads.items.length) throw new Error("Choose at least one media file.");
      const outcome = await uploads.uploadAll(destinationId ? { onRegistered: async (registered, item) => {
        if (linked.current.has(registered.id)) return;
        const exists = (data: Row) => (data.nodes || []).some((node: Row) => node.project_id === destinationId && node.file_id === registered.id && (!node.workspace_id || node.workspace_id === props.workspaceId));
        if (!exists(latest.current.data)) {
          try {
            await latest.current.onMutate("saveCanvas", { project_id: destinationId, file_id: registered.id, body: item.metadata.contextNote || item.metadata.title || item.file.name, x: 40, y: 40, width: 280, height: 220, expected_revision: 0 });
          } catch (cause) {
            const refreshed = await latest.current.onMutate("refresh", {}) as Row | null;
            if (!exists(refreshed || latest.current.data)) throw cause;
          }
        }
        linked.current.add(registered.id);
      } } : {});
      if (!outcome.complete) throw new Error("Some originals or canvas links need attention. Retry below; successful originals remain saved in Library.");
      await props.onMutate("refresh", {});
      leave.complete(() => {
        onSaved();
        if (destinationId) props.onNavigate(`/w/${props.workspaceId}/projects/${destinationId}/canvas`);
      });
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  return <Dialog title="Upload photos, video and audio" onClose={() => leave(onClose)}>
    <form className="space-y-4" onSubmit={save} aria-busy={busy || uploads.busy}>
      <Notice text={error} />
      <p className="text-sm text-stone-600">Destination: Library{destination ? ` and ${destination.title || destination.name} canvas` : ""}. Added by {memberName(props.data, props.userId)}.</p>
      <MediaUploadQueue uploads={uploads} disabled={busy} compact description="Originals are preserved. Photos, sketches, videos and audio get separate upload and shared-preview statuses." />
      <div className="flex gap-2">
        <button className={primary} disabled={busy || uploads.busy || !uploads.items.length}>{busy ? "Saving originals…" : destination ? "Save and add to canvas" : "Save to Library"}</button>
        <button type="button" className={button} onClick={() => leave(onClose)}>Cancel</button>
      </div>
    </form>
  </Dialog>;
}
