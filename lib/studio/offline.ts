/** Device drafts only. Adapters must enforce server membership, revision and idempotency atomically. */
export type DraftScope = { accountId: string; workspaceId: string };
export type DraftStatus =
  | "local"
  | "pending"
  | "syncing"
  | "saved"
  | "conflict"
  | "superseded"
  | "error";
export type OfflineDraft = DraftScope & {
  id: string;
  kind: "idea" | "note";
  baseRevision: string | null;
  requestId: string;
  payload: { title: string; text: string };
  status: DraftStatus;
  updatedAt: string;
  dependsOn?: string;
  error?: string;
  remoteRevision?: string;
  remoteText?: string;
};
export type SyncResult =
  | { status: "saved"; revision: string }
  | { status: "conflict"; revision: string; text: string };
export type DraftSyncAdapter = {
  permittedKinds?: readonly ("idea" | "note")[];
  /** Fetch and verify the currently authenticated account and active workspace membership. */
  verifyScope: (scope: DraftScope) => Promise<boolean>;
  /** Server must deduplicate requestId and compare baseRevision in one transaction. */
  send: (draft: OfflineDraft) => Promise<SyncResult>;
};
const DB = "fairway-studio-drafts-v1";
const STORE = "drafts";
const matches = (draft: DraftScope, scope: DraftScope) =>
  draft.accountId === scope.accountId &&
  draft.workspaceId === scope.workspaceId;
const key = (scope: DraftScope, id: string) =>
  JSON.stringify([scope.accountId, scope.workspaceId, id]);
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined")
      return reject(
        new Error("Local draft storage is unavailable in this browser."),
      );
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Close other Studio tabs and try again."));
  });
}
async function write(draft: OfflineDraft) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(draft, key(draft, draft.id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error || new Error("Draft could not be saved."));
    });
  } finally {
    db.close();
  }
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("fairway-drafts-changed"));
  return draft;
}
export async function listDrafts(scope: DraftScope): Promise<OfflineDraft[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      // Bounded compound-key range: do not load another account's payload into application memory.
      const prefix =
        JSON.stringify([scope.accountId, scope.workspaceId]).slice(0, -1) + ",";
      const request = tx
        .objectStore(STORE)
        .getAll(IDBKeyRange.bound(prefix, prefix + "\uffff"));
      request.onsuccess = () =>
        resolve(
          (request.result as OfflineDraft[])
            .filter((draft) => matches(draft, scope))
            .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)),
        );
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
export async function saveDraft(
  scope: DraftScope,
  input: {
    kind: "idea" | "note";
    title: string;
    text: string;
    baseRevision?: string | null;
    dependsOn?: string;
  },
): Promise<OfflineDraft> {
  if (!scope.accountId || !scope.workspaceId)
    throw new Error("Select an account and workspace before saving.");
  if (!input.text.trim() && !input.title.trim())
    throw new Error("Add some text before saving your draft.");
  if (input.title.length > 300 || input.text.length > 100000)
    throw new Error("Draft is too long. Export longer notes as a file.");
  return write({
    ...scope,
    id: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    kind: input.kind,
    payload: { title: input.title.trim(), text: input.text },
    baseRevision: input.baseRevision ?? null,
    dependsOn: input.dependsOn,
    status: "local",
    updatedAt: new Date().toISOString(),
  });
}
export async function queueDraft(scope: DraftScope, id: string) {
  const draft = (await listDrafts(scope)).find((item) => item.id === id);
  if (!draft || !["local", "error"].includes(draft.status))
    throw new Error("This draft cannot be queued in its current state.");
  return write({ ...draft, status: "pending", error: undefined });
}
const running = new Map<string, Promise<OfflineDraft[]>>();
export async function syncDrafts(
  scope: DraftScope,
  adapter: DraftSyncAdapter,
): Promise<OfflineDraft[]> {
  const lockKey = key(scope, "sync");
  const existing = running.get(lockKey);
  if (existing) return existing;
  async function perform() {
    if (typeof navigator !== "undefined" && navigator.onLine === false)
      return listDrafts(scope);
    if (!(await adapter.verifyScope(scope)))
      throw new Error("Sign in to this workspace again before syncing drafts.");
    const drafts = await listDrafts(scope);
    const saved = new Set(
      drafts.filter((d) => d.status === "saved").map((d) => d.id),
    );
    for (const draft of drafts) {
      if (draft.status === "conflict") break;
      if (!["pending", "error", "syncing"].includes(draft.status)) continue;
      if (draft.dependsOn && !saved.has(draft.dependsOn)) break;
      // Revalidate before each replay, including after account changes during a prior request.
      if (!(await adapter.verifyScope(scope)))
        throw new Error("Your account or workspace changed. Sync paused.");
      await write({ ...draft, status: "syncing" });
      try {
        const result = await adapter.send(draft);
        if (result.status === "conflict") {
          await write({
            ...draft,
            status: "conflict",
            remoteRevision: result.revision,
            remoteText: result.text,
            error: "The workspace version changed. Review both versions.",
          });
          break;
        }
        await write({
          ...draft,
          status: "saved",
          remoteRevision: result.revision,
          error: undefined,
        });
        saved.add(draft.id);
      } catch (error) {
        await write({
          ...draft,
          status: "error",
          error:
            error instanceof Error
              ? error.message
              : "Sync failed. Your draft is still on this device.",
        });
        break;
      }
    }
    return listDrafts(scope);
  }
  const promise = (
    typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request("fairway:" + lockKey, perform)
      : perform()
  ).finally(() => running.delete(lockKey));
  running.set(lockKey, promise);
  return promise;
}
export async function keepMineAsNewDraft(scope: DraftScope, id: string) {
  const draft = (await listDrafts(scope)).find((item) => item.id === id);
  if (!draft || draft.status !== "conflict")
    throw new Error("No conflict found.");
  // Original stays visible until explicitly removed; replacement is never automatically sent.
  const replacement = await saveDraft(scope, {
    kind: draft.kind,
    ...draft.payload,
  });
  await write({
    ...draft,
    status: "superseded",
    error: "Preserved after copying your text to a new local draft.",
  });
  return replacement;
}
export function exportDraftsText(drafts: OfflineDraft[]) {
  return drafts
    .filter((d) => d.status !== "saved")
    .map(
      (d) =>
        `${d.kind.toUpperCase()}: ${d.payload.title}\n${d.payload.text}\n\nSaved on this device: ${d.updatedAt}\nStatus: ${d.status}`,
    )
    .join("\n\n---\n\n");
}
/** Call before logout/switch. UI must warn and obtain choice before discardUnsynced=true. */
export async function clearScopeDrafts(
  scope: DraftScope,
  discardUnsynced = false,
) {
  const drafts = await listDrafts(scope);
  if (!discardUnsynced && drafts.some((d) => d.status !== "saved"))
    throw new Error(
      "Unsynced drafts exist. Export them or explicitly choose to discard before signing out.",
    );
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      for (const draft of drafts)
        tx.objectStore(STORE).delete(key(scope, draft.id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export type SignOutDraftChoice = "export" | "discard" | "cancel";
/** Call before auth.signOut(); false means keep session and drafts. Never ignores unsynced data. */
export async function prepareScopeSignOut(
  scope: DraftScope,
  choose?: (drafts: OfflineDraft[]) => Promise<SignOutDraftChoice>,
): Promise<boolean> {
  // Await any in-tab retry before deciding which drafts remain unsynced.
  await running.get(key(scope, "sync"))?.catch(() => {});
  const drafts = await listDrafts(scope);
  const unsynced = drafts.filter((draft) => draft.status !== "saved");
  if (!unsynced.length) {
    await clearScopeDrafts(scope);
    return true;
  }
  let choice: SignOutDraftChoice;
  if (choose) choice = await choose(unsynced);
  else {
    if (typeof window === "undefined") return false;
    const shouldExport = window.confirm(
      `You have ${unsynced.length} unsynced device draft(s) in this workspace. Export their text and remove them from this device before signing out? Cancel lets you keep working or choose to discard.`,
    );
    choice = shouldExport
      ? "export"
      : window.confirm(
            "Permanently discard these unsynced device drafts and sign out? Cancel keeps you signed in and preserves them.",
          )
        ? "discard"
        : "cancel";
  }
  if (choice === "cancel") return false;
  if (choice === "export") {
    if (typeof document === "undefined")
      throw new Error("Open Studio in a browser to export before signing out.");
    const url = URL.createObjectURL(
      new Blob([exportDraftsText(unsynced)], {
        type: "text/plain;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "fairway-unsynced-drafts.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (
      !window.confirm(
        "Check that your text export downloaded successfully. Continue removing these device drafts and signing out?",
      )
    )
      return false;
  }
  const latest = await listDrafts(scope);
  if (JSON.stringify(latest) !== JSON.stringify(drafts))
    throw new Error(
      "Drafts changed while you were deciding. Review them and try signing out again.",
    );
  await clearScopeDrafts(scope, true);
  return true;
}

/** Concrete adapter for the current createIdea endpoint. New notes are shared as Ideas categorized Note; existing-row edits remain local. */
export function createIdeaDraftSyncAdapter(
  onSaved?: () => Promise<unknown>,
): DraftSyncAdapter {
  return {
    permittedKinds: ["idea", "note"],
    async verifyScope(scope) {
      const response = await fetch(
        `/api/studio/workspace?workspaceId=${encodeURIComponent(scope.workspaceId)}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      if (!response.ok) return false;
      const data = (await response.json()) as {
        userId?: string;
        workspace?: { id?: string };
      };
      return (
        data.userId === scope.accountId &&
        data.workspace?.id === scope.workspaceId
      );
    },
    async send(draft) {
      if (!["idea", "note"].includes(draft.kind) || draft.baseRevision !== null)
        throw new Error(
          "Only new idea or note drafts can sync. Export an existing-record revision draft instead.",
        );
      const title =
        draft.payload.title ||
        (draft.kind === "note" ? "Studio note" : "Untitled idea");
      if (title.length > 160)
        throw new Error(
          "Workspace idea titles allow at most 160 characters. Keep this local draft and create a shorter-titled copy.",
        );
      const response = await fetch("/api/studio/workspace", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: draft.workspaceId,
          operation: "createIdea",
          requestId: draft.requestId,
          input: {
            title,
            body: draft.payload.text,
            category: draft.kind === "note" ? "Note" : "General",
          },
        }),
      });
      const body = (await response.json()) as {
        data?: { revision?: number; id?: string };
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          body.error ||
            "Workspace sync failed. Your idea is still on this device.",
        );
      if (!body.data?.id)
        throw new Error(
          "The server did not confirm a saved idea. Retry uses the same request ID.",
        );
      // Refresh failure must not turn a successfully committed draft into a failed replay.
      await onSaved?.().catch(() => {});
      return { status: "saved", revision: String(body.data.revision ?? 0) };
    },
  };
}
