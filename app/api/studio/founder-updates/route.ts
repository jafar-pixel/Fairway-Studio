import { StudioError } from "@/lib/studio/contracts";
import { validateFounderUpdateMutation } from "@/lib/studio/founder-updates/contracts";
import { mutateFounderUpdates, readFounderUpdates } from "@/lib/studio/founder-updates/server";
import { isSameOriginWrite } from "@/lib/studio/request-origin";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
function failure(error: unknown) {
  const known = error instanceof StudioError ? error : new StudioError("Founder Updates is temporarily unavailable.", "INTERNAL", 500);
  return Response.json({ error: known.message, code: known.code }, { status: known.status, headers });
}
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    return Response.json(await readFounderUpdates(params.get("workspaceId") ?? "", params.get("preview") === "1"), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (!isSameOriginWrite(request) || request.headers.get("sec-fetch-site") === "cross-site") throw new StudioError("Cross-origin writes are not allowed.", "FORBIDDEN", 403);
    if (Number(request.headers.get("content-length") ?? 0) > 18000) throw new StudioError("Request too large.", "VALIDATION", 413);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 18000) throw new StudioError("Request too large.", "VALIDATION", 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new StudioError("Valid JSON is required.", "VALIDATION"); }
    return Response.json(await mutateFounderUpdates(validateFounderUpdateMutation(body)), { headers });
  } catch (error) { return failure(error); }
}
