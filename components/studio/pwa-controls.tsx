"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Monitor, RefreshCw, WifiOff, X } from "lucide-react";
import {
  exportDraftsText,
  keepMineAsNewDraft,
  listDrafts,
  queueDraft,
  saveDraft,
  syncDrafts,
  type DraftScope,
  type DraftSyncAdapter,
  type OfflineDraft,
} from "@/lib/studio/offline";

/** Always the newest Windows installer, published by .github/workflows/desktop.yml. */
export const WINDOWS_INSTALLER_URL =
  "https://github.com/jafar-pixel/Fairway-Studio/releases/latest/download/Fairway-Studio-Setup.exe";

type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type Props = {
  scope?: DraftScope;
  syncAdapter?: DraftSyncAdapter;
  beforeUpdate?: () => Promise<boolean>;
  manageInstallation?: boolean;
};
const dirtyDraftEditors = new Set<string>();
const button =
  "inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50";

/** Mount once in the authenticated client shell. No adapter means local-only drafts, never fake sync. */
export function PwaControls(props: Props) {
  return (
    <PwaControlsInner key={JSON.stringify(props.scope || null)} {...props} />
  );
}
function PwaControlsInner({
  scope,
  syncAdapter,
  beforeUpdate,
  manageInstallation = true,
}: Props) {
  const [online, setOnline] = useState(true);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [windows, setWindows] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<OfflineDraft[]>([]);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"idea" | "note">("idea");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const alive = useRef(true);
  const reloadRequested = useRef(false);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const accountId = scope?.accountId;
  const workspaceId = scope?.workspaceId;
  const load = useCallback(async () => {
    if (!accountId || !workspaceId) return;
    try {
      const next = await listDrafts({ accountId, workspaceId });
      if (alive.current) setDrafts(next);
    } catch (error) {
      if (alive.current)
        setMessage(
          error instanceof Error
            ? error.message
            : "Device storage is unavailable.",
        );
    }
  }, [accountId, workspaceId]);
  const retry = useCallback(async () => {
    if (!accountId || !workspaceId || !syncAdapter) return;
    try {
      await syncDrafts({ accountId, workspaceId }, syncAdapter);
      await load();
    } catch (error) {
      if (alive.current)
        setMessage(error instanceof Error ? error.message : "Sync is paused.");
    }
  }, [accountId, workspaceId, syncAdapter, load]);
  useEffect(() => {
    alive.current = true;
    setOnline(navigator.onLine);
    setStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        !!(navigator as Navigator & { standalone?: boolean }).standalone,
    );
    setIos(
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    );
    // Offer the Windows app on Windows browsers, but not inside the desktop app itself.
    setWindows(
      /Windows/.test(navigator.userAgent) &&
        !(window as Window & { fairwayDesktop?: unknown }).fairwayDesktop,
    );
    const connected = () => {
      setOnline(true);
      void retry();
    };
    const disconnected = () => setOnline(false);
    const resumed = () => {
      if (document.visibilityState === "visible") {
        void load();
        void retry();
        void registration.current?.update().catch(() => {});
      }
    };
    const offered = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    const installed = () => {
      setStandalone(true);
      setInstall(null);
    };
    const changed = () => {
      if (reloadRequested.current) window.location.reload();
    };
    const refreshed = () => {
      void load();
    };
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    window.addEventListener("beforeinstallprompt", offered);
    window.addEventListener("appinstalled", installed);
    window.addEventListener("fairway-drafts-changed", refreshed);
    document.addEventListener("visibilitychange", resumed);
    if (
      manageInstallation &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker.addEventListener("controllerchange", changed);
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((reg) => {
          if (!alive.current) return;
          registration.current = reg;
          if (reg.waiting) setWaiting(reg.waiting);
          reg.addEventListener("updatefound", () => {
            const worker = reg.installing;
            worker?.addEventListener("statechange", () => {
              if (
                alive.current &&
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              )
                setWaiting(reg.waiting);
            });
          });
        })
        .catch(() => {
          if (alive.current)
            setMessage(
              "Offline shell could not be enabled. Device drafts may still be available.",
            );
        });
    }
    void load();
    void retry();
    return () => {
      alive.current = false;
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
      window.removeEventListener("beforeinstallprompt", offered);
      window.removeEventListener("appinstalled", installed);
      window.removeEventListener("fairway-drafts-changed", refreshed);
      document.removeEventListener("visibilitychange", resumed);
      navigator.serviceWorker?.removeEventListener("controllerchange", changed);
    };
  }, [load, retry, manageInstallation]);
  useEffect(() => {
    const editorKey = JSON.stringify([accountId, workspaceId]);
    if (!title && !text) {
      dirtyDraftEditors.delete(editorKey);
      return;
    }
    dirtyDraftEditors.add(editorKey);
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      dirtyDraftEditors.delete(editorKey);
      window.removeEventListener("beforeunload", warn);
    };
  }, [title, text, accountId, workspaceId]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      if (alive.current)
        setMessage(
          error instanceof Error ? error.message : "Please try again.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const save = async () => {
    if (!scope) return;
    await saveDraft(scope, { kind, title, text });
    if (alive.current) {
      setTitle("");
      setText("");
      setMessage("Saved on this device.");
      await load();
    }
  };
  const update = async () => {
    if (dirtyDraftEditors.size > 0 || title || text) {
      setOpen(true);
      setMessage("Save your open draft before updating.");
      return;
    }
    const updateRequest = new Event("fairway-before-update", {
      cancelable: true,
    });
    if (!window.dispatchEvent(updateRequest)) {
      setMessage("Finish or save your open edits and uploads before updating.");
      return;
    }
    if (beforeUpdate && !(await beforeUpdate())) {
      setMessage("Finish or save your current edits before updating.");
      return;
    }
    // Parent must supply beforeUpdate when reviews/uploads or other unsaved editors are present.
    if (
      !window.confirm(
        "Update Fairway Studio now? Make sure any other open edits or uploads are saved first.",
      )
    )
      return;
    reloadRequested.current = true;
    waiting?.postMessage({ type: "ACTIVATE_UPDATE" });
  };
  const exportText = () => {
    const url = URL.createObjectURL(
      new Blob([exportDraftsText(drafts)], {
        type: "text/plain;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "fairway-unsynced-drafts.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const pending = drafts.filter((draft) => draft.status !== "saved").length;
  return (
    <section
      aria-label="Installation and offline drafts"
      className="flex flex-col gap-2 text-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        {!online && (
          <span
            role="status"
            className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-amber-900"
          >
            <WifiOff size={15} />
            Offline · device drafts available
          </span>
        )}
        {scope && (
          <button
            className={button}
            onClick={() => setOpen(!open)}
            aria-expanded={open}
          >
            Device drafts{pending > 0 ? ` · ${pending}` : ""}
          </button>
        )}
        {manageInstallation && !standalone && install && (
          <button
            className={button}
            onClick={() =>
              void run(async () => {
                await install.prompt();
                await install.userChoice;
                setInstall(null);
              })
            }
          >
            <Download size={15} />
            Install Studio
          </button>
        )}
        {manageInstallation && !standalone && windows && (
          <a className={button} href={WINDOWS_INSTALLER_URL} rel="noopener">
            <Monitor size={15} />
            Download for Windows
          </a>
        )}
        {manageInstallation && !standalone && !install && (
          <details className="relative">
            <summary className={button}>Install help</summary>
            <p className="absolute bottom-full right-0 z-10 mb-2 w-72 rounded-xl border border-border bg-card p-3 text-xs leading-relaxed text-foreground shadow-md">
              {ios
                ? "In Safari, open Share, then Add to Home Screen. If it is missing, open Studio directly in Safari."
                : windows
                  ? "Download the Windows app (.exe) and run the installer, or use your browser’s menu: Apps → Install Fairway Studio."
                  : "Open your browser’s menu and look for Install app or Add to Home Screen. Availability depends on your browser and device."}
            </p>
          </details>
        )}
        {manageInstallation && waiting && (
          <button
            className={button}
            disabled={busy}
            onClick={() => void run(update)}
          >
            <RefreshCw size={15} />
            Update ready
          </button>
        )}
      </div>
      {message && (
        <p role="status" className="text-xs text-amber-900">
          {message}
        </p>
      )}
      {open && scope && (
        <div className="max-w-2xl space-y-4 rounded-2xl border bg-white p-4 text-slate-800">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Saved on this device</h2>
            <button
              className={button}
              onClick={() => setOpen(false)}
              aria-label="Close device drafts"
            >
              <X size={16} />
            </button>
          </div>
          <p className="text-xs text-slate-600">
            Only this account and workspace’s drafts appear here. Browser
            storage can be cleared or evicted; export important unsynced text.
            Reviews, decisions, AI, and uploads require a connection.
          </p>
          <div className="grid gap-3">
            <label className="grid gap-1">
              Draft type
              <select
                className="min-h-11 rounded-lg border p-2"
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as "idea" | "note")
                }
              >
                <option value="idea">Idea</option>
                <option value="note">Note</option>
              </select>
            </label>
            <label className="grid gap-1">
              Title
              <input
                className="min-h-11 rounded-lg border p-2"
                maxLength={300}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="grid gap-1">
              Your draft
              <textarea
                className="min-h-32 rounded-lg border p-2"
                maxLength={100000}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </label>
            <button
              className={button}
              disabled={busy || (!title.trim() && !text.trim())}
              onClick={() => void run(save)}
            >
              Save on this device
            </button>
          </div>
          {syncAdapter?.permittedKinds && (
            <p className="text-xs text-slate-600">
              Workspace sync supports {syncAdapter.permittedKinds.join(" and ")}{" "}
              drafts. Other draft types stay on this device; export them when
              needed.
            </p>
          )}
          {!syncAdapter && (
            <p className="text-xs text-slate-600">
              Workspace sync is not configured. Drafts stay on this device until
              you export or copy them.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className={button} disabled={!pending} onClick={exportText}>
              Export unsynced text
            </button>
            {syncAdapter && (
              <button
                className={button}
                disabled={!online || busy}
                onClick={() => void run(retry)}
              >
                Retry sync
              </button>
            )}
          </div>
          <ul className="space-y-3">
            {drafts.map((draft) => (
              <li key={draft.id} className="space-y-2 rounded-xl border p-3">
                <p className="font-medium">
                  {draft.payload.title || "Untitled draft"}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">
                  {draft.payload.text}
                </p>
                <p className="text-xs text-slate-500">
                  {draft.status === "saved"
                    ? "Saved to workspace"
                    : draft.status === "local"
                      ? "Saved on this device"
                      : draft.status === "superseded"
                        ? "Original conflict retained on this device"
                        : draft.status === "conflict"
                          ? "Conflict · sync paused"
                          : draft.status === "syncing"
                            ? "Syncing…"
                            : "Waiting to sync"}{" "}
                  · {draft.kind}
                </p>
                {draft.error && (
                  <p className="text-xs text-amber-900">{draft.error}</p>
                )}
                {syncAdapter &&
                  (!syncAdapter.permittedKinds ||
                    syncAdapter.permittedKinds.includes(draft.kind)) &&
                  ["local", "error"].includes(draft.status) && (
                    <button
                      className={button}
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await queueDraft(scope, draft.id);
                          await retry();
                          await load();
                        })
                      }
                    >
                      Send to workspace
                    </button>
                  )}
                {draft.status === "conflict" && (
                  <>
                    <details>
                      <summary className="min-h-11 cursor-pointer py-3">
                        Review changes
                      </summary>
                      <p className="text-xs">
                        Workspace revision: {draft.remoteRevision}
                      </p>
                      <p className="whitespace-pre-wrap break-words">
                        {draft.remoteText || "No server text returned."}
                      </p>
                    </details>
                    <button
                      className={button}
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await keepMineAsNewDraft(scope, draft.id);
                          await load();
                          setMessage(
                            "Your text was copied to a new local draft. The original conflict is preserved for review.",
                          );
                        })
                      }
                    >
                      Keep mine as new draft
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {!drafts.length && (
            <p className="text-slate-500">No device drafts yet.</p>
          )}
        </div>
      )}
    </section>
  );
}
