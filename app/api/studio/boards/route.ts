import { NextRequest, NextResponse } from "next/server";
import { StudioError, uuidPattern } from "@/lib/studio/contracts";
import { authorize, databaseError } from "@/lib/studio/server";
import { boardInputError } from "@/lib/studio/whiteboard";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };
// Rule messages written in studio_board_mutate are safe to show; other access errors stay generic.
const ruleMessage = /^(Only |Board not found|This board item|This item|Idea not found|Choose )/;

function failure(error: unknown) {
  let known: StudioError;
  if (error instanceof StudioError) known = error;
  else {
    const raw = error as { code?: string; message?: string };
    known = databaseError(raw);
    if (raw?.message && ruleMessage.test(raw.message) && ["42501", "22023", "40001"].includes(raw.code ?? ""))
      known = new StudioError(raw.message, known.code, known.status);
  }
  return NextResponse.json({ error: known.message, code: known.code }, { status: known.status, headers });
}

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "";
    const ideaId = request.nextUrl.searchParams.get("ideaId") ?? "";
    if (!uuidPattern.test(ideaId)) throw new StudioError("Choose an idea.", "VALIDATION", 422);
    const { client } = await authorize(workspaceId);
    // RLS returns the Team board plus only the signed-in member's Private board.
    const { data: boards, error } = await client
      .from("studio_boards")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("idea_id", ideaId);
    if (error) throw error;
    const ids = (boards ?? []).map((board) => board.id);
    const [items, comments] = ids.length
      ? await Promise.all([
          client.from("studio_board_items").select("*").in("board_id", ids).order("created_at").limit(1000),
          client.from("studio_board_comments").select("*").in("board_id", ids).order("created_at").limit(2000),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (items.error) throw items.error;
    if (comments.error) throw comments.error;
    return NextResponse.json({ boards: boards ?? [], items: items.data ?? [], comments: comments.data ?? [] }, { headers });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin)
      throw new StudioError("Cross-origin writes are not allowed.", "FORBIDDEN", 403);
    if (Number(request.headers.get("content-length") ?? 0) > 20000)
      throw new StudioError("Request too large.", "VALIDATION", 413);
    let body: unknown;
    try { body = await request.json(); } catch { throw new StudioError("Valid JSON is required.", "VALIDATION"); }
    const { workspaceId, operation, input } = (body ?? {}) as { workspaceId?: unknown; operation?: unknown; input?: unknown };
    if (typeof workspaceId !== "string" || typeof operation !== "string" || !input || typeof input !== "object" || Array.isArray(input))
      throw new StudioError("The whiteboard request is invalid.", "VALIDATION", 422);
    const invalid = boardInputError(operation, input as Record<string, unknown>);
    if (invalid) throw new StudioError(invalid, "VALIDATION", 422);
    const { client } = await authorize(workspaceId);
    const { data, error } = await client.rpc("studio_board_mutate", { p_workspace: workspaceId, p_operation: operation, p_input: input });
    if (error) throw error;
    return NextResponse.json({ data }, { headers });
  } catch (error) {
    return failure(error);
  }
}
