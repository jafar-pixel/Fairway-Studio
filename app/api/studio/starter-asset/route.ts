import { readFile } from "node:fs/promises";
import path from "node:path";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  serveOriginalAsset,
  originalPrivateHeaders,
} from "@/lib/studio/original-media";

export async function GET(request: NextRequest) {
  try {
    return await serveOriginalAsset(request.nextUrl, {
      client: await createClient(),
      read: async (filename) =>
        new Uint8Array(
          await readFile(
            path.join(process.cwd(), "assets", "originals", filename),
          ),
        ),
    });
  } catch {
    return Response.json(
      { error: "Original artwork is temporarily unavailable." },
      { status: 503, headers: originalPrivateHeaders },
    );
  }
}
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
