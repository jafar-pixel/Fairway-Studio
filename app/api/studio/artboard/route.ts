import { authorize, databaseError } from "@/lib/studio/server";
import { generationService } from "@/lib/studio/generation";
import { uuidPattern, StudioError } from "@/lib/studio/contracts";
import { isSameOriginWrite } from "@/lib/studio/request-origin";
const headers = { "Cache-Control": "private, no-store" };
function id(v: unknown): string {
  if (typeof v !== "string" || !uuidPattern.test(v))
    throw new StudioError("Choose a saved design.", "VALIDATION");
  return v;
}
function fail(e: unknown) {
  return Response.json(
    { error: e instanceof Error ? e.message : "Artboard unavailable." },
    { status: e instanceof StudioError ? e.status : 400, headers },
  );
}
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams,
      workspaceId = id(q.get("workspaceId")),
      projectId = id(q.get("projectId"));
    const { client } = await authorize(workspaceId);
    const { data, error } = await client
      .from("studio_design_states")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("project_id", projectId);
    if (error) throw databaseError(error);
    return Response.json({ states: data }, { headers });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    if (!isSameOriginWrite(request))
      throw new StudioError(
        "Cross-origin writes are not allowed.",
        "FORBIDDEN",
        403,
      );
    const raw = await request.text();
    if (raw.length > 4000)
      throw new StudioError("Request too large.", "VALIDATION");
    const b = JSON.parse(raw),
      workspaceId = id(b.workspaceId),
      versionId = id(b.versionId);
    const { user } = await authorize(workspaceId);
    if (!["checkIn", "checkOut", "advance"].includes(b.action))
      throw new StudioError("Unknown action.", "VALIDATION");
    const { data, error } = await generationService().rpc(
      "studio_design_action",
      {
        p_workspace: workspaceId,
        p_actor: user.id,
        p_version: versionId,
        p_action: b.action,
        p_decision: b.decisionId ? id(b.decisionId) : null,
      },
    );
    if (error) throw databaseError(error);
    return Response.json({ state: data }, { headers });
  } catch (e) {
    return fail(e);
  }
}
