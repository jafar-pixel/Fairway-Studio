"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BusinessList, BusinessMutation, BusinessOperation } from "../../../lib/studio/business/contracts";
import { asBusinessError, BusinessApiError, createBusinessRequest, sendBusinessRequest } from "../../../lib/studio/business/client";
import styles from "./business.module.css";

export type Members = BusinessList["members"];
export type BusinessNavigationState = { dirty: boolean; pending: boolean; uncertain: boolean };
/** Report real state to the shell; only actual unmount reports a reset. */
export function useBusinessNavigationState(
  state: BusinessNavigationState,
  onChange?: (state: BusinessNavigationState) => void,
) {
  const callback = useRef(onChange);
  useEffect(() => { callback.current = onChange; }, [onChange]);
  useEffect(() => {
    onChange?.({ dirty: state.dirty, pending: state.pending, uncertain: state.uncertain });
  }, [onChange, state.dirty, state.pending, state.uncertain]);
  useEffect(() => () => {
    callback.current?.({ dirty: false, pending: false, uncertain: false });
  }, []);
}
export const label = (value: string) => value.replaceAll("_", " ").replace(/^\w/, letter => letter.toUpperCase());
export function dateLabel(value: string | null | undefined, includeTime = false): string {
  if (!value) return "Not set";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return includeTime ? date.toLocaleString() : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
export function memberLabel(member: Members[number]): string {
  return member.display_name?.trim() || `Workspace member · …${member.user_id.slice(-8)}`;
}
export function memberName(members: Members, id: string | null): string {
  if (!id) return "Unassigned";
  const member = members.find(item => item.user_id === id);
  return member ? memberLabel(member) : `Former or unavailable member · …${id.slice(-8)}`;
}
export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  return <span className={styles.badge} data-tone={tone}>{children}</span>;
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className={styles.empty}><h3>{title}</h3><div className={styles.muted}>{children}</div></div>;
}
export function ErrorState({ error, retry }: { error: BusinessApiError; retry: () => void }) {
  return <section className={styles.error} role="alert"><h3>{error.unavailable ? "Business is not available for this workspace" : "Business could not load"}</h3><p>{error.message}</p>{error.unavailable ? <p>Sign in to a connected workspace with access. If this feature has not been set up, its database migration must be applied before you can use it.</p> : null}<button className={styles.button} onClick={retry}>Try again</button></section>;
}
export function OwnerSelect({ members, value, onChange, label: heading = "Owner", disabled = false }: { members: Members; value: string; onChange: (value: string) => void; label?: string; disabled?: boolean }) {
  return <label className={styles.field}>{heading}<select value={value} onChange={event => onChange(event.target.value)} disabled={disabled}><option value="">Unassigned</option>{value && !members.some(member => member.user_id === value) ? <option value={value}>{memberName(members, value)} (choose a current member)</option> : null}{members.map(member => <option key={member.user_id} value={member.user_id}>{memberLabel(member)}</option>)}</select></label>;
}

type PendingMutation = { request: BusinessMutation; message: string; onCommitted?: (result: unknown) => void };
export function useBusinessMutation(workspaceId: string, onCommitted: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<BusinessApiError | null>(null);
  const [failed, setFailed] = useState<PendingMutation | null>(null);
  const [success, setSuccess] = useState("");
  const inFlight = useRef(false);
  const pending = useRef<PendingMutation | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function execute(item: PendingMutation) {
    if (inFlight.current) return;
    inFlight.current = true;
    pending.current = item;
    setBusy(true);
    setSuccess("");
    setError(null);
    let result: unknown;
    try {
      result = await sendBusinessRequest(item.request);
    } catch (cause) {
      if (mounted.current) { setError(asBusinessError(cause)); setFailed(item); }
      inFlight.current = false;
      if (mounted.current) setBusy(false);
      return;
    }
    // A refresh failure must never turn a confirmed commit into another write.
    pending.current = null;
    inFlight.current = false;
    if (!mounted.current) return;
    setBusy(false);
    setFailed(null);
    setSuccess(item.message);
    item.onCommitted?.(result);
    onCommitted();
  }
  function mutate(operation: BusinessOperation, input: Record<string, unknown>, message: string, callback?: (result: unknown) => void) {
    if (inFlight.current || (failed && (error?.uncertain || error?.conflict))) return;
    let request: BusinessMutation;
    try { request = createBusinessRequest(workspaceId, operation, input); }
    catch { setError(new BusinessApiError("A secure request ID could not be created. Use a secure connection and try again.", "REQUEST_ID", 0)); return; }
    void execute({ request, message, onCommitted: callback });
  }
  function clear() {
    if (inFlight.current || error?.uncertain) return;
    pending.current = null;
    setFailed(null);
    setError(null);
  }
  function retry() { if (pending.current && !inFlight.current) void execute(pending.current); }
  return { mutate, retry, clear, busy, error, failed, success, blocked: busy || Boolean(error?.uncertain || error?.conflict) };
}
export type MutationController = ReturnType<typeof useBusinessMutation>;
export function MutationFeedback({ mutation, onRefresh }: { mutation: MutationController; onRefresh: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (mutation.error) ref.current?.focus(); }, [mutation.error]);
  if (mutation.busy) return <p className={styles.notice} role="status">Saving. Keep this page open until the result is confirmed.</p>;
  if (mutation.error) return <div ref={ref} tabIndex={-1} className={styles.error} role="alert"><p>{mutation.error.message}</p>{mutation.error.uncertain ? <p>To prevent duplicate changes, other edits are paused until this exact request is resolved. Your inputs are still here.</p> : null}{mutation.error.conflict ? <p>A saved revision changed. Refresh to compare it with your edits; nothing in your form will be overwritten.</p> : null}<div className={styles.row}>{mutation.failed && !mutation.error.conflict ? <button className={styles.button} onClick={mutation.retry}>Retry same request</button> : null}{mutation.error.conflict ? <button className={styles.button} onClick={() => { mutation.clear(); onRefresh(); }}>Refresh saved version</button> : null}{!mutation.error.uncertain && !mutation.error.conflict ? <button className={styles.button} onClick={mutation.clear}>Return to editing</button> : null}</div></div>;
  return mutation.success ? <p className={styles.success} role="status">{mutation.success}</p> : null;
}

/** Warn before a browser reload while only in-memory edits or an uncertain write remain. */
export function useLeaveWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const listener = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [active]);
}
