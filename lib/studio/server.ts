import { createClient } from "@/lib/supabase/server";
import { hydrateImportedContent } from "./imported-content";
import { StudioError, uuidPattern, type StudioWorkspace } from "./contracts";
export const tables = {
  ideas: "brand_ideas",
  tasks: "studio_tasks",
  references: "saved_references",
  files: "workspace_files",
  rooms: "workspace_rooms",
  projects: "studio_projects",
  versions: "studio_versions",
  nodes: "studio_canvas_nodes",
  rounds: "studio_review_rounds",
  reviews: "studio_reviews",
  decisions: "studio_decisions",
  kits: "studio_kits",
  activity: "studio_activity",
  messages: "workspace_messages",
  threads: "studio_threads",
} as const;
export function databaseError(error: {
  code?: string;
  message?: string;
}): StudioError {
  if (["42P01", "PGRST205", "PGRST202", "42703"].includes(error.code ?? ""))
    return new StudioError(
      "Studio database setup is required. Apply the reviewed additive schema before saving.",
      "SCHEMA_REQUIRED",
      503,
    );
  if (error.message?.includes("CONFLICT") || error.code === "40001")
    return new StudioError(
      "This record changed. Refresh and review your changes before retrying.",
      "CONFLICT",
      409,
    );
  if (error.code === "42501")
    return new StudioError(
      "You do not have access to this operation.",
      "FORBIDDEN",
      403,
    );
  if (
    ["22023", "23514", "22P02", "P0001", "23503", "23505"].includes(
      error.code ?? "",
    )
  )
    return new StudioError(
      error.message || "The operation could not be completed.",
      "VALIDATION",
      422,
    );
  return new StudioError(
    "Workspace data is temporarily unavailable. Please retry.",
    "DATABASE_ERROR",
    503,
  );
}
export async function authorize(workspaceId: string) {
  if (!uuidPattern.test(workspaceId))
    throw new StudioError("A valid workspace ID is required.", "VALIDATION");
  let client: Awaited<ReturnType<typeof createClient>>;
  try {
    client = await createClient();
  } catch {
    throw new StudioError(
      "Supabase configuration is missing.",
      "CONFIGURATION_REQUIRED",
      503,
    );
  }
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user)
    throw new StudioError(
      "Sign in to open this workspace.",
      "UNAUTHENTICATED",
      401,
    );
  const { data: membership, error } = await client
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw databaseError(error);
  if (!membership)
    throw new StudioError(
      "Workspace not found or access denied.",
      "FORBIDDEN",
      403,
    );
  return { client, user, role: String(membership.role) };
}
export async function readWorkspace(
  workspaceId: string,
): Promise<StudioWorkspace> {
  const { client, user, role } = await authorize(workspaceId);
  const { data: workspace, error } = await client
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .single();
  if (error) throw databaseError(error);
  const { data: members, error: memberError } = await client
    .from("workspace_members")
    .select("*")
    .eq("workspace_id", workspaceId);
  if (memberError) throw databaseError(memberError);
  const memberIds = (members ?? []).map((member) => String(member.user_id));
  const { data: profiles, error: profileError } = memberIds.length
    ? await client
        .from("profiles")
        .select("id,display_name")
        .in("id", memberIds)
    : { data: [], error: null };
  if (profileError) throw databaseError(profileError);
  const namedMembers = (members ?? []).map((member) => ({
    ...member,
    display_name:
      profiles?.find((profile) => profile.id === member.user_id)
        ?.display_name ?? "",
    is_founder: member.is_founder === true,
  }));
  const missingSchema: string[] = [];
  let invites: unknown[] = [];
  if (role === "owner" || role === "admin") {
    const inviteResult = await client
      .from("workspace_invites")
      .select("id,workspace_id,created_by,created_at,expires_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (inviteResult.error) {
      if (databaseError(inviteResult.error).code === "SCHEMA_REQUIRED")
        missingSchema.push("workspace_invites.id");
      else throw databaseError(inviteResult.error);
    } else invites = inviteResult.data ?? [];
  }
  const result: Record<string, unknown> = {};
  await Promise.all(
    Object.entries(tables).map(async ([key, table]) => {
      let query = client
        .from(table)
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(500);
      // Restricted legacy file labels have no verified ACL. Do not disclose them through this endpoint.
      if (key === "files")
        query = query.or(
          `permission_scope.eq.workspace,added_by.eq.${user.id}`,
        );
      const { data, error } = await query;
      if (error) {
        if (databaseError(error).code === "SCHEMA_REQUIRED") {
          missingSchema.push(table);
          result[key] = [];
          return;
        }
        throw databaseError(error);
      }
      result[key] = data ?? [];
    }),
  );
  // An absent RPC is detected on mutation; column absence also marks legacy schema as requiring migration.
  const { error: revisionError } = await client
    .from("brand_ideas")
    .select("revision")
    .eq("workspace_id", workspaceId)
    .limit(1);
  if (revisionError && databaseError(revisionError).code === "SCHEMA_REQUIRED")
    missingSchema.push("studio_mutate / revision columns");
  else if (revisionError) throw databaseError(revisionError);
  return hydrateImportedContent({
    ...result,
    invites,
    workspace,
    userId: user.id,
    role,
    members: namedMembers,
    missingSchema,
    capabilities: {
      collaboration: missingSchema.length === 0,
      governance: missingSchema.length === 0,
    },
  }) as StudioWorkspace;
}
