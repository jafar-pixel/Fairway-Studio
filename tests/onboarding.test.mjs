import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/studio/onboarding.ts", import.meta.url), "utf8");
const playbackSandbox = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../lib/studio/guide-playback.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, playbackSandbox);
const sandbox = { exports: {}, require: (name) => {
  assert.equal(name, "./guide-playback");
  return playbackSandbox.exports;
} };
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  sandbox,
);
const onboarding = sandbox.exports;
const ids = ["project-a", "project-b"];

function storage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    values,
  };
}

test("onboarding state is scoped by account and workspace with an isolated demo key", () => {
  assert.notEqual(onboarding.guideStorageScope("user-a", "workspace-a"), onboarding.guideStorageScope("user-b", "workspace-a"));
  assert.notEqual(onboarding.guideStorageScope("user-a", "workspace-a"), onboarding.guideStorageScope("user-a", "workspace-b"));
  assert.equal(onboarding.guideStorageScope("", "", true), "fairway:onboarding:demo:v1");
});

test("corrupt, stale-version, and unsafe saved values restore a fresh state", () => {
  assert.equal(onboarding.parseOnboardingState("{bad-json").goal, null);
  assert.deepEqual(
    { ...onboarding.parseOnboardingState({ schemaVersion: 99 }).tours },
    {},
  );
  const parsed = onboarding.parseOnboardingState(JSON.stringify({
    schemaVersion: 1,
    goal: "toString",
    selectedProjectId: "removed-project",
    selections: { home: "new", constructor: "unsafe", __proto__: "unsafe" },
    visitedPages: ["home", "constructor", "missing"],
    tours: { home: { stepId: "handoff", status: "inProgress" }, constructor: { stepId: "welcome", status: "completed" } },
  }), ids);
  assert.equal(parsed.goal, null);
  assert.equal(parsed.selectedProjectId, null);
  assert.deepEqual({ ...parsed.selections }, { home: "new" });
  assert.deepEqual([...parsed.visitedPages], ["home"]);
  assert.deepEqual(Object.keys(parsed.tours), ["home"]);
});

test("state persistence tolerates unavailable browser storage and round-trips scoped state", () => {
  const key = onboarding.guideStorageScope("user", "workspace");
  const savedStorage = storage();
  let state = onboarding.createInitialOnboardingState("2026-10-02T00:00:00.000Z");
  state = onboarding.setOnboardingGoal(state, "product", "2026-10-02T00:00:01.000Z");
  state = onboarding.setOnboardingProject(state, "project-a", ids, "2026-10-02T00:00:02.000Z");
  assert.equal(onboarding.saveOnboardingState(savedStorage, key, state), true);
  const loaded = onboarding.loadOnboardingState(savedStorage, key, ids);
  assert.equal(loaded.persistenceAvailable, true);
  assert.equal(loaded.state.goal, "product");
  assert.equal(loaded.state.selectedProjectId, "project-a");
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(onboarding.loadOnboardingState(blocked, key, ids).persistenceAvailable, false);
  assert.equal(onboarding.saveOnboardingState(blocked, key, state), false);
});

test("page resolver maps routed project contexts without coupling tours to project IDs", () => {
  assert.equal(onboarding.resolveGuidePageId("", []), "home");
  assert.equal(onboarding.resolveGuidePageId("brand-kit", []), "brandKit");
  assert.equal(onboarding.resolveGuidePageId("projects", ["project-a", "reviews"]), "reviews");
  assert.equal(onboarding.resolveGuidePageId("projects", ["project-b", "canvas"]), "canvas");
  assert.equal(onboarding.resolveGuidePageId("projects", ["project-a", "overview"]), "projectOverview");
  assert.equal(onboarding.resolveGuidePageId("projects", ["project-a", "decisions"]), "decisions");
  assert.equal(onboarding.resolveGuidePageId("projects", ["project-a", "files"]), "files");
});

test("guide completion stays separate from verified work milestones", () => {
  const state = onboarding.createInitialOnboardingState();
  const skipped = onboarding.updateTour(state, "home", "welcome", "skipped");
  assert.equal(skipped.tours.home.status, "skipped");
  const guided = onboarding.updateTour(state, "home", "handoff", "completed");
  assert.equal(guided.tours.home.status, "completed");
  assert.deepEqual({ ...guided.verifiedMilestones }, {});
  assert.equal(onboarding.recordVerifiedMilestone(skipped, "notAWorkMutation"), skipped);
  const saved = onboarding.recordVerifiedMilestone(skipped, "createIdea", "2026-10-02T00:00:00.000Z");
  assert.equal(saved.verifiedMilestones.createIdea, "2026-10-02T00:00:00.000Z");
  assert.equal(saved.tours.home.status, "skipped");
});

test("guide navigation itself contains no network or mutation calls", () => {
  const guide = fs.readFileSync(new URL("../components/studio/onboarding-guide.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(guide, /fetch\s*\(|dispatchEvent\s*\(|onMutate\s*\(/);
  assert.match(guide, /updateTour[(]state, pageId, (target|stage), "inProgress"[)]/);
  assert.match(guide, /updateTour\(state, pageId, "handoff", "completed"\)/);
});

test("text assistant never falls back from the configured OpenAI model", () => {
  const route = fs.readFileSync(new URL("../app/api/studio/guide/route.ts", import.meta.url), "utf8");
  assert.match(route, /textModel !== "openai\/gpt-5\.4-mini"/);
  assert.match(route, /model: gateway\(textModel\)/);
  assert.doesNotMatch(route, /google\/gemini|STUDIO_TEXT_MODEL\s*\|\|/);
});


test("guide resolver accepts complete app routes as well as relative routes", () => {
  for (const tab of ["canvas", "reviews", "decisions", "files"]) {
    assert.equal(onboarding.resolveGuidePageId("projects", ["projects", "project-a", tab]), tab);
    assert.equal(onboarding.resolveGuidePageId("projects", ["project-a", tab]), tab);
  }
  assert.equal(onboarding.resolveGuidePageId("projects", ["projects"]), "projects");
});

test("first welcome can advance and skipped guides retain their resume step", () => {
 const guide=fs.readFileSync(new URL("../components/studio/onboarding-guide.tsx", import.meta.url), "utf8");
 assert.match(guide, /function goTo[(]stage: GuideStage[)] [{]\s*setMenuOpen[(]false[)];\s*setOpen[(]true[)]/);
 assert.match(guide, /progress.status !== "completed" [ ?]+progress.stepId/);
 const state=onboarding.updateTour(onboarding.createInitialOnboardingState(), "ideas", "selection", "skipped");
 assert.equal(onboarding.getTourStep(state,"ideas").stepId,"selection");
});

test("read-only tour never hands off to a creation action", () => {
 const guide=fs.readFileSync(new URL("../components/studio/onboarding-guide.tsx", import.meta.url), "utf8");
 assert.match(guide, /if [(]state.goal !== "guided_tour"[)] onAction[(]/);
 assert.match(guide, /firstWelcome && step === "welcome" [?] dismissWelcome : closeGuide/);
});
