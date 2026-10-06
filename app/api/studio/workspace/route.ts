import { NextRequest, NextResponse } from "next/server";
import { StudioError, validateMutation } from "@/lib/studio/contracts";
import { authorize, databaseError, readWorkspace } from "@/lib/studio/server";
export const dynamic = "force-dynamic";
function failure(error: unknown) {
  const known =
    error instanceof StudioError
      ? error
      : new StudioError("Unable to complete the request.", "INTERNAL", 500);
  return NextResponse.json(
    { error: known.message, code: known.code },
    { status: known.status, headers: { "Cache-Control": "no-store" } },
  );
}
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      await readWorkspace(
        request.nextUrl.searchParams.get("workspaceId") ?? "",
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    if (
      request.headers.get("origin") &&
      request.headers.get("origin") !== request.nextUrl.origin
    )
      throw new StudioError(
        "Cross-origin writes are not allowed.",
        "FORBIDDEN",
        403,
      );
    if (Number(request.headers.get("content-length") ?? 0) > 110000)
      throw new StudioError("Request too large.", "VALIDATION", 413);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new StudioError("Valid JSON is required.", "VALIDATION");
    }
    const input = validateMutation(body);
    const { client } = await authorize(input.workspaceId);
    const { data, error } = await client.rpc("studio_mutate", {
      p_workspace: input.workspaceId,
      p_operation: input.operation,
      p_request: input.requestId,
      p_input: input.input,
    });
    if (error) throw databaseError(error);
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
