"use client";
import { useEffect, useRef } from "react";
export const CREATOR_NAVIGATION_EVENT = "fairway-before-navigate";
/** Shared by application navigation, native Back/Forward and the editor's own dismissal. */
export function useCreatorNavigationGuard({ dirty, busy, onBlocked, dirtyMessage, busyMessage, onNativeNavigate }: { dirty: boolean; busy: boolean; onBlocked: (message: string) => void; dirtyMessage?: string; busyMessage?: string; onNativeNavigate?: (url: string) => boolean }) {
  const current = useRef({ dirty, busy, onBlocked, dirtyMessage, busyMessage, onNativeNavigate });
  current.current = { dirty, busy, onBlocked, dirtyMessage, busyMessage, onNativeNavigate };
  const allowed = (clear = true) => {
    const state = current.current;
    if (state.busy) { state.onBlocked(state.busyMessage || "A save or upload is in progress. Wait for it to finish before leaving; your draft is still here."); return false; }
    if (state.dirty && !window.confirm(state.dirtyMessage || "Leave this unfinished draft? Unsaved text and selected files will be lost. Anything already saved stays in Library and on the idea. Choose Cancel to keep editing.")) return false;
    if (clear) current.current = { ...state, dirty: false, busy: false };
    return true;
  };
  useEffect(() => {
    const previousUrl = window.location.href;
    const previousState = window.history.state;
    const navigation = (event: Event) => { if (!allowed(false)) event.preventDefault(); };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (current.current.dirty || current.current.busy) { event.preventDefault(); event.returnValue = ""; } };
    const popstate = (event: PopStateEvent) => {
      if (!current.current.dirty && !current.current.busy) return;
      const target = window.location.href;
      event.stopImmediatePropagation();
      // Restore the currently mounted editor before asking, so Cancel does not lose it.
      window.history.pushState(previousState, "", previousUrl);
      if (current.current.onNativeNavigate) {
        if (!allowed(false)) return;
        const state = current.current;
        current.current = { ...state, dirty: false, busy: false };
        // Only suppress this guard during the synchronous, already-confirmed SPA dispatch.
        // Restore it if another guard cancels or the router does not commit a transition.
        try { state.onNativeNavigate?.(target); } finally { current.current = state; }
      } else if (allowed()) window.location.assign(target);
    };
    window.addEventListener(CREATOR_NAVIGATION_EVENT, navigation);
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", popstate, true);
    return () => {
      window.removeEventListener(CREATOR_NAVIGATION_EVENT, navigation);
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", popstate, true);
    };
  }, []);
  return Object.assign((action: () => void) => { if (allowed()) action(); }, {
    confirmed(action: () => boolean) {
      const previous = current.current;
      current.current = { ...previous, dirty: false, busy: false };
      // A second guard or failed router transition must not disable this guard.
      try { return action(); } finally { current.current = previous; }
    },
    complete(action: () => void) {
      current.current = { ...current.current, dirty: false, busy: false };
      action();
    },
  });
}
