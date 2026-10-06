import { timingSafeEqual } from "node:crypto";
import { authorize, databaseError } from "@/lib/studio/server";
import { isSameOriginWrite } from "@/lib/studio/request-origin";
import { StudioError, uuidPattern } from "@/lib/studio/contracts";
import {
  JOB_TABLE,
  createGeneration,
  generationService,
  generationSetup,
  readDraftOutput,
  retainGeneration,
  runGeneration,
  type GenerationJob,
} from "@/lib/studio/generation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;
const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  const e =
    error instanceof StudioError
      ? error
      : new StudioError(
          "Image jobs are temporarily unavailable. Your originals have not changed.",
          "GENERATION_ERROR",
          503,
        );
  return Response.json(
    { error: e.message, code: e.code },
    { status: e.status, headers },
  );
}
function validId(value: unknown) {
  if (typeof value !== "string" || !uuidPattern.test(value))
    throw new StudioError(
      "A valid workspace or job ID is required.",
      "VALIDATION",
    );
  return value;
}
async function ownJob(workspaceId: string, id: string) {
  const { client, user } = await authorize(workspaceId);
  const { data, error } = await client
    .from(JOB_TABLE)
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .eq("created_by", user.id)
    .maybeSingle();
  if (error) throw databaseError(error);
  if (!data) throw new StudioError("Job not found.", "NOT_FOUND", 404);
  return { job: data as GenerationJob, user };
}
export async function GET(request: Request) {
  try {
    const url = new URL(request.url),
      workspaceId = validId(url.searchParams.get("workspaceId"));
    if (url.searchParams.get("output") !== null) {
      const { job } = await ownJob(
        workspaceId,
        validId(url.searchParams.get("jobId")),
      );
      const index = Number(url.searchParams.get("output"));
      if (!Number.isInteger(index) || index < 0)
        throw new StudioError("Invalid output.", "VALIDATION");
      const blob = await readDraftOutput(job, index);
      return new Response(blob, {
        headers: {
          ...headers,
          "Content-Type": blob.type,
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    const { client, user } = await authorize(workspaceId);
    let query = client
      .from(JOB_TABLE)
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("created_by", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    const projectId = url.searchParams.get("projectId");
    if (projectId) query = query.eq("project_id", validId(projectId));
    const { data, error } = await query;
    if (error) throw databaseError(error);
    return Response.json({ jobs: data, ...generationSetup() }, { headers });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    if (!isSameOriginWrite(request)) return Response.json({error:"Cross-origin writes are not allowed."},{status:403});
    const text = await request.text();
    if (text.length > 16000)
      throw new StudioError("Request is too large.", "VALIDATION", 413);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
    } catch {
      throw new StudioError("Invalid request.", "VALIDATION");
    }
    if (!body || Array.isArray(body) || typeof body !== "object")
      throw new StudioError("Invalid request.", "VALIDATION");
    if (body.action === "worker") {
      const secret = process.env.STUDIO_IMAGE_WORKER_SECRET;
      const supplied = request.headers.get("authorization") || "";
      const expected = `Bearer ${secret || ""}`;
      if (
        !secret ||
        Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
      )
        throw new StudioError(
          "Worker authorization required.",
          "UNAUTHENTICATED",
          401,
        );
      const job = await runGeneration();
      return Response.json(
        { processed: Boolean(job), jobId: job?.id ?? null },
        { headers },
      );
    }
    const workspaceId = validId(body.workspaceId);
    if (body.action === "create") {
      const { client, user } = await authorize(workspaceId);
      const job = await createGeneration(client, workspaceId, user.id, body);
      return Response.json({ job }, { status: 202, headers });
    }
    const { job, user } = await ownJob(workspaceId, validId(body.jobId));
    if (body.action === "run")
      return Response.json(
        { job: (await runGeneration(job.id)) ?? job },
        { headers },
      );
    if (body.action === "retain")
      return Response.json(
        { versionIds: await retainGeneration(job, user.id) },
        { headers },
      );
    const service = generationService();
    let query;
    if (body.action === "cancel")
      query = service
        .from(JOB_TABLE)
        .update({
          status: "cancelled",
          lease_id: null,
          lease_until: null,
          error:
            "Cancelled. Provider charges already incurred may still apply.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .in("status", ["queued", "running"]);
    else if (body.action === "retry") {
      if (job.attempts >= 3)
        throw new StudioError(
          "The three-attempt limit has been reached. Start a new request.",
          "ATTEMPT_LIMIT",
          422,
        );
      query = service
        .from(JOB_TABLE)
        .update({
          status: "queued",
          next_attempt_at: new Date().toISOString(),
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("status", "failed");
    } else throw new StudioError("Unknown image job action.", "VALIDATION");
    const { data, error } = await query.select("*").maybeSingle();
    if (error) throw databaseError(error);
    return Response.json({ job: data ?? job }, { headers });
  } catch (error) {
    return failure(error);
  }
}
