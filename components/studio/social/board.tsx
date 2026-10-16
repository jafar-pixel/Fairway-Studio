"use client";
import { useEffect, useRef, useState } from "react";
import type { SocialList } from "../../../lib/studio/social/contracts";
import type { ContentView } from "../../../lib/studio/workflows/routes";
import {
  asSocialError,
  readAllSocialPosts,
  readSocialProjects,
  SocialApiError,
  type SocialProject,
} from "../../../lib/studio/social/client";
import { SocialCalendar } from "./calendar";
import { SocialContentDetail } from "./detail";
import { SocialEditor } from "./editor";
import { MediaPreview } from "./media-preview";
import {
  Badge,
  dateLabel,
  Empty,
  ErrorState,
  mayLeave,
  memberName,
  MutationFeedback,
  stateLabel,
  useLeaveWarning,
  useSocialMutation,
  useSocialNavigationState,
  type SocialNavigationState,
} from "./ui";
import styles from "./social.module.css";
export type SocialBoardProps = {
  workspaceId: string;
  externalNavigationGuard?: boolean;
  initialView?: ContentView;
  initialPostId?: string;
  onRouteChange?: (view: ContentView, postId: string | null) => boolean;
  onOpenTask?: (id: string) => void;
  onOpenProject?: (id: string) => void;
  onOpenFile?: (id: string) => void;
  onChanged?: () => void;
  onNavigationStateChange?: (state: SocialNavigationState) => void;
};
export function SocialBoard(props: SocialBoardProps) {
  return <SocialWorkspace key={props.workspaceId} {...props} />;
}
export default SocialBoard;
const tabs: { value: ContentView; title: string }[] = [
  { value: "overview", title: "Overview" },
  { value: "board", title: "Content Library" },
  { value: "campaigns", title: "Campaigns" },
  { value: "calendar", title: "Calendar" },
  { value: "review", title: "Founder Review" },
  { value: "feedback", title: "Results & Feedback" },
  { value: "connections", title: "Connections" },
];
function SocialWorkspace({
  workspaceId,
  externalNavigationGuard,
  initialView = "overview",
  initialPostId,
  onRouteChange,
  onOpenTask,
  onOpenProject,
  onOpenFile,
  onChanged,
  onNavigationStateChange,
}: SocialBoardProps) {
  const [data, setData] = useState<SocialList | null>(null),
    [projects, setProjects] = useState<SocialProject[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<SocialApiError | null>(null),
    [view, setView] = useState<ContentView>(initialView),
    [refresh, setRefresh] = useState(0),
    [selected, setSelected] = useState<string | null>(initialPostId || null),
    [creating, setCreating] = useState(false),
    [dirty, setDirty] = useState(false),
    [detailNavigation, setDetailNavigation] = useState<SocialNavigationState>({
      dirty: false,
      pending: false,
      uncertain: false,
    });
  const [query, setQuery] = useState(""),
    [channel, setChannel] = useState("all"),
    [state, setState] = useState("all"),
    [project, setProject] = useState("all"),
    [page, setPage] = useState(0),
    [initialProject, setInitialProject] = useState(""),
    [newCampaign, setNewCampaign] = useState(false);
  const changedRef = useRef(onChanged);
  useEffect(() => {
    changedRef.current = onChanged;
  }, [onChanged]);
  function changed() {
    setLoading(true);
    setRefresh((v) => v + 1);
    changedRef.current?.();
  }
  const mutation = useSocialMutation(workspaceId, changed),
    disabled = loading || Boolean(error) || mutation.blocked,
    formOpen = creating || newCampaign;
  useSocialNavigationState(
    selected
      ? detailNavigation
      : {
          dirty,
          pending: mutation.busy,
          uncertain: Boolean(mutation.error?.uncertain),
        },
    onNavigationStateChange,
  );
  useLeaveWarning(
    !externalNavigationGuard &&
      !selected &&
      (dirty || mutation.busy || Boolean(mutation.error?.uncertain)),
  );
  const lastRoute = useRef(
    JSON.stringify([initialView, initialPostId || null]),
  );
  useEffect(() => {
    const next = JSON.stringify([view, selected]);
    if (
      next !== lastRoute.current &&
      !mutation.busy &&
      !mutation.error?.uncertain &&
      !detailNavigation.pending &&
      !detailNavigation.uncertain
    ) {
      if (!onRouteChange || onRouteChange(view, selected))
        lastRoute.current = next;
    }
  }, [
    view,
    selected,
    mutation.busy,
    mutation.error?.uncertain,
    detailNavigation.pending,
    detailNavigation.uncertain,
    onRouteChange,
  ]);
  // Load all pages before showing workspace totals, review queues or calendar dates.
  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void Promise.all([
      readAllSocialPosts(workspaceId, controller.signal),
      readSocialProjects(workspaceId, controller.signal),
    ])
      .then(([list, items]) => {
        if (!controller.signal.aborted) {
          setData(list);
          setProjects(items);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          const issue = asSocialError(cause);
          setError(issue);
          if (issue.unavailable) {
            setData(null);
            setProjects([]);
          }
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [workspaceId, refresh]);
  function closeCreate() {
    if (mayLeave(dirty, mutation.blocked)) {
      setDirty(false);
      setCreating(false);
      setNewCampaign(false);
    }
  }
  function navigate(next: ContentView) {
    if (!mayLeave(dirty, mutation.blocked)) return;
    setDirty(false);
    setCreating(false);
    setNewCampaign(false);
    setView(next);
    setPage(0);
    setQuery("");
    setChannel("all");
    setState("all");
    setProject("all");
  }
  function create(projectId = "") {
    setInitialProject(projectId);
    setCreating(true);
    setDirty(false);
  }
  if (!workspaceId)
    return (
      <section className={styles.root}>
        <Empty title="Choose a connected workspace">
          Sign in and select a workspace to plan and review real social content.
        </Empty>
      </section>
    );
  if (selected && data)
    return (
      <section className={styles.root}>
        <SocialContentDetail
          externalNavigationGuard={externalNavigationGuard}
          key={selected}
          workspaceId={workspaceId}
          postId={selected}
          members={data.members}
          actorId={data.actorId}
          onBack={() => {
            setSelected(null);
            setDetailNavigation({
              dirty: false,
              pending: false,
              uncertain: false,
            });
          }}
          onChanged={changed}
          onOpenTask={onOpenTask}
          onOpenProject={onOpenProject}
          onOpenFile={onOpenFile}
          onNavigationStateChange={setDetailNavigation}
        />
      </section>
    );
  const posts = data?.posts || [],
    active = posts.filter((p) => p.state !== "archived"),
    pending = active.filter((p) => p.state === "in_review"),
    ready = active.filter((p) => p.state === "approved"),
    published = active.filter((p) => p.state === "posted");
  const visible = posts.filter(
    (p) =>
      (view !== "review" || p.state === "in_review") &&
      (view !== "feedback" || p.state === "posted") &&
      (state === "all" ||
        (state === "working"
          ? ["idea", "draft"].includes(p.state)
          : p.state === state)) &&
      (channel === "all" || p.channel === channel) &&
      (project === "all" || p.project_id === project) &&
      `${p.title} ${p.caption} ${p.account_label}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / 24)),
    safePage = Math.min(page, pageCount - 1);
  const showLibrary = ["board", "review", "feedback"].includes(view);
  return (
    <section className={styles.root} aria-label="Social Studio">
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Fairway Studio / Content</p>
          <h1>Your designs. Your story.</h1>
          <p>Turn the work you make together into something worth sharing.</p>
        </div>
        <button
          className={styles.heroButton}
          disabled={disabled || formOpen || !data}
          onClick={() => create()}
        >
          + Create content
        </button>
      </header>
      <nav className={styles.tabs} aria-label="Social Studio views">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            className={styles.tab}
            aria-pressed={view === tab.value}
            disabled={mutation.blocked}
            onClick={() => navigate(tab.value)}
          >
            {tab.title}
            {tab.value === "review" && pending.length
              ? ` (${pending.length})`
              : ""}
          </button>
        ))}
      </nav>
      <MutationFeedback
        mutation={mutation}
        onRefresh={() => setRefresh((v) => v + 1)}
      />
      {error ? (
        <ErrorState error={error} retry={() => setRefresh((v) => v + 1)} />
      ) : null}
      {loading ? (
        <p className={styles.muted} role="status">
          Loading saved Social Studio content…
        </p>
      ) : null}
      {creating && data ? (
        <section className={styles.panel}>
          <SocialEditor
            initialProjectId={initialProject}
            workspaceId={workspaceId}
            members={data.members}
            actorId={data.actorId}
            disabled={disabled}
            onDirty={setDirty}
            onCancel={closeCreate}
            onSave={(input) =>
              mutation.mutate(
                "saveDraft",
                input,
                "Content draft saved.",
                (result) => {
                  setCreating(false);
                  setDirty(false);
                  setSelected(result.postId);
                },
              )
            }
          />
        </section>
      ) : null}
      {newCampaign && data ? (
        <form
          className={`${styles.panel} ${styles.form}`}
          onChange={() => setDirty(true)}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            mutation.mutate(
              "createCampaign",
              {
                title: f.get("title"),
                purpose: f.get("purpose"),
                owner_id: f.get("owner"),
              },
              "Campaign project created.",
              () => {
                setNewCampaign(false);
                setDirty(false);
              },
            );
          }}
        >
          <h2>Create a campaign</h2>
          <p className={styles.muted}>
            A campaign is a real project: one home for its objective, designs
            and social content. You can also build stories around an existing
            product project.
          </p>
          <fieldset disabled={disabled}>
            <label className={styles.field}>
              Campaign name
              <input name="title" required maxLength={200} />
            </label>
            <label className={styles.field}>
              Objective
              <textarea name="purpose" required maxLength={2000} />
            </label>
            <label className={styles.field}>
              Campaign owner
              <select name="owner" defaultValue={data.actorId}>
                {data.members.map((m) => (
                  <option value={m.id} key={m.id}>
                    {memberName(data.members, m.id)}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.row}>
              <button className={styles.primary}>Save campaign</button>
              <button
                type="button"
                className={styles.button}
                onClick={closeCreate}
              >
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      ) : null}
      {data && !error && !loading && !formOpen ? (
        <>
          {view === "overview" ? (
            <>
              <div className={styles.stats}>
                {[
                  {
                    name: "Working ideas & drafts",
                    count: active.filter((p) =>
                      ["idea", "draft"].includes(p.state),
                    ).length,
                    view: "board",
                  },
                  {
                    name: "Waiting for review",
                    count: pending.length,
                    view: "review",
                  },
                  {
                    name: "Approved packages",
                    count: ready.length,
                    view: "board",
                  },
                  {
                    name: "Manually posted",
                    count: published.length,
                    view: "feedback",
                  },
                ].map((item) => (
                  <button
                    className={styles.stat}
                    key={item.name}
                    onClick={() => {
                      navigate(item.view as ContentView);
                      if (item.name === "Approved packages")
                        setState("approved");
                      if (item.name === "Working ideas & drafts")
                        setState("working");
                    }}
                  >
                    <strong>{item.count}</strong>
                    {item.name}
                  </button>
                ))}
              </div>
              <div className={styles.split}>
                <section className={styles.panel}>
                  <p className={styles.eyebrow}>Start with your own idea</p>
                  <h2>From a design to a conversation</h2>
                  <p className={styles.muted}>
                    Choose saved media, describe the story, and work with AI on
                    a caption. Nothing is approved or posted until the team
                    takes the next step.
                  </p>
                  <button className={styles.primary} onClick={() => create()}>
                    Create a draft
                  </button>
                </section>
                <section className={styles.panel}>
                  <p className={styles.eyebrow}>Up next</p>
                  <h2>
                    {pending.length
                      ? "The team has work to review"
                      : "Make room for the next story"}
                  </h2>
                  <p className={styles.muted}>
                    {pending.length
                      ? `${pending.length} content package${pending.length === 1 ? " is" : "s are"} awaiting named reviewer decisions.`
                      : "Add a planned date to a draft to put it on the calendar. A planned date does not publish a post."}
                  </p>
                  <button
                    className={styles.button}
                    onClick={() =>
                      navigate(pending.length ? "review" : "calendar")
                    }
                  >
                    {pending.length ? "Open founder review" : "Open calendar"}
                  </button>
                </section>
              </div>
              <h2>Recently updated</h2>
              <div className={styles.grid}>
                {[...active]
                  .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
                  .slice(0, 3)
                  .map((post) => (
                    <button
                      className={styles.cardButton}
                      key={post.id}
                      onClick={() => setSelected(post.id)}
                    >
                      <MediaPreview
                        versionId={post.source_version_id}
                        title={post.title}
                      />
                      <Badge tone={post.state}>{stateLabel(post.state)}</Badge>
                      <h3>{post.title}</h3>
                      <p className={styles.muted}>
                        {post.channel} · {post.account_label}
                      </p>
                    </button>
                  ))}
              </div>
              {!active.length ? (
                <Empty title="Your Social Studio is ready">
                  Start with an idea, a saved design or a campaign. Your content
                  will appear here after you save it.
                </Empty>
              ) : null}
            </>
          ) : null}
          {view === "campaigns" ? (
            <>
              <div className={styles.header}>
                <div>
                  <h2>Campaigns & project stories</h2>
                  <p className={styles.muted}>
                    Campaign projects and product projects with linked social
                    drafts. Each keeps its existing design history.
                  </p>
                </div>
                <button
                  className={styles.primary}
                  onClick={() => {
                    setNewCampaign(true);
                    setDirty(false);
                  }}
                >
                  + New campaign
                </button>
              </div>
              <div className={styles.grid}>
                {projects
                  .filter(
                    (p) =>
                      p.category === "campaign" ||
                      posts.some((post) => post.project_id === p.id),
                  )
                  .map((item) => {
                    const linked = posts.filter(
                      (p) => p.project_id === item.id && p.state !== "archived",
                    );
                    return (
                      <section className={styles.panel} key={item.id}>
                        <Badge>
                          {item.category === "campaign"
                            ? "Campaign"
                            : "Project story"}
                        </Badge>
                        <h2 style={{ marginTop: 12 }}>{item.title}</h2>
                        <p className={styles.muted}>
                          {item.brief || "No objective recorded."}
                        </p>
                        <p className={styles.small}>
                          {linked.length} posts ·{" "}
                          {linked.filter((p) => p.state === "in_review").length}{" "}
                          in review ·{" "}
                          {linked.filter((p) => p.state === "posted").length}{" "}
                          manually posted
                        </p>
                        <div className={styles.row}>
                          <button
                            className={styles.primary}
                            onClick={() => create(item.id)}
                          >
                            Create content
                          </button>
                          <button
                            className={styles.button}
                            onClick={() => {
                              navigate("board");
                              setProject(item.id);
                            }}
                          >
                            View content
                          </button>
                          {onOpenProject ? (
                            <button
                              className={styles.button}
                              onClick={() => onOpenProject(item.id)}
                            >
                              Open project
                            </button>
                          ) : null}
                        </div>
                      </section>
                    );
                  })}
              </div>
              {!projects.some(
                (p) =>
                  p.category === "campaign" ||
                  posts.some((post) => post.project_id === p.id),
              ) ? (
                <Empty title="Give the next launch a home">
                  Create your own campaign, or link a content draft to an
                  existing project.
                </Empty>
              ) : null}
            </>
          ) : null}
          {view === "calendar" ? (
            <SocialCalendar
              posts={posts}
              disabled={disabled}
              onOpen={setSelected}
            />
          ) : null}
          {showLibrary ? (
            <>
              <div className={styles.header}>
                <div>
                  <h2>
                    {view === "review"
                      ? "Founder Review"
                      : view === "feedback"
                        ? "Results & Feedback"
                        : "Content Library"}
                  </h2>
                  <p className={styles.muted}>
                    {view === "review"
                      ? "Open an exact package to read the caption, inspect the media and leave your decision. Named reviewers approve independently."
                      : view === "feedback"
                        ? "Open a manually posted item to record real metrics, observations and follow-up tasks."
                        : "Your original ideas and saved drafts, across every campaign and channel."}
                  </p>
                </div>
                <button
                  className={styles.button}
                  onClick={() => setRefresh((v) => v + 1)}
                >
                  Refresh
                </button>
              </div>
              <div className={styles.filters}>
                <label className={styles.field}>
                  Search
                  <input
                    type="search"
                    value={query}
                    placeholder="Title, caption or account"
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(0);
                    }}
                  />
                </label>
                <label className={styles.field}>
                  Channel
                  <select
                    value={channel}
                    onChange={(e) => {
                      setChannel(e.target.value);
                      setPage(0);
                    }}
                  >
                    <option value="all">All channels</option>
                    {[
                      "instagram",
                      "tiktok",
                      "linkedin",
                      "youtube",
                      "pinterest",
                      "other",
                    ].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                {view === "board" ? (
                  <label className={styles.field}>
                    Status
                    <select
                      value={state}
                      onChange={(e) => {
                        setState(e.target.value);
                        setPage(0);
                      }}
                    >
                      <option value="all">All statuses</option>
                      <option value="working">Ideas & drafts</option>
                      {[
                        "idea",
                        "draft",
                        "in_review",
                        "approved",
                        "posted",
                        "archived",
                      ].map((s) => (
                        <option value={s} key={s}>
                          {stateLabel(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className={styles.field}>
                  Campaign / project
                  <select
                    value={project}
                    onChange={(e) => {
                      setProject(e.target.value);
                      setPage(0);
                    }}
                  >
                    <option value="all">All projects</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className={styles.small}>{visible.length} matching records</p>
              {visible.length ? (
                <div className={styles.grid}>
                  {visible
                    .slice(safePage * 24, safePage * 24 + 24)
                    .map((post) => (
                      <button
                        className={styles.cardButton}
                        key={post.id}
                        onClick={() => setSelected(post.id)}
                      >
                        <MediaPreview
                          versionId={post.source_version_id}
                          title={post.title}
                        />
                        <div className={styles.row}>
                          <Badge tone={post.state}>
                            {stateLabel(post.state)}
                          </Badge>
                          <Badge>{post.channel}</Badge>
                        </div>
                        <h3 style={{ marginTop: 14 }}>{post.title}</h3>
                        <p className={styles.muted}>
                          {post.caption
                            ? `${post.caption.slice(0, 150)}${post.caption.length > 150 ? "…" : ""}`
                            : "No caption yet."}
                        </p>
                        <div className={styles.metadata}>
                          <span>{memberName(data.members, post.owner_id)}</span>
                          <span>
                            {dateLabel(post.planned_at, post.timezone)}
                          </span>
                        </div>
                      </button>
                    ))}
                </div>
              ) : (
                <Empty
                  title={
                    view === "review"
                      ? "No packages waiting for review"
                      : view === "feedback"
                        ? "No matching published records"
                        : "No matching content"
                  }
                >
                  {view === "review"
                    ? "Save a draft, then request publication review from its detail page."
                    : view === "feedback"
                      ? "Record the real post URL after publishing an approved package."
                      : "Create a draft or change your filters."}
                </Empty>
              )}
              <div className={styles.toolbar} style={{ marginTop: 22 }}>
                <button
                  className={styles.button}
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                >
                  Previous
                </button>
                <span className={styles.small}>
                  Page {safePage + 1} of {pageCount}
                </span>
                <button
                  className={styles.button}
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage(safePage + 1)}
                >
                  Next
                </button>
              </div>
            </>
          ) : null}
          {view === "connections" ? (
            <>
              <h2>Publishing connections</h2>
              <p className={styles.muted}>
                This release prepares approved packages for manual publishing.
                No social accounts are connected, and account labels on drafts
                are planning labels.
              </p>
              <div className={styles.grid}>
                {[
                  "Instagram",
                  "TikTok",
                  "LinkedIn",
                  "YouTube",
                  "Pinterest",
                ].map((name) => (
                  <section className={styles.panel} key={name}>
                    <h3>{name}</h3>
                    <Badge>Manual export available</Badge>
                    <p className={styles.muted} style={{ marginTop: 12 }}>
                      Create a draft, request review, then download its approved
                      media and caption. Post using your own {name} account and
                      record the real link here.
                    </p>
                    <button
                      className={styles.button}
                      onClick={() => {
                        navigate("board");
                        setChannel(name.toLowerCase());
                      }}
                    >
                      View {name} content
                    </button>
                  </section>
                ))}
              </div>
              <section className={styles.panel}>
                <h3>Pinterest inspiration and original Pins</h3>
                <p className={styles.muted}>
                  Use Library to save inspiration links with attribution. Create
                  original Pins here using your own cleared designs. Saved
                  inspiration is not permission to republish someone else’s
                  image.
                </p>
              </section>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
