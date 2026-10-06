export type StudioRow = {
  id: string;
  workspace_id: string;
  created_at: string;
  [key: string]: unknown;
};
export type StudioMember = {
  workspace_id: string;
  user_id: string;
  role: "owner" | "admin" | "editor";
  display_name?: string;
  is_founder?: boolean;
};
export type StudioWorkspace = {
  workspace: {
    id: string;
    name: string;
    revision?: number;
    timezone?: string;
    review_policy?: Record<string, unknown>;
    active_kit_id?: string;
  };
  userId: string;
  role: string;
  ideas: StudioRow[];
  tasks: StudioRow[];
  references: StudioRow[];
  files: StudioRow[];
  rooms: StudioRow[];
  members: StudioMember[];
  invites: StudioRow[];
  messages: StudioRow[];
  threads: StudioRow[];
  projects: StudioRow[];
  versions: StudioRow[];
  nodes: StudioRow[];
  rounds: StudioRow[];
  reviews: StudioRow[];
  decisions: StudioRow[];
  kits: StudioRow[];
  activity: StudioRow[];
  capabilities: { collaboration: boolean; governance: boolean };
  missingSchema: string[];
};
export const operations = [
  "createIdea",
  "updateIdea",
  "createTask",
  "updateTask",
  "createProject",
  "updateProject",
  "promoteIdea",
  "createVersion",
  "saveCanvas",
  "openReview",
  "submitReview",
  "recordDecision",
  "publishKit",
  "updateFile",
  "archiveIdea",
  "restoreIdea",
  "importPin",
  "updateReference",
  "archiveReference",
  "restoreReference",
  "createExternalFile",
  "createThread",
  "sendMessage",
  "updateWorkspace",
  "updateReviewPolicy",
  "updateMember",
  "removeMember",
  "revokeInvite",
] as const;
export type StudioOperation = (typeof operations)[number];
export type StudioMutation = {
  workspaceId: string;
  operation: StudioOperation;
  requestId: string;
  input: Record<string, unknown>;
};
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class StudioError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function validateMutation(value: unknown): StudioMutation {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new StudioError("A JSON object is required.", "VALIDATION");
  const v = value as StudioMutation;
  if (
    !uuidPattern.test(v.workspaceId ?? "") ||
    !uuidPattern.test(v.requestId ?? "")
  )
    throw new StudioError(
      "Workspace and request IDs must be UUIDs.",
      "VALIDATION",
    );
  if (!operations.includes(v.operation))
    throw new StudioError("Unknown operation.", "VALIDATION");
  if (!v.input || typeof v.input !== "object" || Array.isArray(v.input))
    throw new StudioError("Input must be an object.", "VALIDATION");
  if (JSON.stringify(v.input).length > 100000)
    throw new StudioError("Input is too large.", "VALIDATION", 413);
  for (const key of [
    "actor_id",
    "author_id",
    "created_by",
    "reviewer_id",
    "workspace_id",
  ])
    if (key in v.input)
      throw new StudioError(
        "Identity and workspace are assigned by the server.",
        "VALIDATION",
      );
  for (const key of [
    "id",
    "project_id",
    "version_id",
    "round_id",
    "idea_id",
    "parent_id",
    "assigned_to",
    "reference_id",
    "thread_id",
    "lead_id",
    "file_id",
    "task_id",
    "kit_id",
    "source_message_id",
    "user_id",
  ])
    if (v.input[key] != null && !uuidPattern.test(String(v.input[key])))
      throw new StudioError(`Invalid ${key}.`, "VALIDATION");
  if (
    [
      "createIdea",
      "createTask",
      "createProject",
      "createVersion",
      "publishKit",
      "importPin",
      "createExternalFile",
      "createThread",
    ].includes(v.operation) &&
    (typeof v.input.title !== "string" ||
      !v.input.title.trim() ||
      v.input.title.length > 240)
  )
    throw new StudioError(
      "A title of 1–240 characters is required.",
      "VALIDATION",
    );
  if (
    [
      "updateProject",
      "updateIdea",
      "updateTask",
      "saveCanvas",
      "archiveIdea",
      "restoreIdea",
      "updateReference",
      "updateFile",
      "archiveReference",
      "restoreReference",
      "updateWorkspace",
      "updateReviewPolicy",
    ].includes(v.operation) &&
    (!Number.isInteger(v.input.expected_revision) ||
      Number(v.input.expected_revision) < 0)
  )
    throw new StudioError("Expected revision is required.", "VALIDATION");
  if (
    v.operation === "submitReview" &&
    !["approve", "request_changes", "abstain"].includes(
      String(v.input.disposition),
    )
  )
    throw new StudioError(
      "Choose an explicit review disposition.",
      "VALIDATION",
    );
  if (
    v.operation === "submitReview" &&
    v.input.disposition === "request_changes" &&
    (typeof v.input.comment !== "string" || !v.input.comment.trim())
  )
    throw new StudioError("Explain the changes requested.", "VALIDATION");
  const limits: Record<string, number> = v.operation.includes("Idea")
    ? { title: 160, body: 3000 }
    : v.operation.includes("Task")
      ? { title: 240, details: 2000 }
      : v.operation.includes("File")
        ? { title: 160, context_note: 500 }
        : v.operation === "sendMessage"
          ? { body: 4000 }
          : { note: 1200 };
  for (const [key, limit] of Object.entries(limits))
    if (typeof v.input[key] === "string" && v.input[key].length > limit)
      throw new StudioError(
        `${key} exceeds ${limit} characters.`,
        "VALIDATION",
      );
  return v;
}
