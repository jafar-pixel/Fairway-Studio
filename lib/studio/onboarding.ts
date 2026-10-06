import { parseWalkthroughProgress, type WalkthroughProgress } from "./guide-playback";

export const ONBOARDING_SCHEMA_VERSION = 1 as const;

export const GOALS = {
  brand_identity: {
    label: "Brand identity",
    description: "Shape a clear identity and keep approvals scoped to the right work.",
    category: "brand_identity",
  },
  product: {
    label: "Product",
    description: "Build a product brief, gather references, and explore concepts.",
    category: "product",
  },
  apparel: {
    label: "Apparel",
    description: "Develop an apparel brief and directions without assumptions about the audience.",
    category: "apparel",
  },
  campaign: {
    label: "Campaign",
    description: "Bring audience, channel, deliverables, and source assets together.",
    category: "campaign",
  },
  guided_tour: {
    label: "Guided tour",
    description: "Explore the studio without creating or changing anything.",
    category: "general",
  },
} as const;

export type OnboardingGoal = keyof typeof GOALS;
export type GuideStage = "welcome" | "selection" | "handoff";
export type GuideStatus = "notStarted" | "inProgress" | "skipped" | "completed";
export type GuideContext = {
  id: string;
  title: string;
  outcome: string;
  prepare: string;
  select: string;
  handoff: string;
  actionLabel: string;
  actionKey: string;
};

const guide = (
  id: string,
  title: string,
  outcome: string,
  prepare: string,
  select: string,
  handoff: string,
  actionLabel: string,
  actionKey: string,
): GuideContext => ({ id, title, outcome, prepare, select, handoff, actionLabel, actionKey });

export const PAGE_GUIDES: Record<string, GuideContext> = {
  home: guide("home", "Home", "See what needs attention and pick up recent work.", "Have a rough idea or project outcome in mind. You can add references later.", "Choose a goal and, if useful, one of its existing projects. Nothing is selected for you.", "Open the real idea composer or the project you chose. Saving remains your decision.", "Capture an idea", "home"),
  ideas: guide("ideas", "Ideas", "Capture early thinking before it is ready to become a project.", "A title and a rough brief are enough. References are optional.", "Choose a goal or an existing idea to revisit.", "Open the existing idea editor or a new idea form. The form will not save until you do.", "Open idea workspace", "ideas"),
  projects: guide("projects", "Projects", "Give a product, collection, identity, or campaign a shared home.", "Know the outcome and who should lead. Advanced setup can wait.", "Choose a matching existing project or deliberately start a new one.", "Open the selected project or its real creation form with your chosen category.", "Continue to project", "projects"),
  library: guide("library", "Library", "Keep reusable references and files connected to their source.", "A link or file is useful, but you can also inspect what is already here.", "Select an existing asset, pin a link, or choose an upload form.", "Open the actual asset or the existing pin/upload flow. No file is uploaded by this guide.", "Open Library action", "library"),
  conversations: guide("conversations", "Conversations", "Keep decisions and discussion connected to the work they concern.", "Bring the context you want to discuss. Review any message before sending it.", "Choose an existing thread or the explicit new-conversation option.", "Open the chosen thread or a real conversation form. The guide never sends a message.", "Open conversation", "conversations"),
  tasks: guide("tasks", "Tasks", "Turn the next clear action into a task your team can find.", "A useful title is enough. Dates and assignments are optional where the form allows.", "Choose an existing task or deliberately create a new one.", "Open the real task editor or task form. Nothing is assigned or completed automatically.", "Open task", "tasks"),
  brandKit: guide("brand-kit", "Brand Kit", "Reuse approved components while keeping proposed directions exploratory.", "Review the kit version and the scope of any approval.", "Choose an available kit or an identity project if no kit is ready.", "Preview the existing kit or open the identity project. A name approval does not approve a logo or palette.", "Open brand guidance", "brand-kit"),
  settings: guide("settings", "Team & Settings", "Find workspace controls without changing permissions or preferences for you.", "Know whether you are looking for personal preferences or owner controls.", "Choose the settings area you need. Access remains governed by your role.", "Open the existing settings section; this guide never changes a setting or sends an invitation.", "Open settings section", "settings"),
  projectOverview: guide("project-overview", "Project overview", "Review the brief, lead, and deliverables for this project.", "The project in this URL stays selected; the guide will not switch workspaces.", "Choose the brief editor or continue to this project's canvas.", "Open the existing brief editor or the selected project canvas.", "Edit this brief", "project-overview"),
  canvas: guide("canvas", "Project Canvas", "Compare saved concepts and keep notes, references, and versions in context.", "Start from this project's existing concepts and references.", "Choose an existing concept, a note, a reference, or compare only when enough versions exist.", "Open the actual canvas control. A swatch alone does not recolor a saved image or approve it.", "Add a canvas note", "canvas"),
  reviews: guide("reviews", "Founder Reviews", "Review the exact version and scope pinned to an available round.", "Check the frozen version and approval scope before responding.", "Choose an assigned, open round. Drafting is separate from submitting.", "Focus the real response form. Only your successful Submit records a response.", "Open review response", "reviews"),
  decisions: guide("decisions", "Decisions", "See immutable outcomes with the evidence and history that support them.", "An outcome is scoped to its project and review evidence.", "Choose an existing decision or inspect a qualifying review.", "Open the existing evidence. This guide never approves, rejects, or defers a decision.", "View decision evidence", "decisions"),
  files: guide("files", "Project files", "Link canonical Library assets to this project without duplicating the original file.", "Check the source and provenance of an asset before linking it.", "Choose an existing asset or open Add from Library.", "Open the existing Library linking flow. The binary and its ownership stay in the Library.", "Add from Library", "files"),
  studioAI: guide("studio-ai", "Studio AI", "Use text assistance for suggestions; image generation is a separate, explicit action.", "Choose only the workspace context and source material you intend to share.", "Review the task and selected context before entering a prompt.", "Focus the real instruction field. Advancing this guide never calls AI or generates an image.", "Review Studio AI prompt", "studio-ai"),
  generation: guide("generation", "Image Studio", "Prepare an explicit image request and review returned drafts before retaining any.", "Confirm source access, provider readiness, quantity, and any displayed usage details.", "Choose the intended task and an accessible source or kit.", "Return to the real image form. The guide never starts a paid request or retains a result.", "Review image request", "generation"),
};

export function resolveGuidePageId(view: string, route: readonly string[]) {
  if (!view) return "home";
  const projectRoute = route[0] === "projects" ? route.slice(1) : route;
  if (view === "projects" && projectRoute[0]) {
    const tab = projectRoute[1] || "overview";
    if (tab === "canvas" || tab === "reviews" || tab === "decisions" || tab === "files") return tab;
    return "projectOverview";
  }
  if (view === "brand-kit") return "brandKit";
  return PAGE_GUIDES[view] ? view : "home";
}

export function resolveGuideContext(view: string, route: readonly string[], overlays?: { ai?: boolean; generation?: boolean }) {
  if (overlays?.generation) return PAGE_GUIDES.generation;
  if (overlays?.ai) return PAGE_GUIDES.studioAI;
  return PAGE_GUIDES[resolveGuidePageId(view, route)];
}

export type TourProgress = { stepId: GuideStage; status: GuideStatus };
export type OnboardingState = {
  schemaVersion: typeof ONBOARDING_SCHEMA_VERSION;
  goal: OnboardingGoal | null;
  selectedProjectId: string | null;
  selections: Record<string, string>;
  visitedPages: string[];
  tours: Record<string, TourProgress>;
  verifiedMilestones: Record<string, string>;
  welcomeDismissed: boolean;
  updatedAt: string;
  walkthrough?: WalkthroughProgress | null;
};

const STAGES: GuideStage[] = ["welcome", "selection", "handoff"];
const STATUSES: GuideStatus[] = ["notStarted", "inProgress", "skipped", "completed"];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const hasOwn = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);

export function createInitialOnboardingState(now = new Date().toISOString()): OnboardingState {
  return {
    schemaVersion: ONBOARDING_SCHEMA_VERSION,
    goal: null,
    selectedProjectId: null,
    selections: {},
    visitedPages: [],
    tours: {},
    verifiedMilestones: {},
    welcomeDismissed: false,
    updatedAt: now,
  };
}

export function onboardingStorageKey(userId: string, workspaceId: string, demo = false) {
  if (demo) return "fairway:onboarding:demo:v1";
  if (!userId || !workspaceId) return "";
  return `fairway:onboarding:v1:${encodeURIComponent(userId)}:${encodeURIComponent(workspaceId)}`;
}

export function parseOnboardingState(raw: unknown, accessibleProjectIds: readonly string[] = []) {
  const fresh = createInitialOnboardingState();
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return fresh;
    }
  }
  if (!isRecord(value) || value.schemaVersion !== ONBOARDING_SCHEMA_VERSION) return fresh;
  const goal = typeof value.goal === "string" && hasOwn(GOALS, value.goal) ? value.goal as OnboardingGoal : null;
  const projectId = typeof value.selectedProjectId === "string" && accessibleProjectIds.includes(value.selectedProjectId)
    ? value.selectedProjectId
    : null;
  const selections: Record<string, string> = {};
  if (isRecord(value.selections)) {
    for (const [key, selection] of Object.entries(value.selections)) {
      if (hasOwn(PAGE_GUIDES, key) && typeof selection === "string" && selection.length <= 256) selections[key] = selection;
    }
  }
  const visitedPages = Array.isArray(value.visitedPages)
    ? [...new Set(value.visitedPages.filter((id): id is string => typeof id === "string" && hasOwn(PAGE_GUIDES, id)))]
    : [];
  const tours: Record<string, TourProgress> = {};
  if (isRecord(value.tours)) {
    for (const [key, progress] of Object.entries(value.tours)) {
      if (!hasOwn(PAGE_GUIDES, key) || !isRecord(progress)) continue;
      const stepId = STAGES.includes(progress.stepId as GuideStage) ? progress.stepId as GuideStage : "welcome";
      const status = STATUSES.includes(progress.status as GuideStatus) ? progress.status as GuideStatus : "notStarted";
      tours[key] = { stepId, status };
    }
  }
  const verifiedMilestones: Record<string, string> = {};
  if (isRecord(value.verifiedMilestones)) {
    for (const [key, timestamp] of Object.entries(value.verifiedMilestones)) {
      if (/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key) && typeof timestamp === "string" && Number.isFinite(Date.parse(timestamp))) {
        verifiedMilestones[key] = timestamp;
      }
    }
  }
  return {
    schemaVersion: ONBOARDING_SCHEMA_VERSION,
    goal,
    selectedProjectId: projectId,
    selections,
    visitedPages,
    tours,
    verifiedMilestones,
    walkthrough: parseWalkthroughProgress(value.walkthrough, accessibleProjectIds),
    welcomeDismissed: value.welcomeDismissed === true,
    updatedAt: typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt)) ? value.updatedAt : fresh.updatedAt,
  } satisfies OnboardingState;
}

export type OnboardingStorage = Pick<Storage, "getItem" | "setItem">;
export function loadOnboardingState(storage: OnboardingStorage, key: string, projectIds: readonly string[] = []) {
  try {
    return { state: parseOnboardingState(storage.getItem(key), projectIds), persistenceAvailable: true };
  } catch {
    return { state: createInitialOnboardingState(), persistenceAvailable: false };
  }
}
export function saveOnboardingState(storage: OnboardingStorage, key: string, state: OnboardingState) {
  try {
    storage.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function updateTour(state: OnboardingState, pageId: string, stepId: GuideStage, status: GuideStatus, now = new Date().toISOString()): OnboardingState {
  if (!hasOwn(PAGE_GUIDES, pageId)) return state;
  return {
    ...state,
    visitedPages: state.visitedPages.includes(pageId) ? state.visitedPages : [...state.visitedPages, pageId],
    tours: { ...state.tours, [pageId]: { stepId, status } },
    updatedAt: now,
  };
}

export function setOnboardingGoal(state: OnboardingState, goal: OnboardingGoal, now = new Date().toISOString()): OnboardingState {
  return { ...state, goal, selectedProjectId: null, welcomeDismissed: false, updatedAt: now };
}

export function setOnboardingProject(state: OnboardingState, projectId: string | null, accessibleProjectIds: readonly string[], now = new Date().toISOString()): OnboardingState {
  const selectedProjectId = projectId && accessibleProjectIds.includes(projectId) ? projectId : null;
  return { ...state, selectedProjectId, selections: { ...state.selections, home: selectedProjectId || "new" }, updatedAt: now };
}

export function dismissOnboardingWelcome(state: OnboardingState, skipped = false, now = new Date().toISOString()): OnboardingState {
  return { ...state, welcomeDismissed: true, tours: { ...state.tours, home: { stepId: skipped ? "welcome" : "handoff", status: skipped ? "skipped" : "inProgress" } }, updatedAt: now };
}

export function resumeOnboardingWelcome(state: OnboardingState, now = new Date().toISOString()): OnboardingState {
  return { ...state, welcomeDismissed: false, updatedAt: now };
}

export function setTourSelection(state: OnboardingState, pageId: string, selection: string, now = new Date().toISOString()): OnboardingState {
  if (!PAGE_GUIDES[pageId] || selection.length > 256) return state;
  return { ...state, selections: { ...state.selections, [pageId]: selection }, updatedAt: now };
}

export function getTourStep(state: OnboardingState, pageId: string): TourProgress {
  return state.tours[pageId] || { stepId: "welcome", status: "notStarted" };
}

export function visibleProjectsForGoal(projects: readonly any[], goal: OnboardingGoal | null, currentProjectId?: string) {
  const current = currentProjectId ? projects.filter((project) => project.id === currentProjectId) : [];
  if (current.length) return current;
  const matching = goal ? projects.filter((project) => categoryMatchesGoal(project.category, goal)) : [];
  return matching.length ? matching : projects;
}

export function goalCategory(goal: OnboardingGoal | null) {
  return goal ? GOALS[goal].category : "general";
}

export function safeGuideAction(actionKey: string) {
  return Object.values(PAGE_GUIDES).some((page) => page.actionKey === actionKey);
}

export function guideStorageScope(userId: string, workspaceId: string, demo = false) {
  return onboardingStorageKey(userId, workspaceId, demo);
}

export function isVerifiedWorkOperation(operation: string) {
  return hasVerifiedMutation(operation);
}

export function selectionOptionsForGuide(pageId: string, route: readonly string[], data: any) {
  if (pageId === "home" || pageId === "projects" || pageId === "projectOverview") return data.projects || [];
  if (pageId === "ideas") return data.ideas || [];
  if (pageId === "library" || pageId === "files") return [...(data.references || []), ...(data.files || [])];
  if (pageId === "conversations") return data.rooms || [];
  if (pageId === "tasks") return data.tasks || [];
  if (pageId === "brandKit") return data.kits || [];
  if (pageId === "canvas") return (data.versions || []).filter((item: any) => item.project_id === route[1]);
  if (pageId === "reviews") return (data.rounds || []).filter((item: any) => item.project_id === route[1]);
  if (pageId === "decisions") return (data.decisions || []).filter((item: any) => item.project_id === route[1]);
  if (pageId === "studioAI" || pageId === "generation") return [
    { id: "brief", title: "Draft or refine a brief" },
    { id: "image", title: "Create a draft image" },
    { id: "feedback", title: "Summarize feedback" },
    { id: "source-edit", title: "Edit a selected source image" },
  ];
  if (pageId === "settings") return [
    { id: "members", title: "Members and roles" },
    { id: "reviews", title: "Review rules" },
    { id: "integrations", title: "Integrations" },
    { id: "notifications", title: "Notifications" },
    { id: "devices", title: "Devices" },
  ];
  return [];
}

export function titleForOption(option: any) {
  return String(option?.title || option?.name || option?.label || option?.id || "Existing item");
}

export function recordVerifiedMilestone(state: OnboardingState, operation: string, now = new Date().toISOString()): OnboardingState {
  if (!hasVerifiedMutation(operation)) return state;
  return { ...state, verifiedMilestones: { ...state.verifiedMilestones, [operation]: now }, updatedAt: now };
}

export function markGuidePageVisited(state: OnboardingState, pageId: string, now = new Date().toISOString()): OnboardingState {
  if (!hasOwn(PAGE_GUIDES, pageId) || state.visitedPages.includes(pageId)) return state;
  return { ...state, visitedPages: [...state.visitedPages, pageId], updatedAt: now };
}

export function hasVerifiedMutation(operation: string) {
  return new Set([
    "createIdea", "updateIdea", "promoteIdea", "createProject", "updateProject",
    "createTask", "updateTask", "createThread", "sendMessage", "linkIdeaAsset",
    "linkIdeaProject", "importPin", "createExternalFile", "submitReview", "publishKit",
    "updateWorkspace", "updateReviewPolicy", "updateNotificationPreferences",
    "updateMember", "removeMember", "saveCanvas", "createDecision", "approveDecision",
    "rejectDecision", "deferDecision", "supersedeDecision",
  ]).has(operation);
}

export function categoryMatchesGoal(category: unknown, goal: OnboardingGoal | null) {
  if (!goal || goal === "guided_tour") return false;
  return String(category || "general").toLowerCase().replaceAll("-", "_") === GOALS[goal].category;
}

export function guideActionIsSafe(actionKey: string) {
  return Object.values(PAGE_GUIDES).some((page) => page.actionKey === actionKey);
}
