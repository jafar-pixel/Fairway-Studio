"use client";

import { useState } from "react";
import type { BusinessPlan } from "../../../lib/studio/business/contracts";
import { OwnerSelect, memberName, type Members } from "./ui";
import styles from "./business.module.css";

type Fields = { title: string; brief: string; kind: BusinessPlan["kind"]; notes: string; objective: string; owner: string; target: string; category: string; tags: string };
function fieldsFrom(plan?: BusinessPlan): Fields {
  return { title: plan?.title || "", brief: plan?.brief || "", kind: plan?.kind || "idea", notes: plan?.notes || "", objective: plan?.objective || "", owner: plan?.lead_id || "", target: plan?.target_date || "", category: plan?.category || "", tags: plan?.tags.join(", ") || "" };
}
export function PlanEditor({ plan, members, disabled, onSave, onCancel, onDirty }: { plan?: BusinessPlan; members: Members; disabled: boolean; onSave: (fields: Record<string, unknown>) => void; onCancel: () => void; onDirty?: (dirty: boolean) => void }) {
  const [fields, setFields] = useState(() => fieldsFrom(plan));
  const [baseRevision, setBaseRevision] = useState(plan?.revision);
  const [compare, setCompare] = useState(false);
  const stale = Boolean(plan && baseRevision !== plan.revision);
  const tags = fields.tags.split(",").map(tag => tag.trim()).filter(Boolean);
  const invalidTags = tags.length > 20 || tags.some(tag => tag.length > 60);
  function field<K extends keyof Fields>(key: K, value: Fields[K]) { setFields(previous => ({ ...previous, [key]: value })); onDirty?.(true); }
  return <form className={styles.form} onSubmit={event => { event.preventDefault(); if (disabled || stale || invalidTags) return; onSave({ title: fields.title.trim(), brief: fields.brief, ...(!plan ? { kind: fields.kind } : {}), notes: fields.notes, objective: fields.objective, owner_id: fields.owner || null, target_date: fields.target || null, category: fields.category.trim(), tags, ...(plan ? { plan_id: plan.id, expected_revision: baseRevision } : {}) }); }}>
    {plan?.approved_version_id ? <p className={styles.notice}>You are editing the working draft. The approved final stays unchanged until a newer version is explicitly approved.</p> : null}
    {plan?.state === "in_review" ? <p className={styles.notice}>Saving edits changes the draft and withdraws the open review. Submit the edited version for a new review.</p> : null}
    {stale && plan ? <section className={styles.notice}><h3>Newer saved revision available</h3><p>Your form is based on revision {baseRevision}. The server is on revision {plan.revision}. Your inputs have been kept.</p><button type="button" className={styles.button} onClick={() => setCompare(!compare)}>{compare ? "Hide" : "Compare with"} saved fields</button>{compare ? <div className={styles.stack}><dl><dt>Title</dt><dd className={styles.prose}>{plan.title}</dd><dt>Brief</dt><dd className={styles.prose}>{plan.brief || "Empty"}</dd><dt>Objective</dt><dd className={styles.prose}>{plan.objective || "Empty"}</dd><dt>Notes</dt><dd className={styles.prose}>{plan.notes || "Empty"}</dd><dt>Other fields</dt><dd>{plan.kind}; {memberName(members, plan.lead_id)}; {plan.target_date || "No date"}; {plan.category || "No category"}; {plan.tags.join(", ") || "No tags"}</dd></dl><div className={styles.row}><button type="button" className={styles.button} onClick={() => { setFields(fieldsFrom(plan)); setBaseRevision(plan.revision); onDirty?.(false); }}>Discard my edits and use saved fields</button><button type="button" className={styles.button} onClick={() => { setBaseRevision(plan.revision); setCompare(false); }}>Keep my fields for the next save</button></div><p>Keeping your fields will replace the saved fields when you choose Save draft.</p></div> : null}</section> : null}
    <fieldset disabled={disabled}>
      <label className={styles.field}>Title<input required maxLength={240} value={fields.title} onChange={event => field("title", event.target.value)} autoFocus /></label>
      <div className={styles.split}><label className={styles.field}>Type<select disabled={Boolean(plan)} value={fields.kind} onChange={event => field("kind", event.target.value as Fields["kind"])}><option value="idea">Idea</option><option value="draft">Draft</option><option value="plan">Plan</option></select></label><OwnerSelect members={members} value={fields.owner} onChange={value => field("owner", value)} /></div>
      <label className={styles.field}>Brief<textarea maxLength={4000} value={fields.brief} onChange={event => field("brief", event.target.value)} /></label>
      <label className={styles.field}>Objective<textarea maxLength={4000} value={fields.objective} onChange={event => field("objective", event.target.value)} /></label>
      <label className={styles.field}>Notes<textarea maxLength={20000} rows={5} value={fields.notes} onChange={event => field("notes", event.target.value)} /></label>
      <div className={styles.split}><label className={styles.field}>Target date<input type="date" value={fields.target} onChange={event => field("target", event.target.value)} /></label><label className={styles.field}>Category<input maxLength={100} value={fields.category} onChange={event => field("category", event.target.value)} /></label></div>
      <label className={styles.field}>Tags<input maxLength={1000} value={fields.tags} onChange={event => field("tags", event.target.value)} placeholder="Launch, operations, growth" /><small>Separate tags with commas. Up to 20 tags, 60 characters each.</small></label>
      {invalidTags ? <p className={styles.error} role="alert">Use at most 20 tags, each 60 characters or fewer.</p> : null}<div className={styles.row}><button className={styles.primary} type="submit" disabled={stale || invalidTags || !fields.title.trim()}>{plan ? "Save draft" : "Create"}</button><button className={styles.button} type="button" onClick={onCancel}>Cancel</button></div>
    </fieldset>
  </form>;
}
