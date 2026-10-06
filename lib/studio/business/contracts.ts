import { StudioError, uuidPattern } from "../contracts";
export const BUSINESS_SCHEMA_VERSION = 1;
export const businessOperations = ["createPlan", "updatePlan", "developPlan", "archivePlan", "upsertSwot", "removeSwot", "createSwotTask", "linkTask", "unlinkTask", "linkProject", "unlinkProject", "linkDocument", "unlinkDocument", "submitPlan", "decidePlan"] as const;
export type BusinessOperation = typeof businessOperations[number];
export type BusinessPlan = { id: string; workspace_id: string; title: string; brief: string; lead_id: string | null; kind: "idea" | "draft" | "plan"; notes: string; objective: string; target_date: string | null; category: string; tags: string[]; state: "draft" | "in_review" | "approved" | "archived"; revision: number; approved_version_id: string | null; created_by: string; created_at: string; updated_at: string };
export type BusinessSwot = { id: string; plan_id: string; quadrant: "strength" | "weakness" | "opportunity" | "threat"; body: string; evidence: string; owner_id: string | null; task_id: string | null; created_at: string };
export type BusinessTask = { id: string; title: string; details: string; status: "open" | "in_progress" | "done"; assigned_to: string | null; due_date: string | null; priority: string; blocked_reason: string | null; revision: number; project_id: string | null };
export type BusinessDocument = { id: string; plan_id: string; file_id: string | null; title: string; url: string | null; notes: string; created_by: string; created_at: string };
export type BusinessSnapshot = { id: string; plan_id: string; ordinal: number; plan_revision: number; body: { title: string; brief: string; notes: string; objective: string; owner_id: string | null; target_date: string | null; category: string; tags: string[]; swot: BusinessSwot[]; document_ids: string[]; document_references?: {id: string; file_id?: string; title?: string; url?: string}[]; task_ids: string[]; project_ids: string[] }; reviewers: string[]; policy: "all_reviewers"; supersedes_version_id: string | null; created_by: string; created_at: string };
export type BusinessReview = { id: string; plan_id: string; version_id: string; status: "open" | "approved" | "changes_requested" | "withdrawn"; revision: number; decided_at: string | null; created_at: string };
export type BusinessDecision = { id: string; version_id: string; reviewer_id: string; disposition: "approve" | "request_changes"; rationale: string; created_at: string };
export type BusinessList = { schemaVersion: number; plans: BusinessPlan[]; total: number; page: number; pageSize: number; overview: { active: number; ideas: number; awaitingReview: number; finals: number; overdue: number; blockedTasks: number; overdueTasks: number }; members: { user_id: string; display_name: string }[]; userId: string };
export type BusinessDetail = { schemaVersion: number; plan: BusinessPlan; swot: BusinessSwot[]; tasks: BusinessTask[]; documents: BusinessDocument[]; projects: {id: string; title: string}[]; versions: BusinessSnapshot[]; reviews: BusinessReview[]; decisions: BusinessDecision[] };
export type BusinessMutation = { workspaceId: string; requestId: string; operation: BusinessOperation; input: Record<string, unknown> };
export function validateBusinessMutation(body: unknown): BusinessMutation {
 if (!body || typeof body !== "object" || Array.isArray(body)) throw new StudioError("A JSON object is required.", "VALIDATION");
 const v = body as BusinessMutation;
 if (!uuidPattern.test(v.workspaceId ?? "") || !uuidPattern.test(v.requestId ?? "")) throw new StudioError("Valid workspace and request IDs are required.", "VALIDATION");
 if (!businessOperations.includes(v.operation)) throw new StudioError("Unknown business operation.", "VALIDATION");
 if (!v.input || typeof v.input !== "object" || Array.isArray(v.input)) throw new StudioError("Input must be an object.", "VALIDATION");
 for (const key of ["workspace_id", "created_by", "author_id", "actor_id", "reviewer_id", "approved_version_id", "state", "revision"]) if (key in v.input) throw new StudioError("Identity and approval state are assigned by the server.", "VALIDATION");
 for (const key of ["plan_id", "id", "owner_id", "task_id", "file_id", "project_id", "version_id", "supersedes_version_id"]) if (v.input[key] != null && !uuidPattern.test(String(v.input[key]))) throw new StudioError(`Invalid ${key}.`, "VALIDATION");
 if (v.operation !== "createPlan" && v.operation !== "decidePlan" && (!Number.isInteger(v.input.expected_revision) || Number(v.input.expected_revision) < 0)) throw new StudioError("Expected revision is required.", "VALIDATION");
 if (v.operation === "decidePlan" && (!Number.isInteger(v.input.expected_review_revision) || Number(v.input.expected_review_revision) < 0)) throw new StudioError("Expected review revision is required.", "VALIDATION");
 if (JSON.stringify(v.input).length > 60000) throw new StudioError("Plan request is too large.", "VALIDATION", 413);
 return v;
}
