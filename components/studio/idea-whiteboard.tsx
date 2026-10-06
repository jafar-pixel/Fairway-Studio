"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import useSWR from "swr";
import { ArrowLeft, Copy, ExternalLink, FileImage, Library, Lock, LogIn, LogOut, MessageSquare, Palette, Scissors, StickyNote, Trash2, Users } from "lucide-react";
import { extractPalette, ideaImage, seedItems, storableImage, type SeedItem } from "@/lib/studio/whiteboard-seed";
import {
  ITEM_LABELS, boardRulesSummary, itemPermissions,
  type Board, type BoardComment, type BoardItem, type BoardItemKind, type BoardScope, type BoardSnapshot,
} from "@/lib/studio/whiteboard";

type Row = Record<string, any>;
type Props = { data: any; workspaceId: string; ideaId: string; userId: string; demo: boolean; onNavigate: (path: string) => void };

const button = "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} !border-[#760D24] !bg-[#760D24] !text-white hover:!bg-[#590a1b]`;
const field = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#760D24]/40";
const BOARD_W = 2400, BOARD_H = 1600;
const kindIcon: Record<BoardItemKind, typeof StickyNote> = { note: StickyNote, swatch: Palette, fabric: Scissors, image: FileImage, library: Library };

function memberName(data: any, id: string | null | undefined) {
  if (!id) return "Someone";
  const member = (data.members || []).find((m: Row) => m.user_id === id);
  return member?.display_name || (id === data.userId ? "You" : "A teammate");
}
async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || "The whiteboard is unavailable. Please retry."), { code: body.code, status: response.status });
  return body;
}

function demoItem(seed: SeedItem, board: Board, index: number): BoardItem {
  const now = new Date().toISOString();
  return { id: `demo-seed-${index}`, board_id: board.id, kind: seed.kind, title: seed.title, body: seed.body || "", color: seed.color || null, url: null, image_url: seed.image_url || null, reference_id: null, file_id: null, x: seed.x, y: seed.y, width: seed.width, height: seed.height, created_by: board.owner_id, checked_out_by: null, checked_out_at: null, revision: 0, created_at: now, updated_at: now };
}

/** Demo boards live in memory only; nothing is saved. */
function useDemoBoards(ideaId: string, userId: string, idea: Row | undefined) {
  const [snapshot, setSnapshot] = useState<BoardSnapshot>(() => {
    const now = new Date().toISOString();
    const team: Board = { id: `demo-team-${ideaId}`, workspace_id: "demo", idea_id: ideaId, scope: "team", owner_id: idea?.author_id || userId, created_at: now };
    const mine: Board = { id: `demo-private-${ideaId}`, workspace_id: "demo", idea_id: ideaId, scope: "private", owner_id: userId, created_at: now };
    return { boards: [team, mine], items: seedItems(idea, [], ideaImage(idea) || null).map((seed, i) => demoItem(seed, team, i)), comments: [] };
  });
  // Pull the real colours out of the idea's photo, then add them and update the spec sheet.
  useEffect(() => {
    let live = true;
    void extractPalette(ideaImage(idea)).then((palette) => {
      if (!live || !palette.length) return;
      setSnapshot((s) => {
        const team = s.boards.find((b) => b.scope === "team")!;
        const seeded = seedItems(idea, palette, ideaImage(idea) || null).map((seed, i) => demoItem(seed, team, i));
        const untouched = s.items.filter((item) => !item.id.startsWith("demo-seed-"));
        return { ...s, items: [...seeded, ...untouched] };
      });
    });
    return () => { live = false; };
  }, []);
  async function mutate(operation: string, input: Row): Promise<unknown> {
    const now = new Date().toISOString();
    setSnapshot((s) => {
      const items = [...s.items], comments = [...s.comments];
      const index = items.findIndex((i) => i.id === input.id);
      if (operation === "addItem") items.push({ id: `demo-${Date.now()}`, board_id: input.board_id, kind: input.kind, title: input.title || "", body: input.body || "", color: input.color || null, url: input.url || null, image_url: input.image_url || null, reference_id: input.reference_id || null, file_id: input.file_id || null, x: input.x ?? 40, y: input.y ?? 40, width: input.width ?? 220, height: input.height ?? 160, created_by: userId, checked_out_by: null, checked_out_at: null, revision: 0, created_at: now, updated_at: now });
      else if (operation === "updateItem" && index >= 0) items[index] = { ...items[index], ...input, revision: items[index].revision + 1 };
      else if (operation === "deleteItem" && index >= 0) items.splice(index, 1);
      else if (operation === "checkOut" && index >= 0) items[index] = { ...items[index], checked_out_by: userId, checked_out_at: now };
      else if (operation === "checkIn" && index >= 0) items[index] = { ...items[index], checked_out_by: null, checked_out_at: null };
      else if (operation === "copyToPrivate" && index >= 0) items.push({ ...items[index], id: `demo-${Date.now()}`, board_id: `demo-private-${ideaId}`, created_by: userId, checked_out_by: null });
      else if (operation === "addComment") comments.push({ id: `demo-c-${Date.now()}`, board_id: input.board_id, item_id: input.item_id || null, author_id: userId, body: input.body, created_at: now });
      else if (operation === "deleteComment") return { ...s, items, comments: comments.filter((c) => c.id !== input.id) };
      return { ...s, items, comments };
    });
    return null;
  }
  return { snapshot, error: null as any, loading: false, mutate };
}

function useRemoteBoards(workspaceId: string, ideaId: string, enabled: boolean) {
  const key = enabled ? `/api/studio/boards?workspaceId=${encodeURIComponent(workspaceId)}&ideaId=${encodeURIComponent(ideaId)}` : null;
  // Poll so teammates' additions, comments and check-outs appear without a reload.
  const query = useSWR<BoardSnapshot>(key, (url: string) => fetch(url, { cache: "no-store", credentials: "same-origin" }).then(readJson), { refreshInterval: 4000, revalidateOnFocus: true });
  const ensured = useRef(false);
  async function post(operation: string, input: Row) {
    const body = await readJson(await fetch("/api/studio/boards", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, operation, input }) }));
    return body.data;
  }
  async function mutate(operation: string, input: Row) {
    const data = await post(operation, input);
    await query.mutate();
    return data;
  }
  /** Fill an empty Team board from its idea once, whoever opens it first. */
  const seeding = useRef<string | null>(null);
  async function seed(boardId: string, idea: Row | undefined) {
    if (seeding.current === boardId) return;
    seeding.current = boardId;
    try {
      // The database lets exactly one opener fill the board, so simultaneous openers never duplicate it.
      const claim = await post("claimSeed", { board_id: boardId });
      if (!claim?.claimed) return;
      const src = ideaImage(idea);
      const palette = await extractPalette(src);
      for (const item of seedItems(idea, palette, storableImage(src, window.location.origin)))
        await post("addItem", { ...item, board_id: boardId });
    } catch { /* The board still works empty; members can add items themselves. */ }
    finally { await query.mutate(); }
  }
  const boards = query.data?.boards;
  useEffect(() => {
    if (!enabled || !boards || ensured.current) return;
    if (boards.some((b) => b.scope === "team") && boards.some((b) => b.scope === "private")) return;
    ensured.current = true;
    void mutate("ensureBoards", { idea_id: ideaId }).catch(() => { ensured.current = false; });
  }, [enabled, boards, ideaId]);
  return { snapshot: query.data, error: query.error, loading: query.isLoading, mutate, seed };
}

export function IdeaWhiteboard({ data, workspaceId, ideaId, userId, demo, onNavigate }: Props) {
  const idea: Row | undefined = (data.ideas || []).find((i: Row) => i.id === ideaId);
  const remote = useRemoteBoards(workspaceId, ideaId, !demo);
  const local = useDemoBoards(ideaId, userId, idea);
  const { snapshot, error, loading, mutate } = demo ? local : remote;
  const [scope, setScope] = useState<BoardScope>("team");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState<BoardItemKind | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const board = snapshot?.boards.find((b) => b.scope === scope && (scope === "team" || b.owner_id === userId));
  const items = useMemo(() => (snapshot?.items || []).filter((i) => i.board_id === board?.id), [snapshot, board?.id]);
  const comments = useMemo(() => (snapshot?.comments || []).filter((c) => c.board_id === board?.id), [snapshot, board?.id]);
  const selected = items.find((i) => i.id === selectedId) || null;
  const teamBoard = snapshot?.boards.find((b) => b.scope === "team");
  const teamEmpty = !!teamBoard && !(snapshot?.items || []).some((i) => i.board_id === teamBoard.id);
  useEffect(() => { if (!demo && teamBoard && teamEmpty && idea) void remote.seed(teamBoard.id, idea); }, [demo, teamBoard?.id, teamEmpty, !!idea]);
  const viewport = useRef<HTMLDivElement>(null);
  const nameData = { ...data, userId };

  async function run(operation: string, input: Row, success = "") {
    setBusy(true); setNotice("");
    try { const result = await mutate(operation, input); if (success) setNotice(success); return result; }
    catch (cause) { setNotice((cause as Error).message); return undefined; }
    finally { setBusy(false); }
  }
  /** New items land in the middle of what the person is looking at, never on top of the last one. */
  function nextPosition() {
    const el = viewport.current;
    const baseX = el ? el.scrollLeft + el.clientWidth / 2 - 110 : 80, baseY = el ? el.scrollTop + el.clientHeight / 2 - 80 : 80;
    const offset = (items.length % 6) * 24;
    return { x: Math.max(0, Math.min(BOARD_W - 240, Math.round(baseX + offset))), y: Math.max(0, Math.min(BOARD_H - 180, Math.round(baseY + offset))) };
  }

  if (!demo && error?.code === "SCHEMA_REQUIRED")
    return <Shell idea={idea} workspaceId={workspaceId} onNavigate={onNavigate}><p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">Whiteboards need a one-time database setup. Ask the Fairway administrator to run <code>supabase/migrations/20261006200000_idea_whiteboards.sql</code> in Supabase, then reload.</p></Shell>;
  if (!idea && !loading)
    return <Shell idea={idea} workspaceId={workspaceId} onNavigate={onNavigate}><p role="alert">This idea is unavailable or you no longer have access to it.</p></Shell>;
  if (error) return <Shell idea={idea} workspaceId={workspaceId} onNavigate={onNavigate}><p role="alert">{error.message}</p></Shell>;
  if (!board) return <Shell idea={idea} workspaceId={workspaceId} onNavigate={onNavigate}><p role="status">Opening whiteboard…</p></Shell>;

  const isOwner = board.owner_id === userId;
  return (
    <Shell idea={idea} workspaceId={workspaceId} onNavigate={onNavigate} owner={memberName(nameData, idea?.author_id)}>
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Whiteboards">
        <button role="tab" aria-selected={scope === "team"} className={scope === "team" ? primary : button} onClick={() => { setScope("team"); setSelectedId(null); }}><Users size={16} />Team board</button>
        <button role="tab" aria-selected={scope === "private"} className={scope === "private" ? primary : button} onClick={() => { setScope("private"); setSelectedId(null); }}><Lock size={16} />My private board</button>
        <p className="text-xs text-stone-500">{boardRulesSummary(board, userId)}</p>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Add to board">
        {(Object.keys(ITEM_LABELS) as BoardItemKind[]).map((kind) => { const Icon = kindIcon[kind]; return <button key={kind} className={button} disabled={busy} onClick={() => setAdding(kind)}><Icon size={16} />Add {ITEM_LABELS[kind].toLowerCase()}</button>; })}
      </div>
      {notice && <p role="status" className="text-sm text-stone-700">{notice}</p>}
      {adding && <AddItemForm kind={adding} board={board} data={data} userId={userId} busy={busy} onCancel={() => setAdding(null)} onAdd={async (input) => { const result = await run("addItem", { ...input, board_id: board.id, ...nextPosition() }); if (result !== undefined) setAdding(null); }} />}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div ref={viewport} className="relative h-[70vh] overflow-auto rounded-2xl border border-stone-200 bg-[radial-gradient(circle,#e7e5e4_1px,transparent_1px)] [background-size:24px_24px]" onClick={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}>
          <div className="relative" style={{ width: BOARD_W, height: BOARD_H }} onClick={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}>
            {items.map((item) => <BoardCard key={item.id} item={item} board={board} userId={userId} data={nameData} selected={item.id === selectedId} commentCount={comments.filter((c) => c.item_id === item.id).length} onSelect={() => setSelectedId(item.id)} onMove={(geometry) => run("updateItem", { id: item.id, expected_revision: item.revision, ...geometry })} />)}
            {!items.length && <p className="absolute left-8 top-8 max-w-sm text-sm text-stone-500">{scope === "team" ? "Nothing on the Team board yet. Add a note, colour, fabric, image or Library item to start." : "Your private board. Sketch freely; only you can see it."}</p>}
          </div>
        </div>
        <aside className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4" aria-label={selected ? "Item details" : "Board comments"}>
          {selected ? <ItemPanel key={selected.id} item={selected} board={board} userId={userId} data={nameData} busy={busy} onRun={run} onClose={() => setSelectedId(null)} onNavigate={onNavigate} workspaceId={workspaceId} /> : <h2 className="font-semibold">{isOwner ? "Board notes" : "Comments"}</h2>}
          <Comments comments={comments.filter((c) => c.item_id === (selected?.id ?? null))} board={board} itemId={selected?.id ?? null} userId={userId} data={nameData} busy={busy} onRun={run} />
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ idea, workspaceId, onNavigate, owner, children }: { idea?: Row; workspaceId: string; onNavigate: (path: string) => void; owner?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4" aria-labelledby="whiteboard-title">
      <button className="inline-flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900" onClick={() => onNavigate(workspaceId === "demo" ? "/demo/ideas" : `/w/${workspaceId}/ideas`)}><ArrowLeft size={16} />Back to ideas</button>
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.15em] text-[#760D24]">Whiteboard</p>
        <h1 id="whiteboard-title" className="text-2xl font-semibold">{idea?.title || "Idea"}</h1>
        {owner && <p className="text-sm text-stone-500">Original by {owner}</p>}
      </header>
      {children}
    </section>
  );
}

function BoardCard({ item, board, userId, data, selected, commentCount, onSelect, onMove }: { item: BoardItem; board: Board; userId: string; data: any; selected: boolean; commentCount: number; onSelect: () => void; onMove: (geometry: Row) => void }) {
  const can = itemPermissions(board, item, userId);
  const [drag, setDrag] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const start = useRef<{ px: number; py: number; mode: "move" | "resize" } | null>(null);
  const geometry = drag || item;
  const Icon = kindIcon[item.kind];
  function down(event: ReactPointerEvent, mode: "move" | "resize") {
    onSelect();
    if (!can.move || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    start.current = { px: event.clientX, py: event.clientY, mode };
    setDrag({ x: item.x, y: item.y, width: item.width, height: item.height });
  }
  function move(event: ReactPointerEvent) {
    if (!start.current) return;
    const dx = event.clientX - start.current.px, dy = event.clientY - start.current.py;
    setDrag(start.current.mode === "move"
      ? { x: Math.max(0, Math.min(BOARD_W - item.width, item.x + dx)), y: Math.max(0, Math.min(BOARD_H - item.height, item.y + dy)), width: item.width, height: item.height }
      : { x: item.x, y: item.y, width: Math.max(80, Math.min(1200, item.width + dx)), height: Math.max(60, Math.min(1200, item.height + dy)) });
  }
  function up() {
    if (!start.current || !drag) { start.current = null; return; }
    const changed = drag.x !== item.x || drag.y !== item.y || drag.width !== item.width || drag.height !== item.height;
    const final = { x: Math.round(drag.x), y: Math.round(drag.y), width: Math.round(drag.width), height: Math.round(drag.height) };
    start.current = null;
    if (changed) onMove(final);
    setDrag(null);
  }
  return (
    <article
      className={`absolute flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm ${selected ? "border-[#760D24] ring-2 ring-[#760D24]/30" : "border-stone-200"} ${can.move ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
      style={{ left: geometry.x, top: geometry.y, width: geometry.width, height: geometry.height, touchAction: can.move ? "none" : "auto" }}
      onPointerDown={(e) => down(e, "move")} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onSelect(); }} aria-label={`${ITEM_LABELS[item.kind]}: ${item.title || "Untitled"}`}
    >
      {item.kind === "swatch" && <div className="min-h-12 flex-1" style={{ background: item.color || "#e7e5e4" }} />}
      {(item.kind === "image" || item.kind === "fabric" || item.kind === "library") && item.image_url && <img src={item.image_url} alt="" draggable={false} referrerPolicy="no-referrer" className="min-h-0 w-full flex-1 object-cover" />}
      <div className={`space-y-1 p-2.5 text-xs ${item.kind === "note" ? "min-h-0 flex-1 overflow-auto" : ""}`}>
        <p className="flex items-center gap-1 font-medium text-stone-500"><Icon size={12} />{ITEM_LABELS[item.kind]}{item.kind === "swatch" && item.color ? ` · ${item.color.toUpperCase()}` : ""}</p>
        {item.title && <p className="line-clamp-2 text-sm font-semibold text-stone-900">{item.title}</p>}
        {item.body && (item.kind === "note" || !item.image_url) && <p className={`whitespace-pre-wrap text-stone-600 ${item.kind === "note" ? "" : "line-clamp-3"}`}>{item.body}</p>}
        <p className="flex flex-wrap gap-2 text-stone-500">
          {item.checked_out_by && <span className="rounded bg-amber-100 px-1.5 text-amber-900">Checked out · {memberName(data, item.checked_out_by)}</span>}
          {commentCount > 0 && <span className="inline-flex items-center gap-1"><MessageSquare size={11} />{commentCount}</span>}
        </p>
      </div>
      {can.move && <span aria-hidden className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize bg-[linear-gradient(135deg,transparent_50%,#a8a29e_50%)]" onPointerDown={(e) => down(e, "resize")} />}
    </article>
  );
}

function AddItemForm({ kind, board, data, userId, busy, onCancel, onAdd }: { kind: BoardItemKind; board: Board; data: any; userId: string; busy: boolean; onCancel: () => void; onAdd: (input: Row) => void }) {
  const [title, setTitle] = useState(""), [body, setBody] = useState(""), [color, setColor] = useState("#760D24"), [imageUrl, setImageUrl] = useState(""), [url, setUrl] = useState(""), [asset, setAsset] = useState("");
  // Team boards only accept Library items already shared with the workspace; private boards also accept your own.
  const library = useMemo(() => [
    ...(data.references || []).filter((r: Row) => !r.archived_at).map((r: Row) => ({ key: `reference:${r.id}`, title: r.title || r.url, shared: r.permission_scope !== "restricted", mine: r.author_id === userId })),
    ...(data.files || []).map((f: Row) => ({ key: `file:${f.id}`, title: f.title, shared: f.permission_scope === "workspace", mine: f.added_by === userId })),
  ].filter((a) => a.shared || (board.scope === "private" && a.mine)), [data, board.scope, userId]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (kind === "library") { const [type, id] = asset.split(":"); onAdd({ kind, [type === "file" ? "file_id" : "reference_id"]: id }); return; }
    onAdd({ kind, title: title.trim(), body: body.trim(), ...(kind === "swatch" ? { color } : {}), ...(imageUrl ? { image_url: imageUrl.trim() } : {}), ...(url ? { url: url.trim() } : {}), ...(kind === "swatch" ? { width: 180, height: 170 } : {}) });
  }
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:grid-cols-2" aria-label={`Add ${ITEM_LABELS[kind].toLowerCase()}`}>
      <h2 className="font-semibold sm:col-span-2">Add {ITEM_LABELS[kind].toLowerCase()}</h2>
      {kind === "library" ? (
        <label className="space-y-1 text-sm sm:col-span-2">Library item
          <select className={field} required value={asset} onChange={(e) => setAsset(e.target.value)}>
            <option value="">Choose a Pin, reference or file…</option>
            {library.map((a) => <option key={a.key} value={a.key}>{a.title}{a.shared ? "" : " (private)"}</option>)}
          </select>
          {!library.length && <span className="block text-xs text-stone-500">{board.scope === "team" ? "Share Library items with the workspace to pin them here." : "Your Library is empty."}</span>}
        </label>
      ) : (<>
        <label className="space-y-1 text-sm">{kind === "swatch" ? "Colour name" : kind === "fabric" ? "Fabric name" : "Title"}<input className={field} maxLength={200} required={kind !== "note"} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "fabric" ? "e.g. Brushed cotton twill" : kind === "swatch" ? "e.g. Clubhouse green" : ""} /></label>
        {kind === "swatch" && <label className="space-y-1 text-sm">Colour<span className="flex gap-2"><input type="color" aria-label="Pick colour" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-14 rounded border border-stone-300" /><input className={field} value={color} pattern="#[0-9a-fA-F]{6}" onChange={(e) => setColor(e.target.value)} aria-label="Hex colour" /></span></label>}
        {(kind === "image" || kind === "fabric") && <label className="space-y-1 text-sm">Image link (https)<input className={field} type="url" pattern="https://.*" required={kind === "image"} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" /></label>}
        {kind === "fabric" && <label className="space-y-1 text-sm">Supplier or product link (https)<input className={field} type="url" pattern="https://.*" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></label>}
        <label className="space-y-1 text-sm sm:col-span-2">{kind === "note" ? "Note" : kind === "fabric" ? "Weight, composition, feel" : "Notes"}<textarea className={field} rows={3} maxLength={4000} required={kind === "note"} value={body} onChange={(e) => setBody(e.target.value)} /></label>
      </>)}
      <div className="flex gap-2 sm:col-span-2"><button type="submit" className={primary} disabled={busy}>Add to {board.scope === "team" ? "Team board" : "private board"}</button><button type="button" className={button} onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

function ItemPanel({ item, board, userId, data, busy, onRun, onClose, onNavigate, workspaceId }: { item: BoardItem; board: Board; userId: string; data: any; busy: boolean; onRun: (op: string, input: Row, success?: string) => Promise<unknown>; onClose: () => void; onNavigate: (path: string) => void; workspaceId: string }) {
  const can = itemPermissions(board, item, userId);
  const [title, setTitle] = useState(item.title), [body, setBody] = useState(item.body), [color, setColor] = useState(item.color || "#760D24");
  const dirty = title !== item.title || body !== item.body || (item.kind === "swatch" && color !== item.color);
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2"><h2 className="font-semibold">{ITEM_LABELS[item.kind]}</h2><button className="text-sm text-stone-500 underline" onClick={onClose}>Close</button></div>
      <p className="text-xs text-stone-500">Added by {memberName(data, item.created_by)}{item.checked_out_by ? ` · Checked out by ${memberName(data, item.checked_out_by)}` : ""}</p>
      {can.edit ? (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void onRun("updateItem", { id: item.id, expected_revision: item.revision, title: title.trim(), body: body.trim(), ...(item.kind === "swatch" ? { color } : {}) }, "Saved."); }}>
          <input className={field} aria-label="Title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          {item.kind === "swatch" && <input type="color" aria-label="Colour" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-full rounded border border-stone-300" />}
          <textarea className={field} aria-label="Notes" rows={4} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
          <button type="submit" className={primary} disabled={busy || !dirty}>Save changes</button>
        </form>
      ) : (<><p className="font-medium">{item.title}</p>{item.body && <p className="whitespace-pre-wrap text-sm text-stone-600">{item.body}</p>}<p className="text-xs text-stone-500">Only the idea's owner or the person who added this can edit it. Comment below to suggest a change.</p></>)}
      <div className="flex flex-wrap gap-2">
        {can.checkOut && <button className={button} disabled={busy} onClick={() => void onRun("checkOut", { id: item.id }, "Checked out to you.")}><LogOut size={15} />Check out</button>}
        {can.checkIn && <button className={button} disabled={busy} onClick={() => void onRun("checkIn", { id: item.id }, "Checked back in.")}><LogIn size={15} />Check in</button>}
        {can.copyToPrivate && <button className={button} disabled={busy} onClick={() => void onRun("copyToPrivate", { id: item.id }, "Copied to your private board.")}><Copy size={15} />Copy to my private board</button>}
        {item.url && <a className={button} href={item.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />Open link</a>}
        {(item.reference_id || item.file_id) && workspaceId !== "demo" && <button className={button} onClick={() => onNavigate(`/w/${workspaceId}/library?item=${encodeURIComponent(item.reference_id || item.file_id || "")}`)}><Library size={15} />Open in Library</button>}
        {can.remove && <button className={button} disabled={busy} onClick={() => { if (window.confirm("Remove this from the board?")) void onRun("deleteItem", { id: item.id }, "Removed.").then(onClose); }}><Trash2 size={15} />Remove</button>}
      </div>
      <h3 className="pt-2 text-sm font-semibold">Comments on this item</h3>
    </div>
  );
}

function Comments({ comments, board, itemId, userId, data, busy, onRun }: { comments: BoardComment[]; board: Board; itemId: string | null; userId: string; data: any; busy: boolean; onRun: (op: string, input: Row, success?: string) => Promise<unknown> }) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-3">
      <ul className="max-h-80 space-y-2 overflow-auto">
        {comments.map((c) => (
          <li key={c.id} className="rounded-lg bg-stone-50 p-2 text-sm">
            <p className="text-xs text-stone-500">{memberName(data, c.author_id)} · {new Date(c.created_at).toLocaleString()}</p>
            <p className="whitespace-pre-wrap">{c.body}</p>
            {(c.author_id === userId || board.owner_id === userId) && <button className="text-xs text-stone-500 underline" disabled={busy} onClick={() => void onRun("deleteComment", { id: c.id })}>Delete</button>}
          </li>
        ))}
        {!comments.length && <li className="text-sm text-stone-500">No comments yet.</li>}
      </ul>
      <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); if (!text.trim()) return; const result = await onRun("addComment", { board_id: board.id, ...(itemId ? { item_id: itemId } : {}), body: text.trim() }); if (result !== undefined) setText(""); }}>
        <textarea className={field} rows={2} maxLength={2000} aria-label="Write a comment" placeholder={itemId ? "Comment on this item…" : "Comment on this board…"} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className={primary} disabled={busy || !text.trim()}>Comment</button>
      </form>
    </div>
  );
}
