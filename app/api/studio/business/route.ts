import { StudioError } from "@/lib/studio/contracts";
import { validateBusinessMutation } from "@/lib/studio/business/contracts";
import { readBusiness, mutateBusiness } from "@/lib/studio/business/server";
import { isSameOriginWrite } from "@/lib/studio/request-origin";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
function failure(error: unknown) {
 const known = error instanceof StudioError ? error : new StudioError("Business data is temporarily unavailable.", "INTERNAL", 500);
 return Response.json({error: known.message, code: known.code}, {status: known.status, headers});
}
export async function GET(request: Request) {
 try { return Response.json(await readBusiness(new URL(request.url).searchParams), {headers}); }
 catch (error) { return failure(error); }
}
export async function POST(request: Request) {
 try {
  if (!isSameOriginWrite(request)) throw new StudioError("Cross-origin writes are not allowed.", "FORBIDDEN", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new StudioError("Cross-site writes are not allowed.", "FORBIDDEN", 403);
  if (Number(request.headers.get("content-length") ?? 0) > 70000) throw new StudioError("Request too large.", "VALIDATION", 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 70000) throw new StudioError("Request too large.", "VALIDATION", 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { throw new StudioError("Valid JSON is required.", "VALIDATION"); }
  return Response.json({data: await mutateBusiness(validateBusinessMutation(body))}, {headers});
 } catch (error) { return failure(error); }
}
