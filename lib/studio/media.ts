/** Shared upload contract. AI/export image limits intentionally remain separate. */
export const MAX_MEDIA_BYTES = 100_000_000;
export const MEDIA_BUCKET = "workspace-media";
export const PREVIEW_BUCKET = "studio-media-previews";
export const MEDIA_PREFIX = `supabase-storage://${MEDIA_BUCKET}/`;
export const MEDIA_RECIPE = "review-v1";
export const MEDIA_ACCEPT = ".jpg,.jpeg,.png,.gif,.webp,.avif,.heic,.heif,.mp3,.mp4,.mov,.mkv,image/jpeg,image/png,image/gif,image/webp,image/avif,image/heic,image/heif,audio/mpeg,video/mp4,video/quicktime,video/x-matroska";
export const MEDIA_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", avif: "image/avif", heic: "image/heic", heif: "image/heif",
  mp3: "audio/mpeg", mp4: "video/mp4", mov: "video/quicktime", mkv: "video/x-matroska",
};
export const MEDIA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function mediaKind(type: string): "image" | "video" | "audio" { return type.startsWith("video/") ? "video" : type.startsWith("audio/") ? "audio" : "image"; }
export function inferMediaType(name: string, supplied = ""): string | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const expected = MEDIA_TYPES[ext];
  if (!expected) return null;
  const aliases: Record<string, string> = {"audio/mp3":"audio/mpeg", "audio/x-mp3":"audio/mpeg", "video/matroska":"video/x-matroska", "application/x-matroska":"video/x-matroska", "image/heic-sequence":"image/heic", "image/heif-sequence":"image/heif", "image/jpg":"image/jpeg"};
  const type = supplied.split(";")[0].trim().toLowerCase();
  const normalized = aliases[type] ?? type;
  const heifFamily = ["image/heic", "image/heif"].includes(expected) && ["image/heic", "image/heif"].includes(normalized);
  return !type || type === "application/octet-stream" || normalized === expected || heifFamily ? expected : null;
}
export function isMediaPath(path: string, workspaceId: string, userId?: string) {
  const p = path.split("/");
  return p.length === 3 && MEDIA_UUID.test(workspaceId) && p[0] === workspaceId && MEDIA_UUID.test(p[1]) && (!userId || p[1] === userId) && /^[a-zA-Z0-9_-]+\.(avif|gif|jpe?g|png|webp|heic|heif|mp3|mp4|mov|mkv)$/.test(p[2]);
}
export function validateMediaSize(size: number) { return Number.isSafeInteger(size) && size > 0 && size <= MAX_MEDIA_BYTES; }
export type MediaState = "queued" | "processing" | "ready" | "failed" | "blocked";
export type MediaJob = {
  id: string; file_id: string; workspace_id: string; created_by: string; source_path: string;
  source_size: number; source_type: string; source_sha256: string | null; recipe: string;
  status: MediaState; attempts: number; lease_id: string | null; lease_until: string | null;
  preview_path: string | null; preview_type: string | null; preview_size: number | null;
  preview_sha256: string | null; original_ready: boolean; error_code: string | null;
  error_message: string | null; metadata: Record<string, unknown>; updated_at: string;
};
export function mediaPreviewUrl(fileId: string) { return `/api/studio/media?id=${encodeURIComponent(fileId)}&variant=preview`; }
export function mediaOriginalUrl(fileId: string) { return `/api/studio/media?id=${encodeURIComponent(fileId)}&variant=original&download=1`; }
