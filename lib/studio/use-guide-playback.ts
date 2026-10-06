"use client";

import { useEffect, useRef, useState } from "react";
import {
  clearWalkthroughHandoff,
  prepareWalkthroughHandoff,
  moveWalkthrough,
  safeWalkthroughRoute,
  sameWalkthroughRoute,
  WALKTHROUGH_DELAY_MS,
  WALKTHROUGH_NAVIGATION_TIMEOUT_MS,
  WALKTHROUGH_TARGET_TIMEOUT_MS,
  walkthroughStepIndex,
  walkthroughSteps,
  type WalkthroughProgress,
} from "./guide-playback";

type PlaybackOptions = {
  scope: string;
  initial: WalkthroughProgress;
  autoPlay: boolean;
  route: readonly string[];
  routeKey: string;
  projectIds: readonly string[];
  /** Visibility belongs to this exact scene; stale geometry must never advance a new step. */
  target: { stepId: string; status: string } | null;
  onNavigate: (route: readonly string[]) => boolean | void;
  onProgress: (progress: WalkthroughProgress) => void;
};

/** The player only exposes route changes. It has no access to a work/action callback. */
export function useGuidePlayback(options: PlaybackOptions) {
  const [progress, setProgress] = useState(options.initial);
  const [playing, setPlaying] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const progressRef = useRef(progress);
  const optionsRef = useRef(options);
  const playingRef = useRef(false);
  const pendingRef = useRef<readonly string[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRouteKey = useRef(options.routeKey);
  const initialized = useRef(false);
  const handoffRef = useRef<number | undefined>(undefined);
  optionsRef.current = options;
  const steps = walkthroughSteps(progress);
  const index = walkthroughStepIndex(progress, steps);
  const scene = steps[index];
  const routeReady = sameWalkthroughRoute(options.route, scene.route);
  const projectScope = JSON.stringify(options.projectIds);
  const targetReady = options.target?.stepId === scene.id && options.target.status === "visible";
  const targetReadyRef = useRef(targetReady);
  targetReadyRef.current = targetReady;

  function clearTimer() {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }
  function pause(reason = "Paused. Continue whenever you are ready.") {
    clearTimer();
    clearWalkthroughHandoff(optionsRef.current.scope);
    handoffRef.current = undefined;
    playingRef.current = false;
    pendingRef.current = null;
    setPending(false);
    setPlaying(false);
    setMessage(reason);
  }
  function show(next: WalkthroughProgress, continuePlaying: boolean) {
    if (pendingRef.current) return; // Preserve its navigation timeout until it resolves or is interrupted.
    clearTimer();
    const current = optionsRef.current;
    const nextSteps = walkthroughSteps(next);
    const nextScene = nextSteps[walkthroughStepIndex(next, nextSteps)];
    if (!safeWalkthroughRoute(nextScene.route, current.projectIds)) {
      pause("This project is no longer available. Close the guide and restart from an accessible page.");
      return;
    }
    const needsNavigation = !sameWalkthroughRoute(current.route, nextScene.route);
    const canPlay = continuePlaying && !nextScene.checkpoint && !next.completed && document.visibilityState !== "hidden";
    if (needsNavigation) {
      pendingRef.current = nextScene.route;
      handoffRef.current = prepareWalkthroughHandoff(current.scope, next, nextScene.route, canPlay);
      try {
        if (current.onNavigate(nextScene.route) === false) {
          pendingRef.current = null;
          pause("Navigation paused to protect your work. Finish or close the open editor before continuing.");
          return;
        }
      } catch {
        pendingRef.current = null;
        pause("That page could not be opened. Try again when the workspace is ready.");
        return;
      }
    }
    setPending(needsNavigation);
    progressRef.current = next;
    setProgress(next);
    current.onProgress(next);
    playingRef.current = canPlay;
    setPlaying(canPlay);
    setMessage(nextScene.checkpoint ? "Paused before input or an action. Next continues the read-only tour." : next.completed ? "Tour complete. Your workspace records are unchanged." : canPlay ? "Playing. The next step opens automatically." : "Paused. Continue whenever you are ready.");
  }
  function play() {
    if (pendingRef.current || document.visibilityState === "hidden") return;
    const current = progressRef.current;
    const currentSteps = walkthroughSteps(current);
    const currentScene = currentSteps[walkthroughStepIndex(current, currentSteps)];
    show(current.completed ? moveWalkthrough(current, "restart") : currentScene.checkpoint ? moveWalkthrough(current, 1) : current, true);
  }
  function next() { show(moveWalkthrough(progressRef.current, 1), false); }
  function back() { show(moveWalkthrough(progressRef.current, -1), false); }
  function restart() { show(moveWalkthrough(progressRef.current, "restart"), false); }

  // Deliberate start only. Re-renders and restored storage never start playback themselves.
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    show(progressRef.current, optionsRef.current.autoPlay);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReducedMotion(media.matches);
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  // External route changes cancel autoplay. The single route requested by this player
  // may finish; it must match exactly before another scene can be scheduled.
  useEffect(() => {
    if (lastRouteKey.current === options.routeKey) return;
    lastRouteKey.current = options.routeKey;
    clearTimer();
    const expected = pendingRef.current;
    clearWalkthroughHandoff(optionsRef.current.scope, handoffRef.current);
    handoffRef.current = undefined;
    pendingRef.current = null;
    setPending(false);
    if (!expected || !sameWalkthroughRoute(options.route, expected)) {
      pause("You changed pages. Playback is paused; Play returns to the saved tour step.");
    }
  }, [options.routeKey]);

  useEffect(() => {
    if (!safeWalkthroughRoute(scene.route, optionsRef.current.projectIds)) {
      pause("This project is no longer available. Close the guide and restart from an accessible page.");
      pendingRef.current = null;
      setPending(false);
    }
  }, [projectScope, scene.id]);

  useEffect(() => {
    function interrupt() { pause("Playback paused while you were away. Press Play to continue."); }
    function visibility() { if (document.visibilityState === "hidden") interrupt(); }
    function historyNavigation() {
      pendingRef.current = null;
      setPending(false);
      pause("Browser navigation paused the tour. Press Play when you are ready.");
    }
    // Any interaction with the workspace pauses before the user's input/action.
    function workspaceInteraction(event: Event) {
      // App Router may focus the destination during its own transition. Actual
      // pointer, keyboard and input events still interrupt it immediately.
      if (event.type === "focusin" && pendingRef.current) return;
      const target = event.target;
      if (target instanceof Element && !target.closest("[data-guide-player]") && playingRef.current) {
        pause("Paused so you can work. Press Play to resume the tour.");
      }
    }
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("pointerdown", workspaceInteraction, true);
    document.addEventListener("focusin", workspaceInteraction, true);
    document.addEventListener("input", workspaceInteraction, true);
    document.addEventListener("keydown", workspaceInteraction, true);
    document.addEventListener("wheel", workspaceInteraction, { capture: true, passive: true });
    document.addEventListener("touchstart", workspaceInteraction, { capture: true, passive: true });
    window.addEventListener("pagehide", interrupt);
    window.addEventListener("blur", interrupt);
    window.addEventListener("popstate", historyNavigation);
    return () => {
      clearTimer();
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("pointerdown", workspaceInteraction, true);
      document.removeEventListener("focusin", workspaceInteraction, true);
      document.removeEventListener("input", workspaceInteraction, true);
      document.removeEventListener("keydown", workspaceInteraction, true);
      document.removeEventListener("wheel", workspaceInteraction, true);
      document.removeEventListener("touchstart", workspaceInteraction, true);
      window.removeEventListener("pagehide", interrupt);
      window.removeEventListener("blur", interrupt);
      window.removeEventListener("popstate", historyNavigation);
    };
  }, []);

  useEffect(() => {
    clearTimer();
    if (pendingRef.current) {
      timerRef.current = setTimeout(() => {
        pendingRef.current = null;
        setPending(false);
        pause("The page has not opened yet. Playback stopped; try Play again when it is ready.");
      }, WALKTHROUGH_NAVIGATION_TIMEOUT_MS);
    } else if (playing && playingRef.current && routeReady && !targetReady) {
      // One bounded layout/geometry acquisition window. A hidden or removed
      // control must stop playback rather than leave a running tour waiting forever.
      timerRef.current = setTimeout(() => {
        if (!targetReadyRef.current) pause("This control is not visible. Open it yourself, or choose Next to skip this step.");
      }, WALKTHROUGH_TARGET_TIMEOUT_MS);
    } else if (playing && playingRef.current && routeReady && targetReady && !scene.checkpoint && !progress.completed && document.visibilityState !== "hidden") {
      timerRef.current = setTimeout(() => {
        if (!playingRef.current || !targetReadyRef.current || document.visibilityState === "hidden") return;
        show(moveWalkthrough(progressRef.current, 1), true);
      }, WALKTHROUGH_DELAY_MS);
    }
    return clearTimer;
  }, [playing, pending, scene.id, routeReady, options.routeKey, progress.completed, targetReady]);

  // Only bring a rendered real control into view. Never use a page-sized fallback,
  // open menus, focus fields, or synthesize input. Pointer geometry is owned by the
  // presentation layer, which must confirm visibility before autoplay can advance.
  useEffect(() => {
    if (!routeReady || pending) return;
    const frame = window.requestAnimationFrame(() => {
      const candidates = [...document.querySelectorAll<HTMLElement>(scene.target)];
      const target = candidates.find((element) => {
        if (!element.getClientRects().length || element.closest("details:not([open]) > :not(summary)")) return false;
        for (let node: HTMLElement | null = element; node; node = node.parentElement) {
          const style = window.getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity || 1) === 0 || node.hidden) return false;
        }
        return true;
      });
      target?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scene.id, options.routeKey, routeReady, pending]);

  return { progress, scene, index, count: steps.length, playing, pending, message, reducedMotion, targetReady, routeReady, play, pause, next, back, restart };
}
