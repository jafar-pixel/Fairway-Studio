"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Compass,
  Play,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import {
  GOALS,
  PAGE_GUIDES,
  categoryMatchesGoal,
  getTourStep,
  selectionOptionsForGuide,
  setOnboardingGoal,
  setOnboardingProject,
  setTourSelection,
  titleForOption,
  updateTour,
  type GuideStage,
  type OnboardingGoal,
  type OnboardingState,
} from "@/lib/studio/onboarding";

import { clearWalkthroughHandoff, createWalkthroughProgress, parseWalkthroughProgress, readWalkthroughHandoff, type WalkthroughProgress } from "@/lib/studio/guide-playback";
import { useGuidePlayback } from "@/lib/studio/use-guide-playback";
import { GuidePointer, GuidePortal, GuideToolbar, type GuideTargetSnapshot, type GuideToolbarProps } from "./guide";

type Props = {
  pageId: string;
  route: readonly string[];
  routeKey?: string;
  onNavigate?: (route: readonly string[]) => boolean | void;
  data: any;
  userId: string;
  state: OnboardingState;
  onChange: (state: OnboardingState) => void;
  persistenceAvailable?: boolean;
  onAction: (payload: {
    pageId: string;
    goal: OnboardingGoal | null;
    projectId: string | null;
    choiceId: string | null;
    note: string;
  }) => void;
};

const goalOrder: OnboardingGoal[] = [
  "brand_identity",
  "product",
  "apparel",
  "campaign",
  "guided_tour",
];

function goalCategoryLabel(goal: OnboardingGoal | null) {
  if (!goal) return "General";
  return GOALS[goal].label;
}

function currentItems(pageId: string, route: readonly string[], data: any, userId: string) {
  const options = selectionOptionsForGuide(pageId, route, data) as any[];
  const relevant = pageId === "reviews"
    ? options.filter((round) => {
        const isOpen = (round.state || round.status) === "open";
        const assigned = (round.reviewer_ids || round.reviewers || []).includes(userId);
        const alreadyResponded = (data.reviews || []).some(
          (review: any) => review.round_id === round.id && review.reviewer_id === userId && (!review.state || review.state === "submitted"),
        );
        return isOpen && assigned && !alreadyResponded;
      })
    : options;
  return [...new Map(relevant.filter((item) => item?.id).map((item) => [String(item.id), item])).values()];
}

export function OnboardingGuide({
  pageId,
  route,
  routeKey = route.join("/"),
  onNavigate,
  data,
  userId,
  state,
  onChange,
  onAction,
  persistenceAvailable = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchorTop, setAnchorTop] = useState(false);
  const [note, setNote] = useState("");
  const playbackScope = JSON.stringify([userId, data.workspace?.id || (routeKey.startsWith("/demo") ? "demo" : routeKey.split("/").slice(0, 3).join("/"))]);
  const [inheritedPlayback] = useState(() => onNavigate
    ? readWalkthroughHandoff(playbackScope, route, (data.projects || []).map((project: any) => String(project.id)))
    : null);
  const [walkthroughOpen, setWalkthroughOpen] = useState(!!inheritedPlayback);
  const [walkthroughInitial, setWalkthroughInitial] = useState<WalkthroughProgress | null>(inheritedPlayback?.progress || null);
  const [walkthroughAutoPlay, setWalkthroughAutoPlay] = useState(inheritedPlayback?.playing ?? true);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const context = PAGE_GUIDES[pageId] || PAGE_GUIDES.home;
  const currentProjectId = pageId === "projectOverview" || pageId === "canvas" || pageId === "reviews" || pageId === "decisions" || pageId === "files" || ((pageId === "studioAI" || pageId === "generation") && route[0] === "projects")
    ? route[1] || null
    : null;
  const accessibleProjectIds = useMemo(
    () => (data.projects || []).map((project: any) => String(project.id)),
    [data.projects],
  );
  const routeProject = currentProjectId
    ? (data.projects || []).find((project: any) => String(project.id) === currentProjectId)
    : null;
  const storedProjectId = state.selectedProjectId && accessibleProjectIds.includes(state.selectedProjectId)
    ? state.selectedProjectId
    : null;
  const selectedProjectId = currentProjectId
    ? routeProject?.id || null
    : storedProjectId;
  const goalProjects = useMemo(() => {
    const projects = (data.projects || []).filter((project: any) => !project.archived_at && project.phase !== "archived");
    if (!state.goal || state.goal === "guided_tour") return projects;
    return [
      ...projects.filter((project: any) => categoryMatchesGoal(project.category, state.goal)),
      ...projects.filter((project: any) => !categoryMatchesGoal(project.category, state.goal)),
    ];
  }, [data.projects, state.goal]);
  const items = useMemo(
    () => currentItems(pageId, route, data, userId),
    [pageId, route, data, userId],
  );
  const storedChoice = state.selections[pageId] || "";
  const choiceId = items.some((item: any) => String(item.id) === storedChoice)
    ? storedChoice
    : storedChoice === "new"
      ? "new"
      : "";
  const firstWelcome = !state.welcomeDismissed;
  const visible = open || menuOpen;
  const progress = getTourStep(state, pageId);
  const step: GuideStage = firstWelcome && !open ? "welcome" : progress.stepId;
  const projectSelector = ["home", "projects", "projectOverview", "canvas", "reviews", "decisions", "files", "generation"].includes(pageId);
  const projectRequired = !currentProjectId && ["projects", "projectOverview", "canvas", "reviews", "decisions", "files", "generation"].includes(pageId);
  const matchingProjects = state.goal && state.goal !== "guided_tour"
    ? goalProjects.filter((project: any) => categoryMatchesGoal(project.category, state.goal))
    : goalProjects;
  const selectedProject = (data.projects || []).find((project: any) => String(project.id) === selectedProjectId);
  const selectedItem = items.find((item: any) => String(item.id) === choiceId);
  const stageNumber = step === "welcome" ? 1 : step === "selection" ? 2 : 3;

  useEffect(() => {
    if (inheritedPlayback) clearWalkthroughHandoff(playbackScope, inheritedPlayback.token);
  }, [playbackScope, inheritedPlayback]);

  useEffect(() => {
    const openFromFooter = () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      setAnchorTop(true);
      setOpen(true);
      setMenuOpen(true);
      setNote("");
      window.requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
    };
    window.addEventListener("fs:open-onboarding", openFromFooter);
    return () => window.removeEventListener("fs:open-onboarding", openFromFooter);
  }, []);

  useEffect(() => {
    if (!visible || walkthroughOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (open) closeGuide();
        else setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, pageId, state, walkthroughOpen]);

  function closeGuide() {
    setOpen(false);
    setMenuOpen(false);
    setAnchorTop(false);
    window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".fs-onboarding-trigger")?.focus({ preventScroll: true }));
    onChange({
      ...updateTour(state, pageId, progress.stepId, "skipped"),
      welcomeDismissed: true,
      updatedAt: new Date().toISOString(),
    });
  }

  function startGuide(target: GuideStage = progress.status !== "completed" ? progress.stepId : "welcome") {
    setOpen(true);
    setMenuOpen(false);
    setNote("");
    onChange(updateTour(state, pageId, target, "inProgress"));
  }

  function goTo(stage: GuideStage) {
    setMenuOpen(false);
    setOpen(true);
    onChange(updateTour(state, pageId, stage, "inProgress"));
    window.requestAnimationFrame(() => headingRef.current?.focus());
  }

  function dismissWelcome() {
    setMenuOpen(false);
    setOpen(false);
    setAnchorTop(false);
    window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".fs-onboarding-trigger")?.focus({ preventScroll: true }));
    onChange({
      ...updateTour(state, pageId, "welcome", "skipped"),
      welcomeDismissed: true,
    });
  }

  function doAction() {
    setMenuOpen(false);
    if (state.goal !== "guided_tour") onAction({
      pageId,
      goal: state.goal,
      projectId: selectedProjectId,
      choiceId: choiceId && choiceId !== "new" ? choiceId : null,
      note: note.trim(),
    });
    onChange({
      ...updateTour(state, pageId, "handoff", "completed"),
      welcomeDismissed: true,
    });
    setOpen(false);
    setAnchorTop(false);
  }

  function startWalkthrough() {
    const saved = parseWalkthroughProgress(state.walkthrough, accessibleProjectIds);
    const initial = saved && !saved.completed ? saved : createWalkthroughProgress(route, selectedProjectId, accessibleProjectIds);
    setWalkthroughInitial(initial);
    setWalkthroughAutoPlay(true);
    setWalkthroughOpen(true);
    setMenuOpen(false);
    setOpen(false);
    setAnchorTop(false);
    onChange({ ...state, walkthrough: initial, welcomeDismissed: true, updatedAt: new Date().toISOString() });
  }

  if (walkthroughOpen && walkthroughInitial && onNavigate) {
    return <WalkthroughPlayer
      scope={playbackScope}
      autoPlay={walkthroughAutoPlay}
      initial={walkthroughInitial}
      route={route}
      routeKey={routeKey}
      projectIds={accessibleProjectIds}
      onNavigate={onNavigate}
      onProgress={(walkthrough) => onChange({ ...state, walkthrough, welcomeDismissed: true, updatedAt: new Date().toISOString() })}
      onClose={() => {
        setWalkthroughOpen(false); setOpen(false); setMenuOpen(false);
        window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".fs-onboarding-trigger")?.focus({ preventScroll: true }));
      }}
    />;
  }

  if (!visible) return null;

  return (
    <GuidePortal>
      <button
        type="button"
        className="fs-onboarding-trigger fs-onboarding-trigger-open"
        data-guide-player
        data-anchor={anchorTop ? "top" : undefined}
        aria-expanded="true"
        aria-controls="fs-guide-options"
        onClick={() => setMenuOpen((value) => !value)}
      >
        <Compass size={18} /> <span>Guide</span>
      </button>
      <aside id="fs-guide-options" className="fs-onboarding-popover" data-guide-player data-anchor={anchorTop ? "top" : undefined} aria-labelledby="fs-onboarding-title" aria-describedby="fs-onboarding-outcome">
        <div className="fs-onboarding-header">
          <div>
            <p className="fs-onboarding-kicker">{firstWelcome ? "YOUR STUDIO, YOUR PACE" : "FAIRWAY STUDIO GUIDE"}</p>
            <h2 ref={headingRef} id="fs-onboarding-title" tabIndex={-1}>{firstWelcome ? "Start with your own ideas" : context.title}</h2>
          </div>
          <button type="button" className="fs-onboarding-icon" aria-label="Close guide" onClick={firstWelcome && step === "welcome" ? dismissWelcome : closeGuide}>
            <X size={19} />
          </button>
        </div>
        {!firstWelcome && menuOpen && (
          <div className="fs-onboarding-menu" aria-label="Guide options">
            <button type="button" onClick={() => startGuide()}>Resume this guide</button>
            <button type="button" onClick={() => startGuide("welcome")}><RotateCcw size={15} /> Replay this page</button>
            <button type="button" onClick={() => goTo("selection")}>Change goal</button>
          </div>
        )}
        {onNavigate && <div className="fs-onboarding-run">
          <button type="button" className="fs-onboarding-primary" onClick={startWalkthrough}><Play size={16} /> {state.walkthrough && !state.walkthrough.completed ? "Resume walkthrough" : "Run walkthrough"}</button>
          <span>Follow a read-only pointer tour at your pace.</span>
        </div>}
        <div className="fs-onboarding-progress" aria-label={`Step ${stageNumber} of 3`} aria-live="polite">
          {["Welcome", "Choose", "Review"].map((label, index) => (
            <span key={label} aria-current={index + 1 === stageNumber ? "step" : undefined} className={index + 1 <= stageNumber ? "is-current" : ""}>
              <i>{index + 1 < stageNumber ? <Check size={13} /> : index + 1}</i>{label}
            </span>
          ))}
        </div>
        {!persistenceAvailable && <p className="fs-onboarding-context" role="status">Progress is available for this visit, but browser storage is unavailable, so it may not resume after you leave.</p>}
        {step === "welcome" && (
          <div className="fs-onboarding-body">
            <p id="fs-onboarding-outcome">{context.outcome}</p>
            <div className="fs-onboarding-tip">
              <strong>Before you start</strong>
              <p>{context.prepare} Optional references can be added later.</p>
            </div>
            {currentProjectId && (
              <p className="fs-onboarding-context">This page stays in <strong>{routeProject?.title || "the current project"}</strong>; the guide will not switch projects.</p>
            )}
            <div className="fs-onboarding-actions">
              <button type="button" className="fs-onboarding-primary" onClick={() => goTo("selection")}>Choose a goal <ArrowRight size={16} /></button>
              {firstWelcome && <button type="button" className="fs-onboarding-secondary" onClick={dismissWelcome}>Skip for now</button>}
            </div>
          </div>
        )}
        {step === "selection" && (
          <div className="fs-onboarding-body">
            <p id="fs-onboarding-outcome">{context.select}</p>
            <label className="fs-onboarding-label">
              What are you working on?
              <select value={state.goal || ""} onChange={(event) => onChange(setOnboardingGoal(state, event.target.value as OnboardingGoal))}>
                <option value="" disabled>Choose a goal</option>
                {goalOrder.map((goal) => <option key={goal} value={goal}>{GOALS[goal].label}</option>)}
              </select>
              {state.goal && <small>{GOALS[state.goal].description}</small>}
            </label>
            {projectSelector && (
              <label className="fs-onboarding-label">
                {currentProjectId ? "Current project" : "Project (optional)"}
                {currentProjectId ? (
                  <div className="fs-onboarding-fixed-choice">{routeProject?.title || "Current project"}</div>
                ) : (
                  <select
                    value={selectedProjectId || ""}
                    onChange={(event) => onChange(setOnboardingProject(state, event.target.value || null, accessibleProjectIds))}
                    disabled={!state.goal || state.goal === "guided_tour" || matchingProjects.length === 0}
                  >
                    <option value="">{state.goal === "guided_tour" ? "Read-only tour · no project needed" : matchingProjects.length ? "Choose a project or start new" : "No matching project yet"}</option>
                    {matchingProjects.map((project: any) => (
                      <option key={project.id} value={project.id}>{project.title || project.name} · {project.category || "General"}</option>
                    ))}
                  </select>
                )}
                {!currentProjectId && pageId !== "home" && state.goal !== "guided_tour" && (
                  <button
                    type="button"
                    className={`fs-onboarding-new ${state.selections.home === "new" ? "is-selected" : ""}`}
                    aria-pressed={state.selections.home === "new"}
                    onClick={() => {
                      onChange(setTourSelection(
                        setOnboardingProject(state, null, accessibleProjectIds),
                        "home",
                        "new",
                      ));
                    }}
                  >
                    <Sparkles size={15} /> Create a new project instead
                  </button>
                )}
                {currentProjectId && routeProject && state.goal && state.goal !== "guided_tour" && !categoryMatchesGoal(routeProject.category, state.goal) && (
                  <small className="fs-onboarding-context">This project is {routeProject.category || "general"}; it stays selected even though it differs from your goal.</small>
                )}
              </label>
            )}
            {items.length > 0 && !["home", "projects", "projectOverview", "canvas", "reviews", "decisions", "files", "generation"].includes(pageId) && (
              <label className="fs-onboarding-label">
                {context.select}
                <select value={choiceId} onChange={(event) => onChange(setTourSelection(state, pageId, event.target.value))}>
                  <option value="">Choose an existing item</option>
                  {items.map((item: any) => <option key={item.id} value={item.id}>{titleForOption(item)}</option>)}
                  {["ideas", "tasks", "conversations"].includes(pageId) && state.goal !== "guided_tour" && <option value="new">Start something new</option>}
                </select>
              </label>
            )}
            {state.goal && pageId === "generation" && !selectedProjectId && <p className="fs-onboarding-context">Select a project on the next screen before you can request an image. No request starts from this guide.</p>}
            <div className="fs-onboarding-actions">
              <button type="button" className="fs-onboarding-secondary" onClick={() => goTo("welcome")}><ArrowLeft size={16} /> Back</button>
              <button type="button" className="fs-onboarding-primary" disabled={!state.goal || (projectRequired && !currentProjectId && !selectedProjectId && state.selections.home !== "new" && state.goal !== "guided_tour")} onClick={() => goTo("handoff")}>Review next step <ArrowRight size={16} /></button>
            </div>
          </div>
        )}
            {step === "handoff" && (
          <div className="fs-onboarding-body">
            <p id="fs-onboarding-outcome">{context.handoff}</p>
            {(pageId === "studioAI" || pageId === "generation") && <AIWorkflowNote />}
            <div className="fs-onboarding-review">
              <span>Goal</span><strong>{goalCategoryLabel(state.goal)}</strong>
              {selectedProject && <><span>Project</span><strong>{selectedProject.title || selectedProject.name}</strong></>}
              {currentProjectId && <><span>Project</span><strong>{routeProject?.title || "Current project"}</strong></>}
              {selectedItem && <><span>Selected</span><strong>{titleForOption(selectedItem)}</strong></>}
              {choiceId === "new" && <><span>Selection</span><strong>Start something new</strong></>}
              {!selectedProject && !currentProjectId && projectRequired && state.goal !== "guided_tour" && <><span>Project</span><strong>Create new or choose on the next screen</strong></>}
            </div>
            {["ideas", "projects", "studioAI", "generation"].includes(pageId) && state.goal !== "guided_tour" && (
              <label className="fs-onboarding-label">A short brief (optional)
                <textarea rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What are you trying to accomplish?" />
                <small>This note stays in this guide and is not saved automatically.</small>
              </label>
            )}
            <div className="fs-onboarding-actions">
              <button type="button" className="fs-onboarding-secondary" onClick={() => goTo("selection")}><ArrowLeft size={16} /> Back</button>
              <button type="button" className="fs-onboarding-primary" disabled={!state.goal} onClick={doAction}>{state.goal === "guided_tour" ? "Continue exploring" : context.actionLabel} <ArrowRight size={16} /></button>
            </div>
          </div>
        )}
      </aside>
    </GuidePortal>
  );
}

export function WalkthroughPlayer({ scope, autoPlay = true, initial, route, routeKey, projectIds, onNavigate, onProgress, onClose }: {
  scope: string;
  autoPlay?: boolean;
  initial: WalkthroughProgress;
  route: readonly string[];
  routeKey: string;
  projectIds: readonly string[];
  onNavigate: (route: readonly string[]) => boolean | void;
  onProgress: (progress: WalkthroughProgress) => void;
  onClose: () => void;
}) {
  const [target, setTarget] = useState<{ stepId: string; status: string } | null>(null);
  const [runSequence, setRunSequence] = useState(0);
  const [position, setPosition] = useState<GuideToolbarProps["position"]>("bottom-right");
  const player = useGuidePlayback({ scope, initial, autoPlay, route, routeKey, projectIds, onNavigate, onProgress, target });
  const targetChanged = useCallback((snapshot: GuideTargetSnapshot) => {
    setTarget((previous) => previous?.stepId === player.scene.id && previous.status === snapshot.status ? previous : { stepId: player.scene.id, status: snapshot.status });
    // Keep controls on the opposite vertical edge from the actual target, including
    // mobile. Hold the last position if temporarily obscured to avoid oscillation.
    const targetY = snapshot.point?.y ?? (snapshot.rect ? snapshot.rect.top + snapshot.rect.height / 2 : null);
    if (targetY !== null && snapshot.viewport) setPosition(targetY > snapshot.viewport.top + snapshot.viewport.height / 2 ? "top-right" : "bottom-right");
  }, [player.scene.id]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("[data-guide-toolbar] button")?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  function close() { player.pause(); onClose(); }
  const status = player.pending ? "Opening the next page…"
    : !player.routeReady ? "Page changed. Play returns to your saved step."
    : !player.targetReady ? player.playing ? "Finding this control…" : "Control not visible. Next skips this step."
    : player.scene.checkpoint ? "Your turn. Next continues the read-only tour."
    : player.progress.completed ? "Tour complete. Your work is unchanged."
    : player.playing ? "Pointer preview only. You choose every real click."
    : "Paused. Play continues; Back revisits the previous step.";
  return <>
    <GuidePointer
      target={player.scene.target}
      active={player.routeReady && !player.pending}
      playing={player.playing}
      stepKey={`${routeKey}:${player.scene.id}`}
      runKey={`${scope}:${runSequence}`}
      label={player.scene.checkpoint ? "Your turn" : undefined}
      onTargetChange={targetChanged}
    />
    <GuidePortal>
      <div className="fs-guide-dock" data-guide-player data-position={position}>
        <details key={player.scene.id} className="fs-guide-step-help" onToggle={(event) => { if (event.currentTarget.open) player.pause("Paused while you read about this step."); }}>
          <summary>About this step</summary>
          <div className="fs-guide-step-popover">
            <strong>{player.scene.title}</strong>
            <p>{player.scene.detail}</p>
            <small>{player.message}{player.reducedMotion ? " Reduced motion is on; the pointer stays still." : ""}</small>
          </div>
        </details>
        <GuideToolbar
          title={player.scene.title}
          caption={status}
          playing={player.playing}
          busy={player.pending}
          step={player.index + 1}
          total={player.count}
          canBack={player.index > 0 && !player.pending}
          canNext={player.index < player.count - 1 && !player.pending}
          onTogglePlay={() => { if (!player.pending) player.playing ? player.pause() : player.play(); }}
          onBack={player.back}
          onNext={player.next}
          onRestart={() => { if (!player.pending) { setRunSequence((value) => value + 1); player.restart(); } }}
          onClose={close}
          position={position}
        />
      </div>
    </GuidePortal>
  </>;
}

function AIWorkflowNote() {
  return (
    <section className="fs-onboarding-ai-note" aria-label="AI tools and review workflow">
      <h3>Choose the right creative tool</h3>
      <p><strong>Creative Assistant</strong> helps with briefs, names, creative directions, comparisons, feedback summaries, and task drafts. <small>GPT-5.4 mini · OpenAI</small></p>
      <p><strong>Image Studio</strong> creates logo concepts, product mockups, and edits to a selected source image. <small>GPT Image 2 · OpenAI</small></p>
      <p className="fs-onboarding-ai-workflow">Write a brief → create a draft image → refine it → review and save deliberately.</p>
      <p className="fs-onboarding-ai-caution">Requests may incur provider usage charges; no price is estimated here. AI output is exploratory, not native vector artwork, trademark clearance, or a production-ready final asset. A person reviews and approves every direction.</p>
    </section>
  );
}

export { goalCategoryLabel };
