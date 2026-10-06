import { StudioError } from "@/lib/studio/contracts";
import { authorize, databaseError } from "@/lib/studio/server";
import { readWorkflow, validateWorkflow } from "@/lib/studio/workflow";
import { isSameOriginWrite } from "@/lib/studio/request-origin";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  const known = error instanceof StudioError ? error : new StudioError("Unable to complete the workflow.", "INTERNAL", 500);
  return Response.json({error: known.message, code: known.code}, {status: known.status, headers});
}
export async function GET(request: Request) {
  try {
    return Response.json(await readWorkflow(new URL(request.url).searchParams.get("workspaceId") ?? ""), {headers});
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (!isSameOriginWrite(request)) throw new StudioError("Cross-origin writes are not allowed.", "FORBIDDEN", 403);
    if (Number(request.headers.get("content-length") ?? 0) > 20000) throw new StudioError("Request too large.", "VALIDATION", 413);
    const raw = await request.text();
    if (raw.length > 20000) throw new StudioError("Request too large.", "VALIDATION", 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new StudioError("Valid JSON is required.", "VALIDATION"); }
    const input = validateWorkflow(body);
    const { client } = await authorize(input.workspaceId);
    const { data, error } = await client.rpc("studio_workflow", {p_workspace: input.workspaceId, p_operation: input.operation, p_request: input.requestId, p_input: input.input});
    if (error) throw databaseError(error);
    return Response.json({data}, {headers});
  } catch (error) { return failure(error); }
}
