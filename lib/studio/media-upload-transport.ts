import { Upload, type DetailedError } from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import { MEDIA_BUCKET } from "@/lib/studio/media";
import type { RegistrationInput, RegisteredMedia, StagedMedia } from "./media-upload-controller";

export const MEDIA_TUS_CHUNK_SIZE = 6 * 1024 * 1024;
const APPROVED_PROJECT = "xljhxmyigtxhjtxxzuwk";
export const MEDIA_TUS_ENDPOINT = `https://${APPROVED_PROJECT}.storage.supabase.co/storage/v1/upload/resumable`;

export function isApprovedMediaUploadUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const endpoint = new URL(MEDIA_TUS_ENDPOINT);
    return url.origin === endpoint.origin && !url.username && !url.password && !url.search && !url.hash && (url.pathname === endpoint.pathname || url.pathname.startsWith(`${endpoint.pathname}/`));
  } catch { return false; }
}

export function mediaUploadFingerprint(item: StagedMedia, userId: string): string {
  return JSON.stringify(["fairway-media-v1", MEDIA_BUCKET, userId, item.path, item.file.name, item.file.size, item.file.lastModified, item.type]);
}

function safeUploadError(error: Error | DetailedError): Error {
  const status = "originalResponse" in error ? error.originalResponse?.getStatus() : 0;
  if (status === 401) return new Error("Your session expired. Sign in again, then retry this file.");
  if (status === 403) return new Error("You no longer have permission to upload here. Check your workspace access before retrying.");
  if (status === 409) return new Error("This original may already be uploaded. Retry to verify and save the same file.");
  if (status === 413) return new Error("Storage rejected the file size. The workspace storage limit must support 100 MB uploads.");
  if (typeof navigator !== "undefined" && !navigator.onLine) return new Error("You're offline. Reconnect, then retry to resume this upload.");
  // Do not expose TUS URLs, bearer headers, or raw provider responses in UI/logs.
  return new Error(`The upload was interrupted${status ? ` (storage response ${status})` : " (no storage response)"}. Retry to resume the same file.`);
}

export async function uploadMediaOriginal(item: StagedMedia, userId: string, signal: AbortSignal, onProgress: (percentage: number) => void): Promise<void> {
  signal.throwIfAborted();
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("You're offline. Reconnect, then retry to resume this upload.");
  const supabase = createClient();
  async function token(): Promise<string> {
    signal.throwIfAborted();
    let { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) throw new Error("Sign in again, then retry this file.");
    if (session.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error || !refreshed.data.session) throw new Error("Your session expired. Sign in again, then retry this file.");
      session = refreshed.data.session;
    }
    if (session.user.id !== userId) throw new Error("Your signed-in account changed. Return to the original account before retrying this upload.");
    return session.access_token;
  }
  await token();
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", cancel);
      error ? reject(error) : resolve();
    };
    const upload = new Upload(item.file, {
      endpoint: MEDIA_TUS_ENDPOINT,
      chunkSize: MEDIA_TUS_CHUNK_SIZE,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      retryDelays: [0, 1_000, 3_000, 5_000, 10_000],
      // XHR appends repeated header values. Set Authorization exactly once per
      // request in onBeforeRequest, never both here and in that callback.
      headers: {},
      metadata: { bucketName: MEDIA_BUCKET, objectName: item.path, contentType: item.type, cacheControl: "0" },
      fingerprint: async () => mediaUploadFingerprint(item, userId),
      onBeforeRequest: async (request) => {
        // Refresh before each chunk, never change the account or immutable object path.
        try {
          if (settled) throw new Error("This upload is no longer active. Retry to continue.");
          if (!isApprovedMediaUploadUrl(request.getURL())) throw new Error("This upload resume address is not part of the approved workspace storage.");
          request.setHeader("authorization", `Bearer ${await token()}`);
        }
        catch (error) { finish(error); throw error; }
      },
      onShouldRetry: (error) => {
        if (settled || signal.aborted || (typeof navigator !== "undefined" && !navigator.onLine)) return false;
        const status = "originalResponse" in error ? error.originalResponse?.getStatus() ?? 0 : 0;
        return status === 0 || status === 408 || status === 423 || status === 429 || status >= 500;
      },
      onProgress: (sent, total) => { if (!settled && !signal.aborted) onProgress(total ? sent / total * 100 : 0); },
      onError: (error) => {
        // A dropped final response can leave a completed immutable object behind.
        // Recover that same path, never overwrite it or generate another canonical ID.
        const status = "originalResponse" in error ? error.originalResponse?.getStatus() ?? 0 : 0;
        if (status === 409 || status === 400) {
          void (async () => {
            const folder = item.path.slice(0, item.path.lastIndexOf("/"));
            const name = item.path.slice(item.path.lastIndexOf("/") + 1);
            try {
              const result = await supabase.storage.from(MEDIA_BUCKET).list(folder, { search: name, limit: 100 });
              const existing = result.data?.find((file) => file.name === name);
              if (!signal.aborted && !result.error && Number(existing?.metadata?.size) === item.file.size && existing?.metadata?.mimetype === item.type) {
                onProgress(100);
                // Registration still verifies the actual stored header, type and size.
                finish();
                return;
              }
            } catch { /* Show the sanitized upload failure below. */ }
            finish(safeUploadError(error));
          })();
        } else finish(safeUploadError(error));
      },
      onSuccess: () => finish(),
    });
    function cancel() {
      // Pause the resource, preserving its fingerprint for retry. Never upsert or delete originals.
      void upload.abort(false).catch(() => undefined);
      finish(new DOMException("Upload canceled", "AbortError"));
    }
    signal.addEventListener("abort", cancel, { once: true });
    void (async () => {
      try {
        // Browsers may deny localStorage. Uploads still work without resume discovery.
        const previous = await upload.findPreviousUploads().catch(() => []);
        if (signal.aborted) { cancel(); return; }
        const match = previous.find((candidate) => isApprovedMediaUploadUrl(candidate.uploadUrl) && !candidate.parallelUploadUrls?.length && candidate.metadata.bucketName === MEDIA_BUCKET && candidate.metadata.objectName === item.path && candidate.size === item.file.size);
        if (match) upload.resumeFromPreviousUpload(match);
        upload.start();
      } catch (error) { finish(error instanceof Error ? new Error("Upload resume information could not be read. Retry this file.") : error); }
    })();
  });
}

export async function registerMediaOriginal(input: RegistrationInput, signal: AbortSignal): Promise<RegisteredMedia> {
  const response = await fetch("/api/studio/media", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 401 ? "Sign in again, then retry to save this uploaded original." : body.error || "The original uploaded but could not be saved to Library. Retry to register the same file.");
  if (typeof body.id !== "string" || !body.id) throw new Error("The original uploaded but its Library ID was not returned. Retry to recover it.");
  return { id: body.id, job: body.job ?? null, worker: body.worker ?? { available: false, automatic: false, code: "status_unavailable", message: "Preview processing status is unavailable." } };
}
