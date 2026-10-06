import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { isTrustedOrigin } from "./request-origin";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PROFILE_PHOTO_BUCKET = "profile-photos";
export const PROFILE_PHOTO_TABLE = "studio_profile_photos";
export const MAX_PROFILE_PHOTO_BYTES = 3 * 1024 * 1024;
export const MAX_PROFILE_PHOTO_PIXELS = 40_000_000;
const MAX_MULTIPART_BYTES = MAX_PROFILE_PHOTO_BYTES + 16 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHOTO_COLUMNS = "user_id,path,revision,updated_at";
export const PROFILE_PHOTO_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
};

type PhotoRow = { user_id: string; path: string | null; revision: number; updated_at: string };
type BackendError = { code?: string; message?: string; statusCode?: string | number } | null;
export class ProfilePhotoError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

function failure(status: number, code: string, message: string): never {
  throw new ProfilePhotoError(status, code, message);
}
function backendFailure(error: BackendError): never {
  if (["42P01", "42703", "PGRST204", "PGRST205", "NoSuchBucket"].includes(error?.code ?? "") || /bucket.*not found/i.test(error?.message ?? "")) {
    failure(503, "SCHEMA_REQUIRED", "Profile photo setup is required. Ask the Fairway administrator to apply the reviewed profile-photo migration, then try again.");
  }
  failure(503, "PROFILE_PHOTO_UNAVAILABLE", "Profile photos are temporarily unavailable. Please try again.");
}
export function validProfilePhotoPath(path: string, userId: string) {
  const pieces = path.split("/");
  return UUID.test(userId) && pieces.length === 2 && pieces[0] === userId.toLowerCase() && pieces[1].endsWith(".jpg") && UUID.test(pieces[1].slice(0, -4)) && pieces[1] === pieces[1].toLowerCase();
}
export function expectedPhotoRevision(value: unknown): number {
  const number = typeof value === "string" && /^(0|[1-9]\d{0,9})$/.test(value) ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 0 || number > 2147483646) {
    failure(400, "INVALID_REVISION", "Reload your profile and try again.");
  }
  return number;
}
function guardRequest(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") failure(403, "CROSS_ORIGIN", "Open your profile in Fairway to change or view its photo.");
  if (request.method !== "GET" && !isTrustedOrigin(request, request.headers.get("origin"))) {
    failure(403, "CROSS_ORIGIN", "Open your profile in Fairway to change its photo.");
  }
}
export async function readBoundedPhotoBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) failure(413, "PHOTO_TOO_LARGE", "The prepared photo is too large. Choose a smaller image.");
  if (!request.body) failure(400, "EMPTY_BODY", "Choose a photo first.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        failure(413, "PHOTO_TOO_LARGE", "The prepared photo is too large. Choose a smaller image.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

/** Decode pixels rather than trusting file extensions, MIME labels, or metadata alone. */
export async function normalizeProfilePhoto(bytes: Uint8Array): Promise<Buffer> {
  if (!bytes.byteLength || bytes.byteLength > MAX_PROFILE_PHOTO_BYTES) failure(413, "PHOTO_TOO_LARGE", "The prepared photo must be no larger than 3 MB.");
  const input = Buffer.from(bytes);
  const jpeg = input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
  const png = input.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp = input.subarray(0, 4).toString() === "RIFF" && input.subarray(8, 12).toString() === "WEBP";
  if (!jpeg && !png && !webp) failure(415, "INVALID_PHOTO", "Choose a JPEG, PNG, or WebP photo.");
  try {
    const image = sharp(input, { limitInputPixels: MAX_PROFILE_PHOTO_PIXELS, failOn: "warning", sequentialRead: true });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width > 16384 || metadata.height > 16384 || metadata.width * metadata.height > MAX_PROFILE_PHOTO_PIXELS || (metadata.pages ?? 1) > 1 || !["jpeg", "png", "webp"].includes(metadata.format ?? "")) {
      failure(415, "INVALID_PHOTO", "Choose a still JPEG, PNG, or WebP photo under 40 megapixels.");
    }
    // toBuffer completes the decode. Sharp strips EXIF/GPS/XMP/ICC metadata unless explicitly retained.
    return await image.rotate().resize(512, 512, { fit: "cover", position: "centre" }).flatten({ background: "#ffffff" }).toColourspace("srgb").jpeg({ quality: 85 }).toBuffer();
  } catch (error) {
    if (error instanceof ProfilePhotoError) throw error;
    failure(415, "INVALID_PHOTO", "This photo could not be decoded safely. Choose another JPEG, PNG, or WebP image.");
  }
}
async function readPhoto(client: SupabaseClient, userId: string): Promise<PhotoRow | null> {
  const { data, error } = await client.from(PROFILE_PHOTO_TABLE).select(PHOTO_COLUMNS).eq("user_id", userId).maybeSingle();
  if (error) backendFailure(error);
  if (!data) return null;
  if (data.user_id !== userId || !Number.isSafeInteger(data.revision) || data.revision < 1 || (data.path !== null && (typeof data.path !== "string" || !validProfilePhotoPath(data.path, userId)))) backendFailure(null);
  return data as PhotoRow;
}
function snapshot(row: PhotoRow | null) { return { photo: row?.path ? row : null, revision: row?.revision ?? 0 }; }
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: PROFILE_PHOTO_HEADERS }); }
function conflict(): never { failure(409, "PHOTO_CONFLICT", "Your profile photo changed in another tab. Reload it before saving again."); }
async function removeUnused(client: SupabaseClient, path: string) {
  try { const { error } = await client.storage.from(PROFILE_PHOTO_BUCKET).remove([path]); return !error; } catch { return false; }
}
async function parsePhoto(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) failure(415, "INVALID_BODY", "Choose a photo with the profile photo editor.");
  const bytes = await readBoundedPhotoBody(request, MAX_MULTIPART_BYTES);
  let form: FormData;
  try { form = await new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: bytes as BodyInit }).formData(); }
  catch { failure(400, "INVALID_BODY", "The photo upload was incomplete. Please try again."); }
  if (Array.from(form.keys()).some(key => key !== "photo" && key !== "expectedRevision") || form.getAll("photo").length !== 1 || form.getAll("expectedRevision").length !== 1) failure(400, "INVALID_BODY", "The photo upload details are invalid.");
  const photo = form.get("photo");
  if (!photo || typeof photo === "string" || !["image/jpeg", "image/png", "image/webp"].includes(photo.type)) failure(415, "INVALID_PHOTO", "Choose a JPEG, PNG, or WebP photo.");
  if (photo.size > MAX_PROFILE_PHOTO_BYTES) failure(413, "PHOTO_TOO_LARGE", "The prepared photo must be no larger than 3 MB.");
  return { bytes: new Uint8Array(await photo.arrayBuffer()), revision: expectedPhotoRevision(form.get("expectedRevision")) };
}

/** User-scoped Supabase only. No service role, signed URLs, or client-supplied write owner. */
export async function handleProfilePhotoRequest(request: Request, createClient: () => Promise<SupabaseClient>): Promise<Response> {
  try {
    guardRequest(request);
    if (!["GET", "POST", "DELETE"].includes(request.method)) failure(405, "METHOD_NOT_ALLOWED", "This photo action is not supported.");
    const client = await createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) failure(401, "SIGN_IN_REQUIRED", "Sign in to manage your profile photo.");
    const ownerId = user.id.toLowerCase();
    // Bind the UI's intent to its displayed account, but never trust the header for ownership.
    // Cookies may have switched accounts in another tab while a crop was being prepared.
    if (request.method !== "GET" && request.headers.get("X-Fairway-Profile-User") !== user.id) {
      failure(409, "SESSION_CHANGED", "Your signed-in account changed. Reload your profile before changing its photo.");
    }
    const url = new URL(request.url);
    if (request.method === "GET") {
      const target = (url.searchParams.get("userId") ?? ownerId).toLowerCase();
      if (!UUID.test(target)) failure(400, "INVALID_USER", "This profile is unavailable.");
      const row = await readPhoto(client, target);
      if (url.searchParams.get("image") !== "1") return json(snapshot(row));
      if (!row?.path) failure(404, "PHOTO_NOT_FOUND", "This profile photo is unavailable.");
      const { data, error } = await client.storage.from(PROFILE_PHOTO_BUCKET).download(row.path);
      if (error || !data) {
        if (error && /bucket.*not found/i.test(error.message)) backendFailure(error);
        failure(404, "PHOTO_NOT_FOUND", "This profile photo is unavailable.");
      }
      if (data.size > MAX_PROFILE_PHOTO_BYTES) failure(415, "INVALID_PHOTO", "This profile photo is unavailable.");
      // Validate again: a malicious client can call Storage directly with a spoofed MIME type.
      const image = await normalizeProfilePhoto(new Uint8Array(await data.arrayBuffer()));
      // Recheck authorization/revision after the download/decode to avoid serving a removed/replaced photo.
      const current = await readPhoto(client, target);
      if (!current || current.path !== row.path || current.revision !== row.revision) failure(404, "PHOTO_NOT_FOUND", "This profile photo is unavailable.");
      return new Response(new Uint8Array(image), { headers: { ...PROFILE_PHOTO_HEADERS, "Content-Type": "image/jpeg", "Content-Disposition": 'inline; filename="profile-photo.jpg"', "Content-Length": String(image.length) } });
    }
    if (url.searchParams.has("userId")) failure(400, "INVALID_BODY", "You can change only your own profile photo.");
    if (request.method === "DELETE") {
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) failure(415, "INVALID_BODY", "The photo removal details are invalid.");
      const bytes = await readBoundedPhotoBody(request, 1024);
      let body: unknown;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { failure(400, "INVALID_BODY", "The photo removal details are invalid."); }
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !("expectedRevision" in body)) failure(400, "INVALID_BODY", "The photo removal details are invalid.");
      const expected = expectedPhotoRevision((body as { expectedRevision: unknown }).expectedRevision);
      const previous = await readPhoto(client, ownerId);
      if ((previous?.revision ?? 0) !== expected) conflict();
      if (!previous?.path) return json(snapshot(previous));
      // Keep the row as a tombstone. A stale save must not succeed after save/remove (ABA).
      const { data, error } = await client.from(PROFILE_PHOTO_TABLE).update({ path: null }).eq("user_id", ownerId).eq("revision", expected).select(PHOTO_COLUMNS).maybeSingle();
      if (error) backendFailure(error);
      if (!data) conflict();
      const cleaned = await removeUnused(client, previous.path);
      return json({ ...snapshot(data as PhotoRow), ...(cleaned ? {} : { warning: "The photo was removed from your profile, but an old private file could not be cleaned up." }) });
    }
    const upload = await parsePhoto(request);
    const previous = await readPhoto(client, ownerId);
    if ((previous?.revision ?? 0) !== upload.revision) conflict();
    const image = await normalizeProfilePhoto(upload.bytes);
    const path = `${ownerId}/${randomUUID()}.jpg`;
    const { error: uploadError } = await client.storage.from(PROFILE_PHOTO_BUCKET).upload(path, image, { contentType: "image/jpeg", cacheControl: "0", upsert: false });
    if (uploadError) backendFailure(uploadError);
    let saved: PhotoRow | null = null;
    let writeError: BackendError = null;
    try {
      const query = previous
        ? client.from(PROFILE_PHOTO_TABLE).update({ path }).eq("user_id", ownerId).eq("revision", upload.revision)
        : client.from(PROFILE_PHOTO_TABLE).insert({ user_id: ownerId, path });
      const result = await query.select(PHOTO_COLUMNS).maybeSingle();
      saved = result.data as PhotoRow | null; writeError = result.error;
    } catch { writeError = { code: "UNCERTAIN_WRITE" }; }
    if (!saved) {
      // A transport error may occur after commit. Never delete a possibly active upload.
      const current = await readPhoto(client, ownerId);
      if (current?.path === path) saved = current;
      else {
        await removeUnused(client, path);
        if (!writeError || writeError.code === "23505" || (current?.revision ?? 0) !== upload.revision) conflict();
        backendFailure(writeError);
      }
    }
    const cleaned = !previous?.path || await removeUnused(client, previous.path);
    return json({ ...snapshot(saved), ...(cleaned ? {} : { warning: "The photo was saved, but an old private file could not be cleaned up." }) });
  } catch (error) {
    if (error instanceof ProfilePhotoError) return json({ error: error.message, code: error.code }, error.status);
    return json({ error: "Profile photos are temporarily unavailable. Please try again.", code: "PROFILE_PHOTO_UNAVAILABLE" }, 503);
  }
}
