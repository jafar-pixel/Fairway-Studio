"use client";

import { useEffect, useRef, useState } from "react";
import type { BusinessList, BusinessPlan } from "../../../lib/studio/business/contracts";
import { asBusinessError, readBusinessList, type BusinessApiError, type BusinessView } from "../../../lib/studio/business/client";
import { PlanDetail } from "./plan-detail";
import { PlanEditor } from "./plan-editor";
import { Badge, Empty, ErrorState, MutationFeedback, dateLabel, label, memberName, useBusinessMutation, useLeaveWarning, useBusinessNavigationState, type BusinessNavigationState } from "./ui";
import styles from "./business.module.css";

export type BusinessBoardProps = { workspaceId: string; externalNavigationGuard?: boolean; initialPlanId?: string; onPlanRouteChange?: (id: string | null) => boolean; onBackToBoard?: () => void; onOpenTask?: (id: string) => void; onOpenProject?: (id: string) => void; onOpenFile?: (id: string) => void; onChanged?: () => void; onNavigationStateChange?: (state: BusinessNavigationState) => void };
export function BusinessBoard(props: BusinessBoardProps) {
  // A workspace switch must never display a prior workspace's data or replay its pending writes.
  return <BusinessWorkspace key={props.workspaceId} {...props} />;
}
export default BusinessBoard;
function BusinessWorkspace({ workspaceId, externalNavigationGuard, initialPlanId, onPlanRouteChange, onBackToBoard, onOpenTask, onOpenProject, onOpenFile, onChanged, onNavigationStateChange }: BusinessBoardProps) {
  const [data, setData] = useState<BusinessList | null>(null);
  const [error, setError] = useState<BusinessApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [view, setView] = useState<BusinessView>("all");
  const [overview, setOverview] = useState(true);
  const [loadedView, setLoadedView] = useState<BusinessView>("all");
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<string | null>(initialPlanId || null);
  const [creating, setCreating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [detailNavigation, setDetailNavigation] = useState<BusinessNavigationState>({ dirty: false, pending: false, uncertain: false });
  const changedRef = useRef(onChanged);
  useEffect(() => { changedRef.current = onChanged; }, [onChanged]);
  function changed() { setLoading(true); setRefresh(value => value + 1); changedRef.current?.(); }
  const mutation = useBusinessMutation(workspaceId, changed);
  const disabled = mutation.blocked || loading || Boolean(error);
  useBusinessNavigationState(selected ? detailNavigation : { dirty, pending: mutation.busy, uncertain: Boolean(mutation.error?.uncertain) }, onNavigationStateChange);
  useLeaveWarning(!externalNavigationGuard && (dirty || mutation.busy || Boolean(mutation.error?.uncertain)));
  const lastPlanRoute = useRef(initialPlanId || null);
  useEffect(() => { if (selected !== lastPlanRoute.current && !mutation.busy && !mutation.error?.uncertain && !detailNavigation.pending && !detailNavigation.uncertain) { if (!onPlanRouteChange || onPlanRouteChange(selected)) lastPlanRoute.current = selected; } }, [selected, mutation.busy, mutation.error?.uncertain, detailNavigation.pending, detailNavigation.uncertain, onPlanRouteChange]);
  useEffect(() => {
    if (!workspaceId) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError(null);
    void readBusinessList(workspaceId, page, view, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      const last = Math.max(1, Math.ceil(result.total / result.pageSize));
      if (page >= last) { setPage(last - 1); return; }
      setData(result); setLoadedView(view);
    }).catch(cause => { if (!controller.signal.aborted) { const issue = asBusinessError(cause); setError(issue); if (issue.unavailable) setData(null); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId, page, view, refresh]);
  function changeView(next: BusinessView, showOverview = false) { setView(next); setOverview(showOverview); setPage(0); }
  if (!workspaceId) return <section className={styles.root}><Empty title="Choose a connected workspace">Business plans become available after you sign in and select a workspace.</Empty></section>;
  if (selected && data) return <section className={styles.root}><PlanDetail externalNavigationGuard={externalNavigationGuard} onNavigationStateChange={setDetailNavigation} key={selected} workspaceId={workspaceId} planId={selected} members={data.members} userId={data.userId} initialFinal={view === "finals"} onBack={() => { setSelected(null); if (!onPlanRouteChange) onBackToBoard?.(); }} onChanged={changed} onOpenTask={onOpenTask} onOpenProject={onOpenProject} onOpenFile={onOpenFile} /></section>;
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return <section className={styles.root} aria-label="Business board"><header className={styles.header}><div><p className={styles.eyebrow}>Fairway Studio</p><h1>Business</h1><p className={styles.muted}>From a first idea to an approved plan, with the work connected.</p></div><div className={styles.row}><button className={styles.button} disabled={loading || mutation.busy} onClick={() => setRefresh(value => value + 1)}>Refresh</button><button className={styles.primary} disabled={disabled || creating || !data} onClick={() => { setCreating(true); setDirty(false); }}>New idea or plan</button></div></header>
    <MutationFeedback mutation={mutation} onRefresh={() => setRefresh(value => value + 1)} />
    {error ? <ErrorState error={error} retry={() => setRefresh(value => value + 1)} /> : null}
    {loading ? <p className={styles.muted} role="status">{data ? "Refreshing business records…" : "Loading business records…"}</p> : null}
    {creating && data ? <section className={styles.panel}><h2>Capture an idea, draft or plan</h2><p className={styles.muted}>Start light. You can develop it into a plan without copying the record.</p><PlanEditor members={data.members} disabled={disabled} onDirty={setDirty} onCancel={() => { setCreating(false); setDirty(false); }} onSave={input => mutation.mutate("createPlan", input, "Business record created.", result => { setCreating(false); setDirty(false); const plan = result && typeof result === "object" && "plan" in result ? (result as { plan: BusinessPlan }).plan : null; if (plan?.id) setSelected(plan.id); })} /></section> : null}
    <nav className={styles.tabs} aria-label="Business views">{[{ title: "Overview", value: "all", overview: true }, { title: "Drafts & plans", value: "all", overview: false }, { title: "Ideas & drafts", value: "ideas", overview: false }, { title: "Final plans", value: "finals", overview: false }].map(tab => <button key={tab.title} className={styles.tab} aria-pressed={view === tab.value && overview === tab.overview} disabled={mutation.blocked || creating} onClick={() => changeView(tab.value as BusinessView, tab.overview)}>{tab.title}</button>)}</nav>
    {data && data.page === page && loadedView === view ? <>{overview ? <><div className={styles.stats}>{[{ title: "Active records", value: data.overview.active }, { title: "Ideas & drafts", value: data.overview.ideas }, { title: "Awaiting review", value: data.overview.awaitingReview }, { title: "Approved finals", value: data.overview.finals }, { title: "Overdue plans", value: data.overview.overdue }, { title: "Blocked tasks", value: data.overview.blockedTasks }, { title: "Overdue tasks", value: data.overview.overdueTasks }].map(stat => <div className={styles.stat} key={stat.title}><strong>{stat.value}</strong><span className={styles.small}>{stat.title}</span></div>)}</div><p className={styles.muted}>Counts cover the authorized business records in this workspace. Linked task counts come from saved task states.</p></> : null}<div className={styles.header}><div><h2>{view === "finals" ? "Plans with approved finals" : view === "ideas" ? "Ideas & drafts to develop" : overview ? "Business records" : "Drafts, ideas & plans"}</h2><p className={styles.muted}>{view === "finals" ? "Open a plan to read its immutable current final, approvers and rationale. Card titles are the current working-draft titles." : "Open a record to manage the brief, SWOT, work, documents and version-specific review."}</p></div><span className={styles.small}>{data.total} record{data.total === 1 ? "" : "s"}</span></div>{data.plans.length ? <div className={styles.grid}>{data.plans.map(plan => <button className={styles.cardButton} key={plan.id} disabled={disabled || creating} onClick={() => setSelected(plan.id)} aria-label={`Open ${plan.title}`}><div className={styles.row} style={{ marginBottom: 14 }}><Badge>{label(plan.kind)}</Badge><Badge tone={plan.state}>{label(plan.state)}</Badge>{plan.approved_version_id ? <Badge tone="approved">Final available</Badge> : null}</div><h3>{plan.title}</h3><p className={styles.muted}>{plan.brief ? `${plan.brief.slice(0, 180)}${plan.brief.length > 180 ? "…" : ""}` : "No brief yet."}</p><div className={styles.metadata}><span>{memberName(data.members, plan.lead_id)}</span><span>Target {dateLabel(plan.target_date)}</span></div></button>)}</div> : <Empty title={view === "finals" ? "No approved final plans yet" : view === "ideas" ? "No ideas or drafts yet" : "Your business board starts here"}>{view === "finals" ? "A final appears only after every named reviewer explicitly approves a submitted version." : "Capture a real idea, draft or plan to begin. No sample business records are added."}</Empty>}<div className={styles.toolbar} style={{ marginTop: 22 }}><button className={styles.button} disabled={disabled || creating || page <= 0} onClick={() => setPage(value => value - 1)}>Previous</button><span className={styles.small}>Page {page + 1} of {pageCount}</span><button className={styles.button} disabled={disabled || creating || page >= pageCount - 1} onClick={() => setPage(value => value + 1)}>Next</button></div></> : null}
  </section>;
}
