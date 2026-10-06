import test from "node:test";
import assert from "node:assert/strict";
import {
  assertRevision,
  assertMembership,
  validateReview,
  evaluateRound,
  makeDecisionSnapshot,
  normalizePinUrl,
  annotationPoint,
  syncEligibility,
} from "./domain.mjs";
const round = {
  id: "r1",
  versionId: "v2",
  state: "open",
  reviewerIds: ["j", "a", "k"],
  policy: { mode: "unanimous" },
  scope: ["monogram"],
};
const approve = (id) =>
  validateReview(round, id, {
    versionId: "v2",
    disposition: "approve",
    rating: 5,
  });
test("three real approvals permit recording, ratings alone do not", () => {
  assert.equal(
    evaluateRound(round, ["j", "a", "k"].map(approve)).canRecord,
    true,
  );
  const changes = validateReview(round, "k", {
    versionId: "v2",
    disposition: "request_changes",
    rating: 5,
    comment: "Adjust trim.",
  });
  assert.equal(
    evaluateRound(round, [approve("j"), approve("a"), changes]).canRecord,
    false,
  );
});
test("old version and round responses never approve a new round", () => {
  assert.equal(
    evaluateRound(
      { ...round, id: "r2", versionId: "v3" },
      ["j", "a", "k"].map(approve),
    ).approvals,
    0,
  );
});
test("abstention does not satisfy unanimity", () => {
  const abstain = validateReview(round, "k", {
    versionId: "v2",
    disposition: "abstain",
  });
  assert.equal(
    evaluateRound(round, [approve("j"), approve("a"), abstain]).canRecord,
    false,
  );
});
test("duplicate current reviews fail closed", () =>
  assert.throws(() => evaluateRound(round, [approve("j"), approve("j")]), {
    code: "DUPLICATE_REVIEW",
  }));
test("drafts and outsiders are excluded", () => {
  const result = evaluateRound(round, [
    { ...approve("j"), state: "draft" },
    { ...approve("a"), reviewerId: "outsider" },
  ]);
  assert.equal(result.approvals, 0);
  assert.equal(result.averageRating, null);
});
test("review validation rejects spoofed assignment, wrong version and empty change request", () => {
  assert.throws(
    () =>
      validateReview(round, "outsider", {
        versionId: "v2",
        disposition: "approve",
      }),
    { code: "NOT_ASSIGNED" },
  );
  assert.throws(
    () =>
      validateReview(round, "j", { versionId: "v3", disposition: "approve" }),
    { code: "WRONG_VERSION" },
  );
  assert.throws(
    () =>
      validateReview(round, "j", {
        versionId: "v2",
        disposition: "request_changes",
        comment: " ",
      }),
    { code: "COMMENT_REQUIRED" },
  );
});
test("ratings are nullable integers 1 to 5", () => {
  for (const rating of [0, 6, 2.5, NaN, "5"])
    assert.throws(
      () =>
        validateReview(round, "j", {
          versionId: "v2",
          disposition: "approve",
          rating,
        }),
      { code: "INVALID_RATING" },
    );
  assert.equal(
    validateReview(round, "j", { versionId: "v2", disposition: "approve" })
      .rating,
    null,
  );
});
test("closed rounds do not accept votes or new decisions", () => {
  assert.throws(
    () =>
      validateReview({ ...round, state: "closed" }, "j", {
        versionId: "v2",
        disposition: "approve",
      }),
    { code: "ROUND_CLOSED" },
  );
  assert.equal(
    evaluateRound({ ...round, state: "closed" }, ["j", "a", "k"].map(approve))
      .canRecord,
    false,
  );
});
test("policy cannot silently accept an empty reviewer list or invalid threshold", () => {
  assert.throws(() => evaluateRound({ ...round, reviewerIds: [] }, []), {
    code: "INVALID_REVIEWERS",
  });
  assert.throws(
    () =>
      evaluateRound(
        { ...round, policy: { mode: "threshold", threshold: 4 } },
        [],
      ),
    { code: "INVALID_POLICY" },
  );
});
test("decision snapshot is independent of later mutable input", () => {
  const source = structuredClone(round),
    reviews = ["j", "a", "k"].map(approve);
  const snapshot = makeDecisionSnapshot({
    round: source,
    reviews,
    actorId: "j",
    rationale: "Adopt monogram.",
    id: "d1",
    now: "2026-10-02T07:00:00Z",
  });
  source.scope.push("palette");
  reviews[0].comment = "changed";
  assert.deepEqual(snapshot.scope, ["monogram"]);
  assert.equal(snapshot.reviews[0].comment, "");
});
test("canonical Pin URL strips tracking and rejects unsafe or wrong hosts", () => {
  assert.equal(
    normalizePinUrl("https://pinterest.com/pin/123456/?utm_source=test"),
    "https://www.pinterest.com/pin/123456/",
  );
  for (const url of [
    "javascript:alert(1)",
    "https://pinterest.com.evil.example/pin/123/",
    "https://user:pass@pinterest.com/pin/123/",
    "https://pinterest.com/board/123/",
    "http://pinterest.com/pin/123/",
    "https://pin.it/abc",
  ])
    assert.throws(() => normalizePinUrl(url));
});
test("normalized annotation survives proportional resizing", () => {
  assert.deepEqual(
    annotationPoint({
      clientX: 60,
      clientY: 70,
      rect: { left: 10, top: 20, width: 100, height: 100 },
    }),
    { x: 0.5, y: 0.5 },
  );
  assert.deepEqual(
    annotationPoint({
      clientX: 110,
      clientY: 120,
      rect: { left: 10, top: 20, width: 200, height: 200 },
    }),
    { x: 0.5, y: 0.5 },
  );
});
test("revision and workspace membership checks reject invalid mutations", () => {
  assert.throws(() => assertRevision(1, 2), { code: "CONFLICT" });
  assert.throws(
    () =>
      assertMembership(
        { active: true, workspaceId: "other", role: "owner" },
        "w",
        ["owner"],
      ),
    { code: "FORBIDDEN" },
  );
});
test("offline queue never replays approvals or another account drafts", () => {
  const base = {
    operation: "create_idea_draft",
    accountId: "j",
    workspaceId: "w",
    session: { userId: "j", workspaceId: "w", active: true },
    online: true,
  };
  assert.equal(syncEligibility(base).allowed, true);
  assert.equal(
    syncEligibility({ ...base, operation: "approve" }).allowed,
    false,
  );
  assert.equal(syncEligibility({ ...base, accountId: "k" }).allowed, false);
  assert.equal(syncEligibility({ ...base, online: false }).allowed, false);
});
