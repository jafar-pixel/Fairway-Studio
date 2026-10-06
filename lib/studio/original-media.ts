import { createHash } from "node:crypto";
import manifest from "./original-assets.json";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNER_WORKSPACE = "754ccd24-80be-4298-9f64-737d031ed9fd";
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Vary: "Cookie, Authorization",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};
type Row = Record<string, any>;
export function originalAssetFor(version: Row | null) {
  if (!version || version.workspace_id !== OWNER_WORKSPACE) return null;
  const p = version.provenance;
  if (
    !p ||
    p.import_batch !== "fairway-mockups-v1" ||
    p.mockup_import !== true ||
    p.media_origin !== "bundled_original"
  )
    return null;
  const asset = manifest.assets.find(
    (a) => `/original-assets/${a.file}` === p.import_asset_path,
  );
  if (
    !asset ||
    !/^[a-z0-9-]+\.png$/.test(asset.file) ||
    p.asset_sha256 !== asset.sha256
  )
    return null;
  return asset;
}
export const originalPrivateHeaders = PRIVATE_HEADERS;
function failure(status: number) {
  return new Response(
    JSON.stringify({
      error:
        status === 401
          ? "Sign in to view original artwork."
          : "This original artwork is not available.",
    }),
    {
      status,
      headers: { ...PRIVATE_HEADERS, "Content-Type": "application/json" },
    },
  );
}
/** Returns only an exact saved version's artwork after verified identity and membership. */
export async function serveOriginalAsset(
  url: URL,
  deps: {
    client: {
      auth: { getUser: () => Promise<any> };
      from: (table: string) => any;
    };
    read: (filename: string) => Promise<Uint8Array>;
  },
) {
  const id = url.searchParams.get("versionId");
  // There is no raw path, filename, workspace, or arbitrary-URL query escape hatch.
  if (
    !id ||
    !UUID.test(id) ||
    [...url.searchParams.keys()].some((k) => k !== "versionId")
  )
    return failure(404);
  try {
    const {
      data: { user },
      error: authError,
    } = await deps.client.auth.getUser();
    if (authError || !user) return failure(401);
    const { data: version, error } = await deps.client
      .from("studio_versions")
      .select("id,workspace_id,provenance")
      .eq("id", id)
      .maybeSingle();
    const asset = error ? null : originalAssetFor(version);
    if (!asset) return failure(404);
    const { data: member, error: memberError } = await deps.client
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", version.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (memberError || !member) return failure(404);
    const bytes = await deps.read(asset.file);
    if (
      bytes.byteLength !== asset.size_bytes ||
      bytes.byteLength > 10 * 1024 * 1024 ||
      createHash("sha256").update(bytes).digest("hex") !== asset.sha256
    )
      return failure(404);
    return new Response(bytes, {
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": "image/png",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename="${asset.file}"`,
      },
    });
  } catch {
    return failure(503);
  }
}
