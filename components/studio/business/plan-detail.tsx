"use client";

import { useEffect, useState } from "react";
import type { BusinessDetail } from "../../../lib/studio/business/contracts";
import { asBusinessError, readBusinessDetail, type BusinessApiError } from "../../../lib/studio/business/client";
import { PlanEditor } from "./plan-editor";
import { DocumentsSection, WorkSection } from "./links";
import { SwotSection } from "./swot";
import { SubmitReview, VersionHistory } from "./versions";
import { Badge, ErrorState, MutationFeedback, dateLabel, label, memberName, useBusinessMutation, useLeaveWarning, useBusinessNavigationState, type BusinessNavigationState, type Members } from "./ui";
import styles from "./business.module.css";

type Section = "brief" | "swot" | "work" | "documents" | "versions";
export function PlanDetail({ externalNavigationGuard, workspaceId, planId, members, userId, initialFinal, onBack, onChanged, onOpenTask, onOpenProject, onOpenFile, onNavigationStateChange }: { externalNavigationGuard?: boolean; workspaceId: string; planId: string; members: Members; userId: string; initialFinal: boolean; onBack: () => void; onChanged: () => void; onOpenTask?: (id: string) => void; onOpenProject?: (id: string) => void; onOpenFile?: (id: string) => void; onNavigationStateChange?: (state: BusinessNavigationState) => void }) {
  const [detail, setDetail] = useState<BusinessDetail | null>(null);
  const [error, setError] = useState<BusinessApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [section, setSection] = useState<Section>(initialFinal ? "versions" : "brief");
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [archive, setArchive] = useState(false);
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const mutation = useBusinessMutation(workspaceId, () => { setLoading(true); setRefresh(value => value + 1); onChanged(); });
  const disabled = mutation.blocked || loading || Boolean(error);
  useBusinessNavigationState({ dirty, pending: mutation.busy, uncertain: Boolean(mutation.error?.uncertain) }, onNavigationStateChange);
  useLeaveWarning(!externalNavigationGuard && (dirty || mutation.busy || Boolean(mutation.error?.uncertain)));
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    void readBusinessDetail(workspaceId, planId, controller.signal).then(result => { if (!controller.signal.aborted) setDetail(result); }).catch(cause => { if (!controller.signal.aborted) { const issue = asBusinessError(cause); setError(issue); if (issue.unavailable) setDetail(null); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId, planId, refresh]);
  function navigate(action: () => void) {
    if (mutation.blocked) return;
    if (dirty) setLeave(() => action); else action();
  }
  function changeSection(next: Section) { if (next !== section) navigate(() => { setSection(next); setEditing(false); setDirty(false); }); }
  const refreshSaved = () => { setLoading(true); setRefresh(value => value + 1); };
  return <div>
    <button className={styles.button} disabled={mutation.blocked} onClick={() => navigate(onBack)}>← Back to business</button>
    {leave ? <div className={styles.notice} role="alert"><p>You have unsaved inputs. Discard them and leave this section?</p><div className={styles.row}><button className={styles.danger} onClick={() => { const action = leave; setLeave(null); setDirty(false); action(); }}>Discard and continue</button><button className={styles.button} onClick={() => setLeave(null)}>Keep editing</button></div></div> : null}
    <MutationFeedback mutation={mutation} onRefresh={refreshSaved} />
    {error ? <ErrorState error={error} retry={refreshSaved} /> : null}
    {loading ? <p className={styles.muted} role="status">{detail ? "Refreshing saved plan…" : "Loading plan…"}</p> : null}
    {detail ? <><header className={styles.header} style={{ marginTop: 24 }}><div><p className={styles.eyebrow}>Business · {label(detail.plan.kind)}</p><h1>{detail.plan.title}</h1><div className={styles.row}><Badge tone={detail.plan.state}>{detail.plan.state === "approved" ? "Approved · working draft available" : label(detail.plan.state)}</Badge>{detail.plan.approved_version_id && detail.plan.state !== "approved" ? <Badge tone="approved">Previous final retained</Badge> : null}<span className={styles.small}>Saved revision {detail.plan.revision}</span></div></div><button className={styles.button} disabled={loading || mutation.busy} onClick={refreshSaved}>Refresh saved data</button></header>
      <nav className={styles.tabs} aria-label="Plan sections">{([["brief", "Brief & draft"], ["swot", "SWOT"], ["work", "Work & projects"], ["documents", "Documents"], ["versions", "Versions & review"]] as [Section, string][]).map(([value, title]) => <button key={value} className={styles.tab} aria-pressed={section === value} disabled={mutation.blocked} onClick={() => changeSection(value)}>{title}</button>)}</nav>
      {detail.plan.state === "archived" ? <p className={styles.notice}>This plan is archived. Its saved history and linked originals remain available.</p> : null}
      {section === "brief" ? <><section className={styles.panel}>{editing ? <PlanEditor plan={detail.plan} members={members} disabled={disabled} onDirty={setDirty} onCancel={() => { setEditing(false); setDirty(false); }} onSave={input => mutation.mutate("updatePlan", input, "Working draft saved. Any prior approved final is unchanged.", () => { setEditing(false); setDirty(false); })} /> : <><div className={styles.spread}><h2>Working draft</h2>{detail.plan.state !== "archived" ? <div className={styles.row}><button className={styles.primary} disabled={disabled} onClick={() => navigate(() => { setEditing(true); setDirty(false); })}>Edit draft</button>{detail.plan.kind !== "plan" ? <button className={styles.button} disabled={disabled} onClick={() => mutation.mutate("developPlan", { plan_id: detail.plan.id, expected_revision: detail.plan.revision }, "Developed into a plan. Its original identity and links are preserved.")}>Develop into a plan</button> : null}</div> : null}</div>{detail.plan.approved_version_id ? <p className={styles.notice}>This is the current working copy. View the approved snapshot in Versions & review.</p> : null}<h3>Brief</h3><p className={styles.prose}>{detail.plan.brief || "No brief yet."}</p><h3>Objective</h3><p className={styles.prose}>{detail.plan.objective || "No objective yet."}</p><h3>Notes</h3><p className={styles.prose}>{detail.plan.notes || "No notes yet."}</p><div className={styles.metadata}><span>Owner: {memberName(members, detail.plan.lead_id)}</span><span>Target: {dateLabel(detail.plan.target_date)}</span><span>Category: {detail.plan.category || "None"}</span><span>Updated: {dateLabel(detail.plan.updated_at, true)}</span></div>{detail.plan.tags.length ? <div className={styles.row} style={{ marginTop: 14 }}>{detail.plan.tags.map((tag, index) => <Badge key={`${tag}-${index}`}>{tag}</Badge>)}</div> : null}</>}</section>{!editing ? <SubmitReview onDirty={setDirty} detail={detail} members={members} mutation={mutation} disabled={disabled} /> : null}{detail.plan.state !== "archived" && !editing ? <section className={styles.panel}><h3>Archive plan</h3><p className={styles.muted}>Remove this item from active planning while retaining its history and existing records.</p>{archive ? <div className={styles.notice}><p>Archive “{detail.plan.title}”? Any open review will be withdrawn.</p><div className={styles.row}><button className={styles.danger} disabled={disabled} onClick={() => mutation.mutate("archivePlan", { plan_id: detail.plan.id, expected_revision: detail.plan.revision }, "Plan archived. History is retained.", () => setArchive(false))}>Confirm archive</button><button className={styles.button} disabled={disabled} onClick={() => setArchive(false)}>Cancel</button></div></div> : <button className={styles.button} disabled={disabled} onClick={() => navigate(() => { setArchive(true); setDirty(false); })}>Archive…</button>}</section> : null}</> : null}
      {section === "swot" ? <SwotSection detail={detail} members={members} mutation={mutation} disabled={disabled} onDirty={setDirty} onOpenTask={onOpenTask ? id => navigate(() => onOpenTask(id)) : undefined} /> : null}
      {section === "work" ? <WorkSection workspaceId={workspaceId} detail={detail} members={members} mutation={mutation} disabled={disabled} onDirty={setDirty} onOpenTask={onOpenTask ? id => navigate(() => onOpenTask(id)) : undefined} onOpenProject={onOpenProject ? id => navigate(() => onOpenProject(id)) : undefined} /> : null}
      {section === "documents" ? <DocumentsSection onOpenFile={onOpenFile ? id => navigate(() => onOpenFile(id)) : undefined} workspaceId={workspaceId} detail={detail} mutation={mutation} disabled={disabled} onDirty={setDirty} /> : null}
      {section === "versions" ? <VersionHistory onDirty={setDirty} onOpenFile={onOpenFile ? id => navigate(() => onOpenFile(id)) : undefined} detail={detail} members={members} userId={userId} mutation={mutation} disabled={disabled || detail.plan.state === "archived"} initialFinal={initialFinal} /> : null}
    </> : null}
  </div>;
}
