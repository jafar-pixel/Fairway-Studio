/** Portable domain rules. Call on the server using authenticated actor context.
 * These functions are not a database authorization boundary. Persist with RLS,
 * unique constraints, revision guards and transactions described in the spec.
 */
export class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
const fail = (code, message) => {
  throw new DomainError(code, message);
};
const dispositions = new Set(["approve", "request_changes", "abstain"]);

export function assertRevision(expected, actual) {
  if (!Number.isInteger(expected) || expected !== actual)
    fail("CONFLICT", "This item changed. Reload and review the changes.");
}

export function assertMembership(member, workspaceId, allowedRoles) {
  if (
    !member ||
    member.active !== true ||
    member.workspaceId !== workspaceId ||
    !allowedRoles.includes(member.role)
  ) {
    fail("FORBIDDEN", "This action is not available to this member.");
  }
}

export function validateRound(round) {
  const ids = round.reviewerIds;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.some((id) => typeof id !== "string" || !id) ||
    new Set(ids).size !== ids.length
  ) {
    fail("INVALID_REVIEWERS", "Choose distinct required reviewers.");
  }
  if (!["unanimous", "threshold"].includes(round.policy?.mode))
    fail("INVALID_POLICY", "Unknown review policy.");
  const threshold =
    round.policy.mode === "unanimous" ? ids.length : round.policy.threshold;
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > ids.length)
    fail("INVALID_POLICY", "Invalid approval threshold.");
  return threshold;
}

export function validateReview(round, actorId, input) {
  validateRound(round);
  if (round.state !== "open")
    fail("ROUND_CLOSED", "This review round is closed.");
  if (!round.reviewerIds.includes(actorId))
    fail("NOT_ASSIGNED", "You are not assigned to this review.");
  if (input.versionId !== round.versionId)
    fail("WRONG_VERSION", "Review the version assigned to this round.");
  if (!dispositions.has(input.disposition))
    fail("INVALID_DISPOSITION", "Choose approve, request changes, or abstain.");
  const rating = input.rating ?? null;
  if (
    rating !== null &&
    (!Number.isInteger(rating) || rating < 1 || rating > 5)
  )
    fail("INVALID_RATING", "A rating must be an integer from 1 to 5.");
  const comment = (input.comment ?? "").trim();
  if (comment.length > 4000)
    fail("COMMENT_TOO_LONG", "Use 4,000 characters or fewer.");
  if (input.disposition === "request_changes" && !comment)
    fail("COMMENT_REQUIRED", "Explain what should change.");
  return {
    roundId: round.id,
    versionId: round.versionId,
    reviewerId: actorId,
    disposition: input.disposition,
    rating,
    comment,
    state: "submitted",
  };
}

export function evaluateRound(round, reviews) {
  const threshold = validateRound(round);
  const assigned = new Set(round.reviewerIds);
  const relevant = reviews.filter(
    (r) =>
      r.roundId === round.id &&
      r.versionId === round.versionId &&
      r.state === "submitted" &&
      assigned.has(r.reviewerId),
  );
  if (new Set(relevant.map((r) => r.reviewerId)).size !== relevant.length)
    fail(
      "DUPLICATE_REVIEW",
      "More than one current response exists for a reviewer.",
    );
  for (const r of relevant) {
    if (!dispositions.has(r.disposition))
      fail("INVALID_DISPOSITION", "Invalid stored review.");
    if (
      r.rating != null &&
      (!Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5)
    )
      fail("INVALID_RATING", "Invalid stored rating.");
  }
  const approvals = relevant.filter((r) => r.disposition === "approve").length;
  const changeRequests = relevant.filter(
    (r) => r.disposition === "request_changes",
  ).length;
  const pending = round.reviewerIds.filter(
    (id) => !relevant.some((r) => r.reviewerId === id),
  );
  const ratings = relevant.map((r) => r.rating).filter((r) => r != null);
  // Threshold rounds also wait for all assigned members to respond. Change
  // requests block both policies until resolved in a revised response/round.
  const satisfied =
    pending.length === 0 && approvals >= threshold && changeRequests === 0;
  return {
    approvals,
    threshold,
    changeRequests,
    pending,
    ratedCount: ratings.length,
    averageRating: ratings.length
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : null,
    canRecord: round.state === "open" && satisfied,
  };
}

export function makeDecisionSnapshot({
  round,
  reviews,
  actorId,
  rationale,
  id,
  now,
}) {
  const result = evaluateRound(round, reviews);
  if (!result.canRecord)
    fail("POLICY_UNSATISFIED", "The review policy is not satisfied.");
  if (!rationale?.trim()) fail("RATIONALE_REQUIRED", "Explain the decision.");
  if (!id || !actorId || !Number.isFinite(Date.parse(now)))
    fail("INVALID_METADATA", "Provide server-generated decision metadata.");
  return {
    id,
    roundId: round.id,
    versionId: round.versionId,
    scope: structuredClone(round.scope),
    reviewerIds: [...round.reviewerIds],
    policy: structuredClone(round.policy),
    reviews: structuredClone(
      reviews.filter(
        (r) =>
          r.roundId === round.id &&
          r.versionId === round.versionId &&
          r.state === "submitted" &&
          round.reviewerIds.includes(r.reviewerId),
      ),
    ),
    actorId,
    rationale: rationale.trim(),
    createdAt: now,
  };
}

export function normalizePinUrl(input) {
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    fail("INVALID_URL", "Paste a full Pinterest Pin URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !["pinterest.com", "www.pinterest.com"].includes(url.hostname)
  ) {
    fail("INVALID_PIN_HOST", "Use a full HTTPS pinterest.com Pin link.");
  }
  const match = /^\/pin\/(\d+)\/?$/.exec(url.pathname);
  if (!match)
    fail("INVALID_PIN_PATH", "Use a Pin link, not a board or search link.");
  return `https://www.pinterest.com/pin/${match[1]}/`;
}

export function annotationPoint({ clientX, clientY, rect }) {
  if (
    ![clientX, clientY, rect.left, rect.top, rect.width, rect.height].every(
      Number.isFinite,
    ) ||
    rect.width <= 0 ||
    rect.height <= 0
  )
    fail("INVALID_BOUNDS", "Image bounds are invalid.");
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1)
    fail("OUTSIDE_IMAGE", "Place the annotation on the image.");
  return { x, y };
}

export function syncEligibility({
  operation,
  accountId,
  workspaceId,
  session,
  online,
}) {
  if (
    !session ||
    session.userId !== accountId ||
    session.workspaceId !== workspaceId ||
    !session.active
  )
    return { allowed: false, reason: "ACCOUNT_OR_MEMBERSHIP_CHANGED" };
  if (!online) return { allowed: false, reason: "OFFLINE" };
  if (!["create_idea_draft", "create_note_draft"].includes(operation))
    return { allowed: false, reason: "INTERACTIVE_REVALIDATION_REQUIRED" };
  return { allowed: true };
}
