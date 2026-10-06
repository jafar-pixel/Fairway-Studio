type RecordRow = Record<string, any>
/** Display-only gates; the server must independently validate every outcome. */
export function projectRoundActions(round: RecordRow, reviews: RecordRow[], role: string) {
 const assigned: string[] = [...new Set<string>(round.reviewers || round.reviewer_ids || round.required_reviewer_ids || [])]
 const submitted = reviews.filter(r => r.round_id === round.id && r.status !== 'draft' && r.state !== 'draft' && assigned.includes(r.reviewer_id))
 const allResponded = assigned.length > 0 && assigned.every(id => submitted.some(r => r.reviewer_id === id))
 const requestedChanges = submitted.some(r => r.disposition === 'request_changes')
 const approvals = assigned.filter(id => submitted.some(r => r.reviewer_id === id && r.disposition === 'approve')).length
 const policy = typeof round.policy === 'string' ? round.policy : round.policy?.mode || round.policy?.policy
 const threshold = policy === 'threshold' ? Number(round.threshold ?? round.policy?.threshold ?? assigned.length) : assigned.length
 const open = (round.status || round.state) === 'open'
 const permitted = ['owner','admin'].includes(role)
 return { assigned, submitted, approvals, allResponded, requestedChanges, threshold,
  approve: permitted && open && allResponded && !requestedChanges && Number.isInteger(threshold) && threshold > 0 && approvals >= threshold,
  reject: role === 'owner' && open && allResponded && requestedChanges,
  defer: role === 'owner' && open }
}
export function mergeProjectOutcomes(core: RecordRow[], workflow: RecordRow[], projectId: string, roundIds: string[]) {
 const merged = new Map<string, RecordRow>()
 for (const item of [...core,...workflow]) if (item.id && (item.project_id === projectId || roundIds.includes(item.round_id))) merged.set(item.id,{...merged.get(item.id),...item})
 return [...merged.values()].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')))
}
export function projectReplacementState(link: RecordRow, rounds: RecordRow[]) {
 if (link.replacement_decision_id) return 'completed'
 const round = rounds.find(r => r.id === link.round_id)
 if (!round) return 'unavailable'
 return (round.status || round.state) === 'closed' ? 'closed_without_approval' : 'open'
}
