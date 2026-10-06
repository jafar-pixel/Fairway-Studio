"use client";
import {
  useEffect,
  useState,
  useRef,
  useMemo,
  Suspense,
  type FormEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import {
  Flag,
  House,
  Lightbulb,
  FolderKanban,
  BriefcaseBusiness,
  Images,
  MessageCircle,
  CheckSquare,
  Box,
  Users,
  Search,
  Plus,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  LogOut,
  Menu,
  X,
  Sparkles,
  Check,
  AlertCircle,
  ExternalLink,
  Send,
  Video,
  RefreshCw,
  Settings,
  Download,
  Link as LinkIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StudioAuth } from "@/components/studio-auth";
import { OnboardingGuide } from "@/components/studio/onboarding-guide";
import {
  createInitialOnboardingState,
  guideStorageScope,
  loadOnboardingState,
  recordVerifiedMilestone,
  resolveGuidePageId,
  saveOnboardingState,
  type OnboardingGoal,
  type OnboardingState,
} from "@/lib/studio/onboarding";
import { NotificationInbox } from "@/components/studio/notifications";
import { GenerationPanel } from "@/components/studio/generation-panel";
import { BrandKitView } from "@/components/studio/brand-kit";
import { ProjectsView } from "@/components/studio/projects";
import { ConnectedWorkflowBoundary } from "@/components/studio/workflows/connected-boundary";
import { BusinessSubnav, WorkflowHelp } from "@/components/studio/workflows/context-help";
import { parseWorkflowRoute, workflowRouteLabel } from "@/lib/studio/workflows/routes";
import { BusinessWorkspaceBoundary } from "@/components/studio/business/workspace-boundary";
import { canonicalRouteTarget, keepCachedRead, cleanBusinessNavigation, creativeWorkspaceData, isBusinessProject, purposeAwareDestination, type NavigationState } from "@/lib/studio/business/shell";
import { mergeCanonicalTarget } from "@/lib/studio/business/canonical-hydration";
import {
  IdeasView,
  IdeaEditor,
  LibraryView,
  TasksView,
} from "@/components/studio/collections";
import { CREATOR_NAVIGATION_EVENT } from "@/components/studio/creator-navigation";
import { PwaControls } from "@/components/studio/pwa-controls";
import {
  createIdeaDraftSyncAdapter,
  prepareScopeSignOut,
  syncDrafts,
} from "@/lib/studio/offline";
import { createDemoData, mutateDemo } from "@/lib/studio/demo";
import { loadDemoSession, saveDemoSession } from "@/lib/studio/demo-session";
import { accessReadFailure, assertWorkspaceResponse, authIdentityTransition, readIdentityWorkspaces, verifiedWorkspace, workspaceCacheKey, workspaceDiscoveryGate } from "@/lib/studio/session-scope";
import { hydrateImportedContent } from "@/lib/studio/imported-content";

import { ProfileAvatar, ProfilePhotoProvider } from "./profile-avatar";
import { ProfilePhotoEditor } from "./profile-photo-editor";
import { activityLabel } from "@/lib/studio/profile-photo";

const EXPECTED = "xljhxmyigtxhjtxxzuwk";
const nav = [
  ["", "Home", House],
  ["ideas", "Ideas", Lightbulb],
  ["projects", "Projects", FolderKanban],
  ["library", "Library", Images],
  ["conversations", "Conversations", MessageCircle],
  ["tasks", "Tasks", CheckSquare],
  ["brand-kit", "Brand Kit", Box],
  ["business", "Business", BriefcaseBusiness],
  ["content", "Content", Send],
  ["settings", "Team & Settings", Users],
] as const;
const empty = {
  ideas: [],
  tasks: [],
  references: [],
  files: [],
  rooms: [],
  members: [],
  projects: [],
  versions: [],
  nodes: [],
  rounds: [],
  reviews: [],
  decisions: [],
  kits: [],
  activity: [],
  messages: [],
  threads: [],
  missingSchema: [],
};
const configUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const configured =
  !!configUrl &&
  !!(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
const validTarget = (() => {
  try {
    return (
      new URL(configUrl).hostname === `${EXPECTED}.supabase.co` &&
      new URL(configUrl).protocol === "https:"
    );
  } catch {
    return false;
  }
})();
async function fetchJson(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  const v = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(v.error || "This workspace could not be loaded."), { status: r.status, code: v.code });
  return v;
}
export const Avatar = ProfileAvatar;
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`fs-card ${className}`}>{children}</section>;
}
export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="fs-empty">
      <Box size={28} />
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}
export function Heading({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="fs-heading">
      <div>
        <h1>{title}</h1>
        <p>{detail}</p>
      </div>
      {action}
    </div>
  );
}
export function Dialog({
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
    ref.current?.showModal();
    const previous = document.activeElement as HTMLElement;
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fs-dialog"
    >
      <header>
        <h2>{title}</h2>
        <button className="fs-icon" onClick={onClose} aria-label="Close dialog">
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function FairwayStudio({ demo = false }: { demo?: boolean }) {
  return <Suspense fallback={<div className="fs-loading">Opening studio…</div>}><StudioShell demo={demo} /></Suspense>;
}
function StudioShell({ demo = false }: { demo?: boolean }) {
  const router = useRouter(),
    path = usePathname(),
    searchParams = useSearchParams(),
    { mutate: globalMutate } = useSWRConfig();
  const [demoData, setDemoData] = useState(createDemoData),
    [menu, setMenu] = useState(false),
    [quick, setQuick] = useState(false),
    [search, setSearch] = useState(""),
    [mobileSearch, setMobileSearch] = useState(false),
    [notice, setNotice] = useState(""),
    [ai, setAi] = useState(false),
    [create, setCreate] = useState(""),
    [createInitial, setCreateInitial] = useState<Record<string, unknown>>({}),
    [aiInitialQuestion, setAiInitialQuestion] = useState(""),
    [actionError, setActionError] = useState(""),
    [generation, setGeneration] = useState<any>(null);
  const [onboardingState, setOnboardingState] = useState<OnboardingState>(createInitialOnboardingState),
    [onboardingReady, setOnboardingReady] = useState(false),
    [onboardingPersistenceAvailable, setOnboardingPersistenceAvailable] = useState(true);
  const [businessNavigation, setBusinessNavigation] = useState<NavigationState>(cleanBusinessNavigation);
  const onboardingLoadedScope = useRef("");
  const onboardingActiveScope = useRef("");
  const authVerification = useRef({ serial: 0, userId: null as string | null });
  const [deniedAuth, setDeniedAuth] = useState<{ serial: number } | null>(null);
  const auth = useSWR(
    !demo && configured && validTarget ? "studio-user" : null,
    async () => {
      const { data, error } = await createClient().auth.getSession();
      if (error && error.name !== "AuthSessionMissingError") throw error;
      const user = data.session?.user ?? null;
      authVerification.current = { serial: authVerification.current.serial + 1, userId: user?.id || null };
      return user;
    },
  );
  const authIdentity = useRef<string | null>(auth.data?.id || null);
  authIdentity.current = auth.data?.id || null;
  const workspaces = useSWR(
    auth.data ? `fs-workspaces:${auth.data.id}` : null,
    (key: string) => readIdentityWorkspaces(createClient(), key.slice("fs-workspaces:".length)),
  );
  const segments = path.split("/").filter(Boolean),
    workspaceId = demo
      ? "demo"
      : segments[0] === "w"
        ? segments[1]
        : workspaces.data?.[0]?.id || "";
  const route = demo
    ? segments.slice(1)
    : segments[0] === "w"
      ? segments.slice(2)
      : [];
  const view = route[0] || "";
  const base = demo ? "/demo" : `/w/${workspaceId}`;
  const result = useSWR(
    !demo && auth.data && workspaceId
      ? [`/api/studio/workspace?workspaceId=${workspaceId}`, auth.data.id]
      : null,
    async ([url, actorId]: [string, string]) => assertWorkspaceResponse(await fetchJson(url), url, actorId),
    { revalidateOnFocus: true },
  );
  const workflow = useSWR(
    !demo && auth.data && workspaceId
      ? [`/api/studio/workflow?workspaceId=${workspaceId}`, auth.data.id]
      : null,
    async ([url, actorId]: [string, string]) => assertWorkspaceResponse(await fetchJson(url), url, actorId),
    { revalidateOnFocus: true },
  );
  const linkedTarget = canonicalRouteTarget(route, searchParams.toString());
  const linkedRecord = useSWR(
    !demo && auth.data && workspaceId && linkedTarget
      ? [`/api/studio/business/target?${new URLSearchParams({workspaceId,kind:linkedTarget.kind,id:linkedTarget.id})}`, auth.data.id]
      : null,
    async ([url,actorId]: [string,string]) => {
      const response = await fetch(url,{cache:"no-store"}); const body = await response.json();
      if (!response.ok) throw Object.assign(new Error(body.error || "This linked record is unavailable."), {status:response.status});
      mergeCanonicalTarget({workspace:{id:workspaceId},userId:actorId},body.records);
      return body;
    }, {revalidateOnFocus:true},
  );
  const workspaceData: any = hydrateImportedContent(
    demo
      ? demoData
      : {
          ...empty,
          workspace: { id: workspaceId, name: "Your workspace" },
          ...result.data,
          ...(workflow.data || {}),
          workflow: workflow.data || {},
          workflowError: workflow.error?.message || "",
        },
  );
  const data: any = !demo && result.data && keepCachedRead(linkedRecord.data,linkedRecord.error)
    ? hydrateImportedContent(mergeCanonicalTarget(workspaceData, linkedRecord.data.records))
    : workspaceData;
  const creativeData = creativeWorkspaceData(data);
  const canonicalBusinessProject = view === "projects" && isBusinessProject(data.projects?.find((project: any) => project.id === route[1]));
  const businessRoute = view === "business" || canonicalBusinessProject;
  const currentProjectId = view === "projects" ? route[1] : undefined;
  const activeView = businessRoute ? "business" : view;
  const workflowRoute = parseWorkflowRoute(route, canonicalBusinessProject);
  const contentRoute = view === "content";
  const operationalRoute = businessRoute || contentRoute;
  const businessPlanId = workflowRoute.kind === "plans" ? workflowRoute.planId : undefined;
  const userId = demo ? "demo-jafar" : auth.data?.id || "";
  const explicitWorkspace = !demo && segments[0] === "w" && Boolean(segments[1]);
  const discoveryGate = workspaceDiscoveryGate(explicitWorkspace, workspaces.data);
  const accessScope = `${userId}:${workspaceId || ""}`;
  const [deniedScope, setDeniedScope] = useState<string | null>(null);
  const authenticationFailure = !demo && accessReadFailure(auth.error);
  const permissionFailure = !demo && (accessReadFailure(result.error) || accessReadFailure(workflow.error));
  const workspaceAccessVerified = !demo && verifiedWorkspace(result.data, workspaceId, userId);
  const onboardingScope = guideStorageScope(userId, workspaceId || "", demo);
  const onboardingProjectIds = useMemo(
    () => (creativeData.projects || []).map((project: any) => String(project.id)),
    [data.projects],
  );
  const onboardingSourceReady = demo || !!(
    auth.data && workspaceId && !workspaces.isLoading && !result.isLoading &&
    !result.error && result.data
  );
  const onboardingScopeReady = onboardingReady && onboardingActiveScope.current === onboardingScope;
  const onboardingPageId = operationalRoute ? (contentRoute ? "content" : workflowRoute.kind === "private" ? `business-${workflowRoute.tab}` : "business") : resolveGuidePageId(view, route);

  useEffect(() => {
    if (!onboardingScope) {
      if (!onboardingLoadedScope.current && !onboardingActiveScope.current) return;
      onboardingLoadedScope.current = "";
      onboardingActiveScope.current = "";
      setOnboardingReady(false);
      setOnboardingState(createInitialOnboardingState());
      return;
    }
    if (!onboardingSourceReady) {
      setOnboardingReady(false);
      return;
    }
    if (onboardingLoadedScope.current === onboardingScope) return;
    setOnboardingReady(false);
    let loaded: ReturnType<typeof loadOnboardingState>;
    try {
      loaded = loadOnboardingState(window.localStorage, onboardingScope, onboardingProjectIds);
    } catch {
      loaded = { state: createInitialOnboardingState(), persistenceAvailable: false };
    }
    onboardingLoadedScope.current = onboardingScope;
    onboardingActiveScope.current = onboardingScope;
    setOnboardingState(loaded.state);
    setOnboardingPersistenceAvailable(loaded.persistenceAvailable);
    setOnboardingReady(true);
  }, [onboardingScope, onboardingSourceReady, onboardingProjectIds]);

  useEffect(() => {
    if (!onboardingScopeReady) return;
    let saved = false;
    try {
      saved = saveOnboardingState(window.localStorage, onboardingScope, onboardingState);
    } catch {
      saved = false;
    }
    setOnboardingPersistenceAvailable(saved);
  }, [onboardingState, onboardingScope, onboardingScopeReady]);

  useEffect(() => {
    setCreate("");
    setCreateInitial({});
    setAiInitialQuestion("");
    setAi(false);
    setGeneration(null);
    setActionError("");
    setSearch("");
  }, [userId, workspaceId]);
  const pending = useRef(new Map<string, string>());
  const demoLoaded = useRef(false);
  const demoSnapshot = useRef(demoData);
  useEffect(() => {
    if (!demo) { demoLoaded.current = false; return; }
    const loaded = loadDemoSession(() => window.sessionStorage, createDemoData());
    demoSnapshot.current = loaded.data;
    setDemoData(loaded.data);
    demoLoaded.current = true;
    // Loading must never write the pre-hydration seed over a saved tab session.
  }, [demo]);
  function commitDemoData(next: any) {
    demoSnapshot.current = next;
    const persisted = saveDemoSession(() => window.sessionStorage, next);
    setDemoData(next);
    return persisted;
  }
  useEffect(() => {
    if (demo) return;
    if (authenticationFailure && !deniedAuth) {
      setDeniedAuth({ serial: authVerification.current.serial });
      setCreate(""); setCreateInitial({}); setGeneration(null); setAi(false); setSearch("");
      pending.current.clear();
      // A rejected session invalidates every private scope for this browser session.
      void globalMutate((key: unknown) => (typeof key === "string" && key.startsWith("fs-workspaces:")) || Array.isArray(key), undefined, { revalidate: false });
    } else if (deniedAuth && !auth.error && auth.data?.id && authVerification.current.serial > deniedAuth.serial && authVerification.current.userId === auth.data.id) {
      // Only a fresh getUser verification clears denial. Cache mutation or a transport retry cannot.
      setDeniedAuth(null);
    }
  }, [demo, authenticationFailure, deniedAuth, auth.data?.id, auth.error, auth.isValidating, globalMutate]);
  useEffect(() => {
    if (demo) return;
    if (permissionFailure && deniedScope !== accessScope) {
      setDeniedScope(accessScope);
      setCreate(""); setCreateInitial({}); setGeneration(null); setAi(false); setSearch("");
      pending.current.clear();
      // Denied reads discard cached private records and mounted drafts, including upload queues.
      void globalMutate((key: unknown) => workspaceCacheKey(key, workspaceId, userId), undefined, { revalidate: false });
    } else if (deniedScope === accessScope && workspaceAccessVerified && !result.error && !workflow.error) {
      setDeniedScope(null);
    }
  }, [demo, permissionFailure, deniedScope, accessScope, workspaceAccessVerified, result.error, workflow.error]);
  useEffect(() => {
    if (demo || !userId || !workspaceId) return;
    const sync = () => {
      if (navigator.onLine)
        void syncDrafts(
          { accountId: userId, workspaceId },
          createIdeaDraftSyncAdapter(async () => {
            await Promise.all([result.mutate(),linkedRecord.mutate()]);
          }),
        ).catch(() => {});
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("pageshow", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("pageshow", sync);
    };
  }, [demo, userId, workspaceId]);
  useEffect(() => {
    if (demo || !configured || !validTarget) return;
    const {
      data: { subscription },
    } = createClient().auth.onAuthStateChange((_event, session) => {
      const transition = authIdentityTransition(authIdentity.current, session?.user?.id);
      authIdentity.current = transition.nextId;
      void auth.mutate(session?.user || null, { revalidate: false });
      if (transition.clearPrivate) {
        pending.current.clear();
        void globalMutate(
          (key: any) =>
            (typeof key === "string" && key.startsWith("fs-workspaces:")) ||
            Array.isArray(key),
          undefined,
          { revalidate: false },
        );
      }
    });
    return () => subscription.unsubscribe();
  }, [demo, globalMutate]);
  useEffect(() => {
    if (!demo && workspaceId && segments[0] !== "w")
      router.replace(
        `/w/${workspaceId}${typeof window !== "undefined" ? window.location.search : ""}`,
      );
  }, [demo, workspaceId, path]);
  useEffect(() => {
    if (demo || !workspaceId || !auth.data) return;
    const client = createClient();
    const channel = client
      .channel(`fairway:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => { void Promise.allSettled([result.mutate(),linkedRecord.mutate()]); },
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [demo, workspaceId, auth.data?.id, linkedTarget?.kind, linkedTarget?.id]);
  useEffect(() => {
    const legacy = window.location.hash.slice(1);
    const map: Record<string, string> = {
      overview: "",
      moves: "tasks",
      conversation: "conversations",
      cameras: "conversations",
      guide: "",
      ideas: "ideas",
      library: "library",
    };
    if (legacy in map && workspaceId) {
      router.replace(`${base}/${map[legacy]}`);
      if (legacy === "guide") setAi(true);
    }
  }, [workspaceId]);
  useEffect(() => {
    setMenu(false);
    setQuick(false);
    setSearch("");
  }, [path]);
  useEffect(() => {
    const protect = (e: Event) => {
      if (
        create || businessNavigation.dirty || businessNavigation.pending || businessNavigation.uncertain ||
        document.querySelector('dialog[open], [aria-busy="true"]') ||
        Array.from(document.querySelectorAll("textarea")).some((t) =>
          t.value.trim(),
        )
      )
        e.preventDefault();
    };
    window.addEventListener("fairway-before-update", protect);
    return () => window.removeEventListener("fairway-before-update", protect);
  }, [create, businessNavigation.dirty, businessNavigation.pending, businessNavigation.uncertain]);
  useEffect(() => {
    const open = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (operationalRoute) { setNotice("Open a creative project to generate visual versions. Business and publication approvals are separate."); return; }
      setGeneration({
        ...detail,
        projectId: currentProjectId || detail.projectId,
      });
    };
    window.addEventListener("fairway-generation", open);
    return () => window.removeEventListener("fairway-generation", open);
  }, [currentProjectId, operationalRoute]);
  function navigate(to: string) {
    if (!window.dispatchEvent(new Event(CREATOR_NAVIGATION_EVENT, { cancelable: true }))) return false;
    const destination = purposeAwareDestination(to,base,data.projects || [],window.location.origin);
    router.push(demo ? destination.replace(/^\/w\/demo/, "/demo") : destination);
    return true;
  }
  async function mutation(operation: string, input: Record<string, unknown>) {
    setActionError("");
    try {
      if (operation === "refresh") {
        if (demo) return demoSnapshot.current;
        const [workspaceData, workflowData, targetData] = await Promise.all([result.mutate(), workflow.mutate(), linkedRecord.mutate()]);
        const refreshed = {...workspaceData,...workflowData};
        return targetData ? hydrateImportedContent(mergeCanonicalTarget(refreshed,targetData.records)) : refreshed;
      }
      if (demo) {
        if (!demoLoaded.current) {
          demoSnapshot.current = loadDemoSession(() => window.sessionStorage, createDemoData()).data;
          demoLoaded.current = true;
        }
        // Sequential create/source/link actions must use the newest snapshot even before React renders.
        const next = mutateDemo(demoSnapshot.current, operation, input);
        const persisted = commitDemoData(next.data);
        setNotice(persisted
          ? "Demo updated in this tab session only."
          : "Demo updated in this view. Browser session storage is unavailable; navigating or reloading may reset these changes.");
        return next.result;
      }
      const signature = JSON.stringify([operation, input]);
      const requestId = pending.current.get(signature) || crypto.randomUUID();
      pending.current.set(signature, requestId);
      const workflowOperations = [
        "linkIdeaAsset",
        "unlinkIdeaAsset",
        "linkIdeaProject",
        "unlinkIdeaProject",
        "rejectDecision",
        "deferDecision",
        "supersedeDecision",
        "updateNotificationPreferences",
      ];
      const r = await fetch(
        workflowOperations.includes(operation)
          ? "/api/studio/workflow"
          : "/api/studio/workspace",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, operation, requestId, input }),
        },
      );
      const body = await r.json();
      if (!r.ok) throw Error(body.error || "Changes were not saved.");
      pending.current.delete(signature);
      setOnboardingState((current) => recordVerifiedMilestone(current, operation));
      // A refresh failure must not turn an acknowledged write into a failed create.
      const refreshed = await Promise.allSettled([result.mutate(), workflow.mutate(), linkedRecord.mutate()]);
      setNotice(refreshed.some((refresh) => refresh.status === "rejected")
        ? "Saved to workspace. The latest view could not refresh; reload when connected."
        : "Saved to workspace.");
      return body.data;
    } catch (e) {
      setActionError((e as Error).message);
      throw e;
    }
  }
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  async function signOut() {
    if (!window.dispatchEvent(new Event(CREATOR_NAVIGATION_EVENT, { cancelable: true }))) return;
    if (demo) {
      router.push("/");
      return;
    }
    try {
      for (const w of workspaces.data || []) {
        if (
          !(await prepareScopeSignOut({ accountId: userId, workspaceId: w.id }))
        )
          return;
      }
    } catch {
      setActionError(
        "Device drafts could not be checked. Export them before signing out.",
      );
      return;
    }
    await createClient().auth.signOut();
    await globalMutate(() => true, undefined, { revalidate: false });
    router.replace("/");
  }
  function openCreate(kind: string, initial: Record<string, unknown> = {}) {
    if (operationalRoute && (businessNavigation.dirty || businessNavigation.pending || businessNavigation.uncertain)) {
      setNotice("Finish or discard your current inputs before opening another editor. Resolve any pending save first."); return;
    }
    setCreateInitial(initial);
    setCreate(kind);
  }

  function focusGuideControl(target: string) {
    window.requestAnimationFrame(() => {
      const control = document.querySelector<HTMLElement>(`[data-onboarding="${target}"]`);
      if (!control) {
        setNotice("That control is not available in the current view. Choose an available action on this page instead.");
        return;
      }
      control.scrollIntoView({ block: "center", behavior: "smooth" });
      control.focus({ preventScroll: true });
    });
  }

  function runOnboardingAction(payload: {
    pageId: string;
    goal: OnboardingGoal | null;
    projectId: string | null;
    choiceId: string | null;
    note: string;
  }) {
    const { pageId, goal, projectId, choiceId, note } = payload;
    const category = goal && goal !== "guided_tour" ? goal : "general";
    const selectedProject = projectId || currentProjectId;
    switch (pageId) {
      case "home":
        if (selectedProject) navigate(`${base}/projects/${selectedProject}`);
        else openCreate("Idea", { category, body: note });
        break;
      case "ideas":
        if (choiceId && choiceId !== "new") navigate(`${base}/ideas?item=${encodeURIComponent(choiceId)}`);
        else openCreate("Idea", { category, body: note });
        break;
      case "projects":
        if (projectId && choiceId !== "new") navigate(`${base}/projects/${projectId}`);
        else openCreate("Project", { category, body: note });
        break;
      case "library":
        navigate(choiceId && choiceId !== "new"
          ? `${base}/library?item=${encodeURIComponent(choiceId)}`
          : `${base}/library?action=pin`);
        break;
      case "conversations":
        if (choiceId && choiceId !== "new") navigate(`${base}/conversations/${encodeURIComponent(choiceId)}`);
        else openCreate("Conversation");
        break;
      case "tasks":
        if (choiceId && choiceId !== "new") navigate(`${base}/tasks?item=${encodeURIComponent(choiceId)}`);
        else openCreate("Task", { body: note });
        break;
      case "brandKit":
        navigate(`${base}/brand-kit`);
        break;
      case "settings":
        navigate(`${base}/settings/${encodeURIComponent(choiceId || "members")}`);
        break;
      case "projectOverview":
        focusGuideControl("project-brief");
        break;
      case "canvas":
        focusGuideControl("canvas-note");
        break;
      case "reviews":
        if (selectedProject && choiceId) navigate(`${base}/projects/${selectedProject}/reviews?round=${encodeURIComponent(choiceId)}`);
        focusGuideControl("review-response");
        break;
      case "decisions":
        focusGuideControl("decision-evidence");
        break;
      case "files":
        focusGuideControl("files-library-link");
        break;
      case "studioAI":
        setAiInitialQuestion(note);
        setAi(true);
        break;
      case "generation":
        setGeneration({ projectId: selectedProject || undefined, prompt: note || undefined });
        break;
      default:
        setNotice("Keep exploring this page; no action was performed by the guide.");
    }
  }

  if (!demo && (!configured || !validTarget))
    return (
      <main className="fs-setup">
        <Flag size={36} />
        <p className="fs-eyebrow">FAIRWAY STUDIO</p>
        <h1>
          Your next chapter,
          <br />
          built together.
        </h1>
        <p>
          The existing studio is ready to connect.{" "}
          {configured
            ? "The configured Supabase project does not match the approved Fairway project."
            : "Add the existing Supabase URL and publishable key in your deployment environment to open the live workspace."}
        </p>
        <a className="fs-button" href="/demo">
          Explore the interactive demo <ArrowRight size={17} />
        </a>
        <small>
          All 11 design surfaces. Demo changes stay in this browser session; no
          real records or founder approvals are created.
        </small>
      </main>
    );
  if (!demo && auth.isLoading && !auth.data)
    return <div className="fs-loading">Opening your private studio…</div>;
  if (!demo && ((deniedAuth && auth.data) || (auth.error && !keepCachedRead(auth.data,auth.error))))
    return (
      <div className="fs-loading">
        <p>We couldn’t verify your session.</p>
        <button className="fs-button" onClick={() => void auth.mutate()}>
          Retry
        </button>
      </div>
    );
  if (!demo && !auth.data)
    return (
      <StudioAuth
        invitePending={
          typeof window !== "undefined" &&
          new URLSearchParams(window.location.search).has("invite")
        }
      />
    );
  if (!demo && (permissionFailure || deniedScope === accessScope))
    return (
      <div className="fs-loading" role="alert">
        <p>This workspace is unavailable or your access has changed.</p>
        <button className="fs-button" onClick={() => void Promise.allSettled([auth.mutate(), workspaces.mutate(), result.mutate(), workflow.mutate()])}>Retry access check</button>
        <button className="fs-button secondary" onClick={signOut}>Sign out</button>
      </div>
    );
  if (!demo && explicitWorkspace && !workspaceAccessVerified)
    return (
      <div className="fs-loading" role="status">
        <p>{result.error ? "This workspace could not be verified. Retry when connected." : "Checking access to this workspace…"}</p>
        <button className="fs-button" onClick={() => void Promise.allSettled([result.mutate(), workflow.mutate(), workspaces.mutate()])}>Retry workspace</button>
      </div>
    );
  if (!demo && !explicitWorkspace && workspaces.isLoading && !workspaces.data)
    return <div className="fs-loading">Loading your workspaces…</div>;
  if (!demo && !explicitWorkspace && workspaces.error && !keepCachedRead(workspaces.data,workspaces.error))
    return (
      <div className="fs-loading">
        <p>Workspaces could not be loaded.</p>
        <button onClick={() => void workspaces.mutate()}>Retry</button>
      </div>
    );
  if (!demo && discoveryGate === "loading")
    return <div className="fs-loading">Loading your workspaces…</div>;
  if (!demo && discoveryGate === "first")
    return (
      <FirstWorkspace onSaved={() => workspaces.mutate()} onSignOut={signOut} />
    );
  function refreshCanonicalLists() {
    void Promise.allSettled([result.mutate(),workflow.mutate(),linkedRecord.mutate()]).then(results=>{
      if(results.some(item=>item.status==="rejected")) setNotice("Some workspace lists could not refresh. Your current view is kept; retry when connected.");
    });
  }
  const common = {
    data,
    workspaceId,
    userId,
    demo,
    onMutate: mutation,
    onNavigate: navigate,
    search,
    workspaces: demo
      ? [{ id: "demo", name: data.workspace?.name || "Demo workspace" }]
      : workspaces.data || [],
  };
  const creativeCommon = {...common,data:creativeData};
  const currentName =
    data.members?.find((m: any) => m.user_id === userId)?.display_name || "You";
  const searchResults = search.trim()
    ? ["ideas", "projects", "tasks", "references", "files"].flatMap((type) =>
        (data[type] || [])
          .filter((r: any) =>
            `${r.title} ${r.body || r.details || r.note || ""}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .slice(0, 5)
          .map((r: any) => ({ ...r, type })),
      )
    : [];
  return (
    <ProfilePhotoProvider key={`${userId}:${workspaceId}`} viewerId={userId} demo={demo}>
    <div className="fs-app">
      <aside className={`fs-sidebar ${menu ? "is-open" : ""}`}>
        <a className="fs-brand" href={base} aria-label="Fairway Studio home" onClick={(event) => { event.preventDefault(); navigate(base); }}>
          <img src="/fairway-studio-logo-burgundy.png" alt="Fairway Studio logo in burgundy" />
        </a>
        <p className="fs-eyebrow">WORKSPACE</p>
        <label className="fs-workspace">
          <button type="button" className="profile-avatar-button" aria-label="Edit your profile photo" onClick={() => navigate(`${base}/settings/profile`)}><Avatar name={currentName} userId={userId} small /></button>
          <select
            aria-label="Switch workspace"
            value={workspaceId}
            onChange={(e) => navigate(`/w/${e.target.value}`)}
          >
            {(demo ? [data.workspace] : workspaces.data?.length ? workspaces.data : workspaceAccessVerified ? [result.data.workspace] : [])?.map((w: any) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <ChevronDown size={16} />
        </label>
        <nav aria-label="Main navigation">
          {nav.map(([key, label, Icon], i) => (
            <a
              className={`${activeView === key ? "active" : ""} ${i === 6 ? "separated" : ""}`}
              key={key}
              href={`${base}/${key}`}
              onClick={(e) => {
                e.preventDefault();
                navigate(`${base}/${key}`);
              }}
              aria-current={activeView === key ? "page" : undefined}
            >
              <Icon size={20} />
              {label}
            </a>
          ))}
        </nav>
        <button className="fs-signout" onClick={signOut}>
          <LogOut size={18} />
          {demo ? "Exit demo" : "Sign out"}
        </button>
      </aside>
      {menu && (
        <button
          aria-label="Close navigation"
          className="fs-scrim"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="fs-main">
        <header className="fs-topbar">
          <a
            className="fs-mobile-brand"
            href={`${base}/`}
            aria-label="Fairway Studio home"
            onClick={(event) => { event.preventDefault(); navigate(`${base}/`); }}
          >
            <Flag size={25} />
            <span>FAIRWAY STUDIO</span>
          </a>
          <button
            className="fs-icon fs-menu-toggle"
            aria-label="Open navigation"
            onClick={() => setMenu(true)}
          >
            <Menu size={22} />
          </button>
          <div className="fs-breadcrumb">
            <span>{nav.find(([key]) => key === activeView)?.[1] || "Home"}</span>
            {route[1] && (
              <>
                <ChevronRight size={14} />
                <strong>
                  {operationalRoute
                    ? workflowRouteLabel(workflowRoute)
                    : view === "projects"
                    ? data.projects?.find((p: any) => p.id === route[1])
                        ?.title || "Project"
                    : route[1]}
                </strong>
              </>
            )}
          </div>
          <button
            className="fs-icon fs-mobile-search-toggle"
            aria-label={mobileSearch ? "Close search" : "Search workspace"}
            aria-expanded={mobileSearch}
            onClick={() => setMobileSearch(!mobileSearch)}
          >
            {mobileSearch ? <X size={22} /> : <Search size={22} />}
          </button>
          <div className={`fs-global-search ${mobileSearch ? "is-open" : ""}`}>
            <Search size={18} />
            <input
              aria-label="Search projects, ideas, or files"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects, ideas, or files…"
            />
            {search && (
              <button aria-label="Clear search" onClick={() => setSearch("")}>
                <X size={16} />
              </button>
            )}
            {search && (
              <div className="fs-search-results">
                {searchResults.length ? (
                  searchResults.map((r: any) => (
                    <button
                      key={`${r.type}-${r.id}`}
                      onClick={() => {
                        navigate(
                          r.type === "projects" && isBusinessProject(r)
                            ? `${base}/business/${encodeURIComponent(r.id)}`
                            : `${base}/${r.type === "references" || r.type === "files" ? "library" : r.type}${r.type === "projects" ? `/${r.id}/overview` : ""}?item=${r.id}`,
                        );
                        setSearch("");
                        setMobileSearch(false);
                      }}
                    >
                      <span>{r.title}</span>
                      <small>{r.type === "projects" && isBusinessProject(r) ? "business plan" : r.type}</small>
                    </button>
                  ))
                ) : (
                  <p>No matching workspace records.</p>
                )}
              </div>
            )}
          </div>
          <NotificationInbox
            data={data}
            workspaceId={workspaceId}
            userId={userId}
            onNavigate={navigate}
          />
          {!operationalRoute && <div className="fs-quick">
            <button
              className="fs-button"
              aria-expanded={quick}
              onClick={() =>
                  view === "projects" && !route[1]
                  ? openCreate("Project")
                  : view === "tasks"
                    ? openCreate("Task")
                    : view === "conversations"
                      ? openCreate("Conversation")
                      : setQuick(!quick)
              }
            >
              <Plus size={19} />
              <span>
                {view === "projects" && !route[1]
                  ? "New project"
                  : view === "tasks"
                    ? "New task"
                    : view === "conversations"
                      ? "New conversation"
                      : "Add"}
              </span>
              <ChevronDown size={15} />
            </button>
            {quick && (
              <div className="fs-dropdown">
                {[
                  "Idea",
                  "Project",
                  "Pin link",
                  "Upload",
                  "Note",
                  "Task",
                  "Conversation",
                ].map((kind) => (
                  <button
                    key={kind}
                    onClick={() => {
                      setQuick(false);
                      if (kind === "Upload" || kind === "Pin link") {
                        navigate(
                          `${base}/library?action=${kind === "Upload" ? "upload" : "pin"}`,
                        );
                      } else openCreate(kind);
                    }}
                  >
                    {kind}
                  </button>
                ))}
              </div>
            )}
          </div>}
          {!operationalRoute && <button
            className="fs-icon"
            title="Open Creative Assistant"
            aria-label="Open Creative Assistant"
            onClick={() => setAi(!ai)}
          >
            <Sparkles size={20} />
          </button>}
        </header>
        <main className="fs-content">
          {demo && (
            <div className="fs-demo-banner">
              <span>Interactive demo · sample content</span>
              <small>Session-only changes · no live workspace data</small>
              <button
                onClick={() => {
                  const persisted = commitDemoData(createDemoData());
                  setNotice(persisted ? "Demo reset." : "Demo reset in this view. Browser session storage is unavailable.");
                }}
              >
                Reset
              </button>
            </div>
          )}
          {!demo &&
            typeof window !== "undefined" &&
            new URLSearchParams(window.location.search).has("invite") && (
              <div className="fs-inline-note">
                A teammate invited you to a workspace.{" "}
                <button
                  className="fs-link"
                  onClick={async () => {
                    const token = new URLSearchParams(
                      window.location.search,
                    ).get("invite");
                    const { error } = await createClient().rpc(
                      "accept_workspace_invite",
                      { p_token: token },
                    );
                    if (error)
                      setActionError(
                        "Invitation could not be accepted. It may have expired.",
                      );
                    else {
                      const url = new URL(location.href);
                      url.searchParams.delete("invite");
                      router.replace(url.pathname + url.search);
                      await workspaces.mutate();
                      setNotice("Invitation accepted.");
                    }
                  }}
                >
                  Accept invitation
                </button>
              </div>
            )}
          {result.isLoading && !result.data && !demo ? (
            <div className="fs-loading">Loading workspace records…</div>
          ) : result.error && !keepCachedRead(result.data,result.error) && !demo ? (
            <Card>
              <Empty
                title="This workspace is unavailable"
                detail={result.error.message}
                action={
                  <button
                    className="fs-button"
                    onClick={refreshCanonicalLists}
                  >
                    Retry
                  </button>
                }
              />
            </Card>
          ) : (
            <>
              {!demo && result.error && result.data && <div role="status" className="fs-alert">Workspace lists could not refresh. Your open work is kept here.<button onClick={refreshCanonicalLists}>Retry refresh</button></div>}
              {!!data.missingSchema?.length && (
                <div role="status" className="fs-alert">
                  <AlertCircle size={18} />
                  <span>
                    Existing content is connected. The additive collaboration
                    schema still needs review and installation for new projects,
                    versioned reviews, and decisions.
                  </span>
                  <button
                    onClick={() => navigate(`${base}/settings/integrations`)}
                  >
                    View setup
                  </button>
                </div>
              )}
              {actionError && (
                <div role="alert" className="fs-alert error">
                  {actionError}
                  <button
                    aria-label="Dismiss error"
                    onClick={() => setActionError("")}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              <div key={`${userId}:${workspaceId}`} data-guide-page={onboardingPageId}>
                {onboardingScopeReady && !operationalRoute && !create && !ai && !generation && (
                  <OnboardingGuide
                    pageId={onboardingPageId}
                    route={route}
                    routeKey={path}
                    onNavigate={(nextRoute) => navigate(`${base}${nextRoute.length ? `/${nextRoute.map(encodeURIComponent).join("/")}` : ""}`)}
                    data={creativeData}
                    userId={userId}
                    state={onboardingState}
                    persistenceAvailable={onboardingPersistenceAvailable}
                    onChange={setOnboardingState}
                    onAction={runOnboardingAction}
                  />
                )}
                {!view && (
                  <Home
                    {...creativeCommon}
                    onCreate={() => openCreate("Idea")}
                    onAi={() => setAi(true)}
                  />
                )}
                {view === "ideas" && <IdeasView {...creativeCommon} />}
                {businessRoute && <BusinessSubnav base={base} route={workflowRoute} onNavigate={navigate} />}
                {operationalRoute && <WorkflowHelp route={workflowRoute} />}
                {businessRoute && workflowRoute.kind === "plans" && <BusinessWorkspaceBoundary key={`${userId}:${workspaceId}:${businessPlanId || "index"}`} workspaceId={workspaceId || ""} planId={businessPlanId} base={base} demo={demo} onNavigate={navigate} onChanged={refreshCanonicalLists} onBlocked={setNotice} onNavigationStateChange={setBusinessNavigation} />}
                {operationalRoute && workflowRoute.kind !== "plans" && <ConnectedWorkflowBoundary key={`${userId}:${workspaceId}:${route.join("/")}`} workspaceId={workspaceId || ""} userId={userId} route={workflowRoute} base={base} demo={demo} onNavigate={navigate} onChanged={refreshCanonicalLists} onBlocked={setNotice} onNavigationStateChange={setBusinessNavigation} />}
                {!businessRoute && linkedTarget && !demo && (linkedRecord.isLoading || linkedRecord.error) && <div role={linkedRecord.error ? "alert" : "status"} className="fs-alert">{linkedRecord.error?.message || "Opening the linked record…"}{linkedRecord.error && <button onClick={() => void linkedRecord.mutate()}>Retry record</button>}</div>}
                {view === "projects" && !businessRoute && (!linkedTarget || demo || keepCachedRead(linkedRecord.data,linkedRecord.error)) && (
                  <ProjectsView
                    {...creativeCommon}
                    projectId={route[1]}
                    tab={route[2] || "overview"}
                  />
                )}
                {view === "library" && (!linkedTarget || demo || keepCachedRead(linkedRecord.data,linkedRecord.error)) && <LibraryView {...creativeCommon} />}
                {view === "tasks" && (!linkedTarget || demo || keepCachedRead(linkedRecord.data,linkedRecord.error)) && <TasksView {...common} />}
                {view === "conversations" && (
                  <Conversations
                    {...common}
                    threadId={route[1]}
                    onAi={() => setAi(true)}
                  />
                )}
                {view === "brand-kit" && <BrandKitView {...creativeCommon} />}
                {view === "settings" && (
                  <TeamSettings
                    {...common}
                    section={route[1] || "members"}
                    onCreateInvite={() => openCreate("Invite")}
                  />
                )}
                {!nav.some(([k]) => k === view) && (
                  <Empty
                    title="Page not found"
                    detail="Choose a destination from the navigation."
                  />
                )}
              </div>
            </>
          )}
        </main>
        <nav className="fs-mobile-nav" aria-label="Mobile navigation">
          {nav.filter(([key]) => ["", "tasks", "business", "content"].includes(key)).map(([key, label, Icon]) => (
            <a
              key={key}
              href={`${base}/${key}`}
              onClick={(event) => { event.preventDefault(); navigate(`${base}/${key}`); }}
              aria-current={activeView === key ? "page" : undefined}
            >
              <Icon size={22} />
              {label}
            </a>
          ))}
          <button onClick={() => setMenu(!menu)}>
            <Menu size={22} />
            More
          </button>
        </nav>
      </div>
      {notice && (
        <div role="status" className="fs-toast">
          <Check size={18} />
          {notice}
        </div>
      )}
      {generation && !operationalRoute && (
        <GenerationPanel
          data={creativeData}
          workspaceId={workspaceId}
          demo={demo}
          currentProjectId={currentProjectId}
          initial={generation}
          onboardingGuide={{
            route, data: creativeData, userId, state: onboardingState,
            persistenceAvailable: onboardingPersistenceAvailable,
            onChange: setOnboardingState, onAction: runOnboardingAction,
          }}
          onClose={() => setGeneration(null)}
          onSaved={refreshCanonicalLists}
        />
      )}
      {ai && !operationalRoute && (
        <StudioAI
          data={creativeData}
          demo={demo}
          workspaceId={workspaceId}
          initialQuestion={aiInitialQuestion}
          onboardingGuide={{
            route, data: creativeData, userId, state: onboardingState,
            persistenceAvailable: onboardingPersistenceAvailable,
            onChange: setOnboardingState, onAction: runOnboardingAction,
          }}
          onClose={() => setAi(false)}
        />
      )}
      {create === "Idea" ? (
        <IdeaEditor
          key={`${workspaceId}:${userId}:new-idea`}
          idea={null}
          initial={createInitial}
          data={creativeData}
          workspaceId={workspaceId}
          userId={userId}
          demo={demo}
          onMutate={mutation}
          onNavigate={navigate}
          onClose={() => { setCreate(""); setCreateInitial({}); }}
          onSaved={() => {
            setCreate(""); setCreateInitial({});
            navigate(demo ? "/demo/ideas" : `/w/${workspaceId}/ideas`);
          }}
        />
      ) : create ? (
        <QuickComposer
          kind={create}
          initial={createInitial}
          data={create === "Task" || create === "Conversation" ? data : creativeData}
          workspaceId={workspaceId}
          demo={demo}
          mutate={mutation}
          onClose={() => {
            setCreate("");
            setCreateInitial({});
          }}
          onSaved={(to?: string) => {
            setCreate("");
            setCreateInitial({});
            if (to) navigate(to);
          }}
        />
      ) : null}
    </div>
    </ProfilePhotoProvider>
  );
}
function FirstWorkspace({
  onSaved,
  onSignOut,
}: {
  onSaved: () => void;
  onSignOut: () => void;
}) {
  const [name, setName] = useState("Founders’ Studio"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await createClient().rpc("create_workspace_with_owner", {
      p_name: name.trim(),
    });
    setBusy(false);
    if (r.error) setError("Workspace could not be created. Please retry.");
    else onSaved();
  }
  return (
    <main className="fs-setup">
      <Flag size={32} />
      <h1>Create your studio.</h1>
      <p>
        Keep ideas, references and decisions together. Existing invitations can
        be accepted from their original link.
      </p>
      {typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).has("invite") && (
          <button
            className="fs-button"
            onClick={async () => {
              const { error } = await createClient().rpc(
                "accept_workspace_invite",
                {
                  p_token: new URLSearchParams(window.location.search).get(
                    "invite",
                  ),
                },
              );
              if (error)
                setError("Invitation could not be accepted. Check its expiry.");
              else onSaved();
            }}
          >
            Accept team invitation
          </button>
        )}
      <form onSubmit={save}>
        <label>
          Workspace name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button className="fs-button" disabled={busy}>
          Create workspace
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
      <button onClick={onSignOut}>Sign out</button>
    </main>
  );
}
function Home({
  data,
  userId,
  workspaceId,
  onNavigate,
  onCreate,
  onAi,
  demo,
}: any) {
  const base = `/w/${workspaceId}`;
  const reviews = data.rounds.filter(
    (r: any) =>
      (r.state || r.status) === "open" &&
      (r.reviewer_ids || r.reviewers)?.includes(userId) &&
      !data.reviews.some(
        (v: any) =>
          v.round_id === r.id &&
          v.reviewer_id === userId &&
          (!v.state || v.state === "submitted"),
      ),
  );
  const starterConcepts = data.projects
    .filter(
      (p: any) => p.is_tutorial || p.is_sample || p.contains_tutorial_content,
    )
    .slice(0, 2)
    .map((p: any) => ({
      project: p,
      version: data.versions.find(
        (v: any) => v.project_id === p.id && v.image_url,
      ),
    }))
    .filter((x: any) => x.version);
  const tasks = (
    demo && data.home_actions?.length ? data.home_actions : data.tasks
  )
    .filter(
      (t: any) => t.status !== "done" && (demo || t.assigned_to === userId),
    )
    .sort((a: any, b: any) =>
      (a.due_date || "9999").localeCompare(b.due_date || "9999"),
    );
  return (
    <>
      <div className="fs-home-heading">
        <Heading
          title="Your studio, in motion."
          detail="Ideas, decisions, and the next move."
        />
        <div className="fs-home-capture">
          {
            <button className="fs-button" onClick={onCreate}>
              <Plus size={18} />
              Capture an idea
            </button>
          }
        </div>
      </div>
      <div className="fs-home-grid">
        <div>
          <Card>
            <div className="fs-section-head">
              <h2>
                {!reviews.length && starterConcepts.length
                  ? "Explore your starter concepts"
                  : "Waiting for your review"}
              </h2>
              <span className="fs-count">{reviews.length}</span>
            </div>
            {reviews.length ? (
              reviews.map((r: any) => {
                const version = data.versions.find(
                  (v: any) => v.id === r.version_id,
                );
                const project = data.projects.find(
                  (p: any) => p.id === r.project_id,
                );
                return (
                  <button
                    key={r.id}
                    className="fs-review-row"
                    onClick={() =>
                      onNavigate(
                        `${base}/projects/${r.project_id}/reviews?round=${r.id}`,
                      )
                    }
                  >
                    <div className="fs-thumb">
                      {version?.image_url ? (
                        <img src={version.image_url} alt="" />
                      ) : (
                        <Flag />
                      )}
                    </div>
                    <div>
                      <h3>
                        {project?.title || version?.title || "Concept review"}
                      </h3>
                      <p>
                        Version {version?.version_number || "—"} · {r.scope}
                      </p>
                      <div className="fs-avatar-group">
                        {(r.reviewer_ids || r.reviewers).map((id: string) => (
                          <Avatar
                            small
                            key={id}
                            userId={id}
                            name={
                              data.members.find((m: any) => m.user_id === id)
                                ?.display_name || "Member"
                            }
                          />
                        ))}
                      </div>
                    </div>
                    <span className="fs-link">
                      Review direction <ArrowRight size={16} />
                    </span>
                  </button>
                );
              })
            ) : starterConcepts.length ? (
              starterConcepts.map(({ project, version }: any) => (
                <button
                  key={version.id}
                  className="fs-review-row"
                  onClick={() =>
                    onNavigate(`${base}/projects/${project.id}/canvas`)
                  }
                >
                  <div className="fs-thumb">
                    <img src={version.image_url} alt="" />
                  </div>
                  <div>
                    <h3>{project.title}</h3>
                    <p>Exploratory concept · ready to develop</p>
                    <div className="fs-avatar-group">
                      {data.members.slice(0, 3).map((m: any) => (
                        <Avatar
                          small
                          key={m.user_id}
                          userId={m.user_id}
                          name={m.display_name || "Member"}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="fs-link">
                    Open concept <ArrowRight size={16} />
                  </span>
                </button>
              ))
            ) : (
              <Empty
                title="You’re up to date"
                detail="New review assignments will appear here."
              />
            )}
          </Card>
          <div className="fs-section-head">
            <h2>Continue creating</h2>
            <button
              className="fs-link"
              onClick={() => onNavigate(`${base}/projects`)}
            >
              View all <ChevronRight size={16} />
            </button>
          </div>
          <div className="fs-project-grid">
            {data.projects.slice(0, 3).map((p: any) => (
              <button
                className="fs-card fs-project-card"
                key={p.id}
                onClick={() => onNavigate(`${base}/projects/${p.id}/canvas`)}
              >
                <div className="fs-cover">
                  {p.cover_url ? (
                    <img src={p.cover_url} alt="" />
                  ) : (
                    <FolderKanban size={45} />
                  )}
                  <span className="fs-badge">
                    {(p.phase || p.status || "exploring").replace("_", " ")}
                  </span>
                </div>
                <h3>{p.title}</h3>
                <div className="fs-project-summary">
                  <p>{p.type || p.category || "Creative project"}</p>
                  <div className="fs-avatar-group">
                    {data.members.slice(0, 3).map((m: any) => (
                      <Avatar
                        small
                        key={m.user_id}
                        userId={m.user_id}
                        name={m.display_name || "Member"}
                      />
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {!data.projects.length && (
            <Card>
              <Empty
                title="Make room for your first project"
                detail="Capture an idea, then promote it when you’re ready."
                action={
                  <button
                    className="fs-button secondary"
                    onClick={() => onNavigate(`${base}/ideas`)}
                  >
                    Explore ideas
                  </button>
                }
              />
            </Card>
          )}
        </div>
        <div className="fs-right-column">
          <Card>
            <h2 className="fs-icon-title">
              <Sparkles />
              Creative Assistant
            </h2>
            <p className="fs-ai-prompt">
              Draft briefs, names, creative directions, comparisons, feedback summaries, and task ideas for {data.workspace.name}.
            </p>
            {[
              "Prepare founder review",
              "Compare open directions",
            ].map((t) => (
              <button className="fs-action-row" key={t} onClick={onAi}>
                <Sparkles size={17} />
                <span>
                  <strong>{t}</strong>
                  <small>
                    {t === "Prepare founder review"
                      ? "Summarize open items and create a review package"
                      : "Side-by-side analysis of concepts and feedback"}
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </Card>
          <Card>
            <h2>Next actions</h2>
            {tasks.length ? (
              tasks.slice(0, 5).map((t: any) => (
                <button
                  key={t.id}
                  className="fs-action-row"
                  onClick={() => onNavigate(`${base}/tasks?item=${t.id}`)}
                >
                  {t.cover_url ? (
                    <img
                      className="fs-next-thumbnail"
                      src={t.cover_url}
                      alt=""
                    />
                  ) : (
                    <CheckSquare size={18} />
                  )}
                  <span>
                    <strong>{t.title}</strong>
                    <small>
                      {demo ? t.details : t.due_date || "No due date"}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))
            ) : (
              <p className="fs-muted fs-space">
                No open tasks assigned to you.
              </p>
            )}
          </Card>
          <Card>
            <h2>Recent activity</h2>
            {data.activity.length ? (
              data.activity.slice(0, 5).map((a: any) => (
                <div className="fs-action-row" key={a.id}>
                  <Avatar
                    userId={a.actor_id}
                    name={
                      data.members.find((m: any) => m.user_id === a.actor_id)
                        ?.display_name || "Member"
                    }
                    small
                  />
                  <span>
                    <strong>{activityLabel(a)}</strong>
                    <small>
                      {demo && a.payload?.sample
                        ? a.payload.summary
                        : new Date(a.created_at).toLocaleDateString()}
                    </small>
                  </span>
                </div>
              ))
            ) : (
              <p className="fs-muted fs-space">
                Your team’s saved changes will appear here.
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Conversations({
  data,
  workspaceId,
  userId,
  demo,
  onMutate,
  onNavigate,
  threadId,
  onAi,
}: any) {
  const [body, setBody] = useState(""),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [task, setTask] = useState<any>(null),
    [title, setTitle] = useState(""),
    [read, setRead] = useState<Record<string, string>>({}),
    [session, setSession] = useState(false),
    [unreadOnly, setUnreadOnly] = useState(false);
  const threads = [
    ...(data.threads || []),
    { id: "workspace", title: "Workspace conversation" },
  ];
  const active = threads.find((t: any) => t.id === threadId) || threads[0];
  const messages = (data.messages || [])
    .filter((m: any) =>
      active.id === "workspace" ? !m.thread_id : m.thread_id === active.id,
    )
    .sort((a: any, b: any) => a.created_at.localeCompare(b.created_at));
  const project = data.projects.find((p: any) => p.id === active.project_id);
  const pinnedVersion = data.versions.find(
    (v: any) => v.project_id === project?.id && v.image_url,
  );
  const sourceIdea = data.ideas.find((i: any) => i.id === active.idea_id);
  const sourceTask = data.tasks.find((t: any) => t.id === active.task_id);
  const request = useRef(crypto.randomUUID());
  useEffect(() => {
    setBody("");
    setRead({});
    setError("");
    request.current = crypto.randomUUID();
    if (!demo) {
      const value = localStorage.getItem(
        `fairway-read:${userId}:${workspaceId}`,
      );
      if (value)
        try {
          setRead(JSON.parse(value));
        } catch {}
    }
  }, [demo, userId, workspaceId]);
  useEffect(() => {
    const last = messages.at(-1)?.id;
    if (last) {
      setRead((r) => ({ ...r, [active.id]: last }));
      if (!demo)
        localStorage.setItem(
          `fairway-read:${userId}:${workspaceId}`,
          JSON.stringify({ ...read, [active.id]: last }),
        );
    }
  }, [active.id, messages.at(-1)?.id]);
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await onMutate("sendMessage", {
        body: body.trim(),
        ...(active.id === "workspace" ? {} : { thread_id: active.id }),
        client_request_id: request.current,
      });
      setBody("");
      request.current = crypto.randomUUID();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        title="Keep the conversation connected."
        detail="Discuss the work. Keep its context close."
        action={
          <button
            className="fs-button"
            onClick={async () => {
              const name = prompt("Conversation title");
              if (name?.trim())
                try {
                  const t = await onMutate("createThread", {
                    title: name.trim(),
                  });
                  onNavigate(`/w/${workspaceId}/conversations/${t.id}`);
                } catch {}
            }}
          >
            <Plus size={17} />
            New conversation
          </button>
        }
      />
      <div className="fs-conversations">
        <Card>
          <div className="fs-search">
            <Search size={17} />
            <input
              aria-label="Search conversations"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations…"
            />
          </div>
          <div
            className="fs-tabs mt-3"
            role="tablist"
            aria-label="Conversation filter"
          >
            <button
              role="tab"
              aria-selected={!unreadOnly}
              className={!unreadOnly ? "active" : ""}
              onClick={() => setUnreadOnly(false)}
            >
              All
            </button>
            <button
              role="tab"
              aria-selected={unreadOnly}
              className={unreadOnly ? "active" : ""}
              onClick={() => setUnreadOnly(true)}
            >
              Unread
            </button>
          </div>
          <div className="fs-thread-list">
            {threads
              .filter((t: any) => {
                const latest = data.messages
                  .filter((m: any) =>
                    t.id === "workspace" ? !m.thread_id : m.thread_id === t.id,
                  )
                  .sort((a: any, b: any) =>
                    a.created_at.localeCompare(b.created_at),
                  )
                  .at(-1);
                return (
                  t.title.toLowerCase().includes(query.toLowerCase()) &&
                  (!unreadOnly || (latest && read[t.id] !== latest.id))
                );
              })
              .map((t: any) => (
                <button
                  className={active.id === t.id ? "selected" : ""}
                  key={t.id}
                  onClick={() =>
                    onNavigate(`/w/${workspaceId}/conversations/${t.id}`)
                  }
                >
                  {data.projects.find((p: any) => p.id === t.project_id)
                    ?.cover_url ? (
                    <img
                      src={
                        data.projects.find((p: any) => p.id === t.project_id)
                          .cover_url
                      }
                      alt=""
                    />
                  ) : (
                    <MessageCircle size={21} />
                  )}
                  <span>
                    <strong>{t.title}</strong>
                    <small>
                      {t.project_id
                        ? "Project discussion"
                        : "Shared team discussion"}
                    </small>
                  </span>
                </button>
              ))}
          </div>
        </Card>
        <Card className="fs-thread">
          <header>
            {project?.cover_url && (
              <img
                className="fs-conversation-thumb"
                src={project.cover_url}
                alt=""
              />
            )}
            <div>
              <h2>{active.title}</h2>
              <p className="fs-muted">
                {project?.title || "Private to workspace members"}
              </p>
            </div>
            <button
              className="fs-button secondary"
              onClick={() => setSession(true)}
            >
              <Video size={17} />
              Start session
            </button>
          </header>
          {demo && (
            <p className="fs-inline-note">
              SAMPLE DISCUSSION
              <small>
                This is example content to illustrate a typical conversation. No
                founder has sent these messages.
              </small>
            </p>
          )}
          <ol className="fs-messages" aria-live="polite">
            {messages.length ? (
              messages.map((m: any) => (
                <li key={m.id}>
                  <Avatar
                    userId={m.author_id}
                    name={
                      data.members.find((p: any) => p.user_id === m.author_id)
                        ?.display_name || "Member"
                    }
                  />
                  <div>
                    <strong>
                      {m.author_id === userId
                        ? "You"
                        : data.members.find(
                            (p: any) => p.user_id === m.author_id,
                          )?.display_name || "Member"}
                    </strong>
                    <p>{m.body}</p>
                    {m.version_id &&
                      data.versions.find((v: any) => v.id === m.version_id)
                        ?.image_url && (
                        <figure className="fs-message-preview">
                          <img
                            src={
                              data.versions.find(
                                (v: any) => v.id === m.version_id,
                              ).image_url
                            }
                            alt={
                              data.versions.find(
                                (v: any) => v.id === m.version_id,
                              ).title
                            }
                          />
                          <figcaption>
                            {
                              data.versions.find(
                                (v: any) => v.id === m.version_id,
                              ).title
                            }
                          </figcaption>
                        </figure>
                      )}
                    <button
                      className="fs-subtle"
                      onClick={() => {
                        setTask(m);
                        setTitle(m.body.slice(0, 100));
                      }}
                    >
                      Turn into task
                    </button>
                  </div>
                </li>
              ))
            ) : (
              <li>
                <Empty
                  title="Start the conversation"
                  detail="Share a thought or ask your team a question."
                />
              </li>
            )}
          </ol>
          <form onSubmit={send} className="fs-message-form">
            {error && <p role="alert">{error}</p>}
            <div>
          <textarea
            aria-label="Message"
            data-onboarding="conversation-message"
            placeholder="Reply to this conversation…"
                value={body}
                maxLength={4000}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <button
                className="fs-button"
                disabled={busy || !body.trim()}
                aria-label="Send message"
              >
                <Send size={19} />
              </button>
            </div>
            <small>
              Enter to send · Shift + Enter for a new line · Sends after server
              confirmation
            </small>
          </form>
        </Card>
        <div className="fs-right-column">
          <Card>
            <h2>Context</h2>
            {project ? (
              <button
                className="fs-action-row"
                onClick={() =>
                  onNavigate(`/w/${workspaceId}/projects/${project.id}/canvas`)
                }
              >
                <FolderKanban size={22} />
                {project.title}
                <ChevronRight size={16} />
              </button>
            ) : sourceIdea || sourceTask ? (
              <button
                className="fs-action-row"
                onClick={() =>
                  onNavigate(
                    `/w/${workspaceId}/${sourceIdea ? "ideas" : "tasks"}?item=${(sourceIdea || sourceTask).id}`,
                  )
                }
              >
                <MessageCircle size={20} />
                {(sourceIdea || sourceTask).title}
                <ChevronRight size={16} />
              </button>
            ) : (
              <p className="fs-muted fs-space">
                A shared workspace conversation.
              </p>
            )}
          </Card>
          {pinnedVersion && (
            <Card>
              <h2>Pinned reference</h2>
              <button
                className="text-left w-full"
                onClick={() =>
                  onNavigate(`/w/${workspaceId}/projects/${project.id}/canvas`)
                }
              >
                <img
                  className="fs-pinned-preview"
                  src={pinnedVersion.image_url}
                  alt={pinnedVersion.title}
                />
                <p className="fs-muted fs-space">
                  {pinnedVersion.title} · Exploratory concept
                </p>
              </button>
            </Card>
          )}
          <Card>
            <h2 className="fs-icon-title">
              <Sparkles />
              Studio AI
            </h2>
            <p className="fs-muted fs-space">
              Find open questions and draft the next step from real feedback.
            </p>
            <button className="fs-button secondary" onClick={onAi}>
              Summarize discussion
            </button>
          </Card>
        </div>
      </div>
      {session && (
        <Dialog title="Join a work session" onClose={() => setSession(false)}>
          {data.rooms.filter((r: any) => r.meeting_url).length ? (
            data.rooms
              .filter((r: any) => r.meeting_url)
              .map((r: any) => (
                <a
                  key={r.id}
                  className="fs-action-row"
                  href={
                    /^https:\/\//.test(r.meeting_url)
                      ? r.meeting_url
                      : undefined
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Video size={20} />
                  <span>
                    <strong>{r.title}</strong>
                    <small>
                      Opens your existing meeting provider. Camera and
                      microphone are controlled there.
                    </small>
                  </span>
                  <ExternalLink size={17} />
                </a>
              ))
          ) : (
            <Empty
              title="Sessions need setup"
              detail="No meeting provider or existing meeting link is configured. Text discussion stays available."
            />
          )}
        </Dialog>
      )}
      {task && (
        <Dialog title="Turn message into a task" onClose={() => setTask(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await onMutate("createTask", {
                  title,
                  details: task.body,
                  source_message_id: task.id,
                  category: "Discussion",
                  ...(active.project_id
                    ? { project_id: active.project_id }
                    : {}),
                });
                setTask(null);
              } catch {}
            }}
          >
            <label>
              Task title
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <p className="fs-muted">
              Source message remains linked. You can edit the task before
              saving.
            </p>
            <button className="fs-button">Create task</button>
          </form>
        </Dialog>
      )}
    </>
  );
}

function TeamSettings({
  data,
  workspaceId,
  userId,
  demo,
  onMutate,
  onNavigate,
  section,
  onCreateInvite,
}: any) {
  const [name, setName] = useState(data.workspace.name),
    [zone, setZone] = useState(data.workspace.timezone || "UTC"),
    [policy, setPolicy] = useState(
      data.workspace.review_policy?.policy ||
        data.workspace.review_policy?.mode ||
        "unanimous",
    ),
    [threshold, setThreshold] = useState(2),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(""),
    [selectedMember, setSelectedMember] = useState<any>(null),
    [events, setEvents] = useState<Record<string, boolean>>(
      data.notificationPreferences?.events || {
        mentions: true,
        assignments: true,
        reviews: true,
        decisions: true,
        sessions: true,
        generations: true,
      },
    );
  const owner = ["owner", "admin"].includes(data.role);
  const sections = [
    "profile",
    "members",
    "workspace",
    "review-rules",
    "integrations",
    "notifications",
    "devices",
  ];
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      new Intl.DateTimeFormat("en", { timeZone: zone });
      await onMutate("updateWorkspace", {
        name,
        timezone: zone,
        expected_revision: data.workspace.revision || 0,
      });
      setSaved("Workspace settings saved.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <Heading
        title="The people behind the studio."
        detail="Manage the team, the workspace, and how decisions are made."
      />
      <div className="fs-tabs" role="tablist" aria-label="Settings sections">
        {sections.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={section === s}
            onClick={() => onNavigate(`/w/${workspaceId}/settings/${s}`)}
          >
            {s.replace("-", " ").replace(/^./, (c) => c.toUpperCase())}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="fs-alert error">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="fs-inline-note">
          {saved}
        </p>
      )}
      {section === "profile" && <ProfilePhotoEditor key={userId} userId={userId} name={data.members.find((m: any) => m.user_id === userId)?.display_name || "You"} />}
      {section === "members" && (
        <div className="fs-brand-grid">
          <div>
            <Card>
              <div className="fs-section-head">
                <h2>Team members</h2>
                <button
                  disabled={!owner}
                  className="fs-button"
                  onClick={onCreateInvite}
                >
                  <Plus size={17} />
                  Invite member
                </button>
              </div>
              <div className="fs-member-table">
                <div className="fs-table-head">
                  <span>Name</span>
                  <span>Focus</span>
                  <span>Access</span>
                </div>
                {data.members.map((m: any) => (
                  <div key={m.user_id}>
                    <span>
                      <Avatar name={m.display_name || "Member"} userId={m.user_id} />
                      <strong>{m.display_name || "Studio member"}</strong>
                    </span>
                    <span>{m.focus || "Not specified"}</span>
                    <span>
                      <span className="fs-badge">{m.role}</span>
                      {(m.is_founder || m.is_reviewer) && (
                        <small className="block text-xs text-stone-500 mt-1">
                          {m.is_founder
                            ? "Founder review designation"
                            : "Reviewer"}
                        </small>
                      )}
                      {data.role === "owner" && (
                        <button
                          className="fs-subtle"
                          onClick={() => setSelectedMember({ ...m })}
                        >
                          Manage
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              {(data.invites || []).length > 0 && (
                <div>
                  <h3>Pending invitations</h3>
                  {data.invites.map((i: any) => (
                    <div className="fs-action-row" key={i.id}>
                      <span>
                        {i.email || "Editor invitation"}
                        <small>
                          Expires {new Date(i.expires_at).toLocaleDateString()}
                        </small>
                      </span>
                      <button
                        className="fs-link"
                        onClick={async () => {
                          if (confirm("Revoke this pending invitation?"))
                            try {
                              await onMutate("revokeInvite", { id: i.id });
                              setSaved("Invitation revoked.");
                            } catch (e) {
                              setError((e as Error).message);
                            }
                        }}
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="fs-muted fs-space">
                Founder is a review designation, separate from access role.
                Membership changes retain attribution and must keep at least one
                owner.
              </p>
            </Card>
            <Card>
              <h2>Founder review policy</h2>
              <p className="fs-space">
                All assigned founders must explicitly approve the exact version
                by default.
              </p>
              <p className="fs-inline-note">
                Ratings inform decisions. They do not approve a design.
              </p>
              <button
                className="fs-button secondary"
                onClick={() =>
                  onNavigate(`/w/${workspaceId}/settings/review-rules`)
                }
              >
                Review rules
              </button>
            </Card>
          </div>
          <div className="fs-right-column">
            <Card>
              <h2>Connected services</h2>
              {[
                [
                  "Supabase",
                  demo ? "Demo workspace" : "Connected to Fairway Studio",
                  Box,
                ],
                [
                  "Pinterest",
                  "Pin links supported · account not connected",
                  LinkIcon,
                ],
                [
                  "AI image provider",
                  "Server configuration checked on request",
                  Sparkles,
                ],
              ].map(([label, status, Icon]: any) => (
                <button
                  key={label}
                  className="fs-action-row"
                  onClick={() =>
                    onNavigate(`/w/${workspaceId}/settings/integrations`)
                  }
                >
                  <Icon size={28} />
                  <span>
                    <strong>{label}</strong>
                    <small>{status}</small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))}
            </Card>
            <Card>
              <h2>Workspace identity</h2>
              <div className="fs-workspace-preview">
                <Flag size={38} />
                <h3>{data.workspace.name}</h3>
                <p>{data.workspace.timezone || "Timezone not set"}</p>
              </div>
              <button
                className="fs-button secondary"
                onClick={() =>
                  onNavigate(`/w/${workspaceId}/settings/workspace`)
                }
              >
                Edit workspace
              </button>
            </Card>
          </div>
          <Card className="fs-device-summary">
            <div>
              <h2>Fairway Studio on your devices</h2>
              <p className="fs-muted fs-space">
                Take your work with you. Use Fairway Studio on desktop, tablet,
                and mobile.
              </p>
              <div className="fs-device-labels">
                <span>
                  Desktop<small>Best for design and review</small>
                </span>
                <span>
                  Tablet<small>Great for presentations</small>
                </span>
                <span>
                  Phone<small>Stay in sync on the go</small>
                </span>
              </div>
            </div>
            <button
              className="fs-button"
              onClick={() => onNavigate(`/w/${workspaceId}/settings/devices`)}
            >
              <Download size={18} />
              Install app
            </button>
          </Card>
        </div>
      )}
      {section === "workspace" && (
        <Card>
          <h2>Workspace identity</h2>
          <form onSubmit={save} className="fs-settings-form">
            <label>
              Workspace name
              <input
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!owner}
              />
            </label>
            <label>
              Timezone
              <input
                required
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                disabled={!owner}
                placeholder="America/Los_Angeles"
              />
            </label>
            <button className="fs-button" disabled={!owner}>
              Save settings
            </button>
          </form>
        </Card>
      )}
      {section === "review-rules" && (
        <Card>
          <h2>Rules for future review rounds</h2>
          <form
            className="fs-settings-form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await onMutate("updateReviewPolicy", {
                  policy,
                  threshold,
                  ...{ expected_revision: data.workspace.revision || 0 },
                });
                setSaved(
                  "Default policy saved. Open rounds retain their original policy.",
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <label>
              Approval policy
              <select
                value={policy}
                onChange={(e) => setPolicy(e.target.value)}
                disabled={!owner}
              >
                <option value="unanimous">
                  All assigned founders must approve
                </option>
                <option value="threshold">Approval threshold</option>
              </select>
            </label>
            {policy === "threshold" && (
              <label>
                Required approvals
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, data.members.length)}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                />
              </label>
            )}
            <p className="fs-inline-note">
              Every assigned reviewer must respond. Any request for changes
              blocks a decision. Abstentions can meet a threshold policy only
              when enough other reviewers approve.
            </p>
            <button className="fs-button" disabled={!owner}>
              Save future review policy
            </button>
          </form>
        </Card>
      )}
      {section === "integrations" && (
        <Card>
          <h2>Connected services</h2>
          {[
            [
              "Supabase",
              demo ? "Demo · not connected" : `Expected project ${EXPECTED}`,
            ],
            [
              "Collaboration schema",
              demo
                ? "Simulated in memory"
                : data.capabilities?.collaboration
                  ? "Available"
                  : "Additive migration required",
            ],
            ["AI text provider", "Server configuration checked when requested"],
            [
              "Image generation",
              "Provider and recovery configuration checked when you open generation",
            ],
            ["Pinterest", "Pin links supported · account import not connected"],
            [
              "Live sessions",
              "Use an existing room link or configure a provider",
            ],
          ].map(([name, status]) => (
            <div className="fs-integration" key={name}>
              <Box size={25} />
              <div>
                <strong>{name}</strong>
                <p>{status}</p>
              </div>
              <span className="fs-badge">
                {name === "Supabase" && !demo ? "Configured" : "Details"}
              </span>
            </div>
          ))}
          {data.rooms.map((r: any) => (
            <div className="fs-action-row" key={r.id}>
              <Video />
              <span>{r.title}</span>
              {r.meeting_url && (
                <a
                  href={r.meeting_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="fs-link"
                >
                  Open room <ExternalLink size={15} />
                </a>
              )}
            </div>
          ))}
        </Card>
      )}
      {section === "notifications" && (
        <Card>
          <h2>In-app notification preferences</h2>
          <p className="fs-space">
            Choose which events appear in your studio notification feed. Your
            underlying tasks and assigned reviews remain accessible.
          </p>
          <form
            className="fs-settings-form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await onMutate("updateNotificationPreferences", {
                  expected_revision:
                    data.notificationPreferences?.revision || 0,
                  events,
                });
                setSaved(
                  "In-app preferences saved for your account and workspace.",
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {Object.entries({
              mentions: "Mentions and replies",
              assignments: "Assigned tasks",
              reviews: "Review requests",
              decisions: "Recorded decisions",
              sessions: "Work sessions",
              generations: "Generation completed",
            }).map(([key, label]) => (
              <label
                key={key}
                className="!flex-row items-center justify-between rounded-lg border p-3"
              >
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={events[key] !== false}
                  onChange={(e) =>
                    setEvents({ ...events, [key]: e.target.checked })
                  }
                />
              </label>
            ))}
            {data.workflowError && (
              <p role="alert" className="fs-alert error">
                {data.workflowError}
              </p>
            )}
            <button className="fs-button">Save notification preferences</button>
          </form>
          <p className="fs-inline-note">
            Email and push delivery require a configured provider. These
            controls change in-app preferences only.
          </p>
        </Card>
      )}
      {section === "devices" && (
        <Card>
          <h2>Fairway Studio on your devices</h2>
          <p className="fs-muted fs-space">
            Install support depends on your browser. Device drafts are isolated
            by account and workspace.
          </p>
          <PwaControls
            scope={{ accountId: userId, workspaceId }}
            syncAdapter={demo ? undefined : createIdeaDraftSyncAdapter()}
            manageInstallation={false}
            beforeUpdate={async () =>
              confirm(
                "Refresh only after saving or exporting open edits. Refresh now?",
              )
            }
          />
        </Card>
      )}
      {selectedMember && (
        <Dialog
          title={`Manage ${selectedMember.display_name || "member"}`}
          onClose={() => setSelectedMember(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await onMutate("updateMember", {
                  user_id: selectedMember.user_id,
                  role: selectedMember.role,
                  is_founder: !!selectedMember.is_founder,
                });
                setSelectedMember(null);
                setSaved(
                  "Membership updated. Existing review rounds retain their reviewer assignments.",
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <label>
              Access role
              <select
                value={selectedMember.role}
                onChange={(e) =>
                  setSelectedMember({ ...selectedMember, role: e.target.value })
                }
              >
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={!!selectedMember.is_founder}
                onChange={(e) =>
                  setSelectedMember({
                    ...selectedMember,
                    is_founder: e.target.checked,
                  })
                }
              />
              Founder / reviewer designation
            </label>
            <p className="fs-muted">
              These changes affect future access. The last owner is protected.
            </p>
            <button className="fs-button">Save membership</button>
            <button
              type="button"
              className="fs-button secondary"
              onClick={async () => {
                if (
                  !confirm(
                    "Remove this member’s workspace access? Their historical contributions will remain.",
                  )
                )
                  return;
                try {
                  await onMutate("removeMember", {
                    user_id: selectedMember.user_id,
                  });
                  setSelectedMember(null);
                  setSaved("Workspace membership removed.");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Remove from workspace
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}

function StudioAI({ data, demo, workspaceId, onClose, onboardingGuide, initialQuestion = "" }: any) {
  const [question, setQuestion] = useState(initialQuestion),
    [answer, setAnswer] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [usageAcknowledged, setUsageAcknowledged] = useState(false),
    [context, setContext] = useState(["ideas", "tasks", "messages", "reviews"]);
  useEffect(() => {
    if (initialQuestion) setQuestion(initialQuestion);
  }, [initialQuestion]);
  async function ask(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!usageAcknowledged) {
      setError("Review and acknowledge the usage notice before sending a request.");
      return;
    }
    if (demo) {
      setError(
        "AI is not connected in demo mode. Sign in to your configured workspace to use real context.",
      );
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/studio/guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, question, context }),
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error);
      setAnswer(result.answer);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fs-ai-overlay">
      <button
        className="fs-scrim"
        onClick={onClose}
        aria-label="Close Studio AI"
      />
      <aside className="fs-ai-panel">
        <header>
          <h2 className="fs-icon-title">
            <Sparkles />
            Creative Assistant
          </h2>
          <button
            className="fs-icon"
            onClick={onClose}
            aria-label="Close Studio AI"
          >
            <X size={20} />
          </button>
        </header>
        {onboardingGuide && <OnboardingGuide {...onboardingGuide} pageId="studioAI" />}
        <p>Draft briefs, names, creative directions, comparisons, feedback summaries, and task ideas from the context you choose.</p>
        <div className="fs-ai-model-note">
          <strong>Creative Assistant</strong>
          <small>GPT-5.4 mini · OpenAI</small>
          <span>Suggestions stay drafts. Review and edit before using them; the assistant never casts votes or publishes decisions.</span>
        </div>
        <div className="fs-context-chips">
          {context.map((c) => (
            <button
              key={c}
              onClick={() => setContext(context.filter((x) => x !== c))}
            >
              {c}
              <X size={13} />
            </button>
          ))}
          <button
            onClick={() =>
              setContext(["ideas", "tasks", "messages", "reviews"])
            }
          >
            Reset context
          </button>
        </div>
        <p className="fs-muted">
          Only these selected context categories are sent. Results are
          proposals, never votes or published decisions.
        </p>
        {[
          "Summarize feedback and cite the source IDs.",
          "Compare our open directions.",
          "What is the next question we should answer?",
        ].map((q) => (
          <button
            className="fs-action-row"
            key={q}
            onClick={() => setQuestion(q)}
          >
            <Sparkles size={17} />
            {q}
          </button>
        ))}
        <form onSubmit={ask}>
          <label>
            Your instruction
            <textarea
              rows={5}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={1200}
              required
            />
          </label>
          <label className="fs-ai-usage-consent">
            <input
              type="checkbox"
              checked={usageAcknowledged}
              onChange={(event) => setUsageAcknowledged(event.target.checked)}
            />
            <span>Provider usage may incur charges. No price is estimated here; I will review the draft before using it.</span>
          </label>
          <button className="fs-button" disabled={busy || !usageAcknowledged}>
            {busy ? "Thinking…" : "Ask Creative Assistant"}
            <ArrowRight size={16} />
          </button>
        </form>
        {error && (
          <p role="alert" className="fs-alert error">
            {error}
          </p>
        )}
        {answer && (
          <div className="fs-ai-answer">
            <span className="fs-badge">Draft suggestion</span>
            <p>{answer}</p>
          </div>
        )}
        <button
          className="fs-button secondary fs-space"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("fairway-generation", { detail: {} }),
            );
            onClose();
          }}
        >
          Open Image Studio <Sparkles size={17} />
        </button>
        <p className="fs-inline-note">
          Image jobs preserve your source and require server-side provider
          configuration.
        </p>
      </aside>
    </div>
  );
}

function QuickComposer({
  kind,
  initial = {},
  data,
  workspaceId,
  demo,
  mutate,
  onClose,
  onSaved,
}: any) {
  const [title, setTitle] = useState(String(initial.title || "")),
    [body, setBody] = useState(String(initial.body || "")),
    [category, setCategory] = useState(String(initial.category || "general")),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [invite, setInvite] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (kind === "Invite") {
        if (demo)
          throw Error("Invitations are unavailable in the isolated demo.");
        const r = await createClient().rpc("create_workspace_invite", {
          p_workspace_id: workspaceId,
        });
        if (r.error)
          throw Error(
            "Only an authorized workspace administrator can create an invitation.",
          );
        const url = new URL("/", location.origin);
        url.searchParams.set("invite", r.data);
        setInvite(url.toString());
        return;
      }
      const op =
        kind === "Task"
          ? "createTask"
          : kind === "Project"
            ? "createProject"
            : kind === "Conversation"
              ? "createThread"
              : "createIdea";
      const input: Record<string, unknown> = {
        title: title.trim(),
        ...(op === "createTask"
          ? { details: body, category: "General" }
          : op === "createProject"
            ? { brief: body, category }
            : op === "createThread"
              ? {}
              : { body, category: kind === "Note" ? "Note" : category }),
      };
      const result = await mutate(op, input);
      const destination =
        kind === "Task"
          ? "tasks"
          : kind === "Project"
            ? `projects/${result.id}/overview`
            : kind === "Conversation"
              ? `conversations/${result.id}`
              : "ideas";
      onSaved(`/w/${workspaceId}/${destination}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={
        kind === "Invite"
          ? "Create an invitation link"
          : `New ${kind.toLowerCase()}`
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <p className="fs-muted">Destination: {data.workspace.name}</p>
        {kind === "Invite" ? (
          <p>
            Creates a workspace editor invitation using your existing invitation
            flow. Share the link only with the intended teammate. No email is
            sent automatically.
          </p>
        ) : (
          <>
            <label>
              Title
              <input
                autoFocus
                required
                maxLength={240}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            {(kind === "Project" || kind === "Idea") && (
              <label>
                {kind === "Project" ? "Project type" : "Idea category"}
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {[
                    ["brand_identity", "Brand identity"],
                    ["product", "Product"],
                    ["apparel", "Apparel"],
                    ["campaign", "Campaign"],
                    ["general", "General"],
                  ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            )}
            {kind !== "Conversation" && (
              <label>
                {kind === "Project" ? "Objective" : "Details"}
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                />
              </label>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="fs-alert error">
            {error}
          </p>
        )}
        {invite ? (
          <label>
            Invitation link
            <input readOnly value={invite} onFocus={(e) => e.target.select()} />
          </label>
        ) : (
          <button className="fs-button" disabled={busy}>
            {busy
              ? "Saving…"
              : kind === "Invite"
                ? "Create invitation link"
                : "Save"}
          </button>
        )}
      </form>
    </Dialog>
  );
}
