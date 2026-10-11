import { authorize, databaseError } from "../server";
import { StudioError } from "../contracts";
import { FOUNDER_UPDATES_SCHEMA_VERSION, type FounderUpdateMutation, type FounderUpdatesFeed } from "./contracts";

type Row = Record<string, any>;

async function membership(workspaceId: string) {
  const auth = await authorize(workspaceId);
  const { data, error } = await auth.client.from("workspace_members").select("role,is_founder").eq("workspace_id", workspaceId).eq("user_id", auth.user.id).single();
  if (error) throw databaseError(error);
  const role = String(data.role);
  const isFounder = data.is_founder === true;
  return { ...auth, role, isFounder, canPost: isFounder || role === "owner" || role === "admin", canPin: isFounder || role === "owner" || role === "admin" };
}

export async function readFounderUpdates(workspaceId: string, preview = false): Promise<FounderUpdatesFeed> {
  const auth = await membership(workspaceId);
  let query = auth.client.from("studio_founder_updates").select("id,title,body,author_id,is_pinned,created_at").eq("workspace_id", workspaceId).order("is_pinned", { ascending: false }).order("created_at", { ascending: false }).limit(preview ? 1 : 50);
  const { data: posts, error } = await query;
  if (error) throw databaseError(error);
  const postIds = (posts ?? []).map((post: Row) => post.id);
  const { data: comments, error: commentError } = postIds.length && !preview
    ? await auth.client.from("studio_founder_update_comments").select("id,post_id,body,author_id,created_at").eq("workspace_id", workspaceId).in("post_id", postIds).order("created_at", { ascending: true }).limit(500)
    : { data: [], error: null };
  if (commentError) throw databaseError(commentError);
  const authorIds = [...new Set([...(posts ?? []).map((row: Row) => row.author_id), ...(comments ?? []).map((row: Row) => row.author_id)])];
  const { data: profiles, error: profileError } = authorIds.length ? await auth.client.from("profiles").select("id,display_name").in("id", authorIds) : { data: [], error: null };
  if (profileError) throw databaseError(profileError);
  const names = new Map((profiles ?? []).map((profile: Row) => [profile.id, String(profile.display_name || "Workspace member")]));
  return {
    schemaVersion: FOUNDER_UPDATES_SCHEMA_VERSION,
    userId: auth.user.id,
    role: auth.role,
    isFounder: auth.isFounder,
    canPost: auth.canPost,
    canPin: auth.canPin,
    posts: (posts ?? []).map((post: Row) => ({
      id: String(post.id), title: String(post.title), body: String(post.body), author_id: String(post.author_id),
      author_name: names.get(post.author_id) || "Workspace member", is_pinned: post.is_pinned === true, created_at: String(post.created_at),
      comments: (comments ?? []).filter((comment: Row) => comment.post_id === post.id).map((comment: Row) => ({
        id: String(comment.id), post_id: String(comment.post_id), body: String(comment.body), author_id: String(comment.author_id),
        author_name: names.get(comment.author_id) || "Workspace member", created_at: String(comment.created_at),
      })),
    })),
  };
}

export async function mutateFounderUpdates(mutation: FounderUpdateMutation): Promise<FounderUpdatesFeed> {
  const auth = await membership(mutation.workspaceId);
  const input = mutation.input;
  if (mutation.operation === "createPost") {
    if (!auth.canPost) throw new StudioError("Only founders and workspace administrators can publish founder updates.", "FORBIDDEN", 403);
    const row = { id: mutation.requestId, workspace_id: mutation.workspaceId, title: String(input.title).trim(), body: String(input.body).trim() };
    const { error } = await auth.client.from("studio_founder_updates").insert(row);
    if (error && error.code !== "23505") throw databaseError(error);
  } else if (mutation.operation === "setPinned") {
    if (!auth.canPin) throw new StudioError("Only founders and workspace administrators can pin updates.", "FORBIDDEN", 403);
    const { data, error } = await auth.client.from("studio_founder_updates").update({ is_pinned: input.is_pinned }).eq("workspace_id", mutation.workspaceId).eq("id", input.post_id).select("id").maybeSingle();
    if (error) throw databaseError(error);
    if (!data) throw new StudioError("Update not found or access denied.", "FORBIDDEN", 403);
  } else {
    const row = { id: mutation.requestId, workspace_id: mutation.workspaceId, post_id: input.post_id, body: String(input.body).trim() };
    const { error } = await auth.client.from("studio_founder_update_comments").insert(row);
    if (error && error.code !== "23505") throw databaseError(error);
  }
  return readFounderUpdates(mutation.workspaceId);
}
