import { NextRequest, NextResponse } from "next/server";
import { StudioError, uuidPattern } from "@/lib/studio/contracts";
import { authorize, databaseError } from "@/lib/studio/server";
import {
  MEDIA_BUCKET,
  MEDIA_PREFIX,
  MAX_MEDIA_BYTES,
  inferMediaType,
  isMediaPath,
} from "@/lib/studio/media";
import { mediaService } from "@/lib/studio/media/jobs";
import { scheduleMediaProcessing } from "@/lib/studio/media/dispatch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function responseError(error: unknown) {
  const known =
    error instanceof StudioError
      ? error
      : databaseError(error as { code?: string; message?: string });
  return NextResponse.json(
    { error: known.message, code: known.code },
    { status: known.status, headers: { "Cache-Control": "private, no-store" } },
  );
}

function validInput(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  if (
    typeof value.asset_id !== "string" ||
    !uuidPattern.test(value.asset_id) ||
    (value.kind !== "reference" && value.kind !== "file")
  )
    return false;
  if (value.action === "visibility") return typeof value.private === "boolean";
  if (value.action === "delete") return true;
  if (value.action === "copy")
    return (
      typeof value.destination_workspace_id === "string" &&
      uuidPattern.test(value.destination_workspace_id)
    );
  if (value.action === "replace")
    return (
      value.kind === "file" &&
      typeof value.replacement_asset_id === "string" &&
      uuidPattern.test(value.replacement_asset_id)
    );
  return false;
}

async function copyUploadedFile(
  client: Awaited<ReturnType<typeof authorize>>["client"],
  workspaceId: string,
  destinationId: string,
  actorId: string,
  assetId: string,
) {
  const { data: file, error } = await client
    .from("workspace_files")
    .select("id,workspace_id,added_by,title,url,provider,context_note,tags,permission_scope")
    .eq("workspace_id", workspaceId)
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw databaseError(error);
  if (!file) throw new StudioError("This Library asset is unavailable.", "NOT_FOUND", 404);
  if (!file.url.startsWith(MEDIA_PREFIX)) return null;

  const sourcePath = file.url.slice(MEDIA_PREFIX.length);
  if (!isMediaPath(sourcePath, workspaceId)) {
    throw new StudioError("This uploaded original is unavailable.", "NOT_FOUND", 404);
  }

  const storage = mediaService();
  const { data: original, error: downloadError } = await storage.storage
    .from(MEDIA_BUCKET)
    .download(sourcePath);
  if (downloadError || !original || original.size <= 0 || original.size > MAX_MEDIA_BYTES) {
    throw new StudioError("The uploaded original is unavailable or too large to copy.", "VALIDATION", 422);
  }
  const extension = sourcePath.split(".").pop()?.toLowerCase() || "";
  const contentType = inferMediaType(`original.${extension}`, original.type);
  if (!contentType) throw new StudioError("This file type cannot be copied.", "VALIDATION", 422);

  const destinationPath = `${destinationId}/${actorId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await storage.storage.from(MEDIA_BUCKET).upload(destinationPath, original, {
    contentType,
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) throw databaseError(uploadError);

  const { data, error: registerError } = await client.rpc("studio_register_media", {
    w: destinationId,
    p: destinationPath,
    t: file.title,
    n: file.context_note ?? "",
    tags_in: file.tags ?? [],
  });
  if (registerError || !data) {
    await storage.storage.from(MEDIA_BUCKET).remove([destinationPath]);
    throw registerError
      ? databaseError(registerError)
      : new StudioError("The media copy could not be registered.", "DATABASE_ERROR", 503);
  }
  if (data.job?.status === "queued") scheduleMediaProcessing([data.job.id]);
  return { id: data.id, kind: "file", workspace_id: destinationId, private: false };
}

async function cleanupRemovedMedia(
  data: Record<string, unknown>,
  workspaceId: string,
  actorId: string,
  urlKey: "url" | "old_url",
) {
  const url = typeof data[urlKey] === "string" ? data[urlKey] as string : "";
  if (!url.startsWith(MEDIA_PREFIX)) return { ...data, cleanupWarning: false };
  const path = url.slice(MEDIA_PREFIX.length);
  if (!isMediaPath(path, workspaceId, actorId)) {
    return { ...data, cleanupWarning: true };
  }
  try {
    const storage = mediaService();
    const previews = Array.isArray(data.preview_paths)
      ? data.preview_paths.filter(
          (candidate): candidate is string =>
            typeof candidate === "string" &&
            candidate.startsWith(`${workspaceId}/`) &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|mp4)$/i.test(candidate),
        )
      : [];
    const [{ error: originalError }, { error: previewError }] = await Promise.all([
      storage.storage.from(MEDIA_BUCKET).remove([path]),
      previews.length
        ? storage.storage.from("studio-media-previews").remove(previews)
        : Promise.resolve({ error: null }),
    ]);
    return { ...data, cleanupWarning: Boolean(originalError || previewError) };
  } catch {
    return { ...data, cleanupWarning: true };
  }
}

export async function POST(request: NextRequest) {
  try {
    if (
      request.headers.get("origin") &&
      request.headers.get("origin") !== request.nextUrl.origin
    ) {
      throw new StudioError("Cross-origin writes are not allowed.", "FORBIDDEN", 403);
    }
    if (Number(request.headers.get("content-length") ?? 0) > 12_000) {
      throw new StudioError("Request too large.", "VALIDATION", 413);
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new StudioError("Valid JSON is required.", "VALIDATION");
    }
    if (
      !isRecord(body) ||
      typeof body.workspaceId !== "string" ||
      !uuidPattern.test(body.workspaceId) ||
      !validInput(body.input)
    ) {
      throw new StudioError("The Library request is invalid.", "VALIDATION");
    }

    const workspaceId = body.workspaceId;
    const input = body.input;
    const { client, user } = await authorize(workspaceId);

    if (input.action === "copy") {
      const destinationId = String(input.destination_workspace_id);
      await authorize(destinationId);
      if (input.kind === "file") {
        const copied = await copyUploadedFile(
          client,
          workspaceId,
          destinationId,
          user.id,
          String(input.asset_id),
        );
        if (copied) {
          return NextResponse.json(
            { data: copied },
            { headers: { "Cache-Control": "private, no-store" } },
          );
        }
      }
    }

    const replacement = input.action === "replace";
    const { data, error } = await client.rpc("studio_library_mutate", {
      p_workspace: workspaceId,
      p_destination: replacement
        ? input.replacement_asset_id
        : input.action === "copy"
          ? input.destination_workspace_id
          : null,
      p_asset: input.asset_id,
      p_kind: input.kind,
      p_action: input.action,
      p_private: input.action === "visibility" ? input.private : null,
    });
    if (error) throw databaseError(error);
    if (!data || typeof data !== "object") {
      return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
    }

    if (input.action === "delete" && input.kind === "file") {
      const cleaned = await cleanupRemovedMedia(data, workspaceId, user.id, "url");
      return NextResponse.json(
        { data: cleaned },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (replacement) {
      const cleaned = await cleanupRemovedMedia(data, workspaceId, user.id, "old_url");
      return NextResponse.json(
        { data: cleaned },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return responseError(error);
  }
}
