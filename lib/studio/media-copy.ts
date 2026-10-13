import { StudioError } from "./contracts";
import { authorize, databaseError } from "./server";
import { MEDIA_BUCKET, MEDIA_PREFIX, MAX_MEDIA_BYTES, inferMediaType, isMediaPath } from "./media";
import { mediaService } from "./media/jobs";
import { scheduleMediaProcessing } from "./media/dispatch";
export async function copyUploadedFile(
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

