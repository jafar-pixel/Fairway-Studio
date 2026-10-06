import { authorize, databaseError } from "./server";
import { StudioError, uuidPattern } from "./contracts";

export const workflowOperations = [
  "linkIdeaAsset", "unlinkIdeaAsset", "linkIdeaProject", "unlinkIdeaProject",
  "rejectDecision", "deferDecision", "supersedeDecision", "updateNotificationPreferences",
] as const;
export const defaultNotificationEvents = {
  mentions: true, assignments: true, reviews: true, decisions: true, generations: true, sessions: true,
};
export function validateWorkflow(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new StudioError("Invalid request.", "VALIDATION");
  const value = body as Record<string, unknown>;
  for (const key of ["workspaceId", "requestId"]) {
    if (typeof value[key] !== "string" || !uuidPattern.test(value[key])) throw new StudioError(`A valid ${key} is required.`, "VALIDATION");
  }
  if (!workflowOperations.includes(value.operation as typeof workflowOperations[number])) throw new StudioError("Unknown workflow operation.", "VALIDATION");
  if (!value.input || typeof value.input !== "object" || Array.isArray(value.input)) throw new StudioError("Input must be an object.", "VALIDATION");
  return value as {workspaceId: string; requestId: string; operation: string; input: Record<string, unknown>};
}
export async function readWorkflow(workspaceId: string) {
  const { client, user } = await authorize(workspaceId);
  const result: Record<string, unknown> = {};
  const sources = {
    ideaAssets: "studio_idea_assets", ideaProjects: "studio_idea_projects",
    supersessions: "studio_decision_supersessions", outcomes: "studio_decisions",
  };
  await Promise.all(Object.entries(sources).map(async ([key, table]) => {
    const { data, error } = await client.from(table).select("*").eq("workspace_id", workspaceId).order("created_at", {ascending: false}).limit(1000);
    if (error) throw databaseError(error);
    result[key] = data ?? [];
  }));
  const { data, error } = await client.from("studio_notification_preferences").select("*").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
  if (error) throw databaseError(error);
  return {
    ...result,
    notificationPreferences: data ?? {workspace_id: workspaceId, user_id: user.id, revision: 0, events: defaultNotificationEvents},
    notificationDelivery: {inApp: true, email: false, push: false},
  };
}
