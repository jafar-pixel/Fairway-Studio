/** Read-only walkthrough scenes. A scene may navigate or highlight, never activate a control. */
export type WalkthroughProgress = {
  stepId: string;
  originRoute: string[];
  projectId: string | null;
  completed: boolean;
};
export type WalkthroughStep = {
  id: string;
  route: readonly string[];
  title: string;
  detail: string;
  target: string;
  checkpoint?: boolean;
};
export const WALKTHROUGH_DELAY_MS = 6500;
export const WALKTHROUGH_NAVIGATION_TIMEOUT_MS = 10000;
export const WALKTHROUGH_TARGET_TIMEOUT_MS = 1200;
const ROOTS = new Set(["ideas", "projects", "library", "tasks", "conversations", "brand-kit", "settings"]);
const PROJECT_TABS = new Set(["overview", "canvas", "reviews", "decisions", "files"]);
const SETTINGS_TABS = new Set(["members", "workspace", "review-rules", "integrations", "notifications", "devices", "profile"]);

export function safeWalkthroughRoute(value: unknown, projectIds: readonly string[]): string[] | null {
  if (!Array.isArray(value) || value.some((part) => typeof part !== "string")) return null;
  if (!value.length) return [];
  const [root, id, tab] = value;
  if (!ROOTS.has(root)) return null;
  if (value.length === 1) return [root];
  if (root === "settings" && value.length === 2 && SETTINGS_TABS.has(id)) return [root, id];
  if (root !== "projects" || !projectIds.includes(id) || /[/?#\\]/.test(id) || id === "." || id === "..") return null;
  if (value.length === 2) return [root, id];
  return value.length === 3 && PROJECT_TABS.has(tab) ? [root, id, tab] : null;
}

export function sameWalkthroughRoute(a: readonly string[], b: readonly string[]) {
  // /projects/:id and /projects/:id/overview show the same page.
  const normalize = (route: readonly string[]) => route[0] === "projects" && route.length === 3 && route[2] === "overview" ? route.slice(0, 2) : route;
  const left = normalize(a), right = normalize(b);
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

export function createWalkthroughProgress(route: readonly string[], projectId: string | null, projectIds: readonly string[]): WalkthroughProgress {
  const originRoute = safeWalkthroughRoute(route, projectIds) || [];
  return {
    stepId: "start",
    originRoute,
    projectId: originRoute[0] === "projects" && originRoute[1] ? originRoute[1] : projectId && projectIds.includes(projectId) && safeWalkthroughRoute(["projects", projectId], projectIds) ? projectId : null,
    completed: false,
  };
}

export function walkthroughSteps(progress: WalkthroughProgress): WalkthroughStep[] {
  const page = (id: string, route: string[], title: string, detail: string, target: string, checkpoint = false): WalkthroughStep => ({ id, route, title, detail, target, checkpoint });
  const search = 'input[aria-label="Search projects, ideas, or files"], button[aria-label="Search workspace"]';
  const steps = [
    page("start", progress.originRoute, "Follow the pointer", "Start with your own photos, sketches, files, or a rough idea. The animated pointer is a preview: you choose every click. Play visits pages; it never saves or submits work.", search),
    page("home", [], "Pick up your next idea", "Ideas is where your own source material and intent begin. On a small screen, open the navigation menu to find it. A polished brief can follow later.", 'nav[aria-label="Main navigation"] a[href$="/ideas"], button[aria-label="Open navigation"]'),
    page("ideas", ["ideas"], "Find the original thinking", "Filter and revisit ideas with their original references. Keep the creator, source, and context attached as the idea develops.", '[aria-label="Idea type"]'),
    page("ideas-input", ["ideas"], "Your idea, your starting point", "New idea opens an editor for your title, rough brief, and references. Nothing has been created. Choose Next to keep touring, or close the guide to try it yourself.", '[data-onboarding="idea-create"]', true),
    page("projects", ["projects"], "Give the work a home", "Search existing projects for the right brief and context. The guide visits only a project you selected; it never chooses or creates one for you.", 'input[aria-label="Search projects"]'),
    page("library", ["library"], "Bring your own source material", "Add to library offers your own photos, sketches, and files. Preserve the original and its provenance; references and AI drafts stay distinct from approved work. Uploading is always your choice.", '.fc-library-add > summary'),
  ];
  if (progress.projectId) {
    const project = ["projects", progress.projectId];
    steps.push(
      page("project-overview", project, "Start with the brief", "Review this project's intended outcome before developing a direction. Edit brief opens its real editor; the pointer never changes the brief.", '[data-onboarding="project-brief"]', true),
      page("files", [...project, "files"], "Keep the original connected", "Project files preserve links to source assets and ownership. Inspect provenance before using a file. Upload opens the real flow only when you choose it.", '[data-onboarding="files-library-link"]', true),
      page("canvas", [...project, "canvas"], "Develop from those sources", "Canvas brings saved concepts, references, notes, and versions together. Keep originals intact while exploring and comparing new directions.", '.fp-tab-canvas'),
      page("canvas-input", [...project, "canvas"], "Choose the next creative step", "Use Note, or Add on a small screen, to record context. Creative Assistant supports text; Image Studio creates exploratory drafts. Any AI request needs your explicit action and may incur usage charges.", '[data-guide-target="canvas-note"], .fp-mobile-add-menu > summary', true),
      page("reviews", [...project, "reviews"], "Review the exact version", "Reviews are pinned to a version and an approval scope. Only your explicit Submit records a response. Touring this page never responds for you.", '.fp-tab-reviews'),
      page("decisions", [...project, "decisions"], "Trace decisions to evidence", "Read the outcome, scope, and linked review evidence. A narrow approval does not approve an entire identity, palette, or product.", '.fp-tab-decisions'),
    );
  } else {
    steps.push(page("project-selection", ["projects"], "Choose a project in your own time", "No project was selected. Search and open one yourself to explore its brief, source files, canvas, reviews, and decisions. Next continues the workspace tour.", 'input[aria-label="Search projects"]', true));
  }
  steps.push(
    page("tasks", ["tasks"], "Make the next step clear", "Tasks capture the next action with its source context. New task opens an editor; dates, owners, and assignments remain yours to review.", '[data-onboarding="task-create"]', true),
    page("conversations", ["conversations"], "Keep discussion in context", "Find the conversation that belongs with the work. Review your words before sending; the guide never types or sends messages.", 'input[aria-label="Search conversations"]'),
    page("brand-kit", ["brand-kit"], "Reuse approved components", "Explore the kit and check its version and approval scope before reuse. Your original references and exploratory directions remain distinct from approved components.", '[aria-label="Brand kit sections"] button'),
    page("settings", ["settings"], "Find team and settings", "Settings sections lead to members, review rules, integrations, and preferences. Available controls depend on your role.", '[aria-label="Settings sections"] button'),
    page("settings-input", ["settings"], "Settings stay in your hands", "Choose a section yourself when you are ready. Invitations, roles, and workspace changes need deliberate review. No setting changed and no invitation was sent.", '[aria-label="Settings sections"] button', true),
    page("finish", progress.originRoute, "Back where you started", "Your source material and workspace records are unchanged. Back revisits the tour, Restart begins again, and Close returns to your work.", search),
  );
  return steps;
}

export function parseWalkthroughProgress(value: unknown, projectIds: readonly string[]): WalkthroughProgress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const saved = value as Record<string, unknown>;
  const originRoute = safeWalkthroughRoute(saved.originRoute, projectIds);
  if (!originRoute || typeof saved.stepId !== "string") return null;
  const progress = createWalkthroughProgress(originRoute, typeof saved.projectId === "string" ? saved.projectId : null, projectIds);
  if (!walkthroughSteps(progress).some((step) => step.id === saved.stepId)) return { ...progress, stepId: "start" };
  return { ...progress, stepId: saved.stepId, completed: saved.stepId === "finish" && saved.completed === true };
}

export function walkthroughStepIndex(progress: WalkthroughProgress, steps = walkthroughSteps(progress)) {
  return Math.max(0, steps.findIndex((step) => step.id === progress.stepId));
}

export function moveWalkthrough(progress: WalkthroughProgress, direction: -1 | 1 | "restart"): WalkthroughProgress {
  const steps = walkthroughSteps(progress);
  const index = direction === "restart" ? 0 : Math.max(0, Math.min(steps.length - 1, walkthroughStepIndex(progress, steps) + direction));
  return { ...progress, stepId: steps[index].id, completed: index === steps.length - 1 };
}

// Catch-all App Router pages can remount their client tree. Keep only an exact,
// short-lived in-memory navigation handoff; never persist running state to storage.
// A reload creates a fresh module and cannot restart an old tour automatically.
export type WalkthroughHandoff = {
  token: number;
  progress: WalkthroughProgress;
  route: readonly string[];
  playing: boolean;
  expiresAt: number;
};
const walkthroughHandoffs = new Map<string, WalkthroughHandoff>();
let handoffToken = 0;
export function prepareWalkthroughHandoff(scope: string, progress: WalkthroughProgress, route: readonly string[], playing: boolean, now = Date.now()) {
  for (const [key, value] of walkthroughHandoffs) if (value.expiresAt <= now) walkthroughHandoffs.delete(key);
  const handoff: WalkthroughHandoff = {
    token: ++handoffToken,
    progress: { ...progress, originRoute: [...progress.originRoute] },
    route: [...route],
    playing,
    expiresAt: now + WALKTHROUGH_NAVIGATION_TIMEOUT_MS,
  };
  walkthroughHandoffs.set(scope, handoff);
  return handoff.token;
}
export function readWalkthroughHandoff(scope: string, route: readonly string[], projectIds: readonly string[], now = Date.now()): WalkthroughHandoff | null {
  const handoff = walkthroughHandoffs.get(scope);
  if (!handoff) return null;
  const progress = parseWalkthroughProgress(handoff.progress, projectIds);
  if (handoff.expiresAt <= now || !sameWalkthroughRoute(handoff.route, route) || !safeWalkthroughRoute(route, projectIds) || !progress || progress.stepId !== handoff.progress.stepId) {
    walkthroughHandoffs.delete(scope);
    return null;
  }
  return { ...handoff, progress };
}
export function clearWalkthroughHandoff(scope: string, token?: number) {
  if (token === undefined || walkthroughHandoffs.get(scope)?.token === token) walkthroughHandoffs.delete(scope);
}
