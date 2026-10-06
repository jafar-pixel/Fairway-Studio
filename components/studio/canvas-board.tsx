"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent, type ReactNode } from "react";
import {
  Check,
  Columns2,
  Copy,
  Crop,
  FilePlus2,
  ImagePlus,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  StickyNote,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { mediaKind, mediaPreviewUrl } from "@/lib/studio/media";

type Row = Record<string, any>;
type Rect = { x: number; y: number; width: number; height: number };
type ItemKind = "version" | "reference" | "file" | "note" | "direction";
type BoardItem = {
  key: string;
  kind: ItemKind;
  source: Row | null;
  node: Row | null;
  title: string;
  body: string;
  image: string;
  rect: Rect;
};
type Props = {
  projectId: string;
  demo: boolean;
  versions: Row[];
  nodes: Row[];
  references: Row[];
  files: Row[];
  onMutate: (operation: string, input: Record<string, unknown>) => Promise<unknown>;
};
type DragState = {
  key: string;
  pointerId: number;
  startX: number;
  startY: number;
  rect: Rect;
  action: "move" | "resize";
};

const directionPrefix = "::direction::";
const cardButton =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[#ded9d3] bg-white px-3 text-sm font-medium text-[#282521] transition hover:bg-[#f6f2ed] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#760d24]";
const titleOf = (row?: Row | null) => row?.title || row?.name || "Untitled";
const descriptionOf = (row?: Row | null) =>
  row?.description || row?.context_note || row?.body || row?.note || "";
const pictureOf = (row?: Row | null) =>
  row?.image_url || row?.preview_url || row?.thumbnail_url || row?.cover_url || "";
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value : []);
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function assetPicture(row: Row | null, kind: ItemKind) {
  if (!row) return "";
  const direct = pictureOf(row);
  if (direct) return direct;
  if (kind === "file" && row.id && row.url?.startsWith("supabase-storage://workspace-media/")) {
    return mediaPreviewUrl(row.id);
  }
  return typeof row.url === "string" && /^https:\/\//i.test(row.url)
    ? row.url
    : "";
}

function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        closeRef.current();
      }}
      className={`fp-board-dialog m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] ${wide ? "max-w-5xl" : "max-w-xl"} overflow-y-auto rounded-2xl border border-[#e2ddd6] bg-[#fffdfa] p-0 text-[#282521] shadow-2xl backdrop:bg-black/50`}
    >
      <div className="flex items-center justify-between border-b border-[#e8e2db] px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button className={cardButton} onClick={onClose} aria-label="Close dialog">
          <X size={16} />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}

export function CanvasBoard({
  projectId,
  demo,
  versions,
  nodes,
  references,
  files,
  onMutate,
}: Props) {
  const [zoom, setZoom] = useState(0.8);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [rectOverrides, setRectOverrides] = useState<Record<string, Rect>>({});
  const [dialog, setDialog] = useState<"" | "assets" | "note" | "direction" | "edit" | "crop" | "compare">("");
  const [assetType, setAssetType] = useState<"references" | "files">("references");
  const [assetSearch, setAssetSearch] = useState("");
  const [editItem, setEditItem] = useState<BoardItem | null>(null);
  const [editBody, setEditBody] = useState("");
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteBody, setNewNoteBody] = useState("");
  const [newDirection, setNewDirection] = useState("");
  const [cropRatio, setCropRatio] = useState("square");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const items = useMemo(() => {
    const next: BoardItem[] = [];
    const versionNodes = new Set<string>();
    versions.forEach((version, index) => {
      const node = nodes.find(
        (candidate) =>
          candidate.version_id === version.id && candidate.kind !== "annotation",
      ) || null;
      if (node) versionNodes.add(node.id);
      const key = node ? `node:${node.id}` : `version:${version.id}`;
      next.push({
        key,
        kind: "version",
        source: version,
        node,
        title: `${titleOf(version)} · v${version.version_number || version.version || 1}`,
        body: node?.body || descriptionOf(version),
        image: assetPicture(version, "version"),
        rect: {
          x: Number(node?.x ?? 80 + (index % 3) * 350),
          y: Number(node?.y ?? 90 + Math.floor(index / 3) * 390),
          width: Number(node?.width ?? 300),
          height: Number(node?.height ?? 360),
        },
      });
    });

    nodes.forEach((node, index) => {
      if (node.kind === "annotation" || versionNodes.has(node.id)) return;
      const rect = {
        x: Number(node.x ?? 90 + (index % 3) * 350),
        y: Number(node.y ?? 100 + Math.floor(index / 3) * 320),
        width: Number(node.width ?? 300),
        height: Number(node.height ?? 250),
      };
      if (node.reference_id) {
        const source = references.find((reference) => reference.id === node.reference_id) || null;
        next.push({
          key: `node:${node.id}`,
          kind: "reference",
          source,
          node,
          title: titleOf(source),
          body: node.body || descriptionOf(source),
          image: assetPicture(source, "reference"),
          rect,
        });
      } else if (node.file_id) {
        const source = files.find((file) => file.id === node.file_id) || null;
        next.push({
          key: `node:${node.id}`,
          kind: "file",
          source,
          node,
          title: titleOf(source),
          body: node.body || descriptionOf(source),
          image: assetPicture(source, "file"),
          rect,
        });
      } else {
        const isDirection = String(node.body || "").startsWith(directionPrefix);
        const body = String(node.body || "");
        next.push({
          key: `node:${node.id}`,
          kind: isDirection ? "direction" : "note",
          source: null,
          node,
          title: isDirection ? body.slice(directionPrefix.length) : body.split("\n")[0] || "Canvas note",
          body: isDirection ? "" : body,
          image: "",
          rect: {
            ...rect,
            width: isDirection ? Math.max(480, rect.width) : rect.width,
            height: isDirection ? Math.max(320, rect.height) : rect.height,
          },
        });
      }
    });

    return next
      .map((item) => ({
        ...item,
        rect: rectOverrides[item.key] || item.rect,
      }))
      .sort((a, b) => Number(b.kind === "direction") - Number(a.kind === "direction"));
  }, [versions, nodes, references, files, rectOverrides]);

  const selected = items.filter((item) => selectedKeys.includes(item.key));
  const availableReferences = references.filter(
    (reference) =>
      !reference.archived_at &&
      `${titleOf(reference)} ${descriptionOf(reference)} ${reference.tags?.join?.(" ") || ""}`
        .toLowerCase()
        .includes(assetSearch.toLowerCase()),
  );
  const availableFiles = files.filter(
    (file) =>
      file.permission_scope === "workspace" &&
      `${titleOf(file)} ${descriptionOf(file)} ${file.tags?.join?.(" ") || ""}`
        .toLowerCase()
        .includes(assetSearch.toLowerCase()),
  );

  function rectFor(item: BoardItem) {
    return rectOverrides[item.key] || item.rect;
  }

  async function persist(item: BoardItem, patch: Partial<Rect> & { body?: string }) {
    const rect = { ...rectFor(item), ...patch };
    setRectOverrides((current) => ({ ...current, [item.key]: rect }));
    setSaving(true);
    setError("");
    setStatus("");
    const source = item.source;
    const input: Record<string, unknown> = {
      project_id: projectId,
      ...(item.node
        ? { id: item.node.id, expected_revision: item.node.revision ?? 0 }
        : {
            expected_revision: 0,
            ...(item.kind === "version" && source ? { version_id: source.id, kind: "note" } : {}),
            ...(item.kind === "reference" && source ? { reference_id: source.id, kind: "reference" } : {}),
            ...(item.kind === "file" && source ? { file_id: source.id, kind: "file" } : {}),
            ...(["note", "direction"].includes(item.kind) ? { kind: "note" } : {}),
          }),
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      ...(patch.body !== undefined ? { body: patch.body } : item.node ? {} : { body: item.body }),
    };
    try {
      await onMutate("saveCanvas", input);
      setStatus(demo ? "Saved in this demo session" : "Saved to the project canvas");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this canvas item.");
      setRectOverrides((current) => {
        const next = { ...current };
        delete next[item.key];
        return next;
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function addAsset(source: Row, kind: "reference" | "file") {
    const item: BoardItem = {
      key: `new:${kind}:${source.id}`,
      kind,
      source,
      node: null,
      title: titleOf(source),
      body: descriptionOf(source),
      image: assetPicture(source, kind),
      rect: {
        x: 90 + (items.length % 4) * 330,
        y: 100 + Math.floor(items.length / 4) * 350,
        width: 290,
        height: 330,
      },
    };
    const saved = await persist(item, {});
    if (saved) {
      setDialog("");
      setStatus(`${kind === "reference" ? "Reference" : "File"} added to the board`);
    }
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = [newNoteTitle.trim(), newNoteBody.trim()].filter(Boolean).join("\n\n");
    if (!body) return;
    const item: BoardItem = {
      key: `new:note:${crypto.randomUUID()}`,
      kind: "note",
      source: null,
      node: null,
      title: newNoteTitle.trim() || "Canvas note",
      body,
      image: "",
      rect: { x: 90 + (items.length % 4) * 330, y: 100 + Math.floor(items.length / 4) * 350, width: 280, height: 220 },
    };
    if (await persist(item, { body })) {
      setNewNoteTitle("");
      setNewNoteBody("");
      setDialog("");
    }
  }

  async function addDirection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newDirection.trim();
    if (!name) return;
    const item: BoardItem = {
      key: `new:direction:${crypto.randomUUID()}`,
      kind: "direction",
      source: null,
      node: null,
      title: name,
      body: "",
      image: "",
      rect: { x: 50 + (items.length % 2) * 820, y: 60 + Math.floor(items.length / 2) * 620, width: 760, height: 560 },
    };
    if (await persist(item, { body: `${directionPrefix}${name}` })) {
      setNewDirection("");
      setDialog("");
    }
  }

  async function duplicate(item: BoardItem) {
    const rect = rectFor(item);
    const copy: BoardItem = {
      ...item,
      key: `copy:${crypto.randomUUID()}`,
      node: null,
      rect: { ...rect, x: rect.x + 34, y: rect.y + 34 },
    };
    if (await persist(copy, { body: item.node?.body || item.body })) {
      setSelectedKeys([]);
    }
  }

  function openEdit(item: BoardItem) {
    setEditItem(item);
    setEditBody(item.node?.body || item.body || "");
    setDialog("edit");
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editItem) return;
    const body = editItem.kind === "direction"
      ? `${directionPrefix}${editBody.trim()}`
      : editBody.trim();
    if (await persist(editItem, { body })) setDialog("");
  }

  function openCrop(item: BoardItem) {
    const rect = rectFor(item);
    const ratio = rect.width / Math.max(1, rect.height);
    setCropRatio(ratio > 1.2 ? "landscape" : ratio < 0.9 ? "portrait" : "square");
    setEditItem(item);
    setDialog("crop");
  }

  async function saveCrop() {
    if (!editItem) return;
    const rect = rectFor(editItem);
    const ratio = cropRatio === "landscape" ? 1.45 : cropRatio === "portrait" ? 0.78 : 1;
    const width = clamp(rect.width, 180, 520);
    if (await persist(editItem, { width, height: Math.round(width / ratio) })) setDialog("");
  }

  function beginPointer(event: PointerEvent<HTMLElement>, item: BoardItem, action: DragState["action"]) {
    if (event.button !== 0 || saving) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const state: DragState = {
      key: item.key,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      rect: rectFor(item),
      action,
    };
    dragRef.current = state;
    setDragState(state);
  }

  function movePointer(event: PointerEvent<HTMLDivElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const ratio = zoom || 1;
    const dx = (event.clientX - current.startX) / ratio;
    const dy = (event.clientY - current.startY) / ratio;
    const next = current.action === "move"
      ? { ...current.rect, x: Math.round(clamp(current.rect.x + dx, 0, 2200)), y: Math.round(clamp(current.rect.y + dy, 0, 1450)) }
      : { ...current.rect, width: Math.round(clamp(current.rect.width + dx, 180, 680)), height: Math.round(clamp(current.rect.height + dy, 170, 900)) };
    setRectOverrides((currentRects) => ({ ...currentRects, [current.key]: next }));
  }

  function endPointer(event: PointerEvent<HTMLDivElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragState(null);
    const item = items.find((candidate) => candidate.key === current.key);
    if (!item) return;
    const finalRect = rectOverrides[current.key] || item.rect;
    if (finalRect.x !== current.rect.x || finalRect.y !== current.rect.y || finalRect.width !== current.rect.width || finalRect.height !== current.rect.height) {
      void persist(item, finalRect);
    }
  }

  const activeAssets = assetType === "references" ? availableReferences : availableFiles;

  return (
    <section className="fp-board-workspace" aria-label="Project exploration board">
      <div className="fp-board-toolbar">
        <div className="fp-board-tool-group">
          <button className={cardButton} onClick={() => { setAssetType("references"); setDialog("assets"); setAssetSearch(""); }}>
            <ImagePlus size={16} /> Add reference
          </button>
          <button className={cardButton} onClick={() => { setAssetType("files"); setDialog("assets"); setAssetSearch(""); }}>
            <FilePlus2 size={16} /> Add file
          </button>
          <button className={cardButton} onClick={() => setDialog("note")}>
            <StickyNote size={16} /> Note
          </button>
          <button className={cardButton} onClick={() => setDialog("direction")}>
            <Plus size={16} /> New direction
          </button>
        </div>
        <div className="fp-board-tool-group fp-board-selection-tools">
          {selected.length === 1 && (
            <>
              <button className={cardButton} disabled={saving} onClick={() => void duplicate(selected[0])}>
                <Copy size={15} /> Copy
              </button>
              <button className={cardButton} disabled={saving} onClick={() => openEdit(selected[0])}>
                <Pencil size={15} /> Edit
              </button>
              {selected[0].image && (
                <button className={cardButton} disabled={saving} onClick={() => openCrop(selected[0])}>
                  <Crop size={15} /> Crop
                </button>
              )}
            </>
          )}
          <button className={cardButton} disabled={selected.length !== 2} onClick={() => setDialog("compare")}>
            <Columns2 size={16} /> Compare{selected.length ? ` (${selected.length}/2)` : ""}
          </button>
        </div>
        <div className="fp-board-zoom" aria-label="Board zoom controls">
          <button className={cardButton} aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.1).toFixed(2))))}>
            <ZoomOut size={16} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button className={cardButton} aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.2, Number((value + 0.1).toFixed(2))))}>
            <ZoomIn size={16} />
          </button>
        </div>
      </div>
      <div className="fp-board-help-row">
        <span>Drag the handle to arrange ideas. Add separate directions to compare campaign routes.</span>
        <span className="fp-board-save-state" role="status">
          {saving ? <LoaderCircle size={14} className="fp-board-spin" /> : <Check size={14} />}
          {saving ? "Saving…" : error || status || "Changes save to this project"}
        </span>
      </div>
      <div className="fp-board-viewport" ref={stageRef}>
        <div
          className="fp-board-stage"
          style={{ zoom }}
          onPointerMove={movePointer}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          data-dragging={dragState ? "true" : "false"}
        >
          {!items.length && (
            <div className="fp-board-empty">
              <span className="fp-board-empty-mark"><StickyNote size={22} /></span>
              <strong>Start the first direction</strong>
              <p>Bring in saved references, drop in a shared file, or make a note. Build a few routes side by side before you choose one.</p>
              <button className={cardButton} onClick={() => setDialog("direction")}><Plus size={15} /> Create a direction</button>
            </div>
          )}
          {items.map((item) => {
            const rect = rectFor(item);
            const isSelected = selectedKeys.includes(item.key);
            const isFrame = item.kind === "direction";
            const imageType = item.kind === "file" && item.source
              ? mediaKind(item.source.mime_type || item.source.content_type || item.source.type || "image/jpeg")
              : "image";
            return (
              <article
                key={item.key}
                className={`fp-board-object ${isFrame ? "is-direction" : ""} ${item.kind === "note" ? "is-note" : ""} ${isSelected ? "is-selected" : ""}`}
                style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, zIndex: isFrame ? 0 : 1 }}
                aria-label={`${item.kind} ${item.title}`}
              >
                {isFrame ? (
                  <>
                    <header className="fp-board-object-header" onPointerDown={(event) => beginPointer(event, item, "move")}>
                      <span className="fp-board-type-label">Direction</span>
                      <strong>{item.title}</strong>
                      <button type="button" className="fp-board-drag-handle" aria-label={`Move ${item.title}`} title="Drag to move this direction" onPointerDown={(event) => beginPointer(event, item, "move")}>⠿</button>
                    </header>
                    <p>Place a campaign route&apos;s references, concepts, and notes inside this area.</p>
                    <button className="fp-board-select-frame" type="button" aria-label={`Select ${item.title}`} onClick={() => setSelectedKeys((current) => current.includes(item.key) ? current.filter((key) => key !== item.key) : current.length < 2 ? [...current, item.key] : current)} aria-pressed={isSelected}>{isSelected ? "Selected" : "Select direction"}</button>
                    <button className="fp-board-resize" type="button" aria-label={`Resize ${item.title}`} onPointerDown={(event) => beginPointer(event, item, "resize")}>
                      <span />
                    </button>
                  </>
                ) : (
                  <>
                    <header className="fp-board-object-header">
                      <label className="fp-board-check" aria-label={`Select ${item.title} for comparison`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!isSelected && selectedKeys.length >= 2}
                          onChange={() => setSelectedKeys((current) => current.includes(item.key) ? current.filter((key) => key !== item.key) : current.length < 2 ? [...current, item.key] : current)}
                        />
                      </label>
                      <div className="fp-board-object-heading">
                        <span className="fp-board-type-label">{item.kind === "version" ? "Concept" : item.kind}</span>
                        <strong title={item.title}>{item.title}</strong>
                      </div>
                      <button type="button" className="fp-board-drag-handle" aria-label={`Move ${item.title}`} title="Drag to move" onPointerDown={(event) => beginPointer(event, item, "move")}>⠿</button>
                    </header>
                    {item.image ? (
                      <div className="fp-board-object-image">
                        {imageType === "video" ? (
                          <video src={item.image} controls playsInline preload="metadata" aria-label={item.title} />
                        ) : imageType === "audio" ? (
                          <div className="fp-board-audio"><span>Audio reference</span><audio src={item.image} controls preload="metadata" aria-label={item.title} /></div>
                        ) : (
                          <img src={item.image} alt={item.title} draggable={false} />
                        )}
                      </div>
                    ) : (
                      <div className="fp-board-object-no-image">
                        <span>{item.kind === "note" ? <StickyNote size={22} /> : <ImagePlus size={22} />}</span>
                        <p>{item.kind === "note" ? "Working note" : "Preview not available"}</p>
                      </div>
                    )}
                    {item.body && <p className="fp-board-object-caption">{item.body}</p>}
                    <button className="fp-board-resize" type="button" aria-label={`Resize ${item.title}`} onPointerDown={(event) => beginPointer(event, item, "resize")}>
                      <span />
                    </button>
                  </>
                )}
              </article>
            );
          })}
        </div>
      </div>

      {dialog === "assets" && (
        <Dialog title="Add from your project library" onClose={() => setDialog("")}>
          <div className="fp-board-asset-tabs" role="tablist" aria-label="Asset type">
            <button role="tab" aria-selected={assetType === "references"} onClick={() => setAssetType("references")}>References ({references.length})</button>
            <button role="tab" aria-selected={assetType === "files"} onClick={() => setAssetType("files")}>Team files ({files.filter((file) => file.permission_scope === "workspace").length})</button>
          </div>
          <label className="fp-board-search">
            <Search size={16} />
            <span className="sr-only">Search saved assets</span>
            <input autoFocus value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} placeholder="Search names, tags, and notes" />
          </label>
          <div className="fp-board-asset-list">
            {activeAssets.length ? activeAssets.map((asset) => {
              const kind = assetType === "references" ? "reference" : "file";
              const image = assetPicture(asset, kind);
              return (
                <button key={asset.id} className="fp-board-asset-choice" disabled={saving} onClick={() => void addAsset(asset, kind)}>
                  <span className="fp-board-asset-thumb">{image ? <img src={image} alt="" /> : <ImagePlus size={19} />}</span>
                  <span><strong>{titleOf(asset)}</strong><small>{descriptionOf(asset) || (kind === "reference" ? "Saved working reference" : asset.mime_type || "Shared team file")}</small></span>
                  <Plus size={17} />
                </button>
              );
            }) : <p className="fp-board-no-assets">{assetType === "references" ? "No saved references match this search." : "No shared team files match this search."}</p>}
          </div>
          <p className="fp-board-dialog-note">Canvas edits and crops apply to the board item only. Library originals remain unchanged.</p>
        </Dialog>
      )}

      {dialog === "note" && (
        <Dialog title="Add a working note" onClose={() => setDialog("")}>
          <form className="fp-board-form" onSubmit={addNote}>
            <label>Note title<input required maxLength={120} value={newNoteTitle} onChange={(event) => setNewNoteTitle(event.target.value)} placeholder="e.g. Reels launch idea" /></label>
            <label>Working thought<textarea rows={5} maxLength={3000} value={newNoteBody} onChange={(event) => setNewNoteBody(event.target.value)} placeholder="Write the idea, question, or next experiment…" /></label>
            {error && <p className="fp-board-error" role="alert">{error}</p>}
            <button className={`${cardButton} is-primary`} disabled={saving}>{saving ? "Saving…" : "Add note"}</button>
          </form>
        </Dialog>
      )}

      {dialog === "direction" && (
        <Dialog title="Create a campaign direction" onClose={() => setDialog("")}>
          <form className="fp-board-form" onSubmit={addDirection}>
            <p className="fp-board-dialog-note">Make a separate area for a route. Add references, concepts, and notes to explore it alongside other directions.</p>
            <label>Direction name<input autoFocus required maxLength={100} value={newDirection} onChange={(event) => setNewDirection(event.target.value)} placeholder="e.g. Clubhouse, after dark" /></label>
            {error && <p className="fp-board-error" role="alert">{error}</p>}
            <button className={`${cardButton} is-primary`} disabled={saving}>{saving ? "Saving…" : "Create direction"}</button>
          </form>
        </Dialog>
      )}

      {dialog === "edit" && editItem && (
        <Dialog title={editItem.kind === "direction" ? "Rename direction" : "Edit board note"} onClose={() => setDialog("")}>
          <form className="fp-board-form" onSubmit={saveEdit}>
            {editItem.kind === "direction" ? (
              <label>Direction name<input autoFocus required maxLength={100} value={editBody} onChange={(event) => setEditBody(event.target.value)} /></label>
            ) : (
              <label>Board note or caption<textarea autoFocus rows={6} maxLength={3000} value={editBody} onChange={(event) => setEditBody(event.target.value)} placeholder="Add context for this working item" /></label>
            )}
            <p className="fp-board-dialog-note">This changes the canvas item only; the saved Library asset or original concept stays intact.</p>
            {error && <p className="fp-board-error" role="alert">{error}</p>}
            <button className={`${cardButton} is-primary`} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
          </form>
        </Dialog>
      )}

      {dialog === "crop" && editItem && (
        <Dialog title="Crop board preview" onClose={() => setDialog("")}>
          <div className="fp-board-crop-preview" style={{ aspectRatio: cropRatio === "landscape" ? "1.45" : cropRatio === "portrait" ? "0.78" : "1" }}>
            {editItem.image ? <img src={editItem.image} alt={`Crop preview for ${editItem.title}`} /> : null}
          </div>
          <fieldset className="fp-board-crop-options">
            <legend>Preview shape</legend>
            {[["square", "Square"], ["portrait", "Portrait"], ["landscape", "Landscape"]].map(([value, name]) => (
              <label key={value}>
                <input type="radio" name="crop-ratio" value={value} checked={cropRatio === value} onChange={() => setCropRatio(value)} />
                {name}
              </label>
            ))}
          </fieldset>
          <p className="fp-board-dialog-note">The preview frame changes; the original image in your library is never modified.</p>
          {error && <p className="fp-board-error" role="alert">{error}</p>}
          <button className={`${cardButton} is-primary`} disabled={saving} onClick={() => void saveCrop()}>{saving ? "Saving…" : "Apply crop"}</button>
        </Dialog>
      )}

      {dialog === "compare" && selected.length === 2 && (
        <Dialog title="Compare working directions" wide onClose={() => setDialog("")}>
          <p className="fp-board-dialog-note">Side-by-side comparison is for exploration. It does not approve or publish either concept.</p>
          <div className="fp-board-compare">
            {selected.map((item) => (
              <article key={item.key}>
                <header><span>{item.kind}</span><strong>{item.title}</strong></header>
                {item.image ? <div className="fp-board-compare-image"><img src={item.image} alt={item.title} /></div> : <div className="fp-board-compare-no-image"><StickyNote size={24} />Working note</div>}
                <p>{item.body || "No board note added."}</p>
              </article>
            ))}
          </div>
        </Dialog>
      )}
    </section>
  );
}

export function BoardModeSwitch({ mode, onChange }: { mode: "board" | "versions"; onChange: (mode: "board" | "versions") => void }) {
  return (
    <div className="fp-canvas-mode-switch" role="tablist" aria-label="Canvas view">
      <button type="button" role="tab" aria-selected={mode === "board"} onClick={() => onChange("board")}>Board</button>
      <button type="button" role="tab" aria-selected={mode === "versions"} onClick={() => onChange("versions")}>Versions</button>
    </div>
  );
}
