import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET, MAX_MEDIA_BYTES } from "../media";
import { MediaError } from "./validation";
export const PRIVATE_HEADERS = {"Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff", "Referrer-Policy":"no-referrer"};
export function approvedStorageUrl(value: string) {
  const u = new URL(value);
  if (u.protocol !== "https:" || !["xljhxmyigtxhjtxxzuwk.supabase.co","xljhxmyigtxhjtxxzuwk.storage.supabase.co"].includes(u.hostname) || u.port || u.username || u.password || !u.pathname.startsWith("/storage/v1/")) throw new MediaError("STORAGE_UNAVAILABLE", "Private media storage is unavailable.",503);
  return u;
}
export async function signObject(client: SupabaseClient, bucket: string, path: string, download?: string) {
  const {data,error} = await client.storage.from(bucket).createSignedUrl(path, 60, download ? {download} : undefined);
  if (error || !data) throw new MediaError("STORAGE_UNAVAILABLE", "This media file is unavailable.",404);
  approvedStorageUrl(data.signedUrl); return data.signedUrl;
}
export async function readHeader(client: SupabaseClient, path: string) {
  const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),15000);
  try {
    const response = await fetch(await signObject(client,MEDIA_BUCKET,path),{headers:{Range:"bytes=0-65535"},signal:controller.signal,redirect:"error",cache:"no-store"});
    if (!response.ok || !response.body) throw new MediaError("STORAGE_UNAVAILABLE","The uploaded file could not be verified.",503,true);
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size=0;
    try { while(size < 65536) { const {done,value}=await reader.read(); if(done) break; const part=value.subarray(0,65536-size); chunks.push(part); size+=part.length; } } finally { await reader.cancel().catch(()=>undefined); }
    return Buffer.concat(chunks);
  } finally {clearTimeout(timer);controller.abort();}
}
export async function downloadBounded(client: SupabaseClient, path: string, destination: string, expectedSize: number) {
  const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),45000);
  const file = await open(destination,"wx",0o600); let size=0; const hash=createHash("sha256");
  try {
    const response = await fetch(await signObject(client,MEDIA_BUCKET,path),{signal:controller.signal,redirect:"error",cache:"no-store"});
    if (!response.ok || !response.body) throw new MediaError("STORAGE_UNAVAILABLE","The original could not be read. Please retry.",503,true);
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      size+=chunk.byteLength; if(size>MAX_MEDIA_BYTES || size>expectedSize) throw new MediaError("INVALID_SIZE","Stored media exceeds its verified upload size.");
      hash.update(chunk); await file.writeFile(chunk);
    }
    if(size !== expectedSize) throw new MediaError("SOURCE_CHANGED","The stored original no longer matches its registered size.");
    return hash.digest("hex");
  } finally {await file.close();clearTimeout(timer);controller.abort();}
}
