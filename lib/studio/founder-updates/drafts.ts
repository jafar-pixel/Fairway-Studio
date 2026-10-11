import type { FounderUpdateMutation } from "./contracts";

/** Clear only the submitted text, preserving other drafts and edits typed in flight. */
export function clearSubmittedComment(drafts: Record<string, string>, request: FounderUpdateMutation) {
  if (request.operation !== "addComment") return drafts;
  const id = String(request.input.post_id);
  if (drafts[id] !== request.input.body) return drafts;
  const next = { ...drafts };
  delete next[id];
  return next;
}
