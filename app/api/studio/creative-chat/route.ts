import { OPENAI_TEXT_MODEL, openaiConfigured, studioOpenAI } from "@/lib/studio/openai-ai";
import { createHash } from "node:crypto";
import { generateText } from "ai";
import { authorize, databaseError } from "@/lib/studio/server";
import { StudioError, uuidPattern } from "@/lib/studio/contracts";
import { isSameOriginWrite } from "@/lib/studio/request-origin";
import {
  creativeHistory,
  golfStudioSystem,
  validateCreativePrompt,
} from "@/lib/studio/creative-chat";
import {
  createGeneration,
  generationService,
  JOB_TABLE,
  readDraftOutput,
  validateContext,
  detectImageType,
  type GenerationJob,
} from "@/lib/studio/generation";

export const runtime = "nodejs";
export const maxDuration = 120;
const headers = { "Cache-Control": "private, no-store" };
const CHATS = "studio_creative_chats",
  TURNS = "studio_creative_turns";
function fail(e: unknown) {
  const known = e instanceof StudioError;
  return Response.json(
    {
      error: known
        ? e.message
        : "The request could not finish. Your saved conversation is still available.",
    },
    { status: known ? e.status : 502, headers },
  );
}
function id(value: unknown) {
  if (typeof value !== "string" || !uuidPattern.test(value))
    throw new StudioError("A valid ID is required.", "VALIDATION");
  return value;
}
async function access(workspaceId: string, chatId: string) {
  const auth = await authorize(workspaceId);
  const { data: chat, error } = await auth.client
    .from(CHATS)
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", id(chatId))
    .maybeSingle();
  if (error) throw databaseError(error);
  if (!chat) throw new StudioError("Conversation not found.", "NOT_FOUND", 404);
  return { ...auth, chat };
}
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams,
      workspaceId = id(q.get("workspaceId"));
    if (!q.get("chatId")) {
      const { client } = await authorize(workspaceId);
      let query = client.from(CHATS).select("*").eq("workspace_id", workspaceId);
      if (q.get("projectId")) query = query.eq("project_id", id(q.get("projectId")));
      const { data, error } = await query.order("created_at", {ascending:false}).limit(100);
      if (error) throw databaseError(error);
      return Response.json({ chats: data }, { headers });
    }
    const { client, chat } = await access(workspaceId, id(q.get("chatId")));
    const { data, error } = await client
      .from(TURNS)
      .select("*")
      .eq("chat_id", chat.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw databaseError(error);
    const turns = (data || []).reverse();
    const jobIds = turns.flatMap((t) => (t.job_id ? [t.job_id] : []));
    const service = generationService();
    const result = jobIds.length
      ? await service
          .from(JOB_TABLE)
          .select("*")
          .eq("workspace_id", workspaceId)
          .in("id", jobIds)
      : { data: [], error: null };
    if (result.error) throw databaseError(result.error);
    if (q.has("output")) {
      const job = result.data?.find((j) => j.id === q.get("jobId")) as
        | GenerationJob
        | undefined;
      const index = Number(q.get("output"));
      if (
        !job ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= job.outputs.length
      )
        throw new StudioError("Image not found.", "NOT_FOUND", 404);
      const blob = await readDraftOutput(job, index);
      return new Response(blob, {
        headers: {
          ...headers,
          "Content-Type": blob.type,
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    // Do not expose provider metadata or internal storage paths to shared chats.
    return Response.json(
      {
        chat,
        turns,
        jobs: result.data?.map((j) => ({
          id: j.id,
          status: j.status,
          created_by: j.created_by,
          project_id: j.project_id,
          error: j.error,
          outputs: j.outputs.map((o: { versionId: string }) => ({
            versionId: o.versionId,
          })),
          retained_version_ids: j.retained_version_ids,
        })),
      },
      { headers },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  let pendingId: string | undefined;
  try {
    if (!isSameOriginWrite(request))
      throw new StudioError(
        "Cross-origin writes are not allowed.",
        "FORBIDDEN",
        403,
      );
    const raw = await request.text();
    if (raw.length > 16000)
      throw new StudioError("Request too large.", "VALIDATION", 413);
    let b;
    try {
      b = JSON.parse(raw);
    } catch {
      throw new StudioError("Valid JSON is required.", "VALIDATION");
    }
    const workspaceId = id(b.workspaceId),
      requestId = id(b.requestId);
    if (b.action === "create") {
      const { user, client } = await authorize(workspaceId);
      const projectId = b.projectId ? id(b.projectId) : null;
      if (projectId) {
        const {data,error} = await client.from("studio_projects").select("id").eq("workspace_id",workspaceId).eq("id",projectId).maybeSingle();
        if(error)throw databaseError(error);if(!data)throw new StudioError("Project unavailable.","NOT_FOUND",404);
      }
      const title = String(b.title || "New creative conversation")
        .trim()
        .slice(0, 120);
      if (!title || !["private", "workspace"].includes(b.visibility))
        throw new StudioError("Choose a title and visibility.", "VALIDATION");
      const service = generationService();
      const { data, error } = await service
        .from(CHATS)
        .insert({
          id: requestId,
          workspace_id: workspaceId,
          created_by: user.id,
          title,
          visibility: b.visibility,
          project_id: projectId,
        })
        .select()
        .single();
      if (error?.code === "23505") {
        const existing = await access(workspaceId, requestId);
        if (existing.chat.created_by !== user.id)
          throw new StudioError("Request conflict.", "CONFLICT", 409);
        return Response.json({ chat: existing.chat }, { headers });
      }
      if (error) throw databaseError(error);
      return Response.json({ chat: data }, { headers });
    }
    const { client, user, chat } = await access(workspaceId, id(b.chatId));
    if (b.action !== "send")
      throw new StudioError("Unknown action.", "VALIDATION");
    let prompt: string;
    try {
      prompt = validateCreativePrompt(b.prompt);
    } catch (e) {
      throw new StudioError((e as Error).message, "VALIDATION");
    }
    if (!["chat", "image", "comment"].includes(b.mode))
      throw new StudioError("Choose chat, image, or comment.", "VALIDATION");
    if (b.mode !== "comment" && b.consent !== true)
      throw new StudioError(
        "Acknowledge AI usage before sending.",
        "VALIDATION",
      );
    if (
      b.mode === "chat" &&
      !openaiConfigured()
    )
      throw new StudioError(
        "OpenAI is not connected yet. The project owner must add OPENAI_API_KEY and redeploy. No AI request was sent.",
        "SETUP_REQUIRED",
        503,
      );
    const sourceVersionId = b.sourceVersionId ? id(b.sourceVersionId) : null;
    const projectId = b.projectId ? id(b.projectId) : null;
    if (chat.project_id && chat.project_id !== projectId) throw new StudioError("This conversation belongs to a different artboard.","VALIDATION");
    const referenceVersionIds = b.referenceVersionIds || [];
    if (!Array.isArray(referenceVersionIds) || referenceVersionIds.length > 3) throw new StudioError("Choose up to three references.","VALIDATION");
    referenceVersionIds.forEach(id);
    if (b.count != null && b.count !== 1 && b.count !== 2) throw new StudioError("Choose one or two variations.","VALIDATION");
    if (b.mode === "image" && !projectId)
      throw new StudioError(
        "Select a project for your image versions.",
        "VALIDATION",
      );
    let project = null;
    if (projectId) {
      const result = await client
        .from("studio_projects")
        .select("id,title,brief,category")
        .eq("workspace_id", workspaceId)
        .eq("id", projectId)
        .maybeSingle();
      if (result.error) throw databaseError(result.error);
      if (!result.data)
        throw new StudioError("Project not found.", "NOT_FOUND", 404);
      project = result.data;
    }
    if (sourceVersionId) {
      const { data, error } = await client
        .from("studio_versions")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("project_id", projectId)
        .eq("id", sourceVersionId)
        .maybeSingle();
      if (error) throw databaseError(error);
      if (!data)
        throw new StudioError(
          "Select an image version from this project.",
          "VALIDATION",
        );
    }
    const hash = createHash("sha256")
      .update(
        JSON.stringify({ prompt, mode: b.mode, projectId, sourceVersionId, ...(referenceVersionIds.length ? {referenceVersionIds} : {}), ...(b.count === 2 ? {count:2} : {}), ...(b.kitVersionId ? {kitVersionId:id(b.kitVersionId)} : {}) }),
      )
      .digest("hex");
    const service = generationService();
    const existing = await service
      .from(TURNS)
      .select("*")
      .eq("id", requestId)
      .maybeSingle();
    if (existing.error) throw databaseError(existing.error);
    if (existing.data) {
      if (
        existing.data.chat_id !== chat.id ||
        existing.data.author_id !== user.id ||
        existing.data.request_hash !== hash
      )
        throw new StudioError("Request ID already used.", "CONFLICT", 409);
      return Response.json({ turn: existing.data }, { headers });
    }
    // A terminated server request must not lock a conversation indefinitely.
    const expired = await service
      .from(TURNS)
      .update({
        status: "failed",
        error: "Request interrupted. Send again to continue.",
      })
      .eq("chat_id", chat.id)
      .eq("status", "pending")
      .lt("created_at", new Date(Date.now() - 180000).toISOString());
    if (expired.error) throw databaseError(expired.error);
    const inserted = await service
      .from(TURNS)
      .insert({
        id: requestId,
        workspace_id: workspaceId,
        chat_id: chat.id,
        author_id: user.id,
        prompt,
        mode: b.mode,
        request_hash: hash,
        source_version_id: sourceVersionId,
      })
      .select()
      .single();
    if (inserted.error?.code === "23505")
      throw new StudioError(
        "A request is already being saved. Refresh the conversation before sending again.",
        "CONFLICT",
        409,
      );
    if (inserted.error) throw databaseError(inserted.error);
    pendingId = requestId;
    let answer = "",
      jobId: string | null = null;
    if (b.mode === "image") {
      const job = await createGeneration(client, workspaceId, user.id, {
        idempotencyKey: requestId,
        projectId,
        sourceVersionId,
        kitVersionId: b.kitVersionId ? id(b.kitVersionId) : null,
        referenceVersionIds,
        prompt,
        target: "design",
        palette: "",
        preserve: sourceVersionId
          ? "Preserve the source design except for the changes requested."
          : "",
        count: b.count || 1,
      });
      jobId = job.id;
      answer =
        "Image request saved. Successful results are saved to the artboard for editing and team review.";
    } else if (b.mode === "chat") {
      const { data: history, error } = await client
        .from(TURNS)
        .select("prompt,answer,mode,status")
        .eq("chat_id", chat.id)
        .eq("status", "complete")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw databaseError(error);
      let image: Uint8Array | undefined;
      if (sourceVersionId && projectId) {
        const context = await validateContext(client, workspaceId, user.id, {
          projectId,
          sourceVersionId,
          kitVersionId: null,
          prompt,
          target: "critique",
          palette: "",
          preserve: "",
          count: 1,
        });
        const downloaded = await client.storage
          .from("workspace-media")
          .download(context.sourcePath!);
        if (
          downloaded.error ||
          !downloaded.data ||
          downloaded.data.size > 10 * 1024 * 1024
        )
          throw new StudioError(
            "Source image unavailable or larger than 10 MB.",
            "SOURCE_UNAVAILABLE",
            422,
          );
        image = new Uint8Array(await downloaded.data.arrayBuffer());
        if (!detectImageType(image))
          throw new StudioError(
            "Select a PNG, JPEG, or WebP image.",
            "SOURCE_UNAVAILABLE",
            422,
          );
      }
      const result = await generateText({
        model: studioOpenAI()(OPENAI_TEXT_MODEL),
        providerOptions: { openai: { store: false, reasoningEffort: "low", reasoningSummary: null } },
        system: golfStudioSystem(project),
        messages: [
          ...creativeHistory((history || []).reverse()),
          {
            role: "user",
            content: image
              ? [
                  { type: "text", text: prompt },
                  { type: "image", image },
                ]
              : prompt,
          },
        ],
        maxOutputTokens: 1800,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(90000),
      });
      answer = result.text;
    }
    const completed = await service
      .from(TURNS)
      .update({ status: "complete", answer, job_id: jobId })
      .eq("id", requestId)
      .eq("status", "pending")
      .select()
      .single();
    if (completed.error) throw databaseError(completed.error);
    pendingId = undefined;
    return Response.json({ turn: completed.data }, { headers });
  } catch (e) {
    if (pendingId)
      await generationService()
        .from(TURNS)
        .update({
          status: "failed",
          error:
            e instanceof StudioError
              ? e.message
              : "Request interrupted. Send again to continue.",
        })
        .eq("id", pendingId)
        .eq("status", "pending");
    return fail(e);
  }
}
