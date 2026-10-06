import { StudioError } from "@/lib/studio/contracts";
import { readCanonicalTarget } from "@/lib/studio/business/canonical-target";

export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request) {
  try {
    return Response.json(await readCanonicalTarget(new URL(request.url).searchParams), { headers });
  } catch (error) {
    const known = error instanceof StudioError ? error : new StudioError(
      "Canonical target data is temporarily unavailable.", "INTERNAL", 500,
    );
    return Response.json({ error: known.message, code: known.code }, { status: known.status, headers });
  }
}
