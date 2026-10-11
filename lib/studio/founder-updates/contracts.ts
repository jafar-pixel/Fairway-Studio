import { StudioError, uuidPattern } from "../contracts";

export const FOUNDER_UPDATES_SCHEMA_VERSION = 1;
export const founderUpdateOperations = ["createPost", "editPost", "setPinned", "addComment"] as const;
export type FounderUpdateOperation = (typeof founderUpdateOperations)[number];

export type FounderUpdateComment = {
  id: string;
  post_id: string;
  body: string;
  author_id: string;
  author_name: string;
  created_at: string;
};

export type FounderUpdatePost = {
  id: string;
  title: string;
  body: string;
  author_id: string;
  author_name: string;
  is_pinned: boolean;
  created_at: string;
  comments: FounderUpdateComment[];
};

export type FounderUpdatesFeed = {
  schemaVersion: number;
  userId: string;
  role: string;
  isFounder: boolean;
  canPost: boolean;
  canPin: boolean;
  posts: FounderUpdatePost[];
};

export type FounderUpdateMutation = {
  workspaceId: string;
  requestId: string;
  operation: FounderUpdateOperation;
  input: Record<string, unknown>;
};

export function validateFounderUpdateMutation(value: unknown): FounderUpdateMutation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new StudioError("A JSON object is required.", "VALIDATION");
  const mutation = value as FounderUpdateMutation;
  if (!uuidPattern.test(mutation.workspaceId ?? "") || !uuidPattern.test(mutation.requestId ?? "")) throw new StudioError("Valid workspace and request IDs are required.", "VALIDATION");
  if (!founderUpdateOperations.includes(mutation.operation)) throw new StudioError("Unknown Founder Updates operation.", "VALIDATION");
  if (!mutation.input || typeof mutation.input !== "object" || Array.isArray(mutation.input)) throw new StudioError("Input must be an object.", "VALIDATION");
  for (const key of ["workspace_id", "author_id", "created_at"]) if (key in mutation.input) throw new StudioError("Identity and workspace are assigned by the server.", "VALIDATION");
  if (mutation.input.post_id != null && !uuidPattern.test(String(mutation.input.post_id))) throw new StudioError("Invalid post_id.", "VALIDATION");
  if (mutation.operation !== "createPost" && !uuidPattern.test(String(mutation.input.post_id ?? ""))) throw new StudioError("A valid post_id is required.", "VALIDATION");
  if (mutation.operation === "editPost" && (typeof mutation.input.expected_title !== "string" || typeof mutation.input.expected_body !== "string")) throw new StudioError("The original update is required to check for changes.", "VALIDATION");
  if (mutation.operation === "createPost" || mutation.operation === "editPost") {
    if (typeof mutation.input.title !== "string" || !mutation.input.title.trim() || mutation.input.title.length > 180) throw new StudioError("A title of 1–180 characters is required.", "VALIDATION");
    if (typeof mutation.input.body !== "string" || !mutation.input.body.trim() || mutation.input.body.length > 12000) throw new StudioError("An update of 1–12,000 characters is required.", "VALIDATION");
  }
  if (mutation.operation === "addComment" && (typeof mutation.input.body !== "string" || !mutation.input.body.trim() || mutation.input.body.length > 2000)) throw new StudioError("A comment of 1–2,000 characters is required.", "VALIDATION");
  if (mutation.operation === "setPinned" && typeof mutation.input.is_pinned !== "boolean") throw new StudioError("Pinned state is required.", "VALIDATION");
  return mutation;
}
